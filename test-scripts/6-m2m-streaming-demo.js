/**
 * Machine-to-Machine Streaming Payment Demo
 * 
 * This script demonstrates a real-world use case of streaming payments on XRPL:
 * - Consumer (sender): A machine that needs computational work done
 * - Supplier (receiver): A machine that provides computational services
 * 
 * The consumer pays the supplier incrementally as work is verified.
 * Payment only flows when work is proven to be happening.
 * 
 * Prerequisites:
 * - SENDER_WALLET_SEED and RECEIVER_WALLET_SEED in .env
 * - Server running on localhost:3000
 */

const axios = require('axios');
const xrpl = require('xrpl');
const { createChannel, getChannelInfo } = require('../contracts/createChannel');
require('dotenv').config();

const API_BASE = 'http://localhost:3000/api';
const API_KEY = process.env.API_KEY;

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Channel funding amount (10 XRP)
  channelAmount: '10000000',
  
  // Payment rate: 50,000 drops per work unit (0.05 XRP)
  dropsPerWorkUnit: 50000,
  
  // How many work units to process
  totalWorkUnits: 5,
  
  // Simulated time for each work unit (ms)
  workDurationMs: 2000,
  
  // Payment interval (ms) - how often to generate claims
  paymentIntervalMs: 1000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatDrops = (drops) => {
  const xrp = parseInt(drops) / 1_000_000;
  return `${xrp.toFixed(6)} XRP (${drops} drops)`;
};

const apiRequest = async (method, endpoint, data = {}) => {
  const config = {
    method,
    url: `${API_BASE}${endpoint}`,
    headers: API_KEY ? { 'Authorization': `Bearer ${API_KEY}` } : {},
  };
  
  if (method === 'get') {
    config.params = data;
  } else {
    config.data = data;
  }
  
  return axios(config);
};

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIER (RECEIVER) - The machine that provides work/services
// ═══════════════════════════════════════════════════════════════════════════════

class Supplier {
  constructor(walletSeed) {
    this.wallet = xrpl.Wallet.fromSeed(walletSeed);
    this.currentWorkUnit = 0;
    this.totalWorkCompleted = 0;
    this.workInProgress = false;
    this.workProgress = 0; // 0-100 percentage for current work unit
    this.workResults = [];
  }
  
  get address() {
    return this.wallet.address;
  }
  
  /**
   * Start receiving stream session
   */
  async startReceiving(channelId, senderPublicKey) {
    console.log('\n🔧 [SUPPLIER] Starting receiver session...');
    
    const response = await apiRequest('post', '/stream/start', {
      channelId,
      publicKey: senderPublicKey,
      role: 'receiver',
    });
    
    console.log('   ✓ Receiver session active');
    return response.data;
  }
  
  /**
   * Simulate doing work - this could be any computation:
   * - Data processing
   * - Machine learning inference
   * - File encoding
   * - API calls
   * - IoT sensor readings
   */
  async doWork(workUnitId) {
    this.workInProgress = true;
    this.workProgress = 0;
    this.currentWorkUnit = workUnitId;
    
    console.log(`\n🔨 [SUPPLIER] Starting work unit #${workUnitId}...`);
    
    // Simulate progressive work
    const progressSteps = 10;
    const stepDuration = CONFIG.workDurationMs / progressSteps;
    
    for (let step = 1; step <= progressSteps; step++) {
      await sleep(stepDuration);
      this.workProgress = step * 10;
      
      // Log progress at key milestones
      if (step % 3 === 0 || step === progressSteps) {
        console.log(`   ⚙️  Work unit #${workUnitId}: ${this.workProgress}% complete`);
      }
    }
    
    // Generate "proof of work" - in reality this could be:
    // - A hash of processed data
    // - A checksum
    // - A verifiable result
    const workResult = {
      unitId: workUnitId,
      completedAt: Date.now(),
      proof: this.generateWorkProof(workUnitId),
      metrics: {
        cpuCycles: Math.floor(Math.random() * 1000000) + 500000,
        memoryUsed: Math.floor(Math.random() * 512) + 256,
        dataProcessed: Math.floor(Math.random() * 1000) + 100,
      },
    };
    
    this.workResults.push(workResult);
    this.totalWorkCompleted++;
    this.workInProgress = false;
    this.workProgress = 100;
    
    console.log(`   ✅ Work unit #${workUnitId} COMPLETED`);
    console.log(`   📋 Proof: ${workResult.proof.substring(0, 16)}...`);
    
    return workResult;
  }
  
  /**
   * Generate a verifiable proof of work
   */
  generateWorkProof(unitId) {
    const data = `${this.address}-${unitId}-${Date.now()}`;
    // In production, this would be a cryptographic hash or signature
    return Buffer.from(data).toString('base64');
  }
  
  /**
   * Show current work status to consumer for verification
   */
  showWork() {
    return {
      isWorking: this.workInProgress,
      currentUnit: this.currentWorkUnit,
      progress: this.workProgress,
      totalCompleted: this.totalWorkCompleted,
      latestResult: this.workResults[this.workResults.length - 1] || null,
    };
  }
  
  /**
   * Validate a claim (receiver verifies and stores)
   */
  async validateClaim(channelId, claim) {
    const response = await apiRequest('post', '/stream/validate', {
      channelId,
      amount: claim.amount,
      signature: claim.signature,
      publicKey: claim.publicKey,
    });
    
    return response.data;
  }
  
  /**
   * Finalize the stream and claim XRP on-chain
   */
  async finalizePayment(channelId) {
    console.log('\n💎 [SUPPLIER] Finalizing payment on-chain...');
    
    const response = await apiRequest('post', '/stream/finalize', {
      channelId,
      receiverWalletSeed: this.wallet.seed,
    });
    
    return response.data;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMER (SENDER) - The machine that needs work done
// ═══════════════════════════════════════════════════════════════════════════════

class Consumer {
  constructor(walletSeed) {
    this.wallet = xrpl.Wallet.fromSeed(walletSeed);
    this.channelId = null;
    this.totalPaid = 0;
    this.workUnitsVerified = 0;
    this.claimsGenerated = [];
  }
  
  get address() {
    return this.wallet.address;
  }
  
  get publicKey() {
    return this.wallet.publicKey;
  }
  
  /**
   * Create a payment channel to the supplier
   */
  async createPaymentChannel(supplierAddress) {
    console.log('\n💳 [CONSUMER] Creating payment channel...');
    console.log(`   From: ${this.address}`);
    console.log(`   To: ${supplierAddress}`);
    console.log(`   Amount: ${formatDrops(CONFIG.channelAmount)}`);
    
    const result = await createChannel(
      this.wallet,
      supplierAddress,
      CONFIG.channelAmount,
      3600 // 1 hour settle delay
    );
    
    this.channelId = result.channelId;
    console.log(`   ✓ Channel created: ${this.channelId}`);
    
    return result;
  }
  
  /**
   * Start the streaming session as sender
   */
  async startStream() {
    console.log('\n📡 [CONSUMER] Starting sender stream session...');
    
    const response = await apiRequest('post', '/stream/start', {
      channelId: this.channelId,
      walletSeed: this.wallet.seed,
      ratePerSecond: CONFIG.dropsPerWorkUnit.toString(),
      role: 'sender',
    });
    
    console.log(`   ✓ Sender session active`);
    console.log(`   Rate: ${formatDrops(CONFIG.dropsPerWorkUnit)}/sec`);
    
    return response.data;
  }
  
  /**
   * Stop the streaming session
   */
  async stopStream() {
    console.log('\n🛑 [CONSUMER] Stopping stream...');
    
    const response = await apiRequest('post', '/stream/stop', {
      channelId: this.channelId,
      role: 'sender',
    });
    
    return response.data;
  }
  
  /**
   * Verify the supplier is doing work
   */
  verifyWork(workStatus) {
    // Verification logic - in production this could include:
    // - Cryptographic proof verification
    // - Checking work against expected results
    // - Validating checksums
    // - Calling external verification services
    
    if (!workStatus) {
      console.log('   ⚠️  [CONSUMER] No work status received');
      return false;
    }
    
    // Verify work is happening or recently completed
    if (workStatus.isWorking) {
      console.log(`   🔍 [CONSUMER] Verified: Work in progress (${workStatus.progress}%)`);
      return true;
    }
    
    if (workStatus.latestResult && workStatus.totalCompleted > this.workUnitsVerified) {
      // Verify the proof (simplified - in production, verify cryptographically)
      const proof = workStatus.latestResult.proof;
      if (proof && proof.length > 0) {
        console.log(`   ✓ [CONSUMER] Verified: Work unit #${workStatus.latestResult.unitId} complete`);
        this.workUnitsVerified = workStatus.totalCompleted;
        return true;
      }
    }
    
    console.log('   ⏳ [CONSUMER] Waiting for verifiable work...');
    return false;
  }
  
  /**
   * Generate and push a payment claim
   */
  async pushPayment() {
    const response = await apiRequest('get', '/stream/claim', {
      channelId: this.channelId,
    });
    
    const claim = response.data.claim;
    this.claimsGenerated.push(claim);
    this.totalPaid = parseInt(claim.amount);
    
    return claim;
  }
  
  /**
   * Get current stream status
   */
  async getStatus() {
    const response = await apiRequest('get', '/stream/status', {
      channelId: this.channelId,
    });
    
    return response.data;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEMO: Machine-to-Machine Streaming Payment
// ═══════════════════════════════════════════════════════════════════════════════

async function runM2MDemo() {
  console.log('\n' + '═'.repeat(70));
  console.log('  🤖 MACHINE-TO-MACHINE STREAMING PAYMENT DEMO');
  console.log('  Using XRPL Payment Channels for Trustless Micropayments');
  console.log('═'.repeat(70));
  
  // Load wallet seeds
  const senderSeed = process.env.SENDER_WALLET_SEED;
  const receiverSeed = process.env.RECEIVER_WALLET_SEED;
  
  if (!senderSeed || !receiverSeed) {
    console.error('\n❌ Error: Missing wallet seeds in .env');
    console.log('Required: SENDER_WALLET_SEED, RECEIVER_WALLET_SEED');
    process.exit(1);
  }
  
  // Initialize machines
  const consumer = new Consumer(senderSeed);
  const supplier = new Supplier(receiverSeed);
  
  console.log('\n📋 INITIALIZATION');
  console.log('─'.repeat(70));
  console.log(`Consumer (Sender):  ${consumer.address}`);
  console.log(`Supplier (Receiver): ${supplier.address}`);
  console.log(`Work Units to Process: ${CONFIG.totalWorkUnits}`);
  console.log(`Payment per Unit: ${formatDrops(CONFIG.dropsPerWorkUnit)}`);
  
  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Setup Payment Channel
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  PHASE 1: ESTABLISHING PAYMENT CHANNEL');
    console.log('═'.repeat(70));
    
    // Consumer creates payment channel to supplier
    const channelResult = await consumer.createPaymentChannel(supplier.address);
    
    // Both parties start their streaming sessions
    await consumer.startStream();
    await supplier.startReceiving(consumer.channelId, consumer.publicKey);
    
    console.log('\n✅ Payment infrastructure ready!');
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Work-for-Payment Loop
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  PHASE 2: STREAMING WORK-FOR-PAYMENT');
    console.log('═'.repeat(70));
    
    let claimsThisSession = [];
    
    for (let unitId = 1; unitId <= CONFIG.totalWorkUnits; unitId++) {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`  WORK UNIT ${unitId} of ${CONFIG.totalWorkUnits}`);
      console.log(`${'─'.repeat(50)}`);
      
      // Start work (non-blocking)
      const workPromise = supplier.doWork(unitId);
      
      // While work is in progress, consumer verifies and pays incrementally
      let paymentsForThisUnit = 0;
      const maxPaymentsPerUnit = 3;
      
      while (supplier.showWork().isWorking || paymentsForThisUnit === 0) {
        await sleep(CONFIG.paymentIntervalMs);
        
        // Consumer checks on supplier's work
        const workStatus = supplier.showWork();
        const isVerified = consumer.verifyWork(workStatus);
        
        // Only pay if work is verified
        if (isVerified && paymentsForThisUnit < maxPaymentsPerUnit) {
          const claim = await consumer.pushPayment();
          
          // Supplier validates the payment
          const validation = await supplier.validateClaim(consumer.channelId, claim);
          
          if (validation.success) {
            console.log(`   💰 [PAYMENT] ${formatDrops(claim.amount)} accumulated`);
            claimsThisSession.push(claim);
            paymentsForThisUnit++;
          }
        }
        
        // Safety check - don't infinite loop
        if (!supplier.showWork().isWorking) break;
      }
      
      // Wait for work to complete
      await workPromise;
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Finalization
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  PHASE 3: FINALIZING PAYMENTS');
    console.log('═'.repeat(70));
    
    // Stop the stream
    const stopResult = await consumer.stopStream();
    console.log('\n📊 Stream Summary:');
    if (stopResult.stopped && stopResult.stopped[0]) {
      console.log(`   Duration: ${Math.floor(stopResult.stopped[0].duration / 1000)} seconds`);
      console.log(`   Final Amount: ${formatDrops(stopResult.stopped[0].finalAmount)}`);
    }
    
    // Get final status
    const finalStatus = await consumer.getStatus();
    
    // Supplier claims the payment on-chain
    console.log('\n💎 Claiming payment on XRPL blockchain...');
    
    try {
      const finalizeResult = await supplier.finalizePayment(consumer.channelId);
      
      console.log('\n' + '═'.repeat(70));
      console.log('  ✅ DEMO COMPLETE - PAYMENT FINALIZED!');
      console.log('═'.repeat(70));
      
      console.log(`\n📈 FINAL RESULTS:`);
      console.log('─'.repeat(50));
      console.log(`   Work Units Completed: ${supplier.totalWorkCompleted}`);
      console.log(`   Claims Generated: ${claimsThisSession.length}`);
      console.log(`   Total XRP Transferred: ${formatDrops(finalizeResult.result.claimedAmount)}`);
      console.log(`   Transaction Hash: ${finalizeResult.result.transactionHash}`);
      console.log(`\n🔗 View on XRPL Testnet Explorer:`);
      console.log(`   https://testnet.xrpl.org/transactions/${finalizeResult.result.transactionHash}`);
      
    } catch (finalizeError) {
      // If finalization fails (e.g., amount too small), show stats anyway
      console.log('\n⚠️  Could not finalize on-chain (amount may be too small for testnet)');
      console.log('   Off-chain streaming was successful!');
      
      console.log(`\n📈 SESSION RESULTS:`);
      console.log('─'.repeat(50));
      console.log(`   Work Units Completed: ${supplier.totalWorkCompleted}`);
      console.log(`   Claims Generated: ${claimsThisSession.length}`);
      console.log(`   Total Accumulated: ${formatDrops(consumer.totalPaid)}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // Summary & Use Cases
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  💡 WHAT THIS DEMO SHOWS');
    console.log('═'.repeat(70));
    console.log(`
   This demonstrates how XRPL streaming payments enable:
   
   1. 🔒 TRUSTLESS TRANSACTIONS
      - Consumer only pays when work is verified
      - Supplier guaranteed payment for completed work
      - No intermediaries needed
   
   2. ⚡ REAL-TIME MICROPAYMENTS
      - Payments flow as work progresses
      - No minimum transaction amounts
      - Instant settlement possible
   
   3. 🤖 MACHINE-TO-MACHINE ECONOMY
      - Automated payment triggers
      - Programmable payment logic
      - Perfect for IoT, AI services, compute resources
   
   4. 💰 COST EFFICIENT
      - Off-chain claims = zero transaction fees
      - Only finalize when needed
      - Channel can be reused
   
   Real-world applications:
   • Pay-per-API-call services
   • Cloud computing billing
   • IoT sensor data purchases
   • AI/ML inference payments
   • Content delivery networks
   • Electric vehicle charging
`);
    
  } catch (error) {
    console.error('\n❌ Demo Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN THE DEMO
// ═══════════════════════════════════════════════════════════════════════════════

runM2MDemo().catch(console.error);
