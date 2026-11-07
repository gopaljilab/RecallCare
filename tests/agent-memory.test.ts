import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryService } from "../server/agent/memory";
import { ResilientLLMService } from "../server/agent/llm";
import type { Assessment } from "@shared/schema";

describe("MemoryService", () => {
  it("initializes in degraded mode when disabled via MEMORY_ENABLED=false", async () => {
    const originalEnv = process.env.MEMORY_ENABLED;
    process.env.MEMORY_ENABLED = "false";

    try {
      const svc = new MemoryService();
      expect(svc.isMemoryEnabled()).toBe(false);

      const recall = await svc.recallForPatient("p101", "test query");
      expect(recall.memoryEnabled).toBe(false);
      expect(recall.memories).toEqual([]);
      expect(recall.count).toBe(0);

      const dummyAssessment: Assessment = {
        id: 999,
        patientName: "Test Patient",
        gender: "Male",
        age: 50,
        hypertension: false,
        heartDisease: false,
        smokingHistory: "never",
        bmi: 25.0,
        hba1cLevel: 5.5,
        bloodGlucoseLevel: 100,
        insulin: null,
        skinThickness: null,
        riskScore: 20.0,
        riskCategory: "LOW",
        factors: [],
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
        predictionMethod: null,
        modelVersion: null,
        fallbackUsed: null,
        createdBy: null,
        clinicalNote: null,
        explainableInsights: null,
        createdAt: new Date(),
      };

      const retainOk = await svc.retainAssessment(dummyAssessment, "p101");
      expect(retainOk).toBe(false);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MEMORY_ENABLED;
      } else {
        process.env.MEMORY_ENABLED = originalEnv;
      }
    }
  });
});

describe("ResilientLLMService", () => {
  it("uses deterministic non-LLM fallback when API key is missing or invalid", async () => {
    const originalKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;

    try {
      const llm = new ResilientLLMService();
      const result = await llm.generateInsight({
        systemPrompt: "System instruction",
        userPrompt: "Patient assessment summary",
        patientMetrics: {
          patientName: "Marcus Vance",
          riskScore: 71.5,
          riskCategory: "HIGH",
          factors: [
            { name: "Hba1c Level", impact: "positive", description: "Elevated" },
            { name: "Blood Glucose Level", impact: "positive", description: "High fasting" },
          ],
          glucose: 156,
          hba1c: 7.1,
          bmi: 31.4,
        },
        recalledMemories: [
          { id: "mem-1", text: "Visit 1: lifestyle intervention prescribed" },
        ],
        memoryEnabled: true,
      });

      expect(result.fallbackUsed).toBe(true);
      expect(result.isDeterministicFallback).toBe(true);
      expect(result.modelUsed).toBe("deterministic-rules-engine");
      expect(result.text).toContain("Marcus Vance");
      expect(result.text).toContain("71.5%");
      // Verify no specific drug dosages exist in deterministic output
      expect(result.text).not.toContain("850mg");
      expect(result.text).not.toContain("500mg");
      expect(result.text).toContain("reviewing adherence and treatment options with the clinician");
    } finally {
      if (originalKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalKey;
      }
    }
  });

  it("fairly supports memory OFF mode in deterministic and LLM pathways", async () => {
    const originalKey = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      const llm = new ResilientLLMService();
      const result = await llm.generateInsight({
        systemPrompt: "System instruction",
        userPrompt: "Patient assessment summary",
        patientMetrics: {
          patientName: "Marcus Vance",
          riskScore: 71.5,
          riskCategory: "HIGH",
          factors: [
            { name: "Hba1c Level", impact: "positive", description: "Elevated" },
          ],
          glucose: 156,
          hba1c: 7.1,
          bmi: 31.4,
        },
        memoryEnabled: false,
      });

      expect(result.text).toContain("Marcus Vance");
      expect(result.text).toContain("71.5%");
      expect(result.text).toContain("General clinical guideline recommendation");
      // Verify no drug names or specific dosages in memory OFF fallback
      expect(result.text).not.toContain("850mg");
      expect(result.text).not.toContain("500mg");
      expect(result.text).not.toContain("Metformin");
      expect(result.text).not.toContain("GLP-1");
      expect(result.text).toContain("standard glycemic monitoring, lifestyle intervention review, and follow-up assessment");
    } finally {
      if (originalKey === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = originalKey;
      }
    }
  });
});
