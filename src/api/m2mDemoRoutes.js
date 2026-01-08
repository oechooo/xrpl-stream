/**
 * m2mDemoRoutes.js
 * API endpoints for the Machine-to-Machine streaming payment demo
 * 
 * Provides Server-Sent Events (SSE) for real-time progress updates
 */

const express = require('express');
const router = express.Router();
const xrpl = require('xrpl');
const { createChannel } = require('../../contracts/createChannel');
const { signClaim, StreamingSigner } = require('../core/signer');
const { validateAndStoreClaim, StreamingValidator } = require('../core/validator');
const { getChannelStore } = require('../core/channelStore');
const { getChannelInfo } = require('../../contracts/createChannel');
const { claimChannel } = require('../../contracts/claimChannel');

// Store active demo sessions
const activeDemos = new Map();

// Configuration for the demo
const DEMO_CONFIG = {
  channelAmount: '10000000', // 10 XRP
  dropsPerWorkUnit: 50000,   // 0.05 XRP per work unit
  totalWorkUnits: 5,
  workDurationMs: 3000,      // 3 seconds per work unit
  paymentIntervalMs: 500,    // Check every 500ms
};

/**
 * Helper to send SSE event
 */
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Format drops to XRP string
 */
function formatDrops(drops) {
  const xrp = parseInt(drops) / 1_000_000;
  return xrp.toFixed(6);
}

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GET /m2m/status
 * Get current demo status
 */
router.get('/status', (req, res) => {
  const { sessionId } = req.query;
  
  if (sessionId && activeDemos.has(sessionId)) {
    const demo = activeDemos.get(sessionId);
    res.json({
      success: true,
      session: {
        id: sessionId,
        status: demo.status,
        phase: demo.phase,
        workProgress: demo.workProgress,
        totalPaid: demo.totalPaid,
      }
    });
  } else {
    res.json({
      success: true,
      activeDemos: activeDemos.size,
      config: DEMO_CONFIG,
    });
  }
});

/**
 * GET /m2m/config
 * Get demo configuration
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      ...DEMO_CONFIG,
      channelAmountXRP: formatDrops(DEMO_CONFIG.channelAmount),
      paymentPerUnitXRP: formatDrops(DEMO_CONFIG.dropsPerWorkUnit),
    }
  });
});

/**
 * POST /m2m/start
 * Start the M2M demo with SSE for real-time updates
 */
router.get('/start', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sessionId = `demo-${Date.now()}`;
  
  // Get wallet seeds from environment
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!senderSeed || !receiverSeed) {
    sendSSE(res, 'error', {
      message: 'Missing wallet seeds in .env (SENDER_WALLET_SEED, RECEIVER_WALLET_SEED)',
    });
    res.end();
    return;
  }

  // Initialize demo state
  const demoState = {
    sessionId,
    status: 'running',
    phase: 'init',
    consumer: null,
    supplier: null,
    channelId: null,
    workProgress: 0,
    currentWorkUnit: 0,
    totalWorkUnits: DEMO_CONFIG.totalWorkUnits,
    totalPaid: '0',
    totalPaidXRP: '0',
    claimsGenerated: 0,
    transactions: [],
    startTime: Date.now(),
  };
  
  activeDemos.set(sessionId, demoState);

  // Handle client disconnect
  req.on('close', () => {
    demoState.status = 'cancelled';
    activeDemos.delete(sessionId);
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    
    sendSSE(res, 'phase', { phase: 'init', message: 'Initializing machines...' });
    
    const consumerWallet = xrpl.Wallet.fromSeed(senderSeed);
    const supplierWallet = xrpl.Wallet.fromSeed(receiverSeed);
    
    demoState.consumer = {
      address: consumerWallet.address,
      publicKey: consumerWallet.publicKey,
    };
    demoState.supplier = {
      address: supplierWallet.address,
    };
    
    sendSSE(res, 'init', {
      consumer: {
        address: consumerWallet.address,
        role: 'Consumer (Sender)',
      },
      supplier: {
        address: supplierWallet.address,
        role: 'Supplier (Receiver)',
      },
      config: {
        channelAmountXRP: formatDrops(DEMO_CONFIG.channelAmount),
        paymentPerUnitXRP: formatDrops(DEMO_CONFIG.dropsPerWorkUnit),
        totalWorkUnits: DEMO_CONFIG.totalWorkUnits,
      },
    });
    
    await sleep(500);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: CREATE PAYMENT CHANNEL
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'channel';
    sendSSE(res, 'phase', { phase: 'channel', message: 'Creating payment channel on XRPL...' });
    
    const channelResult = await createChannel(
      consumerWallet,
      supplierWallet.address,
      DEMO_CONFIG.channelAmount,
      3600
    );
    
    demoState.channelId = channelResult.channelId;
    
    sendSSE(res, 'channel_created', {
      channelId: channelResult.channelId,
      transactionHash: channelResult.transactionHash,
      amountLocked: formatDrops(DEMO_CONFIG.channelAmount),
    });
    
    // Add to transactions
    demoState.transactions.push({
      type: 'channel_create',
      timestamp: Date.now(),
      from: consumerWallet.address,
      to: supplierWallet.address,
      amount: DEMO_CONFIG.channelAmount,
      amountXRP: formatDrops(DEMO_CONFIG.channelAmount),
      txHash: channelResult.transactionHash,
      description: 'Payment channel created',
    });
    
    sendSSE(res, 'transaction', demoState.transactions[demoState.transactions.length - 1]);
    
    await sleep(500);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: START STREAMING SESSIONS
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'streaming';
    sendSSE(res, 'phase', { phase: 'streaming', message: 'Starting streaming sessions...' });
    
    // Create streaming signer for consumer
    const signer = new StreamingSigner(
      consumerWallet,
      channelResult.channelId,
      DEMO_CONFIG.dropsPerWorkUnit
    );
    signer.start();
    
    // Create validator for supplier
    const validator = new StreamingValidator(
      channelResult.channelId,
      consumerWallet.publicKey,
      { maxClaimsPerMinute: 120 }
    );
    
    sendSSE(res, 'streams_started', {
      sender: 'active',
      receiver: 'active',
      ratePerSecond: formatDrops(DEMO_CONFIG.dropsPerWorkUnit),
    });
    
    await sleep(300);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: WORK-FOR-PAYMENT LOOP
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'working';
    sendSSE(res, 'phase', { phase: 'working', message: 'Starting work-for-payment cycle...' });
    
    // Supplier work state
    let supplierWorkProgress = 0;
    let supplierWorkCompleted = 0;
    
    for (let unitId = 1; unitId <= DEMO_CONFIG.totalWorkUnits; unitId++) {
      if (demoState.status === 'cancelled') break;
      
      demoState.currentWorkUnit = unitId;
      supplierWorkProgress = 0;
      
      sendSSE(res, 'work_unit_start', {
        unitId,
        totalUnits: DEMO_CONFIG.totalWorkUnits,
        message: `Starting work unit ${unitId}...`,
      });
      
      // Simulate work with progress updates
      const progressSteps = 10;
      const stepDuration = DEMO_CONFIG.workDurationMs / progressSteps;
      let paymentsThisUnit = 0;
      
      for (let step = 1; step <= progressSteps; step++) {
        if (demoState.status === 'cancelled') break;
        
        await sleep(stepDuration);
        
        supplierWorkProgress = step * 10;
        const overallProgress = ((unitId - 1) * 100 + supplierWorkProgress) / DEMO_CONFIG.totalWorkUnits;
        demoState.workProgress = overallProgress;
        
        sendSSE(res, 'work_progress', {
          unitId,
          unitProgress: supplierWorkProgress,
          overallProgress: Math.round(overallProgress),
          message: `Work unit ${unitId}: ${supplierWorkProgress}% complete`,
        });
        
        // Generate and validate payment mid-work
        if (step % 3 === 0 && paymentsThisUnit < 3) {
          const claim = signer.signCurrentClaim();
          const validation = await validator.validateStreamingClaim(claim.amount, claim.signature);
          
          if (validation.valid) {
            demoState.totalPaid = claim.amount;
            demoState.totalPaidXRP = formatDrops(claim.amount);
            demoState.claimsGenerated++;
            paymentsThisUnit++;
            
            // Store claim
            const store = getChannelStore();
            await store.addClaimToHistory(channelResult.channelId, {
              amount: claim.amount,
              signature: claim.signature,
              publicKey: claim.publicKey,
            });
            
            sendSSE(res, 'payment', {
              claimNumber: demoState.claimsGenerated,
              amount: claim.amount,
              amountXRP: formatDrops(claim.amount),
              verified: true,
              unitId,
              message: `Payment verified: ${formatDrops(claim.amount)} XRP accumulated`,
            });
            
            // Add to transactions
            demoState.transactions.push({
              type: 'claim',
              timestamp: Date.now(),
              from: consumerWallet.address,
              to: supplierWallet.address,
              amount: claim.amount,
              amountXRP: formatDrops(claim.amount),
              claimNumber: demoState.claimsGenerated,
              description: `Claim #${demoState.claimsGenerated} - Work verified`,
            });
            
            sendSSE(res, 'transaction', demoState.transactions[demoState.transactions.length - 1]);
          }
        }
      }
      
      supplierWorkCompleted++;
      
      // Generate work proof
      const proof = Buffer.from(`${supplierWallet.address}-${unitId}-${Date.now()}`).toString('base64');
      
      sendSSE(res, 'work_unit_complete', {
        unitId,
        proof: proof.substring(0, 20) + '...',
        totalCompleted: supplierWorkCompleted,
        message: `Work unit ${unitId} completed!`,
      });
    }
    
    // Stop signer
    signer.stop();
    const finalAmount = signer.getCurrentAmount();
    demoState.totalPaid = finalAmount;
    demoState.totalPaidXRP = formatDrops(finalAmount);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: FINALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'finalizing';
    sendSSE(res, 'phase', { phase: 'finalizing', message: 'Finalizing payment on-chain...' });
    
    await sleep(500);
    
    try {
      // Get the latest claim from store
      const store = getChannelStore();
      const channelData = await store.getChannelData(channelResult.channelId);
      
      if (channelData && channelData.lastValidAmount) {
        const result = await claimChannel(
          supplierWallet,
          channelResult.channelId,
          channelData.lastValidAmount,
          channelData.lastSignature,
          channelData.publicKey
        );
        
        demoState.transactions.push({
          type: 'finalize',
          timestamp: Date.now(),
          from: consumerWallet.address,
          to: supplierWallet.address,
          amount: channelData.lastValidAmount,
          amountXRP: formatDrops(channelData.lastValidAmount),
          txHash: result.transactionHash,
          description: 'On-chain claim finalized',
        });
        
        sendSSE(res, 'transaction', demoState.transactions[demoState.transactions.length - 1]);
        
        sendSSE(res, 'finalized', {
          success: true,
          claimedAmount: channelData.lastValidAmount,
          claimedAmountXRP: formatDrops(channelData.lastValidAmount),
          transactionHash: result.transactionHash,
          explorerUrl: `https://testnet.xrpl.org/transactions/${result.transactionHash}`,
        });
      } else {
        sendSSE(res, 'finalized', {
          success: false,
          message: 'No claims to finalize',
        });
      }
    } catch (finalizeError) {
      sendSSE(res, 'finalized', {
        success: false,
        message: finalizeError.message,
        offchainSuccess: true,
        totalAccumulated: formatDrops(finalAmount),
      });
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETE
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'complete';
    demoState.status = 'completed';
    
    const duration = Date.now() - demoState.startTime;
    
    sendSSE(res, 'complete', {
      success: true,
      summary: {
        duration: Math.round(duration / 1000),
        workUnitsCompleted: DEMO_CONFIG.totalWorkUnits,
        claimsGenerated: demoState.claimsGenerated,
        totalPaid: demoState.totalPaid,
        totalPaidXRP: demoState.totalPaidXRP,
        channelId: channelResult.channelId,
        transactions: demoState.transactions.length,
      },
    });
    
  } catch (error) {
    console.error('M2M Demo Error:', error);
    sendSSE(res, 'error', {
      message: error.message,
      phase: demoState.phase,
    });
  } finally {
    activeDemos.delete(sessionId);
    res.end();
  }
});

module.exports = router;
