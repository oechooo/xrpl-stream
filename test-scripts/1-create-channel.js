/**
 * Test Script 1: Create a Payment Channel
 * 
 * This script creates a payment channel on the XRPL testnet.
 * You need to fill in your wallet seeds from the testnet faucet.
 */

const { createChannel } = require('../contracts/createChannel');
const xrpl = require('xrpl');
require('dotenv').config();

async function testCreateChannel() {
  console.log('🧪 Test 1: Creating Payment Channel\n');
  
  // Get wallet seeds from .env
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!senderSeed || !receiverSeed) {
    console.error('❌ Error: Please set SENDER_WALLET_SEED and RECEIVER_WALLET_SEED in .env');
    console.log('\nGet free testnet wallets at: https://xrpl.org/xrp-testnet-faucet.html');
    process.exit(1);
  }
  
  try {
    // Create wallets from seeds
    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    const receiverWallet = xrpl.Wallet.fromSeed(receiverSeed);
    
    console.log(`Sender Address: ${senderWallet.address}`);
    console.log(`Receiver Address: ${receiverWallet.address}\n`);
    
    // Create channel with 20 XRP (reduced for testing)
    const amount = '20000000'; // 20 XRP in drops
    const settleDelay = 3600; // 1 hour
    
    console.log('Creating channel...');
    const result = await createChannel(
      senderWallet,
      receiverWallet.address,
      amount,
      settleDelay
    );
    
    console.log('\n✅ SUCCESS!');
    console.log('━'.repeat(60));
    console.log(`Channel ID: ${result.channelId}`);
    console.log(`Transaction Hash: ${result.transactionHash}`);
    console.log(`Amount Locked: ${parseInt(amount) / 1000000} XRP`);
    console.log(`Settle Delay: ${settleDelay} seconds (${settleDelay / 3600} hour)`);
    console.log('━'.repeat(60));
    
    console.log('\n💡 SAVE THIS CHANNEL ID! You\'ll need it for the next tests.');
    console.log(`\n📝 Next: Run test 2 to start streaming with this channel ID`);
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    process.exit(1);
  }
}

// Run the test
testCreateChannel();

