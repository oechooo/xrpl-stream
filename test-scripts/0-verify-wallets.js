/**
 * Test Script 0: Verify Wallets
 * 
 * Checks if your wallets are properly funded before creating a channel.
 */

const xrpl = require('xrpl');
const { getClient } = require('../src/utils/xrplClient');
require('dotenv').config();

async function verifyWallets() {
  console.log('🔍 Wallet Verification\n');
  console.log('='.repeat(60));
  
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!senderSeed || !receiverSeed) {
    console.error('\n❌ ERROR: Wallet seeds not found in .env!');
    console.log('\nPlease add to your .env file:');
    console.log('  SENDER_WALLET_SEED=sYourSenderSecretHere');
    console.log('  RECEIVER_WALLET_SEED=sYourReceiverSecretHere');
    console.log('\n📝 Get free wallets: https://xrpl.org/xrp-testnet-faucet.html');
    process.exit(1);
  }
  
  try {
    const client = await getClient();
    
    // Create wallets from seeds
    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);
    
    console.log('\n📋 Wallet Information:');
    console.log('-'.repeat(60));
    
    // Check sender
    console.log('\n👤 SENDER:');
    console.log(`   Address: ${senderWallet.address}`);
    console.log(`   Public Key: ${senderWallet.publicKey}`);
    
    try {
      const senderInfo = await client.request({
        command: 'account_info',
        account: senderWallet.address,
        ledger_index: 'validated'
      });
      
      const balance = parseInt(senderInfo.result.account_data.Balance) / 1000000;
      console.log(`   Balance: ${balance} XRP ✅`);
      
      if (balance < 60) {
        console.log(`   ⚠️  Warning: Balance is low! Need at least 60 XRP to create a 50 XRP channel.`);
        console.log(`   (50 XRP for channel + ~10 XRP reserve + fees)`);
      }
    } catch (error) {
      console.log(`   Balance: ❌ NOT FUNDED!`);
      console.log(`   Error: ${error.message}`);
      console.log(`\n   💡 Fund this address at: https://xrpl.org/xrp-testnet-faucet.html`);
      console.log(`   Or use a different wallet seed in .env`);
    }
    
    // Check receiver
    console.log('\n👤 RECEIVER:');
    console.log(`   Address: ${receiverWallet.address}`);
    
    try {
      const receiverInfo = await client.request({
        command: 'account_info',
        account: receiverWallet.address,
        ledger_index: 'validated'
      });
      
      const balance = parseInt(receiverInfo.result.account_data.Balance) / 1000000;
      console.log(`   Balance: ${balance} XRP ✅`);
    } catch (error) {
      console.log(`   Balance: ❌ NOT FUNDED!`);
      console.log(`   Error: ${error.message}`);
      console.log(`\n   💡 Fund this address at: https://xrpl.org/xrp-testnet-faucet.html`);
      console.log(`   Or use a different wallet seed in .env`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n📝 Next Steps:');
    console.log('   1. Make sure both wallets are funded (at least 60 XRP for sender)');
    console.log('   2. If not funded, visit: https://xrpl.org/xrp-testnet-faucet.html');
    console.log('   3. Then run: node test-scripts/1-create-channel.js');
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

verifyWallets();

