/**
 * Check wallet balances and available currencies
 */
const xrpl = require("xrpl");
require("dotenv").config();

async function checkBalances() {
  console.log("🔍 Checking Wallet Balances\n");

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;

  if (!senderSeed || !receiverSeed) {
    console.error("❌ Error: Missing wallet seeds in .env");
    process.exit(1);
  }

  const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
  const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);

  console.log(`Sender Address: ${senderWallet.address}`);
  console.log(`Receiver Address: ${receiverWallet.address}\n`);

  try {
    // Get sender balance
    console.log("📊 SENDER WALLET:");
    const senderInfo = await client.request({
      command: "account_info",
      account: senderWallet.address,
      ledger_index: "validated",
    });

    const senderXRP = xrpl.dropsToXrp(senderInfo.result.account_data.Balance);
    console.log(`  XRP Balance: ${senderXRP} XRP`);

    // Check for RLUSD or other currencies
    const senderLines = await client.request({
      command: "account_lines",
      account: senderWallet.address,
      ledger_index: "validated",
    });

    if (senderLines.result.lines.length > 0) {
      console.log("  Other Currencies:");
      senderLines.result.lines.forEach((line) => {
        console.log(`    ${line.balance} ${line.currency} (${line.account})`);
      });
    } else {
      console.log("  ❌ No RLUSD or other currencies found");
      console.log("  ⚠️  RLUSD streaming will fail without RLUSD balance");
    }

    console.log("\n📊 RECEIVER WALLET:");
    const receiverInfo = await client.request({
      command: "account_info",
      account: receiverWallet.address,
      ledger_index: "validated",
    });

    const receiverXRP = xrpl.dropsToXrp(
      receiverInfo.result.account_data.Balance
    );
    console.log(`  XRP Balance: ${receiverXRP} XRP`);

    const receiverLines = await client.request({
      command: "account_lines",
      account: receiverWallet.address,
      ledger_index: "validated",
    });

    if (receiverLines.result.lines.length > 0) {
      console.log("  Other Currencies:");
      receiverLines.result.lines.forEach((line) => {
        console.log(`    ${line.balance} ${line.currency} (${line.account})`);
      });
    } else {
      console.log("  No other currencies");
    }

    console.log("\n🎯 RLUSD TESTING STATUS:");
    const hasRLUSD = senderLines.result.lines.some(
      (line) => line.currency === "USD" || line.currency.includes("USD")
    );

    if (hasRLUSD) {
      console.log("  ✅ Ready for RLUSD testing!");
    } else {
      console.log("  ❌ Cannot test RLUSD - no RLUSD balance");
      console.log("\n  🛠️  TO GET RLUSD FOR TESTING:");
      console.log("  1. Use XRPL DEX to trade XRP → RLUSD");
      console.log("  2. Find a testnet RLUSD issuer");
      console.log("  3. Use test XRP streaming instead");
    }
  } catch (error) {
    console.error("❌ Error checking balances:", error.message);
  } finally {
    await client.disconnect();
  }
}

checkBalances().catch(console.error);
