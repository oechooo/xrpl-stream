/**
 * Comprehensive XRP Streaming Test
 * Tests the complete XRP Payment Channel streaming flow
 */

const { createChannel } = require("../contracts/createChannel");
const { fundChannel } = require("../contracts/fundChannel");
const { claimChannel } = require("../contracts/claimChannel");
const xrpl = require("xrpl");
const axios = require("axios");
require("dotenv").config();

const SERVER_URL = "http://localhost:3000";

async function fullXRPStreamingTest() {
  console.log("🚀 COMPREHENSIVE XRP STREAMING TEST");
  console.log("=".repeat(60));

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

  let channelId = null;

  try {
    // ===== STEP 1: CREATE PAYMENT CHANNEL =====
    console.log("📝 STEP 1: Creating XRP Payment Channel...");
    const channelAmount = "5"; // 5 XRP
    const settleDelay = 3600; // 1 hour

    const channelResult = await createChannel(
      senderWallet,
      receiverWallet.address,
      channelAmount,
      settleDelay
    );

    channelId = channelResult.channelId;
    console.log(`✅ Channel created: ${channelId}`);
    console.log(`   Amount: ${channelAmount} XRP`);
    console.log(`   Settle delay: ${settleDelay} seconds\n`);

    // ===== STEP 2: TEST API - START STREAM =====
    console.log("🌊 STEP 2: Starting XRP stream via API...");

    const streamStartData = {
      senderSeed,
      receiverAddress: receiverWallet.address,
      amount: channelAmount,
      settleDelay,
    };

    const streamResponse = await axios.post(
      `${SERVER_URL}/api/stream/start`,
      streamStartData
    );
    console.log(`✅ API Stream started: ${streamResponse.data.channelId}`);
    console.log(`   Status: ${streamResponse.data.message}\n`);

    // ===== STEP 3: SIMULATE STREAMING ACTIVITY =====
    console.log("⚡ STEP 3: Simulating streaming activity...");

    const streamingIntervals = [
      { seconds: 60, amount: "0.5" }, // After 1 minute: 0.5 XRP
      { seconds: 120, amount: "1.0" }, // After 2 minutes: 1.0 XRP total
      { seconds: 180, amount: "1.5" }, // After 3 minutes: 1.5 XRP total
      { seconds: 240, amount: "2.0" }, // After 4 minutes: 2.0 XRP total
    ];

    for (let i = 0; i < streamingIntervals.length; i++) {
      const interval = streamingIntervals[i];

      console.log(`   Simulating ${interval.seconds}s elapsed...`);
      console.log(`   Claiming ${interval.amount} XRP...`);

      // Get claim from API
      const claimResponse = await axios.get(
        `${SERVER_URL}/api/stream/claim?channelId=${channelId}&amount=${interval.amount}`
      );

      console.log(
        `   ✅ Claim generated: ${claimResponse.data.claim.substring(0, 20)}...`
      );

      // Validate claim
      const validateData = {
        channelId,
        claim: claimResponse.data.claim,
        amount: interval.amount,
        receiverAddress: receiverWallet.address,
      };

      const validateResponse = await axios.post(
        `${SERVER_URL}/api/stream/validate`,
        validateData
      );
      console.log(
        `   ✅ Claim validated: ${
          validateResponse.data.valid ? "VALID" : "INVALID"
        }`
      );

      // Get status
      const statusResponse = await axios.get(
        `${SERVER_URL}/api/stream/status?channelId=${channelId}`
      );
      console.log(
        `   📊 Channel balance: ${statusResponse.data.channel.amount} drops`
      );
      console.log(`   💰 Amount claimed: ${interval.amount} XRP\n`);
    }

    // ===== STEP 4: TEST CHANNEL MANAGEMENT =====
    console.log("🔧 STEP 4: Testing channel management...");

    // Get channel history
    const historyResponse = await axios.get(
      `${SERVER_URL}/api/stream/history?channelId=${channelId}`
    );
    console.log(
      `✅ Channel history retrieved: ${historyResponse.data.claims.length} claims`
    );

    // Show history
    historyResponse.data.claims.forEach((claim, index) => {
      console.log(
        `   Claim ${index + 1}: ${claim.amount} XRP at ${new Date(
          claim.timestamp
        ).toLocaleTimeString()}`
      );
    });

    console.log();

    // ===== STEP 5: FINALIZE STREAM =====
    console.log("🏁 STEP 5: Finalizing stream...");

    const finalAmount = "2.0"; // Final amount to claim
    const finalizeData = {
      channelId,
      amount: finalAmount,
      receiverSeed,
    };

    const finalizeResponse = await axios.post(
      `${SERVER_URL}/api/stream/finalize`,
      finalizeData
    );
    console.log(
      `✅ Stream finalized: ${finalizeResponse.data.transactionHash}`
    );
    console.log(`   Final amount: ${finalAmount} XRP`);
    console.log(`   Transaction: ${finalizeResponse.data.transactionHash}\n`);

    // ===== STEP 6: STOP STREAM =====
    console.log("🛑 STEP 6: Stopping stream...");

    const stopData = { channelId };
    const stopResponse = await axios.post(
      `${SERVER_URL}/api/stream/stop`,
      stopData
    );
    console.log(`✅ Stream stopped: ${stopResponse.data.message}\n`);

    // ===== FINAL STATUS =====
    console.log("🎉 XRP STREAMING TEST COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log(`✅ Channel created and funded: ${channelId}`);
    console.log(
      `✅ Multiple claims processed: ${streamingIntervals.length} intervals`
    );
    console.log(`✅ Stream finalized with ${finalAmount} XRP`);
    console.log(`✅ Channel closed successfully`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ XRP Streaming test failed:", error.message);
    if (error.response) {
      console.error("API Error:", error.response.data);
    }

    // Cleanup: try to close channel if it was created
    if (channelId) {
      try {
        console.log("\n🧹 Attempting cleanup...");
        await axios.post(`${SERVER_URL}/api/stream/stop`, { channelId });
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
  fullXRPStreamingTest().catch(console.error);
}

module.exports = { fullXRPStreamingTest };
