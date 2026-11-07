import React, { useEffect } from "react";
import { AssessmentResult } from "@/components/AssessmentResult";
import { Logo } from "@/components/ui/Logo";

const marcusVanceData: any = {
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
    { name: "Hba1c Level", impact: "positive", description: "Elevated at 7.1% (above threshold)" },
    { name: "Blood Glucose Level", impact: "positive", description: "Fasting glucose 156 mg/dL" },
    { name: "Bmi", impact: "positive", description: "Class I Obesity BMI 31.4 kg/m²" },
  ],
  predictionMethod: "ml_model",
  modelVersion: "diabetes-clf-v2.1",
  fallbackUsed: false,
  clinicalNote: "Presents for follow-up. HbA1c 7.1%.",
  createdAt: new Date().toISOString(),
};

export default function DemoEncounter() {
  useEffect(() => {
    document.title = "RecallCare - Demo Encounter (Marcus Vance)";
  }, []);

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-slate-950 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between pb-2 border-b border-border/40">
          <Logo variant="full" size="sm" />
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            Encounter Simulation
          </span>
        </div>
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Patient Record</span>
              <span className="text-xs px-2 py-0.5 rounded bg-muted font-mono text-foreground font-semibold">ID: 101</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-1">Marcus Vance</h1>
            <p className="text-sm text-muted-foreground">53 y/o Male · Primary Care Longitudinal Follow-up · Encounter #4</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground font-medium">Model Calculated Risk</p>
            <p className="text-3xl font-extrabold text-destructive">71.5% <span className="text-sm font-semibold text-muted-foreground">HIGH</span></p>
          </div>
        </div>
        <AssessmentResult assessment={marcusVanceData} />
      </div>
    </div>
  );
}
