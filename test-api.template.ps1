# PowerShell Script for Testing XRPL Streaming Payment API
# TEMPLATE VERSION - Copy this to test-api.ps1 and fill in your values
# Run with: .\test-api.ps1

Write-Host "🧪 XRPL Streaming Payment API Test Suite" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan

$baseUrl = "http://localhost:3000"
$apiKey = $env:API_KEY # Get from environment

# ⚠️ FILL IN YOUR VALUES HERE (from .env file and channel creation)
# =========================================================================
$channelId = "YOUR_CHANNEL_ID_HERE"      # Get from: node test-scripts/1-create-channel.js
$senderSeed = "YOUR_SENDER_SEED_HERE"    # From .env: SENDER_WALLET_SEED (starts with 's')
$receiverSeed = "YOUR_RECEIVER_SEED_HERE" # From .env: RECEIVER_WALLET_SEED (starts with 's')
# =========================================================================

# Helper function to make API calls
function Invoke-Api {
    param(
        [string]$Method = "GET",
        [string]$Endpoint,
        [object]$Body = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($apiKey) {
        $headers["Authorization"] = "Bearer $apiKey"
    }
    
    $params = @{
        Uri = "$baseUrl$Endpoint"
        Method = $Method
        Headers = $headers
    }
    
    if ($Body) {
        $params["Body"] = ($Body | ConvertTo-Json)
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    } catch {
        Write-Host "❌ Error: $_" -ForegroundColor Red
        return $null
    }
}

# Test 1: Health Check
Write-Host "`n1️⃣ Testing Health Check..." -ForegroundColor Yellow
$health = Invoke-Api -Endpoint "/health"
if ($health) {
    Write-Host "✅ Server is healthy!" -ForegroundColor Green
    Write-Host "   Status: $($health.status)"
    Write-Host "   Network: $($health.network)"
    Write-Host "   Version: $($health.version)"
}

# Test 2: API Info
Write-Host "`n2️⃣ Testing API Info..." -ForegroundColor Yellow
$apiInfo = Invoke-Api -Endpoint "/api"
if ($apiInfo) {
    Write-Host "✅ API Info retrieved!" -ForegroundColor Green
    Write-Host "   Name: $($apiInfo.name)"
    Write-Host "   Available endpoints: $($apiInfo.endpoints.stream.PSObject.Properties.Count) streaming endpoints"
}

# Interactive test for streaming
Write-Host "`n" + ("=" * 60)
Write-Host "🎮 Interactive Streaming Test" -ForegroundColor Cyan
Write-Host "=" * 60

# Check if values are filled in
if ($channelId -eq "YOUR_CHANNEL_ID_HERE" -or $senderSeed -eq "YOUR_SENDER_SEED_HERE") {
    Write-Host "`n⚠️  VALUES NOT CONFIGURED!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please edit this file and fill in:" -ForegroundColor Yellow
    Write-Host "  1. channelId    - Run: node test-scripts/1-create-channel.js"
    Write-Host "  2. senderSeed   - From your .env file"
    Write-Host "  3. receiverSeed - From your .env file"
    Write-Host ""
    Write-Host "Find these values at the top of this script (lines 11-13)" -ForegroundColor Cyan
    exit 1
}

if ($channelId) {
    # Test 3: Start Sender Stream
    Write-Host "`n3️⃣ Starting Sender Stream..." -ForegroundColor Yellow
    Write-Host "   Channel: $channelId" -ForegroundColor Gray
    
    $startSender = Invoke-Api -Method POST -Endpoint "/api/stream/start" -Body @{
        channelId = $channelId
        walletSeed = $senderSeed
        ratePerSecond = "10000"
        role = "sender"
    }
    
    if ($startSender) {
        Write-Host "✅ Sender stream started!" -ForegroundColor Green
        Write-Host "   Rate: $($startSender.ratePerSecond) drops/sec"
    }
    
    # Test 4: Start Receiver Stream
    Write-Host "`n4️⃣ Starting Receiver Stream..." -ForegroundColor Yellow
    
    # Get public key from sender seed
    $senderWallet = node -e "const xrpl = require('xrpl'); const w = xrpl.Wallet.fromSeed('$senderSeed'); console.log(w.publicKey);"
    
    $startReceiver = Invoke-Api -Method POST -Endpoint "/api/stream/start" -Body @{
        channelId = $channelId
        publicKey = $senderWallet
        role = "receiver"
    }
    
    if ($startReceiver) {
        Write-Host "✅ Receiver stream started!" -ForegroundColor Green
    }
    
    # Test 5: Generate Claim
    Write-Host "`n5️⃣ Waiting 5 seconds for value to accumulate..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    Write-Host "Generating claim..." -ForegroundColor Yellow
    $claim = Invoke-Api -Endpoint "/api/stream/claim?channelId=$channelId"
    
    if ($claim) {
        Write-Host "✅ Claim generated!" -ForegroundColor Green
        Write-Host "   Amount: $($claim.claim.amountXRP) XRP"
        Write-Host "   Signature: $($claim.claim.signature.Substring(0,40))..."
    }
    
    # Test 6: Get Status
    Write-Host "`n6️⃣ Getting Stream Status..." -ForegroundColor Yellow
    $status = Invoke-Api -Endpoint "/api/stream/status?channelId=$channelId"
    
    if ($status) {
        Write-Host "✅ Status retrieved!" -ForegroundColor Green
        if ($status.activeSession) {
            $durationSec = [math]::Floor($status.activeSession.duration / 1000)
            Write-Host "   Active for: $durationSec seconds"
            Write-Host "   Role: $($status.activeSession.role)"
        }
        if ($status.localStats) {
            Write-Host "   Last Valid: $($status.localStats.lastValidXRP) XRP"
        }
    }
    
    # Test 7: Get History
    Write-Host "`n7️⃣ Getting Claim History..." -ForegroundColor Yellow
    $history = Invoke-Api -Endpoint "/api/stream/history?channelId=$channelId&limit=5"
    
    if ($history) {
        Write-Host "✅ History retrieved!" -ForegroundColor Green
        Write-Host "   Total claims: $($history.totalClaims)"
    }
    
    # Test 8: Stop Stream
    Write-Host "`n8️⃣ Stopping Stream..." -ForegroundColor Yellow
    $stop = Invoke-Api -Method POST -Endpoint "/api/stream/stop" -Body @{
        channelId = $channelId
    }
    
    if ($stop) {
        Write-Host "✅ Stream stopped!" -ForegroundColor Green
        if ($stop.finalAmount) {
            $finalXRP = [decimal]$stop.finalAmount / 1000000
            Write-Host "   Final amount: $finalXRP XRP"
        }
    }
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Cyan
Write-Host "✅ Test Suite Complete!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "`n💡 Tip: Run test-scripts to create channels and test full flow"

