import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Sparkles,
  History,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  RefreshCw,
  Layers,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  CheckCircle2,
  Send,
  ClipboardList,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecalledMemoryItem {
  id: string;
  text: string;
  date?: string;
  context?: string;
  score?: number;
}

export interface PastOutcomeItem {
  id: number;
  helpful: boolean;
  intervention: string | null;
  outcomeText: string;
  createdAt: string;
}

export interface MemoryInsightPanelProps {
  assessmentId: number;
  patientName: string;
  patientId?: string | null;
  className?: string;
}

export const MemoryInsightPanel: React.FC<MemoryInsightPanelProps> = ({
  assessmentId,
  patientName,
  patientId,
  className,
}) => {
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [missingPatientId, setMissingPatientId] = useState<boolean>(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [memoriesUsed, setMemoriesUsed] = useState<RecalledMemoryItem[]>([]);
  const [modelUsed, setModelUsed] = useState<string>("");
  const [showMemoriesDetails, setShowMemoriesDetails] = useState<boolean>(false);

  // Clinician feedback form state
  const [helpful, setHelpful] = useState<boolean>(true);
  const [intervention, setIntervention] = useState<string>("");
  const [outcomeText, setOutcomeText] = useState<string>("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<boolean>(false);
  const [isUpdatingMemory, setIsUpdatingMemory] = useState<boolean>(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [pastOutcomes, setPastOutcomes] = useState<PastOutcomeItem[]>([]);
  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState<boolean>(true);

  const fetchInsight = async (enabled: boolean) => {
    if (!assessmentId) return;
    if (patientId === null || patientId === "") {
      setMissingPatientId(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setMissingPatientId(false);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/insight`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ memoryEnabled: enabled }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (
          res.status === 400 &&
          (String(errJson.error).includes("patientId") || String(errJson.message).includes("patientId"))
        ) {
          setMissingPatientId(true);
          return;
        }
        throw new Error(errJson.error || `Failed to fetch insight (HTTP ${res.status})`);
      }

      const data = await res.json();
      setInsight(data.insight);
      setMemoriesUsed(data.memoriesUsed || []);
      setModelUsed(data.modelUsed || "Groq LLM");
    } catch (err: any) {
      setError(err?.message || "Failed to generate AI insight.");
    } finally {
      setLoading(false);
    }
  };

  const fetchOutcomes = async () => {
    if (!assessmentId || patientId === null || patientId === "") return;
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/outcome`);
      if (res.ok) {
        const data = await res.json();
        setPastOutcomes(data.outcomes || []);
      }
    } catch {
      // Gracefully ignore fetch errors for past outcomes
    }
  };

  useEffect(() => {
    fetchInsight(memoryEnabled);
    fetchOutcomes();
  }, [assessmentId, patientId, memoryEnabled]);

  const toggleMemory = () => {
    const nextState = !memoryEnabled;
    setMemoryEnabled(nextState);
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outcomeText.trim()) {
      setFeedbackError("Please provide an outcome observation or patient response note.");
      return;
    }

    setFeedbackSubmitting(true);
    setIsUpdatingMemory(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const res = await fetch(`/api/assessments/${assessmentId}/outcome`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          helpful,
          intervention: intervention.trim() || undefined,
          outcomeText: outcomeText.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to record outcome (HTTP ${res.status})`);
      }

      setFeedbackSuccess("Outcome feedback recorded and retained into Hindsight persistent memory!");
      setOutcomeText("");
      setIntervention("");

      // Refresh outcomes and re-query insight so the new memory is immediately incorporated!
      await fetchOutcomes();
      await fetchInsight(memoryEnabled);
    } catch (err: any) {
      setFeedbackError(err?.message || "Failed to submit outcome feedback.");
    } finally {
      setFeedbackSubmitting(false);
      setIsUpdatingMemory(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300 shadow-sm overflow-hidden",
        memoryEnabled
          ? "border-indigo-500/30 bg-gradient-to-br from-indigo-500/5 via-background to-purple-500/5"
          : "border-border bg-card",
        className
      )}
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
              memoryEnabled ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "bg-muted text-muted-foreground"
            )}
          >
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-foreground">
                Agent Memory Insight
              </h3>
              {modelUsed && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">
                  {modelUsed}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {memoryEnabled
                ? "Synthesizing real-time risk with Hindsight persistent clinic memory"
                : "Standard stateless evaluation (Memory OFF)"}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMemory}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shadow-xs",
              memoryEnabled
                ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                : "bg-background text-foreground border-border hover:bg-muted"
            )}
            title="Toggle between stateless evaluation and Hindsight persistent memory"
          >
            {memoryEnabled ? (
              <>
                <ToggleRight className="h-4 w-4" />
                <span>Memory ON</span>
              </>
            ) : (
              <>
                <ToggleLeft className="h-4 w-4" />
                <span>Memory OFF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body content */}
      <div className="p-4 sm:p-6 space-y-4">
        {feedbackSuccess && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-300 shadow-xs">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="font-medium">{feedbackSuccess}</span>
          </div>
        )}

        {isUpdatingMemory && (
          <div className="flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-xs text-indigo-700 dark:text-indigo-300 shadow-xs animate-pulse">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
            <span className="font-semibold">Updating persistent memory and synthesizing refreshed longitudinal insight...</span>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
            <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-muted-foreground">
              {memoryEnabled
                ? "Recalling longitudinal history from Hindsight and synthesizing insight..."
                : "Analyzing current assessment statelessly..."}
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Insight Generation Notice</span>
            </div>
            <p className="text-xs">{error}</p>
            <button
              type="button"
              onClick={() => fetchInsight(memoryEnabled)}
              className="text-xs font-semibold underline hover:no-underline pt-1"
            >
              Retry
            </button>
          </div>
        )}

        {missingPatientId && !loading && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 text-slate-700 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm text-blue-700 dark:text-blue-400">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <span>Patient Identifier Required for Longitudinal Memory</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This assessment record does not have an assigned Patient ID (MRN). Hindsight persistent memory links longitudinal glycemic trends, prior interventions, and clinician feedback using an explicit patient identifier.
            </p>
            <p className="text-xs text-muted-foreground">
              To enable longitudinal memory recall for future assessments, enter a Patient ID / MRN when creating the assessment, or view a seeded patient encounter (e.g. Marcus Vance #101).
            </p>
          </div>
        )}

        {!loading && !error && !missingPatientId && (
          <div className="space-y-5">
            {/* Memory Citations Header Badge */}
            {memoryEnabled && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                    <Calendar className="h-3.5 w-3.5" />
                    {(() => {
                      const dates = Array.from(
                        new Set(
                          memoriesUsed
                            .map((m) => {
                              if (!m.date) return null;
                              try {
                                const d = new Date(m.date);
                                return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                              } catch {
                                return null;
                              }
                            })
                            .filter(Boolean) as string[]
                        )
                      );
                      if (dates.length > 1) {
                        return `Encounters from ${dates[dates.length - 1]} – ${dates[0]} (${memoriesUsed.length} memories)`;
                      }
                      if (dates.length === 1) {
                        return `Encounters from ${dates[0]} (${memoriesUsed.length} memories)`;
                      }
                      return `${memoriesUsed.length} past encounter memories`;
                    })()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {memoriesUsed.length > 0 ? "Top 12 longitudinal memories after deduplication" : "No prior memories found"}
                  </span>
                </div>

                {memoriesUsed.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowMemoriesDetails(!showMemoriesDetails)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline"
                  >
                    <span>{showMemoriesDetails ? "Hide past records" : "View past records"}</span>
                    {showMemoriesDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )}

            {/* Recalled Memories Breakdown Collapsible */}
            <AnimatePresence>
              {showMemoriesDetails && memoriesUsed.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl border border-indigo-500/20 bg-muted/40 p-3 sm:p-4 space-y-2 text-xs"
                >
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-indigo-500" />
                    Exact Hindsight Memories Recalled for {patientName}:
                  </p>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {memoriesUsed.map((mem, idx) => {
                      let formattedDate: string | null = null;
                      if (mem.date) {
                        try {
                          const d = new Date(mem.date);
                          if (!isNaN(d.getTime())) {
                            formattedDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                          }
                        } catch {
                          formattedDate = mem.date.split("T")[0];
                        }
                      }
                      return (
                        <div
                          key={mem.id || idx}
                          className="rounded-lg border border-border bg-background p-2.5 space-y-1 shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400">
                              <Calendar className="h-3 w-3" />
                              Visit Date: {formattedDate || "Recorded Encounter"}
                            </span>
                            {mem.score && <span>Relevance: {Math.round(mem.score * 100)}%</span>}
                          </div>
                          <p className="text-foreground leading-relaxed">{mem.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Insight Text */}
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-relaxed space-y-3 font-normal text-sm sm:text-base">
              {insight ? (
                insight.split("\n\n").map((para, i) => (
                  <p key={i} className="text-foreground/90">
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-muted-foreground italic">No insight generated yet.</p>
              )}
            </div>

            {/* CLINICIAN OUTCOME FEEDBACK FORM */}
            <div className="mt-4 rounded-xl border border-border/80 bg-background/80 p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-indigo-600" />
                  <h4 className="text-sm font-bold text-foreground">Clinician Decision & Outcome Feedback</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFeedbackDrawer(!showFeedbackDrawer)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <span>{showFeedbackDrawer ? "Collapse form" : "Log decision"}</span>
                  {showFeedbackDrawer ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Log the clinical intervention pursued and patient outcome. This feedback is retained directly into Hindsight to improve future longitudinal recommendations.
              </p>

              {/* Success Alert */}
              {feedbackSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{feedbackSuccess}</span>
                </div>
              )}

              {/* Error Alert */}
              {feedbackError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{feedbackError}</span>
                </div>
              )}

              {showFeedbackDrawer && (
                <form onSubmit={submitFeedback} className="space-y-3 pt-2">
                  {/* Helpful toggle pill buttons */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Was this AI agent insight helpful?</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setHelpful(true)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                          helpful === true
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                        )}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        <span>Helpful</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setHelpful(false)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                          helpful === false
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                            : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                        )}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        <span>Not helpful / Needs adjustment</span>
                      </button>
                    </div>
                  </div>

                  {/* Intervention Input */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Intervention Pursued (Optional)</label>
                    <input
                      type="text"
                      value={intervention}
                      onChange={(e) => setIntervention(e.target.value)}
                      placeholder="e.g. Intensified lifestyle counseling, initiated Metformin therapy, dietary referral..."
                      className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>

                  {/* Outcome Note Textarea */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">
                      Clinician Outcome Observation & Note <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={outcomeText}
                      onChange={(e) => setOutcomeText(e.target.value)}
                      placeholder="e.g. Patient counseled on travel adherence barriers; scheduled for follow-up in 3 months..."
                      required
                      className="w-full text-xs px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-indigo-500/30"
                    />
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="submit"
                      disabled={feedbackSubmitting}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm transition-all",
                        feedbackSubmitting
                          ? "bg-indigo-400 cursor-not-allowed"
                          : "bg-indigo-600 hover:bg-indigo-700 active:scale-98"
                      )}
                    >
                      {feedbackSubmitting ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          <span>Retaining to Hindsight...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit Decision & Retain to Memory</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Past logged outcomes for this assessment */}
              {pastOutcomes.length > 0 && (
                <div className="pt-2 border-t border-border/40 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Recorded Decisions for this Encounter:
                  </p>
                  <div className="space-y-1">
                    {pastOutcomes.map((o) => (
                      <div
                        key={o.id}
                        className="text-xs p-2 rounded-md bg-muted/40 border border-border/40 flex items-start justify-between gap-2"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {o.intervention ? `${o.intervention} — ` : ""}{o.outcomeText}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString()} · {o.helpful ? "Helpful" : "Needs adjustment"}
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-mono">
                          Retained
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Medical Disclaimer Footer */}
            <div className="pt-3 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Suggestions only. The clinician makes the final decision.</span>
              </div>
              <span className="text-[11px] text-muted-foreground/80">
                Vectorize Hindsight Persistent Memory Layer
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
