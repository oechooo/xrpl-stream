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
    console.log(`[DEBUG] On-ledger PublicKey: ${channelInfo.PublicKey}`);
    console.log(`[DEBUG] Provided PublicKey:  ${publicKey}`);
    console.log(`[DEBUG] Keys match: ${channelInfo.PublicKey === publicKey}`);
    
    // Prepare the PaymentChannelClaim transaction
    // Both Balance and Amount are required to deliver XRP from a channel
    const claimTx = {
      TransactionType: 'PaymentChannelClaim',
      Account: receiverWallet.address,
      Channel: channelId,
      Balance: amount.toString(),  // Total amount delivered after this claim
      Amount: amount.toString(),   // Amount authorized by the signature
      Signature: signature.toUpperCase(),
      PublicKey: publicKey.toUpperCase(),
    };
    
    console.log('[DEBUG] Transaction fields:');
    console.log(`  Account: ${claimTx.Account}`);
    console.log(`  Channel: ${claimTx.Channel}`);
    console.log(`  Balance: ${claimTx.Balance}`);
    console.log(`  Amount: ${claimTx.Amount}`);
    console.log(`  Signature length: ${claimTx.Signature.length}`);
    console.log(`  PublicKey length: ${claimTx.PublicKey.length}`);
    
    // Verify signature with XRPL before submitting
    console.log('[DEBUG] Verifying signature with XRPL channel_verify...');
    const verifyResult = await client.request({
      command: 'channel_verify',
      channel_id: channelId,
      signature: signature,
      public_key: publicKey,
      amount: amount.toString(),
    });
    console.log(`[DEBUG] channel_verify result: ${JSON.stringify(verifyResult.result)}`);
    
    if (!verifyResult.result.signature_verified) {
      throw new Error('XRPL channel_verify: Signature is INVALID');
    }
    console.log('[DEBUG] ✓ Signature verified by XRPL!');
    
    // Autofill the transaction first (this can be slow on testnet)
    console.log('[DEBUG] Starting autofill...');
    console.log('[DEBUG] Transaction BEFORE autofill:', JSON.stringify(claimTx, null, 2));
    const autofillStart = Date.now();
    const prepared = await client.autofill(claimTx);
    console.log(`[DEBUG] Autofill completed in ${Date.now() - autofillStart}ms`);
    console.log('[DEBUG] Transaction AFTER autofill:', JSON.stringify(prepared, null, 2));
    
    // Get current ledger AFTER autofill to ensure fresh timestamp
    console.log('[DEBUG] Fetching current ledger...');
    const ledgerStart = Date.now();
    const ledger = await client.request({ command: 'ledger', ledger_index: 'validated' });
    const currentLedger = ledger.result.ledger_index;
    console.log(`[DEBUG] Got ledger ${currentLedger} in ${Date.now() - ledgerStart}ms`);
    
    // Set LastLedgerSequence with larger buffer (100 ledgers = ~7 minutes on testnet)
    prepared.LastLedgerSequence = currentLedger + 100;
    console.log(`[DEBUG] Set LastLedgerSequence to ${prepared.LastLedgerSequence}`);
    
    const signed = receiverWallet.sign(prepared);
    console.log('[DEBUG] Transaction signed, submitting...');
    
    // Use submit() first, then wait separately to avoid internal delays
    const submitStart = Date.now();
    const preliminary = await client.submit(signed.tx_blob);
    console.log(`[DEBUG] Submit returned in ${Date.now() - submitStart}ms`);
    console.log(`[DEBUG] Preliminary result: ${preliminary.result.engine_result}`);
    
    // Check preliminary result
    if (preliminary.result.engine_result !== 'tesSUCCESS' && 
        preliminary.result.engine_result !== 'terQUEUED' &&
        preliminary.result.engine_result !== 'terPRE_SEQ') {
      throw new Error(`Transaction rejected: ${preliminary.result.engine_result} - ${preliminary.result.engine_result_message}`);
    }
    
    // Now wait for validation
    console.log('[DEBUG] Waiting for validation...');
    const result = await client.request({
      command: 'tx',
      transaction: preliminary.result.tx_json.hash,
    });
    
    // Poll until validated or LastLedgerSequence exceeded
    let txResult = result;
    while (!txResult.result.validated) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      txResult = await client.request({
        command: 'tx', 
        transaction: preliminary.result.tx_json.hash,
      });
      const currentLedgerNow = (await client.request({ command: 'ledger', ledger_index: 'validated' })).result.ledger_index;
      if (currentLedgerNow > prepared.LastLedgerSequence) {
        throw new Error(`Transaction expired: current ledger ${currentLedgerNow} > LastLedgerSequence ${prepared.LastLedgerSequence}`);
      }
    }
    
    console.log(`[DEBUG] Transaction validated!`);
    
    if (txResult.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Transaction failed: ${txResult.result.meta.TransactionResult}`);
    }
    
    console.log('✓ Claim successful!');
    console.log(`Received: ${parseInt(amount) / 1000000} XRP`);
    console.log(`Transaction hash: ${txResult.result.hash}`);
    
    return {
      success: true,
      channelId,
      transactionHash: txResult.result.hash,
      claimedAmount: amount,
      receiverAddress: receiverWallet.address,
      ledgerIndex: txResult.result.ledger_index,
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
    
    // Autofill the transaction first (this can be slow on testnet)
    const prepared = await client.autofill(closeTx);
    
    // Get current ledger AFTER autofill to ensure fresh timestamp
    const ledger = await client.request({ command: 'ledger', ledger_index: 'validated' });
    const currentLedger = ledger.result.ledger_index;
    
    // Set LastLedgerSequence with 20 ledger buffer from CURRENT time
    prepared.LastLedgerSequence = currentLedger + 20;
    
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
    
    // Autofill the transaction first (this can be slow on testnet)
    const prepared = await client.autofill(settleTx);
    
    // Get current ledger AFTER autofill to ensure fresh timestamp
    const ledger = await client.request({ command: 'ledger', ledger_index: 'validated' });
    const currentLedger = ledger.result.ledger_index;
    
    // Set LastLedgerSequence with 20 ledger buffer from CURRENT time
    prepared.LastLedgerSequence = currentLedger + 20;
    
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

