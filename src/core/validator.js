/**
 * validator.js
 * Receiver-side logic to verify signatures and validate claims
 * 
 * Ensures that incoming signatures from the sender are valid and that
 * amounts are increasing (prevents double-spend and replay attacks).
 */

const xrpl = require('xrpl');
const { getChannelStore } = require('./channelStore');

/**
 * Validates a payment claim signature and amount
 * 
 * @param {string} channelId - Payment channel ID
 * @param {string} amount - Claimed amount in drops
 * @param {string} signature - Signature from sender
 * @param {string} publicKey - Sender's public key
 * @param {object} channelInfo - Channel information from ledger (optional)
 * @returns {Promise<object>} Validation result
 */
async function validateClaim(channelId, amount, signature, publicKey, channelInfo = null) {
  try {
    console.log(`Validating claim for channel ${channelId}...`);
    console.log(`  Amount: ${parseInt(amount) / 1000000} XRP`);
    
    // 1. Verify the signature is cryptographically valid using xrpl.js built-in function
    // NOTE: verifyPaymentChannelClaim expects XRP amount, not drops!
    const xrpAmount = (parseInt(amount) / 1000000).toString();
    
    console.log('  Validation details:');
    console.log('    Channel ID:', channelId);
    console.log('    Amount:', amount, 'drops =', xrpAmount, 'XRP');
    console.log('    Signature length:', signature.length);
    console.log('    Public key length:', publicKey.length);
    
    const signatureValid = xrpl.verifyPaymentChannelClaim(channelId, xrpAmount, signature, publicKey);
    
    if (!signatureValid) {
      return {
        valid: false,
        reason: 'Invalid signature',
        channelId,
        amount,
      };
    }
    
    // 2. Check if amount is increasing (prevents replay attacks)
    const store = getChannelStore();
    const lastValidAmount = await store.getLastValidAmount(channelId);
    const currentAmount = BigInt(amount);
    const previousAmount = BigInt(lastValidAmount || '0');
    
    if (currentAmount <= previousAmount) {
      return {
        valid: false,
        reason: 'Amount must be greater than previous claim',
        channelId,
        amount,
        previousAmount: previousAmount.toString(),
      };
    }
    
    // 3. If channel info provided, verify amount doesn't exceed channel balance
    if (channelInfo) {
      const channelBalance = BigInt(channelInfo.Amount);
      if (currentAmount > channelBalance) {
        return {
          valid: false,
          reason: 'Amount exceeds channel balance',
          channelId,
          amount,
          channelBalance: channelBalance.toString(),
        };
      }
      
      // Verify the public key matches the channel
      if (channelInfo.PublicKey !== publicKey) {
        return {
          valid: false,
          reason: 'Public key does not match channel',
          channelId,
          providedKey: publicKey,
          expectedKey: channelInfo.PublicKey,
        };
      }
    }
    
    console.log('✓ Claim is valid');
    
    return {
      valid: true,
      channelId,
      amount,
      previousAmount: previousAmount.toString(),
      increment: (currentAmount - previousAmount).toString(),
      signature,
      publicKey,
      timestamp: Date.now(),
    };
    
  } catch (error) {
    console.error('Error validating claim:', error);
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    return {
      valid: false,
      reason: `Validation error: ${errorMessage}`,
      channelId,
      amount,
    };
  }
}

/**
 * Validates and stores a claim if valid
 * 
 * @param {string} channelId - Payment channel ID
 * @param {string} amount - Claimed amount in drops
 * @param {string} signature - Signature from sender
 * @param {string} publicKey - Sender's public key
 * @param {object} channelInfo - Channel information from ledger (optional)
 * @returns {Promise<object>} Validation and storage result
 */
async function validateAndStoreClaim(channelId, amount, signature, publicKey, channelInfo = null) {
  const validationResult = await validateClaim(channelId, amount, signature, publicKey, channelInfo);
  
  if (!validationResult.valid) {
    console.log(`✗ Claim rejected: ${validationResult.reason}`);
    return validationResult;
  }
  
  // Store the valid claim
  const store = getChannelStore();
  await store.updateChannel(channelId, {
    lastValidAmount: amount,
    lastSignature: signature,
    lastUpdateTime: Date.now(),
    publicKey,
  });
  
  console.log('✓ Valid claim stored');
  
  return {
    ...validationResult,
    stored: true,
  };
}

/**
 * Batch validates multiple claims (useful for processing queued claims)
 * 
 * @param {Array<object>} claims - Array of claim objects
 * @param {object} channelInfo - Channel information from ledger
 * @returns {Promise<object>} Batch validation results
 */
async function batchValidateClaims(claims, channelInfo) {
  console.log(`Batch validating ${claims.length} claims...`);
  
  const results = {
    valid: [],
    invalid: [],
    totalValid: 0,
    totalInvalid: 0,
  };
  
  for (const claim of claims) {
    const result = await validateClaim(
      claim.channelId,
      claim.amount,
      claim.signature,
      claim.publicKey,
      channelInfo
    );
    
    if (result.valid) {
      results.valid.push(result);
      results.totalValid++;
    } else {
      results.invalid.push(result);
      results.totalInvalid++;
    }
  }
  
  console.log(`✓ Batch validation complete: ${results.totalValid} valid, ${results.totalInvalid} invalid`);
  
  return results;
}

/**
 * Validates claim rate to prevent spam or abuse
 * 
 * @param {string} channelId - Payment channel ID
 * @param {number} maxClaimsPerMinute - Maximum allowed claims per minute
 * @returns {Promise<object>} Rate validation result
 */
async function validateClaimRate(channelId, maxClaimsPerMinute = 60) {
  const store = getChannelStore();
  const recentClaims = await store.getRecentClaims(channelId, 60000); // Last minute
  
  if (recentClaims.length >= maxClaimsPerMinute) {
    return {
      valid: false,
      reason: 'Claim rate limit exceeded',
      currentRate: recentClaims.length,
      maxRate: maxClaimsPerMinute,
    };
  }
  
  return {
    valid: true,
    currentRate: recentClaims.length,
    maxRate: maxClaimsPerMinute,
  };
}

/**
 * Checks if a claim should be finalized on-chain
 * 
 * @param {string} channelId - Payment channel ID
 * @param {object} options - Finalization criteria
 * @returns {Promise<object>} Finalization recommendation
 */
async function shouldFinalizeClaim(channelId, options = {}) {
  const {
    minAmountToFinalize = '100000000', // 100 XRP default
    maxTimeSinceLastFinalization = 3600000, // 1 hour
    channelBalanceThreshold = 0.8, // 80% of channel used
  } = options;
  
  const store = getChannelStore();
  const channelData = await store.getChannelData(channelId);
  
  if (!channelData) {
    return { shouldFinalize: false, reason: 'No channel data found' };
  }
  
  const currentAmount = BigInt(channelData.lastValidAmount || '0');
  const lastFinalized = BigInt(channelData.lastFinalizedAmount || '0');
  const unclaimedAmount = currentAmount - lastFinalized;
  
  // Check if unclaimed amount meets threshold
  if (unclaimedAmount >= BigInt(minAmountToFinalize)) {
    return {
      shouldFinalize: true,
      reason: 'Unclaimed amount threshold reached',
      unclaimedAmount: unclaimedAmount.toString(),
      unclaimedXRP: Number(unclaimedAmount) / 1000000,
    };
  }
  
  // Check if too much time has passed
  const timeSinceLastFinalization = Date.now() - (channelData.lastFinalizationTime || 0);
  if (timeSinceLastFinalization > maxTimeSinceLastFinalization && unclaimedAmount > 0n) {
    return {
      shouldFinalize: true,
      reason: 'Time threshold exceeded',
      timeSinceLastFinalization,
      unclaimedAmount: unclaimedAmount.toString(),
    };
  }
  
  return {
    shouldFinalize: false,
    reason: 'No finalization criteria met',
    unclaimedAmount: unclaimedAmount.toString(),
  };
}

/**
 * Streaming validation manager for continuous claim validation
 */
class StreamingValidator {
  constructor(channelId, publicKey, options = {}) {
    this.channelId = channelId;
    this.publicKey = publicKey;
    this.options = {
      maxClaimsPerMinute: options.maxClaimsPerMinute || 60,
      minIncrementDrops: options.minIncrementDrops || '1',
      ...options,
    };
    this.claimHistory = [];
  }
  
  async validateStreamingClaim(amount, signature) {
    // Rate limiting
    const rateCheck = await validateClaimRate(this.channelId, this.options.maxClaimsPerMinute);
    if (!rateCheck.valid) {
      return rateCheck;
    }
    
    // Standard validation
    const result = await validateAndStoreClaim(
      this.channelId,
      amount,
      signature,
      this.publicKey
    );
    
    if (result.valid) {
      this.claimHistory.push({
        amount,
        timestamp: Date.now(),
      });
    }
    
    return result;
  }
  
  getClaimHistory() {
    return this.claimHistory;
  }
  
  getStats() {
    if (this.claimHistory.length === 0) {
      return { totalClaims: 0, totalAmount: '0' };
    }
    
    return {
      totalClaims: this.claimHistory.length,
      latestAmount: this.claimHistory[this.claimHistory.length - 1].amount,
      averageRate: this.calculateAverageRate(),
    };
  }
  
  calculateAverageRate() {
    if (this.claimHistory.length < 2) {
      return 0;
    }
    
    const first = this.claimHistory[0];
    const last = this.claimHistory[this.claimHistory.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000; // seconds
    const amountDiff = BigInt(last.amount) - BigInt(first.amount);
    
    if (timeDiff === 0) return 0;
    
    return Number(amountDiff) / timeDiff; // drops per second
  }
}

module.exports = {
  validateClaim,
  validateAndStoreClaim,
  batchValidateClaims,
  validateClaimRate,
  shouldFinalizeClaim,
  StreamingValidator,
};

