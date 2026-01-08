/**
 * rlusdRoutes.js
 * API endpoints for RLUSD streaming payments using direct Payment transactions
 *
 * This provides RLUSD streaming capabilities alongside the existing XRP channel system.
 */

const express = require("express");
const router = express.Router();
const {
  createDirectRLUSDStream,
  executeRLUSDPayment,
} = require("../../contracts/createRLUSDStream");
const {
  calculateRLUSDStreamingRate,
  formatRLUSD,
} = require("../utils/converters");
const xrpl = require("xrpl");
const config = require("../../config");

// Store active RLUSD streaming sessions
const activeRLUSDSessions = new Map();

/**
 * POST /rlusd/stream/start
 * Start a new RLUSD streaming payment session
 *
 * Body: {
 *   senderSeed: string,
 *   receiverAddress: string,
 *   totalAmount: string (RLUSD),
 *   duration: number (seconds),
 *   intervalSeconds: number
 * }
 */
router.post("/stream/start", async (req, res) => {
  try {
    const {
      senderSeed,
      receiverAddress,
      totalAmount,
      duration = 3600,
      intervalSeconds = 60,
    } = req.body;

    // Validation
    if (!senderSeed || !receiverAddress || !totalAmount) {
      return res.status(400).json({
        error:
          "Missing required fields: senderSeed, receiverAddress, totalAmount",
      });
    }

    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    const sessionKey = `${senderWallet.address}-${receiverAddress}`;

    // Check if session already exists
    if (activeRLUSDSessions.has(sessionKey)) {
      return res.status(409).json({
        error: "RLUSD stream already active between these addresses",
        senderAddress: senderWallet.address,
        receiverAddress,
      });
    }

    // Calculate streaming parameters
    const paymentCount = Math.floor(duration / intervalSeconds);
    const paymentAmount = (parseFloat(totalAmount) / paymentCount).toFixed(2);

    const streamConfig = await createDirectRLUSDStream(
      senderWallet,
      receiverAddress,
      totalAmount,
      paymentCount
    );

    // Store session
    activeRLUSDSessions.set(sessionKey, {
      senderWallet,
      receiverAddress,
      totalAmount: parseFloat(totalAmount),
      paymentAmount: parseFloat(paymentAmount),
      paymentCount,
      paymentsCompleted: 0,
      intervalSeconds,
      startTime: Date.now(),
      config: streamConfig,
    });

    console.log(
      `✓ Started RLUSD stream: ${senderWallet.address} → ${receiverAddress}`
    );

    res.json({
      success: true,
      message: "RLUSD stream started",
      sessionKey,
      senderAddress: senderWallet.address,
      receiverAddress,
      totalAmount,
      paymentAmount,
      paymentCount,
      intervalSeconds,
      estimatedDuration: duration,
    });
  } catch (error) {
    console.error("Error starting RLUSD stream:", error);
    res.status(500).json({
      error: "Failed to start RLUSD stream",
      details: error.message,
    });
  }
});

/**
 * POST /rlusd/stream/payment
 * Execute the next payment in an RLUSD stream
 *
 * Body: { sessionKey: string }
 */
router.post("/stream/payment", async (req, res) => {
  try {
    const { sessionKey } = req.body;

    if (!sessionKey) {
      return res.status(400).json({ error: "sessionKey required" });
    }

    const session = activeRLUSDSessions.get(sessionKey);
    if (!session) {
      return res.status(404).json({
        error: "No active RLUSD stream found",
        sessionKey,
      });
    }

    // Check if stream is complete
    if (session.paymentsCompleted >= session.paymentCount) {
      return res.status(400).json({
        error: "RLUSD stream is already complete",
        totalCompleted: session.paymentsCompleted,
        totalRequired: session.paymentCount,
      });
    }

    // Execute payment
    const paymentResult = await executeRLUSDPayment(
      session.senderWallet,
      session.receiverAddress,
      session.paymentAmount.toFixed(2)
    );

    if (paymentResult.success) {
      session.paymentsCompleted++;
      const totalSent = (
        session.paymentsCompleted * session.paymentAmount
      ).toFixed(2);
      const remaining = session.paymentCount - session.paymentsCompleted;

      console.log(
        `✓ RLUSD payment ${session.paymentsCompleted}/${session.paymentCount} sent`
      );

      // Clean up session if complete
      if (remaining === 0) {
        activeRLUSDSessions.delete(sessionKey);
        console.log(`✓ RLUSD stream completed: ${sessionKey}`);
      }

      res.json({
        success: true,
        transactionHash: paymentResult.transactionHash,
        paymentNumber: session.paymentsCompleted,
        totalPayments: session.paymentCount,
        paymentAmount: session.paymentAmount,
        totalSent,
        remainingPayments: remaining,
        streamComplete: remaining === 0,
      });
    } else {
      res.status(500).json({
        error: "Payment execution failed",
        details: paymentResult.error,
      });
    }
  } catch (error) {
    console.error("Error executing RLUSD payment:", error);
    res.status(500).json({
      error: "Failed to execute RLUSD payment",
      details: error.message,
    });
  }
});

/**
 * GET /rlusd/stream/status/:sessionKey
 * Get status of an active RLUSD stream
 */
router.get("/stream/status/:sessionKey", (req, res) => {
  const { sessionKey } = req.params;
  const session = activeRLUSDSessions.get(sessionKey);

  if (!session) {
    return res.status(404).json({
      error: "No active RLUSD stream found",
      sessionKey,
    });
  }

  const totalSent = (session.paymentsCompleted * session.paymentAmount).toFixed(
    2
  );
  const remaining = session.paymentCount - session.paymentsCompleted;
  const elapsed = Date.now() - session.startTime;

  res.json({
    sessionKey,
    senderAddress: session.senderWallet.address,
    receiverAddress: session.receiverAddress,
    totalAmount: session.totalAmount,
    paymentAmount: session.paymentAmount,
    paymentsCompleted: session.paymentsCompleted,
    totalPayments: session.paymentCount,
    totalSent,
    remainingPayments: remaining,
    elapsedTimeMs: elapsed,
    streamComplete: remaining === 0,
  });
});

/**
 * POST /rlusd/stream/stop
 * Stop an active RLUSD stream
 */
router.post("/stream/stop", (req, res) => {
  const { sessionKey } = req.body;

  if (!sessionKey) {
    return res.status(400).json({ error: "sessionKey required" });
  }

  const session = activeRLUSDSessions.get(sessionKey);
  if (!session) {
    return res.status(404).json({
      error: "No active RLUSD stream found",
      sessionKey,
    });
  }

  const totalSent = (session.paymentsCompleted * session.paymentAmount).toFixed(
    2
  );
  const elapsed = Date.now() - session.startTime;

  activeRLUSDSessions.delete(sessionKey);

  res.json({
    success: true,
    message: "RLUSD stream stopped",
    sessionKey,
    paymentsCompleted: session.paymentsCompleted,
    totalSent,
    elapsedTimeMs: elapsed,
  });

  console.log(`✓ RLUSD stream stopped: ${sessionKey}`);
});

/**
 * GET /rlusd/streams/active
 * List all active RLUSD streams
 */
router.get("/streams/active", (req, res) => {
  const streams = Array.from(activeRLUSDSessions.entries()).map(
    ([key, session]) => ({
      sessionKey: key,
      senderAddress: session.senderWallet.address,
      receiverAddress: session.receiverAddress,
      totalAmount: session.totalAmount,
      paymentsCompleted: session.paymentsCompleted,
      totalPayments: session.paymentCount,
      elapsedTimeMs: Date.now() - session.startTime,
    })
  );

  res.json({
    activeStreams: streams,
    totalCount: streams.length,
  });
});

module.exports = router;
