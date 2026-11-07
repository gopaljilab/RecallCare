import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insightAgent } from "./insight";
import { memoryService } from "./memory";
import { logger } from "../logger";
import { requireAuth, requireVerified } from "../auth";
import { assessmentLimiter } from "../middleware/rateLimit";
import { canAccessPatientRecord } from "../services/authz/patient-access";

export const agentRouter = Router();

const insightRequestSchema = z.object({
  memoryEnabled: z.boolean().optional().default(true),
});

const outcomeRequestSchema = z.object({
  helpful: z.boolean(),
  intervention: z.string().trim().max(500).optional().nullable(),
  outcomeText: z.string().trim().min(1, "Outcome note cannot be empty").max(2000),
});

/**
 * POST /api/assessments/:id/insight
 *
 * Generates an AI-driven, persistent-memory clinical insight for an assessment.
 * Demonstrates before/after behavior via the memoryEnabled flag.
 * Protected with authentication, verification, rate limiting, and object-level authorization.
 */
agentRouter.post(
  "/:id/insight",
  requireAuth,
  requireVerified,
  assessmentLimiter,
  async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const parsedId = Number.parseInt(rawId, 10);

      if (Number.isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({
          error: "Invalid assessment ID parameter. Must be a positive integer.",
        });
      }

      const bodyValidation = insightRequestSchema.safeParse(req.body || {});
      if (!bodyValidation.success) {
        return res.status(400).json({
          error: "Invalid request payload",
          details: bodyValidation.error.issues,
        });
      }

      const { memoryEnabled } = bodyValidation.data;

      // Fetch assessment record
      const currentUser = req.session?.user;
      const assessment = await storage.getAssessmentById(parsedId);

      if (!assessment) {
        return res.status(404).json({
          error: `Assessment with ID ${parsedId} not found`,
        });
      }

      // Enforce Object-Level Authorization
      if (currentUser && !canAccessPatientRecord(currentUser, assessment)) {
        return res.status(403).json({
          error: "Access denied. You do not have permission to view insights for this patient record.",
        });
      }

      // Enforce strict patientId requirement
      const patientId = assessment.patientId;
      if (!patientId || !patientId.trim()) {
        return res.status(400).json({
          error: "Assessment record is missing a required patientId. Cannot recall or generate persistent patient memory.",
        });
      }

      // Generate insight using InsightAgent
      const result = await insightAgent.generateAssessmentInsight(assessment, {
        memoryEnabled,
      });

      return res.json({
        success: true,
        assessmentId: assessment.id,
        patientName: assessment.patientName,
        insight: result.insight,
        memoriesUsed: result.memoriesUsed,
        riskScore: result.riskScore,
        riskCategory: result.riskCategory,
        memoryEnabled: result.memoryEnabled,
        modelUsed: result.modelUsed,
        fallbackUsed: result.fallbackUsed,
        disclaimer: result.disclaimer,
      });
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[AgentRoutes] Failed to generate insight");
      return res.status(500).json({
        error: "An unexpected error occurred while generating clinical insight.",
      });
    }
  }
);

/**
 * POST /api/assessments/:id/outcome
 *
 * Accepts clinician feedback and post-visit interventions, persists to agent_outcomes table,
 * and retains the record into the Hindsight persistent memory bank with patient tags.
 */
agentRouter.post(
  "/:id/outcome",
  requireAuth,
  requireVerified,
  assessmentLimiter,
  async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const parsedId = Number.parseInt(rawId, 10);

      if (Number.isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({
          error: "Invalid assessment ID parameter. Must be a positive integer.",
        });
      }

      const bodyValidation = outcomeRequestSchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return res.status(400).json({
          error: "Invalid outcome payload",
          details: bodyValidation.error.issues,
        });
      }

      const { helpful, intervention, outcomeText } = bodyValidation.data;

      const currentUser = req.session?.user;
      const assessment = await storage.getAssessmentById(parsedId);

      if (!assessment) {
        return res.status(404).json({
          error: `Assessment with ID ${parsedId} not found`,
        });
      }

      // Enforce Object-Level Authorization
      if (currentUser && !canAccessPatientRecord(currentUser, assessment)) {
        return res.status(403).json({
          error: "Access denied. You do not have permission to log outcome feedback for this patient record.",
        });
      }

      // Enforce strict patientId requirement
      const patientId = assessment.patientId;
      if (!patientId || !patientId.trim()) {
        return res.status(400).json({
          error: "Assessment record is missing a required patientId. Cannot retain clinical outcome to persistent patient memory.",
        });
      }

      // Retain to Hindsight persistent memory bank
      const memoryRetained = await memoryService.retainOutcome(patientId, parsedId, {
        helpful,
        intervention: intervention || undefined,
        outcomeText,
      });

      // Save to database agent_outcomes table
      const docId = `patient-${patientId}-outcome-${parsedId}`;
      const savedOutcome = await storage.createAgentOutcome({
        assessmentId: parsedId,
        clinicianId: currentUser?.id ?? null,
        patientId,
        helpful,
        intervention: intervention || null,
        outcomeText,
        hindsightMemoryId: memoryRetained ? docId : null,
      });

      logger.info(
        { assessmentId: parsedId, patientId, helpful, memoryRetained },
        "[AgentRoutes] Clinician outcome recorded and retained"
      );

      return res.status(201).json({
        success: true,
        message: "Clinician outcome recorded and retained to memory.",
        outcome: savedOutcome,
        memoryRetained,
      });
    } catch (err: any) {
      logger.error({ err: err?.message, stack: err?.stack }, "[AgentRoutes] Failed to record outcome");
      return res.status(500).json({
        error: "An unexpected error occurred while saving clinician outcome.",
      });
    }
  }
);

/**
 * GET /api/assessments/:id/outcome
 *
 * Fetches recorded outcomes for a given assessment.
 */
agentRouter.get(
  "/:id/outcome",
  requireAuth,
  requireVerified,
  async (req, res) => {
    try {
      const rawId = String(req.params.id);
      const parsedId = Number.parseInt(rawId, 10);

      if (Number.isNaN(parsedId) || parsedId <= 0) {
        return res.status(400).json({
          error: "Invalid assessment ID parameter. Must be a positive integer.",
        });
      }

      const currentUser = req.session?.user;
      const assessment = await storage.getAssessmentById(parsedId);

      if (!assessment) {
        return res.status(404).json({
          error: `Assessment with ID ${parsedId} not found`,
        });
      }

      if (currentUser && !canAccessPatientRecord(currentUser, assessment as any)) {
        return res.status(403).json({
          error: "Access denied. You do not have permission to view outcomes for this patient record.",
        });
      }

      const outcomes = await storage.getAgentOutcomesByAssessmentId(parsedId);
      return res.json({
        success: true,
        outcomes,
      });
    } catch (err: any) {
      logger.error({ err: err?.message }, "[AgentRoutes] Failed to fetch outcomes");
      return res.status(500).json({
        error: "An unexpected error occurred while fetching outcomes.",
      });
    }
  }
);

