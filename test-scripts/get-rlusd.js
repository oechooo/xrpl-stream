/**
 * Get RLUSD for testing by trading XRP → RLUSD on XRPL DEX
 */
const xrpl = require("xrpl");
require("dotenv").config();

async function getRLUSDForTesting() {
  console.log("💱 Getting RLUSD for Testing\n");

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const senderSeed = process.env.SENDER_WALLET_SEED;

  if (!senderSeed) {
    console.error("❌ Error: Missing SENDER_WALLET_SEED in .env");
    process.exit(1);
  }

  const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
  console.log(`Sender Address: ${senderWallet.address}`);

  try {
    // First, let's set up a trust line for RLUSD
    console.log("\n1️⃣ Setting up RLUSD trust line...");

    const trustLineTx = {
      TransactionType: "TrustSet",
      Account: senderWallet.address,
      LimitAmount: {
        currency: "USD",
        issuer: "rMxCVaJYp6WDH2mBPk5zLGwxr1g2Ur1qWn", // Ripple's RLUSD issuer
        value: "1000", // Trust limit: 1000 RLUSD
      },
    };

    const prepared = await client.autofill(trustLineTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("✅ Trust line created successfully!");
    } else {
      console.log(
        `⚠️  Trust line result: ${result.result.meta.TransactionResult}`
      );
    }

    // Now try to get RLUSD
    console.log("\n2️⃣ Attempting to acquire RLUSD...");
    console.log("🔍 Looking for RLUSD offers on DEX...");

    // Check order book
    const orderBook = await client.request({
      command: "book_offers",
      taker_gets: {
        currency: "USD",
        issuer: "rMxCVaJYp6WDH2mBPk5zLGwxr1g2Ur1qWn",
      },
      taker_pays: "XRP",
      limit: 10,
    });

    console.log(`Found ${orderBook.result.offers.length} RLUSD offers`);

    if (orderBook.result.offers.length === 0) {
      console.log("\n❌ No RLUSD offers available on DEX");
      console.log("🛠️  Alternative options:");
      console.log("  1. Check if Ripple has a testnet RLUSD faucet");
      console.log("  2. Try different RLUSD issuers");
      console.log("  3. Test with XRP streaming instead");
      console.log("  4. Create mock RLUSD for testing");

      // Let's try creating a mock RLUSD for testing
      console.log("\n3️⃣ Creating mock RLUSD for testing...");
      await createMockRLUSD(client, senderWallet);
    } else {
      console.log(
        "\n✅ RLUSD offers found! You can manually trade XRP for RLUSD."
      );
      orderBook.result.offers.slice(0, 3).forEach((offer, i) => {
        console.log(
          `  ${i + 1}. ${offer.TakerGets.value} RLUSD for ${xrpl.dropsToXrp(
            offer.TakerPays
          )} XRP`
        );
      });
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await client.disconnect();
  }
}

async function createMockRLUSD(client, wallet) {
  try {
    // Create a Payment transaction to ourselves to establish RLUSD balance
    // This works if we are the issuer or if there's an existing RLUSD gateway

    console.log("Creating mock RLUSD transaction...");

    // Note: This will only work if you're connected to the RLUSD issuer
    // For real testing, you need actual RLUSD from an issuer or DEX

    const mockPayment = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: wallet.address,
      Amount: {
        currency: "USD",
        issuer: "rMxCVaJYp6WDH2mBPk5zLGwxr1g2Ur1qWn",
        value: "100",
      },
    };

    const prepared = await client.autofill(mockPayment);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    console.log(
      `Mock transaction result: ${result.result.meta.TransactionResult}`
    );

    if (result.result.meta.TransactionResult !== "tesSUCCESS") {
      console.log("❌ Mock RLUSD creation failed");
      console.log("💡 You need real RLUSD from the issuer or DEX");
    }
  } catch (error) {
    console.log("❌ Mock RLUSD failed:", error.message);
    console.log("\n🎯 FINAL RECOMMENDATION:");
    console.log("  Test the XRP streaming first - it works without RLUSD");
    console.log("  Run: node test-scripts/1-create-channel.js");
    console.log(
      "  (But first get more XRP from faucet - you need ~60 XRP total)"
    );
  }
}

getRLUSDForTesting().catch(console.error);
