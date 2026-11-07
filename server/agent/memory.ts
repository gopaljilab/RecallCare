import { HindsightClient } from "@vectorize-io/hindsight-client";
import type { RecallResponse, RecallResult } from "@vectorize-io/hindsight-client";
import { logger } from "../logger";
import type { Assessment } from "@shared/schema";

export interface RecalledMemory {
  id: string;
  text: string;
  date?: string;
  occurred_start?: string;
  context?: string;
  documentId?: string;
  score?: number;
}

export interface PatientRecallResult {
  memories: RecalledMemory[];
  count: number;
  memoryEnabled: boolean;
  degraded: boolean;
  reason?: string;
}

export class MemoryService {
  private client: HindsightClient | null = null;
  private bankId: string;
  private enabled: boolean;
  private baseUrl: string;

  private currentApiKey: string = "";

  constructor() {
    this.baseUrl = process.env.HINDSIGHT_API_URL || "https://api.hindsight.vectorize.io";
    const isTest = process.env.NODE_ENV === "test";
    this.bankId = isTest
      ? (process.env.HINDSIGHT_TEST_BANK_ID || process.env.HINDSIGHT_BANK_ID || "clinical-insight-test-bank")
      : (process.env.HINDSIGHT_BANK_ID || "clinical-insight-bank");
    this.enabled = process.env.MEMORY_ENABLED !== "false";
    this.getClient();
  }

  public getClient(): HindsightClient | null {
    const activeApiKey = process.env.HINDSIGHT_API_KEY || "";
    if (this.client && this.currentApiKey === activeApiKey) {
      return this.client;
    }
    this.enabled = process.env.MEMORY_ENABLED !== "false";
    if (this.enabled && activeApiKey) {
      try {
        this.client = new HindsightClient({
          baseUrl: this.baseUrl,
          apiKey: activeApiKey,
        });
        this.currentApiKey = activeApiKey;
      } catch (err: any) {
        logger.warn({ err: err?.message }, "[MemoryService] Client initialization failed");
        this.client = null;
      }
    } else {
      this.client = null;
    }
    return this.client;
  }

  public isMemoryEnabled(): boolean {
    return this.enabled && this.getClient() !== null;
  }

  public getBankId(): string {
    return this.bankId;
  }

  public setBankId(bankId: string): void {
    this.bankId = bankId;
  }

  /**
   * Resets the persistent memory bank by deleting it and recreating a fresh bank.
   */
  async resetBank(): Promise<boolean> {
    if (!this.isMemoryEnabled() || !this.client) {
      logger.info({ bankId: this.bankId }, "[MemoryService] Memory disabled or uninitialized; cannot reset bank");
      return false;
    }
    try {
      try {
        await this.client.deleteBank(this.bankId);
        logger.info({ bankId: this.bankId }, "[MemoryService] Successfully deleted memory bank for reset");
        await new Promise((r) => setTimeout(r, 2000));
      } catch (delErr: any) {
        logger.warn({ err: delErr?.message, bankId: this.bankId }, "[MemoryService] Delete bank notice (may not exist yet)");
      }

      await this.client.createBank(this.bankId, {
        name: "RecallCare Memory Bank",
        mission: "Clinical decision support memory bank recording longitudinal diabetes encounters, risk factors, clinician decisions and outcomes.",
      });
      logger.info({ bankId: this.bankId }, "[MemoryService] Successfully recreated fresh memory bank");
      return true;
    } catch (err: any) {
      logger.error({ err: err?.message, bankId: this.bankId }, "[MemoryService] Failed to reset memory bank");
      return false;
    }
  }

  /**
   * Retains a risk assessment record into Hindsight memory.
   */
  async retainAssessment(assessment: Assessment, patientId: string): Promise<boolean> {
    if (!this.isMemoryEnabled() || !this.client) {
      logger.info({ patientId, assessmentId: assessment.id }, "[MemoryService] Memory disabled; skipping assessment retain");
      return false;
    }

    try {
      const topDrivers = Array.isArray(assessment.factors)
        ? assessment.factors
            .slice(0, 3)
            .map((f: any) => `${f.name} (${f.impact}: ${f.description})`)
            .join("; ")
        : "None noted";

      const visitDate = assessment.createdAt ? new Date(assessment.createdAt) : new Date();
      const timestamp = visitDate.toISOString();
      const dateStr = visitDate.toLocaleDateString("en-US", { month: "short", year: "numeric", day: "numeric" });

      const content = [
        `Assessment on ${assessment.patientName} (Patient ID: ${patientId}, Visit Date: ${dateStr}):`,
        `Risk score: ${assessment.riskScore}% (${assessment.riskCategory}).`,
        `Biomarkers: Fasting Glucose ${assessment.bloodGlucoseLevel} mg/dL, HbA1c ${assessment.hba1cLevel}%, BMI ${assessment.bmi}.`,
        `Hypertension: ${assessment.hypertension ? "Yes" : "No"}, Heart Disease: ${assessment.heartDisease ? "Yes" : "No"}.`,
        `Top risk drivers: ${topDrivers}.`,
        assessment.clinicalNote ? `Clinician notes: "${assessment.clinicalNote}".` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const docId =
        (assessment as any).documentId ||
        ((assessment as any).visitNumber
          ? `patient-${patientId}-visit-${(assessment as any).visitNumber}-assessment`
          : `patient-${patientId}-assessment-${assessment.id}`);

      // Bounded retry with backoff for transient network drops (e.g. "fetch failed")
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          await this.client.retain(this.bankId, content, {
            context: "clinical_risk_assessment",
            documentId: docId,
            timestamp,
            tags: [`patient:${patientId}`, "type:assessment"],
            metadata: {
              patientId: String(patientId),
              assessmentId: String(assessment.id),
              riskCategory: assessment.riskCategory,
              riskScore: String(assessment.riskScore),
              date: timestamp,
            },
          });

          logger.info({ patientId, assessmentId: assessment.id, docId, date: timestamp }, "[MemoryService] Assessment retained to Hindsight");
          return true;
        } catch (callErr: any) {
          const isNetworkError = callErr?.message?.includes("fetch failed") || callErr?.message?.includes("ECONNRESET");
          if (attempts < maxAttempts && isNetworkError) {
            logger.warn({ err: callErr?.message, attempt: attempts }, "[MemoryService] Retrying transient retain network error...");
            await new Promise((r) => setTimeout(r, 1200 * attempts));
          } else {
            throw callErr;
          }
        }
      }
      return false;
    } catch (err: any) {
      logger.warn({ err: err?.message, patientId, assessmentId: assessment.id }, "[MemoryService] Failed to retain assessment (degraded)");
      return false;
    }
  }

  /**
   * Retains an unstructured clinical progress or visit note into Hindsight.
   */
  async retainClinicianNote(
    patientId: string,
    visitId: string,
    note: string,
    date?: string
  ): Promise<boolean> {
    if (!this.isMemoryEnabled() || !this.client) {
      return false;
    }

    try {
      const docId = `patient-${patientId}-note-${visitId}`;
      const noteDate = date ? new Date(date) : new Date();
      const timestamp = noteDate.toISOString();
      const dateStr = noteDate.toLocaleDateString("en-US", { month: "short", year: "numeric", day: "numeric" });
      const content = `Clinical Note (Visit ${visitId}, Visit Date: ${dateStr}): ${note}`;

      // Bounded retry with backoff for transient network drops
      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          await this.client.retain(this.bankId, content, {
            context: "clinical_encounter_note",
            documentId: docId,
            timestamp,
            tags: [`patient:${patientId}`, "type:note"],
            metadata: {
              patientId: String(patientId),
              visitId: String(visitId),
              date: timestamp,
            },
          });

          logger.info({ patientId, visitId, docId, date: timestamp }, "[MemoryService] Clinician note retained to Hindsight");
          return true;
        } catch (callErr: any) {
          const isNetworkError = callErr?.message?.includes("fetch failed") || callErr?.message?.includes("ECONNRESET");
          if (attempts < maxAttempts && isNetworkError) {
            logger.warn({ err: callErr?.message, attempt: attempts }, "[MemoryService] Retrying transient retain note network error...");
            await new Promise((r) => setTimeout(r, 1200 * attempts));
          } else {
            throw callErr;
          }
        }
      }
      return false;
    } catch (err: any) {
      logger.warn({ err: err?.message, patientId, visitId }, "[MemoryService] Failed to retain clinician note (degraded)");
      return false;
    }
  }

  /**
   * Retains post-visit intervention outcome feedback.
   */
  async retainOutcome(
    patientId: string,
    assessmentId: number,
    outcome: { helpful: boolean; intervention?: string; outcomeText: string }
  ): Promise<boolean> {
    if (!this.isMemoryEnabled() || !this.client) {
      return false;
    }

    try {
      const docId = `patient-${patientId}-outcome-${assessmentId}`;
      const outcomeDate = new Date();
      const timestamp = outcomeDate.toISOString();
      const dateStr = outcomeDate.toLocaleDateString("en-US", { month: "short", year: "numeric", day: "numeric" });
      const content = [
        `Clinician feedback for assessment ${assessmentId} (Date: ${dateStr}):`,
        outcome.intervention ? `Intervention pursued: ${outcome.intervention}.` : "No specific intervention logged.",
        `Outcome: ${outcome.outcomeText}.`,
        `Clinician rated insight as: ${outcome.helpful ? "Helpful" : "Unhelpful"}.`,
      ].join(" ");

      let attempts = 0;
      const maxAttempts = 3;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          await this.client.retain(this.bankId, content, {
            context: "clinical_outcome_feedback",
            documentId: docId,
            timestamp,
            tags: [`patient:${patientId}`, "type:outcome"],
            metadata: {
              patientId: String(patientId),
              assessmentId: String(assessmentId),
              helpful: String(outcome.helpful),
              date: timestamp,
            },
          });

          logger.info({ patientId, assessmentId, date: timestamp }, "[MemoryService] Outcome retained to Hindsight");
          return true;
        } catch (callErr: any) {
          const isNetworkError = callErr?.message?.includes("fetch failed") || callErr?.message?.includes("ECONNRESET");
          if (attempts < maxAttempts && isNetworkError) {
            await new Promise((r) => setTimeout(r, 1200 * attempts));
          } else {
            throw callErr;
          }
        }
      }
      return false;
    } catch (err: any) {
      logger.warn({ err: err?.message, patientId, assessmentId }, "[MemoryService] Failed to retain outcome (degraded)");
      return false;
    }
  }

  /**
   * Recalls historical memories strictly scoped to a specific patient.
   */
  async recallForPatient(
    patientId: string,
    query: string,
    maxTokens: number = 4096
  ): Promise<PatientRecallResult> {
    if (!this.isMemoryEnabled() || !this.client) {
      return {
        memories: [],
        count: 0,
        memoryEnabled: false,
        degraded: false,
        reason: "Memory service disabled by configuration",
      };
    }

    try {
      const response: RecallResponse = await this.client.recall(this.bankId, query, {
        tags: [`patient:${patientId}`],
        tagsMatch: "all_strict",
        maxTokens,
        budget: "mid",
      });

      const memories: RecalledMemory[] = (response.results || []).map((r: RecallResult) => ({
        id: r.id,
        text: r.text,
        date: r.occurred_start || r.metadata?.date || undefined,
        occurred_start: r.occurred_start || undefined,
        context: r.context || undefined,
        documentId: r.document_id || undefined,
        score: r.scores?.final ?? undefined,
      }));

      return {
        memories,
        count: memories.length,
        memoryEnabled: true,
        degraded: false,
      };
    } catch (err: any) {
      logger.warn({ err: err?.message, patientId }, "[MemoryService] Recall failed, falling back to degraded state");
      return {
        memories: [],
        count: 0,
        memoryEnabled: true,
        degraded: true,
        reason: err?.message || "Hindsight service unreachable",
      };
    }
  }
}

export const memoryService = new MemoryService();
