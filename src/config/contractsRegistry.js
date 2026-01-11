/**
 * contractsRegistry.js
 * Dynamic streaming contracts registry
 * 
 * Allows providers to register their services and users to discover them.
 * Supports full CRUD operations for contract management.
 * 
 * Benefits:
 * - Providers can register their own services
 * - Users discover available services dynamically
 * - Prevents payment term manipulation (set by provider)
 * - Centralized service marketplace
 */

// In-memory storage (use database in production)
const STREAMING_CONTRACTS = new Map();

// Initialize with some default contracts
const DEFAULT_CONTRACTS = {
  // ════════════════════════════════════════════════════════════════
  // M2M / IoT Payment Contracts
  // ════════════════════════════════════════════════════════════════
  
  'coffee-machine-basic': {
    currency: 'RLUSD',
    totalAmount: '5.00',
    duration: 300,
    intervalSeconds: 10,
    description: 'Basic coffee machine usage - $5 for 5 minutes',
    category: 'iot-payment',
    displayName: '☕ Coffee Machine (Basic)',
  },
  
  'ev-charger-fast': {
    currency: 'XRP',
    ratePerSecond: '100000',
    description: 'Fast EV charging station - DC Fast Charge',
    category: 'iot-payment',
    displayName: '⚡ EV Charger (Fast)',
  },
  
  'parking-meter-hourly': {
    currency: 'XRP',
    ratePerSecond: '2778',
    description: 'Downtown parking - hourly rate',
    category: 'iot-payment',
    displayName: '🅿️ Parking Meter (Hourly)',
  },
  
  // ════════════════════════════════════════════════════════════════
  // Subscription Services
  // ════════════════════════════════════════════════════════════════
  
  'api-basic-monthly': {
    currency: 'RLUSD',
    totalAmount: '29.00',
    duration: 2592000,
    intervalSeconds: 86400,
    description: 'Basic API tier - 10k requests/month',
    category: 'subscription',
    displayName: '🔌 API Access (Basic)',
  },
  
  // ════════════════════════════════════════════════════════════════
  // Streaming Media / Content
  // ════════════════════════════════════════════════════════════════
  
  'music-stream-hourly': {
    currency: 'XRP',
    ratePerSecond: '1000',
    description: 'Music streaming service - per hour',
    category: 'media',
    displayName: '🎵 Music Streaming',
  },
  
  'video-stream-hd': {
    currency: 'XRP',
    ratePerSecond: '5000',
    description: 'Video streaming - HD quality',
    category: 'media',
    displayName: '📺 Video Stream (HD)',
  },
  
  // ════════════════════════════════════════════════════════════════
  // Test Contracts
  // ════════════════════════════════════════════════════════════════
  
  'test-micro-payment': {
    currency: 'RLUSD',
    totalAmount: '0.10',
    duration: 60,
    intervalSeconds: 10,
    description: 'Test contract - micro payment stream',
    category: 'test',
    displayName: '🧪 Test Micro Payment',
  },
};

/**
 * Initialize default contracts
 */
function initializeDefaults() {
  if (STREAMING_CONTRACTS.size === 0) {
    Object.entries(DEFAULT_CONTRACTS).forEach(([id, contract]) => {
      STREAMING_CONTRACTS.set(id, {
        ...contract,
        contractId: id,
        providerId: 'system',
        providerAddress: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: 'active',
      });
    });
    console.log(`✓ Initialized ${STREAMING_CONTRACTS.size} default contracts`);
  }
}

/**
 * Create a new contract (Provider endpoint)
 * @param {Object} contractData - Contract configuration
 * @param {string} providerId - Provider identifier (wallet address or user ID)
 * @returns {Object} Created contract with ID
 */
function createContract(contractData, providerId) {
  // Validate required fields
  const required = ['currency', 'displayName', 'description', 'category'];
  for (const field of required) {
    if (!contractData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate currency-specific fields
  if (contractData.currency === 'RLUSD') {
    if (!contractData.totalAmount || !contractData.duration) {
      throw new Error('RLUSD contracts require totalAmount and duration');
    }
  } else if (contractData.currency === 'XRP') {
    if (!contractData.ratePerSecond) {
      throw new Error('XRP contracts require ratePerSecond');
    }
  }
  
  // Generate contract ID
  const contractId = contractData.contractId || 
    `${providerId}-${contractData.category}-${Date.now()}`.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');
  
  // Check if contract ID already exists
  if (STREAMING_CONTRACTS.has(contractId)) {
    throw new Error(`Contract ID already exists: ${contractId}`);
  }
  
  const contract = {
    contractId,
    providerId,
    providerAddress: contractData.providerAddress || null,
    currency: contractData.currency,
    displayName: contractData.displayName,
    description: contractData.description,
    category: contractData.category,
    
    // Currency-specific fields
    ...(contractData.currency === 'RLUSD' && {
      totalAmount: contractData.totalAmount,
      duration: contractData.duration || 3600,
      intervalSeconds: contractData.intervalSeconds || 10,
    }),
    ...(contractData.currency === 'XRP' && {
      ratePerSecond: contractData.ratePerSecond,
    }),
    
    // Optional fields
    metadata: contractData.metadata || {},
    tags: contractData.tags || [],
    
    // System fields
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'active',
  };
  
  STREAMING_CONTRACTS.set(contractId, contract);
  console.log(`✓ Created contract: ${contractId} by ${providerId}`);
  
  return contract;
}

/**
 * Update an existing contract (Provider endpoint)
 * @param {string} contractId - Contract ID to update
 * @param {Object} updates - Fields to update
 * @param {string} providerId - Provider identifier (for authorization)
 * @returns {Object} Updated contract
 */
function updateContract(contractId, updates, providerId) {
  const contract = STREAMING_CONTRACTS.get(contractId);
  
  if (!contract) {
    throw new Error(`Contract not found: ${contractId}`);
  }
  
  // Authorization: only contract owner can update (or system admin)
  if (contract.providerId !== providerId && providerId !== 'system') {
    throw new Error('Unauthorized: You can only update your own contracts');
  }
  
  // Prevent changing critical fields
  const immutableFields = ['contractId', 'providerId', 'createdAt'];
  for (const field of immutableFields) {
    if (updates[field] !== undefined) {
      delete updates[field];
    }
  }
  
  // Update contract
  Object.assign(contract, updates, {
    updatedAt: Date.now(),
  });
  
  STREAMING_CONTRACTS.set(contractId, contract);
  console.log(`✓ Updated contract: ${contractId}`);
  
  return contract;
}

/**
 * Delete a contract (Provider endpoint)
 * @param {string} contractId - Contract ID to delete
 * @param {string} providerId - Provider identifier (for authorization)
 * @returns {boolean} True if deleted
 */
function deleteContract(contractId, providerId) {
  const contract = STREAMING_CONTRACTS.get(contractId);
  
  if (!contract) {
    throw new Error(`Contract not found: ${contractId}`);
  }
  
  // Authorization: only contract owner can delete (or system admin)
  if (contract.providerId !== providerId && providerId !== 'system') {
    throw new Error('Unauthorized: You can only delete your own contracts');
  }
  
  STREAMING_CONTRACTS.delete(contractId);
  console.log(`✓ Deleted contract: ${contractId}`);
  
  return true;
}

/**
 * Get a specific contract by ID (Public endpoint)
 * @param {string} contractId - The contract identifier
 * @returns {Object} Contract configuration
 * @throws {Error} If contract not found
 */
function getContract(contractId) {
  const contract = STREAMING_CONTRACTS.get(contractId);
  
  if (!contract) {
    throw new Error(`Contract not found: ${contractId}`);
  }
  
  return contract;
}

/**
 * List all contracts or filter by category/provider (Public endpoint)
 * @param {Object} filters - Optional filters
 * @returns {Array} Array of contract objects
 */
function listContracts(filters = {}) {
  let contracts = Array.from(STREAMING_CONTRACTS.values());
  
  // Filter by category
  if (filters.category) {
    contracts = contracts.filter(c => c.category === filters.category);
  }
  
  // Filter by provider
  if (filters.providerId) {
    contracts = contracts.filter(c => c.providerId === filters.providerId);
  }
  
  // Filter by currency
  if (filters.currency) {
    contracts = contracts.filter(c => c.currency === filters.currency);
  }
  
  // Filter by status
  if (filters.status) {
    contracts = contracts.filter(c => c.status === filters.status);
  } else {
    // Default: only show active contracts
    contracts = contracts.filter(c => c.status === 'active');
  }
  
  // Sort by creation date (newest first)
  contracts.sort((a, b) => b.createdAt - a.createdAt);
  
  return contracts;
}

/**
 * Get all available categories with counts (Public endpoint)
 * @returns {Array} Array of category names with counts
 */
function getCategories() {
  const categories = {};
  
  STREAMING_CONTRACTS.forEach((contract) => {
    if (contract.status !== 'active') return;
    
    const cat = contract.category;
    if (!categories[cat]) {
      categories[cat] = {
        category: cat,
        count: 0,
        contracts: [],
      };
    }
    categories[cat].count++;
    categories[cat].contracts.push(contract.contractId);
  });
  
  return Object.values(categories);
}

/**
 * Search contracts by keyword (Public endpoint)
 * @param {string} keyword - Search term
 * @returns {Array} Matching contracts
 */
function searchContracts(keyword) {
  const searchTerm = keyword.toLowerCase();
  
  return Array.from(STREAMING_CONTRACTS.values())
    .filter(contract => {
      return (
        contract.status === 'active' &&
        (contract.contractId.toLowerCase().includes(searchTerm) ||
         contract.description.toLowerCase().includes(searchTerm) ||
         contract.displayName.toLowerCase().includes(searchTerm) ||
         contract.category.toLowerCase().includes(searchTerm))
      );
    });
}

/**
 * Get registry statistics (Public endpoint)
 * @returns {Object} Statistics about the registry
 */
function getStats() {
  const all = Array.from(STREAMING_CONTRACTS.values());
  const active = all.filter(c => c.status === 'active');
  
  const byCategory = {};
  const byCurrency = {};
  const providers = new Set();
  
  active.forEach(contract => {
    byCategory[contract.category] = (byCategory[contract.category] || 0) + 1;
    byCurrency[contract.currency] = (byCurrency[contract.currency] || 0) + 1;
    providers.add(contract.providerId);
  });
  
  return {
    total: all.length,
    active: active.length,
    inactive: all.length - active.length,
    byCategory,
    byCurrency,
    providers: providers.size,
  };
}

// Initialize default contracts on module load
initializeDefaults();

module.exports = {
  createContract,
  updateContract,
  deleteContract,
  getContract,
  listContracts,
  getCategories,
  searchContracts,
  getStats,
};
