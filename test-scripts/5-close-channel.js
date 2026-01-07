/**
 * Test Script 5: Close Payment Channel
 * 
 * Closes the payment channel completely and returns remaining XRP to sender.
 */

const { closeChannel } = require('../contracts/claimChannel');
const xrpl = require('xrpl');
require('dotenv').config();

const channelId = process.argv[2];

if (!channelId) {
  console.error('❌ Usage: node 5-close-channel.js <CHANNEL_ID>');
  process.exit(1);
}

async function testCloseChannel() {
  console.log('🧪 Test 5: Close Payment Channel\n');
  console.log(`Channel ID: ${channelId}\n`);
  
  const senderSeed = process.env.SENDER_WALLET_SEED;
  
  if (!senderSeed) {
    console.error('❌ Error: SENDER_WALLET_SEED not found in .env');
    process.exit(1);
  }
  
  try {
    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    
    console.log('🔒 Closing payment channel...');
    console.log('   This will return any remaining XRP to the sender.\n');
    
    const result = await closeChannel(senderWallet, channelId);
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS! Channel closed');
    console.log('━'.repeat(60));
    console.log(`\n🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`📦 Ledger Index: ${result.ledgerIndex}`);
    console.log(`👤 Closed By: ${result.closedBy}`);
    
    console.log('\n✅ The payment channel is now closed!');
    console.log('   Any remaining XRP has been returned to the sender.');
    
    console.log('\n🔍 Verify on testnet explorer:');
    console.log(`   https://testnet.xrpl.org/transactions/${result.transactionHash}`);
    
    console.log('\n🎉 Test sequence complete!');
    console.log('\n💡 You can now create a new channel and start over with test 1.');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    process.exit(1);
  }
}

testCloseChannel();

