# RecallCare — Persistent Memory Architecture & Design

This document details the architectural design, schema conventions, memory lifecycle, and recall mechanics of the persistent-memory AI agent layer in RecallCare (built on Clinical Insight Engine by Gopal Gupta).

---

## 1. Architectural Overview

RecallCare transforms the stateless diabetes risk calculator of Clinical Insight Engine into a clinical assistant that remembers every patient visit. In standard clinical practice, patient care is longitudinal: decisions depend on prior medication trials, therapeutic response, lifestyle barriers, and clinician notes accumulated over multiple encounters.

To achieve this, RecallCare integrates a persistent memory layer powered by **Vectorize Hindsight** (`@vectorize-io/hindsight-client`) paired with a dual-model LLM engine via Groq:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Clinician Interface                             │
│       (Vite + React 18 + TailwindCSS + MemoryInsightPanel UI)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Express API Gateway                             │
│   • POST /api/assessments/:id/insight  (memoryEnabled toggle)          │
│   • POST /api/assessments/:id/outcome  (clinician decision loop)       │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│       Vectorize Hindsight            │  │     Resilient LLM Service    │
│  (Longitudinal Memory Bank)          │  │     (Groq Cloud API)         │
│                                      │  │                              │
│  • Retain: Assessments & Notes       │  │  • Primary: openai/gpt-oss-  │
│  • Retain: Clinician Outcomes        │  │             120b             │
│  • Recall: Patient-scoped history    │  │  • Fallback: qwen/qwen3-32b  │
│  • Memory Unit Knowledge Graph       │  │  • Fallback 3: Rules Engine  │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 2. What is Retained into Memory

Three distinct clinical data artifacts are retained into Hindsight to construct a rich, multi-dimensional patient timeline:

### A. Structured Risk Assessments
When an assessment is calculated, the numerical metrics, risk category, and model-derived factors are retained:
- **Biomarkers**: Fasting Blood Glucose (mg/dL), HbA1c (%), Body Mass Index (BMI).
- **Risk Provenance**: Risk Score (0–100%), Risk Category (LOW, MODERATE, HIGH), and primary risk drivers.
- **Context Tag**: `context: "clinical_risk_assessment"`.
- **Tags**: `patient:${patientId}`, `type:assessment`.

### B. Unstructured Clinical Progress Notes
Encounter notes recorded during patient visits provide clinical narrative context that numbers cannot convey:
- **Encounter Details**: Dietary discussions, exercise goals, travel barriers, adherence notes.
- **Context Tag**: `context: "clinical_encounter_note"`.
- **Tags**: `patient:${patientId}`, `type:note`.

### C. Clinician Decisions & Outcome Feedback
Post-assessment interventions logged by the physician complete the feedback loop:
- **Intervention**: Specific clinical pathway pursued (e.g. dietary referral, medication review).
- **Outcome Note**: Patient-reported response or tolerance observation (e.g. GI symptoms, glycemic response).
- **Quality Feedback**: Boolean rating indicating whether the previous AI insight was clinically helpful.
- **Context Tag**: `context: "clinical_outcome_feedback"`.
- **Tags**: `patient:${patientId}`, `type:outcome`.

---

## 3. Deterministic Document IDs & Tagging Conventions

To guarantee idempotency and avoid duplicate memory creation across database re-seeds or routine re-evaluations, all document IDs follow strict deterministic naming conventions:

| Entity Type | Document ID Pattern | Example |
| :--- | :--- | :--- |
| **Visit Assessment** | `patient-${patientId}-visit-${visitNumber}-assessment` | `patient-101-visit-1-assessment` |
| **Ad-Hoc Assessment** | `patient-${patientId}-assessment-${assessmentId}` | `patient-101-assessment-101` |
| **Clinician Note** | `patient-${patientId}-note-${visitNumber}` | `patient-101-note-1` |
| **Clinician Outcome** | `patient-${patientId}-outcome-${assessmentId}` | `patient-101-outcome-101` |

### Deterministic Timestamps
All synthetic and seeded encounters use explicit calendar dates anchored to UTC (`YYYY-MM-DDT00:00:00.000Z`) rather than non-deterministic wall-clock timestamps. This ensures that re-seeding without `--reset` updates the existing Hindsight documents in place rather than creating duplicate memory units.

---

## 4. Recall Mechanics & Search Scoping

When generating an insight for an encounter:
1. **Scope Restriction**: All recall queries pass the patient filter tag `tags: ["patient:${patientId}"]`, strictly guaranteeing that no memory records from other patients can leak into the context.
2. **Semantic Query Construction**: The query synthesizes the patient name, biomarker trajectory, and current clinical note:
   ```ts
   const recallQuery = `longitudinal encounters, previous interventions, treatment tolerance, clinician decisions and outcomes for ${assessment.patientName}`;
   ```
3. **Budget**: A configurable token limit (default: 3000 tokens) retrieves relevant memory units extracted by Hindsight's knowledge graph.

---

## 5. Top-12 Selection & Balanced Representation

Raw vector retrieval can over-sample multiple micro-facts from a single recent encounter while starving earlier baseline visits. To solve this, the agent applies an intelligent **Top-12 Selection Algorithm**:

```
[Raw Hindsight Recalled Memory Units]
                 │
                 ▼
     [Deduplication on Normalized Text Key]
                 │
                 ▼
┌────────────────────────────────────────────────────────┐
│              Priority-Based Slot Allocation            │
│                                                        │
│  1. Priority 1: Clinician Outcome & Feedback Records   │
│     (Preserves up to 3 outcome memories)               │
│                                                        │
│  2. Priority 2: Distinct Visit Date Representation    │
│     (Guarantees ≥1 record for each historical visit:   │
│      Nov 2025, Mar 2026, Jul 2026, Nov 2026)           │
│                                                        │
│  3. Priority 3: Salience Fill                          │
│     (Fills remaining slots up to 12 from notes &       │
│      assessments)                                      │
└────────────────────────────────────────────────────────┘
                 │
                 ▼
[Top 12 Balanced Longitudinal Memories Sent to LLM & UI]
```

This guarantees that:
- Every historical visit date is represented with at least one record.
- The care team's past interventions are never displaced by recent vitals alone.
- Total memory context sent to the LLM is bounded and coherent.

---

## 6. The Before/After Feedback Demonstration

The system provides an end-to-end demonstration of active learning using the scripted demo patient **Marcus Vance (#101)**:

1. **Memory OFF (Stateless Baseline)**:
   - Evaluates only the current visit parameters (HbA1c 7.1%, Glucose 156 mg/dL, BMI 31.4).
   - Generates generic guideline considerations without awareness of prior history.
2. **Memory ON (Before New Feedback)**:
   - Recalls 4 visits across 12 months (Nov 2025 to Nov 2026).
   - Notes that lifestyle interventions were attempted in 2025 and that Metformin was initiated in July 2026.
   - Contains **zero mentions** of medication intolerance or dietitian referrals.
3. **Clinician Submits Feedback**:
   - The clinician records: *"Patient reported nausea after starting medication; arranged dietitian consultation for meal tolerance strategies."*
   - The decision is persisted to PostgreSQL (`agent_outcomes` table) and retained to Hindsight under `patient-101-outcome-101`.
4. **Memory ON (After Feedback)**:
   - The subsequent insight immediately incorporates the new outcome memory:
   - Identifies the prior nausea episode, highlights the active dietitian referral, and recommends evaluating medication tolerance rather than blindly intensifying therapy.

---

## 7. Safety, Fallback & Medical Disclaimer

- **Strict Non-Prescriptive Language**: The LLM system prompt strictly forbids recommending specific drug names or dosages (e.g. no "850mg Metformin" or "add a GLP-1 agonist"). Recommendations use neutral clinical phrasing: *"consider reviewing treatment options with the clinician"*.
- **Visible Medical Disclaimer**: Every UI panel and export includes the mandatory notice:
  > *"Suggestions only. The clinician makes the final decision."*
- **Bounded Fault Tolerance**: In the event of an LLM rate limit (429), malformed tool-call JSON, or Hindsight API downtime, the system automatically executes bounded exponential backoff retries, switches to the fallback model (`qwen/qwen3-32b`), and ultimately falls back to a deterministic clinical rules summary. The application never crashes or displays a raw stack trace.
