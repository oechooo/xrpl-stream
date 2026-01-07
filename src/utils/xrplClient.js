/**
 * xrplClient.js
 * Singleton XRPL client with auto-reconnect logic
 * 
 * Manages connection to the XRPL network (testnet/mainnet) with automatic
 * reconnection to ensure streaming isn't interrupted by network drops.
 */

const xrpl = require('xrpl');

class XRPLClient {
  constructor() {
    this.client = null;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 2000; // 2 seconds
    this.listeners = {
      connected: [],
      disconnected: [],
      error: [],
    };
  }
  
  /**
   * Get network URL from environment or use default
   */
  getNetworkUrl() {
    const network = process.env.XRPL_NETWORK || 'testnet';
    
    const networks = {
      mainnet: 'wss://xrplcluster.com',
      testnet: 'wss://s.altnet.rippletest.net:51233',
      devnet: 'wss://s.devnet.rippletest.net:51233',
    };
    
    return process.env.XRPL_URL || networks[network] || networks.testnet;
  }
  
  /**
   * Connect to XRPL network
   */
  async connect() {
    if (this.client && this.client.isConnected()) {
      return this.client;
    }
    
    if (this.isConnecting) {
      // Wait for existing connection attempt
      return this.waitForConnection();
    }
    
    this.isConnecting = true;
    
    try {
      const url = this.getNetworkUrl();
      console.log(`Connecting to XRPL at ${url}...`);
      
      this.client = new xrpl.Client(url, {
        connectionTimeout: 10000,
      });
      
      // Set up event listeners
      this.setupEventListeners();
      
      await this.client.connect();
      
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      
      console.log('✓ Connected to XRPL successfully');
      this.emit('connected', this.client);
      
      return this.client;
      
    } catch (error) {
      this.isConnecting = false;
      console.error('Error connecting to XRPL:', error);
      
      // Attempt reconnection
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
        
        // Exponential backoff
        this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
        
        return this.connect();
      }
      
      this.emit('error', error);
      throw new Error(`Failed to connect to XRPL after ${this.maxReconnectAttempts} attempts`);
    }
  }
  
  /**
   * Set up client event listeners for auto-reconnect
   */
  setupEventListeners() {
    if (!this.client) return;
    
    this.client.on('disconnected', async (code) => {
      console.warn(`XRPL client disconnected with code ${code}`);
      this.emit('disconnected', code);
      
      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log('Attempting to reconnect...');
        try {
          await this.connect();
        } catch (error) {
          console.error('Reconnection failed:', error);
        }
      }
    });
    
    this.client.on('error', (errorCode, errorMessage) => {
      console.error(`XRPL client error ${errorCode}: ${errorMessage}`);
      this.emit('error', { code: errorCode, message: errorMessage });
    });
    
    this.client.on('connected', () => {
      console.log('✓ XRPL client connected');
    });
  }
  
  /**
   * Wait for pending connection attempt
   */
  async waitForConnection(timeout = 30000) {
    const startTime = Date.now();
    
    while (this.isConnecting) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Connection timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!this.client || !this.client.isConnected()) {
      throw new Error('Connection failed');
    }
    
    return this.client;
  }
  
  /**
   * Disconnect from XRPL
   */
  async disconnect() {
    if (this.client && this.client.isConnected()) {
      console.log('Disconnecting from XRPL...');
      await this.client.disconnect();
      this.client = null;
      console.log('✓ Disconnected from XRPL');
    }
  }
  
  /**
   * Check if client is connected
   */
  isConnected() {
    return this.client && this.client.isConnected();
  }
  
  /**
   * Get the current client instance
   */
  getClient() {
    return this.client;
  }
  
  /**
   * Event emitter methods
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }
  
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
  
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }
  
  /**
   * Get account info
   */
  async getAccountInfo(address) {
    const client = await this.connect();
    
    try {
      const response = await client.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated',
      });
      
      return response.result.account_data;
    } catch (error) {
      console.error('Error getting account info:', error);
      throw error;
    }
  }
  
  /**
   * Get account balance in XRP
   */
  async getBalance(address) {
    const accountInfo = await this.getAccountInfo(address);
    return parseFloat(accountInfo.Balance) / 1000000;
  }
  
  /**
   * Submit a transaction
   */
  async submitTransaction(transaction, wallet) {
    const client = await this.connect();
    
    try {
      const prepared = await client.autofill(transaction);
      const signed = wallet.sign(prepared);
      const result = await client.submitAndWait(signed.tx_blob);
      
      return result;
    } catch (error) {
      console.error('Error submitting transaction:', error);
      throw error;
    }
  }
  
  /**
   * Get ledger index
   */
  async getLedgerIndex() {
    const client = await this.connect();
    
    try {
      const response = await client.request({
        command: 'ledger',
        ledger_index: 'validated',
      });
      
      return response.result.ledger_index;
    } catch (error) {
      console.error('Error getting ledger index:', error);
      throw error;
    }
  }
  
  /**
   * Subscribe to account transactions
   */
  async subscribeToAccount(address, callback) {
    const client = await this.connect();
    
    try {
      await client.request({
        command: 'subscribe',
        accounts: [address],
      });
      
      client.on('transaction', (tx) => {
        if (tx.transaction.Account === address || tx.transaction.Destination === address) {
          callback(tx);
        }
      });
      
      console.log(`✓ Subscribed to transactions for ${address}`);
    } catch (error) {
      console.error('Error subscribing to account:', error);
      throw error;
    }
  }
  
  /**
   * Unsubscribe from account transactions
   */
  async unsubscribeFromAccount(address) {
    const client = await this.connect();
    
    try {
      await client.request({
        command: 'unsubscribe',
        accounts: [address],
      });
      
      console.log(`✓ Unsubscribed from transactions for ${address}`);
    } catch (error) {
      console.error('Error unsubscribing from account:', error);
      throw error;
    }
  }
}

// Singleton instance
let clientInstance = null;

/**
 * Get the singleton XRPL client instance
 */
async function getClient() {
  if (!clientInstance) {
    clientInstance = new XRPLClient();
  }
  
  await clientInstance.connect();
  return clientInstance.getClient();
}

/**
 * Get the XRPL client manager instance
 */
function getClientManager() {
  if (!clientInstance) {
    clientInstance = new XRPLClient();
  }
  
  return clientInstance;
}

/**
 * Reset the client instance (mainly for testing)
 */
async function resetClient() {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}

module.exports = {
  XRPLClient,
  getClient,
  getClientManager,
  resetClient,
};

