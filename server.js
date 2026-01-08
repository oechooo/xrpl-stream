/**
 * server.js
 * Entry point for the XRPL streaming payment backend
 */

const express = require("express");
const config = require("./config");
const { getClientManager } = require("./src/utils/xrplClient");
const streamRoutes = require("./src/api/streamRoutes");
const rlusdRoutes = require("./src/api/rlusdRoutes");
const {
  configureCORS,
  createRateLimiter,
  errorHandler,
  requestLogger,
  securityHeaders,
  authenticateApiKey,
  validateRequest,
  healthCheckBypass,
} = require("./src/api/middleware");

// Initialize Express app
const app = express();

// Trust proxy if configured (for rate limiting behind reverse proxy)
if (config.security.trustProxy) {
  app.set("trust proxy", 1);
}

// Global Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static("public"));

// Security headers
if (config.security.enableCORS) {
  app.use(configureCORS());
}
app.use(securityHeaders);

// Request logging
if (config.isDevelopment) {
  app.use(requestLogger);
}

// Health check endpoint (no auth required)
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: require("./package.json").version,
    network: config.network.type,
  });
});

// API info endpoint
app.get("/api", (req, res) => {
  res.json({
    name: "XRPL Streaming Payment API",
    version: require("./package.json").version,
    network: config.network.type,
    currencies: ["XRP", "RLUSD"],
    endpoints: {
      health: "/health",
      xrp_channels: {
        start: "POST /api/stream/start",
        stop: "POST /api/stream/stop",
        claim: "GET /api/stream/claim",
        validate: "POST /api/stream/validate",
        finalize: "POST /api/stream/finalize",
        status: "GET /api/stream/status",
        history: "GET /api/stream/history",
      },
      rlusd_streaming: {
        start: "POST /api/rlusd/stream/start",
        payment: "POST /api/rlusd/stream/payment",
        status: "GET /api/rlusd/stream/status/:sessionKey",
        stop: "POST /api/rlusd/stream/stop",
        active: "GET /api/rlusd/streams/active",
      },
    },
  });
});

// Apply rate limiting
if (config.security.enableRateLimiting) {
  const rateLimiter = createRateLimiter(
    config.rateLimit.windowMs,
    config.rateLimit.maxRequests
  );
  app.use("/api", rateLimiter);
}

// Authentication middleware (skip health checks)
if (config.security.enableApiKeyAuth) {
  app.use("/api", healthCheckBypass, authenticateApiKey);
}

// Validation middleware
app.use("/api", validateRequest);

// API Routes
app.use("/api/stream", streamRoutes); // XRP Payment Channels
app.use("/api/rlusd", rlusdRoutes); // RLUSD Direct Payments

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize XRPL connection and start server
async function startServer() {
  try {
    console.log("=".repeat(50));
    console.log("XRPL Streaming Payment System");
    console.log("=".repeat(50));
    console.log(
      `Environment: ${config.isDevelopment ? "Development" : "Production"}`
    );
    console.log(`Network: ${config.network.type}`);

    // Initialize XRPL client
    console.log("\nInitializing XRPL connection...");
    const clientManager = getClientManager();
    await clientManager.connect();

    console.log("✓ XRPL client initialized and connected");

    // Set up graceful shutdown
    setupGracefulShutdown(clientManager);

    // Start Express server
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log("\n" + "=".repeat(50));
      console.log(
        `✓ Server running on http://${config.server.host}:${config.server.port}`
      );
      console.log("=".repeat(50));
      console.log("\nAvailable endpoints:");
      console.log(
        `  Health Check: http://localhost:${config.server.port}/health`
      );
      console.log(`  API Base: http://localhost:${config.server.port}/api`);
      console.log("\nStreaming endpoints:");
      console.log(`  Start Stream: POST /api/stream/start`);
      console.log(`  Stop Stream: POST /api/stream/stop`);
      console.log(`  Get Claim: GET /api/stream/claim?channelId=<id>`);
      console.log(`  Validate Claim: POST /api/stream/validate`);
      console.log(`  Finalize Stream: POST /api/stream/finalize`);
      console.log(`  Get Status: GET /api/stream/status?channelId=<id>`);
      console.log(`  Get History: GET /api/stream/history?channelId=<id>`);
      console.log("\n" + "=".repeat(50));

      if (!config.security.enableApiKeyAuth) {
        console.warn("\n⚠️  Warning: API key authentication is disabled!");
        console.warn("Set API_KEY in .env to enable authentication.\n");
      }

      if (config.isDevelopment) {
        console.log("\n💡 Running in development mode");
        console.log('Use "npm run dev" for auto-reload with nodemon\n');
      }
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`\n❌ Port ${config.server.port} is already in use`);
        process.exit(1);
      } else {
        console.error("\n❌ Server error:", error);
        process.exit(1);
      }
    });
  } catch (error) {
    console.error("\n❌ Failed to start server:", error);
    process.exit(1);
  }
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(clientManager) {
  const shutdown = async (signal) => {
    console.log(`\n\nReceived ${signal}, shutting down gracefully...`);

    try {
      // Disconnect from XRPL
      console.log("Disconnecting from XRPL...");
      await clientManager.disconnect();
      console.log("✓ Disconnected from XRPL");

      console.log("✓ Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("\n❌ Uncaught Exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("\n❌ Unhandled Rejection at:", promise, "reason:", reason);
    shutdown("unhandledRejection");
  });
}

// Start the server
if (require.main === module) {
  startServer();
}

module.exports = app;
