/**
 * createRLUSDStream.js
 * Alternative streaming implementation using RLUSD Payment transactions
 *
 * Since XRPL Payment Channels only support XRP, we use a different approach:
 * - Create an Escrow with periodic releases, OR
 * - Use direct Payment transactions with streaming logic
 *
 * This implementation uses the Escrow approach for better security.
 */

const xrpl = require("xrpl");
const { getClient } = require("../src/utils/xrplClient");
const config = require("../config");

/**
 * Creates an escrow for RLUSD streaming payments
 * @param {object} senderWallet - Sender's wallet object
 * @param {string} destinationAddress - XRPL address of the receiver
 * @param {string} amount - Amount of RLUSD to lock
 * @param {number} duration - Duration in seconds for the streaming period
 * @param {number} intervalSeconds - How often payments can be released
 * @returns {Promise<object>} Escrow creation result
 */
async function createRLUSDStream(
  senderWallet,
  destinationAddress,
  amount,
  duration = 3600,
  intervalSeconds = 60
) {
  const client = await getClient();

  try {
    // Calculate finish time
    const currentTime = Math.floor(Date.now() / 1000);
    const finishAfter = currentTime + duration;

    // RLUSD amount object
    const rlusdAmount = {
      currency: config.currency.currency,
      issuer: config.currency.issuer,
      value: amount.toString(),
    };

    console.log("Creating RLUSD escrow stream...");
    console.log(`Sender: ${senderWallet.address}`);
    console.log(`Destination: ${destinationAddress}`);
    console.log(`Amount: ${amount} ${config.currency.symbol}`);
    console.log(`Duration: ${duration} seconds`);
    console.log(`Release interval: ${intervalSeconds} seconds`);

    // Create EscrowCreate transaction
    const escrowTx = {
      TransactionType: "EscrowCreate",
      Account: senderWallet.address,
      Destination: destinationAddress,
      Amount: rlusdAmount,
      FinishAfter: finishAfter,
      // Add a condition that allows periodic releases
      // This would need custom condition logic for streaming
    };

    // Submit and wait for validation
    const prepared = await client.autofill(escrowTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(
        `Transaction failed: ${result.result.meta.TransactionResult}`
      );
    }

    // Extract the escrow sequence number
    let escrowSequence = null;
    if (result.result.meta.AffectedNodes) {
      for (const node of result.result.meta.AffectedNodes) {
        if (node.CreatedNode && node.CreatedNode.LedgerEntryType === "Escrow") {
          // The escrow sequence is the transaction sequence
          escrowSequence = result.result.Sequence;
          break;
        }
      }
    }

    console.log("✓ RLUSD escrow stream created successfully!");
    console.log(`Escrow Sequence: ${escrowSequence}`);
    console.log(`Transaction Hash: ${result.result.hash}`);
    console.log(`Finish After: ${new Date(finishAfter * 1000).toISOString()}`);

    return {
      success: true,
      escrowSequence,
      transactionHash: result.result.hash,
      senderAddress: senderWallet.address,
      destinationAddress,
      amount: rlusdAmount,
      finishAfter,
      intervalSeconds,
      createdAt: Date.now(),
    };
  } catch (error) {
    console.error("Error creating RLUSD stream:", error);
    throw error;
  }
}

/**
 * Alternative: Direct Payment-based streaming for RLUSD
 * This creates smaller, frequent payments instead of using channels/escrow
 * @param {object} senderWallet - Sender's wallet object
 * @param {string} destinationAddress - XRPL address of the receiver
 * @param {string} totalAmount - Total amount of RLUSD to stream
 * @param {number} paymentCount - Number of payments to split into
 * @returns {Promise<object>} Stream setup result
 */
async function createDirectRLUSDStream(
  senderWallet,
  destinationAddress,
  totalAmount,
  paymentCount = 60
) {
  const paymentAmount = (parseFloat(totalAmount) / paymentCount).toFixed(2);

  console.log("Setting up direct RLUSD payment stream...");
  console.log(`Total: ${totalAmount} RLUSD in ${paymentCount} payments`);
  console.log(`Per payment: ${paymentAmount} RLUSD`);

  return {
    success: true,
    streamType: "direct_payment",
    senderAddress: senderWallet.address,
    destinationAddress,
    totalAmount,
    paymentAmount,
    paymentCount,
    paymentsRemaining: paymentCount,
    createdAt: Date.now(),
  };
}

/**
 * Execute a single streaming payment (for direct payment method)
 * @param {object} senderWallet - Sender's wallet object
 * @param {string} destinationAddress - XRPL address of the receiver
 * @param {string} amount - Amount of RLUSD to send
 * @returns {Promise<object>} Payment result
 */
async function executeRLUSDPayment(senderWallet, destinationAddress, amount) {
  const client = await getClient();

  try {
    const rlusdAmount = {
      currency: config.currency.currency,
      issuer: config.currency.issuer,
      value: amount.toString(),
    };

    const paymentTx = {
      TransactionType: "Payment",
      Account: senderWallet.address,
      Destination: destinationAddress,
      Amount: rlusdAmount,
    };

    console.log(`Sending ${amount} RLUSD to ${destinationAddress}...`);

    const prepared = await client.autofill(paymentTx);
    const signed = senderWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult !== "tesSUCCESS") {
      throw new Error(
        `Payment failed: ${result.result.meta.TransactionResult}`
      );
    }

    console.log("✓ RLUSD payment sent successfully!");
    console.log(`Transaction Hash: ${result.result.hash}`);

    return {
      success: true,
      transactionHash: result.result.hash,
      amount: rlusdAmount,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Error executing RLUSD payment:", error);
    throw error;
  }
}

module.exports = {
  createRLUSDStream,
  createDirectRLUSDStream,
  executeRLUSDPayment,
};
