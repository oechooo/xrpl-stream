/**
 * Issue RLUSD tokens from issuer to sender wallet
 * Run this after setup-issuer.js
 */
const xrpl = require("xrpl");
require("dotenv").config();

async function issueRLUSD() {
  console.log("💵 Issuing RLUSD Tokens\n");

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  console.log("✅ Connected to XRPL Testnet\n");

  const issuerSeed = process.env.RLUSD_ISSUER_SEED;
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;

  if (!issuerSeed) {
    console.error("❌ Missing RLUSD_ISSUER_SEED in .env");
    console.error("   Run: node test-scripts/setup-issuer.js first");
    process.exit(1);
  }

  if (!senderSeed) {
    console.error("❌ Missing SENDER_WALLET_SEED in .env");
    process.exit(1);
  }

  const issuerWallet = xrpl.Wallet.fromSeed(issuerSeed);
  const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
  const receiverWallet = receiverSeed
    ? xrpl.Wallet.fromSeed(receiverSeed)
    : null;

  console.log(`Issuer:   ${issuerWallet.address}`);
  console.log(`Sender:   ${senderWallet.address}`);
  if (receiverWallet) {
    console.log(`Receiver: ${receiverWallet.address}`);
  }
  console.log();

  try {
    // Step 1: Create trustline from sender to issuer
    console.log("1️⃣ Creating trustline from SENDER to issuer...");

    const trustLineTx = {
      TransactionType: "TrustSet",
      Account: senderWallet.address,
      LimitAmount: {
        currency: "USD",
        issuer: issuerWallet.address,
        value: "10000", // Trust up to 10,000 RLUSD
      },
    };

    const prepared1 = await client.autofill(trustLineTx);
    const signed1 = senderWallet.sign(prepared1);
    const result1 = await client.submitAndWait(signed1.tx_blob);

    if (result1.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("   ✅ Sender trustline created!\n");
    } else {
      console.log(`   ⚠️ Result: ${result1.result.meta.TransactionResult}\n`);
    }

    // Step 2: Create trustline from receiver to issuer (if receiver exists)
    if (receiverWallet) {
      console.log("2️⃣ Creating trustline from RECEIVER to issuer...");

      const trustLineTx2 = {
        TransactionType: "TrustSet",
        Account: receiverWallet.address,
        LimitAmount: {
          currency: "USD",
          issuer: issuerWallet.address,
          value: "10000",
        },
      };

      const prepared2 = await client.autofill(trustLineTx2);
      const signed2 = receiverWallet.sign(prepared2);
      const result2 = await client.submitAndWait(signed2.tx_blob);

      if (result2.result.meta.TransactionResult === "tesSUCCESS") {
        console.log("   ✅ Receiver trustline created!\n");
      } else {
        console.log(`   ⚠️ Result: ${result2.result.meta.TransactionResult}\n`);
      }
    }

    // Step 3: Issue RLUSD from issuer to sender
    console.log("3️⃣ Issuing 1000 RLUSD to sender...");

    const issueTx = {
      TransactionType: "Payment",
      Account: issuerWallet.address,
      Destination: senderWallet.address,
      Amount: {
        currency: "USD",
        issuer: issuerWallet.address,
        value: "1000", // Issue 1000 RLUSD
      },
    };

    const prepared3 = await client.autofill(issueTx);
    const signed3 = issuerWallet.sign(prepared3);
    const result3 = await client.submitAndWait(signed3.tx_blob);

    if (result3.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("   ✅ 1000 RLUSD issued to sender!\n");
    } else {
      console.log(`   ❌ Failed: ${result3.result.meta.TransactionResult}\n`);
    }

    // Step 4: Verify balances
    console.log("4️⃣ Verifying RLUSD balances...\n");

    const senderLines = await client.request({
      command: "account_lines",
      account: senderWallet.address,
      ledger_index: "validated",
    });

    const senderRLUSD = senderLines.result.lines.find(
      (line) => line.currency === "USD" && line.account === issuerWallet.address
    );

    if (senderRLUSD) {
      console.log(`   Sender RLUSD balance: ${senderRLUSD.balance} USD`);
    } else {
      console.log("   ❌ No RLUSD balance found for sender");
    }

    if (receiverWallet) {
      const receiverLines = await client.request({
        command: "account_lines",
        account: receiverWallet.address,
        ledger_index: "validated",
      });

      const receiverRLUSD = receiverLines.result.lines.find(
        (line) =>
          line.currency === "USD" && line.account === issuerWallet.address
      );

      if (receiverRLUSD) {
        console.log(`   Receiver RLUSD balance: ${receiverRLUSD.balance} USD`);
      } else {
        console.log("   Receiver RLUSD balance: 0 USD (trustline ready)");
      }
    }

    console.log("\n═".repeat(50));
    console.log("🎉 RLUSD ISSUANCE COMPLETE!\n");
    console.log("You can now run the RLUSD streaming tests:");
    console.log("   node test-scripts/full-rlusd-streaming-test.js");
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.data) {
      console.error("   Details:", JSON.stringify(error.data, null, 2));
    }
  } finally {
    await client.disconnect();
  }
}

issueRLUSD().catch(console.error);
