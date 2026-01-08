/**
 * signer.js
 * Handles off-chain signing of payment claims (sender-side)
 * 
 * Creates cryptographic signatures that authorize the receiver to claim
 * specific amounts of XRP without on-chain transactions (zero fees).
 */

const xrpl = require('xrpl');
const { encodeForSigningClaim } = require('ripple-binary-codec');
const { sign: signData } = require('ripple-keypairs');

/**
 * Creates a signed claim for a specific amount
 * This signature can be sent off-chain to the receiver via WebSocket or API
 * 
 * @param {object} wallet - Sender's wallet object
 * @param {string} channelId - Payment channel ID
 * @param {string} amount - Amount in drops to authorize
 * @returns {object} Signed claim with signature and details
 */
function signClaim(wallet, channelId, amount) {
  try {
    // Use ripple-binary-codec's encodeForSigningClaim for correct format
    // This is the same method used by xrpl.js internally
    const signingData = encodeForSigningClaim({
      channel: channelId,
      amount: amount.toString(),
    });
    
    // Sign using ripple-keypairs
    const signature = signData(signingData, wallet.privateKey);
    
    console.log(`✓ Claim signed: ${parseInt(amount) / 1000000} XRP`);
    console.log(`  Signing data length: ${signingData.length} chars`);
    
    return {
      channelId,
      amount: amount.toString(),
      signature: signature,
      publicKey: wallet.publicKey,
      timestamp: Date.now(),
      signer: wallet.address,
    };
    
  } catch (error) {
    console.error('Error signing claim:', error);
    throw error;
  }
}

/**
 * Creates incremental signed claims for streaming payments
 * Used for continuous micro-payments (e.g., per second of video)
 * 
 * @param {object} wallet - Sender's wallet object
 * @param {string} channelId - Payment channel ID
 * @param {string} currentAmount - Current total amount already authorized
 * @param {string} incrementAmount - Additional amount to authorize
 * @returns {object} New signed claim
 */
function signIncrementalClaim(wallet, channelId, currentAmount, incrementAmount) {
  const currentBigInt = BigInt(currentAmount);
  const incrementBigInt = BigInt(incrementAmount);
  const newTotal = currentBigInt + incrementBigInt;
  
  console.log(`Signing incremental claim:`);
  console.log(`  Previous: ${currentBigInt / 1000000n} XRP`);
  console.log(`  Increment: ${incrementBigInt / 1000000n} XRP`);
  console.log(`  New Total: ${newTotal / 1000000n} XRP`);
  
  return signClaim(wallet, channelId, newTotal.toString());
}

/**
 * Batch signs multiple claims (useful for pre-generating claims)
 * 
 * @param {object} wallet - Sender's wallet object
 * @param {string} channelId - Payment channel ID
 * @param {Array<string>} amounts - Array of amounts to sign
 * @returns {Array<object>} Array of signed claims
 */
function batchSignClaims(wallet, channelId, amounts) {
  console.log(`Batch signing ${amounts.length} claims...`);
  
  const signedClaims = amounts.map(amount => {
    return signClaim(wallet, channelId, amount);
  });
  
  console.log(`✓ Batch signed ${signedClaims.length} claims`);
  
  return signedClaims;
}

/**
 * Generates a series of incremental claims for streaming
 * Useful for predictable streaming scenarios (e.g., video/audio)
 * 
 * @param {object} wallet - Sender's wallet object
 * @param {string} channelId - Payment channel ID
 * @param {object} options - Configuration for claim generation
 * @returns {Array<object>} Array of pre-signed claims
 */
function generateStreamingClaims(wallet, channelId, options = {}) {
  const {
    startAmount = '0',
    incrementPerUnit = '1000', // drops per unit (e.g., per second)
    numberOfClaims = 100,
    unitType = 'second'
  } = options;
  
  console.log(`Generating ${numberOfClaims} streaming claims...`);
  console.log(`  Increment: ${incrementPerUnit} drops per ${unitType}`);
  
  const claims = [];
  let currentAmount = BigInt(startAmount);
  const increment = BigInt(incrementPerUnit);
  
  for (let i = 0; i < numberOfClaims; i++) {
    currentAmount += increment;
    const claim = signClaim(wallet, channelId, currentAmount.toString());
    claims.push({
      ...claim,
      unitNumber: i + 1,
      unitType,
    });
  }
  
  console.log(`✓ Generated ${claims.length} claims`);
  console.log(`  Total value: ${currentAmount / 1000000n} XRP`);
  
  return claims;
}

/**
 * Validates a claim signature (useful for sender to verify before sending)
 * 
 * @param {string} channelId - Payment channel ID
 * @param {string} amount - Amount in the claim
 * @param {string} signature - Signature to verify
 * @param {string} publicKey - Public key to verify against
 * @returns {boolean} True if signature is valid
 */
function verifyClaim(channelId, amount, signature, publicKey) {
  try {
    // verifyPaymentChannelClaim expects XRP, not drops!
    // Convert drops to XRP: divide by 1,000,000
    const xrpAmount = (parseInt(amount) / 1000000).toString();
    const isValid = xrpl.verifyPaymentChannelClaim(channelId, xrpAmount, signature, publicKey);
    return isValid;
  } catch (error) {
    console.error('Error verifying claim:', error);
    return false;
  }
}

/**
 * Streaming session manager for handling continuous payments
 */
class StreamingSigner {
  constructor(wallet, channelId, ratePerSecond) {
    this.wallet = wallet;
    this.channelId = channelId;
    this.ratePerSecond = BigInt(ratePerSecond); // drops per second
    this.currentTotal = 0n;
    this.startTime = null;
    this.isActive = false;
  }
  
  start() {
    this.startTime = Date.now();
    this.isActive = true;
    console.log('✓ Streaming session started');
  }
  
  stop() {
    this.isActive = false;
    console.log('✓ Streaming session stopped');
  }
  
  getCurrentAmount() {
    if (!this.isActive || !this.startTime) {
      return this.currentTotal.toString();
    }
    
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const amount = BigInt(elapsed) * this.ratePerSecond;
    return (this.currentTotal + amount).toString();
  }
  
  signCurrentClaim() {
    const amount = this.getCurrentAmount();
    return signClaim(this.wallet, this.channelId, amount);
  }
  
  updateTotal(newTotal) {
    this.currentTotal = BigInt(newTotal);
    this.startTime = Date.now();
  }
}

module.exports = {
  signClaim,
  signIncrementalClaim,
  batchSignClaims,
  generateStreamingClaims,
  verifyClaim,
  StreamingSigner,
};

