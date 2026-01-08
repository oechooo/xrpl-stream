/**
 * unifiedRoutes.js
 * Unified API for both XRP and RLUSD streaming
 *
 * Same endpoints, different internal handling based on currency type
 */

const express = require("express");
const router = express.Router();

// Import both XRP and RLUSD handlers
const xrpHandlers = require("./handlers/xrpHandlers");
const rlusdHandlers = require("./handlers/rlusdHandlers");

/**
 * POST /stream/start
 * Universal stream start - works for both XRP and RLUSD
 *
 * Body: {
 *   currency: 'XRP' | 'RLUSD',
 *
 *   // XRP specific (when currency='XRP')
 *   channelId?: string,
 *   role?: 'sender' | 'receiver',
 *   ratePerSecond?: number, // drops
 *
 *   // RLUSD specific (when currency='RLUSD')
 *   totalAmount?: string,
 *   duration?: number,
 *   intervalSeconds?: number,
 *
 *   // Common fields
 *   senderSeed: string,
 *   receiverAddress: string
 * }
 */
router.post("/start", async (req, res) => {
  const { currency } = req.body;

  try {
    if (currency === "XRP") {
      return await xrpHandlers.startStream(req, res);
    } else if (currency === "RLUSD") {
      return await rlusdHandlers.startStream(req, res);
    } else {
      return res.status(400).json({
        error: "Invalid currency",
        supported: ["XRP", "RLUSD"],
      });
    }
  } catch (error) {
    res.status(500).json({
      error: "Stream start failed",
      details: error.message,
    });
  }
});

/**
 * POST /stream/execute
 * Universal stream execution - works for both currencies
 *
 * For XRP: Generates and returns signed claim
 * For RLUSD: Executes direct payment transaction
 */
router.post("/execute", async (req, res) => {
  const { sessionId, currency } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: "sessionId required" });
  }

  try {
    if (currency === "XRP") {
      // Return signed claim for XRP
      return await xrpHandlers.generateClaim(req, res);
    } else if (currency === "RLUSD") {
      // Execute payment for RLUSD
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
 * POST /stream/finalize
 * Universal finalization - works for both currencies
 *
 * For XRP: Submits claim to XRPL (on-chain)
 * For RLUSD: No-op (already finalized) or bulk status
 */
router.post("/finalize", async (req, res) => {
  const { sessionId, currency } = req.body;

  try {
    if (currency === "XRP") {
      return await xrpHandlers.finalizeClaim(req, res);
    } else if (currency === "RLUSD") {
      // RLUSD payments are auto-finalized, just return status
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
 * GET /stream/status/:sessionId
 * Universal status check - works for both currencies
 */
router.get("/status/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const { currency } = req.query;

  try {
    if (currency === "XRP") {
      return await xrpHandlers.getStatus(req, res);
    } else if (currency === "RLUSD") {
      return await rlusdHandlers.getStatus(req, res);
    } else {
      // Try to auto-detect currency from session
      return await autoDetectAndGetStatus(sessionId, req, res);
    }
  } catch (error) {
    res.status(500).json({
      error: "Status check failed",
      details: error.message,
    });
  }
});

/**
 * POST /stream/stop
 * Universal stream stop - works for both currencies
 */
router.post("/stop", async (req, res) => {
  const { sessionId, currency } = req.body;

  try {
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

async function autoDetectAndGetStatus(sessionId, req, res) {
  // Try XRP first
  try {
    return await xrpHandlers.getStatus(req, res);
  } catch (xrpError) {
    // Try RLUSD
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

module.exports = router;
