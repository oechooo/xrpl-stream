# XRPL Streaming Test Scripts

## 🎯 **Quick Start**

### **Test Without Any Tokens** (Recommended first)
```bash
node test-scripts/logic-only-tests.js
# OR
node test-scripts/run-all-tests.js --logic-only
```

### **Check What You Have**
```bash
node test-scripts/check-balances.js
```

### **Test Everything** (requires XRP + RLUSD)
```bash
# Start server first
npm start

# In another terminal:
node test-scripts/run-all-tests.js
```

## 📁 **Test File Structure**

### **Core Tests**
- **`logic-only-tests.js`** - All calculations & formatting (no tokens needed)
- **`full-xrp-streaming-test.js`** - Complete XRP Payment Channel test
- **`full-rlusd-streaming-test.js`** - Complete RLUSD direct payment test
- **`run-all-tests.js`** - Master test runner with options

### **Utilities**
- **`check-balances.js`** - Check wallet balances and RLUSD availability
- **`get-rlusd.js`** - Help acquire RLUSD tokens for testing
- **`backward-compatibility-test.js`** - Verify XRP functions still work

### **Legacy XRP Tests** (original XRP-only system)
- **`0-verify-wallets.js`** - Check XRP wallet setup
- **`1-create-channel.js`** - Create XRP Payment Channel
- **`2-start-streaming.js`** - Start XRP streaming
- **`3-generate-claim.js`** - Generate channel claims
- **`4-finalize-stream.js`** - Finalize XRP stream
- **`5-close-channel.js`** - Close XRP channel
- **`6-m2m-streaming-demo.js`** - Machine-to-machine demo

## 🚀 **Test Options**

### **Master Test Runner**
```bash
# All tests (XRP + RLUSD)
node test-scripts/run-all-tests.js

# Logic only (no tokens needed)
node test-scripts/run-all-tests.js --logic-only

# XRP only (needs XRP balance)
node test-scripts/run-all-tests.js --xrp-only

# RLUSD only (needs RLUSD balance)
node test-scripts/run-all-tests.js --rlusd-only
```

### **Individual Tests**
```bash
# Pure logic (no network)
node test-scripts/logic-only-tests.js

# Check balances (network, no transactions)
node test-scripts/check-balances.js

# Comprehensive XRP test (needs XRP)
node test-scripts/full-xrp-streaming-test.js

# Comprehensive RLUSD test (needs RLUSD)
node test-scripts/full-rlusd-streaming-test.js

# Backward compatibility
node test-scripts/backward-compatibility-test.js
```

## 🔧 **Requirements**

### **For Logic Tests** (no requirements)
- ✅ No tokens needed
- ✅ No network needed  
- ✅ Tests all math and formatting

### **For Network Tests**
- ✅ Server running (`npm start`)
- ✅ Valid wallet seeds in `.env`
- ✅ XRP balance (for fees and XRP tests)
- ✅ RLUSD balance (for RLUSD tests only)

## 📊 **What Each Test Covers**

### **Logic Tests**
- XRP ↔ Drops conversions
- USD ↔ Cents conversions  
- Rate calculations
- Formatting functions
- Edge cases and validation

### **XRP Tests**
- Payment Channel creation
- Channel funding
- Claim generation and validation
- Stream finalization
- Channel closure

### **RLUSD Tests**
- Direct payment streaming
- Session management
- Payment execution
- Pause/resume functionality
- Progress tracking

All comprehensive tests include error handling, cleanup, and detailed reporting!