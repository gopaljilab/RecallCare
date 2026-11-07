import { HindsightClient } from "@vectorize-io/hindsight-client";
import type { RecallResponse, RetainResponse } from "@vectorize-io/hindsight-client";

// Attempt to load .env file if available
try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(".env");
  }
} catch {
  // .env may not exist yet or already loaded
}

async function runRealHindsightSmokeTest() {
  console.log("===============================================================");
  console.log("  REAL HINDSIGHT SERVER SMOKE TEST (NO MOCK)");
  console.log("===============================================================\n");

  const baseUrl = process.env.HINDSIGHT_API_URL || "https://api.hindsight.vectorize.io";
  const apiKey = process.env.HINDSIGHT_API_KEY;
  const bankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";

  console.log(`Target Hindsight URL: ${baseUrl}`);
  console.log(`Bank ID: ${bankId}`);
  console.log(`API Key: ${apiKey ? "Configured (length " + apiKey.length + ")" : "MISSING"}\n`);

  if (!apiKey) {
    console.error("ERROR: HINDSIGHT_API_KEY is not defined in .env or environment.");
    console.error("Please add HINDSIGHT_API_KEY=your_key to your .env file to run against Hindsight Cloud.");
    process.exit(1);
  }

  // Hook global fetch to capture exact outgoing wire request and incoming response
  const originalFetch = globalThis.fetch;
  const loggedInteractions: Array<{
    url: string;
    method: string;
    headers: any;
    requestBody: any;
    status: number;
    statusText: string;
    responseBody: any;
  }> = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || "GET";
    let requestBody: any = null;
    if (init?.body) {
      try {
        requestBody = JSON.parse(init.body as string);
      } catch {
        requestBody = init.body;
      }
    }

    const response = await originalFetch(input, init);
    const cloned = response.clone();
    let responseBody: any = null;
    try {
      responseBody = await cloned.json();
    } catch {
      try {
        responseBody = await cloned.text();
      } catch {
        responseBody = null;
      }
    }

    loggedInteractions.push({
      url: urlStr,
      method,
      headers: init?.headers,
      requestBody,
      status: response.status,
      statusText: response.statusText,
      responseBody,
    });

    return response;
  };

  try {
    const client = new HindsightClient({
      baseUrl,
      apiKey,
    });

    // 1. Ensure or probe bank
    console.log(`[1/3] Ensuring memory bank '${bankId}' exists...`);
    try {
      await client.createBank(bankId, {
        name: "RecallCare Memory Bank",
        mission: "Maintain longitudinal memory of patient diabetes risk assessments, clinician decisions, and outcomes.",
      });
      console.log(`Bank '${bankId}' created or verified.`);
    } catch (bankErr: any) {
      console.log(`Bank creation/check notice: ${bankErr.message || bankErr}`);
    }

    // 2. Retain for Patient A (Marcus Vance, #101)
    console.log(`\n[2/3] Retaining memory for Patient A (ID: 101, Marcus Vance)...`);
    const patientAContent = "Patient Marcus Vance (#101), Visit 3: HbA1c 6.8%, BMI 31.2. Lifestyle counseling attempted twice without improvement. Initiated Metformin therapy. Advised monitoring adherence.";
    const retainA = await client.retain(bankId, patientAContent, {
      context: "clinical_assessment",
      documentId: "patient-101-visit-3",
      timestamp: new Date().toISOString(),
      tags: ["patient:101", "type:assessment"],
      metadata: {
        patientId: "101",
        visitId: "3",
      },
    });

    console.log("\n>>> RAW RETAIN SDK RESULT (Patient 101):");
    console.log(JSON.stringify(retainA, null, 2));

    // Also retain for Patient B (Elena Rostova, #102) to verify isolation
    console.log(`\nRetaining memory for Patient B (ID: 102, Elena Rostova)...`);
    const patientBContent = "Patient Elena Rostova (#102), Visit 2: HbA1c 7.4%, BMI 28.5. Initiated GLP-1 receptor agonist. Blood pressure 138/86.";
    await client.retain(bankId, patientBContent, {
      context: "clinical_assessment",
      documentId: "patient-102-visit-2",
      timestamp: new Date().toISOString(),
      tags: ["patient:102", "type:assessment"],
      metadata: {
        patientId: "102",
        visitId: "2",
      },
    });

    // 3. Recall scoped strictly to Patient 101
    console.log(`\n[3/3] Recalling memories strictly scoped to Patient 101...`);
    const recallQuery = "What past interventions were attempted and what glycemic trends were noted?";
    const recallResponse = await client.recall(bankId, recallQuery, {
      tags: ["patient:101"],
      tagsMatch: "all_strict",
      maxTokens: 4096,
      budget: "mid",
    });

    console.log("\n>>> RAW RECALL SDK RESULT (Patient 101 Scoped):");
    console.log(JSON.stringify(recallResponse, null, 2));

    // Print all captured raw HTTP wire requests & responses
    console.log("\n===============================================================");
    console.log("  RAW HTTP WIRE AUDIT (From Real Server)");
    console.log("===============================================================");
    for (const [idx, log] of loggedInteractions.entries()) {
      console.log(`\n--- Interaction #${idx + 1}: ${log.method} ${log.url} ---`);
      console.log(`Status: ${log.status} ${log.statusText}`);
      console.log("Request Payload:", JSON.stringify(log.requestBody, null, 2));
      console.log("Response Payload:", JSON.stringify(log.responseBody, null, 2));
    }

    console.log("\n===============================================================");
    console.log("  PATIENT ISOLATION VERIFICATION:");
    const results = recallResponse.results || [];
    const hasOnlyPatientA = results.every(
      (r) => r.tags?.includes("patient:101") && !r.tags?.includes("patient:102")
    );
    console.log(`Total recalled results: ${results.length}`);
    console.log(`Strict isolation (Only Patient 101): ${hasOnlyPatientA ? "PASSED" : "FAILED"}`);
    console.log("===============================================================\n");

    console.log("REAL HINDSIGHT SMOKE TEST COMPLETE.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runRealHindsightSmokeTest().catch((err) => {
  console.error("Smoke test failed with error:", err);
  process.exit(1);
});
