/**
 * Test Script 2: Start Streaming Session
 * 
 * This starts a streaming payment session for both sender and receiver.
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY;

// Get from command line argument or use default
const channelId = process.argv[2];

if (!channelId) {
  console.error('❌ Usage: node 2-start-streaming.js <CHANNEL_ID>');
  console.log('\nGet the channel ID from test script 1');
  process.exit(1);
}

async function testStartStreaming() {
  console.log('🧪 Test 2: Starting Streaming Sessions\n');
  console.log(`Channel ID: ${channelId}\n`);
  
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!senderSeed || !receiverSeed) {
    console.error('❌ Error: Wallet seeds not found in .env');
    process.exit(1);
  }
  
  try {
    const xrpl = require('xrpl');
    const senderWallet = xrpl.Wallet.fromSeed(senderSeed);
    
    // Start sender session
    console.log('1️⃣ Starting SENDER session...');
    const senderResponse = await axios.post(
      `${API_BASE}/stream/start`,
      {
        channelId: channelId,
        walletSeed: senderSeed,
        ratePerSecond: '10000', // 0.01 XRP per second
        role: 'sender'
      },
      {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    console.log('✅ Sender session started!');
    console.log(`   Rate: ${senderResponse.data.ratePerSecond} drops/sec (0.01 XRP/sec)`);
    console.log(`   Channel Balance: ${parseInt(senderResponse.data.channelBalance) / 1000000} XRP\n`);
    
    // Start receiver session
    console.log('2️⃣ Starting RECEIVER session...');
    const receiverResponse = await axios.post(
      `${API_BASE}/stream/start`,
      {
        channelId: channelId,
        publicKey: senderWallet.publicKey,
        role: 'receiver'
      },
      {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    console.log('✅ Receiver session started!\n');
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS! Both sessions are now active');
    console.log('━'.repeat(60));
    
    console.log('\n💡 The stream is now active and accumulating value!');
    console.log('   Every second = 0.01 XRP');
    console.log('\n📝 Next: Wait a few seconds, then run test 3 to generate claims');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testStartStreaming();

