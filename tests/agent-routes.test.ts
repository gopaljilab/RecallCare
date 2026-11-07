import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("express-rate-limit", () => {
  const rateLimit = () => (req: any, res: any, next: any) => next();
  return { rateLimit, ipKeyGenerator: (ip: string) => ip, default: rateLimit };
});

import { agentRouter } from "../server/agent/agent.routes";
import { storage } from "../server/storage";
import type { Assessment, User } from "@shared/schema";

describe("Agent Routes - POST /api/assessments/:id/insight", () => {
  const mockUser: User = {
    id: "user-123",
    fullName: "Dr. Alice Smith",
    email: "alice@example.com",
    medicalLicenseNumber: "MD-9999",
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
    createdBy: "alice@example.com",
    clinicalNote: "Follow-up for persistent hyperglycemia.",
    explainableInsights: null,
    createdAt: new Date(),
  };

  // Helper to build app with configurable session state
  const createApp = (sessionUser?: Partial<User> | null) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      if (sessionUser !== null) {
        req.session = {
          user: sessionUser ? { ...mockUser, ...sessionUser } : mockUser,
        } as any;
      }
      next();
    });
    app.use("/api/assessments", agentRouter);
    return app;
  };

  beforeAll(() => {
    vi.spyOn(storage, "getAssessmentById").mockImplementation(async (id: number) => {
      if (id === 101) return mockAssessment;
      return undefined;
    });
  });

  it("returns 401 when request is unauthenticated", async () => {
    const unauthApp = createApp(null);
    const res = await request(unauthApp).post("/api/assessments/101/insight").send();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user email is not verified", async () => {
    const unverifiedApp = createApp({ emailVerified: false });
    const res = await request(unverifiedApp).post("/api/assessments/101/insight").send();
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid ID parameter", async () => {
    const app = createApp();
    const res = await request(app).post("/api/assessments/abc/insight").send();
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid assessment ID parameter");
  });

  it("returns 404 when assessment does not exist", async () => {
    const app = createApp();
    const res = await request(app).post("/api/assessments/999/insight").send();
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Assessment with ID 999 not found");
  });

  it("returns 403 when authenticated user cannot access record owned by another provider", async () => {
    const otherProviderApp = createApp({ id: "user-456", email: "bob@example.com", role: "provider" });
    const res = await request(otherProviderApp).post("/api/assessments/101/insight").send();
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Access denied");
  });

  it("returns 200 with insight and memoryEnabled=true for authorized clinician", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/assessments/101/insight")
      .send({ memoryEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.assessmentId).toBe(101);
    expect(res.body.patientName).toBe("Marcus Vance");
    expect(res.body.riskScore).toBe(71.5);
    expect(res.body.riskCategory).toBe("HIGH");
    expect(res.body.memoryEnabled).toBe(true);
    expect(res.body.disclaimer).toBe("Suggestions only. The clinician makes the final decision.");
    expect(typeof res.body.insight).toBe("string");
    expect(res.body.insight.length).toBeGreaterThan(10);
  });

  it("returns 200 with generic insight when memoryEnabled=false", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/assessments/101/insight")
      .send({ memoryEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.memoryEnabled).toBe(false);
    expect(res.body.memoriesUsed).toEqual([]);
    expect(res.body.insight).toContain("Marcus Vance");
  });

  it("returns 400 when assessment record is missing required patientId", async () => {
    const app = createApp();
    vi.spyOn(storage, "getAssessmentById").mockResolvedValueOnce({
      ...mockAssessment,
      patientId: null,
    } as any);

    const res = await request(app)
      .post("/api/assessments/101/insight")
      .send({ memoryEnabled: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("missing a required patientId");
  });
});

describe("Agent Routes - POST & GET /api/assessments/:id/outcome", () => {
  const mockUser: User = {
    id: "user-123",
    fullName: "Dr. Alice Smith",
    email: "alice@example.com",
    medicalLicenseNumber: "MD-9999",
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
    predictionMethod: "ml_model",
    modelVersion: "diabetes-clf-v2.1",
    fallbackUsed: false,
    createdBy: "alice@example.com",
    clinicalNote: "Follow-up for persistent hyperglycemia.",
    explainableInsights: null,
    createdAt: new Date(),
  };

  const createApp = (sessionUser?: Partial<User> | null) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      if (sessionUser !== null) {
        req.session = {
          user: sessionUser ? { ...mockUser, ...sessionUser } : mockUser,
        } as any;
      }
      next();
    });
    app.use("/api/assessments", agentRouter);
    return app;
  };

  beforeAll(() => {
    vi.spyOn(storage, "getAssessmentById").mockImplementation(async (id: number) => {
      if (id === 101) return mockAssessment;
      return undefined;
    });
  });

  it("returns 401 when outcome request is unauthenticated", async () => {
    const unauthApp = createApp(null);
    const res = await request(unauthApp)
      .post("/api/assessments/101/outcome")
      .send({ helpful: true, outcomeText: "Patient responded well." });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user email is not verified for outcome", async () => {
    const unverifiedApp = createApp({ emailVerified: false });
    const res = await request(unverifiedApp)
      .post("/api/assessments/101/outcome")
      .send({ helpful: true, outcomeText: "Patient responded well." });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid assessment ID parameter", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/assessments/invalid-id/outcome")
      .send({ helpful: true, outcomeText: "Good" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid assessment ID parameter");
  });

  it("returns 404 when assessment ID does not exist", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/assessments/999/outcome")
      .send({ helpful: true, outcomeText: "Good" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when unauthorized provider attempts to log outcome", async () => {
    const unauthorizedApp = createApp({ id: "user-999", email: "other@example.com", role: "provider" });
    const res = await request(unauthorizedApp)
      .post("/api/assessments/101/outcome")
      .send({ helpful: true, outcomeText: "Good" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Access denied");
  });

  it("returns 400 when payload fails Zod validation (missing outcomeText or helpful)", async () => {
    const app = createApp();
    // Missing helpful
    const res1 = await request(app)
      .post("/api/assessments/101/outcome")
      .send({ outcomeText: "Only text" });
    expect(res1.status).toBe(400);
    expect(res1.body.error).toContain("Invalid outcome payload");

    // Empty outcomeText
    const res2 = await request(app)
      .post("/api/assessments/101/outcome")
      .send({ helpful: true, outcomeText: "   " });
    expect(res2.status).toBe(400);
  });

  it("returns 201 and persists outcome when valid payload is provided", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/api/assessments/101/outcome")
      .send({
        helpful: true,
        intervention: "Reinforced lifestyle counseling and dietary tracking",
        outcomeText: "Patient agreed to 3-month follow-up. Glucose logged daily.",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.outcome).toBeDefined();
    expect(res.body.outcome.assessmentId).toBe(101);
    expect(res.body.outcome.helpful).toBe(true);
    expect(res.body.outcome.intervention).toBe("Reinforced lifestyle counseling and dietary tracking");
    expect(res.body.outcome.outcomeText).toBe("Patient agreed to 3-month follow-up. Glucose logged daily.");
  });

  it("returns 400 when assessment record is missing required patientId", async () => {
    const app = createApp();
    vi.spyOn(storage, "getAssessmentById").mockResolvedValueOnce({
      ...mockAssessment,
      patientId: null,
    } as any);

    const res = await request(app)
      .post("/api/assessments/101/outcome")
      .send({
        helpful: true,
        intervention: "Dietitian referral",
        outcomeText: "Tolerance counseling scheduled.",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("missing a required patientId");
  });
});

