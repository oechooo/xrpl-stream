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

// Store payment history for completed sessions
const paymentHistory = new Map();

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
      isPaused: false,
      payments: [], // Track individual payments
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
 * POST /rlusd/stream/execute
 * Execute the next payment in an RLUSD stream (alias for /stream/payment)
 * Returns response structure expected by tests
 *
 * Body: { sessionKey: string }
 */
router.post("/stream/execute", async (req, res) => {
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

    // Check if stream is paused
    if (session.isPaused) {
      return res.status(400).json({
        error: "RLUSD stream is paused. Resume before executing payments.",
        sessionKey,
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
        paymentHistory.set(sessionKey, {
          ...session,
          completedAt: Date.now(),
        });
        activeRLUSDSessions.delete(sessionKey);
        console.log(`✓ RLUSD stream completed: ${sessionKey}`);
      }

      res.json({
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
        paymentHistory.set(sessionKey, {
          ...session,
          completedAt: Date.now(),
        });
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
});

/**
 * GET /rlusd/stream/history/:sessionKey
 * Get payment history for a session
 */
router.get("/stream/history/:sessionKey", (req, res) => {
  const { sessionKey } = req.params;

  // Check active session first
  let session = activeRLUSDSessions.get(sessionKey);
  let isActive = true;

  // If not active, check completed sessions
  if (!session) {
    session = paymentHistory.get(sessionKey);
    isActive = false;
  }

  if (!session) {
    return res.status(404).json({
      error: "No RLUSD stream session found",
      sessionKey,
    });
  }

  res.json({
    sessionKey,
    active: isActive,
    senderAddress: session.senderWallet.address,
    receiverAddress: session.receiverAddress,
    totalAmount: session.totalAmount,
    startTime: session.startTime,
    completedAt: session.completedAt || null,
    payments: session.payments || [],
    paymentCount: session.payments ? session.payments.length : 0,
  });
});

/**
 * POST /rlusd/stream/pause
 * Pause an active RLUSD stream
 */
router.post("/stream/pause", (req, res) => {
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

  if (session.isPaused) {
    return res.status(400).json({
      error: "RLUSD stream is already paused",
      sessionKey,
    });
  }

  session.isPaused = true;
  session.pausedAt = Date.now();

  res.json({
    success: true,
    message: "RLUSD stream paused",
    sessionKey,
    paymentsCompleted: session.paymentsCompleted,
    pausedAt: session.pausedAt,
  });

  console.log(`⏸️ RLUSD stream paused: ${sessionKey}`);
});

/**
 * POST /rlusd/stream/resume
 * Resume a paused RLUSD stream
 */
router.post("/stream/resume", (req, res) => {
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

  if (!session.isPaused) {
    return res.status(400).json({
      error: "RLUSD stream is not paused",
      sessionKey,
    });
  }

  session.isPaused = false;
  delete session.pausedAt;

  const remaining = session.paymentCount - session.paymentsCompleted;

  res.json({
    success: true,
    message: "RLUSD stream resumed",
    sessionKey,
    remainingPayments: remaining,
    paymentsCompleted: session.paymentsCompleted,
  });

  console.log(`▶️ RLUSD stream resumed: ${sessionKey}`);
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

  // Preserve history before deleting session
  paymentHistory.set(sessionKey, {
    ...session,
    stoppedAt: Date.now(),
  });

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

// ═══════════════════════════════════════════════════════════════════════════
// SSE DEMO ENDPOINT - Real-time RLUSD Streaming Demo
// This is mounted separately BEFORE auth middleware for public access
// ═══════════════════════════════════════════════════════════════════════════

// Create a separate router for the demo endpoint (to be mounted without auth)
const rlusdDemoRouter = express.Router();

/**
 * Helper to send SSE event
 */
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Sleep helper
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET /start (mounted at /api/rlusd/demo)
 * Start the RLUSD streaming demo with SSE for real-time updates
 * 
 * Query params:
 *   totalAmount: string (default: "5.00")
 *   duration: number in seconds (default: 60)
 *   intervalSeconds: number (default: 10)
 */
rlusdDemoRouter.get("/start", async (req, res) => {
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const sessionId = `rlusd-demo-${Date.now()}`;

  // Parse configuration from query params
  const totalAmount = req.query.totalAmount || "5.00";
  const duration = parseInt(req.query.duration) || 60;
  const intervalSeconds = parseInt(req.query.intervalSeconds) || 10;

  // Get wallet seeds from environment
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;

  if (!senderSeed || !receiverSeed) {
    sendSSE(res, "error", {
      message:
        "Missing wallet seeds in .env (SENDER_WALLET_SEED, RECEIVER_WALLET_SEED)",
    });
    res.end();
    return;
  }

  // Initialize demo state
  const demoState = {
    sessionId,
    status: "running",
    phase: "init",
    sessionKey: null,
    senderAddress: null,
    receiverAddress: null,
    totalAmount: parseFloat(totalAmount),
    paymentAmount: 0,
    paymentCount: 0,
    paymentsCompleted: 0,
    totalSent: 0,
    totalFees: 0,
    transactions: [],
    startTime: Date.now(),
  };

  // Handle client disconnect
  let cancelled = false;
  req.on("close", () => {
    cancelled = true;
    demoState.status = "cancelled";
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════

    sendSSE(res, "phase", { phase: "init", message: "Initializing RLUSD stream..." });

    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);

    demoState.senderAddress = senderWallet.address;
    demoState.receiverAddress = receiverWallet.address;

    // Calculate streaming parameters
    const paymentCount = Math.floor(duration / intervalSeconds);
    const paymentAmount = (parseFloat(totalAmount) / paymentCount).toFixed(2);

    demoState.paymentCount = paymentCount;
    demoState.paymentAmount = parseFloat(paymentAmount);

    sendSSE(res, "init", {
      sender: {
        address: senderWallet.address,
        role: "Client (Sender)",
      },
      receiver: {
        address: receiverWallet.address,
        role: "Provider (Receiver)",
      },
      config: {
        totalAmount: formatRLUSD(totalAmount),
        duration: duration,
        intervalSeconds: intervalSeconds,
        paymentCount: paymentCount,
        paymentAmount: formatRLUSD(paymentAmount),
        ratePerSecond: `$${(parseFloat(paymentAmount) / intervalSeconds).toFixed(4)}`,
      },
    });

    await sleep(500);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: CHECK RLUSD BALANCE
    // ═══════════════════════════════════════════════════════════════════════

    sendSSE(res, "phase", { phase: "balance_check", message: "Checking RLUSD balance..." });

    const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
    await client.connect();

    const senderLines = await client.request({
      command: "account_lines",
      account: senderWallet.address,
      ledger_index: "validated",
    });

    const rlusdBalance = senderLines.result.lines.find(
      (line) => line.currency === "USD" || line.currency.includes("USD")
    );

    if (!rlusdBalance) {
      sendSSE(res, "error", {
        message: "No RLUSD trustline found! Run: node test-scripts/get-rlusd.js first",
      });
      await client.disconnect();
      res.end();
      return;
    }

    const balance = parseFloat(rlusdBalance.balance);
    if (balance < parseFloat(totalAmount)) {
      sendSSE(res, "error", {
        message: `Insufficient RLUSD balance: ${formatRLUSD(balance)} < ${formatRLUSD(totalAmount)}`,
      });
      await client.disconnect();
      res.end();
      return;
    }

    sendSSE(res, "balance_checked", {
      balance: formatRLUSD(rlusdBalance.balance),
      issuer: rlusdBalance.account,
      sufficient: true,
    });

    await client.disconnect();
    await sleep(300);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: CREATE SESSION
    // ═══════════════════════════════════════════════════════════════════════

    demoState.phase = "session";
    sendSSE(res, "phase", { phase: "session", message: "Creating RLUSD stream session..." });

    const sessionKey = `${senderWallet.address}-${receiverWallet.address}`;
    demoState.sessionKey = sessionKey;

    // Check if session already exists and clean it up
    if (activeRLUSDSessions.has(sessionKey)) {
      activeRLUSDSessions.delete(sessionKey);
    }

    const streamConfig = await createDirectRLUSDStream(
      senderWallet,
      receiverWallet.address,
      totalAmount,
      paymentCount
    );

    // Store session
    activeRLUSDSessions.set(sessionKey, {
      senderWallet,
      receiverAddress: receiverWallet.address,
      totalAmount: parseFloat(totalAmount),
      paymentAmount: parseFloat(paymentAmount),
      paymentCount,
      paymentsCompleted: 0,
      intervalSeconds,
      startTime: Date.now(),
      config: streamConfig,
      isPaused: false,
      payments: [],
    });

    sendSSE(res, "session_created", {
      sessionKey,
      senderAddress: senderWallet.address,
      receiverAddress: receiverWallet.address,
      totalAmount: formatRLUSD(totalAmount),
      paymentAmount: formatRLUSD(paymentAmount),
      paymentCount,
      intervalSeconds,
    });

    await sleep(300);

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: STREAMING PAYMENTS
    // ═══════════════════════════════════════════════════════════════════════

    demoState.phase = "streaming";
    sendSSE(res, "phase", { phase: "streaming", message: "Starting payment stream..." });

    const rateInfo = calculateRLUSDStreamingRate(parseFloat(totalAmount), duration);

    sendSSE(res, "stream_started", {
      active: true,
      rate: rateInfo.formatted.perSecond,
      ratePerMinute: rateInfo.formatted.perMinute,
    });

    // Execute payments
    for (let i = 1; i <= paymentCount; i++) {
      if (cancelled) break;

      const session = activeRLUSDSessions.get(sessionKey);
      if (!session) break;

      // Update progress before payment
      const progress = ((i - 1) / paymentCount) * 100;
      sendSSE(res, "payment_pending", {
        paymentNumber: i,
        totalPayments: paymentCount,
        progress: Math.round(progress),
        message: `Executing payment ${i}/${paymentCount}...`,
      });

      // Execute the actual payment
      const paymentResult = await executeRLUSDPayment(
        senderWallet,
        receiverWallet.address,
        paymentAmount
      );

      if (paymentResult.success) {
        session.paymentsCompleted++;
        demoState.paymentsCompleted = i;
        demoState.totalSent += parseFloat(paymentAmount);
        demoState.totalFees += 0.00001; // Approximate fee per tx

        // Track payment
        const paymentRecord = {
          paymentNumber: i,
          amount: paymentAmount,
          transactionHash: paymentResult.transactionHash,
          timestamp: Date.now(),
        };
        session.payments.push(paymentRecord);
        demoState.transactions.push(paymentRecord);

        const currentProgress = (i / paymentCount) * 100;

        sendSSE(res, "payment", {
          paymentNumber: i,
          totalPayments: paymentCount,
          amount: formatRLUSD(paymentAmount),
          transactionHash: paymentResult.transactionHash,
          totalSent: formatRLUSD(demoState.totalSent.toFixed(2)),
          progress: Math.round(currentProgress),
          fee: "0.00001 XRP",
          totalFees: demoState.totalFees.toFixed(6) + " XRP",
        });

        // Add transaction event
        sendSSE(res, "transaction", {
          type: "payment",
          timestamp: Date.now(),
          from: senderWallet.address,
          to: receiverWallet.address,
          amount: formatRLUSD(paymentAmount),
          txHash: paymentResult.transactionHash,
          status: "Success",
        });

        // Wait for next interval (unless it's the last payment)
        if (i < paymentCount && !cancelled) {
          // Show countdown
          for (let sec = intervalSeconds; sec > 0 && !cancelled; sec--) {
            sendSSE(res, "countdown", {
              nextPaymentIn: sec,
              paymentNumber: i + 1,
            });
            await sleep(1000);
          }
        }
      } else {
        sendSSE(res, "payment_error", {
          paymentNumber: i,
          error: paymentResult.error,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: COMPLETE
    // ═══════════════════════════════════════════════════════════════════════

    demoState.phase = "complete";
    demoState.status = "completed";

    // Clean up session
    activeRLUSDSessions.delete(sessionKey);

    // Save to history
    paymentHistory.set(sessionKey, {
      senderWallet,
      receiverAddress: receiverWallet.address,
      totalAmount: parseFloat(totalAmount),
      paymentsCompleted: demoState.paymentsCompleted,
      totalSent: demoState.totalSent,
      completedAt: Date.now(),
      transactions: demoState.transactions,
    });

    const durationMs = Date.now() - demoState.startTime;

    sendSSE(res, "complete", {
      success: true,
      summary: {
        sessionKey,
        duration: Math.round(durationMs / 1000),
        paymentsCompleted: demoState.paymentsCompleted,
        totalPayments: paymentCount,
        totalSent: formatRLUSD(demoState.totalSent.toFixed(2)),
        totalSentRaw: demoState.totalSent.toFixed(2),
        totalFees: demoState.totalFees.toFixed(6) + " XRP",
        transactions: demoState.transactions.length,
        averagePaymentTime: Math.round(durationMs / demoState.paymentsCompleted / 1000),
      },
    });

    console.log(`✓ RLUSD demo completed: ${sessionKey}`);

  } catch (error) {
    console.error("RLUSD Demo Error:", error);
    sendSSE(res, "error", {
      message: error.message,
      phase: demoState.phase,
    });

    // Cleanup on error
    if (demoState.sessionKey) {
      activeRLUSDSessions.delete(demoState.sessionKey);
    }
  } finally {
    res.end();
  }
});

// Export both routers
module.exports = router;
module.exports.rlusdDemoRouter = rlusdDemoRouter;