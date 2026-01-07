/**
 * claimChannel.js
 * Used by the receiver to submit the final signed claim to XRPL
 * 
 * This is when the XRP actually moves from the channel into the receiver's account.
 * Can also be used by sender to close/reclaim an expired channel.
 */

const xrpl = require('xrpl');
const { getClient } = require('../src/utils/xrplClient');
const { getChannelInfo } = require('./createChannel');

/**
 * Claims XRP from a payment channel (receiver's action)
 * @param {object} receiverWallet - Wallet object of the receiver
 * @param {string} channelId - The payment channel ID
 * @param {string} amount - Amount to claim in drops (must match signed claim)
 * @param {string} signature - Signature from sender authorizing this amount
 * @param {string} publicKey - Public key of the sender (for verification)
 * @returns {Promise<object>} Transaction result
 */
async function claimChannel(receiverWallet, channelId, amount, signature, publicKey) {
  const client = await getClient();
  
  try {
    // Verify the channel exists
    const channelInfo = await getChannelInfo(channelId);
    
    if (channelInfo.Destination !== receiverWallet.address) {
      throw new Error('This wallet is not the channel destination');
    }
    
    console.log('Claiming from payment channel...');
    console.log(`Channel ID: ${channelId}`);
    console.log(`Claiming: ${amount} drops (${parseInt(amount) / 1000000} XRP)`);
    console.log(`Current channel balance: ${channelInfo.Amount} drops`);
    
    // Prepare the PaymentChannelClaim transaction
    const claimTx = {
      TransactionType: 'PaymentChannelClaim',
      Account: receiverWallet.address,
      Channel: channelId,
      Amount: amount.toString(),
      Signature: signature,
      PublicKey: publicKey,
    };
    
    // Submit and wait for validation
    const prepared = await client.autofill(claimTx);
    const signed = receiverWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
    
    console.log('✓ Claim successful!');
    console.log(`Received: ${parseInt(amount) / 1000000} XRP`);
    console.log(`Transaction hash: ${result.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: result.result.hash,
      claimedAmount: amount,
      receiverAddress: receiverWallet.address,
      ledgerIndex: result.result.ledger_index,
    };
    
  } catch (error) {
    console.error('Error claiming from payment channel:', error);
    throw error;
  }
}

/**
 * Closes a payment channel completely (can be done by sender or receiver)
 * @param {object} wallet - Wallet object (sender or receiver)
 * @param {string} channelId - The payment channel ID
 * @param {object} options - Optional parameters for closing
 * @returns {Promise<object>} Transaction result
 */
async function closeChannel(wallet, channelId, options = {}) {
  const client = await getClient();
  
  try {
    const channelInfo = await getChannelInfo(channelId);
    const isSender = channelInfo.Account === wallet.address;
    const isReceiver = channelInfo.Destination === wallet.address;
    
    if (!isSender && !isReceiver) {
      throw new Error('Wallet is neither sender nor receiver of this channel');
    }
    
    console.log(`Closing payment channel as ${isSender ? 'sender' : 'receiver'}...`);
    console.log(`Channel ID: ${channelId}`);
    
    // Prepare the PaymentChannelClaim transaction for closing
    const closeTx = {
      TransactionType: 'PaymentChannelClaim',
      Account: wallet.address,
      Channel: channelId,
      Flags: 0x00010000, // tfClose flag
    };
    
    // If receiver is closing with final claim
    if (isReceiver && options.finalAmount && options.signature && options.publicKey) {
      closeTx.Amount = options.finalAmount.toString();
      closeTx.Signature = options.signature;
      closeTx.PublicKey = options.publicKey;
      console.log(`Final claim amount: ${parseInt(options.finalAmount) / 1000000} XRP`);
    }
    
    // Submit and wait for validation
    const prepared = await client.autofill(closeTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
    
    console.log('✓ Channel closed successfully!');
    console.log(`Transaction hash: ${result.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: result.result.hash,
      closedBy: isSender ? 'sender' : 'receiver',
      ledgerIndex: result.result.ledger_index,
    };
    
  } catch (error) {
    console.error('Error closing payment channel:', error);
    throw error;
  }
}

/**
 * Initiates the settle period for a channel (sender only)
 * After settle delay expires, sender can reclaim remaining funds
 * @param {object} senderWallet - Wallet object of the sender
 * @param {string} channelId - The payment channel ID
 * @returns {Promise<object>} Transaction result
 */
async function initiateSettle(senderWallet, channelId) {
  const client = await getClient();
  
  try {
    const channelInfo = await getChannelInfo(channelId);
    
    if (channelInfo.Account !== senderWallet.address) {
      throw new Error('Only the channel sender can initiate settlement');
    }
    
    console.log('Initiating settlement period...');
    console.log(`Channel ID: ${channelId}`);
    console.log(`Settle delay: ${channelInfo.SettleDelay} seconds`);
    
    // PaymentChannelClaim without close flag initiates settlement
    const settleTx = {
      TransactionType: 'PaymentChannelClaim',
      Account: senderWallet.address,
      Channel: channelId,
    };
    
    const prepared = await client.autofill(settleTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
    
    const settleTime = new Date(Date.now() + channelInfo.SettleDelay * 1000);
    
    console.log('✓ Settlement initiated!');
    console.log(`Can close after: ${settleTime.toISOString()}`);
    console.log(`Transaction hash: ${result.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: result.result.hash,
      settleDelay: channelInfo.SettleDelay,
      canCloseAfter: settleTime,
      ledgerIndex: result.result.ledger_index,
    };
    
  } catch (error) {
    console.error('Error initiating settlement:', error);
    throw error;
  }
}

module.exports = {
  claimChannel,
  closeChannel,
  initiateSettle,
};

