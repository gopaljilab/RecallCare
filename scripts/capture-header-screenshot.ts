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

try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(".env");
  }
} catch {}

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
  createdBy: "dr.reed@recallcare.dev",
  clinicalNote: "Presents for follow-up. HbA1c 7.1%.",
  explainableInsights: null,
  modelConfidence: null,
  ownerId: null,
  createdAt: new Date(),
};

async function main() {
  console.log("===================================================================");
  console.log("  CAPTURING FRESH APP HEADER SCREENSHOT SHOWING 'RecallCare'");
  console.log("===================================================================\n");

  const testBankId = process.env.HINDSIGHT_TEST_BANK_ID || "clinical-insight-test-bank";
  memoryService.setBankId(testBankId);

  const app = express();
  const server = createServer(app);

  app.use(express.json());

  app.use(
    session({
      secret: "header-screenshot-secret",
      resave: false,
      saveUninitialized: true,
      cookie: { secure: false },
    })
  );

  app.use((req, res, next) => {
    res.locals.cspNonce = "header-nonce";
    (req as any).session.user = {
      id: "dr-reed-uuid",
      fullName: "Dr. Reed",
      email: "dr.reed@recallcare.dev",
      role: "provider",
      emailVerified: true,
      medicalLicenseNumber: "MD-12345",
    };
    next();
  });

  app.get("/api/csrf-token", (_req, res) => {
    res.json({ token: "header-csrf-token" });
  });

  const mockUser = {
    id: "dr-reed-uuid",
    name: "Dr. Reed",
    fullName: "Dr. Reed",
    email: "dr.reed@recallcare.dev",
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

  app.use("/api/assessments", agentRouter);
  app.get("/api/assessments/:id", (req, res) => {
    res.json(marcusAssessment);
  });
  app.get("/api/assessments/:id/notes", (_req, res) => {
    res.json([]);
  });
  app.get("/api/assessments", (_req, res) => {
    res.json({ data: [marcusAssessment], total: 1 });
  });

  console.log("Initializing Vite dev server...");
  await setupVite(server, app);

  const PORT = 5178;
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

  console.log("Launching browser via Playwright...");
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  console.log(`Navigating to http://127.0.0.1:${PORT}/demo-encounter ...`);
  await page.goto(`http://127.0.0.1:${PORT}/demo-encounter`, {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  await page.waitForSelector("text=RecallCare", { timeout: 45000 });
  await page.waitForTimeout(2000);

  const shotHeaderPath = path.join(screenshotsDir, "recallcare_app_header.png");
  await page.screenshot({ path: shotHeaderPath });
  console.log(`[Captured] Full app view with header -> ${shotHeaderPath}`);
  fs.copyFileSync(shotHeaderPath, path.join(artifactDir, "recallcare_app_header.png"));

  // Also capture a tight crop of the header itself
  const headerElement = page.locator("div.flex.items-center.justify-between.pb-2.border-b");
  const shotHeaderCropPath = path.join(screenshotsDir, "recallcare_header_close_up.png");
  if (await headerElement.count() > 0) {
    await headerElement.screenshot({ path: shotHeaderCropPath });
    console.log(`[Captured] Header close-up -> ${shotHeaderCropPath}`);
    fs.copyFileSync(shotHeaderCropPath, path.join(artifactDir, "recallcare_header_close_up.png"));
  }

  await browser.close();
  server.close();
  console.log("Finished successfully!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
