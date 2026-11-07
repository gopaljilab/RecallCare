import express from "express";
import { createServer } from "http";
import session from "express-session";
import path from "path";
import fs from "fs";
import { chromium } from "playwright";
import { agentRouter } from "../server/agent/agent.routes";
import { setupVite } from "../server/vite";
import { memoryService } from "../server/agent/memory";
import type { Assessment } from "@shared/schema";

// Ensure .env is loaded
try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(".env");
  }
} catch {
  // Already loaded
}

const marcusAssessment: Assessment = {
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

async function main() {
  console.log("===================================================================");
  console.log("  CAPTURING SCREENSHOTS FROM REAL RUNNING VITE + EXPRESS APPLICATION");
  console.log("  Connecting to real Vectorize Hindsight Cloud and real Groq LLM");
  console.log("===================================================================\n");

  const testBankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";
  memoryService.setBankId(testBankId);

  const app = express();
  const server = createServer(app);

  app.use(express.json());

  // Session middleware with active authenticated clinician
  app.use(
    session({
      secret: "real-app-screenshot-secret",
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    })
  );

  app.use((req, res, next) => {
    res.locals.cspNonce = "screenshot-nonce";
    (req as any).session.user = {
      id: "dr-reed-uuid",
      fullName: "Dr. Reed",
      email: "dr.reed@clinicalinsight.dev",
      role: "provider",
      emailVerified: true,
      medicalLicenseNumber: "MD-12345",
    };
    next();
  });

  // CSRF endpoint
  app.get("/api/csrf-token", (_req, res) => {
    res.json({ token: "real-app-csrf-token" });
  });

  const mockUser = {
    id: "dr-reed-uuid",
    name: "Dr. Reed",
    fullName: "Dr. Reed",
    email: "dr.reed@clinicalinsight.dev",
    role: "CLINICIAN",
    emailVerified: true,
    medicalLicenseNumber: "MD-12345",
  };

  app.get("/api/auth/me", (_req, res) => {
    res.json({ user: mockUser });
  });

  app.get("/api/user", (_req, res) => {
    res.json(mockUser);
  });

  // Real Agent routes for persistent memory & outcomes
  app.use("/api/assessments", agentRouter);

  // Fallback assessment endpoint for AssessmentResult subcomponents
  app.get("/api/assessments/:id", (req, res) => {
    res.json(marcusAssessment);
  });
  app.get("/api/assessments/:id/notes", (_req, res) => {
    res.json([]);
  });
  app.get("/api/assessments", (_req, res) => {
    res.json({ data: [marcusAssessment], total: 1 });
  });

  // Attach Vite development server for full React frontend compilation
  console.log("Initializing Vite dev server...");
  await setupVite(server, app);

  const PORT = 5174;
  await new Promise<void>((resolve) => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running at http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  const screenshotsDir = path.resolve(process.cwd(), "docs/screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const artifactDir = path.resolve(
    "/Users/gopalguptamac/.gemini/antigravity/brain/b839cd02-2901-4988-a48e-51fa4d194cb5"
  );

  console.log("Launching system Chrome via Playwright...");
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1300 },
  });

  const page = await context.newPage();

  console.log(`Navigating to http://127.0.0.1:${PORT}/demo-encounter ...`);
  await page.goto(`http://127.0.0.1:${PORT}/demo-encounter`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  console.log("Waiting for Marcus Vance assessment and Agent Memory Insight panel...");
  await page.waitForSelector("h1:has-text('Marcus Vance')", { timeout: 45000 });
  await page.waitForSelector("text=Agent Memory Insight", { timeout: 45000 });

  // 1. CAPTURE REAL SCREENSHOT 1: MEMORY ON (First initial load with real Hindsight Cloud memories)
  console.log("\nWaiting for real Hindsight memories and Groq LLM insight to render...");
  await page.waitForSelector("text=longitudinal memories", { timeout: 60000 });
  // Wait for loading spinner to disappear
  await page.waitForSelector("text=Recalling longitudinal history", { state: "detached", timeout: 60000 });
  await page.waitForTimeout(2000);

  const shotOnPath = path.join(screenshotsDir, "real_app_memory_on.png");
  await page.screenshot({ path: shotOnPath, fullPage: true });
  console.log(`[Captured] Real App Memory ON -> ${shotOnPath}`);
  fs.copyFileSync(shotOnPath, path.join(artifactDir, "real_app_memory_on.png"));

  // 2. CAPTURE REAL SCREENSHOT 2: MEMORY OFF (Click toggle to turn memory OFF)
  console.log("\nToggling Memory OFF...");
  const memoryToggleOn = page.locator("button:has-text('Memory ON')");
  await memoryToggleOn.click();

  console.log("Waiting for stateless Groq insight to generate...");
  await page.waitForSelector("button:has-text('Memory OFF')", { timeout: 30000 });
  await page.waitForSelector("text=Analyzing current assessment statelessly", { state: "detached", timeout: 45000 });
  await page.waitForTimeout(2000);

  const shotOffPath = path.join(screenshotsDir, "real_app_memory_off.png");
  await page.screenshot({ path: shotOffPath, fullPage: true });
  console.log(`[Captured] Real App Memory OFF -> ${shotOffPath}`);
  fs.copyFileSync(shotOffPath, path.join(artifactDir, "real_app_memory_off.png"));

  // Toggle Memory back ON before testing feedback
  console.log("\nToggling Memory back ON...");
  const memoryToggleOff = page.locator("button:has-text('Memory OFF')");
  await memoryToggleOff.click();
  await page.waitForSelector("button:has-text('Memory ON')", { timeout: 30000 });
  await page.waitForSelector("text=longitudinal memories", { timeout: 45000 });
  await page.waitForSelector("text=Recalling longitudinal history", { state: "detached", timeout: 45000 });
  await page.waitForTimeout(1500);

  // 3. CAPTURE REAL SCREENSHOT 3: AFTER CLINICIAN FEEDBACK SUBMITTED
  console.log("\nSubmitting Clinician Feedback Form in the live UI...");
  // Fill in intervention
  const interventionInput = page.locator("input[placeholder*='Intensified lifestyle counseling']");
  await interventionInput.fill("Dietitian referral for medical nutrition therapy and antiemetic guidance");

  // Fill in outcome note
  const outcomeTextarea = page.locator("textarea[placeholder*='Patient counseled on travel']");
  await outcomeTextarea.fill("Patient reported nausea after starting medication; arranged dietitian consultation for meal tolerance strategies.");

  // Click Submit button
  const submitBtn = page.getByRole("button", { name: "Submit Decision & Retain to" });
  await submitBtn.click();

  console.log("Waiting for outcome submission banner...");
  await page.waitForSelector("text=Outcome feedback recorded and retained", { timeout: 45000 });

  console.log("Waiting for post-feedback insight refresh to complete...");
  await page.waitForSelector("text=Recalling longitudinal history", { state: "detached", timeout: 60000 });
  await page.waitForTimeout(3000);

  const shotFeedbackPath = path.join(screenshotsDir, "real_app_after_feedback.png");
  await page.screenshot({ path: shotFeedbackPath, fullPage: true });
  console.log(`[Captured] Real App After Feedback -> ${shotFeedbackPath}`);
  fs.copyFileSync(shotFeedbackPath, path.join(artifactDir, "real_app_after_feedback.png"));

  console.log("\n===================================================================");
  console.log("  ALL 3 REAL APP SCREENSHOTS CAPTURED SUCCESSFULLY!");
  console.log("===================================================================");

  await browser.close();
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
