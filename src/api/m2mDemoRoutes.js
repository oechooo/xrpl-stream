/**
 * m2mDemoRoutes.js
 * API endpoints for the Machine-to-Machine streaming payment demo
 * 
 * Provides Server-Sent Events (SSE) for real-time progress updates
 * Including contract details, cryptographic verification, and work metrics
 */

const express = require('express');
const router = express.Router();
const xrpl = require('xrpl');
const crypto = require('crypto');
const { createChannel } = require('../../contracts/createChannel');
const { signClaim, StreamingSigner } = require('../core/signer');
const { validateAndStoreClaim, StreamingValidator } = require('../core/validator');
const { getChannelStore } = require('../core/channelStore');
const { getChannelInfo } = require('../../contracts/createChannel');
const { claimChannel } = require('../../contracts/claimChannel');

// Store active demo sessions
const activeDemos = new Map();

// Default configuration for the demo
const DEFAULT_CONFIG = {
  channelAmount: '10000000', // 10 XRP
  dropsPerWorkUnit: 50000,   // 0.05 XRP per work unit
  totalWorkUnits: 5,
  workDurationMs: 3000,      // 3 seconds per work unit
  paymentFrequency: 1,       // Payment every 1 second (contract frequency)
  serviceName: 'M2M Computational Work Service',
  serviceType: 'compute',
  category: 'infrastructure',
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
 * Generate SHA256 hash for work verification
 */
function generateWorkProof(address, unitId, completedAt, metrics) {
  const data = JSON.stringify({
    address,
    unitId,
    completedAt,
    metrics,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
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
      config: DEFAULT_CONFIG,
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
      ...DEFAULT_CONFIG,
      channelAmountXRP: formatDrops(DEFAULT_CONFIG.channelAmount),
      paymentPerUnitXRP: formatDrops(DEFAULT_CONFIG.dropsPerWorkUnit),
    }
  });
});

/**
 * GET /m2m/start
 * Start the M2M demo with SSE for real-time updates
 * Supports custom configuration via query parameters
 */
router.get('/start', async (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sessionId = `demo-${Date.now()}`;
  
  // Parse custom configuration from query params
  const CONFIG = {
    channelAmount: req.query.channelAmount || DEFAULT_CONFIG.channelAmount,
    dropsPerWorkUnit: parseInt(req.query.dropsPerWorkUnit) || DEFAULT_CONFIG.dropsPerWorkUnit,
    totalWorkUnits: parseInt(req.query.totalWorkUnits) || DEFAULT_CONFIG.totalWorkUnits,
    workDurationMs: parseInt(req.query.workDurationMs) || DEFAULT_CONFIG.workDurationMs,
    paymentFrequency: parseInt(req.query.paymentFrequency) || DEFAULT_CONFIG.paymentFrequency,
    serviceName: req.query.serviceName || DEFAULT_CONFIG.serviceName,
    serviceType: req.query.serviceType || DEFAULT_CONFIG.serviceType,
    category: req.query.category || DEFAULT_CONFIG.category,
  };
  
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
    contract: null,
    workProgress: 0,
    currentWorkUnit: 0,
    totalWorkUnits: CONFIG.totalWorkUnits,
    totalPaid: '0',
    totalPaidXRP: '0',
    claimsGenerated: 0,
    verificationsSuccessful: 0,
    verificationsFailed: 0,
    transactions: [],
    workMetrics: [],
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
        channelAmountXRP: formatDrops(CONFIG.channelAmount),
        paymentPerUnitXRP: formatDrops(CONFIG.dropsPerWorkUnit),
        totalWorkUnits: CONFIG.totalWorkUnits,
        paymentFrequency: CONFIG.paymentFrequency,
        workDurationMs: CONFIG.workDurationMs,
      },
    });
    
    await sleep(500);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 0: CREATE SERVICE CONTRACT
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'contract';
    sendSSE(res, 'phase', { phase: 'contract', message: 'Creating service contract...' });
    
    // Generate contract ID
    const contractId = `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ratePerSecond = Math.floor(CONFIG.dropsPerWorkUnit / CONFIG.paymentFrequency);
    
    demoState.contract = {
      id: contractId,
      name: CONFIG.serviceName,
      description: 'Real-time computational work with SHA256 proof verification',
      serviceType: CONFIG.serviceType,
      category: CONFIG.category,
      provider: supplierWallet.address,
      pricing: {
        frequency: CONFIG.paymentFrequency,
        costPerInterval: CONFIG.dropsPerWorkUnit.toString(),
        rate: ratePerSecond.toString(),
        unit: 'per work unit',
        minChannelAmount: CONFIG.channelAmount,
      },
      createdAt: Date.now(),
    };
    
    sendSSE(res, 'contract_created', {
      contract: {
        id: demoState.contract.id,
        name: demoState.contract.name,
        description: demoState.contract.description,
        serviceType: demoState.contract.serviceType,
        category: demoState.contract.category,
        provider: demoState.contract.provider,
        pricing: {
          frequency: demoState.contract.pricing.frequency,
          costPerInterval: demoState.contract.pricing.costPerInterval,
          costPerIntervalXRP: formatDrops(demoState.contract.pricing.costPerInterval),
          rate: demoState.contract.pricing.rate,
          rateXRP: formatDrops(demoState.contract.pricing.rate),
          unit: demoState.contract.pricing.unit,
          minChannelAmountXRP: formatDrops(demoState.contract.pricing.minChannelAmount),
        },
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
      CONFIG.channelAmount,
      3600
    );
    
    demoState.channelId = channelResult.channelId;
    
    sendSSE(res, 'channel_created', {
      channelId: channelResult.channelId,
      transactionHash: channelResult.transactionHash,
      amountLocked: formatDrops(CONFIG.channelAmount),
    });
    
    // Send subscription info
    sendSSE(res, 'subscription', {
      action: 'created',
      channelId: channelResult.channelId,
      subscriber: consumerWallet.address,
      provider: supplierWallet.address,
      contractId: demoState.contract.id,
      startedAt: Date.now(),
    });
    
    // Add to transactions
    demoState.transactions.push({
      type: 'channel_create',
      timestamp: Date.now(),
      from: consumerWallet.address,
      to: supplierWallet.address,
      amount: CONFIG.channelAmount,
      amountXRP: formatDrops(CONFIG.channelAmount),
      txHash: channelResult.transactionHash,
      description: 'Payment channel created',
      verified: true,
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
      CONFIG.dropsPerWorkUnit
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
      ratePerSecond: formatDrops(CONFIG.dropsPerWorkUnit),
      frequencySeconds: CONFIG.paymentFrequency,
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
    
    for (let unitId = 1; unitId <= CONFIG.totalWorkUnits; unitId++) {
      if (demoState.status === 'cancelled') break;
      
      demoState.currentWorkUnit = unitId;
      supplierWorkProgress = 0;
      
      sendSSE(res, 'work_unit_start', {
        unitId,
        totalUnits: CONFIG.totalWorkUnits,
        message: `Starting work unit ${unitId}...`,
      });
      
      // Simulate work with progress updates
      const progressSteps = 10;
      const stepDuration = CONFIG.workDurationMs / progressSteps;
      let paymentsThisUnit = 0;
      let workMetrics = null;
      let workProof = null;
      let workCompletedAt = null;
      
      for (let step = 1; step <= progressSteps; step++) {
        if (demoState.status === 'cancelled') break;
        
        await sleep(stepDuration);
        
        supplierWorkProgress = step * 10;
        const overallProgress = ((unitId - 1) * 100 + supplierWorkProgress) / CONFIG.totalWorkUnits;
        demoState.workProgress = overallProgress;
        
        sendSSE(res, 'work_progress', {
          unitId,
          unitProgress: supplierWorkProgress,
          overallProgress: Math.round(overallProgress),
          message: `Work unit ${unitId}: ${supplierWorkProgress}% complete`,
        });
        
        // Generate and validate payment at key points (steps 3, 6, 9)
        if (step % 3 === 0 && step < progressSteps && paymentsThisUnit < 3) {
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
              message: `Payment claim: ${formatDrops(claim.amount)} XRP accumulated`,
            });
            
            // Add to transactions
            const txData = {
              type: 'claim',
              timestamp: Date.now(),
              from: consumerWallet.address,
              to: supplierWallet.address,
              amount: claim.amount,
              amountXRP: formatDrops(claim.amount),
              claimNumber: demoState.claimsGenerated,
              description: `Claim #${demoState.claimsGenerated} - Streaming payment`,
              verified: true,
              proof: null,
              fullProof: null,
            };
            
            demoState.transactions.push(txData);
            sendSSE(res, 'transaction', txData);
          }
        }
        
        // Generate work metrics and proof when work is done (at 100%)
        if (step === progressSteps) {
          workCompletedAt = Date.now();
          workMetrics = {
            cpuCycles: Math.floor(Math.random() * 1000000) + 500000,
            memoryUsed: Math.floor(Math.random() * 512) + 256,
            dataProcessed: Math.floor(Math.random() * 1000) + 100,
          };
          
          // Generate SHA256 proof
          workProof = generateWorkProof(supplierWallet.address, unitId, workCompletedAt, workMetrics);
          
          // Send work data to consumer
          sendSSE(res, 'work_data_sent', {
            direction: 'supplier_to_consumer',
            unitId,
            completedAt: workCompletedAt,
            metrics: workMetrics,
            proof: workProof,
            proofTruncated: workProof.substring(0, 16) + '...',
          });
          
          // Verify the work proof (consumer recomputes hash)
          const computedProof = generateWorkProof(supplierWallet.address, unitId, workCompletedAt, workMetrics);
          const verified = computedProof === workProof;
          
          if (verified) {
            demoState.verificationsSuccessful++;
          } else {
            demoState.verificationsFailed++;
          }
          
          // Send verification event
          sendSSE(res, 'verification', {
            unitId,
            verified,
            supplierProof: workProof.substring(0, 16) + '...',
            computedProof: computedProof.substring(0, 16) + '...',
            fullSupplierProof: workProof,
            fullComputedProof: computedProof,
            algorithm: 'SHA-256',
            message: verified ? `Work unit #${unitId} verified ✓` : `Work unit #${unitId} verification FAILED`,
          });
          
          // Final payment for this work unit after verification
          const finalClaim = signer.signCurrentClaim();
          const finalValidation = await validator.validateStreamingClaim(finalClaim.amount, finalClaim.signature);
          
          if (finalValidation.valid) {
            demoState.totalPaid = finalClaim.amount;
            demoState.totalPaidXRP = formatDrops(finalClaim.amount);
            demoState.claimsGenerated++;
            
            // Store claim
            const store = getChannelStore();
            await store.addClaimToHistory(channelResult.channelId, {
              amount: finalClaim.amount,
              signature: finalClaim.signature,
              publicKey: finalClaim.publicKey,
            });
            
            sendSSE(res, 'payment', {
              claimNumber: demoState.claimsGenerated,
              amount: finalClaim.amount,
              amountXRP: formatDrops(finalClaim.amount),
              verified: verified,
              unitId,
              message: `Payment verified: ${formatDrops(finalClaim.amount)} XRP (work verified)`,
              verification: {
                verified,
                supplierProof: workProof.substring(0, 16) + '...',
                computedProof: computedProof.substring(0, 16) + '...',
              },
            });
            
            // Add verified transaction
            const txData = {
              type: 'claim',
              timestamp: Date.now(),
              from: consumerWallet.address,
              to: supplierWallet.address,
              amount: finalClaim.amount,
              amountXRP: formatDrops(finalClaim.amount),
              claimNumber: demoState.claimsGenerated,
              description: `Claim #${demoState.claimsGenerated} - Work verified ✓`,
              verified: verified,
              proof: workProof.substring(0, 16) + '...',
              fullProof: workProof,
            };
            
            demoState.transactions.push(txData);
            sendSSE(res, 'transaction', txData);
          }
        }
      }
      
      supplierWorkCompleted++;
      
      // Store work metrics for summary
      if (workMetrics) {
        demoState.workMetrics.push({
          unitId,
          metrics: workMetrics,
          proof: workProof,
          completedAt: workCompletedAt,
        });
      }
      
      sendSSE(res, 'work_unit_complete', {
        unitId,
        proof: workProof ? workProof.substring(0, 20) + '...' : null,
        fullProof: workProof,
        totalCompleted: supplierWorkCompleted,
        metrics: workMetrics,
        message: `Work unit ${unitId} completed!`,
      });
    }
    
    // Get final amount BEFORE stopping (stop() sets isActive=false which resets the calculation)
    const finalAmount = signer.getCurrentAmount();
    demoState.totalPaid = finalAmount;
    demoState.totalPaidXRP = formatDrops(finalAmount);
    
    // Now stop the signer
    signer.stop();
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: FINALIZATION
    // ═══════════════════════════════════════════════════════════════════════
    
    demoState.phase = 'finalizing';
    sendSSE(res, 'phase', { phase: 'finalizing', message: 'Finalizing payment on-chain...' });
    
    // Send subscription completion
    sendSSE(res, 'subscription', {
      action: 'completed',
      channelId: channelResult.channelId,
      subscriber: consumerWallet.address,
      totalClaimed: formatDrops(finalAmount),
      duration: Math.round((Date.now() - demoState.startTime) / 1000),
    });
    
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
          verified: true,
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
    
    // Calculate total metrics
    const totalMetrics = demoState.workMetrics.reduce((acc, work) => {
      if (work.metrics) {
        acc.cpuCycles += work.metrics.cpuCycles || 0;
        acc.memoryUsed += work.metrics.memoryUsed || 0;
        acc.dataProcessed += work.metrics.dataProcessed || 0;
      }
      return acc;
    }, { cpuCycles: 0, memoryUsed: 0, dataProcessed: 0 });
    
    // Calculate verification rate
    const totalVerifications = demoState.verificationsSuccessful + demoState.verificationsFailed;
    const verificationRate = totalVerifications > 0 
      ? `${demoState.verificationsSuccessful}/${totalVerifications}` 
      : `${demoState.verificationsSuccessful}/${CONFIG.totalWorkUnits}`;
    
    // Calculate average verification time
    const avgVerifyTime = CONFIG.totalWorkUnits > 0 
      ? Math.round(duration / CONFIG.totalWorkUnits) 
      : 0;
    
    sendSSE(res, 'complete', {
      success: true,
      summary: {
        duration: Math.round(duration / 1000),
        workUnitsCompleted: CONFIG.totalWorkUnits,
        claimsGenerated: demoState.claimsGenerated || 0,
        totalPaid: demoState.totalPaid || '0',
        totalPaidXRP: demoState.totalPaidXRP || '0.000000',
        channelId: channelResult.channelId,
        transactions: demoState.transactions.length,
        verificationsSuccessful: demoState.verificationsSuccessful || 0,
        verificationsFailed: demoState.verificationsFailed || 0,
        verificationRate: verificationRate,
        contract: demoState.contract ? {
          id: demoState.contract.id || 'unknown',
          name: demoState.contract.name || 'Service Contract',
        } : { id: 'unknown', name: 'Service Contract' },
        totalMetrics,
        averageVerificationTime: avgVerifyTime,
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
