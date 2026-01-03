#!/usr/bin/env npx tsx
/**
 * Triton Inference Server Performance Test
 * Tests gRPC inference via NVIDIA Triton with TensorRT optimization
 *
 * Usage:
 *   npx tsx scripts/test-triton.ts
 *   npx tsx scripts/test-triton.ts --compare     # Compare CPU vs Triton
 *   npx tsx scripts/test-triton.ts --url=host:8001
 */

import { createAnonymizer, type NERConfig } from "../src/index.js";

// Test texts of varying complexity
const TEST_TEXTS = {
  short: "Contact John Smith at john.smith@example.com for more information.",

  medium: `Dear Dr. Maria Garcia,

Thank you for your inquiry regarding the project timeline. 
Please reach out to our Paris office at +33 1 42 68 53 00 or email support@acme-corp.fr.
Your account number is DE89 3704 0044 0532 0130 00.

Best regards,
Thomas Anderson
CEO, Acme Corporation`,

  long: `CONFIDENTIAL MEMO

From: Sarah Johnson, VP of Operations, Globex Industries
To: Executive Leadership Team
CC: Michael Chen (Legal), Dr. Emma Wilson (Compliance)

Subject: Q4 2025 Data Privacy Audit Results

Dear Team,

Following our comprehensive audit conducted between November 15-30, 2025, I am pleased to present the findings for our European operations.

Key Contacts Reviewed:
- Munich Office: Hans Mueller (hans.mueller@globex.de), +49 89 123 4567
- London Office: James Williams (j.williams@globex.co.uk), +44 20 7946 0958  
- Paris Office: Marie Dubois (m.dubois@globex.fr), +33 1 42 68 53 00

Financial Account References:
- Primary EUR Account: DE89 3704 0044 0532 0130 00 (Deutsche Bank)
- GBP Operations: GB82 WEST 1234 5698 7654 32 (NatWest)
- USD Transfers: Routed via JP Morgan Chase, Account ending 4521

Infrastructure Notes:
The primary data center (192.168.1.100) showed 99.97% uptime.
API Gateway: https://api.globex-internal.com/v2/customers
Customer Portal: https://portal.globex.com/login?user=admin

Credit cards on file for corporate expenses:
- 4532 0123 4567 8901 (Visa, expires 03/27)
- 5412 7534 9821 0046 (Mastercard, expires 11/26)

Please contact me at sarah.johnson@globex.com or my mobile +1 (555) 234-5678 to discuss.

Regards,
Sarah Johnson
Employee ID: EMP-2024-00142
SSN Reference: XXX-XX-1234 (last 4 only, per policy)`,
};

interface BenchmarkResult {
  backend: "onnx-cpu" | "triton";
  textType: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  entitiesFound: number;
  throughputTextsPerSec: number;
}

async function runBenchmark(
  backend: "onnx-cpu" | "triton",
  textType: keyof typeof TEST_TEXTS,
  tritonUrl: string,
  iterations: number = 10,
  warmupIterations: number = 3
): Promise<BenchmarkResult> {
  const text = TEST_TEXTS[textType];

  console.log(`\n🔧 Setting up ${backend.toUpperCase()} inference...`);

  let nerConfig: NERConfig;

  if (backend === "triton") {
    nerConfig = {
      mode: "quantized",
      backend: "triton",
      tritonUrl: tritonUrl,
      autoDownload: true,
      onStatus: (status) => console.log(`   ${status}`),
    };
  } else {
    nerConfig = {
      mode: "quantized",
      backend: "onnx",
      device: "cpu",
      autoDownload: true,
      onStatus: (status) => console.log(`   ${status}`),
    };
  }

  const anonymizer = createAnonymizer({ ner: nerConfig });

  console.log(`   Initializing...`);
  const initStart = performance.now();
  await anonymizer.initialize();
  const initTime = performance.now() - initStart;
  console.log(`   ✓ Ready in ${initTime.toFixed(0)}ms`);

  // Warmup runs (not counted)
  console.log(`   Warming up (${warmupIterations} iterations)...`);
  for (let i = 0; i < warmupIterations; i++) {
    await anonymizer.anonymize(text);
  }

  // Benchmark runs
  console.log(`   Running benchmark (${iterations} iterations)...`);
  const times: number[] = [];
  let entitiesFound = 0;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const result = await anonymizer.anonymize(text);
    const elapsed = performance.now() - start;
    times.push(elapsed);
    entitiesFound = result.entities.length;
  }

  await anonymizer.dispose();

  const totalTimeMs = times.reduce((a, b) => a + b, 0);
  const avgTimeMs = totalTimeMs / iterations;
  const minTimeMs = Math.min(...times);
  const maxTimeMs = Math.max(...times);
  const throughputTextsPerSec = 1000 / avgTimeMs;

  return {
    backend,
    textType,
    iterations,
    totalTimeMs,
    avgTimeMs,
    minTimeMs,
    maxTimeMs,
    entitiesFound,
    throughputTextsPerSec,
  };
}

function printResult(result: BenchmarkResult): void {
  const backendLabel =
    result.backend === "triton" ? "TRITON (gRPC)" : "ONNX (CPU)";
  console.log(`
┌────────────────────────────────────────────────────┐
│ ${backendLabel.padEnd(12)} | ${result.textType.padEnd(8)} text                   │
├────────────────────────────────────────────────────┤
│ Avg Time:      ${result.avgTimeMs.toFixed(2).padStart(8)} ms                     │
│ Min Time:      ${result.minTimeMs.toFixed(2).padStart(8)} ms                     │
│ Max Time:      ${result.maxTimeMs.toFixed(2).padStart(8)} ms                     │
│ Throughput:    ${result.throughputTextsPerSec.toFixed(1).padStart(8)} texts/sec              │
│ Entities:      ${String(result.entitiesFound).padStart(8)}                        │
└────────────────────────────────────────────────────┘`);
}

function printComparison(results: BenchmarkResult[]): void {
  const cpuResult = results.find((r) => r.backend === "onnx-cpu");

  console.log("\n📊 COMPARISON SUMMARY");
  console.log("═".repeat(65));

  for (const result of results) {
    const speedup = cpuResult ? cpuResult.avgTimeMs / result.avgTimeMs : 1;
    const speedupStr =
      result.backend === "onnx-cpu"
        ? "(baseline)"
        : `${speedup.toFixed(2)}x faster`;

    const backendLabel =
      result.backend === "triton" ? "TRITON" : "CPU";

    console.log(
      `${backendLabel.padEnd(10)} │ ` +
        `${result.avgTimeMs.toFixed(2).padStart(8)} ms │ ` +
        `${result.throughputTextsPerSec.toFixed(1).padStart(6)} texts/sec │ ` +
        `${speedupStr}`
    );
  }
  console.log("═".repeat(65));
}

async function checkTritonConnection(url: string): Promise<boolean> {
  try {
    // Try HTTP health endpoint first (simpler check)
    const httpUrl = url.replace(/:8001$/, ":8000");
    const response = await fetch(`http://${httpUrl}/v2/health/ready`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const compareMode = args.includes("--compare");
  const urlArg = args.find((a) => a.startsWith("--url="))?.split("=")[1];
  const tritonUrl = urlArg ?? "localhost:8001";
  const textType = (args
    .find((a) => a.startsWith("--text="))
    ?.split("=")[1] ?? "medium") as keyof typeof TEST_TEXTS;
  const iterations = parseInt(
    args.find((a) => a.startsWith("--iterations="))?.split("=")[1] ?? "10",
    10
  );

  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          REHYDRA TRITON PERFORMANCE TEST                   ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  console.log(`\n📋 Test Configuration:`);
  console.log(`   Text type:    ${textType} (${TEST_TEXTS[textType].length} chars)`);
  console.log(`   Iterations:   ${iterations}`);
  console.log(`   Triton URL:   ${tritonUrl}`);
  console.log(`   Mode:         ${compareMode ? "CPU vs Triton comparison" : "Triton only"}`);

  // Check Triton connection
  console.log(`\n🔌 Checking Triton connection...`);
  const tritonReady = await checkTritonConnection(tritonUrl);

  if (!tritonReady) {
    console.error(`
❌ Triton server not reachable at ${tritonUrl}

To start Triton:
  1. cd docker/triton
  2. ./setup.sh quantized
  3. docker compose up -d
  4. Wait for model to load (check: docker compose logs -f triton)
  5. Re-run this test

Or run CPU-only test:
  npx tsx scripts/test-triton.ts --compare
`);

    if (!compareMode) {
      process.exit(1);
    }

    console.log("   Triton not available, running CPU-only benchmark...\n");
  } else {
    console.log("   ✓ Triton server is ready\n");
  }

  if (compareMode) {
    const results: BenchmarkResult[] = [];

    // Run CPU baseline
    console.log("─".repeat(60));
    console.log("Running ONNX CPU baseline...");
    results.push(await runBenchmark("onnx-cpu", textType, tritonUrl, iterations));
    printResult(results[results.length - 1]);

    // Run Triton if available
    if (tritonReady) {
      console.log("\n" + "─".repeat(60));
      console.log("Running Triton (TensorRT)...");
      results.push(await runBenchmark("triton", textType, tritonUrl, iterations));
      printResult(results[results.length - 1]);
    }

    printComparison(results);
  } else {
    // Triton only
    const result = await runBenchmark("triton", textType, tritonUrl, iterations);
    printResult(result);
  }

  console.log("\n✅ Test complete!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});


