/**
 * Setup RLUSD Issuer Account
 * Configures an account to be a token issuer with proper flags
 */
const xrpl = require("xrpl");
require("dotenv").config();

// AccountSet Flags
const AccountSetFlags = {
  // Enable rippling on trust lines (required for issuer)
  asfDefaultRipple: 8,
  // Disable requiring authorization for trust lines
  asfRequireAuth: 2,
};

async function setupIssuer() {
  console.log("🏦 Setting Up RLUSD Issuer Account\n");

  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  console.log("✅ Connected to XRPL Testnet\n");

  // Use a separate issuer seed, or create a new wallet
  let issuerSeed = process.env.RLUSD_ISSUER_SEED;
  let issuerWallet;

  if (!issuerSeed) {
    console.log("📝 No RLUSD_ISSUER_SEED found in .env");
    console.log("🆕 Creating a new issuer wallet...\n");

    // Fund a new wallet from testnet faucet
    const fundResult = await client.fundWallet();
    issuerWallet = fundResult.wallet;

    console.log("✅ New issuer wallet created and funded!");
    console.log(`   Address: ${issuerWallet.address}`);
    console.log(`   Seed: ${issuerWallet.seed}`);
    console.log(`   Balance: ${fundResult.balance} XRP\n`);
    console.log("⚠️  SAVE THIS SEED! Add to your .env file:");
    console.log(`   RLUSD_ISSUER_SEED=${issuerWallet.seed}`);
    console.log(`   RLUSD_ISSUER=${issuerWallet.address}\n`);
  } else {
    issuerWallet = xrpl.Wallet.fromSeed(issuerSeed);
    console.log(`Using existing issuer: ${issuerWallet.address}\n`);
  }

  try {
    // Step 1: Enable DefaultRipple
    console.log("1️⃣ Enabling DefaultRipple flag...");

    const enableRippleTx = {
      TransactionType: "AccountSet",
      Account: issuerWallet.address,
      SetFlag: AccountSetFlags.asfDefaultRipple,
    };

    const prepared1 = await client.autofill(enableRippleTx);
    const signed1 = issuerWallet.sign(prepared1);
    const result1 = await client.submitAndWait(signed1.tx_blob);

    if (result1.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("   ✅ DefaultRipple enabled!\n");
    } else {
      console.log(`   ⚠️ Result: ${result1.result.meta.TransactionResult}\n`);
    }

    // Step 2: Disable RequireAuth (clear the flag)
    console.log("2️⃣ Disabling RequireAuth flag (for easy testing)...");

    const disableAuthTx = {
      TransactionType: "AccountSet",
      Account: issuerWallet.address,
      ClearFlag: AccountSetFlags.asfRequireAuth,
    };

    const prepared2 = await client.autofill(disableAuthTx);
    const signed2 = issuerWallet.sign(prepared2);
    const result2 = await client.submitAndWait(signed2.tx_blob);

    if (result2.result.meta.TransactionResult === "tesSUCCESS") {
      console.log("   ✅ RequireAuth disabled!\n");
    } else {
      console.log(`   ⚠️ Result: ${result2.result.meta.TransactionResult}\n`);
    }

    // Step 3: Verify account settings
    console.log("3️⃣ Verifying account settings...");

    const accountInfo = await client.request({
      command: "account_info",
      account: issuerWallet.address,
      ledger_index: "validated",
    });

    const flags = accountInfo.result.account_data.Flags;

    // Check flags (lsfDefaultRipple = 0x00800000 = 8388608)
    const lsfDefaultRipple = 0x00800000;
    const lsfRequireAuth = 0x00040000;

    const hasDefaultRipple = (flags & lsfDefaultRipple) !== 0;
    const hasRequireAuth = (flags & lsfRequireAuth) !== 0;

    console.log(
      `   DefaultRipple: ${hasDefaultRipple ? "✅ Enabled" : "❌ Disabled"}`
    );
    console.log(
      `   RequireAuth: ${hasRequireAuth ? "⚠️ Enabled" : "✅ Disabled"}`
    );
    console.log(`   Raw Flags: ${flags}\n`);

    // Summary
    console.log("═".repeat(50));
    console.log("🎉 ISSUER SETUP COMPLETE!\n");
    console.log("Add these to your .env file:");
    console.log("─".repeat(50));
    console.log(`RLUSD_ISSUER_SEED=${issuerWallet.seed}`);
    console.log(`RLUSD_ISSUER=${issuerWallet.address}`);
    console.log("─".repeat(50));
    console.log("\nNext steps:");
    console.log("1. Add the above to your .env file");
    console.log("2. Run: node test-scripts/issue-rlusd.js");
    console.log("   (to issue RLUSD tokens to your sender wallet)");
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.data) {
      console.error("   Details:", JSON.stringify(error.data, null, 2));
    }
  } finally {
    await client.disconnect();
  }
}

setupIssuer().catch(console.error);
