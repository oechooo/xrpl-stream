/**
 * Test Script 4: Finalize Stream On-Chain
 * 
 * The receiver submits the final claim to the XRPL and receives the XRP.
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY;

const channelId = process.argv[2];

if (!channelId) {
  console.error('❌ Usage: node 4-finalize-stream.js <CHANNEL_ID>');
  process.exit(1);
}

async function testFinalize() {
  console.log('🧪 Test 4: Finalize Stream On-Chain\n');
  console.log(`Channel ID: ${channelId}\n`);
  
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!receiverSeed) {
    console.error('❌ Error: RECEIVER_WALLET_SEED not found in .env');
    process.exit(1);
  }
  
  try {
    // 1. Check current status
    console.log('📊 Checking channel status...');
    const statusResponse = await axios.get(
      `${API_BASE}/stream/status`,
      {
        params: { channelId },
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    const stats = statusResponse.data.localStats;
    if (stats) {
      console.log(`✅ Current streamed amount: ${stats.lastValidXRP} XRP`);
      console.log(`   Unclaimed: ${stats.unclaimedXRP} XRP\n`);
    }
    
    // 2. Finalize the claim on-chain
    console.log('💎 Finalizing stream on XRPL blockchain...');
    console.log('   This will submit the transaction and claim the XRP...\n');
    
    const finalizeResponse = await axios.post(
      `${API_BASE}/stream/finalize`,
      {
        channelId: channelId,
        receiverWalletSeed: receiverSeed
      },
      {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    const result = finalizeResponse.data.result;
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS! Stream finalized on-chain!');
    console.log('━'.repeat(60));
    console.log(`\n💰 Amount Claimed: ${result.claimedAmount} drops`);
    console.log(`💰 XRP Received: ${parseInt(result.claimedAmount) / 1000000} XRP`);
    console.log(`\n🔗 Transaction Hash: ${result.transactionHash}`);
    console.log(`📦 Ledger Index: ${result.ledgerIndex}`);
    
    console.log('\n🎉 The XRP has been transferred to the receiver\'s account!');
    console.log('\n🔍 Verify on testnet explorer:');
    console.log(`   https://testnet.xrpl.org/transactions/${result.transactionHash}`);
    
    console.log('\n📝 Next: Run test 5 to close the channel completely');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testFinalize();

