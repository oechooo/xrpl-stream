/**
 * channelStore.js
 * Local database/cache logic for tracking payment channel state
 * 
 * Since streaming happens off-chain, we need to track the highest signed
 * amount received so far and other channel metadata locally.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * In-memory storage with file persistence
 * For production, consider using Redis, SQLite, or PostgreSQL
 */
class ChannelStore {
  constructor(storePath = './data/channels.json') {
    this.storePath = storePath;
    this.channels = new Map();
    this.claimHistory = new Map();
    this.initialized = false;
  }
  
  /**
   * Initialize the store (load from disk if exists)
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Ensure data directory exists
      const dir = path.dirname(this.storePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Load existing data if available
      try {
        const data = await fs.readFile(this.storePath, 'utf8');
        const parsed = JSON.parse(data);
        
        // Restore channels
        if (parsed.channels) {
          this.channels = new Map(Object.entries(parsed.channels));
        }
        
        // Restore claim history
        if (parsed.claimHistory) {
          this.claimHistory = new Map(
            Object.entries(parsed.claimHistory).map(([k, v]) => [k, v || []])
          );
        }
        
        console.log(`✓ Loaded ${this.channels.size} channels from storage`);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          console.error('Error loading channel store:', err);
        }
        // File doesn't exist yet, start fresh
        console.log('✓ Initialized new channel store');
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing channel store:', error);
      throw error;
    }
  }
  
  /**
   * Persist current state to disk
   */
  async persist() {
    try {
      const data = {
        channels: Object.fromEntries(this.channels),
        claimHistory: Object.fromEntries(this.claimHistory),
        lastUpdated: new Date().toISOString(),
      };
      
      await fs.writeFile(this.storePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('Error persisting channel store:', error);
      throw error;
    }
  }
  
  /**
   * Create or update channel data
   */
  async updateChannel(channelId, data) {
    await this.initialize();
    
    const existing = this.channels.get(channelId) || {};
    const updated = {
      ...existing,
      ...data,
      channelId,
      lastModified: Date.now(),
    };
    
    this.channels.set(channelId, updated);
    await this.persist();
    
    return updated;
  }
  
  /**
   * Get channel data
   */
  async getChannelData(channelId) {
    await this.initialize();
    return this.channels.get(channelId) || null;
  }
  
  /**
   * Get all channels
   */
  async getAllChannels() {
    await this.initialize();
    return Array.from(this.channels.values());
  }
  
  /**
   * Delete channel data
   */
  async deleteChannel(channelId) {
    await this.initialize();
    this.channels.delete(channelId);
    this.claimHistory.delete(channelId);
    await this.persist();
  }
  
  /**
   * Get the last valid amount for a channel
   */
  async getLastValidAmount(channelId) {
    await this.initialize();
    const channel = this.channels.get(channelId);
    return channel?.lastValidAmount || '0';
  }
  
  /**
   * Get the last finalized amount (actually claimed on-chain)
   */
  async getLastFinalizedAmount(channelId) {
    await this.initialize();
    const channel = this.channels.get(channelId);
    return channel?.lastFinalizedAmount || '0';
  }
  
  /**
   * Update finalized amount after on-chain claim
   */
  async updateFinalizedAmount(channelId, amount) {
    await this.initialize();
    
    const channel = this.channels.get(channelId) || {};
    channel.lastFinalizedAmount = amount;
    channel.lastFinalizationTime = Date.now();
    
    this.channels.set(channelId, channel);
    await this.persist();
    
    return channel;
  }
  
  /**
   * Add a claim to history
   */
  async addClaimToHistory(channelId, claim) {
    await this.initialize();
    
    const history = this.claimHistory.get(channelId) || [];
    history.push({
      ...claim,
      timestamp: Date.now(),
    });
    
    // Keep only last 1000 claims per channel to prevent memory issues
    if (history.length > 1000) {
      history.shift();
    }
    
    this.claimHistory.set(channelId, history);
    await this.persist();
  }
  
  /**
   * Get recent claims within a time window
   */
  async getRecentClaims(channelId, timeWindowMs = 60000) {
    await this.initialize();
    
    const history = this.claimHistory.get(channelId) || [];
    const cutoff = Date.now() - timeWindowMs;
    
    return history.filter(claim => claim.timestamp >= cutoff);
  }
  
  /**
   * Get full claim history for a channel
   */
  async getClaimHistory(channelId) {
    await this.initialize();
    return this.claimHistory.get(channelId) || [];
  }
  
  /**
   * Get channel statistics
   */
  async getChannelStats(channelId) {
    await this.initialize();
    
    const channel = this.channels.get(channelId);
    const history = this.claimHistory.get(channelId) || [];
    
    if (!channel) {
      return null;
    }
    
    const lastValid = BigInt(channel.lastValidAmount || '0');
    const lastFinalized = BigInt(channel.lastFinalizedAmount || '0');
    const unclaimed = lastValid - lastFinalized;
    
    return {
      channelId,
      lastValidAmount: channel.lastValidAmount,
      lastValidXRP: Number(lastValid) / 1000000,
      lastFinalizedAmount: channel.lastFinalizedAmount,
      lastFinalizedXRP: Number(lastFinalized) / 1000000,
      unclaimedAmount: unclaimed.toString(),
      unclaimedXRP: Number(unclaimed) / 1000000,
      totalClaims: history.length,
      lastUpdateTime: channel.lastUpdateTime,
      lastFinalizationTime: channel.lastFinalizationTime,
      createdAt: channel.createdAt,
    };
  }
  
  /**
   * Initialize a new channel in the store
   */
  async initializeChannel(channelId, metadata = {}) {
    await this.initialize();
    
    const channelData = {
      channelId,
      lastValidAmount: '0',
      lastFinalizedAmount: '0',
      createdAt: Date.now(),
      ...metadata,
    };
    
    this.channels.set(channelId, channelData);
    this.claimHistory.set(channelId, []);
    await this.persist();
    
    console.log(`✓ Initialized channel ${channelId} in store`);
    
    return channelData;
  }
  
  /**
   * Check if channel exists in store
   */
  async hasChannel(channelId) {
    await this.initialize();
    return this.channels.has(channelId);
  }
  
  /**
   * Clear all data (use with caution!)
   */
  async clearAll() {
    this.channels.clear();
    this.claimHistory.clear();
    await this.persist();
    console.log('✓ Cleared all channel data');
  }
}

// Singleton instance
let storeInstance = null;

/**
 * Get the singleton channel store instance
 */
function getChannelStore(storePath) {
  if (!storeInstance) {
    storeInstance = new ChannelStore(storePath);
  }
  return storeInstance;
}

/**
 * Reset the store instance (mainly for testing)
 */
function resetChannelStore() {
  storeInstance = null;
}

module.exports = {
  ChannelStore,
  getChannelStore,
  resetChannelStore,
};

