/**
 * Test Script 3: Generate and Validate Claims
 * 
 * The sender generates a signed claim, and the receiver validates it.
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY;

const channelId = process.argv[2];

if (!channelId) {
  console.error('❌ Usage: node 3-generate-claim.js <CHANNEL_ID>');
  process.exit(1);
}

async function testClaims() {
  console.log('🧪 Test 3: Generate and Validate Claims\n');
  console.log(`Channel ID: ${channelId}\n`);
  
  try {
    // 1. Get current status
    console.log('📊 Getting channel status...');
    const statusResponse = await axios.get(
      `${API_BASE}/stream/status`,
      {
        params: { channelId },
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    const duration = statusResponse.data.activeSession?.duration || 0;
    console.log(`✅ Channel is active for ${Math.floor(duration / 1000)} seconds\n`);
    
    // 2. Generate claim (sender side)
    console.log('1️⃣ SENDER: Generating signed claim...');
    const claimResponse = await axios.get(
      `${API_BASE}/stream/claim`,
      {
        params: { channelId },
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    const claim = claimResponse.data.claim;
    console.log('✅ Claim generated!');
    console.log(`   Amount: ${claim.amountXRP} XRP (${claim.amount} drops)`);
    console.log(`   Signature: ${claim.signature.substring(0, 40)}...`);
    console.log(`   Public Key: ${claim.publicKey}\n`);
    
    // 3. Validate claim (receiver side)
    console.log('2️⃣ RECEIVER: Validating the claim...');
    const validateResponse = await axios.post(
      `${API_BASE}/stream/validate`,
      {
        channelId: channelId,
        amount: claim.amount,
        signature: claim.signature,
        publicKey: claim.publicKey
      },
      {
        headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {}
      }
    );
    
    console.log('✅ Claim is VALID!');
    console.log(`   Previous Amount: ${validateResponse.data.validation.previousAmount} drops`);
    console.log(`   New Amount: ${claim.amount} drops`);
    console.log(`   Increment: ${validateResponse.data.validation.increment} drops\n`);
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS! Claim generated and validated');
    console.log('━'.repeat(60));
    
    console.log('\n💡 This claim can now be used to claim XRP on-chain!');
    console.log('   But it\'s more efficient to wait and accumulate more value.');
    console.log('\n📝 Try: Run this script again in a few seconds to see the amount increase!');
    console.log('📝 Next: When ready, run test 4 to finalize on-chain');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

testClaims();

