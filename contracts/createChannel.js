/**
 * createChannel.js
 * Executes the PaymentChannelCreate transaction on XRPL
 * 
 * This establishes a payment channel between sender and receiver, locking XRP
 * that can be streamed off-chain with zero transaction fees.
 */

const xrpl = require('xrpl');
const { getClient } = require('../src/utils/xrplClient');
const config = require('../config');

/**
 * Creates a new payment channel on the XRPL
 * @param {string} senderWallet - Wallet object of the sender
 * @param {string} destinationAddress - XRPL address of the receiver
 * @param {string} amount - Amount of XRP to lock in drops (1 XRP = 1,000,000 drops)
 * @param {number} settleDelay - Time in seconds before sender can recover funds after close
 * @param {string} publicKey - Public key of the sender for signature verification
 * @returns {Promise<object>} Transaction result with channel ID
 */
async function createChannel(senderWallet, destinationAddress, amount, settleDelay = config.DEFAULT_SETTLE_DELAY, publicKey = null) {
  const client = await getClient();
  
  try {
    // Use the wallet's public key if not provided
    const channelPublicKey = publicKey || senderWallet.publicKey;
    
    // Prepare the PaymentChannelCreate transaction
    const channelTx = {
      TransactionType: 'PaymentChannelCreate',
      Account: senderWallet.address,
      Destination: destinationAddress,
      Amount: amount.toString(),
      SettleDelay: settleDelay,
      PublicKey: channelPublicKey,
      // Optional: Add a CancelAfter to auto-expire the channel
      // CancelAfter: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30), // 30 days
    };
    
    console.log('Creating payment channel...');
    console.log(`Sender: ${senderWallet.address}`);
    console.log(`Destination: ${destinationAddress}`);
    console.log(`Amount: ${amount} drops (${parseInt(amount) / 1000000} XRP)`);
    console.log(`Settle Delay: ${settleDelay} seconds`);
    
    // Submit and wait for validation
    const prepared = await client.autofill(channelTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
    
    // Extract the channel ID from the transaction metadata
    // Look through AffectedNodes for the created PayChannel
    let channelId = null;
    
    if (result.result.meta.AffectedNodes) {
      for (const node of result.result.meta.AffectedNodes) {
        if (node.CreatedNode && node.CreatedNode.LedgerEntryType === 'PayChannel') {
          channelId = node.CreatedNode.LedgerIndex;
          break;
        }
      }
    }
    
    // Fallback: If still not found, try using account_channels
    if (!channelId) {
      console.log('⚠️  Channel ID not found in metadata, querying ledger...');
      try {
        const channelsResponse = await client.request({
          command: 'account_channels',
          account: senderWallet.address,
          ledger_index: 'validated'
        });
        
        // Get the most recently created channel
        if (channelsResponse.result.channels && channelsResponse.result.channels.length > 0) {
          const channels = channelsResponse.result.channels;
          const latestChannel = channels[channels.length - 1];
          channelId = latestChannel.channel_id;
        }
      } catch (err) {
        console.error('Error querying channels:', err.message);
      }
    }
    
    console.log('✓ Payment channel created successfully!');
    console.log(`Channel ID: ${channelId}`);
    console.log(`Transaction hash: ${result.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: result.result.hash,
      senderAddress: senderWallet.address,
      destinationAddress,
      amount,
      settleDelay,
      ledgerIndex: result.result.ledger_index,
    };
    
  } catch (error) {
    console.error('Error creating payment channel:', error);
    throw error;
  }
}

/**
 * Retrieves channel details from the ledger
 * @param {string} channelId - The payment channel ID
 * @returns {Promise<object>} Channel information
 */
async function getChannelInfo(channelId) {
  const client = await getClient();
  
  try {
    const response = await client.request({
      command: 'ledger_entry',
      index: channelId,
      ledger_index: 'validated',
    });
    
    return response.result.node;
  } catch (error) {
    console.error('Error fetching channel info:', error);
    throw error;
  }
}

module.exports = {
  createChannel,
  getChannelInfo,
};

