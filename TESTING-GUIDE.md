# RLUSD Streaming Testing Guide

# PREREQUISITES

1. Environment Setup:

   ```bash
   # Create .env file
   SENDER_WALLET_SEED=sEdV19BLfeQeKdEXyYA4NhjPJe6XBfG  # Your testnet wallet
   RECEIVER_WALLET_SEED=sEd7rBGm5kxzFXZQjDQA8QHJe9XBfG  # Your testnet wallet
   XRPL_NETWORK=testnet
   ```

2. Get Testnet Wallets:

   - Visit: https://xrpl.org/xrp-testnet-faucet.html
   - Get 2 wallets with XRP for transaction fees
   - Save the seeds to .env file

3. **CRITICAL: Get RLUSD Balance**
   Problem: You need RLUSD tokens on testnet for the sender wallet

   Options:
   a) Check if RLUSD testnet faucet exists
   b) Use testnet DEX to swap XRP → RLUSD (if available)
   c) For development: Mock RLUSD testing (see below)

4. Install Dependencies:
   ```bash
   npm install
   ```

# TESTING STEPS

## Step 1: Start the Server

```bash
npm start
# Server runs on http://localhost:3000
```

## Step 2: Verify API Endpoints

```bash
# Check API documentation
curl http://localhost:3000/

# Should show both XRP and RLUSD endpoints
```

## Step 3: Test Backward Compatibility

```bash
# Run compatibility test
node test-scripts/backward-compatibility-test.js

# Should show:
# ✅ Original XRP functions work unchanged
# ✅ New RLUSD functions work independently
```

## Step 4: Test RLUSD Streaming (Real RLUSD)

```bash
# Test 1: Create RLUSD stream
node test-scripts/1-create-rlusd-stream.js

# Test 2: Run streaming demo
node test-scripts/2-rlusd-streaming-demo.js

# API Integration test
node test-scripts/api-integration-demo.js
```

## Step 5: Test via API Calls

```bash
# Start RLUSD stream
curl -X POST http://localhost:3000/api/rlusd/stream/start \
  -H "Content-Type: application/json" \
  -d '{
    "senderSeed": "sEdV19BLfeQeKdEXyYA4NhjPJe6XBfG",
    "receiverAddress": "rReceiver123...",
    "totalAmount": "5.00",
    "duration": 300,
    "intervalSeconds": 60
  }'

# Execute payment (use sessionKey from start response)
curl -X POST http://localhost:3000/api/rlusd/stream/payment \
  -H "Content-Type: application/json" \
  -d '{
    "sessionKey": "rSender123...-rReceiver123..."
  }'

# Check status
curl http://localhost:3000/api/rlusd/stream/status/sessionKey
```

# MOCK TESTING (If No RLUSD Available)

If you can't get real RLUSD tokens, modify the test for development:

1. Create mock-rlusd-test.js:

```javascript
// Mock version that simulates RLUSD without real tokens
const config = require("../config");

// Override RLUSD config to use fake issuer
config.currency.issuer = "rMockRLUSDIssuer123456789"; // Fake issuer

// Test the API endpoints without real transactions
async function mockTest() {
  console.log("🧪 Mock RLUSD Testing (No Real Transactions)");

  // Test API route parsing and validation
  const mockRequest = {
    senderSeed: process.env.SENDER_WALLET_SEED,
    receiverAddress: "rReceiver123",
    totalAmount: "10.00",
    duration: 60,
    intervalSeconds: 10,
  };

  // Import and test route handlers directly
  const { createDirectRLUSDStream } = require("../contracts/createRLUSDStream");

  try {
    const result = createDirectRLUSDStream(
      mockWallet,
      mockRequest.receiverAddress,
      mockRequest.totalAmount,
      6 // 6 payments
    );

    console.log("✅ RLUSD stream configuration works");
    console.log("Stream setup:", result);
  } catch (error) {
    console.error("❌ Mock test failed:", error.message);
  }
}

mockTest();
```

# EXPECTED TEST RESULTS

✅ Successful Test Results:

- Server starts on port 3000
- API documentation shows both XRP and RLUSD routes
- Backward compatibility test passes
- RLUSD stream creation returns sessionKey
- RLUSD payments execute with transaction hashes
- Status endpoint shows payment progress

❌ Common Failures:

- "Insufficient RLUSD balance" - Need RLUSD tokens
- "Trust line required" - Receiver needs to trust RLUSD issuer
- "Invalid issuer" - Wrong RLUSD issuer address
- "Connection failed" - XRPL network issues

# TROUBLESHOOTING

1. No RLUSD Balance:

   ```
   Error: "Insufficient funds" or "Currency not available"
   Solution: Get RLUSD from testnet source or use mock testing
   ```

2. Trust Line Issues:

   ```
   Error: "No trust line to issuer"
   Solution: Receiver must create trust line to RLUSD issuer first
   ```

3. Wrong Issuer Address:

   ```
   Error: "Invalid currency issuer"
   Solution: Verify RLUSD issuer address in config.js
   ```

4. XRP Payment Channel Tests Still Work:
   ```bash
   # Verify original XRP tests unchanged
   node test-scripts/1-create-channel.js  # Should work
   node test-scripts/2-start-streaming.js # Should work
   ```

# VALIDATION CHECKLIST

□ Server starts successfully
□ API root shows both XRP and RLUSD endpoints
□ Backward compatibility test passes
□ RLUSD stream creation works (mock or real)
□ RLUSD payment execution works (mock or real)
□ Status endpoints return correct data
□ Original XRP tests still work unchanged
□ No route conflicts between /api/stream and /api/rlusd

# PRODUCTION TESTING

For production testing with real RLUSD:

1. Use XRPL mainnet endpoints
2. Ensure sender has real RLUSD balance
3. Verify receiver trusts RLUSD issuer
4. Monitor transaction fees and costs
5. Test with small amounts first

# MONITORING TRANSACTIONS

View transactions on XRPL explorer:

- Testnet: https://testnet.xrpl.org/
- Mainnet: https://livenet.xrpl.org/

Search by:

- Account addresses (sender/receiver)
- Transaction hashes (from API responses)
- Look for Payment transaction types with RLUSD amounts
