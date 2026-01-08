/**
 * contract.js
 * Service Contract system for agent-to-agent service discovery and streaming
 * 
 * Contracts define services that agents offer, allowing other agents to discover
 * and establish payment channels for those services automatically.
 * 
 * PRICING MODEL:
 * - frequency: Number (in seconds) - how often streaming packets are sent
 * - costPerInterval: String (XRP drops) - cost per frequency interval
 * - rate: String (calculated) - drops/second (costPerInterval / frequency)
 * - unit: String - description of what customer gets (e.g., 'per MB-hour')
 * 
 * This makes verification simple: check if packets arrive at expected frequency
 * with expected cost. Services use smallest quantum units for easy scaling.
 * 
 * Examples:
 * - Video streaming: frequency=1s, cost=100 drops/s
 * - API access: frequency=0.1s (10 calls/sec), cost=1 drop/call
 * - Data storage: frequency=3600s (1hr), cost=2 drops/MB-hr
 * - Compute service: frequency=1s, cost=3 drops/CPU-sec
 */

const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * Service Contract
 * 
 * Defines a service that an agent offers and the payment terms
 */
class ServiceContract extends EventEmitter {
  constructor(config) {
    super();
    
    this.id = config.id || this._generateId();
    this.agentAddress = config.agentAddress; // XRPL address of service provider
    this.agentPublicKey = config.agentPublicKey;
    
    // Service metadata
    this.name = config.name;
    this.description = config.description;
    this.serviceType = config.serviceType; // 'video', 'api', 'storage', 'compute', 'custom'
    this.category = config.category; // 'media', 'data', 'infrastructure', etc.
    this.version = config.version || '1.0.0';
    
    // Payment terms - simplified for easy verification
    this.pricing = {
      frequency: config.pricing?.frequency || 1, // Seconds between streaming packets (packet send interval)
      costPerInterval: config.pricing?.costPerInterval || '1000', // XRP drops per frequency interval
      rate: null, // Calculated: drops/second (set below)
      unit: config.pricing?.unit || 'second', // Description: 'per second', 'per MB-hour', 'per call', etc.
      minChannelAmount: config.pricing?.minChannelAmount || '10000000', // 10 XRP minimum
      recommendedChannelAmount: config.pricing?.recommendedChannelAmount || '100000000', // 100 XRP recommended
      currency: 'XRP',
    };
    
    // Calculate rate (drops/second) from frequency and cost
    this.pricing.rate = Math.floor(parseFloat(this.pricing.costPerInterval) / this.pricing.frequency).toString();
    
    // Service configuration
    this.config = {
      maxConcurrentStreams: config.maxConcurrentStreams || 10,
      autoFinalizationThreshold: config.autoFinalizationThreshold || '50000000', // 50 XRP
      settleDelay: config.settleDelay || 3600,
      requiresAuthentication: config.requiresAuthentication !== undefined ? config.requiresAuthentication : false,
      metadata: config.metadata || {},
    };
    
    // Service endpoints/access
    this.endpoints = config.endpoints || [];
    
    // Status
    this.status = 'active'; // 'active', 'paused', 'inactive'
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    
    // Active subscriptions (consumers)
    this.activeSubscriptions = new Map(); // channelId -> subscription info
  }
  
  _generateId() {
    return `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Convert to JSON for storage/transmission
   */
  toJSON() {
    return {
      id: this.id,
      agentAddress: this.agentAddress,
      agentPublicKey: this.agentPublicKey,
      name: this.name,
      description: this.description,
      serviceType: this.serviceType,
      category: this.category,
      version: this.version,
      pricing: this.pricing,
      config: this.config,
      endpoints: this.endpoints,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
  
  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new ServiceContract(json);
  }
  
  /**
   * Register a new subscription (consumer started streaming)
   */
  addSubscription(channelId, consumerAddress, metadata = {}) {
    const subscription = {
      channelId,
      consumerAddress,
      startedAt: Date.now(),
      lastClaimAt: null,
      totalClaimed: '0',
      status: 'active',
      ...metadata,
    };
    
    this.activeSubscriptions.set(channelId, subscription);
    this.emit('subscriptionAdded', subscription);
    
    return subscription;
  }
  
  /**
   * Update subscription when claim is received
   */
  updateSubscription(channelId, claimAmount) {
    const subscription = this.activeSubscriptions.get(channelId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }
    
    subscription.lastClaimAt = Date.now();
    subscription.totalClaimed = claimAmount;
    
    this.emit('subscriptionUpdated', subscription);
  }
  
  /**
   * Remove subscription (consumer stopped streaming)
   */
  removeSubscription(channelId) {
    const subscription = this.activeSubscriptions.get(channelId);
    if (subscription) {
      subscription.status = 'completed';
      subscription.endedAt = Date.now();
      this.activeSubscriptions.delete(channelId);
      this.emit('subscriptionRemoved', subscription);
    }
  }
  
  /**
   * Get active subscription count
   */
  getActiveSubscriptionCount() {
    return this.activeSubscriptions.size;
  }
  
  /**
   * Check if service can accept new subscriptions
   */
  canAcceptNewSubscription() {
    return (
      this.status === 'active' &&
      this.activeSubscriptions.size < this.config.maxConcurrentStreams
    );
  }
  
  /**
   * Calculate recommended channel amount for duration (in seconds)
   * @param {number} durationSeconds - Duration in seconds
   * @returns {string} Amount in drops with 20% buffer
   */
  calculateChannelAmount(durationSeconds) {
    const rate = BigInt(this.pricing.rate); // drops per second
    const duration = BigInt(Math.floor(durationSeconds));
    const amount = rate * duration;
    
    // Add 20% buffer
    const buffered = (amount * 120n) / 100n;
    
    return buffered.toString();
  }
  
  /**
   * Validate if a channel amount is sufficient
   */
  validateChannelAmount(amount) {
    const amountBigInt = BigInt(amount);
    const minAmount = BigInt(this.pricing.minChannelAmount);
    
    return amountBigInt >= minAmount;
  }
  
  /**
   * Pause the service (stop accepting new subscriptions)
   */
  pause() {
    this.status = 'paused';
    this.updatedAt = Date.now();
    this.emit('statusChanged', { status: 'paused' });
  }
  
  /**
   * Resume the service
   */
  resume() {
    this.status = 'active';
    this.updatedAt = Date.now();
    this.emit('statusChanged', { status: 'active' });
  }
  
  /**
   * Deactivate the service
   */
  deactivate() {
    this.status = 'inactive';
    this.updatedAt = Date.now();
    this.emit('statusChanged', { status: 'inactive' });
  }
}

/**
 * Contract Registry
 * 
 * Manages service contracts in-memory with JSON serialization support
 */
class ContractRegistry {
  constructor() {
    this.contracts = new Map(); // contractId -> ServiceContract
    this.agents = new Map(); // agentAddress -> agent metadata
  }
  
  /**
   * Register a new service contract
   */
  registerContract(contract) {
    if (!(contract instanceof ServiceContract)) {
      contract = new ServiceContract(contract);
    }
    
    // Track agent
    if (!this.agents.has(contract.agentAddress)) {
      this.agents.set(contract.agentAddress, {
        address: contract.agentAddress,
        publicKey: contract.agentPublicKey,
        registeredAt: Date.now(),
      });
    }
    
    // Store contract
    this.contracts.set(contract.id, contract);
    
    console.log(`✓ Registered contract: ${contract.name} (${contract.id})`);
    
    return contract;
  }
  
  /**
   * Get a contract by ID
   */
  getContract(contractId) {
    return this.contracts.get(contractId) || null;
  }
  
  /**
   * Get all contracts for an agent
   */
  getAgentContracts(agentAddress) {
    return Array.from(this.contracts.values())
      .filter(c => c.agentAddress === agentAddress);
  }
  
  /**
   * Discover contracts by service type
   */
  discoverByServiceType(serviceType) {
    return Array.from(this.contracts.values())
      .filter(c => c.serviceType === serviceType && c.status === 'active');
  }
  
  /**
   * Discover contracts by category
   */
  discoverByCategory(category) {
    return Array.from(this.contracts.values())
      .filter(c => c.category === category && c.status === 'active');
  }
  
  /**
   * Search contracts by keyword
   */
  search(query) {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.contracts.values())
      .filter(c => 
        c.status === 'active' && (
          c.name.toLowerCase().includes(lowerQuery) ||
          c.description.toLowerCase().includes(lowerQuery) ||
          c.serviceType.toLowerCase().includes(lowerQuery) ||
          c.category.toLowerCase().includes(lowerQuery)
        )
      );
  }
  
  /**
   * Get all active contracts
   */
  getAllActive() {
    return Array.from(this.contracts.values())
      .filter(c => c.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  
  /**
   * Update a contract
   */
  updateContract(contractId, updates) {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      throw new Error(`Contract ${contractId} not found`);
    }
    
    Object.assign(contract, updates);
    contract.updatedAt = Date.now();
    
    return contract;
  }
  
  /**
   * Remove a contract
   */
  removeContract(contractId) {
    const deleted = this.contracts.delete(contractId);
    
    if (deleted) {
      console.log(`✓ Removed contract: ${contractId}`);
    }
    
    return deleted;
  }
  
  /**
   * Get registry statistics
   */
  getStats() {
    const contracts = Array.from(this.contracts.values());
    const active = contracts.filter(c => c.status === 'active').length;
    const paused = contracts.filter(c => c.status === 'paused').length;
    const inactive = contracts.filter(c => c.status === 'inactive').length;
    
    const byType = {};
    const byCategory = {};
    
    for (const contract of contracts) {
      byType[contract.serviceType] = (byType[contract.serviceType] || 0) + 1;
      byCategory[contract.category] = (byCategory[contract.category] || 0) + 1;
    }
    
    return {
      total: contracts.length,
      active,
      paused,
      inactive,
      providers: this.agents.size,
      byType,
      byCategory,
    };
  }
  
  /**
   * Export registry to JSON
   */
  toJSON() {
    return {
      contracts: Array.from(this.contracts.values()).map(c => c.toJSON()),
      agents: Array.from(this.agents.values()),
      exportedAt: Date.now(),
    };
  }
  
  /**
   * Import registry from JSON
   */
  fromJSON(json) {
    this.contracts.clear();
    this.agents.clear();
    
    if (json.contracts) {
      for (const contractData of json.contracts) {
        const contract = ServiceContract.fromJSON(contractData);
        this.contracts.set(contract.id, contract);
      }
    }
    
    if (json.agents) {
      for (const agentData of json.agents) {
        this.agents.set(agentData.address, agentData);
      }
    }
    
    console.log(`✓ Imported ${this.contracts.size} contracts and ${this.agents.size} agents`);
  }
}

// Singleton registry instance
let registryInstance = null;

/**
 * Get the singleton contract registry
 */
function getContractRegistry() {
  if (!registryInstance) {
    registryInstance = new ContractRegistry();
  }
  return registryInstance;
}

/**
 * Create a contract from a template
 */
function createContractFromTemplate(templateName, agentAddress, agentPublicKey, customConfig = {}) {
  const templates = {
    'video-streaming': {
      name: 'Video Streaming Service',
      description: 'High-quality video streaming with per-second billing',
      serviceType: 'video',
      category: 'media',
      pricing: {
        frequency: 1, // Send payment packet every 1 second
        costPerInterval: '100', // 100 drops per second (0.0001 XRP/sec)
        unit: 'per second of video',
        minChannelAmount: '10000000', // 10 XRP
        recommendedChannelAmount: '100000000', // 100 XRP
      },
      maxConcurrentStreams: 100,
    },
    
    'api-access': {
      name: 'API Access Service',
      description: 'Pay-per-request API access with rate limiting',
      serviceType: 'api',
      category: 'infrastructure',
      pricing: {
        frequency: 0.1, // Up to 10 API calls per second (packet every 0.1s)
        costPerInterval: '1', // 1 drop per call (10 drops/sec if at rate limit)
        unit: 'per API call',
        minChannelAmount: '1000000', // 1 XRP
        recommendedChannelAmount: '10000000', // 10 XRP
      },
      maxConcurrentStreams: 1000,
    },
    
    'data-storage': {
      name: 'Data Storage Service',
      description: 'Decentralized data storage billed per MB-hour (smallest quantum for scaling)',
      serviceType: 'storage',
      category: 'infrastructure',
      pricing: {
        frequency: 3600, // Check/bill every hour (1 hour = 3600 seconds)
        costPerInterval: '2', // 2 drops per MB per hour (~1.4 drops/GB-month)
        unit: 'per MB-hour',
        minChannelAmount: '5000000', // 5 XRP
        recommendedChannelAmount: '50000000', // 50 XRP
      },
      maxConcurrentStreams: 50,
    },
    
    'compute-service': {
      name: 'Compute Service',
      description: 'On-demand compute resources billed per CPU-second',
      serviceType: 'compute',
      category: 'infrastructure',
      pricing: {
        frequency: 1, // Bill every second
        costPerInterval: '3', // 3 drops/second (~10,800 drops/hour = 0.0108 XRP/CPU-hour)
        unit: 'per CPU-second',
        minChannelAmount: '10000000', // 10 XRP
        recommendedChannelAmount: '100000000', // 100 XRP
      },
      maxConcurrentStreams: 20,
    },
  };
  
  const template = templates[templateName];
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }
  
  return new ServiceContract({
    agentAddress,
    agentPublicKey,
    ...template,
    ...customConfig,
  });
}

module.exports = {
  ServiceContract,
  ContractRegistry,
  getContractRegistry,
  createContractFromTemplate,
};
