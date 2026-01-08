/**
 * middleware.js
 * Authentication and validation middleware for API endpoints
 */

const rateLimit = require('express-rate-limit');

/**
 * API Key authentication middleware
 * Checks for valid API key in Authorization header
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '');
  const validApiKey = process.env.API_KEY;
  
  // Skip auth if no API_KEY is configured (development mode)
  if (!validApiKey) {
    console.warn('Warning: No API_KEY configured. Authentication disabled.');
    return next();
  }
  
  if (!apiKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required in Authorization header',
    });
  }
  
  if (apiKey !== validApiKey) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key',
    });
  }
  
  next();
}

/**
 * Validate XRPL address format
 */
function isValidXRPLAddress(address) {
  // XRPL addresses start with 'r' and are 25-35 characters
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

/**
 * Validate channel ID format (64 hex characters)
 */
function isValidChannelId(channelId) {
  return /^[A-F0-9]{64}$/i.test(channelId);
}

/**
 * Request validation middleware
 * Validates common XRPL-related fields
 */
function validateRequest(req, res, next) {
  const { channelId, address, destinationAddress } = req.body;
  
  // Validate channel ID if present
  if (channelId && !isValidChannelId(channelId)) {
    return res.status(400).json({
      error: 'Invalid channelId format',
      message: 'Channel ID must be 64 hexadecimal characters',
    });
  }
  
  // Validate XRPL addresses if present
  if (address && !isValidXRPLAddress(address)) {
    return res.status(400).json({
      error: 'Invalid address format',
      message: 'Address must be a valid XRPL address',
    });
  }
  
  if (destinationAddress && !isValidXRPLAddress(destinationAddress)) {
    return res.status(400).json({
      error: 'Invalid destinationAddress format',
      message: 'Destination address must be a valid XRPL address',
    });
  }
  
  next();
}

/**
 * Rate limiting middleware
 * Prevents abuse by limiting requests per IP
 */
const createRateLimiter = (windowMs = 60000, max = 100) => {
  return rateLimit({
    windowMs, // Time window in milliseconds
    max, // Max requests per window
    message: {
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${windowMs / 1000} seconds.`,
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
  });
};

/**
 * Error handling middleware
 * Catches and formats errors consistently
 */
function errorHandler(err, req, res, next) {
  console.error('API Error:', err);
  
  // XRPL-specific errors
  if (err.message?.includes('tecNO_DST')) {
    return res.status(400).json({
      error: 'Invalid destination',
      message: 'Destination account does not exist',
    });
  }
  
  if (err.message?.includes('tecUNFUNDED')) {
    return res.status(400).json({
      error: 'Insufficient funds',
      message: 'Account does not have enough XRP',
    });
  }
  
  if (err.message?.includes('tefPAST_SEQ')) {
    return res.status(400).json({
      error: 'Sequence error',
      message: 'Transaction sequence number is too low',
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

/**
 * Request logging middleware
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;
    
    console.log(`[${new Date().toISOString()}] ${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
  });
  
  next();
}

/**
 * CORS middleware configuration
 */
function configureCORS() {
  const cors = require('cors');
  
  const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
  
  return cors(corsOptions);
}

/**
 * Validate amount format (must be positive integer in drops)
 */
function validateAmount(amount) {
  const amountNum = parseInt(amount);
  
  if (isNaN(amountNum) || amountNum <= 0) {
    return {
      valid: false,
      error: 'Amount must be a positive integer',
    };
  }
  
  if (!Number.isInteger(amountNum)) {
    return {
      valid: false,
      error: 'Amount must be an integer (drops)',
    };
  }
  
  return { valid: true };
}

/**
 * Middleware to validate amount in request
 */
function validateAmountMiddleware(req, res, next) {
  const { amount } = req.body;
  
  if (amount) {
    const validation = validateAmount(amount);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid amount',
        message: validation.error,
      });
    }
  }
  
  next();
}

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  
  next();
}

/**
 * Health check bypass middleware
 * Allows health checks and demo endpoints without authentication
 */
function healthCheckBypass(req, res, next) {
  // req.path is relative to where this middleware is mounted (e.g., /api)
  // So /api/m2m/start becomes /m2m/start here
  const bypassPaths = ['/health', '/', '/m2m', '/m2m/start', '/m2m/status', '/m2m/config'];
  
  if (bypassPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next('route'); // Skip to next route handler
  }
  next();
}

module.exports = {
  authenticateApiKey,
  validateRequest,
  validateAmount,
  validateAmountMiddleware,
  isValidXRPLAddress,
  isValidChannelId,
  createRateLimiter,
  errorHandler,
  requestLogger,
  configureCORS,
  securityHeaders,
  healthCheckBypass,
};

