/**
 * fundChannel.js
 * Uses PaymentChannelFund to add more XRP to an existing channel
 * 
 * This prevents the stream from "running dry" by topping up the channel balance
 * without needing to close and reopen it.
 */

const xrpl = require('xrpl');
const { getClient } = require('../src/utils/xrplClient');
const { getChannelInfo } = require('./createChannel');

/**
 * Adds additional XRP to an existing payment channel
 * @param {string} senderWallet - Wallet object of the sender (channel owner)
 * @param {string} channelId - The payment channel ID to fund
 * @param {string} amount - Additional amount of XRP to add in drops
 * @param {number} expiration - Optional new expiration time for the channel
 * @returns {Promise<object>} Transaction result
 */
async function fundChannel(senderWallet, channelId, amount, expiration = null) {
  const client = await getClient();
  
  try {
    // First verify the channel exists and belongs to the sender
    const channelInfo = await getChannelInfo(channelId);
    
    if (channelInfo.Account !== senderWallet.address) {
      throw new Error('Channel does not belong to this sender');
    }
    
    console.log('Funding payment channel...');
    console.log(`Channel ID: ${channelId}`);
    console.log(`Current balance: ${channelInfo.Amount} drops`);
    console.log(`Adding: ${amount} drops (${parseInt(amount) / 1000000} XRP)`);
    
    // Prepare the PaymentChannelFund transaction
    const fundTx = {
      TransactionType: 'PaymentChannelFund',
      Account: senderWallet.address,
      Channel: channelId,
      Amount: amount.toString(),
    };
    
    // Optional: Extend the expiration time
    if (expiration) {
      fundTx.Expiration = expiration;
      console.log(`New expiration: ${new Date(expiration * 1000).toISOString()}`);
    }
    
    // Submit and wait for validation
    const prepared = await client.autofill(fundTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
    
    const newBalance = parseInt(channelInfo.Amount) + parseInt(amount);
    
    console.log('✓ Channel funded successfully!');
    console.log(`New balance: ${newBalance} drops (${newBalance / 1000000} XRP)`);
    console.log(`Transaction hash: ${result.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: result.result.hash,
      addedAmount: amount,
      newBalance: newBalance.toString(),
      ledgerIndex: result.result.ledger_index,
    };
    
  } catch (error) {
    console.error('Error funding payment channel:', error);
    throw error;
  }
}

/**
 * Checks if a channel needs funding based on current usage
 * @param {string} channelId - The payment channel ID
 * @param {string} currentClaimed - Amount already claimed by receiver
 * @param {number} thresholdPercent - Percentage threshold to trigger refund alert (default 80%)
 * @returns {Promise<object>} Funding status and recommendation
 */
async function checkFundingStatus(channelId, currentClaimed, thresholdPercent = 80) {
  try {
    const channelInfo = await getChannelInfo(channelId);
    const totalAmount = parseInt(channelInfo.Amount);
    const claimed = parseInt(currentClaimed);
    const remaining = totalAmount - claimed;
    const usagePercent = (claimed / totalAmount) * 100;
    
    const needsFunding = usagePercent >= thresholdPercent;
    
    return {
      channelId,
      totalAmount,
      claimed,
      remaining,
      usagePercent: usagePercent.toFixed(2),
      needsFunding,
      recommendedAmount: needsFunding ? Math.floor(totalAmount * 0.5) : 0, // Suggest adding 50% more
    };
  } catch (error) {
    console.error('Error checking funding status:', error);
    throw error;
  }
}

module.exports = {
  fundChannel,
  checkFundingStatus,
};

