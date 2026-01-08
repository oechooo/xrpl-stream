/**
 * Get RLUSD for testing by obtaining tokens from your own issuer
 *
 * PREREQUISITE: First run setup-issuer.js to create an issuer account,
 * then add RLUSD_ISSUER and RLUSD_ISSUER_SEED to your .env file.
 */
const xrpl = require("xrpl");
require("dotenv").config();

async function getRLUSDForTesting() {
  console.log("💱 Getting RLUSD for Testing\n");

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const senderSeed = process.env.SENDER_WALLET_SEED;
  const RLUSD_ISSUER = process.env.RLUSD_ISSUER;
  const RLUSD_ISSUER_SEED = process.env.RLUSD_ISSUER_SEED;

  if (!senderSeed) {
    console.error("❌ Error: Missing SENDER_WALLET_SEED in .env");
    process.exit(1);
  }

  if (!RLUSD_ISSUER || !RLUSD_ISSUER_SEED) {
    console.error(
      "❌ Error: Missing RLUSD_ISSUER or RLUSD_ISSUER_SEED in .env"
    );
    console.error("\n📝 To set up an RLUSD issuer:");
    console.error("   1. Run: node test-scripts/setup-issuer.js");
    console.error(
      "   2. Copy the RLUSD_ISSUER and RLUSD_ISSUER_SEED to your .env file"
    );
    console.error("   3. Then run this script again\n");
    process.exit(1);
  }

  const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
  const issuerWallet = xrpl.Wallet.fromSeed(RLUSD_ISSUER_SEED);

  console.log(`Sender Address: ${senderWallet.address}`);
  console.log(`Issuer Address: ${issuerWallet.address}`);

  try {
    // First, set up a trust line for RLUSD from sender
    console.log("\n1️⃣ Setting up RLUSD trust line for sender...");

    const trustLineTx = {
      TransactionType: "TrustSet",
      Account: senderWallet.address,
      LimitAmount: {
        currency: "USD",
        issuer: RLUSD_ISSUER,
        value: "10000", // Trust limit: 10000 RLUSD
      },
    };

    const prepared = await client.autofill(trustLineTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("✅ Trust line created successfully!");
    } else if (result.result.meta.TransactionResult === "tecDUPLICATE") {
      console.log("✅ Trust line already exists!");
    } else {
      console.log(
        `⚠️  Trust line result: ${result.result.meta.TransactionResult}`
      );
    }

    // Now issue RLUSD from the issuer to the sender
    console.log("\n2️⃣ Issuing RLUSD from issuer to sender...");

    const paymentTx = {
      TransactionType: "Payment",
      Account: issuerWallet.address,
      Destination: senderWallet.address,
      Amount: {
        currency: "USD",
        issuer: RLUSD_ISSUER,
        value: "1000", // Issue 1000 RLUSD
      },
    };

    const preparedPayment = await client.autofill(paymentTx);
    const signedPayment = issuerWallet.sign(preparedPayment);
    const paymentResult = await client.submitAndWait(signedPayment.tx_blob);

    if (paymentResult.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("✅ Successfully issued 1000 RLUSD to sender!");
    } else {
      console.log(
        `❌ Payment failed: ${paymentResult.result.meta.TransactionResult}`
      );
    }

    // Check balances
    console.log("\n3️⃣ Checking RLUSD balances...");

    const balances = await client.request({
      command: "account_lines",
      account: senderWallet.address,
      peer: RLUSD_ISSUER,
    });

    if (balances.result.lines.length > 0) {
      const rlusdLine = balances.result.lines.find((l) => l.currency === "USD");
      if (rlusdLine) {
        console.log(`✅ Sender RLUSD balance: ${rlusdLine.balance} USD`);
      }
    } else {
      console.log("No RLUSD balance found");
    }

    // Also set up trust line for receiver if RECEIVER_WALLET_SEED exists
    const receiverSeed = process.env.RECEIVER_WALLET_SEED;
    if (receiverSeed) {
      console.log("\n4️⃣ Setting up RLUSD for receiver wallet...");

      const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);
      console.log(`Receiver Address: ${receiverWallet.address}`);

      // Trust line for receiver
      const receiverTrustTx = {
        TransactionType: "TrustSet",
        Account: receiverWallet.address,
        LimitAmount: {
          currency: "USD",
          issuer: RLUSD_ISSUER,
          value: "10000",
        },
      };

      const preparedReceiverTrust = await client.autofill(receiverTrustTx);
      const signedReceiverTrust = receiverWallet.sign(preparedReceiverTrust);
      const receiverTrustResult = await client.submitAndWait(
        signedReceiverTrust.tx_blob
      );

      if (
        receiverTrustResult.result.meta.TransactionResult === "tesSUCCESS" ||
        receiverTrustResult.result.meta.TransactionResult === "tecDUPLICATE"
      ) {
        console.log("✅ Receiver trust line ready!");
      }

      // Issue some RLUSD to receiver too
      const receiverPaymentTx = {
        TransactionType: "Payment",
        Account: issuerWallet.address,
        Destination: receiverWallet.address,
        Amount: {
          currency: "USD",
          issuer: RLUSD_ISSUER,
          value: "100",
        },
      };

      const preparedReceiverPayment = await client.autofill(receiverPaymentTx);
      const signedReceiverPayment = issuerWallet.sign(preparedReceiverPayment);
      const receiverPaymentResult = await client.submitAndWait(
        signedReceiverPayment.tx_blob
      );

      if (
        receiverPaymentResult.result.meta.TransactionResult === "tesSUCCESS"
      ) {
        console.log("✅ Issued 100 RLUSD to receiver!");
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ RLUSD Setup Complete!");
    console.log("=".repeat(50));
    console.log("\nYou can now run RLUSD streaming tests:");
    console.log("  node test-scripts/full-rlusd-streaming-test.js");
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.data) {
      console.error("   Details:", JSON.stringify(error.data, null, 2));
    }
  } finally {
    await client.disconnect();
  }
}

getRLUSDForTesting().catch(console.error);
