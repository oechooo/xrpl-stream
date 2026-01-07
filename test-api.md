# 🧪 API Testing with curl

Complete curl command reference for testing the XRPL Streaming Payment API.

## 📝 Prerequisites

1. Server must be running: `npm start`
2. If API_KEY is set in .env, include it in requests
3. You need a CHANNEL_ID from creating a channel first

## 🔑 Authentication

If you have an API_KEY in your .env:
```bash
-H "Authorization: Bearer YOUR_API_KEY_HERE"
```

If API_KEY is empty in .env, you can omit the Authorization header.

---

## 1. Health Check

**Check if server is running:**

```bash
curl http://localhost:3000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-07T08:00:00.000Z",
  "version": "1.0.0",
  "network": "testnet"
}
```

---

## 2. API Info

**Get list of available endpoints:**

```bash
curl http://localhost:3000/api
```

---

## 3. Start Streaming (Sender)

**Start sender's streaming session:**

```bash
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID_HERE",
    "walletSeed": "sYourSenderSeed",
    "ratePerSecond": "10000",
    "role": "sender"
  }'
```

**Windows PowerShell:**
```powershell
$body = @{
    channelId = "YOUR_CHANNEL_ID_HERE"
    walletSeed = "sYourSenderSeed"
    ratePerSecond = "10000"
    role = "sender"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/stream/start" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_API_KEY"} `
  -Body $body
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Sender stream started",
  "channelId": "ABC123...",
  "ratePerSecond": "10000",
  "channelBalance": "50000000"
}
```

---

## 4. Start Streaming (Receiver)

**Start receiver's streaming session:**

```bash
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID_HERE",
    "publicKey": "SENDER_PUBLIC_KEY",
    "role": "receiver"
  }'
```

**Windows PowerShell:**
```powershell
$body = @{
    channelId = "YOUR_CHANNEL_ID_HERE"
    publicKey = "SENDER_PUBLIC_KEY"
    role = "receiver"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/stream/start" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_API_KEY"} `
  -Body $body
```

---

## 5. Generate Claim (Sender)

**Get a signed claim from sender:**

```bash
curl "http://localhost:3000/api/stream/claim?channelId=YOUR_CHANNEL_ID_HERE" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stream/claim?channelId=YOUR_CHANNEL_ID_HERE" `
  -Headers @{"Authorization"="Bearer YOUR_API_KEY"}
```

**Expected Response:**
```json
{
  "success": true,
  "claim": {
    "channelId": "ABC123...",
    "amount": "50000",
    "amountXRP": 0.05,
    "signature": "3045022100...",
    "publicKey": "ED123...",
    "timestamp": 1704614400000
  }
}
```

---

## 6. Validate Claim (Receiver)

**Validate a claim received from sender:**

```bash
curl -X POST http://localhost:3000/api/stream/validate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID_HERE",
    "amount": "50000",
    "signature": "3045022100...",
    "publicKey": "ED123..."
  }'
```

**Windows PowerShell:**
```powershell
$body = @{
    channelId = "YOUR_CHANNEL_ID_HERE"
    amount = "50000"
    signature = "3045022100..."
    publicKey = "ED123..."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/stream/validate" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_API_KEY"} `
  -Body $body
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Claim is valid",
  "validation": {
    "valid": true,
    "channelId": "ABC123...",
    "amount": "50000",
    "previousAmount": "30000",
    "increment": "20000"
  }
}
```

---

## 7. Get Stream Status

**Check current status of a channel:**

```bash
curl "http://localhost:3000/api/stream/status?channelId=YOUR_CHANNEL_ID_HERE" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stream/status?channelId=YOUR_CHANNEL_ID_HERE" `
  -Headers @{"Authorization"="Bearer YOUR_API_KEY"}
```

**Expected Response:**
```json
{
  "success": true,
  "channelId": "ABC123...",
  "activeSession": {
    "role": "sender",
    "startTime": 1704614400000,
    "duration": 30000
  },
  "ledgerInfo": {
    "Account": "rSenderAddress...",
    "Destination": "rReceiverAddress...",
    "Amount": "50000000"
  },
  "localStats": {
    "lastValidXRP": 0.05,
    "unclaimedXRP": 0.03
  }
}
```

---

## 8. Get Claim History

**Get history of claims for a channel:**

```bash
curl "http://localhost:3000/api/stream/history?channelId=YOUR_CHANNEL_ID_HERE&limit=10" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Windows PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/stream/history?channelId=YOUR_CHANNEL_ID_HERE&limit=10" `
  -Headers @{"Authorization"="Bearer YOUR_API_KEY"}
```

**Expected Response:**
```json
{
  "success": true,
  "channelId": "ABC123...",
  "totalClaims": 5,
  "history": [
    {
      "amount": "10000",
      "amountXRP": 0.01,
      "timestamp": 1704614400000,
      "signature": "30450221..."
    }
  ]
}
```

---

## 9. Finalize Stream (On-Chain)

**Submit final claim to XRPL blockchain:**

```bash
curl -X POST http://localhost:3000/api/stream/finalize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID_HERE",
    "receiverWalletSeed": "sYourReceiverSeed"
  }'
```

**Windows PowerShell:**
```powershell
$body = @{
    channelId = "YOUR_CHANNEL_ID_HERE"
    receiverWalletSeed = "sYourReceiverSeed"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/stream/finalize" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_API_KEY"} `
  -Body $body
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Claim finalized on-chain",
  "result": {
    "channelId": "ABC123...",
    "transactionHash": "E2F3...",
    "claimedAmount": "50000",
    "ledgerIndex": 12345
  }
}
```

---

## 10. Stop Streaming

**Stop an active streaming session:**

```bash
curl -X POST http://localhost:3000/api/stream/stop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "channelId": "YOUR_CHANNEL_ID_HERE"
  }'
```

**Windows PowerShell:**
```powershell
$body = @{
    channelId = "YOUR_CHANNEL_ID_HERE"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/stream/stop" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"; "Authorization"="Bearer YOUR_API_KEY"} `
  -Body $body
```

---

## 🎮 Quick Test Flow

```bash
# 1. Check health
curl http://localhost:3000/health

# 2. Create channel (use test script)
node test-scripts/1-create-channel.js

# 3. Start sender stream (replace CHANNEL_ID)
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -d '{"channelId":"CHANNEL_ID","walletSeed":"sSEED","ratePerSecond":"10000","role":"sender"}'

# 4. Start receiver stream
curl -X POST http://localhost:3000/api/stream/start \
  -H "Content-Type: application/json" \
  -d '{"channelId":"CHANNEL_ID","publicKey":"PUBLIC_KEY","role":"receiver"}'

# 5. Wait 10 seconds, then generate claim
sleep 10
curl "http://localhost:3000/api/stream/claim?channelId=CHANNEL_ID"

# 6. Get status
curl "http://localhost:3000/api/stream/status?channelId=CHANNEL_ID"

# 7. Get history
curl "http://localhost:3000/api/stream/history?channelId=CHANNEL_ID"
```

---

## 💡 Tips

1. **Save channel ID:** After creating a channel, save the ID to use in other requests
2. **Pretty print JSON:** Pipe to `jq` or `json` for formatted output
   ```bash
   curl http://localhost:3000/health | jq
   ```
3. **Save to file:** Save responses for debugging
   ```bash
   curl http://localhost:3000/health > response.json
   ```
4. **Test errors:** Try invalid data to see error responses
5. **Monitor logs:** Watch server console for request logs

---

## 🐛 Troubleshooting

**Error: "Unauthorized"**
- Include API_KEY in Authorization header
- Or set API_KEY="" in .env to disable auth

**Error: "No active stream found"**
- Start streaming sessions first (endpoints 3 & 4)

**Error: "Invalid channelId format"**
- Channel ID must be 64 hexadecimal characters
- Get it from creating a channel (test script 1)

**Error: Connection refused**
- Make sure server is running: `npm start`
- Check it's on port 3000: `http://localhost:3000/health`

