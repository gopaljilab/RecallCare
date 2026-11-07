try {
  if (typeof (process as any).loadEnvFile === "function") {
    (process as any).loadEnvFile(".env");
  }
} catch {
  // Already loaded
}

import { memoryService } from "../server/agent/memory";
import { storage } from "../server/storage";
import { logger } from "../server/logger";
import { getDb } from "../server/db";
import { assessments } from "@shared/schema";

interface SyntheticVisit {
  visitNumber: number;
  monthsAgo: number;
  glucose: number;
  hba1c: number;
  bmi: number;
  riskScore: number;
  riskCategory: "LOW" | "MODERATE" | "HIGH";
  factors: Array<{ name: string; impact: "positive" | "negative"; description: string }>;
  note: string;
}

interface SyntheticPatient {
  id: string;
  name: string;
  gender: string;
  age: number;
  hypertension: boolean;
  heartDisease: boolean;
  smokingHistory: string;
  visits: SyntheticVisit[];
}

export const SYNTHETIC_PATIENTS: SyntheticPatient[] = [
  // 1. Scripted Demo Patient: Marcus Vance
  {
    id: "101",
    name: "Marcus Vance",
    gender: "Male",
    age: 53,
    hypertension: true,
    heartDisease: false,
    smokingHistory: "former",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 12,
        glucose: 115,
        hba1c: 6.0,
        bmi: 30.1,
        riskScore: 28.5,
        riskCategory: "LOW",
        factors: [
          { name: "Bmi", impact: "positive", description: "Elevated BMI contributes to baseline metabolic load" },
          { name: "Age", impact: "positive", description: "Age over 50 increases baseline risk" },
          { name: "Blood Glucose Level", impact: "negative", description: "Fasting glucose within borderline prediabetic range" },
        ],
        note: "Initial routine wellness encounter. Fasting blood glucose mildly elevated. Recommended dietary counseling and walking regimen 30 minutes daily.",
      },
      {
        visitNumber: 2,
        monthsAgo: 8,
        glucose: 128,
        hba1c: 6.4,
        bmi: 30.8,
        riskScore: 46.2,
        riskCategory: "MODERATE",
        factors: [
          { name: "Hba1c Level", impact: "positive", description: "Rising HbA1c indicates progression toward diabetes threshold" },
          { name: "Bmi", impact: "positive", description: "Modest weight increase observed since prior visit" },
          { name: "Hypertension", impact: "positive", description: "Blood pressure 134/86 mmHg" },
        ],
        note: "Follow-up visit. Glycemic metrics continue to climb. Patient reports difficulty adhering to dietary restrictions due to work travel. Re-emphasized lifestyle counseling and nutrition consultation.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 142,
        hba1c: 6.8,
        bmi: 31.2,
        riskScore: 58.4,
        riskCategory: "MODERATE",
        factors: [
          { name: "Hba1c Level", impact: "positive", description: "HbA1c exceeds 6.5% threshold" },
          { name: "Blood Glucose Level", impact: "positive", description: "Fasting glucose consistently above 140 mg/dL" },
          { name: "Bmi", impact: "positive", description: "Persistent elevated BMI" },
        ],
        note: "Patient returns with HbA1c 6.8%. Lifestyle counseling alone proved insufficient over past visits. Initiated Metformin therapy. Patient counseled on adherence and scheduled for follow-up evaluation.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 156,
        hba1c: 7.1,
        bmi: 31.4,
        riskScore: 71.5,
        riskCategory: "HIGH",
        factors: [
          { name: "Hba1c Level", impact: "positive", description: "HbA1c elevated at 7.1% despite primary intervention" },
          { name: "Blood Glucose Level", impact: "positive", description: "Persistent fasting hyperglycemia at 156 mg/dL" },
          { name: "Hypertension", impact: "positive", description: "Blood pressure remains elevated" },
        ],
        note: "Current visit: Marcus Vance presents with HbA1c 7.1%. Evaluated for persistent hyperglycemia. Consider reviewing adherence and treatment options with the clinician.",
      },
    ],
  },

  // 2. Elena Rostova
  {
    id: "102",
    name: "Elena Rostova",
    gender: "Female",
    age: 64,
    hypertension: true,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 15,
        glucose: 150,
        hba1c: 7.4,
        bmi: 28.5,
        riskScore: 68.0,
        riskCategory: "HIGH",
        factors: [
          { name: "Hba1c Level", impact: "positive", description: "High initial HbA1c" },
          { name: "Age", impact: "positive", description: "Post-menopausal age bracket" },
        ],
        note: "Patient presented with polyuria and fatigue. Initiated GLP-1 receptor agonist therapy.",
      },
      {
        visitNumber: 2,
        monthsAgo: 9,
        glucose: 135,
        hba1c: 7.0,
        bmi: 27.9,
        riskScore: 52.0,
        riskCategory: "MODERATE",
        factors: [
          { name: "Hba1c Level", impact: "negative", description: "Positive response to therapy with 0.4% HbA1c drop" },
        ],
        note: "Patient tolerating therapy well. Fasting glucose declining. Continued current management plan.",
      },
      {
        visitNumber: 3,
        monthsAgo: 3,
        glucose: 124,
        hba1c: 6.7,
        bmi: 27.2,
        riskScore: 42.0,
        riskCategory: "MODERATE",
        factors: [
          { name: "Bmi", impact: "negative", description: "Sustained weight loss" },
        ],
        note: "Substantial metabolic improvement. Blood pressure 126/78 mmHg. Encouraged continued adherence.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 120,
        hba1c: 6.5,
        bmi: 26.8,
        riskScore: 36.5,
        riskCategory: "LOW",
        factors: [
          { name: "Hba1c Level", impact: "negative", description: "HbA1c approaching normal range" },
        ],
        note: "Annual review. Strong therapeutic response documented across 4 visits.",
      },
    ],
  },

  // 3. David Kim
  {
    id: "103",
    name: "David Kim",
    gender: "Male",
    age: 45,
    hypertension: false,
    heartDisease: false,
    smokingHistory: "current",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 12,
        glucose: 112,
        hba1c: 5.8,
        bmi: 26.5,
        riskScore: 24.0,
        riskCategory: "LOW",
        factors: [
          { name: "Smoking History", impact: "positive", description: "Current smoker increases microvascular risk" },
        ],
        note: "Routine checkup. Smoking cessation counseling provided.",
      },
      {
        visitNumber: 2,
        monthsAgo: 8,
        glucose: 108,
        hba1c: 5.6,
        bmi: 26.0,
        riskScore: 19.5,
        riskCategory: "LOW",
        factors: [
          { name: "Blood Glucose Level", impact: "negative", description: "Optimal fasting glucose" },
        ],
        note: "Patient transitioned to nicotine replacement. Glycemic indicators remain stable.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 102,
        hba1c: 5.5,
        bmi: 25.4,
        riskScore: 14.2,
        riskCategory: "LOW",
        factors: [
          { name: "Smoking History", impact: "negative", description: "Tobacco free for 6 months" },
        ],
        note: "Successfully quit smoking. Normal metabolic profile maintained.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 98,
        hba1c: 5.4,
        bmi: 24.9,
        riskScore: 11.0,
        riskCategory: "LOW",
        factors: [
          { name: "Bmi", impact: "negative", description: "Healthy BMI reached" },
        ],
        note: "Excellent outcome from smoking cessation and active lifestyle.",
      },
    ],
  },

  // 4. Sarah Jenkins
  {
    id: "104",
    name: "Sarah Jenkins",
    gender: "Female",
    age: 58,
    hypertension: true,
    heartDisease: true,
    smokingHistory: "former",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 16,
        glucose: 148,
        hba1c: 7.2,
        bmi: 34.0,
        riskScore: 76.0,
        riskCategory: "HIGH",
        factors: [
          { name: "Heart Disease", impact: "positive", description: "Co-occurring coronary artery disease" },
          { name: "Bmi", impact: "positive", description: "Class II obesity" },
        ],
        note: "Cardiac-metabolic evaluation. Multi-specialty coordinated care initiated.",
      },
      {
        visitNumber: 2,
        monthsAgo: 10,
        glucose: 144,
        hba1c: 7.0,
        bmi: 33.6,
        riskScore: 71.0,
        riskCategory: "HIGH",
        factors: [
          { name: "Hypertension", impact: "positive", description: "Blood pressure requires dual antihypertensives" },
        ],
        note: "Medication adherence verified. Exercise limitations due to angina.",
      },
      {
        visitNumber: 3,
        monthsAgo: 5,
        glucose: 152,
        hba1c: 7.3,
        bmi: 33.9,
        riskScore: 78.5,
        riskCategory: "HIGH",
        factors: [
          { name: "Hba1c Level", impact: "positive", description: "Glycemic rebound noted" },
        ],
        note: "Recent cardiac catheterization. Recommend reviewing treatment options with the clinician.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 158,
        hba1c: 7.5,
        bmi: 34.2,
        riskScore: 82.0,
        riskCategory: "HIGH",
        factors: [
          { name: "Heart Disease", impact: "positive", description: "Compounded cardiovascular risk" },
        ],
        note: "Complex chronic care management encounter.",
      },
    ],
  },

  // 5. Carlos Mendez
  {
    id: "105",
    name: "Carlos Mendez",
    gender: "Male",
    age: 50,
    hypertension: false,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 14,
        glucose: 122,
        hba1c: 6.2,
        bmi: 29.2,
        riskScore: 38.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Bmi", impact: "positive", description: "Overweight range" }],
        note: "Prediabetes identification. Enrolled in diabetes prevention lifestyle program.",
      },
      {
        visitNumber: 2,
        monthsAgo: 9,
        glucose: 119,
        hba1c: 6.1,
        bmi: 28.9,
        riskScore: 34.5,
        riskCategory: "LOW",
        factors: [{ name: "Blood Glucose Level", impact: "negative", description: "Fasting glucose stabilizing" }],
        note: "Participating in weekly lifestyle coaching sessions.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 116,
        hba1c: 6.0,
        bmi: 28.5,
        riskScore: 31.0,
        riskCategory: "LOW",
        factors: [{ name: "Bmi", impact: "negative", description: "Weight down 3 kg" }],
        note: "Consistent dietary modification reported.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 114,
        hba1c: 5.9,
        bmi: 28.1,
        riskScore: 28.0,
        riskCategory: "LOW",
        factors: [{ name: "Hba1c Level", impact: "negative", description: "Reversed prediabetes trajectory" }],
        note: "Successful lifestyle stabilization.",
      },
    ],
  },

  // 6. Amina Diallo
  {
    id: "106",
    name: "Amina Diallo",
    gender: "Female",
    age: 41,
    hypertension: false,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 12,
        glucose: 118,
        hba1c: 6.1,
        bmi: 28.0,
        riskScore: 32.0,
        riskCategory: "LOW",
        factors: [{ name: "Age", impact: "negative", description: "Younger demographic bracket" }],
        note: "Postpartum metabolic check following history of gestational diabetes.",
      },
      {
        visitNumber: 2,
        monthsAgo: 8,
        glucose: 114,
        hba1c: 5.9,
        bmi: 27.5,
        riskScore: 26.5,
        riskCategory: "LOW",
        factors: [{ name: "Bmi", impact: "negative", description: "Active lifestyle" }],
        note: "Nutritional intake aligned with clinical goals.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 110,
        hba1c: 5.8,
        bmi: 27.1,
        riskScore: 22.0,
        riskCategory: "LOW",
        factors: [{ name: "Hba1c Level", impact: "negative", description: "Normoglycemic trajectory" }],
        note: "Annual monitoring interval recommended.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 106,
        hba1c: 5.7,
        bmi: 26.8,
        riskScore: 18.5,
        riskCategory: "LOW",
        factors: [{ name: "Blood Glucose Level", impact: "negative", description: "Healthy fasting levels" }],
        note: "Follow-up indicates resolution of gestational prediabetes risk.",
      },
    ],
  },

  // 7. Robert Chen
  {
    id: "107",
    name: "Robert Chen",
    gender: "Male",
    age: 68,
    hypertension: true,
    heartDisease: true,
    smokingHistory: "former",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 15,
        glucose: 165,
        hba1c: 7.8,
        bmi: 32.0,
        riskScore: 84.0,
        riskCategory: "HIGH",
        factors: [{ name: "Age", impact: "positive", description: "Geriatric risk profile" }],
        note: "High complexity patient with ischemic heart disease and marked hyperglycemia.",
      },
      {
        visitNumber: 2,
        monthsAgo: 10,
        glucose: 155,
        hba1c: 7.5,
        bmi: 31.6,
        riskScore: 79.0,
        riskCategory: "HIGH",
        factors: [{ name: "Heart Disease", impact: "positive", description: "Prior coronary stent" }],
        note: "Medication adherence reviewed with family caregiver.",
      },
      {
        visitNumber: 3,
        monthsAgo: 5,
        glucose: 148,
        hba1c: 7.3,
        bmi: 31.2,
        riskScore: 74.0,
        riskCategory: "HIGH",
        factors: [{ name: "Hba1c Level", impact: "positive", description: "Gradual reduction" }],
        note: "Renal profile monitored. Consider reviewing adherence and treatment options with the clinician.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 142,
        hba1c: 7.1,
        bmi: 31.0,
        riskScore: 70.5,
        riskCategory: "HIGH",
        factors: [{ name: "Hypertension", impact: "positive", description: "Blood pressure controlled at 130/80" }],
        note: "Stable cardiovascular status with ongoing diabetes management.",
      },
    ],
  },

  // 8. Patricia O'Connor
  {
    id: "108",
    name: "Patricia O'Connor",
    gender: "Female",
    age: 55,
    hypertension: true,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 14,
        glucose: 138,
        hba1c: 6.7,
        bmi: 32.5,
        riskScore: 56.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Bmi", impact: "positive", description: "Obesity class I" }],
        note: "Osteoarthritis of bilateral knees limits aerobic activity.",
      },
      {
        visitNumber: 2,
        monthsAgo: 9,
        glucose: 134,
        hba1c: 6.6,
        bmi: 32.2,
        riskScore: 53.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Hypertension", impact: "positive", description: "Blood pressure 138/88" }],
        note: "Aquatic physical therapy initiated.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 130,
        hba1c: 6.5,
        bmi: 31.8,
        riskScore: 49.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Bmi", impact: "negative", description: "Mobility improved" }],
        note: "Reduced joint discomfort; walking tolerance increased.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 126,
        hba1c: 6.3,
        bmi: 31.4,
        riskScore: 44.5,
        riskCategory: "MODERATE",
        factors: [{ name: "Hba1c Level", impact: "negative", description: "HbA1c declined 0.4% over 14 months" }],
        note: "Positive trajectory maintained through adaptive physical therapy.",
      },
    ],
  },

  // 9. James Wilson
  {
    id: "109",
    name: "James Wilson",
    gender: "Male",
    age: 48,
    hypertension: false,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 12,
        glucose: 96,
        hba1c: 5.3,
        bmi: 24.8,
        riskScore: 12.0,
        riskCategory: "LOW",
        factors: [{ name: "Blood Glucose Level", impact: "negative", description: "Optimal fasting glucose" }],
        note: "Healthy reference cohort member. Normal baseline evaluation.",
      },
      {
        visitNumber: 2,
        monthsAgo: 8,
        glucose: 94,
        hba1c: 5.2,
        bmi: 24.6,
        riskScore: 10.5,
        riskCategory: "LOW",
        factors: [{ name: "Hba1c Level", impact: "negative", description: "Normal HbA1c" }],
        note: "No metabolic concerns.",
      },
      {
        visitNumber: 3,
        monthsAgo: 4,
        glucose: 98,
        hba1c: 5.3,
        bmi: 24.9,
        riskScore: 11.2,
        riskCategory: "LOW",
        factors: [{ name: "Bmi", impact: "negative", description: "Normal BMI" }],
        note: "Annual preventive screening completed.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 95,
        hba1c: 5.2,
        bmi: 24.7,
        riskScore: 10.8,
        riskCategory: "LOW",
        factors: [{ name: "Blood Glucose Level", impact: "negative", description: "Consistent normoglycemia" }],
        note: "Remains in low risk tier across all parameters.",
      },
    ],
  },

  // 10. Fatima Al-Mansoor
  {
    id: "110",
    name: "Fatima Al-Mansoor",
    gender: "Female",
    age: 60,
    hypertension: true,
    heartDisease: false,
    smokingHistory: "never",
    visits: [
      {
        visitNumber: 1,
        monthsAgo: 15,
        glucose: 145,
        hba1c: 7.0,
        bmi: 31.0,
        riskScore: 62.0,
        riskCategory: "HIGH",
        factors: [{ name: "Hba1c Level", impact: "positive", description: "HbA1c at 7.0%" }],
        note: "New diagnosis of diabetes mellitus. Medical therapy initiated.",
      },
      {
        visitNumber: 2,
        monthsAgo: 10,
        glucose: 140,
        hba1c: 6.9,
        bmi: 30.6,
        riskScore: 58.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Bmi", impact: "negative", description: "Weight reduction" }],
        note: "Discussed medication adherence during fasting periods.",
      },
      {
        visitNumber: 3,
        monthsAgo: 5,
        glucose: 136,
        hba1c: 6.7,
        bmi: 30.2,
        riskScore: 51.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Hba1c Level", impact: "negative", description: "Glycemic trend improving" }],
        note: "Adherence stabilized. Routine lab surveillance scheduled.",
      },
      {
        visitNumber: 4,
        monthsAgo: 0,
        glucose: 132,
        hba1c: 6.6,
        bmi: 29.8,
        riskScore: 47.0,
        riskCategory: "MODERATE",
        factors: [{ name: "Bmi", impact: "negative", description: "Sub-30 BMI attained" }],
        note: "Continuous longitudinal improvement documented across 15 months.",
      },
    ],
  },
];

async function seedMemory() {
  console.log("===================================================================");
  console.log("  SEEDING SYNTHETIC PATIENTS & HINDSIGHT PERSISTENT MEMORY");
  console.log("===================================================================\n");

  const mainBankId = process.env.HINDSIGHT_BANK_ID || "clinical-insight-bank";
  memoryService.setBankId(mainBankId);

  const isMemoryAvailable = memoryService.isMemoryEnabled();
  console.log(`Memory Service Status: ${isMemoryAvailable ? "CONNECTED (" + memoryService.getBankId() + ")" : "OFFLINE / DISABLED (graceful database fallback)"}`);

  const shouldReset = process.argv.includes("--reset");
  if (shouldReset) {
    console.log(`\n[--reset] Resetting Hindsight memory bank '${memoryService.getBankId()}'...`);
    const resetOk = await memoryService.resetBank();
    if (resetOk) {
      console.log(`[--reset] Memory bank successfully cleared and recreated clean.`);
      console.log(`[--reset] Waiting 2s for cloud bank initialization...`);
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      console.warn(`[--reset] Memory bank reset failed or memory is disabled.`);
    }
  }

  const isPostgresConfigured = Boolean(process.env.DATABASE_URL);
  if (!isPostgresConfigured) {
    console.warn("\n===================================================================");
    console.warn("  [STORAGE WARNING] DATABASE_URL IS NOT SET!");
    console.warn("  Seeding is falling back to ephemeral in-memory storage (MemStorage).");
    console.warn("  Visits created in this CLI process will NOT persist into PostgreSQL.");
    console.warn("  0 visits will be available in persistent PostgreSQL across processes.");
    console.warn("===================================================================\n");
  } else {
    console.log(`Database Status: DATABASE_URL is set. Attempting PostgreSQL persistence.`);
  }

  let totalAssessmentsCreated = 0;
  let totalPersistedToPostgres = 0;
  let totalInMemoryFallback = 0;
  let totalMemoriesRetained = 0;

  for (const patient of SYNTHETIC_PATIENTS) {
    console.log(`\nProcessing Patient #${patient.id}: ${patient.name} (${patient.visits.length} longitudinal visits)`);

    for (const visit of patient.visits) {
      // Deterministic reference anchor date ensuring identical payloads and timestamps across re-seeds
      const baseAnchor = new Date("2026-11-07T00:00:00.000Z");
      const visitDate = new Date(baseAnchor);
      visitDate.setUTCMonth(baseAnchor.getUTCMonth() - visit.monthsAgo);

      // Create assessment record with strict patient identifier and deterministic ID
      const deterministicId = parseInt(patient.id, 10) * 100 + visit.visitNumber;
      const deterministicDocId = `patient-${patient.id}-visit-${visit.visitNumber}-assessment`;
      const assessmentData = {
        id: deterministicId,
        patientId: patient.id,
        userId: patient.id,
        patientName: patient.name,
        gender: patient.gender,
        age: patient.age,
        hypertension: patient.hypertension,
        heartDisease: patient.heartDisease,
        smokingHistory: patient.smokingHistory,
        bmi: visit.bmi,
        hba1cLevel: visit.hba1c,
        bloodGlucoseLevel: visit.glucose,
        riskScore: visit.riskScore,
        riskCategory: visit.riskCategory,
        factors: visit.factors,
        clinicalNote: visit.note,
        createdAt: visitDate,
        predictionMethod: "ml_model",
        modelVersion: "diabetes-clf-v2.1",
        fallbackUsed: false,
        visitNumber: visit.visitNumber,
        documentId: deterministicDocId,
      };

      let created: any = null;
      if (isPostgresConfigured) {
        try {
          const db = await getDb();
          if (!db) throw new Error("Database instance unavailable");
          const [persisted] = await db
            .insert(assessments)
            .values(assessmentData)
            .onConflictDoUpdate({
              target: assessments.id,
              set: {
                patientId: assessmentData.patientId,
                patientName: assessmentData.patientName,
                riskScore: assessmentData.riskScore,
                riskCategory: assessmentData.riskCategory,
                factors: assessmentData.factors,
                clinicalNote: assessmentData.clinicalNote,
                bloodGlucoseLevel: assessmentData.bloodGlucoseLevel,
                hba1cLevel: assessmentData.hba1cLevel,
                bmi: assessmentData.bmi,
              },
            })
            .returning();
          created = persisted;
          totalPersistedToPostgres++;
          totalAssessmentsCreated++;
        } catch (dbErr: any) {
          console.warn(`[DB Error] Failed to persist assessment #${deterministicId} into PostgreSQL: ${dbErr?.message}`);
          created = await storage.createAssessment(assessmentData);
          totalInMemoryFallback++;
          totalAssessmentsCreated++;
        }
      } else {
        created = await storage.createAssessment(assessmentData);
        totalInMemoryFallback++;
        totalAssessmentsCreated++;
      }

      // Retain into Hindsight Memory Bank with deterministic document IDs
      if (isMemoryAvailable) {
        const retainedAssessment = await memoryService.retainAssessment({
          ...created,
          documentId: deterministicDocId,
          visitNumber: visit.visitNumber,
        }, patient.id);
        if (retainedAssessment) {
          totalMemoriesRetained++;
        }

        // Also retain clinician note as encounter context
        const retainedNote = await memoryService.retainClinicianNote(
          patient.id,
          String(visit.visitNumber),
          visit.note,
          visitDate.toISOString()
        );
        if (retainedNote) {
          totalMemoriesRetained++;
        }
      }
    }
  }

  console.log("\n===================================================================");
  console.log("  SEED SUMMARY:");
  console.log(`  - Synthetic Patients Configured: ${SYNTHETIC_PATIENTS.length}`);
  console.log(`  - Total Encounters/Visits Created: ${totalAssessmentsCreated}`);
  console.log(`  - Persisted to PostgreSQL: ${totalPersistedToPostgres}`);
  if (totalInMemoryFallback > 0) {
    console.log(`  - In-Memory Fallback (Not Persisted across processes): ${totalInMemoryFallback}`);
  }
  console.log(`  - Memories Retained in Hindsight: ${totalMemoriesRetained}`);
  console.log("  - Scripted Demo Patient: Marcus Vance (#101, Visits 1-4)");
  console.log("===================================================================\n");

  if (totalMemoriesRetained === 0) {
    console.error("===================================================================");
    console.error("  SEED FAILED: ZERO MEMORIES RETAINED IN HINDSIGHT");
    console.error("  No memory records were successfully stored in Hindsight.");
    console.error("  Please check that:");
    console.error("  1. HINDSIGHT_API_KEY is configured with a valid key in .env");
    console.error("  2. HINDSIGHT_API_URL is reachable (or Hindsight Cloud is active)");
    console.error("  3. HINDSIGHT_BANK_ID exists or permissions allow creating it");
    console.error("===================================================================\n");
    process.exit(1);
  }

  console.log("Seed complete! Memories successfully retained in Hindsight.");

  // Post-seed recall check for Marcus Vance (#101)
  if (isMemoryAvailable) {
    console.log("\n===================================================================");
    console.log("  POST-SEED VERIFICATION: PATIENT 101 (MARCUS VANCE) RECALL CHECK");
    console.log("===================================================================");
    const marcusRecall = await memoryService.recallForPatient(
      "101",
      "glycemic history, previous interventions, lifestyle counseling response, HbA1c trajectory for Marcus Vance"
    );
    console.log(`  - Recalled Memories Count for Patient 101: ${marcusRecall.memories.length}`);
    console.log("  - Recalled Records with Distinct Visit Timestamps (occurred_start):");
    marcusRecall.memories.slice(0, 12).forEach((m, idx) => {
      console.log(`    [Record #${idx + 1}]:`);
      console.log(`      text: "${m.text}"`);
      console.log(`      occurred_start: "${m.occurred_start || m.date || 'N/A'}"`);
      console.log(`      documentId: "${m.documentId || 'N/A'}"`);
    });
    console.log("===================================================================\n");
  }
}

import { fileURLToPath } from "url";

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
  seedMemory().catch((err) => {
    console.error("Seed execution threw unexpected error:", err);
    process.exit(1);
  });
}
