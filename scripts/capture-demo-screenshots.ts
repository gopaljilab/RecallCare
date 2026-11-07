import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

async function captureScreenshots() {
  console.log("===================================================================");
  console.log("  CAPTURING DEMO SCREENSHOTS (Marcus Vance, #101: Memory ON vs OFF)");
  console.log("===================================================================\n");

  const screenshotsDir = path.resolve(process.cwd(), "docs/screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // HTML page template rendering the exact styling, Tailwind tokens, and component layout
  const createHtml = (memoryEnabled: boolean) => `
<!DOCTYPE html>
<html lang="en" class="light">
<head>
  <meta charset="UTF-8">
  <title>RecallCare - Patient Marcus Vance (#101)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 p-6 md:p-12 min-h-screen">
  <div class="max-w-4xl mx-auto space-y-6">
    
    <!-- Top Header Navigation Bar -->
    <div class="flex items-center justify-between pb-4 border-b border-slate-200">
      <div class="flex items-center gap-3">
        <div class="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-500/20">
          RC
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight">RecallCare</h1>
          <p class="text-xs text-slate-500">The clinical assistant that remembers every patient visit. · Vectorize Hindsight + Groq</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Clinician Session Active
        </span>
      </div>
    </div>

    <!-- Patient Header Card -->
    <div class="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400">Patient Profile</span>
          <span class="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-600">ID: 101</span>
        </div>
        <h2 class="text-2xl font-bold text-slate-900 mt-1">Marcus Vance</h2>
        <p class="text-sm text-slate-500">53 y/o Male · Primary Care Longitudinal Follow-up · Encounter #4</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-right">
          <p class="text-xs text-slate-400 font-medium">Model Calculated Risk</p>
          <p class="text-3xl font-extrabold text-red-600">71.5% <span class="text-sm font-semibold text-slate-500">HIGH</span></p>
        </div>
        <div class="h-12 w-12 rounded-full bg-red-50 border-4 border-red-500 flex items-center justify-center text-red-600 font-black text-sm shadow-inner">
          71%
        </div>
      </div>
    </div>

    <!-- Biomarkers Overview -->
    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Fasting Glucose</p>
        <p class="text-2xl font-bold text-slate-800 mt-1">156 <span class="text-xs font-normal text-slate-500">mg/dL</span></p>
        <p class="text-[11px] text-red-500 font-medium mt-1">↑ Elevated (+14 mg/dL vs prior)</p>
      </div>
      <div class="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">HbA1c Level</p>
        <p class="text-2xl font-bold text-slate-800 mt-1">7.1 <span class="text-xs font-normal text-slate-500">%</span></p>
        <p class="text-[11px] text-red-500 font-medium mt-1">↑ Above diagnostic threshold</p>
      </div>
      <div class="bg-white border border-slate-200/80 p-4 rounded-xl shadow-xs">
        <p class="text-xs font-semibold uppercase tracking-wider text-slate-400">Body Mass Index</p>
        <p class="text-2xl font-bold text-slate-800 mt-1">31.4 <span class="text-xs font-normal text-slate-500">kg/m²</span></p>
        <p class="text-[11px] text-amber-500 font-medium mt-1">Class I Obesity</p>
      </div>
    </div>

    <!-- AGENT PERSISTENT MEMORY INSIGHT PANEL -->
    <div class="rounded-2xl border transition-all duration-300 shadow-md overflow-hidden ${
      memoryEnabled
        ? "border-indigo-300 bg-gradient-to-br from-indigo-50/70 via-white to-purple-50/40"
        : "border-slate-300 bg-white"
    }">
      <!-- Header with Toggle -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-slate-200/70 bg-slate-50/50">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            memoryEnabled ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/30" : "bg-slate-200 text-slate-600"
          }">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-bold text-slate-900">Agent Memory Insight</h3>
              <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700">
                ${memoryEnabled ? "openai/gpt-oss-120b" : "openai/gpt-oss-120b (stateless)"}
              </span>
            </div>
            <p class="text-xs text-slate-500">
              ${
                memoryEnabled
                  ? "Synthesizing real-time risk with Hindsight persistent clinic memory"
                  : "Standard stateless evaluation (Memory OFF)"
              }
            </p>
          </div>
        </div>

        <!-- Mode Toggle Indicator -->
        <div class="flex items-center gap-2">
          <div class="inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm ${
            memoryEnabled
              ? "bg-indigo-600 text-white border-indigo-600"
              : "bg-slate-100 text-slate-800 border-slate-300"
          }">
            ${
              memoryEnabled
                ? `<span class="h-2 w-2 rounded-full bg-white animate-pulse"></span> Memory ON`
                : `<span class="h-2 w-2 rounded-full bg-slate-400"></span> Memory OFF`
            }
          </div>
        </div>
      </div>

      <!-- Main Body -->
      <div class="p-6 space-y-4">
        ${
          memoryEnabled
            ? `
        <!-- Memory Citations Badge & Expandable View -->
        <div class="flex items-center justify-between pb-3 border-b border-indigo-100">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 border border-indigo-200">
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Based on 3 past records
          </span>
          <span class="text-xs text-indigo-600 font-medium">Hindsight Bank: clinical-insight-bank · Tag: patient:101</span>
        </div>

        <!-- Recalled History Breakdown -->
        <div class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-2 text-xs">
          <p class="font-bold text-indigo-950 flex items-center gap-1.5">
            Exact Historical Memories Retrieved from Hindsight:
          </p>
          <div class="space-y-1.5 text-slate-700">
            <div class="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
              <span class="font-bold text-indigo-900 font-mono text-[11px]">[Visit 1 · 18 mos ago]:</span> Baseline screening. Fasting glucose 115 mg/dL, HbA1c 6.0%. Diet and exercise counseling recommended.
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
              <span class="font-bold text-indigo-900 font-mono text-[11px]">[Visit 2 · 12 mos ago]:</span> Fasting glucose 128 mg/dL, HbA1c 6.4%. Lifestyle counseling repeated; patient reported travel adherence barriers.
            </div>
            <div class="bg-white p-2.5 rounded-lg border border-indigo-100 shadow-2xs">
              <span class="font-bold text-indigo-900 font-mono text-[11px]">[Visit 3 · 6 mos ago]:</span> HbA1c reached 6.8%. Initiated Metformin therapy. Patient counseled on gastrointestinal tolerance and adherence.
            </div>
          </div>
        </div>

        <!-- Synthesized Insight Text -->
        <div class="space-y-3 text-slate-800 text-sm leading-relaxed">
          <p>
            <strong>Longitudinal Context:</strong> Based on 3 historical records in memory, Marcus Vance has demonstrated a progressive escalation in glycemic metrics over the past 18 months despite multiple prior non-pharmacological attempts. Initial lifestyle counseling (Visits 1 &amp; 2) was unsuccessful in arresting HbA1c progression (rising from 6.0% to 6.4%). Following Visit 3, Metformin therapy was initiated.
          </p>
          <p>
            <strong>Current Encounter Assessment:</strong> Current evaluation shows persistent hyperglycemia (Fasting Glucose 156 mg/dL, HbA1c 7.1%, BMI 31.4) and a calculated risk score of 71.5% (HIGH risk). Primary model risk drivers remain HbA1c, fasting glucose, and chronic hypertension.
          </p>
          <p>
            <strong>Clinical Guidance:</strong> Because lifestyle modification alone has repeatedly proven insufficient in this patient's documented history, consider reviewing adherence and treatment options with the clinician to optimize glycemic control.
          </p>
        </div>
        `
            : `
        <!-- Memory OFF Stateless Text -->
        <div class="space-y-3 text-slate-800 text-sm leading-relaxed">
          <p>
            <strong>Stateless Evaluation:</strong> Patient Marcus Vance presents with an estimated diabetes risk score of 71.5% (HIGH category). Current measured biomarkers include Fasting Blood Glucose of 156 mg/dL, HbA1c of 7.1%, and BMI of 31.4 kg/m².
          </p>
          <p>
            <strong>Contributing Factors:</strong> Top model drivers contributing to this assessment are HbA1c level, fasting blood glucose, and baseline hypertension.
          </p>
          <p>
            <strong>General Clinical Guidelines:</strong> Recommend standard glycemic monitoring, lifestyle intervention review, nutrition consultation, and follow-up assessment in 3 to 6 months.
          </p>
        </div>
        `
        }

        <!-- Medical Disclaimer Footer -->
        <div class="pt-4 border-t border-slate-200/80 flex items-center justify-between text-xs text-slate-500">
          <div class="flex items-center gap-1.5 text-amber-700 font-medium">
            <svg class="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>Suggestions only. The clinician makes the final decision.</span>
          </div>
          <span class="text-[11px] text-slate-400">
            Vectorize Hindsight Memory Engine
          </span>
        </div>
      </div>
    </div>

  </div>
</body>
</html>
`;

  // Start local ephemeral HTTP server to serve the two states
  let currentMode: boolean = false;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(createHtml(currentMode));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;
  const url = `http://127.0.0.1:${port}`;

  console.log(`Local preview server listening on ${url}`);

  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });

    // 1. Capture Memory OFF
    console.log("Capturing screenshot: Memory OFF (Mocked UI preview)...");
    currentMode = false;
    await page.goto(url, { waitUntil: "networkidle" });
    const offPath = path.join(screenshotsDir, "mocked_ui_preview_memory_off_marcus_vance.png");
    await page.screenshot({ path: offPath });
    console.log(`Saved: ${offPath}`);

    // 2. Capture Memory ON
    console.log("Capturing screenshot: Memory ON (Mocked UI preview)...");
    currentMode = true;
    await page.goto(url, { waitUntil: "networkidle" });
    const onPath = path.join(screenshotsDir, "mocked_ui_preview_memory_on_marcus_vance.png");
    await page.screenshot({ path: onPath });
    console.log(`Saved: ${onPath}`);

    console.log("\nSCREENSHOT CAPTURE COMPLETE!");
  } finally {
    await browser.close();
    server.close();
  }
}

captureScreenshots().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
