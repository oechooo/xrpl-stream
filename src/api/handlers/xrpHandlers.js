/**
 * xrpHandlers.js
 * Business logic handlers for XRP payment channel streaming
 * Extracted from streamRoutes.js for use in unified API
 */

const xrpl = require('xrpl');
const { StreamingSigner } = require('../../core/signer');
const { StreamingValidator } = require('../../core/validator');
const { getChannelStore } = require('../../core/channelStore');
const { getChannelInfo } = require('../../../contracts/createChannel');
const { claimChannel } = require('../../../contracts/claimChannel');
const { validateAndStoreClaim, shouldFinalizeClaim } = require('../../core/validator');

// Store active streaming sessions
const activeSessions = new Map();

/**
 * Start a new XRP streaming session
 */
async function startStream(req, res) {
  try {
    const { channelId, walletSeed, ratePerSecond, role, publicKey, senderSeed, receiverAddress } = req.body;
    
    // Handle unified API format (senderSeed + receiverAddress)
    let actualWalletSeed = walletSeed || senderSeed;
    let actualRole = role || 'sender';
    
    // Basic validation
    if (!channelId || !actualRole) {
      return res.status(400).json({
        error: 'Missing required fields: channelId, role',
      });
    }
    
    // Role-specific validation
    if (actualRole === 'sender' && !ratePerSecond) {
      return res.status(400).json({
        error: 'Missing required field for sender: ratePerSecond',
      });
    }
    
    if (actualRole === 'receiver' && !publicKey) {
      return res.status(400).json({
        error: 'Missing required field for receiver: publicKey',
      });
    }
    
    // Check if THIS ROLE already has an active session
    const sessionKey = `${channelId}-${actualRole}`;
    if (activeSessions.has(sessionKey)) {
      return res.status(409).json({
        error: `${actualRole.charAt(0).toUpperCase() + actualRole.slice(1)} stream already active for this channel`,
        channelId,
        role: actualRole,
      });
    }
    
    // Verify channel exists on ledger
    const channelInfo = await getChannelInfo(channelId);
    
    if (actualRole === 'sender') {
      if (!actualWalletSeed) {
        return res.status(400).json({ error: 'walletSeed or senderSeed required for sender' });
      }
      
      const wallet = xrpl.Wallet.fromSeed(actualWalletSeed);
      
      // Verify wallet is the channel sender
      if (channelInfo.Account !== wallet.address) {
        return res.status(403).json({
          error: 'Wallet is not the channel sender',
        });
      }
      
      // Create streaming signer
      const signer = new StreamingSigner(wallet, channelId, ratePerSecond);
      signer.start();
      
      activeSessions.set(sessionKey, {
        role: 'sender',
        channelId,
        signer,
        channelInfo,
        startTime: Date.now(),
      });
      
      console.log(`✓ Started sender stream for channel ${channelId}`);
      
      return res.json({
        success: true,
        message: 'Sender stream started',
        sessionId: sessionKey,
        channelId,
        ratePerSecond,
        channelBalance: channelInfo.Amount,
      });
      
    } else if (actualRole === 'receiver') {
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey required for receiver' });
      }
      
      // Create streaming validator
      const validator = new StreamingValidator(channelId, publicKey, {
        maxClaimsPerMinute: 60,
      });
      
      activeSessions.set(sessionKey, {
        role: 'receiver',
        channelId,
        validator,
        channelInfo,
        startTime: Date.now(),
      });
      
      // Initialize channel in store if not exists
      const store = getChannelStore();
      const exists = await store.hasChannel(channelId);
      if (!exists) {
        await store.initializeChannel(channelId, {
          receiverStartTime: Date.now(),
          senderPublicKey: publicKey,
        });
      }
      
      console.log(`✓ Started receiver stream for channel ${channelId}`);
      
      return res.json({
        success: true,
        message: 'Receiver stream started',
        sessionId: sessionKey,
        channelId,
        channelBalance: channelInfo.Amount,
      });
    } else {
      return res.status(400).json({ error: 'Invalid role. Must be "sender" or "receiver"' });
    }
    
  } catch (error) {
    console.error('Error starting XRP stream:', error);
    return res.status(500).json({
      error: 'Failed to start stream',
      details: error.message,
    });
  }
}

/**
 * Stop an active XRP streaming session
 */
async function stopStream(req, res) {
  try {
    const { channelId, sessionId, role } = req.body;
    
    // Handle both formats: sessionId or channelId+role
    let actualChannelId = channelId;
    let rolesToStop = [];
    
    if (sessionId) {
      // Parse sessionId format: "channelId-role"
      const parts = sessionId.split('-');
      if (parts.length >= 2) {
        actualChannelId = parts.slice(0, -1).join('-'); // Handle channelIds with hyphens
        rolesToStop = [parts[parts.length - 1]];
      }
    } else if (channelId) {
      rolesToStop = role ? [role] : ['sender', 'receiver'];
    } else {
      return res.status(400).json({ error: 'sessionId or channelId required' });
    }
    
    const results = [];
    
    for (const r of rolesToStop) {
      const sessionKey = `${actualChannelId}-${r}`;
      const session = activeSessions.get(sessionKey);
      
      if (session) {
        if (session.role === 'sender') {
          session.signer.stop();
          const finalAmount = session.signer.getCurrentAmount();
          
          activeSessions.delete(sessionKey);
          
          results.push({
            role: 'sender',
            finalAmount,
            finalXRP: parseInt(finalAmount) / 1000000,
            duration: Date.now() - session.startTime,
          });
          
          console.log(`✓ Stopped sender stream for channel ${actualChannelId}`);
          
        } else if (session.role === 'receiver') {
          const stats = session.validator.getStats();
          
          activeSessions.delete(sessionKey);
          
          results.push({
            role: 'receiver',
            stats,
            duration: Date.now() - session.startTime,
          });
          
          console.log(`✓ Stopped receiver stream for channel ${actualChannelId}`);
        }
      }
    }
    
    if (results.length === 0) {
      return res.status(404).json({
        error: 'No active streams found',
      });
    }
    
    return res.json({
      success: true,
      message: 'Stream(s) stopped',
      channelId: actualChannelId,
      stopped: results,
    });
    
  } catch (error) {
    console.error('Error stopping XRP stream:', error);
    return res.status(500).json({
      error: 'Failed to stop stream',
      details: error.message,
    });
  }
}

/**
 * Generate a signed claim from active sender session
 */
async function generateClaim(req, res) {
  try {
    const { channelId, sessionId } = req.body || req.query;
    
    // Handle both formats
    let actualChannelId = channelId;
    if (sessionId && !channelId) {
      const parts = sessionId.split('-');
      actualChannelId = parts.slice(0, -1).join('-');
    }
    
    if (!actualChannelId) {
      return res.status(400).json({ error: 'channelId or sessionId required' });
    }
    
    const sessionKey = `${actualChannelId}-sender`;
    const session = activeSessions.get(sessionKey);
    
    if (!session || session.role !== 'sender') {
      return res.status(404).json({
        error: 'No active sender stream found for this channel',
      });
    }
    
    // Generate current claim
    const claim = session.signer.signCurrentClaim();
    
    return res.json({
      success: true,
      claim: {
        channelId: claim.channelId,
        amount: claim.amount,
        amountXRP: parseInt(claim.amount) / 1000000,
        signature: claim.signature,
        publicKey: claim.publicKey,
        timestamp: claim.timestamp,
      },
    });
    
  } catch (error) {
    console.error('Error generating XRP claim:', error);
    return res.status(500).json({
      error: 'Failed to generate claim',
      details: error.message,
    });
  }
}

/**
 * Finalize claim on-chain (submit to XRPL)
 */
async function finalizeClaim(req, res) {
  try {
    const { channelId, receiverWalletSeed, sessionId } = req.body;
    
    // Handle both formats
    let actualChannelId = channelId;
    if (sessionId && !channelId) {
      const parts = sessionId.split('-');
      actualChannelId = parts.slice(0, -1).join('-');
    }
    
    if (!actualChannelId || !receiverWalletSeed) {
      return res.status(400).json({
        error: 'Missing required fields: channelId (or sessionId), receiverWalletSeed',
      });
    }
    
    const store = getChannelStore();
    const channelData = await store.getChannelData(actualChannelId);
    
    if (!channelData || !channelData.lastValidAmount) {
      return res.status(404).json({
        error: 'No valid claims found for this channel',
      });
    }
    
    const receiverWallet = xrpl.Wallet.fromSeed(receiverWalletSeed);
    
    // Submit the claim on-chain
    const result = await claimChannel(
      receiverWallet,
      actualChannelId,
      channelData.lastValidAmount,
      channelData.lastSignature,
      channelData.publicKey
    );
    
    // Update finalized amount in store
    await store.updateFinalizedAmount(actualChannelId, channelData.lastValidAmount);
    
    return res.json({
      success: true,
      message: 'Claim finalized on-chain',
      result,
    });
    
  } catch (error) {
    console.error('Error finalizing XRP claim:', error);
    return res.status(500).json({
      error: 'Failed to finalize claim',
      details: error.message,
    });
  }
}

/**
 * Get status of XRP streaming session
 */
async function getStatus(req, res) {
  try {
    const { channelId, sessionId } = req.query || req.params;
    
    // Handle both formats
    let actualChannelId = channelId;
    if (sessionId && !channelId) {
      const parts = sessionId.split('-');
      actualChannelId = parts.slice(0, -1).join('-');
    }
    
    if (!actualChannelId) {
      return res.status(400).json({ error: 'channelId or sessionId required' });
    }
    
    // Check for both sender and receiver sessions
    const senderKey = `${actualChannelId}-sender`;
    const receiverKey = `${actualChannelId}-receiver`;
    const senderSession = activeSessions.get(senderKey);
    const receiverSession = activeSessions.get(receiverKey);
    
    const store = getChannelStore();
    const stats = await store.getChannelStats(actualChannelId);
    const channelInfo = await getChannelInfo(actualChannelId);
    
    // Check if should finalize
    const finalizationCheck = await shouldFinalizeClaim(actualChannelId);
    
    return res.json({
      success: true,
      channelId: actualChannelId,
      activeSessions: {
        sender: senderSession ? {
          startTime: senderSession.startTime,
          duration: Date.now() - senderSession.startTime,
        } : null,
        receiver: receiverSession ? {
          startTime: receiverSession.startTime,
          duration: Date.now() - receiverSession.startTime,
        } : null,
      },
      ledgerInfo: channelInfo,
      localStats: stats,
      finalizationRecommendation: finalizationCheck,
    });
    
  } catch (error) {
    console.error('Error getting XRP stream status:', error);
    return res.status(500).json({
      error: 'Failed to get stream status',
      details: error.message,
    });
  }
}

/**
 * Execute payment (for unified API - just returns signed claim for XRP)
 */
async function executePayment(req, res) {
  // For XRP, "executing payment" means generating a signed claim
  return generateClaim(req, res);
}

module.exports = {
  startStream,
  stopStream,
  generateClaim,
  finalizeClaim,
  getStatus,
  executePayment,
};
