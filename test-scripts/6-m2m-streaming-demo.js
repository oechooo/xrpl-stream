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
const crypto = require('crypto');
const { createChannel, getChannelInfo } = require('../contracts/createChannel');
const { ServiceContract, getContractRegistry } = require('../src/core/contract');
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
  
  // NOTE: Payment interval is now controlled by serviceContract.pricing.frequency
  // This ensures streaming frequency matches the contract terms
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
    this.serviceContracts = [];
    this.registry = getContractRegistry();
    this.activeContract = null; // Currently active service contract
    this.consumerCallbacks = new Map(); // channelId -> callback function
  }
  
  get address() {
    return this.wallet.address;
  }
  
  /**
   * Start receiving stream session
   */
  async startReceiving(channelId, senderPublicKey, contract) {
    console.log('\n🔧 [SUPPLIER] Starting receiver session...');
    
    if (!contract) {
      throw new Error('Cannot start receiving without a service contract');
    }
    
    this.activeContract = contract;
    
    const response = await apiRequest('post', '/stream/start', {
      channelId,
      publicKey: senderPublicKey,
      role: 'receiver',
    });
    
    console.log('   ✓ Receiver session active');
    console.log(`   Contract frequency: ${contract.pricing.frequency}s per payment`);
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
    
    // Generate "proof of work" - cryptographic hash of work data
    const completedAt = Date.now();
    const metrics = {
      cpuCycles: Math.floor(Math.random() * 1000000) + 500000,
      memoryUsed: Math.floor(Math.random() * 512) + 256,
      dataProcessed: Math.floor(Math.random() * 1000) + 100,
    };
    
    const workResult = {
      unitId: workUnitId,
      completedAt,
      metrics,
      proof: null, // Will be set after generation
    };
    
    // Generate SHA256 proof
    workResult.proof = this.generateWorkProof(workResult);
    
    this.workResults.push(workResult);
    this.totalWorkCompleted++;
    this.workInProgress = false;
    this.workProgress = 100;
    
    console.log(`   ✅ Work unit #${workUnitId} COMPLETED`);
    console.log(`   📋 Proof (SHA256): ${workResult.proof.substring(0, 16)}...`);
    
    // Send work data to consumer for verification
    this.sendWorkToConsumer(workResult);
    
    return workResult;
  }
  
  /**
   * Send work data to consumer for verification
   */
  sendWorkToConsumer(workResult) {
    // In a real distributed system, this would be an API call or message
    // For this demo, we use a callback pattern
    this.consumerCallbacks.forEach((callback) => {
      callback(workResult);
    });
  }
  
  /**
   * Register a consumer callback to receive work data
   */
  registerConsumer(channelId, callback) {
    this.consumerCallbacks.set(channelId, callback);
    console.log(`   ✓ Consumer registered for work data on channel ${channelId}`);
  }
  
  /**
   * Generate a verifiable proof of work using SHA256
   */
  generateWorkProof(workData) {
    const { unitId, completedAt, metrics } = workData;
    const data = JSON.stringify({
      address: this.address,
      unitId,
      completedAt,
      metrics,
    });
    
    // SHA256 hash of the work data
    return crypto.createHash('sha256').update(data).digest('hex');
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

  async createServiceContract(details) {
    // Create a service contract that defines the work this supplier provides
    const contract = new ServiceContract({
      agentAddress: this.wallet.address,
      agentPublicKey: this.wallet.publicKey,
      name: details.name || 'Compute Work Service',
      description: details.description || 'Machine-to-machine computational work with verifiable proof',
      serviceType: details.serviceType || 'compute',
      category: details.category || 'infrastructure',
      pricing: {
        frequency: details.frequency || 1, // Payment every second
        costPerInterval: details.costPerInterval || CONFIG.dropsPerWorkUnit.toString(),
        unit: details.unit || 'per work unit',
        minChannelAmount: details.minChannelAmount || CONFIG.channelAmount,
        recommendedChannelAmount: details.recommendedChannelAmount || CONFIG.channelAmount,
      },
      maxConcurrentStreams: details.maxConcurrentStreams || 10,
    });
    
    this.registry.registerContract(contract);
    this.serviceContracts.push(contract);
    
    console.log(`✓ [SUPPLIER] Service contract registered: ${contract.name}`);
    console.log(`   Rate: ${contract.pricing.rate} drops/second`);
    console.log(`   Cost per interval: ${contract.pricing.costPerInterval} drops every ${contract.pricing.frequency}s`);
    
    return contract;
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
    this.activeContract = null;
    this.receivedWorkData = []; // Store work data received from supplier
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
  async startStream(contract) {
    console.log('\n📡 [CONSUMER] Starting sender stream session...');
    
    if (!contract) {
      throw new Error('Cannot start stream without a service contract');
    }
    
    this.activeContract = contract;
    
    // Validate that payment rate matches contract frequency
    const expectedRate = parseInt(contract.pricing.rate); // drops per second
    const configuredRate = CONFIG.dropsPerWorkUnit; // assuming 1 second intervals
    
    if (Math.abs(expectedRate - configuredRate) > 1) {
      console.warn(`   ⚠️  Warning: Configured rate (${configuredRate}) differs from contract rate (${expectedRate})`);
    }
    
    const response = await apiRequest('post', '/stream/start', {
      channelId: this.channelId,
      walletSeed: this.wallet.seed,
      ratePerSecond: contract.pricing.rate, // Use contract rate
      role: 'sender',
    });
    
    console.log(`   ✓ Sender session active`);
    console.log(`   Rate: ${formatDrops(contract.pricing.rate)}/sec (from contract)`);
    console.log(`   Payment frequency: Every ${contract.pricing.frequency}s`);
    
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
   * Receive work data from supplier
   */
  receiveWork(workData) {
    console.log(`   📩 [CONSUMER] Received work data for unit #${workData.unitId}`);
    this.receivedWorkData.push(workData);
  }
  
  /**
   * Verify work using cryptographic proof
   */
  verifyWork(workData) {
    if (!workData) {
      console.log('   ⚠️  [CONSUMER] No work data to verify');
      return false;
    }
    
    // Recompute the SHA256 hash from the work data
    const dataToHash = JSON.stringify({
      address: workData.address || this.activeContract.agentAddress,
      unitId: workData.unitId,
      completedAt: workData.completedAt,
      metrics: workData.metrics,
    });
    
    const computedProof = crypto.createHash('sha256').update(dataToHash).digest('hex');
    
    // Compare with supplier's proof
    if (computedProof === workData.proof) {
      console.log(`   ✅ [CONSUMER] Work verified! Proof matches (SHA256)`);
      console.log(`      Unit #${workData.unitId}: ${computedProof.substring(0, 16)}...`);
      this.workUnitsVerified++;
      return true;
    } else {
      console.log(`   ❌ [CONSUMER] Verification FAILED! Proof mismatch`);
      console.log(`      Expected: ${workData.proof.substring(0, 16)}...`);
      console.log(`      Computed: ${computedProof.substring(0, 16)}...`);
      return false;
    }
  }
  
  /**
   * Check if there's unverified work data
   */
  hasUnverifiedWork() {
    return this.receivedWorkData.length > this.workUnitsVerified;
  }
  
  /**
   * Get the latest unverified work data
   */
  getLatestWork() {
    if (this.receivedWorkData.length === 0) return null;
    return this.receivedWorkData[this.receivedWorkData.length - 1];
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
    // PHASE 0: Setup Service Contract (Discovery)
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  PHASE 0: SERVICE DISCOVERY & CONTRACT SETUP');
    console.log('═'.repeat(70));
    
    // Supplier creates and registers their service contract
    const serviceContract = await supplier.createServiceContract({
      name: 'M2M Computational Work Service',
      description: 'Real-time computational work with proof verification',
      serviceType: 'compute',
      category: 'infrastructure',
      frequency: 1,
      costPerInterval: CONFIG.dropsPerWorkUnit.toString(),
      unit: 'per work unit',
      minChannelAmount: CONFIG.channelAmount,
      recommendedChannelAmount: CONFIG.channelAmount,
      maxConcurrentStreams: 5,
    });
    
    console.log('\n✅ Service contract ready for discovery!');
    console.log(`   Contract ID: ${serviceContract.id}`);
    console.log(`   Provider: ${serviceContract.agentAddress}`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: Setup Payment Channel
    // ═══════════════════════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(70));
    console.log('  PHASE 1: ESTABLISHING PAYMENT CHANNEL');
    console.log('═'.repeat(70));
    
    // Consumer creates payment channel to supplier
    const channelResult = await consumer.createPaymentChannel(supplier.address);
    
    // Register this channel as a subscription on the service contract
    serviceContract.addSubscription(consumer.channelId, consumer.address, {
      workUnits: CONFIG.totalWorkUnits,
      startedAt: Date.now(),
    });
    
    // Consumer registers to receive work data from supplier
    supplier.registerConsumer(consumer.channelId, (workData) => {
      consumer.receiveWork({
        ...workData,
        address: supplier.address, // Include supplier address for verification
      });
    });
    
    // Both parties start their streaming sessions with contract
    await consumer.startStream(serviceContract);
    await supplier.startReceiving(consumer.channelId, consumer.publicKey, serviceContract);
    
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
      
      // Use contract frequency for payment/verification interval (convert seconds to ms)
      const paymentIntervalMs = serviceContract.pricing.frequency * 1000;
      
      while (supplier.showWork().isWorking || paymentsForThisUnit === 0) {
        await sleep(paymentIntervalMs);
        
        // Check if consumer has received work data to verify
        if (consumer.hasUnverifiedWork()) {
          const workData = consumer.getLatestWork();
          const isVerified = consumer.verifyWork(workData);
          
          // Only pay if work is verified
          if (isVerified && paymentsForThisUnit < maxPaymentsPerUnit) {
            const claim = await consumer.pushPayment();
            
            // Supplier validates the payment
            const validation = await supplier.validateClaim(consumer.channelId, claim);
            
            if (validation.success) {
              console.log(`   💰 [PAYMENT] ${formatDrops(claim.amount)} accumulated`);
              claimsThisSession.push(claim);
              paymentsForThisUnit++;
              
              // Update the service contract subscription with latest claim
              serviceContract.updateSubscription(consumer.channelId, claim.amount);
            }
          } else if (!isVerified) {
            console.log(`   ⚠️  [CONSUMER] Skipping payment - work verification failed`);
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
    
    // Complete the subscription on the service contract
    serviceContract.removeSubscription(consumer.channelId);
    console.log(`   ✓ Service subscription completed`);
    console.log(`   Active subscriptions: ${serviceContract.getActiveSubscriptionCount()}`);
    
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
