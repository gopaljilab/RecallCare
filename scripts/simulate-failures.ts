import assert from "node:assert";
import express from "express";
import request from "supertest";
import { agentRouter } from "../server/agent/agent.routes";
import { storage } from "../server/storage";
import { llmService } from "../server/agent/llm";
import { memoryService } from "../server/agent/memory";
import type { Assessment, User } from "@shared/schema";

async function runFailureSimulations() {
  console.log("===================================================================");
  console.log("  DETERMINISTIC FAILURE SIMULATION & RESILIENCE AUDIT");
  console.log("===================================================================\n");

  const testBankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";
  memoryService.setBankId(testBankId);

  const mockUser: User = {
    id: "sim-user-1",
    fullName: "Dr. Evelyn Reed",
    email: "evelyn@hospital.org",
    medicalLicenseNumber: "MD-SIM-123",
    passwordHash: "hash",
    isActive: true,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    role: "provider",
    reportFrequency: "none",
    createdAt: new Date(),
  };

  const mockAssessment: Assessment = {
    id: 101,
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
      { name: "Bmi", impact: "positive", description: "Obese range BMI 31.4" },
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

  // Setup Express app
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { user: mockUser } as any;
    next();
  });
  app.use("/api/assessments", agentRouter);

  // Mock storage lookup
  storage.getAssessmentById = async (id: number) => {
    if (id === 101) return mockAssessment;
    return undefined;
  };

  // Fast retry delay for deterministic tests (5ms)
  llmService.retryDelayOverrideMs = 5;

  const originalClient = (llmService as any).client;
  const originalApiKey = (llmService as any).apiKey;

  try {
    // -------------------------------------------------------------
    // SIMULATION 1: Invalid Groq API Key
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------------------");
    console.log("SIMULATION 1: Invalid Groq API Key");
    console.log("Testing rejection of invalid key and fallback to rules engine");
    {
      (llmService as any).apiKey = "gsk_invalid_test_key";
      (llmService as any).client = {
        chat: {
          completions: {
            create: async () => {
              const err: any = new Error("Invalid API Key provided (401: Unauthorized)");
              err.status = 401;
              throw err;
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/assessments/101/insight")
        .send({ memoryEnabled: false });

      console.log(`Status Code: ${res.status}`);
      console.log(`Model Used: ${res.body.modelUsed}`);
      console.log(`Fallback Used: ${res.body.fallbackUsed}`);
      console.log(`Insight: "${res.body.insight.substring(0, 120)}..."`);

      assert.strictEqual(res.status, 200, "Must return HTTP 200");
      assert.strictEqual(res.body.modelUsed, "deterministic-rules-engine", "Must fall back to rules engine on 401 invalid key");
      assert.strictEqual(res.body.fallbackUsed, true, "fallbackUsed must be true");
      assert.ok(res.body.insight.length > 50, "Must provide clean clinical guidance text");
      console.log("Sim 1 Result: PASSED (Strict assertions verified)\n");
    }

    // -------------------------------------------------------------
    // SIMULATION 2: Malformed Tool-Call JSON Arguments
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------------------");
    console.log("SIMULATION 2: Malformed Tool-Call JSON Arguments");
    console.log("Testing that corrective prompt retry occurs and recovers model");
    {
      (llmService as any).apiKey = "gsk_valid_simulated_key";
      let turn = 0;
      let correctiveMessageReceived = false;

      (llmService as any).client = {
        chat: {
          completions: {
            create: async (params: any) => {
              turn++;
              if (turn === 1) {
                // Turn 1: Model outputs broken JSON for tool arguments
                return {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        tool_calls: [
                          {
                            id: "call_malformed_1",
                            type: "function",
                            function: {
                              name: "get_patient_trend",
                              arguments: "{ invalid_unquoted_json: ",
                            },
                          },
                        ],
                      },
                    },
                  ],
                };
              }

              // Turn 2: Inspect messages to assert the corrective tool message was passed back
              const toolMessages = params.messages.filter((m: any) => m.role === "tool");
              if (toolMessages.some((m: any) => m.content.includes("Malformed JSON in arguments"))) {
                correctiveMessageReceived = true;
              }

              return {
                choices: [
                  {
                    message: {
                      role: "assistant",
                      content: "Corrected insight: Patient Marcus Vance exhibits persistent hyperglycemia. Clinical adherence review recommended.",
                    },
                  },
                ],
              };
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/assessments/101/insight")
        .send({ memoryEnabled: false });

      console.log(`Status Code: ${res.status}`);
      console.log(`Turn Count: ${turn}`);
      console.log(`Corrective Tool Message Received by LLM: ${correctiveMessageReceived ? "YES" : "NO"}`);
      console.log(`Model Used: ${res.body.modelUsed}`);
      console.log(`Insight: "${res.body.insight}"`);

      // Strict assertions:
      assert.strictEqual(res.status, 200, "Must return HTTP 200");
      assert.strictEqual(turn, 2, "Must execute exactly 2 turns (turn 1 broken JSON, turn 2 after corrective message)");
      assert.strictEqual(correctiveMessageReceived, true, "Turn 2 must receive corrective error prompt from tool runner");
      assert.strictEqual(res.body.modelUsed, "openai/gpt-oss-120b", "Must recover on primary model, not drop to rules engine");
      assert.ok(res.body.insight.includes("Corrected insight"), "Must deliver recovered LLM insight");
      console.log("Sim 2 Result: PASSED (Corrective retry strictly verified)\n");
    }

    // -------------------------------------------------------------
    // SIMULATION 3: 429 Rate Limit (Too Many Requests)
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------------------");
    console.log("SIMULATION 3: 429 Rate Limit (Too Many Requests)");
    console.log("Testing 3 attempts per model, escalation to fallback model, then rules engine");
    {
      (llmService as any).apiKey = "gsk_valid_simulated_key";
      const callLog: Array<{ model: string; timestamp: number }> = [];

      (llmService as any).client = {
        chat: {
          completions: {
            create: async (params: any) => {
              callLog.push({ model: params.model, timestamp: Date.now() });
              const err: any = new Error("Rate limit exceeded (429: Too Many Requests)");
              err.status = 429;
              throw err;
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/assessments/101/insight")
        .send({ memoryEnabled: false });

      const primaryCalls = callLog.filter((c) => c.model === "openai/gpt-oss-120b");
      const fallbackCalls = callLog.filter((c) => c.model === "qwen/qwen3-32b");

      console.log(`Status Code: ${res.status}`);
      console.log(`Primary Model ('openai/gpt-oss-120b') Attempts: ${primaryCalls.length}`);
      console.log(`Fallback Model ('qwen/qwen3-32b') Attempts: ${fallbackCalls.length}`);
      console.log(`Total Bounded Retry Attempts: ${callLog.length}`);
      console.log(`Final Engine Engaged: ${res.body.modelUsed}`);
      console.log(`Insight: "${res.body.insight.substring(0, 120)}..."`);

      // Strict assertions:
      assert.strictEqual(res.status, 200, "Must return HTTP 200");
      assert.strictEqual(primaryCalls.length, 3, "Primary model must attempt 1 initial call + 2 retries = 3 attempts");
      assert.strictEqual(fallbackCalls.length, 3, "Fallback model must attempt 1 initial call + 2 retries = 3 attempts");
      assert.strictEqual(callLog.length, 6, "Total attempts before dropping to deterministic rules engine must be exactly 6");
      assert.strictEqual(res.body.modelUsed, "deterministic-rules-engine", "Final engine must be deterministic-rules-engine");
      assert.strictEqual(res.body.fallbackUsed, true, "fallbackUsed must be true");
      console.log("Sim 3 Result: PASSED (Exact retry counts and model switch strictly verified)\n");
    }

    // -------------------------------------------------------------
    // SIMULATION 4: Service Timeout
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------------------");
    console.log("SIMULATION 4: Service Timeout");
    console.log("Testing timeout handling across models and safe fallback");
    {
      (llmService as any).apiKey = "gsk_valid_simulated_key";
      let timeoutCalls = 0;

      (llmService as any).client = {
        chat: {
          completions: {
            create: async () => {
              timeoutCalls++;
              const err: any = new Error("Groq API request timed out after 15s");
              throw err;
            },
          },
        },
      };

      const res = await request(app)
        .post("/api/assessments/101/insight")
        .send({ memoryEnabled: false });

      console.log(`Status Code: ${res.status}`);
      console.log(`Timeout Calls Triggered: ${timeoutCalls}`);
      console.log(`Model Used: ${res.body.modelUsed}`);

      assert.strictEqual(res.status, 200, "Must return HTTP 200");
      assert.ok(timeoutCalls >= 1, "At least 1 timeout must be triggered");
      assert.strictEqual(res.body.modelUsed, "deterministic-rules-engine", "Must safely land on deterministic-rules-engine");
      console.log("Sim 4 Result: PASSED (Timeout absorbed and fallback delivered)\n");
    }

    // -------------------------------------------------------------
    // SIMULATION 5: Hindsight Service Unreachable
    // -------------------------------------------------------------
    console.log("-------------------------------------------------------------------");
    console.log("SIMULATION 5: Hindsight Service Unreachable / Connection Refused");
    console.log("Testing graceful degradation when persistent memory server is down");
    {
      (llmService as any).apiKey = "gsk_valid_simulated_key";
      (llmService as any).client = {
        chat: {
          completions: {
            create: async () => ({
              choices: [
                {
                  message: {
                    role: "assistant",
                    content: "Marcus Vance has elevated risk metrics. Review glycemic control.",
                  },
                },
              ],
            }),
          },
        },
      };

      const originalRecall = memoryService.recallForPatient;
      memoryService.recallForPatient = async () => ({
        memories: [],
        count: 0,
        memoryEnabled: true,
        degraded: true,
        reason: "ECONNREFUSED: Connection refused at http://127.0.0.1:8888",
      });

      const res = await request(app)
        .post("/api/assessments/101/insight")
        .send({ memoryEnabled: true });

      console.log(`Status Code: ${res.status}`);
      console.log(`Memories Used Count: ${res.body.memoriesUsed.length}`);
      console.log(`Memory Degraded Handled Cleanly: YES`);
      console.log(`Insight: "${res.body.insight}"`);

      assert.strictEqual(res.status, 200, "Must return HTTP 200");
      assert.strictEqual(res.body.memoriesUsed.length, 0, "Memories list must be safely empty on memory outage");
      assert.strictEqual(res.body.memoryEnabled, true, "memoryEnabled flag remains preserved");
      assert.ok(res.body.insight.length > 20, "Insight delivered cleanly without crash");

      memoryService.recallForPatient = originalRecall;
      console.log("Sim 5 Result: PASSED (Degraded memory handled safely with zero crash)\n");
    }

    console.log("===================================================================");
    console.log("  ALL 5 DETERMINISTIC SIMULATIONS PASSED STRICT ASSERTIONS");
    console.log("===================================================================\n");
  } finally {
    (llmService as any).client = originalClient;
    (llmService as any).apiKey = originalApiKey;
    llmService.retryDelayOverrideMs = undefined;
  }
}

runFailureSimulations().catch((err) => {
  console.error("Simulation failure assertion failed:", err);
  process.exit(1);
});
