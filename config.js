/**
 * config.js
 * Global configuration constants for the streaming payment system
 */

require("dotenv").config();

module.exports = {
  // XRPL Network Configuration
  network: {
    type: process.env.XRPL_NETWORK || "testnet",
    url: process.env.XRPL_URL,
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || "0.0.0.0",
    apiKey: process.env.API_KEY,
  },

  // XRP Configuration
  xrp: {
    symbol: "XRP",
    decimals: 6,
    displayName: "XRP",
  },

  // RLUSD Currency Configuration
  currency: {
    // RLUSD currency definition
    currency: "USD",
    issuer: process.env.RLUSD_ISSUER || "rwZFUkGLkLujcCWykEw7BGJGKNw8N6qYKN", // Custom testnet RLUSD issuer

    // Display formatting
    symbol: "RLUSD",
    decimals: 2,
    displayName: "Ripple USD",
  },

  // Payment Channel Defaults (NOTE: Payment channels only support XRP)
  // For RLUSD streaming, we need to use alternative methods like Escrow
  channel: {
    // Default settle delay in seconds (how long sender must wait to reclaim funds)
    // Recommended: 3600 (1 hour) for production, lower for testing
    DEFAULT_SETTLE_DELAY: parseInt(process.env.DEFAULT_SETTLE_DELAY) || 3600,

    // Minimum settle delay (XRPL requires at least 3600 seconds)
    MIN_SETTLE_DELAY: 3600,

    // Maximum settle delay
    MAX_SETTLE_DELAY: 2592000, // 30 days

    // Minimum channel amount in RLUSD (prevent dust channels)
    MIN_CHANNEL_AMOUNT: "10", // 10 RLUSD

    // Buffer percentage for channel funding recommendations
    FUNDING_BUFFER: 1.2, // 20% extra

    // Threshold percentage for low balance warnings
    LOW_BALANCE_THRESHOLD: 0.2, // 20% remaining
  },

  // Streaming Configuration
  streaming: {
    // Default rate in RLUSD per second
    DEFAULT_RATE_PER_SECOND: "0.01", // 0.01 RLUSD per second

    // Minimum rate in RLUSD per second
    MIN_RATE_PER_SECOND: "0.001", // 0.001 RLUSD

    // Maximum rate in RLUSD per second (prevent abuse)
    MAX_RATE_PER_SECOND: "1.00", // 1 RLUSD per second

    // How often to generate claims (milliseconds)
    CLAIM_INTERVAL_MS: 1000, // Every 1 second

    // Maximum claims per minute (rate limiting)
    MAX_CLAIMS_PER_MINUTE: 60,
  },

  // Storage Configuration
  storage: {
    path: process.env.STORAGE_PATH || "./data/channels.json",

    // Auto-save interval (milliseconds)
    autoSaveInterval: 5000, // Every 5 seconds

    // Maximum claim history per channel
    maxClaimHistory: 1000,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },

  // CORS Configuration
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
  },

  // Finalization Thresholds
  finalization: {
    // Minimum amount to finalize on-chain (in drops)
    minAmountToFinalize: "100000000", // 100 XRP

    // Maximum time between finalizations (milliseconds)
    maxTimeSinceLastFinalization: 3600000, // 1 hour

    // Percentage of channel used to trigger finalization
    channelBalanceThreshold: 0.8, // 80%
  },

  // WebSocket Configuration (for future real-time streaming)
  websocket: {
    enabled: false,
    port: parseInt(process.env.WS_PORT) || 3001,
    pingInterval: 30000, // 30 seconds
    maxConnections: 1000,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    enableFileLogging: process.env.ENABLE_FILE_LOGGING === "true",
    logDirectory: "./logs",
  },

  // Security
  security: {
    enableApiKeyAuth: process.env.API_KEY ? true : false,
    enableRateLimiting: true,
    enableCORS: true,
    trustProxy: process.env.TRUST_PROXY === "true",
  },

  // Development
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",

  // Feature Flags
  features: {
    autoFinalization: process.env.ENABLE_AUTO_FINALIZATION === "true",
    webhooks: process.env.ENABLE_WEBHOOKS === "true",
    analytics: process.env.ENABLE_ANALYTICS === "true",
  },
};
