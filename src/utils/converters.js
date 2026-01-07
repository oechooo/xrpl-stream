/**
 * converters.js
 * Utility functions for converting between XRP/drops and time-to-value calculations
 * 
 * Helps with conversions needed for streaming payments (e.g., cost per second).
 */

/**
 * Convert XRP to drops
 * 1 XRP = 1,000,000 drops
 * 
 * @param {number|string} xrp - Amount in XRP
 * @returns {string} Amount in drops
 */
function xrpToDrops(xrp) {
  const xrpNum = parseFloat(xrp);
  
  if (isNaN(xrpNum) || xrpNum < 0) {
    throw new Error('Invalid XRP amount');
  }
  
  // Use BigInt to avoid floating point precision issues
  const drops = Math.floor(xrpNum * 1000000);
  return drops.toString();
}

/**
 * Convert drops to XRP
 * 
 * @param {number|string} drops - Amount in drops
 * @returns {number} Amount in XRP
 */
function dropsToXrp(drops) {
  const dropsNum = BigInt(drops);
  
  if (dropsNum < 0n) {
    throw new Error('Invalid drops amount');
  }
  
  return Number(dropsNum) / 1000000;
}

/**
 * Format XRP amount for display
 * 
 * @param {number} xrp - Amount in XRP
 * @param {number} decimals - Number of decimal places (default 6)
 * @returns {string} Formatted XRP amount
 */
function formatXrp(xrp, decimals = 6) {
  return parseFloat(xrp).toFixed(decimals) + ' XRP';
}

/**
 * Calculate drops per unit of time
 * 
 * @param {string|number} totalDrops - Total drops to stream
 * @param {number} duration - Duration in milliseconds
 * @param {string} unit - Time unit ('second', 'minute', 'hour')
 * @returns {string} Drops per unit
 */
function calculateDropsPerUnit(totalDrops, duration, unit = 'second') {
  const total = BigInt(totalDrops);
  const durationMs = BigInt(duration);
  
  const unitMultipliers = {
    second: 1000n,
    minute: 60000n,
    hour: 3600000n,
  };
  
  const multiplier = unitMultipliers[unit];
  
  if (!multiplier) {
    throw new Error('Invalid time unit. Use: second, minute, or hour');
  }
  
  // Calculate rate per unit
  const rate = (total * multiplier) / durationMs;
  
  return rate.toString();
}

/**
 * Calculate streaming rate from cost and duration
 * 
 * @param {number} costXrp - Total cost in XRP
 * @param {number} durationSeconds - Duration in seconds
 * @returns {object} Rate information
 */
function calculateStreamingRate(costXrp, durationSeconds) {
  const totalDrops = BigInt(xrpToDrops(costXrp));
  const duration = BigInt(durationSeconds);
  
  const dropsPerSecond = totalDrops / duration;
  const dropsPerMinute = dropsPerSecond * 60n;
  const dropsPerHour = dropsPerSecond * 3600n;
  
  return {
    totalDrops: totalDrops.toString(),
    totalXrp: costXrp,
    durationSeconds: durationSeconds,
    dropsPerSecond: dropsPerSecond.toString(),
    dropsPerMinute: dropsPerMinute.toString(),
    dropsPerHour: dropsPerHour.toString(),
    xrpPerSecond: dropsToXrp(dropsPerSecond.toString()),
    xrpPerMinute: dropsToXrp(dropsPerMinute.toString()),
    xrpPerHour: dropsToXrp(dropsPerHour.toString()),
  };
}

/**
 * Calculate how long a channel will last at a given rate
 * 
 * @param {string} channelBalance - Channel balance in drops
 * @param {string} dropsPerSecond - Streaming rate in drops per second
 * @returns {object} Duration information
 */
function calculateChannelDuration(channelBalance, dropsPerSecond) {
  const balance = BigInt(channelBalance);
  const rate = BigInt(dropsPerSecond);
  
  if (rate === 0n) {
    return {
      seconds: Infinity,
      minutes: Infinity,
      hours: Infinity,
      days: Infinity,
    };
  }
  
  const totalSeconds = balance / rate;
  
  return {
    totalSeconds: Number(totalSeconds),
    seconds: Number(totalSeconds % 60n),
    minutes: Number((totalSeconds / 60n) % 60n),
    hours: Number((totalSeconds / 3600n) % 24n),
    days: Number(totalSeconds / 86400n),
    formatted: formatDuration(Number(totalSeconds)),
  };
}

/**
 * Format duration in seconds to human-readable string
 * 
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
function formatDuration(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
}

/**
 * Calculate cost for a specific duration at a given rate
 * 
 * @param {string} dropsPerSecond - Rate in drops per second
 * @param {number} durationSeconds - Duration in seconds
 * @returns {object} Cost information
 */
function calculateCost(dropsPerSecond, durationSeconds) {
  const rate = BigInt(dropsPerSecond);
  const duration = BigInt(durationSeconds);
  
  const totalDrops = rate * duration;
  
  return {
    totalDrops: totalDrops.toString(),
    totalXrp: dropsToXrp(totalDrops.toString()),
    formatted: formatXrp(dropsToXrp(totalDrops.toString())),
  };
}

/**
 * Calculate how much has been streamed based on elapsed time
 * 
 * @param {string} dropsPerSecond - Rate in drops per second
 * @param {number} startTime - Start timestamp in milliseconds
 * @param {number} currentTime - Current timestamp in milliseconds (default: now)
 * @returns {object} Streamed amount information
 */
function calculateStreamedAmount(dropsPerSecond, startTime, currentTime = Date.now()) {
  const rate = BigInt(dropsPerSecond);
  const elapsedSeconds = BigInt(Math.floor((currentTime - startTime) / 1000));
  
  const streamedDrops = rate * elapsedSeconds;
  
  return {
    elapsedSeconds: Number(elapsedSeconds),
    elapsedFormatted: formatDuration(Number(elapsedSeconds)),
    streamedDrops: streamedDrops.toString(),
    streamedXrp: dropsToXrp(streamedDrops.toString()),
    streamedFormatted: formatXrp(dropsToXrp(streamedDrops.toString())),
  };
}

/**
 * Calculate suggested channel amount based on expected usage
 * 
 * @param {string} dropsPerSecond - Expected rate in drops per second
 * @param {number} expectedDurationSeconds - Expected streaming duration
 * @param {number} buffer - Buffer multiplier (default 1.2 = 20% extra)
 * @returns {object} Suggested channel amount
 */
function suggestChannelAmount(dropsPerSecond, expectedDurationSeconds, buffer = 1.2) {
  const rate = BigInt(dropsPerSecond);
  const duration = BigInt(expectedDurationSeconds);
  
  const baseAmount = rate * duration;
  const bufferedAmount = BigInt(Math.floor(Number(baseAmount) * buffer));
  
  return {
    baseDrops: baseAmount.toString(),
    baseXrp: dropsToXrp(baseAmount.toString()),
    bufferedDrops: bufferedAmount.toString(),
    bufferedXrp: dropsToXrp(bufferedAmount.toString()),
    buffer: buffer,
    recommended: formatXrp(dropsToXrp(bufferedAmount.toString())),
  };
}

/**
 * Parse time string to seconds
 * Supports formats like: "1h", "30m", "1h 30m", "90s"
 * 
 * @param {string} timeString - Time string to parse
 * @returns {number} Duration in seconds
 */
function parseTimeString(timeString) {
  const units = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  
  let totalSeconds = 0;
  const pattern = /(\d+)([smhd])/g;
  let match;
  
  while ((match = pattern.exec(timeString)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2];
    totalSeconds += value * units[unit];
  }
  
  if (totalSeconds === 0) {
    throw new Error('Invalid time string format. Use formats like: "1h", "30m", "1h 30m"');
  }
  
  return totalSeconds;
}

/**
 * Calculate percentage of channel used
 * 
 * @param {string} totalAmount - Total channel amount in drops
 * @param {string} usedAmount - Amount already claimed in drops
 * @returns {object} Usage information
 */
function calculateChannelUsage(totalAmount, usedAmount) {
  const total = BigInt(totalAmount);
  const used = BigInt(usedAmount);
  const remaining = total - used;
  
  const percentUsed = total > 0n ? Number((used * 10000n) / total) / 100 : 0;
  const percentRemaining = 100 - percentUsed;
  
  return {
    totalDrops: total.toString(),
    totalXrp: dropsToXrp(total.toString()),
    usedDrops: used.toString(),
    usedXrp: dropsToXrp(used.toString()),
    remainingDrops: remaining.toString(),
    remainingXrp: dropsToXrp(remaining.toString()),
    percentUsed: percentUsed.toFixed(2),
    percentRemaining: percentRemaining.toFixed(2),
  };
}

/**
 * Validate drops amount
 * 
 * @param {string} drops - Amount in drops
 * @returns {boolean} True if valid
 */
function isValidDropsAmount(drops) {
  try {
    const amount = BigInt(drops);
    return amount >= 0n;
  } catch {
    return false;
  }
}

module.exports = {
  xrpToDrops,
  dropsToXrp,
  formatXrp,
  calculateDropsPerUnit,
  calculateStreamingRate,
  calculateChannelDuration,
  formatDuration,
  calculateCost,
  calculateStreamedAmount,
  suggestChannelAmount,
  parseTimeString,
  calculateChannelUsage,
  isValidDropsAmount,
};

