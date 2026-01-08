# 🧪 XRPL Streaming Payments - Test Scripts

Complete end-to-end test scripts for the streaming payment system.

## 📋 Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure .env:**
   - Get two testnet wallets from: https://xrpl.org/xrp-testnet-faucet.html
   - Add the secrets to `.env`:
     ```env
     SENDER_WALLET_SEED=sXXXXXXXXXXXXXXXXXXXXXXXXXXX
     RECEIVER_WALLET_SEED=sYYYYYYYYYYYYYYYYYYYYYYYYYYY
     ```

3. **Start the server:**
   ```bash
   npm start
   ```

## 🚀 Test Sequence

Run these scripts in order:

### 1️⃣ Create Payment Channel
```bash
node test-scripts/1-create-channel.js
```
**What it does:** Creates a payment channel on XRPL and locks 50 XRP

**Expected output:** Channel ID (save this!)

---

### 2️⃣ Start Streaming
```bash
node test-scripts/2-start-streaming.js <CHANNEL_ID>
```
**What it does:** Starts streaming sessions for both sender and receiver

**Rate:** 0.01 XRP per second

---

### 3️⃣ Generate & Validate Claims
```bash
node test-scripts/3-generate-claim.js <CHANNEL_ID>
```
**What it does:** 
- Sender generates a signed claim
- Receiver validates the signature
- Shows accumulated value

**Try:** Run this multiple times to see the amount increase!

---

### 4️⃣ Finalize On-Chain
```bash
node test-scripts/4-finalize-stream.js <CHANNEL_ID>
```
**What it does:** Submits the claim to XRPL and transfers XRP to receiver

**Result:** XRP appears in receiver's account

---

### 5️⃣ Close Channel
```bash
node test-scripts/5-close-channel.js <CHANNEL_ID>
```
**What it does:** Closes the channel and returns remaining XRP to sender

**Result:** Channel is permanently closed

---

### 6️⃣ Machine-to-Machine Demo (Complete End-to-End)
```bash
node test-scripts/6-m2m-streaming-demo.js
```
**What it does:** 
- Creates Consumer and Supplier "machines"
- Consumer needs work done, Supplier provides compute services
- Consumer creates payment channel automatically
- Supplier does work in increments
- Consumer verifies work and pays incrementally
- Payments only flow when work is verified
- Finalizes payment on-chain at the end

**No arguments needed!** This script handles the entire flow automatically.

**Perfect for demonstrating:**
- IoT payment scenarios
- Pay-per-use compute services
- API call billing
- Machine learning inference payments
- Any M2M micropayment use case

---

## 🎮 Quick Test (All in One)

```bash
# 1. Create channel (save the channel ID from output)
node test-scripts/1-create-channel.js

# 2. Start streaming (replace YOUR_CHANNEL_ID)
node test-scripts/2-start-streaming.js YOUR_CHANNEL_ID

# 3. Wait 10 seconds, then generate claim
timeout 10
node test-scripts/3-generate-claim.js YOUR_CHANNEL_ID

# 4. Run claim again to see it increase
node test-scripts/3-generate-claim.js YOUR_CHANNEL_ID

# 5. Finalize (claim XRP on-chain)
node test-scripts/4-finalize-stream.js YOUR_CHANNEL_ID

# 6. Close channel
node test-scripts/5-close-channel.js YOUR_CHANNEL_ID
```

## 🌐 Browser Testing

You can also test using the UI:

1. Open: http://localhost:3000
2. Use the API endpoints listed on the page
3. Test with tools like Postman or curl

## 🔍 Verify on Blockchain

After each on-chain transaction, verify on the testnet explorer:
```
https://testnet.xrpl.org/transactions/<TRANSACTION_HASH>
```

## 💡 Tips

- **Wait between claims:** The longer you wait, the more value accumulates
- **Multiple claims:** You can generate many claims off-chain (zero fees!)
- **Only finalize when ready:** Each finalization costs a small XRPL transaction fee
- **Monitor balances:** Check sender/receiver balances on the explorer

## ❓ Troubleshooting

**"Channel not found"**
- Make sure you created the channel first (test 1)
- Use the correct channel ID

**"No active stream found"**
- Start the streaming sessions first (test 2)

**"Authentication failed"**
- If API_KEY is set in .env, include it in requests

## 🎓 What You're Learning

1. **Off-chain streaming:** Claims are signed off-chain (zero fees)
2. **Cryptographic signatures:** Each claim is cryptographically secure
3. **Accumulating value:** Value builds up over time automatically
4. **On-chain finalization:** Only finalize when you want to actually transfer XRP
5. **Channel lifecycle:** Create → Stream → Claim → Close

Enjoy testing! 🚀

