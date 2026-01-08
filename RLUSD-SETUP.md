# RLUSD Streaming Setup Guide

## 🚨 IMPORTANT: Payment Channel Limitation

**XRPL Payment Channels only support XRP, not RLUSD or other issued currencies.** This is a fundamental XRPL protocol limitation.

## 🔄 Alternative Solutions for RLUSD Streaming

This implementation provides two alternatives for RLUSD streaming:

### 1. **Direct Payment Streaming** (Recommended)

- Uses regular Payment transactions at intervals
- Simple and reliable
- Higher transaction costs (fees per payment)
- Real-time transfers

### 2. **Escrow-Based Streaming** (Future)

- Uses EscrowCreate with conditional releases
- Lower transaction costs
- More complex implementation
- Better for larger amounts

## 🛠️ Setup Instructions

### Prerequisites

1. **XRPL Testnet Wallets**:

   - Get wallets from: https://xrpl.org/xrp-testnet-faucet.html
   - Need XRP for transaction fees
   - **Need RLUSD balance for streaming**

2. **RLUSD Test Balance**:

   ```bash
   # You'll need to obtain test RLUSD tokens
   # Check RLUSD documentation or use DEX to swap XRP → RLUSD
   ```

3. **Environment Setup**:
   ```bash
   # .env file
   SENDER_WALLET_SEED=your_sender_seed
   RECEIVER_WALLET_SEED=your_receiver_seed
   XRPL_NETWORK=testnet
   ```

### Configuration Changes Made

1. **[config.js](../config.js)**: Added RLUSD currency configuration
2. **[converters.js](../src/utils/converters.js)**: Updated for RLUSD calculations
3. **[createRLUSDStream.js](../contracts/createRLUSDStream.js)**: New contract for RLUSD
4. **Test scripts**: New RLUSD-focused test scripts

## 🧪 Testing RLUSD Streaming

### Test 1: Setup RLUSD Stream

```bash
node test-scripts/1-create-rlusd-stream.js
```

**What it does**: Sets up streaming parameters and sends first payment

### Test 2: Run Streaming Demo

```bash
node test-scripts/2-rlusd-streaming-demo.js
```

**What it does**: Demonstrates continuous RLUSD streaming over time

## ⚙️ Technical Implementation

### Key Changes from XRP Version:

1. **Currency Format**:

   ```javascript
   // XRP (drops)
   amount: "1000000"  // 1 XRP

   // RLUSD (currency object)
   amount: {
     currency: "USD",
     issuer: "rMxCVaJYp6WDH2mBPk5zLGwxr1g2Ur1qWn",
     value: "1.00"
   }
   ```

2. **Rate Calculations**:

   ```javascript
   // Old: drops per second
   rate: "1000"; // 0.001 XRP/second

   // New: RLUSD per second
   rate: "0.05"; // 0.05 RLUSD/second
   ```

3. **Transaction Types**:

   ```javascript
   // XRP: PaymentChannelCreate
   TransactionType: "PaymentChannelCreate";

   // RLUSD: Direct Payment
   TransactionType: "Payment";
   ```

## 💰 Cost Comparison

| Method       | Transaction Fee                   | Frequency     | Total Cost             |
| ------------ | --------------------------------- | ------------- | ---------------------- |
| XRP Channels | 1 fee (create) + 1 fee (finalize) | 2 total       | ~0.00002 XRP           |
| RLUSD Direct | 1 fee per payment                 | Every payment | 0.00001 XRP × payments |

**Example**: Streaming 10 RLUSD over 60 seconds (12 payments):

- Channel method: Not available for RLUSD
- Direct method: 12 × 0.00001 = 0.00012 XRP in fees

## 🔍 Monitoring

Check transactions on XRPL testnet explorer:

```
https://testnet.xrpl.org/accounts/{address}
```

## 🚨 Important Notes

1. **RLUSD Balance**: Sender must have sufficient RLUSD balance
2. **XRP for Fees**: Both sender and receiver need XRP for transaction fees
3. **Rate Limits**: Be mindful of XRPL rate limits (1000 tx/day on testnet)
4. **Precision**: RLUSD uses 2 decimal places (cents precision)
5. **Issuer Trust**: Receiver must trust the RLUSD issuer

## 🔧 Production Considerations

1. **Error Handling**: Implement robust retry logic
2. **Rate Limiting**: Respect XRPL rate limits
3. **Balance Monitoring**: Check balances before each payment
4. **Fee Management**: Monitor XRP balance for fees
5. **Trust Lines**: Ensure proper RLUSD trust line setup

## 📝 Development Notes

- Payment channels are only for XRP (protocol limitation)
- This implementation is a workaround using direct payments
- Future XRPL updates may add issued currency support to channels
- Consider using AMM or DEX for XRP↔RLUSD conversions if needed
