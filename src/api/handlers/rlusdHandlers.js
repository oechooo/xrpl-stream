/**
 * rlusdHandlers.js
 * Business logic handlers for RLUSD direct payment streaming
 * Extracted from rlusdRoutes.js for use in unified API
 */

const xrpl = require("xrpl");
const {
  createDirectRLUSDStream,
  executeRLUSDPayment,
} = require("../../../contracts/createRLUSDStream");
const {
  calculateRLUSDStreamingRate,
  formatRLUSD,
} = require("../../utils/converters");

// Store active RLUSD streaming sessions
const activeRLUSDSessions = new Map();

// Store payment history for completed sessions
const paymentHistory = new Map();

/**
 * Start a new RLUSD streaming session
 */
async function startStream(req, res) {
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
      isPaused: false,
      payments: [], // Track individual payments
    });

    console.log(
      `✓ Started RLUSD stream: ${senderWallet.address} → ${receiverAddress}`
    );

    return res.json({
      success: true,
      message: "RLUSD stream started",
      sessionId: sessionKey,
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
    return res.status(500).json({
      error: "Failed to start RLUSD stream",
      details: error.message,
    });
  }
}

/**
 * Execute the next payment in an RLUSD stream
 */
async function executePayment(req, res) {
  try {
    const { sessionKey, sessionId } = req.body;
    const actualSessionKey = sessionKey || sessionId;

    if (!actualSessionKey) {
      return res.status(400).json({ error: "sessionKey or sessionId required" });
    }

    const session = activeRLUSDSessions.get(actualSessionKey);
    if (!session) {
      return res.status(404).json({
        error: "No active RLUSD stream found",
        sessionKey: actualSessionKey,
      });
    }

    // Check if stream is paused
    if (session.isPaused) {
      return res.status(400).json({
        error: "RLUSD stream is paused. Resume before executing payments.",
        sessionKey: actualSessionKey,
      });
    }

    // Check if stream is complete
    if (session.paymentsCompleted >= session.paymentCount) {
      return res.status(400).json({
        error: "RLUSD stream is already complete",
        progress: {
          completed: session.paymentsCompleted,
          total: session.paymentCount,
          totalSent: (
            session.paymentsCompleted * session.paymentAmount
          ).toFixed(2),
        },
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

      // Track individual payment
      const paymentRecord = {
        paymentNumber: session.paymentsCompleted,
        amount: session.paymentAmount.toFixed(2),
        transactionHash: paymentResult.transactionHash,
        timestamp: Date.now(),
      };
      session.payments.push(paymentRecord);

      console.log(
        `✓ RLUSD payment ${session.paymentsCompleted}/${session.paymentCount} sent`
      );

      // Clean up session if complete but preserve history
      if (remaining === 0) {
        paymentHistory.set(actualSessionKey, {
          ...session,
          completedAt: Date.now(),
        });
        activeRLUSDSessions.delete(actualSessionKey);
        console.log(`✓ RLUSD stream completed: ${actualSessionKey}`);
      }

      return res.json({
        success: true,
        transactionHash: paymentResult.transactionHash,
        amount: session.paymentAmount.toFixed(2),
        progress: {
          completed: session.paymentsCompleted,
          total: session.paymentCount,
          totalSent,
        },
      });
    } else {
      return res.status(500).json({
        error: "Payment execution failed",
        details: paymentResult.error,
      });
    }
  } catch (error) {
    console.error("Error executing RLUSD payment:", error);
    return res.status(500).json({
      error: "Failed to execute RLUSD payment",
      details: error.message,
    });
  }
}

/**
 * Get status of an active RLUSD stream
 */
async function getStatus(req, res) {
  try {
    const { sessionKey, sessionId } = req.params || req.query || req.body;
    const actualSessionKey = sessionKey || sessionId;

    if (!actualSessionKey) {
      return res.status(400).json({ error: "sessionKey or sessionId required" });
    }

    const session = activeRLUSDSessions.get(actualSessionKey);

    if (!session) {
      // Check payment history
      const historicalSession = paymentHistory.get(actualSessionKey);
      if (historicalSession) {
        return res.json({
          sessionKey: actualSessionKey,
          active: false,
          completed: true,
          senderAddress: historicalSession.senderWallet.address,
          receiverAddress: historicalSession.receiverAddress,
          totalAmount: historicalSession.totalAmount,
          paymentsCompleted: historicalSession.paymentsCompleted,
          completedAt: historicalSession.completedAt,
        });
      }

      return res.status(404).json({
        error: "No RLUSD stream found",
        sessionKey: actualSessionKey,
      });
    }

    const totalSent = (session.paymentsCompleted * session.paymentAmount).toFixed(2);
    const remaining = session.paymentCount - session.paymentsCompleted;
    const elapsed = Date.now() - session.startTime;

    return res.json({
      sessionKey: actualSessionKey,
      active: true,
      senderAddress: session.senderWallet.address,
      receiverAddress: session.receiverAddress,
      totalAmount: session.totalAmount,
      paymentAmount: session.paymentAmount,
      startTime: session.startTime,
      isPaused: session.isPaused,
      progress: {
        completed: session.paymentsCompleted,
        total: session.paymentCount,
        totalSent,
        remaining: (session.totalAmount - parseFloat(totalSent)).toFixed(2),
      },
      elapsedTimeMs: elapsed,
      streamComplete: remaining === 0,
    });
  } catch (error) {
    console.error("Error getting RLUSD status:", error);
    return res.status(500).json({
      error: "Failed to get status",
      details: error.message,
    });
  }
}

/**
 * Stop an active RLUSD stream
 */
async function stopStream(req, res) {
  try {
    const { sessionKey, sessionId } = req.body;
    const actualSessionKey = sessionKey || sessionId;

    if (!actualSessionKey) {
      return res.status(400).json({ error: "sessionKey or sessionId required" });
    }

    const session = activeRLUSDSessions.get(actualSessionKey);
    if (!session) {
      return res.status(404).json({
        error: "No active RLUSD stream found",
        sessionKey: actualSessionKey,
      });
    }

    const totalSent = (session.paymentsCompleted * session.paymentAmount).toFixed(2);
    const elapsed = Date.now() - session.startTime;

    // Preserve history before deleting session
    paymentHistory.set(actualSessionKey, {
      ...session,
      stoppedAt: Date.now(),
    });

    activeRLUSDSessions.delete(actualSessionKey);

    return res.json({
      success: true,
      message: "RLUSD stream stopped",
      sessionKey: actualSessionKey,
      paymentsCompleted: session.paymentsCompleted,
      totalSent,
      elapsedTimeMs: elapsed,
    });
  } catch (error) {
    console.error("Error stopping RLUSD stream:", error);
    return res.status(500).json({
      error: "Failed to stop stream",
      details: error.message,
    });
  }
}

/**
 * Generate claim (no-op for RLUSD - just return current status)
 */
async function generateClaim(req, res) {
  // RLUSD doesn't use claims - return current status instead
  return getStatus(req, res);
}

/**
 * Finalize claim (no-op for RLUSD - payments are already finalized)
 */
async function finalizeClaim(req, res) {
  // RLUSD payments are auto-finalized on-chain
  return getStatus(req, res);
}

module.exports = {
  startStream,
  stopStream,
  executePayment,
  generateClaim,
  finalizeClaim,
  getStatus,
};
