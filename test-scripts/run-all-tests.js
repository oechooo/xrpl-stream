/**
 * Master Test Runner
 * Runs comprehensive tests for both XRP and RLUSD streaming
 */

const { fullXRPStreamingTest } = require("./full-xrp-streaming-test");
const { fullRLUSDStreamingTest } = require("./full-rlusd-streaming-test");
const { testAllLogic } = require("./logic-only-tests");

async function runAllTests() {
  console.log("🎯 XRPL STREAMING SYSTEM - COMPREHENSIVE TEST SUITE");
  console.log("=".repeat(80));
  console.log(
    "This will test both XRP Payment Channels and RLUSD Direct Payments\n"
  );

  const startTime = Date.now();
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: XRP Streaming
  console.log("🔥 Starting XRP Payment Channel Tests...\n");
  try {
    await fullXRPStreamingTest();
    console.log("✅ XRP streaming tests PASSED\n");
    testsPassed++;
  } catch (error) {
    console.error("❌ XRP streaming tests FAILED:", error.message);
    testsFailed++;
  }

  // Wait between tests
  console.log("⏳ Waiting 5 seconds before next test...\n");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Test 2: RLUSD Streaming
  console.log("💰 Starting RLUSD Direct Payment Tests...\n");
  try {
    await fullRLUSDStreamingTest();
    console.log("✅ RLUSD streaming tests PASSED\n");
    testsPassed++;
  } catch (error) {
    console.error("❌ RLUSD streaming tests FAILED:", error.message);
    testsFailed++;
  }

  // Final Results
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  console.log("🏁 TEST SUITE COMPLETED");
  console.log("=".repeat(80));
  console.log(`✅ Tests Passed: ${testsPassed}/2`);
  console.log(`❌ Tests Failed: ${testsFailed}/2`);
  console.log(`⏱️  Total Duration: ${duration} seconds`);
  console.log("=".repeat(80));

  if (testsFailed > 0) {
    console.log("\n❌ SOME TESTS FAILED - Check error messages above");
    process.exit(1);
  } else {
    console.log(
      "\n🎉 ALL TESTS PASSED - Both XRP and RLUSD streaming work perfectly!"
    );
    process.exit(0);
  }
}

// Individual test options
async function runLogicOnly() {
  console.log("🧮 Running logic-only tests...\n");
  try {
    await testAllLogic();
    console.log("\n✅ Logic tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Logic tests failed:", error.message);
    process.exit(1);
  }
}
async function runXRPOnly() {
  console.log("🔥 Running XRP-only tests...\n");
  try {
    await fullXRPStreamingTest();
    console.log("\n✅ XRP tests completed successfully!");
  } catch (error) {
    console.error("\n❌ XRP tests failed:", error.message);
    process.exit(1);
  }
}

async function runRLUSDOnly() {
  console.log("💰 Running RLUSD-only tests...\n");
  try {
    await fullRLUSDStreamingTest();
    console.log("\n✅ RLUSD tests completed successfully!");
  } catch (error) {
    console.error("\n❌ RLUSD tests failed:", error.message);
    process.exit(1);
  }
}

// Command line handling
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--logic-only")) {
    runLogicOnly().catch(console.error);
  } else if (args.includes("--xrp-only")) {
    runXRPOnly().catch(console.error);
  } else if (args.includes("--rlusd-only")) {
    runRLUSDOnly().catch(console.error);
  } else {
    console.log("Usage options:");
    console.log(
      "  node test-scripts/run-all-tests.js                # Run both XRP and RLUSD tests"
    );
    console.log(
      "  node test-scripts/run-all-tests.js --logic-only  # Run only logic tests (no tokens needed)"
    );
    console.log(
      "  node test-scripts/run-all-tests.js --xrp-only    # Run only XRP tests"
    );
    console.log(
      "  node test-scripts/run-all-tests.js --rlusd-only  # Run only RLUSD tests"
    );
    console.log("\nStarting full test suite...\n");
    runAllTests().catch(console.error);
  }
}

module.exports = {
  runAllTests,
  runLogicOnly,
  runXRPOnly,
  runRLUSDOnly,
};
