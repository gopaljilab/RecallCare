import { insightAgent } from "../server/agent/insight";
import { memoryService } from "../server/agent/memory";
import type { Assessment } from "@shared/schema";

// Attempt to load .env
try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(".env");
  }
} catch {
  // already loaded
}

async function testRealMarcusFlow() {
  console.log("===================================================================");
  console.log("  REAL MARCUS VANCE CLINICAL MEMORY FLOW (HINDSIGHT CLOUD + GROQ)");
  console.log("===================================================================\n");

  const marcusAssessment: Assessment = {
    id: 10104,
    patientId: "101",
    userId: "101",
    patientName: "Marcus Vance",
    gender: "Male",
    age: 53,
    hypertension: true,
    heartDisease: false,
    smokingHistory: "former",
    bmi: 31.4,
    hba1cLevel: 7.1,
    bloodGlucoseLevel: 156,
    insulin: null,
    skinThickness: null,
    riskScore: 71.5,
    riskCategory: "HIGH",
    factors: [
      { name: "Hba1c Level", impact: "positive", description: "Elevated at 7.1%" },
      { name: "Blood Glucose Level", impact: "positive", description: "Fasting 156 mg/dL" },
      { name: "Bmi", impact: "positive", description: "Class I Obesity BMI 31.4" },
    ],
    confidenceInterval: null,
    riskCategoryAssessment: null,
    confidenceScore: null,
    relativeRisk: null,
    riskPercentile: null,
    mortalityRiskScore: null,
    mortalityRiskCategory: null,
    complicationRisks: null,
    featureImportance: null,
    modelMetrics: null,
    predictionMethod: "ml_model",
    modelVersion: "diabetes-clf-v2.1",
    fallbackUsed: false,
    createdBy: "dr.reed@clinicalinsight.dev",
    clinicalNote: "Presents for follow-up. HbA1c 7.1%.",
    explainableInsights: null,
    modelConfidence: null,
    ownerId: null,
    createdAt: new Date(),
  };

  const testBankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";
  memoryService.setBankId(testBankId);
  console.log(`Using test memory bank: '${testBankId}'`);
  console.log("Resetting Hindsight test bank to guarantee 100% clean baseline...");
  await memoryService.resetBank();
  console.log("Seeding clean longitudinal visits for Marcus Vance (Visits 1-4 with distinct dates)...");

  const v1Date = new Date("2025-11-07T00:00:00.000Z");
  const v2Date = new Date("2026-03-07T00:00:00.000Z");
  const v3Date = new Date("2026-07-07T00:00:00.000Z");
  const v4Date = new Date("2026-11-07T00:00:00.000Z");

  await memoryService.retainAssessment({
    ...marcusAssessment,
    id: 10101,
    bloodGlucoseLevel: 115,
    hba1cLevel: 6.0,
    bmi: 30.1,
    riskScore: 28.5,
    riskCategory: "LOW",
    createdAt: v1Date,
    visitNumber: 1,
    documentId: "patient-101-visit-1-assessment",
  }, "101");
  await memoryService.retainClinicianNote("101", "1", "Initial routine wellness encounter. Recommended dietary counseling and walking regimen 30 minutes daily.", v1Date.toISOString());

  await memoryService.retainAssessment({
    ...marcusAssessment,
    id: 10102,
    bloodGlucoseLevel: 128,
    hba1cLevel: 6.4,
    bmi: 30.8,
    riskScore: 46.2,
    riskCategory: "MODERATE",
    createdAt: v2Date,
    visitNumber: 2,
    documentId: "patient-101-visit-2-assessment",
  }, "101");
  await memoryService.retainClinicianNote("101", "2", "Follow-up visit. Glycemic metrics continue to climb. Re-emphasized lifestyle counseling and nutrition consultation.", v2Date.toISOString());

  await memoryService.retainAssessment({
    ...marcusAssessment,
    id: 10103,
    bloodGlucoseLevel: 142,
    hba1cLevel: 6.8,
    bmi: 31.2,
    riskScore: 58.4,
    riskCategory: "MODERATE",
    createdAt: v3Date,
    visitNumber: 3,
    documentId: "patient-101-visit-3-assessment",
  }, "101");
  await memoryService.retainClinicianNote("101", "3", "Patient returns with HbA1c 6.8%. Lifestyle counseling alone proved insufficient over past visits. Initiated Metformin therapy. Patient counseled on adherence.", v3Date.toISOString());

  await memoryService.retainAssessment({
    ...marcusAssessment,
    id: 10104,
    createdAt: v4Date,
    visitNumber: 4,
    documentId: "patient-101-visit-4-assessment",
  }, "101");
  await memoryService.retainClinicianNote("101", "4", "Presents for follow-up. HbA1c 7.1%. Evaluated for persistent hyperglycemia.", v4Date.toISOString());

  console.log("Clean encounters seeded. Waiting 3s for memory bank ingestion index...\n");
  await new Promise((r) => setTimeout(r, 3000));

  // 1. MEMORY OFF (Stateless baseline: assessment's own fields ONLY, 0 recalled memories)
  console.log("-------------------------------------------------------------------");
  console.log("1. MEMORY OFF (Stateless Baseline with Groq LLM):");
  console.log("Input Fields Received by Memory OFF:");
  console.log(JSON.stringify({
    patientName: marcusAssessment.patientName,
    patientId: marcusAssessment.patientId,
    riskScore: marcusAssessment.riskScore,
    riskCategory: marcusAssessment.riskCategory,
    bloodGlucoseLevel: marcusAssessment.bloodGlucoseLevel,
    hba1cLevel: marcusAssessment.hba1cLevel,
    bmi: marcusAssessment.bmi,
    factors: marcusAssessment.factors,
    clinicalNote: marcusAssessment.clinicalNote,
    recalledMemories: [],
  }, null, 2));
  console.log("-------------------------------------------------------------------");
  const offResult = await insightAgent.generateAssessmentInsight(marcusAssessment, { memoryEnabled: false });
  console.log(`Model Used: ${offResult.modelUsed}`);
  console.log(`Memories Recalled: ${offResult.memoriesUsed.length}`);
  console.log(`\nInsight Text (Memory OFF):\n${offResult.insight}\n`);

  // 2. MEMORY ON (Before New Feedback: Recalling Clean Seeded Encounters)
  console.log("-------------------------------------------------------------------");
  console.log("2. MEMORY ON (Before New Feedback - Recalling Seeded Encounters):");
  console.log("-------------------------------------------------------------------");
  const onBeforeResult = await insightAgent.generateAssessmentInsight(marcusAssessment, { memoryEnabled: true });
  console.log(`Model Used: ${onBeforeResult.modelUsed}`);
  console.log(`Memories Recalled: ${onBeforeResult.memoriesUsed.length}`);
  console.log(`Top ${onBeforeResult.memoriesUsed.length} Recalled Records from Hindsight (capped at top 12):`);
  onBeforeResult.memoriesUsed.forEach((m, idx) => {
    console.log(`  [Record #${idx + 1}] Date: ${m.date || m.occurred_start || 'N/A'}`);
    console.log(`    text: "${m.text}"`);
    console.log(`    documentId: ${m.documentId || 'N/A'}`);
  });
  console.log(`\nInsight Text (Before New Feedback):\n${onBeforeResult.insight}\n`);

  // Programmatic Assertion on Before Text
  const beforeLower = onBeforeResult.insight.toLowerCase();
  const beforeHasNausea = beforeLower.includes("nausea");
  const beforeHasDietitian = beforeLower.includes("dietitian");
  console.log(`[Assertion Check] Before-Text Contains 'nausea': ${beforeHasNausea ? "FAIL" : "PASS (false)"}`);
  console.log(`[Assertion Check] Before-Text Contains 'dietitian': ${beforeHasDietitian ? "FAIL" : "PASS (false)"}`);
  if (beforeHasNausea || beforeHasDietitian) {
    throw new Error("Validation Failed: Before-insight already contains the distinctive new feedback fact!");
  }

  // 3. SUBMIT REAL CLINICIAN FEEDBACK WITH DISTINCTIVE NEW FACT TO HINDSIGHT CLOUD
  console.log("-------------------------------------------------------------------");
  console.log("3. SUBMITTING DISTINCTIVE CLINICIAN FEEDBACK TO HINDSIGHT PERSISTENT MEMORY:");
  console.log("-------------------------------------------------------------------");
  const feedbackData = {
    helpful: true,
    intervention: "Dietitian referral for medical nutrition therapy and antiemetic guidance",
    outcomeText: "Patient reported nausea after starting medication; arranged dietitian consultation for meal tolerance strategies.",
  };
  console.log("Feedback Payload:", JSON.stringify(feedbackData, null, 2));

  const retainSuccess = await memoryService.retainOutcome("101", 10104, feedbackData);
  console.log(`Retained to Hindsight Cloud Bank: ${retainSuccess ? "SUCCESS (retained)" : "FAILED"}\n`);

  // Poll until Hindsight Cloud finishes background ingestion and memory unit extraction
  console.log("Waiting for Hindsight Cloud to extract and index new outcome facts...");
  const pollStart = Date.now();
  let indexed = false;
  while (Date.now() - pollStart < 45000) {
    const probe = await memoryService.recallForPatient("101", "nausea medication tolerance dietitian");
    if (probe.memories.some((m) => m.text.toLowerCase().includes("nausea") || m.text.toLowerCase().includes("dietitian"))) {
      indexed = true;
      console.log(`Cloud indexing confirmed in ${Date.now() - pollStart}ms.`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!indexed) {
    throw new Error("Index polling timed out before Hindsight Cloud finished indexing new outcome facts.");
  }

  // 4. MEMORY ON (After Feedback - Must Visibly Use It)
  console.log("-------------------------------------------------------------------");
  console.log("4. MEMORY ON (After Feedback - Recalling With Newly Retained Outcome):");
  console.log("-------------------------------------------------------------------");
  const onAfterResult = await insightAgent.generateAssessmentInsight(marcusAssessment, { memoryEnabled: true });
  console.log(`Model Used: ${onAfterResult.modelUsed}`);
  console.log(`Memories Recalled: ${onAfterResult.memoriesUsed.length}`);
  console.log("Recalled Records Matching New Outcome Feedback:");
  const matchedOutcomes = onAfterResult.memoriesUsed.filter(
    (m) => m.text.toLowerCase().includes("nausea") || m.text.toLowerCase().includes("dietitian")
  );
  matchedOutcomes.forEach((m, idx) => {
    console.log(`  [New Outcome Record #${idx + 1}]: ${m.text}`);
  });
  console.log(`\nInsight Text (Post-Feedback):\n${onAfterResult.insight}\n`);

  // Programmatic Assertion on After Text
  const afterLower = onAfterResult.insight.toLowerCase();
  const afterHasNewFact = afterLower.includes("nausea") || afterLower.includes("dietitian");
  console.log(`[Assertion Check] After-Text Incorporates New Fact ('nausea' or 'dietitian'): ${afterHasNewFact ? "PASS (true)" : "FAIL (false)"}`);
  if (!afterHasNewFact) {
    throw new Error("Validation Failed: After-insight failed to incorporate the newly retained outcome feedback!");
  }

  console.log("===================================================================");
  console.log("  BEFORE/AFTER FEEDBACK VERIFICATION: ALL ASSERTIONS PASSED!");
  console.log("===================================================================");
  process.exit(0);
}

testRealMarcusFlow().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
