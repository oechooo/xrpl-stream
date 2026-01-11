/**
 * unifiedRoutes.js
 * Unified API for both XRP and RLUSD streaming with automatic execution
 *
 * Features:
 * - Automatic payment execution (no manual /execute needed)
 * - Contract-based service discovery
 * - Provider registration system (POST contracts)
 * - Public browsing (GET contracts)
 */

const express = require("express");
const router = express.Router();

// Import both XRP and RLUSD handlers
const xrpHandlers = require("./handlers/xrpHandlers");
const rlusdHandlers = require("./handlers/rlusdHandlers");

// Import contracts registry
const {
  createContract,
  updateContract,
  deleteContract,
  getContract,
  listContracts,
  getCategories,
  searchContracts,
  getStats,
} = require("../config/contractsRegistry");

// Store active stream auto-execution intervals
const activeStreams = new Map();

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /start
 * Start a stream with automatic payment execution using a contract
 * Required: contractId, senderSeed, receiverAddress
 */
router.post("/start", async (req, res) => {
  const { contractId, senderSeed, receiverAddress } = req.body;

  try {
    // Validate required fields
    if (!contractId) {
      return res.status(400).json({
        error: 'contractId is required',
        hint: 'Browse contracts at GET /api/unified/contracts',
      });
    }
    
    if (!senderSeed || !receiverAddress) {
      return res.status(400).json({
        error: 'Missing required fields: senderSeed, receiverAddress',
      });
    }
    
    // Fetch contract configuration
    let contract;
    try {
      contract = getContract(contractId);
    } catch (error) {
      return res.status(404).json({
        error: 'Contract not found',
        contractId,
        hint: 'Browse contracts at GET /api/unified/contracts',
      });
    }
    
    // Build stream config from contract
    const streamConfig = {
      ...contract,
      senderSeed,
      receiverAddress,
      contractId,
    };
    
    console.log(`📋 Starting stream with contract: ${contractId} (${contract.description})`)
    
    // Start the stream using appropriate handler
    let sessionId;
    const mockRes = {
      json: (data) => { sessionId = data.sessionId || data.sessionKey; },
      status: () => mockRes,
    };
    
    if (streamConfig.currency === "XRP") {
      await xrpHandlers.startStream({ body: streamConfig }, mockRes);
    } else if (streamConfig.currency === "RLUSD") {
      await rlusdHandlers.startStream({ body: streamConfig }, mockRes);
    } else {
      return res.status(400).json({
        error: "Invalid currency",
        supported: ["XRP", "RLUSD"],
      });
    }
    
    if (!sessionId) {
      throw new Error('Failed to get sessionId from stream start');
    }
    
    // ✅ START AUTOMATIC PAYMENT EXECUTION
    startAutoExecution(sessionId, streamConfig);
    
    return res.json({
      success: true,
      sessionId,
      status: 'streaming',
      message: 'Stream started - payments will execute automatically',
      contract: {
        contractId,
        description: contract.description,
        currency: contract.currency,
        category: contract.category,
      },
      schedule: {
        intervalSeconds: contract.intervalSeconds || 
                        (contract.ratePerSecond ? 'continuous' : null),
        duration: contract.duration || 'indefinite',
      },
    });
    
  } catch (error) {
    console.error('Stream start error:', error);
    return res.status(500).json({
      error: "Stream start failed",
      details: error.message,
    });
  }
});

/**
 * POST /execute (DEPRECATED)
 * Kept for manual overrides only
 */
router.post("/execute", async (req, res) => {
  console.warn('⚠️  /execute called manually - streams auto-execute after /start');
  
  const { sessionId, currency } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  try {
    if (currency === "XRP") {
      return await xrpHandlers.generateClaim(req, res);
    } else if (currency === "RLUSD") {
      return await rlusdHandlers.executePayment(req, res);
    } else {
      return res.status(400).json({ error: "Currency required" });
    }
  } catch (error) {
    res.status(500).json({
      error: "Stream execution failed",
      details: error.message,
    });
  }
});

/**
 * POST /finalize
 * Finalize stream (stops auto-execution)
 */
router.post("/finalize", async (req, res) => {
  const { sessionId, currency } = req.body;

  try {
    // Stop auto-execution before finalizing
    stopAutoExecution(sessionId);
    
    if (currency === "XRP") {
      return await xrpHandlers.finalizeClaim(req, res);
    } else if (currency === "RLUSD") {
      return await rlusdHandlers.getStatus(req, res);
    } else {
      return res.status(400).json({ error: "Currency required" });
    }
  } catch (error) {
    res.status(500).json({
      error: "Stream finalization failed",
      details: error.message,
    });
  }
});

/**
 * POST /stop
 * Stop stream and auto-execution
 */
router.post("/stop", async (req, res) => {
  const { sessionId, currency } = req.body;

  try {
    // Stop auto-execution first
    stopAutoExecution(sessionId);
    
    // Then stop the stream handlers
    if (currency === "XRP") {
      return await xrpHandlers.stopStream(req, res);
    } else if (currency === "RLUSD") {
      return await rlusdHandlers.stopStream(req, res);
    } else {
      return res.status(400).json({ error: "Currency required" });
    }
  } catch (error) {
    res.status(500).json({
      error: "Stream stop failed",
      details: error.message,
    });
  }
});

/**
 * GET /status/:sessionId
 * Get stream status with auto-execution stats
 */
router.get("/status/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { currency } = req.query;

  try {
    // Get auto-execution stats
    const streamInfo = activeStreams.get(sessionId);
    const autoExecutionStatus = streamInfo ? {
      isAutoExecuting: true,
      paymentCount: streamInfo.paymentCount,
      elapsedSeconds: Math.floor((Date.now() - streamInfo.startTime) / 1000),
      intervalSeconds: streamInfo.config.intervalSeconds,
      nextPaymentIn: streamInfo.nextPaymentTime ? 
        Math.max(0, Math.floor((streamInfo.nextPaymentTime - Date.now()) / 1000)) : null,
    } : {
      isAutoExecuting: false,
    };
    
    // Get handler status
    let handlerResponse = {};
    const mockRes = {
      json: (data) => { handlerResponse = data; },
      status: () => mockRes,
    };
    
    if (currency === "XRP") {
      await xrpHandlers.getStatus(req, mockRes);
    } else if (currency === "RLUSD") {
      await rlusdHandlers.getStatus(req, mockRes);
    } else {
      await autoDetectAndGetStatus(sessionId, req, mockRes);
    }
    
    // Merge auto-execution stats with handler status
    return res.json({
      ...handlerResponse,
      autoExecution: autoExecutionStatus,
    });
    
  } catch (error) {
    res.status(500).json({
      error: "Status check failed",
      details: error.message,
    });
  }
});

/**
 * GET /active
 * List all active auto-executing streams
 */
router.get("/active", (req, res) => {
  const activeList = Array.from(activeStreams.entries()).map(([sessionId, stream]) => ({
    sessionId,
    currency: stream.config.currency,
    paymentCount: stream.paymentCount,
    elapsedSeconds: Math.floor((Date.now() - stream.startTime) / 1000),
    intervalSeconds: stream.config.intervalSeconds,
    contractId: stream.config.contractId || null,
  }));
  
  res.json({
    activeStreams: activeList.length,
    streams: activeList,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /contracts
 * Create a new contract (Provider endpoint)
 */
router.post("/contracts", (req, res) => {
  try {
    const { providerId, ...contractData } = req.body;
    
    if (!providerId) {
      return res.status(400).json({
        error: 'providerId is required',
      });
    }
    
    const contract = createContract(contractData, providerId);
    
    res.status(201).json({
      success: true,
      message: 'Contract created successfully',
      contract,
    });
  } catch (error) {
    console.error('Contract creation error:', error);
    res.status(400).json({
      error: "Failed to create contract",
      details: error.message,
    });
  }
});

/**
 * PUT /contracts/:contractId
 * Update a contract (Provider endpoint)
 */
router.put("/contracts/:contractId", (req, res) => {
  try {
    const { contractId } = req.params;
    const { providerId, ...updates } = req.body;
    
    if (!providerId) {
      return res.status(400).json({
        error: 'providerId is required for authorization',
      });
    }
    
    const contract = updateContract(contractId, updates, providerId);
    
    res.json({
      success: true,
      message: 'Contract updated successfully',
      contract,
    });
  } catch (error) {
    console.error('Contract update error:', error);
    const status = error.message.includes('Unauthorized') ? 403 : 
                   error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      error: "Failed to update contract",
      details: error.message,
    });
  }
});

/**
 * DELETE /contracts/:contractId
 * Delete a contract (Provider endpoint)
 */
router.delete("/contracts/:contractId", (req, res) => {
  try {
    const { contractId } = req.params;
    const { providerId } = req.body;
    
    if (!providerId) {
      return res.status(400).json({
        error: 'providerId is required for authorization',
      });
    }
    
    deleteContract(contractId, providerId);
    
    res.json({
      success: true,
      message: 'Contract deleted successfully',
      contractId,
    });
  } catch (error) {
    console.error('Contract deletion error:', error);
    const status = error.message.includes('Unauthorized') ? 403 : 
                   error.message.includes('not found') ? 404 : 400;
    res.status(status).json({
      error: "Failed to delete contract",
      details: error.message,
    });
  }
});

/**
 * GET /contracts
 * List contracts (Public endpoint)
 */
router.get("/contracts", (req, res) => {
  try {
    const { category, currency, providerId, status, search } = req.query;
    
    let contracts;
    if (search) {
      contracts = searchContracts(search);
    } else {
      contracts = listContracts({ category, currency, providerId, status });
    }
    
    res.json({
      total: contracts.length,
      contracts,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to list contracts",
      details: error.message,
    });
  }
});

/**
 * GET /contracts/stats
 * Get registry statistics (Public endpoint)
 */
router.get("/contracts/stats", (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: "Failed to get statistics",
      details: error.message,
    });
  }
});

/**
 * GET /contracts/categories
 * Get contract categories (Public endpoint)
 */
router.get("/contracts/categories", (req, res) => {
  try {
    const categories = getCategories();
    
    res.json({
      total: categories.length,
      categories,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get categories",
      details: error.message,
    });
  }
});

/**
 * GET /contracts/:contractId
 * Get specific contract (Public endpoint)
 */
router.get("/contracts/:contractId", (req, res) => {
  try {
    const contract = getContract(req.params.contractId);
    res.json(contract);
  } catch (error) {
    res.status(404).json({
      error: "Contract not found",
      contractId: req.params.contractId,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-EXECUTION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

function startAutoExecution(sessionId, config) {
  const { currency, intervalSeconds = 10, duration, ratePerSecond } = config;
  const actualInterval = intervalSeconds || (ratePerSecond ? 5 : 10);
  
  console.log(`🚀 Auto-execution started for ${sessionId}`);
  
  let paymentCount = 0;
  const startTime = Date.now();
  
  const intervalId = setInterval(async () => {
    try {
      paymentCount++;
      const elapsed = (Date.now() - startTime) / 1000;
      
      console.log(`💸 Auto-payment #${paymentCount} for ${sessionId}`);
      
      const stream = activeStreams.get(sessionId);
      if (stream) {
        stream.paymentCount = paymentCount;
        stream.nextPaymentTime = Date.now() + (actualInterval * 1000);
      }
      
      const mockRes = {
        json: (data) => console.log('   ✅ Payment:', data.success ? 'Success' : 'Failed'),
        status: () => mockRes,
      };
      
      if (currency === "XRP") {
        await xrpHandlers.generateClaim({ body: { sessionId, currency } }, mockRes);
      } else if (currency === "RLUSD") {
        await rlusdHandlers.executePayment({ body: { sessionId, currency } }, mockRes);
      }
      
      if (duration && elapsed >= duration) {
        console.log(`⏰ Duration reached for ${sessionId}`);
        stopAutoExecution(sessionId);
      }
      
    } catch (error) {
      console.error(`❌ Auto-payment failed for ${sessionId}:`, error.message);
    }
  }, actualInterval * 1000);
  
  activeStreams.set(sessionId, {
    intervalId,
    startTime,
    config,
    paymentCount: 0,
    nextPaymentTime: Date.now() + (actualInterval * 1000),
  });
  
  console.log(`✅ Active streams: ${activeStreams.size}`);
}

function stopAutoExecution(sessionId) {
  const stream = activeStreams.get(sessionId);
  
  if (stream) {
    clearInterval(stream.intervalId);
    activeStreams.delete(sessionId);
    console.log(`🛑 Auto-execution stopped for ${sessionId}`);
  }
}

async function autoDetectAndGetStatus(sessionId, req, res) {
  try {
    return await xrpHandlers.getStatus(req, res);
  } catch (xrpError) {
    try {
      return await rlusdHandlers.getStatus(req, res);
    } catch (rlusdError) {
      return res.status(404).json({
        error: "Session not found",
        sessionId,
      });
    }
  }
}

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutdown - cleaning up streams...');
  for (const [sessionId] of activeStreams) {
    stopAutoExecution(sessionId);
  }
});

process.on('SIGINT', () => {
  console.log('🛑 Server interrupted - cleaning up streams...');
  for (const [sessionId] of activeStreams) {
    stopAutoExecution(sessionId);
  }
  process.exit(0);
});

module.exports = router;
