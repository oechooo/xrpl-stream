/**
 * Pure Logic Tests - No tokens or network required
 * Tests all calculation and formatting functions
 */

const {
  // XRP functions
  xrpToDrops,
  dropsToXrp,
  formatXrp,
  calculateStreamingRate,

  // RLUSD functions
  usdToCents,
  centsToUsd,
  formatRLUSD,
  calculateRLUSDStreamingRate,
} = require("../src/utils/converters");

const config = require("../config");

async function testAllLogic() {
  console.log("🧮 PURE LOGIC TESTS - No Network Required");
  console.log("=".repeat(70));
  console.log("Testing all calculation and formatting functions\n");

  let testsPassed = 0;
  let testsFailed = 0;

  function runTest(testName, testFunction) {
    try {
      console.log(`🧪 ${testName}`);
      testFunction();
      console.log("   ✅ PASSED\n");
      testsPassed++;
    } catch (error) {
      console.log(`   ❌ FAILED: ${error.message}\n`);
      testsFailed++;
    }
  }

  // ===== XRP LOGIC TESTS =====
  console.log("🔥 XRP CONVERSION & CALCULATION TESTS");
  console.log("-".repeat(50));

  runTest("XRP ↔ Drops Conversion", () => {
    const testCases = [
      { xrp: 1, drops: "1000000" },
      { xrp: 0.000001, drops: "1" },
      { xrp: 100.5, drops: "100500000" },
      { xrp: 0.1, drops: "100000" },
    ];

    testCases.forEach(({ xrp, drops }) => {
      const convertedDrops = xrpToDrops(xrp);
      const convertedXrp = dropsToXrp(drops);

      if (convertedDrops !== drops) {
        throw new Error(`XRP->Drops: Expected ${drops}, got ${convertedDrops}`);
      }
      if (convertedXrp !== xrp) {
        throw new Error(`Drops->XRP: Expected ${xrp}, got ${convertedXrp}`);
      }

      console.log(`     ${xrp} XRP ↔ ${drops} drops ✓`);
    });
  });

  runTest("XRP Formatting", () => {
    const testCases = [
      { input: 1.234567, expected: "1.234567 XRP" },
      { input: 0.000001, expected: "0.000001 XRP" },
      { input: 1000, expected: "1,000.000000 XRP" },
    ];

    testCases.forEach(({ input, expected }) => {
      const formatted = formatXrp(input);
      if (formatted !== expected) {
        throw new Error(`Expected "${expected}", got "${formatted}"`);
      }
      console.log(`     ${input} → ${formatted} ✓`);
    });
  });

  runTest("XRP Streaming Rate Calculation", () => {
    const testCases = [
      { cost: 10, duration: 3600 }, // 10 XRP over 1 hour
      { cost: 1, duration: 60 }, // 1 XRP over 1 minute
      { cost: 100, duration: 86400 }, // 100 XRP over 24 hours
    ];

    testCases.forEach(({ cost, duration }, i) => {
      const rate = calculateStreamingRate(cost, duration);
      const expectedDropsPerSecond =
        BigInt(xrpToDrops(cost)) / BigInt(duration);

      console.log(`     Scenario ${i + 1}: ${cost} XRP over ${duration}s`);
      console.log(`       Rate: ${rate.formatted.perSecond}/sec`);
      console.log(`       Rate: ${rate.formatted.perMinute}/min`);
      console.log(`       Rate: ${rate.formatted.perHour}/hr`);

      // Verify calculations
      if (BigInt(rate.dropsPerSecond) !== expectedDropsPerSecond) {
        throw new Error(`Rate calculation mismatch`);
      }
    });
  });

  // ===== RLUSD LOGIC TESTS =====
  console.log("💰 RLUSD CONVERSION & CALCULATION TESTS");
  console.log("-".repeat(50));

  runTest("USD ↔ Cents Conversion", () => {
    const testCases = [
      { usd: "1.00", cents: "100" },
      { usd: "0.01", cents: "1" },
      { usd: "10.50", cents: "1050" },
      { usd: "100.99", cents: "10099" },
    ];

    testCases.forEach(({ usd, cents }) => {
      const convertedCents = usdToCents(usd);
      const convertedUsd = centsToUsd(cents);

      if (convertedCents !== cents) {
        throw new Error(`USD->Cents: Expected ${cents}, got ${convertedCents}`);
      }
      if (convertedUsd !== parseFloat(usd)) {
        throw new Error(
          `Cents->USD: Expected ${parseFloat(usd)}, got ${convertedUsd}`
        );
      }

      console.log(`     ${usd} USD ↔ ${cents} cents ✓`);
    });
  });

  runTest("RLUSD Formatting", () => {
    const testCases = [
      { input: 1.234567, expected: "$1.23" },
      { input: 0.1, expected: "$0.10" },
      { input: 1000.5, expected: "$1,000.50" },
      { input: 0.001, expected: "$0.00" },
    ];

    testCases.forEach(({ input, expected }) => {
      const formatted = formatRLUSD(input);
      if (formatted !== expected) {
        throw new Error(`Expected "${expected}", got "${formatted}"`);
      }
      console.log(`     ${input} → ${formatted} ✓`);
    });
  });

  runTest("RLUSD Streaming Rate Calculation", () => {
    const testCases = [
      { cost: 10, duration: 3600 }, // $10 over 1 hour
      { cost: 5, duration: 300 }, // $5 over 5 minutes
      { cost: 100, duration: 86400 }, // $100 over 24 hours
    ];

    testCases.forEach(({ cost, duration }, i) => {
      const rate = calculateRLUSDStreamingRate(cost, duration);
      const expectedCentsPerSecond =
        BigInt(usdToCents(cost.toString())) / BigInt(duration);

      console.log(
        `     Scenario ${i + 1}: ${formatRLUSD(cost)} over ${duration}s`
      );
      console.log(`       Rate: ${rate.formatted.perSecond}/sec`);
      console.log(`       Rate: ${rate.formatted.perMinute}/min`);
      console.log(`       Rate: ${rate.formatted.perHour}/hr`);

      // Verify calculations
      if (BigInt(rate.centsPerSecond) !== expectedCentsPerSecond) {
        throw new Error(`Rate calculation mismatch`);
      }
    });
  });

  // ===== CONFIGURATION TESTS =====
  console.log("⚙️  CONFIGURATION TESTS");
  console.log("-".repeat(50));

  runTest("XRP Configuration", () => {
    if (config.xrp.symbol !== "XRP") {
      throw new Error(`Expected XRP symbol, got ${config.xrp.symbol}`);
    }
    if (config.xrp.decimals !== 6) {
      throw new Error(`Expected 6 decimals, got ${config.xrp.decimals}`);
    }
    console.log(`     Symbol: ${config.xrp.symbol} ✓`);
    console.log(`     Decimals: ${config.xrp.decimals} ✓`);
  });

  runTest("RLUSD Configuration", () => {
    if (config.currency.currency !== "USD") {
      throw new Error(`Expected USD currency, got ${config.currency.currency}`);
    }
    if (!config.currency.issuer) {
      throw new Error("Missing RLUSD issuer address");
    }
    if (config.currency.symbol !== "RLUSD") {
      throw new Error(`Expected RLUSD symbol, got ${config.currency.symbol}`);
    }
    console.log(`     Currency: ${config.currency.currency} ✓`);
    console.log(`     Symbol: ${config.currency.symbol} ✓`);
    console.log(`     Issuer: ${config.currency.issuer.substring(0, 10)}... ✓`);
  });

  // ===== STREAMING SIMULATION TESTS =====
  console.log("🌊 STREAMING SIMULATION TESTS");
  console.log("-".repeat(50));

  runTest("XRP Streaming Simulation", () => {
    const totalXRP = 5;
    const duration = 3600; // 1 hour
    const intervalSeconds = 60; // 1 minute
    const paymentCount = Math.floor(duration / intervalSeconds);

    console.log(`     Streaming ${totalXRP} XRP over ${duration}s:`);
    console.log(`       Payment count: ${paymentCount}`);
    console.log(`       Interval: ${intervalSeconds}s`);

    const rate = calculateStreamingRate(totalXRP, duration);
    console.log(`       Rate: ${rate.formatted.perMinute}/minute`);

    // Simulate first few payments
    for (let i = 1; i <= Math.min(3, paymentCount); i++) {
      const timeElapsed = i * intervalSeconds;
      const amountDue = rate.xrpPerSecond * timeElapsed;
      console.log(`       ${timeElapsed}s: ${formatXrp(amountDue)} claimable`);
    }
  });

  runTest("RLUSD Streaming Simulation", () => {
    const totalRLUSD = 10;
    const duration = 600; // 10 minutes
    const intervalSeconds = 30; // 30 seconds
    const paymentCount = Math.floor(duration / intervalSeconds);
    const paymentAmount = totalRLUSD / paymentCount;

    console.log(`     Streaming ${formatRLUSD(totalRLUSD)} over ${duration}s:`);
    console.log(`       Payment count: ${paymentCount}`);
    console.log(`       Payment amount: ${formatRLUSD(paymentAmount)} each`);
    console.log(`       Interval: ${intervalSeconds}s`);

    const rate = calculateRLUSDStreamingRate(totalRLUSD, duration);
    console.log(`       Rate: ${rate.formatted.perMinute}/minute`);

    // Simulate first few payments
    let totalSent = 0;
    for (let i = 1; i <= Math.min(3, paymentCount); i++) {
      totalSent += paymentAmount;
      const timeElapsed = i * intervalSeconds;
      console.log(
        `       Payment ${i} at ${timeElapsed}s: ${formatRLUSD(
          paymentAmount
        )} (Total: ${formatRLUSD(totalSent)})`
      );
    }
  });

  // ===== EDGE CASE TESTS =====
  console.log("🚨 EDGE CASE TESTS");
  console.log("-".repeat(50));

  runTest("Minimum Values", () => {
    // Test minimum XRP (1 drop)
    const minXRP = dropsToXrp("1");
    const backToDrops = xrpToDrops(minXRP);
    if (backToDrops !== "1") {
      throw new Error("Minimum XRP conversion failed");
    }
    console.log(`     Minimum XRP: ${minXRP} XRP (1 drop) ✓`);

    // Test minimum RLUSD (1 cent)
    const minUSD = centsToUsd("1");
    const backToCents = usdToCents(minUSD.toString());
    if (backToCents !== "1") {
      throw new Error("Minimum USD conversion failed");
    }
    console.log(`     Minimum RLUSD: ${formatRLUSD(minUSD)} (1 cent) ✓`);
  });

  runTest("Large Values", () => {
    // Test large XRP amount
    const largeXRP = 1000000; // 1M XRP
    const largeDrops = xrpToDrops(largeXRP);
    const backToXRP = dropsToXrp(largeDrops);
    if (backToXRP !== largeXRP) {
      throw new Error("Large XRP conversion failed");
    }
    console.log(`     Large XRP: ${formatXrp(largeXRP)} ✓`);

    // Test large RLUSD amount
    const largeUSD = 1000000; // 1M USD
    const largeCents = usdToCents(largeUSD.toString());
    const backToUSD = centsToUsd(largeCents);
    if (backToUSD !== largeUSD) {
      throw new Error("Large USD conversion failed");
    }
    console.log(`     Large RLUSD: ${formatRLUSD(largeUSD)} ✓`);
  });

  // ===== FINAL RESULTS =====
  console.log("🏁 LOGIC TEST RESULTS");
  console.log("=".repeat(70));
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(
    `📊 Success Rate: ${Math.round(
      (testsPassed / (testsPassed + testsFailed)) * 100
    )}%`
  );

  if (testsFailed > 0) {
    console.log("\n❌ Some logic tests failed - check error messages above");
    process.exit(1);
  } else {
    console.log("\n🎉 ALL LOGIC TESTS PASSED!");
    console.log("Both XRP and RLUSD calculations are working correctly");
    console.log("Ready for network testing when you have tokens");
  }
}

// Run if called directly
if (require.main === module) {
  testAllLogic().catch(console.error);
}

module.exports = { testAllLogic };
