/**
 * streamRoutes.js
 * API endpoints for managing streaming payments
 * 
 * Defines the business logic for streaming payments, including starting/stopping
 * streams, generating claims, and handling receiver validation.
 */

const express = require('express');
const router = express.Router();
const { signClaim, signIncrementalClaim, StreamingSigner } = require('../core/signer');
const { validateAndStoreClaim, shouldFinalizeClaim, StreamingValidator } = require('../core/validator');
const { getChannelStore } = require('../core/channelStore');
const { getChannelInfo } = require('../../contracts/createChannel');
const { claimChannel } = require('../../contracts/claimChannel');
const xrpl = require('xrpl');

// Store active streaming sessions
const activeSessions = new Map();

/**
 * POST /stream/start
 * Start a new streaming payment session
 * 
 * Body: {
 *   channelId: string,
 *   walletSeed: string (sender only),
 *   ratePerSecond: number (drops),
 *   role: 'sender' | 'receiver'
 * }
 */
router.post('/start', async (req, res) => {
  try {
    const { channelId, walletSeed, ratePerSecond, role, publicKey } = req.body;
    
    if (!channelId || !ratePerSecond || !role) {
      return res.status(400).json({
        error: 'Missing required fields: channelId, ratePerSecond, role',
      });
    }
    
    // Check if session already exists
    if (activeSessions.has(channelId)) {
      return res.status(409).json({
        error: 'Stream already active for this channel',
        channelId,
      });
    }
    
    // Verify channel exists on ledger
    const channelInfo = await getChannelInfo(channelId);
    
    if (role === 'sender') {
      if (!walletSeed) {
        return res.status(400).json({ error: 'walletSeed required for sender' });
      }
      
      const wallet = xrpl.Wallet.fromSeed(walletSeed);
      
      // Verify wallet is the channel sender
      if (channelInfo.Account !== wallet.address) {
        return res.status(403).json({
          error: 'Wallet is not the channel sender',
        });
      }
      
      // Create streaming signer
      const signer = new StreamingSigner(wallet, channelId, ratePerSecond);
      signer.start();
      
      activeSessions.set(channelId, {
        role: 'sender',
        signer,
        channelInfo,
        startTime: Date.now(),
      });
      
      console.log(`✓ Started sender stream for channel ${channelId}`);
      
      res.json({
        success: true,
        message: 'Sender stream started',
        channelId,
        ratePerSecond,
        channelBalance: channelInfo.Amount,
      });
      
    } else if (role === 'receiver') {
      if (!publicKey) {
        return res.status(400).json({ error: 'publicKey required for receiver' });
      }
      
      // Create streaming validator
      const validator = new StreamingValidator(channelId, publicKey, {
        maxClaimsPerMinute: 60,
      });
      
      activeSessions.set(channelId, {
        role: 'receiver',
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
      
      res.json({
        success: true,
        message: 'Receiver stream started',
        channelId,
        channelBalance: channelInfo.Amount,
      });
    } else {
      res.status(400).json({ error: 'Invalid role. Must be "sender" or "receiver"' });
    }
    
  } catch (error) {
    console.error('Error starting stream:', error);
    res.status(500).json({
      error: 'Failed to start stream',
      details: error.message,
    });
  }
});

/**
 * POST /stream/stop
 * Stop an active streaming session
 * 
 * Body: { channelId: string }
 */
router.post('/stop', async (req, res) => {
  try {
    const { channelId } = req.body;
    
    if (!channelId) {
      return res.status(400).json({ error: 'channelId required' });
    }
    
    const session = activeSessions.get(channelId);
    
    if (!session) {
      return res.status(404).json({
        error: 'No active stream found for this channel',
      });
    }
    
    if (session.role === 'sender') {
      session.signer.stop();
      const finalAmount = session.signer.getCurrentAmount();
      
      activeSessions.delete(channelId);
      
      res.json({
        success: true,
        message: 'Sender stream stopped',
        channelId,
        finalAmount,
        finalXRP: parseInt(finalAmount) / 1000000,
        duration: Date.now() - session.startTime,
      });
      
    } else if (session.role === 'receiver') {
      const stats = session.validator.getStats();
      
      activeSessions.delete(channelId);
      
      res.json({
        success: true,
        message: 'Receiver stream stopped',
        channelId,
        stats,
        duration: Date.now() - session.startTime,
      });
    }
    
    console.log(`✓ Stopped stream for channel ${channelId}`);
    
  } catch (error) {
    console.error('Error stopping stream:', error);
    res.status(500).json({
      error: 'Failed to stop stream',
      details: error.message,
    });
  }
});

/**
 * GET /stream/claim
 * Generate a new signed claim (sender endpoint)
 * 
 * Query: channelId
 */
router.get('/claim', async (req, res) => {
  try {
    const { channelId } = req.query;
    
    if (!channelId) {
      return res.status(400).json({ error: 'channelId required' });
    }
    
    const session = activeSessions.get(channelId);
    
    if (!session || session.role !== 'sender') {
      return res.status(404).json({
        error: 'No active sender stream found for this channel',
      });
    }
    
    // Generate current claim
    const claim = session.signer.signCurrentClaim();
    
    res.json({
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
    console.error('Error generating claim:', error);
    res.status(500).json({
      error: 'Failed to generate claim',
      details: error.message,
    });
  }
});

/**
 * POST /stream/validate
 * Validate a claim (receiver endpoint)
 * 
 * Body: {
 *   channelId: string,
 *   amount: string,
 *   signature: string,
 *   publicKey: string
 * }
 */
router.post('/validate', async (req, res) => {
  try {
    const { channelId, amount, signature, publicKey } = req.body;
    
    if (!channelId || !amount || !signature || !publicKey) {
      return res.status(400).json({
        error: 'Missing required fields: channelId, amount, signature, publicKey',
      });
    }
    
    const session = activeSessions.get(channelId);
    
    // Can validate even without active session, but use validator if available
    let validationResult;
    
    if (session && session.role === 'receiver') {
      validationResult = await session.validator.validateStreamingClaim(amount, signature);
    } else {
      const channelInfo = await getChannelInfo(channelId);
      validationResult = await validateAndStoreClaim(
        channelId,
        amount,
        signature,
        publicKey,
        channelInfo
      );
    }
    
    if (validationResult.valid) {
      // Store the claim in history
      const store = getChannelStore();
      await store.addClaimToHistory(channelId, {
        amount,
        signature,
        publicKey,
      });
      
      res.json({
        success: true,
        message: 'Claim is valid',
        validation: validationResult,
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Claim is invalid',
        reason: validationResult.reason,
        validation: validationResult,
      });
    }
    
  } catch (error) {
    console.error('Error validating claim:', error);
    res.status(500).json({
      error: 'Failed to validate claim',
      details: error.message,
    });
  }
});

/**
 * POST /stream/finalize
 * Finalize (claim on-chain) the current stream amount
 * 
 * Body: {
 *   channelId: string,
 *   receiverWalletSeed: string
 * }
 */
router.post('/finalize', async (req, res) => {
  try {
    const { channelId, receiverWalletSeed } = req.body;
    
    if (!channelId || !receiverWalletSeed) {
      return res.status(400).json({
        error: 'Missing required fields: channelId, receiverWalletSeed',
      });
    }
    
    const store = getChannelStore();
    const channelData = await store.getChannelData(channelId);
    
    if (!channelData || !channelData.lastValidAmount) {
      return res.status(404).json({
        error: 'No valid claims found for this channel',
      });
    }
    
    const receiverWallet = xrpl.Wallet.fromSeed(receiverWalletSeed);
    
    // Submit the claim on-chain
    const result = await claimChannel(
      receiverWallet,
      channelId,
      channelData.lastValidAmount,
      channelData.lastSignature,
      channelData.publicKey
    );
    
    // Update finalized amount in store
    await store.updateFinalizedAmount(channelId, channelData.lastValidAmount);
    
    res.json({
      success: true,
      message: 'Claim finalized on-chain',
      result,
    });
    
  } catch (error) {
    console.error('Error finalizing claim:', error);
    res.status(500).json({
      error: 'Failed to finalize claim',
      details: error.message,
    });
  }
});

/**
 * GET /stream/status
 * Get status of a streaming channel
 * 
 * Query: channelId
 */
router.get('/status', async (req, res) => {
  try {
    const { channelId } = req.query;
    
    if (!channelId) {
      return res.status(400).json({ error: 'channelId required' });
    }
    
    const session = activeSessions.get(channelId);
    const store = getChannelStore();
    const stats = await store.getChannelStats(channelId);
    const channelInfo = await getChannelInfo(channelId);
    
    // Check if should finalize
    const finalizationCheck = await shouldFinalizeClaim(channelId);
    
    res.json({
      success: true,
      channelId,
      activeSession: session ? {
        role: session.role,
        startTime: session.startTime,
        duration: Date.now() - session.startTime,
      } : null,
      ledgerInfo: channelInfo,
      localStats: stats,
      finalizationRecommendation: finalizationCheck,
    });
    
  } catch (error) {
    console.error('Error getting stream status:', error);
    res.status(500).json({
      error: 'Failed to get stream status',
      details: error.message,
    });
  }
});

/**
 * GET /stream/history
 * Get claim history for a channel
 * 
 * Query: channelId, limit (optional)
 */
router.get('/history', async (req, res) => {
  try {
    const { channelId, limit } = req.query;
    
    if (!channelId) {
      return res.status(400).json({ error: 'channelId required' });
    }
    
    const store = getChannelStore();
    let history = await store.getClaimHistory(channelId);
    
    if (limit) {
      const limitNum = parseInt(limit);
      history = history.slice(-limitNum);
    }
    
    res.json({
      success: true,
      channelId,
      totalClaims: history.length,
      history: history.map(claim => ({
        amount: claim.amount,
        amountXRP: parseInt(claim.amount) / 1000000,
        timestamp: claim.timestamp,
        signature: claim.signature?.substring(0, 20) + '...', // Truncate for readability
      })),
    });
    
  } catch (error) {
    console.error('Error getting claim history:', error);
    res.status(500).json({
      error: 'Failed to get claim history',
      details: error.message,
    });
  }
});

module.exports = router;

