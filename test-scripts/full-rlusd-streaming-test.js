/**
 * Comprehensive RLUSD Streaming Test
 * Tests the complete RLUSD direct payment streaming flow
 */

const {
  createDirectRLUSDStream,
  executeRLUSDPayment,
} = require("../contracts/createRLUSDStream");
const xrpl = require("xrpl");
const axios = require("axios");
const {
  formatRLUSD,
  calculateRLUSDStreamingRate,
} = require("../src/utils/converters");
require("dotenv").config();

const SERVER_URL = "http://localhost:3000";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("❌ API_KEY not found in .env file");
  process.exit(1);
}

// Create axios instance with auth header
const api = axios.create({
  baseURL: SERVER_URL,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
  },
});

// Check if server is running before starting tests
async function checkServerHealth() {
  try {
    const response = await axios.get(`${SERVER_URL}/health`, { timeout: 3000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function fullRLUSDStreamingTest() {
  console.log("🚀 COMPREHENSIVE RLUSD STREAMING TEST");
  console.log("=".repeat(60));

  // Check server health first
  const serverRunning = await checkServerHealth();
  if (!serverRunning) {
    console.error("❌ Server is not running at " + SERVER_URL);
    console.error("💡 Start the server first: npm start");
    console.error("   Then run this test in a separate terminal.\n");
    process.exit(1);
  }
  console.log("✅ Server is running\n");

  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;

  if (!senderSeed || !receiverSeed) {
    console.error("❌ Missing wallet seeds in .env");
    process.exit(1);
  }

  const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
  const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);

  console.log(`Sender: ${senderWallet.address}`);
  console.log(`Receiver: ${receiverWallet.address}\n`);

  let sessionKey = null;

  try {
    // ===== STEP 1: CHECK RLUSD BALANCE =====
    console.log("💰 STEP 1: Checking RLUSD balance...");

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
      console.error("❌ No RLUSD balance found!");
      console.error("💡 Run: node test-scripts/get-rlusd.js first");
      process.exit(1);
    }

    console.log(`✅ RLUSD Balance: ${formatRLUSD(rlusdBalance.balance)}`);
    console.log(`   Issuer: ${rlusdBalance.account}\n`);

    await client.disconnect();

    // ===== STEP 2: CALCULATE STREAMING PARAMETERS =====
    console.log("📊 STEP 2: Setting up streaming parameters...");

    const totalAmount = "5.00"; // 5 RLUSD
    const duration = 300; // 5 minutes for testing
    const intervalSeconds = 1; // Payment every 30 seconds
    const paymentCount = Math.floor(duration / intervalSeconds); // 10 payments
    const paymentAmount = (parseFloat(totalAmount) / paymentCount).toFixed(2);

    const rateInfo = calculateRLUSDStreamingRate(
      parseFloat(totalAmount),
      duration
    );

    console.log(`   Total amount: ${formatRLUSD(totalAmount)}`);
    console.log(`   Duration: ${duration} seconds (${duration / 60} minutes)`);
    console.log(`   Payment interval: ${intervalSeconds} seconds`);
    console.log(`   Payment count: ${paymentCount}`);
    console.log(`   Payment amount: ${formatRLUSD(paymentAmount)} each`);
    console.log(`   Rate: ${rateInfo.formatted.perSecond}/second`);
    console.log(`   Rate: ${rateInfo.formatted.perMinute}/minute\n`);

    // ===== STEP 3: START RLUSD STREAM VIA API =====
    console.log("🌊 STEP 3: Starting RLUSD stream via API...");

    const streamStartData = {
      senderSeed,
      receiverAddress: receiverWallet.address,
      totalAmount,
      duration,
      intervalSeconds,
    };

    const streamResponse = await api.post(
      `/api/rlusd/stream/start`,
      streamStartData
    );
    sessionKey = streamResponse.data.sessionKey;

    console.log(`✅ RLUSD stream started: ${sessionKey}`);
    console.log(`   Status: ${streamResponse.data.message}`);
    console.log(
      `   Payment amount: ${formatRLUSD(streamResponse.data.paymentAmount)}`
    );
    console.log(`   Payment count: ${streamResponse.data.paymentCount}\n`);

    // ===== STEP 4: EXECUTE STREAMING PAYMENTS =====
    console.log("⚡ STEP 4: Executing streaming payments...");

    const paymentIntervals = Array.from(
      { length: Math.min(5, paymentCount) },
      (_, i) => ({
        paymentNumber: i + 1,
        delay: i * (intervalSeconds * 1000), // Convert to milliseconds
      })
    );

    for (const interval of paymentIntervals) {
      console.log(`   💸 Payment ${interval.paymentNumber}/${paymentCount}...`);

      // Execute payment via API
      const paymentData = { sessionKey };
      const paymentResponse = await api.post(
        `/api/rlusd/stream/execute`,
        paymentData
      );

      console.log(
        `   ✅ Payment executed: ${paymentResponse.data.transactionHash.substring(
          0,
          16
        )}...`
      );
      console.log(`   💰 Amount: ${formatRLUSD(paymentResponse.data.amount)}`);
      console.log(
        `   📊 Progress: ${paymentResponse.data.progress.completed}/${paymentResponse.data.progress.total} payments`
      );
      console.log(
        `   💵 Total sent: ${formatRLUSD(
          paymentResponse.data.progress.totalSent
        )}\n`
      );

      // Wait for next interval (shortened for testing)
      if (interval.paymentNumber < paymentIntervals.length) {
        console.log(`   ⏳ Waiting ${intervalSeconds} seconds...`);
        await new Promise((resolve) =>
          setTimeout(resolve, intervalSeconds * 1000)
        );
      }
    }

    // ===== STEP 5: GET SESSION STATUS =====
    console.log("📋 STEP 5: Checking session status...");

    const statusResponse = await api.get(
      `/api/rlusd/stream/status/${sessionKey}`
    );
    console.log(`✅ Session status retrieved:`);
    console.log(`   Active: ${statusResponse.data.active}`);
    console.log(
      `   Progress: ${statusResponse.data.progress.completed}/${statusResponse.data.progress.total}`
    );
    console.log(
      `   Total sent: ${formatRLUSD(statusResponse.data.progress.totalSent)}`
    );
    console.log(
      `   Remaining: ${formatRLUSD(statusResponse.data.progress.remaining)}`
    );
    console.log(
      `   Start time: ${new Date(
        statusResponse.data.startTime
      ).toLocaleString()}\n`
    );

    // ===== STEP 6: GET PAYMENT HISTORY =====
    console.log("📚 STEP 6: Retrieving payment history...");

    const historyResponse = await api.get(
      `/api/rlusd/stream/history/${sessionKey}`
    );
    console.log(
      `✅ Payment history retrieved: ${historyResponse.data.payments.length} payments`
    );

    historyResponse.data.payments.forEach((payment, index) => {
      console.log(
        `   Payment ${index + 1}: ${formatRLUSD(payment.amount)} at ${new Date(
          payment.timestamp
        ).toLocaleTimeString()}`
      );
      console.log(`     TX: ${payment.transactionHash.substring(0, 20)}...`);
    });
    console.log();

    // ===== STEP 7: PAUSE STREAM =====
    console.log("⏸️  STEP 7: Pausing stream...");

    const pauseData = { sessionKey };
    const pauseResponse = await api.post(`/api/rlusd/stream/pause`, pauseData);
    console.log(`✅ Stream paused: ${pauseResponse.data.message}`);
    console.log(
      `   Payments completed before pause: ${pauseResponse.data.paymentsCompleted}\n`
    );

    // ===== STEP 8: RESUME STREAM =====
    console.log("▶️  STEP 8: Resuming stream...");

    const resumeData = { sessionKey };
    const resumeResponse = await api.post(
      `/api/rlusd/stream/resume`,
      resumeData
    );
    console.log(`✅ Stream resumed: ${resumeResponse.data.message}`);
    console.log(
      `   Remaining payments: ${resumeResponse.data.remainingPayments}\n`
    );

    // ===== STEP 9: EXECUTE REMAINING PAYMENTS =====
    console.log("⚡ STEP 9: Executing remaining payments...");

    // Execute 2 more payments
    for (let i = 0; i < 2; i++) {
      const paymentData = { sessionKey };
      const paymentResponse = await api.post(
        `/api/rlusd/stream/execute`,
        paymentData
      );

      console.log(
        `   ✅ Payment executed: ${formatRLUSD(paymentResponse.data.amount)}`
      );
      console.log(
        `   📊 Progress: ${paymentResponse.data.progress.completed}/${paymentResponse.data.progress.total}`
      );

      if (i < 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, intervalSeconds * 1000)
        );
      }
    }
    console.log();

    // ===== STEP 10: STOP STREAM =====
    console.log("🛑 STEP 10: Stopping stream...");

    const stopData = { sessionKey };
    const stopResponse = await api.post(`/api/rlusd/stream/stop`, stopData);
    console.log(`✅ Stream stopped: ${stopResponse.data.message}`);
    console.log(
      `   Total payments completed: ${stopResponse.data.paymentsCompleted}`
    );
    console.log(
      `   Total amount sent: ${formatRLUSD(stopResponse.data.totalSent)}`
    );
    console.log(`   Session closed: ${new Date().toLocaleString()}\n`);

    // ===== FINAL STATUS =====
    console.log("🎉 RLUSD STREAMING TEST COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`✅ Stream session created: ${sessionKey}`);
    console.log(`✅ Multiple RLUSD payments executed successfully`);
    console.log(`✅ Stream pause/resume functionality tested`);
    console.log(`✅ Payment history and status tracking verified`);
    console.log(`✅ Stream stopped and session closed`);
    console.log("=".repeat(60));

    // Show rate calculations
    console.log("\n📈 FINAL STREAMING STATISTICS:");
    console.log(
      `Total amount streamed: ${formatRLUSD(stopResponse.data.totalSent)}`
    );
    console.log(`Average per payment: ${formatRLUSD(paymentAmount)}`);
    console.log(`Effective rate: ${rateInfo.formatted.perMinute}/minute`);
    console.log(
      `Transaction fees: ~${stopResponse.data.paymentsCompleted * 0.00001} XRP`
    );
  } catch (error) {
    console.error("❌ RLUSD Streaming test failed:", error.message);

    // Show more details about the error
    if (error.code === "ECONNREFUSED") {
      console.error("\n⚠️  Cannot connect to server at " + SERVER_URL);
      console.error("💡 Make sure the server is running: npm start");
    } else if (error.response) {
      console.error("API Error:", error.response.data);
    } else if (error.request) {
      console.error("Network Error: No response received from server");
    }

    // Cleanup: try to stop stream if it was created
    if (sessionKey) {
      try {
        console.log("\n🧹 Attempting cleanup...");
        await api.post(`/api/rlusd/stream/stop`, { sessionKey });
        console.log("✅ Cleanup completed");
      } catch (cleanupError) {
        console.error("❌ Cleanup failed:", cleanupError.message);
      }
    }

    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  fullRLUSDStreamingTest().catch(console.error);
}

module.exports = { fullRLUSDStreamingTest };
