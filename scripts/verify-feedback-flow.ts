import assert from "node:assert";
import express from "express";
import request from "supertest";
import { agentRouter } from "../server/agent/agent.routes";
import { storage } from "../server/storage";
import { memoryService } from "../server/agent/memory";
import { llmService } from "../server/agent/llm";
import type { Assessment, User } from "@shared/schema";

async function verifyFeedbackFlow() {
  console.log("===================================================================");
  console.log("  VERIFYING CLINICIAN OUTCOME FEEDBACK FLOW (BEFORE / AFTER)");
  console.log("===================================================================\n");

  const testBankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";
  memoryService.setBankId(testBankId);

  const mockUser: User = {
    id: "user-feedback-tester",
    fullName: "Dr. Evelyn Reed",
    email: "evelyn@hospital.org",
    medicalLicenseNumber: "MD-SIM-789",
    passwordHash: "hash",
    isActive: true,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    role: "provider",
    reportFrequency: "none",
    createdAt: new Date(),
  };

  const marcusVanceAssessment: any = {
    id: 101,
    patientId: "101",
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
    createdBy: "evelyn@hospital.org",
    clinicalNote: "Follow-up for persistent hyperglycemia.",
    explainableInsights: null,
    createdAt: new Date(),
  };

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: mockUser } as any;
    next();
  });
  app.use("/api/assessments", agentRouter);

  // Storage mock
  storage.getAssessmentById = async (id: number) => {
    if (id === 101) return marcusVanceAssessment;
    return undefined;
  };

  // In-memory memory harness simulating Hindsight bank for patient 101
  const memoryBank: Array<{ id: string; text: string; date?: string; tags: string[] }> = [
    {
      id: "mem-v1",
      text: "Visit 1 (18 mos ago): Baseline screening. Fasting glucose 115 mg/dL, HbA1c 6.0%. Diet and exercise counseling recommended.",
      date: new Date(Date.now() - 18 * 30 * 86400000).toISOString(),
      tags: ["patient:101", "type:assessment"],
    },
    {
      id: "mem-v2",
      text: "Visit 2 (12 mos ago): Fasting glucose 128 mg/dL, HbA1c 6.4%. Lifestyle counseling repeated; patient reported travel adherence barriers.",
      date: new Date(Date.now() - 12 * 30 * 86400000).toISOString(),
      tags: ["patient:101", "type:assessment"],
    },
    {
      id: "mem-v3",
      text: "Visit 3 (6 mos ago): HbA1c reached 6.8%. Initiated Metformin therapy. Advised monitoring gastrointestinal tolerance and adherence.",
      date: new Date(Date.now() - 6 * 30 * 86400000).toISOString(),
      tags: ["patient:101", "type:assessment"],
    },
  ];

  memoryService.recallForPatient = async (patientId: string) => {
    const scoped = memoryBank.filter((m) => m.tags.includes(`patient:${patientId}`));
    return {
      memories: scoped.map((m) => ({ id: m.id, text: m.text, date: m.date })),
      count: scoped.length,
      memoryEnabled: true,
      degraded: false,
    };
  };

  memoryService.retainOutcome = async (patientId: string, assessmentId: number, outcome: any) => {
    memoryBank.push({
      id: `patient-${patientId}-outcome-${assessmentId}`,
      text: `Clinician Outcome Feedback (Encounter ${assessmentId}): Intervention: ${outcome.intervention || "None"}. Outcome: ${outcome.outcomeText}. Rated: ${outcome.helpful ? "Helpful" : "Needs adjustment"}.`,
      date: new Date().toISOString(),
      tags: [`patient:${patientId}`, "type:outcome"],
    });
    return true;
  };

  // 1. BEFORE FEEDBACK
  console.log("-------------------------------------------------------------------");
  console.log("PHASE 1: Marcus Vance (#101) Insight BEFORE Clinician Feedback");
  console.log("-------------------------------------------------------------------");

  const beforeRes = await request(app)
    .post("/api/assessments/101/insight")
    .send({ memoryEnabled: true });

  assert.strictEqual(beforeRes.status, 200);
  console.log(`Memories Recalled (Before): ${beforeRes.body.memoriesUsed.length}`);
  console.log("Recalled Memories List:");
  beforeRes.body.memoriesUsed.forEach((m: any, i: number) => {
    console.log(`  [${i + 1}] ${m.text}`);
  });
  console.log(`\nGenerated Insight (Before Feedback):\n${beforeRes.body.insight}\n`);

  assert.strictEqual(beforeRes.body.memoriesUsed.length, 3, "Must have exactly 3 initial visit memories");
  assert.ok(!beforeRes.body.insight.includes("daily fasting glucose logging"), "Must not mention post-feedback outcome yet");

  // 2. CLINICIAN SUBMITS FEEDBACK
  console.log("-------------------------------------------------------------------");
  console.log("PHASE 2: Submitting Clinician Decision & Outcome Feedback via POST /api/assessments/101/outcome");
  console.log("-------------------------------------------------------------------");

  const outcomePayload = {
    helpful: true,
    intervention: "Reinforced lifestyle counseling and dietary tracking; reviewed Metformin adherence",
    outcomeText: "Patient agreed to daily fasting glucose logging; scheduled 3-month clinic follow-up",
  };

  const outcomeRes = await request(app)
    .post("/api/assessments/101/outcome")
    .send(outcomePayload);

  console.log(`Status Code: ${outcomeRes.status}`);
  console.log(`Outcome Recorded: ${outcomeRes.body.success}`);
  console.log(`Saved in agent_outcomes: ID ${outcomeRes.body.outcome.id}`);
  console.log(`Retained into Memory: ${outcomeRes.body.memoryRetained}`);

  assert.strictEqual(outcomeRes.status, 201);
  assert.strictEqual(outcomeRes.body.success, true);
  assert.strictEqual(outcomeRes.body.outcome.helpful, true);

  // 3. AFTER FEEDBACK
  console.log("\n-------------------------------------------------------------------");
  console.log("PHASE 3: Marcus Vance (#101) Insight AFTER Clinician Feedback");
  console.log("-------------------------------------------------------------------");

  const afterRes = await request(app)
    .post("/api/assessments/101/insight")
    .send({ memoryEnabled: true });

  assert.strictEqual(afterRes.status, 200);
  console.log(`Memories Recalled (After): ${afterRes.body.memoriesUsed.length}`);
  console.log("Recalled Memories List:");
  afterRes.body.memoriesUsed.forEach((m: any, i: number) => {
    console.log(`  [${i + 1}] ${m.text}`);
  });
  console.log(`\nGenerated Insight (After Feedback Incorporated):\n${afterRes.body.insight}\n`);

  assert.strictEqual(afterRes.body.memoriesUsed.length, 4, "Must now have 4 memories including the newly retained outcome");
  const hasOutcomeMemory = afterRes.body.memoriesUsed.some((m: any) =>
    m.text.includes("daily fasting glucose logging") || m.text.includes("Reinforced lifestyle counseling")
  );
  assert.strictEqual(hasOutcomeMemory, true, "Recalled memories must contain the newly submitted outcome feedback");

  console.log("===================================================================");
  console.log("  BEFORE/AFTER FEEDBACK VERIFICATION COMPLETE: ALL ASSERTIONS PASSED");
  console.log("===================================================================\n");
}

verifyFeedbackFlow().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
