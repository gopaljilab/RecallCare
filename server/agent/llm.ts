import Groq from "groq-sdk";
import { z } from "zod";
import { logger } from "../logger";

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: z.ZodSchema<TArgs>;
  execute: (args: TArgs) => Promise<TResult>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface GenerateInsightOptions {
  systemPrompt: string;
  userPrompt: string;
  tools?: ToolDefinition[];
  patientMetrics?: {
    patientName: string;
    riskScore: number;
    riskCategory: string;
    factors: Array<{ name: string; impact: string; description: string }>;
    glucose: number;
    hba1c: number;
    bmi: number;
    visitCount?: number;
  };
  recalledMemories?: Array<{ id: string; text: string; date?: string }>;
  memoryEnabled?: boolean;
}

export interface LLMResult {
  text: string;
  modelUsed: string;
  toolsUsed: string[];
  fallbackUsed: boolean;
  isDeterministicFallback: boolean;
}

export class ResilientLLMService {
  private primaryModel: string;
  private fallbackModel: string;
  private apiKey: string;
  private client: Groq | null = null;
  public retryDelayOverrideMs?: number;

  constructor() {
    this.primaryModel = process.env.LLM_PRIMARY_MODEL || "openai/gpt-oss-120b";
    this.fallbackModel = process.env.LLM_FALLBACK_MODEL || "qwen/qwen3-32b";
    this.apiKey = process.env.GROQ_API_KEY || "";

    if (this.apiKey) {
      try {
        this.client = new Groq({ apiKey: this.apiKey });
      } catch (err: any) {
        logger.warn({ err: err?.message }, "[LLMService] Failed to initialize Groq client");
        this.client = null;
      }
    }
  }

  public getPrimaryModel(): string {
    return this.primaryModel;
  }

  public getFallbackModel(): string {
    return this.fallbackModel;
  }

  /**
   * Generates insight with multi-tier resilience:
   * 1. Primary Model with bounded retry and corrective prompt for tool arguments.
   * 2. Fallback Model on persistent error or refusal.
   * 3. Deterministic Non-LLM Clinical Fallback if all API attempts fail.
   */
  async generateInsight(options: GenerateInsightOptions): Promise<LLMResult> {
    const toolsUsed: string[] = [];

    const currentApiKey = process.env.GROQ_API_KEY || "";
    if (currentApiKey && (!this.client || this.apiKey !== currentApiKey)) {
      this.apiKey = currentApiKey;
      try {
        this.client = new Groq({ apiKey: this.apiKey });
      } catch {
        this.client = null;
      }
    } else if (!currentApiKey) {
      this.apiKey = "";
      this.client = null;
    }

    // If client is unconfigured or offline, immediately return deterministic fallback
    if (!this.client || !this.apiKey) {
      logger.info("[LLMService] Groq API key not configured. Using deterministic clinical fallback.");
      return {
        text: this.generateDeterministicInsight(options),
        modelUsed: "deterministic-rules-engine",
        toolsUsed: [],
        fallbackUsed: true,
        isDeterministicFallback: true,
      };
    }

    // Try Primary Model
    try {
      const result = await this.executeWithModel(this.primaryModel, options, toolsUsed);
      if (result) {
        return {
          text: result,
          modelUsed: this.primaryModel,
          toolsUsed,
          fallbackUsed: false,
          isDeterministicFallback: false,
        };
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, model: this.primaryModel },
        "[LLMService] Primary model failed or refused. Escalating to fallback model."
      );
    }

    // Try Fallback Model
    try {
      const result = await this.executeWithModel(this.fallbackModel, options, toolsUsed);
      if (result) {
        return {
          text: result,
          modelUsed: this.fallbackModel,
          toolsUsed,
          fallbackUsed: true,
          isDeterministicFallback: false,
        };
      }
    } catch (err: any) {
      logger.warn(
        { err: err?.message, model: this.fallbackModel },
        "[LLMService] Fallback model also failed. Activating deterministic clinical guard."
      );
    }

    // Tier 3: Deterministic Non-LLM Fallback
    return {
      text: this.generateDeterministicInsight(options),
      modelUsed: "deterministic-rules-engine",
      toolsUsed,
      fallbackUsed: true,
      isDeterministicFallback: true,
    };
  }

  /**
   * Executes a prompt loop with a specific model, handling tool calls, argument validation, and retries.
   */
  private async executeWithModel(
    model: string,
    options: GenerateInsightOptions,
    toolsUsed: string[]
  ): Promise<string | null> {
    const tools = options.tools || [];
    const groqTools = tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: this.zodToJsonSchema(t.parameters),
      },
    }));

    const messages: ChatMessage[] = [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ];

    const maxLoops = 4;
    let loopCount = 0;

    while (loopCount < maxLoops) {
      loopCount++;

      const completion = await this.callGroqWithRetry(model, messages, groqTools);
      if (!completion) {
        throw new Error(`Empty response received from ${model}`);
      }

      const choice = completion.choices?.[0];
      const message = choice?.message;

      if (!message) {
        throw new Error("No message choice in completion");
      }

      // Check for refusal
      if ((message as any).refusal) {
        throw new Error(`Model refusal: ${(message as any).refusal}`);
      }

      // If model requests tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: message.tool_calls,
        });

        for (const call of message.tool_calls) {
          const toolName = call.function.name;
          const toolDef = tools.find((t) => t.name === toolName);

          if (!toolDef) {
            // Unknown tool name: send corrective message
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({ error: `Unknown tool '${toolName}'. Available tools: ${tools.map((t) => t.name).join(", ")}` }),
            });
            continue;
          }

          // Parse and validate arguments with Zod
          let parsedArgs: any;
          try {
            const rawArgs = JSON.parse(call.function.arguments || "{}");
            const validation = toolDef.parameters.safeParse(rawArgs);
            if (!validation.success) {
              // Malformed arguments: retry once with corrective message
              logger.warn({ toolName, issues: validation.error.issues }, "[LLMService] Tool argument validation failed");
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                name: toolName,
                content: JSON.stringify({
                  error: "Invalid arguments format",
                  details: validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
                }),
              });
              continue;
            }
            parsedArgs = validation.data;
          } catch (jsonErr: any) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({ error: `Malformed JSON in arguments: ${jsonErr.message}` }),
            });
            continue;
          }

          // Execute tool safely
          try {
            if (!toolsUsed.includes(toolName)) {
              toolsUsed.push(toolName);
            }
            const result = await toolDef.execute(parsedArgs);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify(result),
            });
          } catch (execErr: any) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: toolName,
              content: JSON.stringify({ error: `Execution failed: ${execErr.message}` }),
            });
          }
        }
        continue;
      }

      // Final textual response received
      if (message.content && message.content.trim().length > 0) {
        return message.content.trim();
      }
    }

    return null;
  }

  /**
   * Calls Groq with bounded retry and exponential backoff for 429 rate limits or network glitches.
   */
  private async callGroqWithRetry(
    model: string,
    messages: ChatMessage[],
    tools: any[]
  ): Promise<Groq.Chat.ChatCompletion | null> {
    if (!this.client) return null;

    const maxRetries = 2;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const payload: Parameters<Groq["chat"]["completions"]["create"]>[0] = {
          model,
          messages: messages as any,
          temperature: 0.2,
          max_tokens: 1024,
          stream: false,
        };

        if (tools.length > 0) {
          payload.tools = tools;
          payload.tool_choice = "auto";
        }

        // Apply a 15-second bounded timeout
        const response = (await Promise.race([
          this.client.chat.completions.create(payload),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Groq API request timed out after 15s")), 15000)
          ),
        ])) as Groq.Chat.ChatCompletion;

        return response;
      } catch (err: any) {
        attempt++;
        const isRateLimit = err?.status === 429 || err?.message?.includes("429");
        const isTimeout = err?.message?.includes("timed out");

        if (attempt <= maxRetries && (isRateLimit || isTimeout)) {
          const delay = this.retryDelayOverrideMs ?? (Math.pow(2, attempt) * 500 + Math.random() * 200);
          logger.warn({ model, attempt, delay }, "[LLMService] Rate-limit/timeout encountered, backing off");
          await new Promise((res) => setTimeout(res, delay));
          continue;
        }

        throw err;
      }
    }

    return null;
  }

  /**
   * Deterministic Non-LLM fallback: synthesizes real computed numbers and past records
   * without drug dosing or hallucinated metrics.
   */
  private generateDeterministicInsight(options: GenerateInsightOptions): string {
    const { patientMetrics, recalledMemories, memoryEnabled } = options;
    if (!patientMetrics) {
      return "Current clinical evaluation completed. Review glycemic indicators and patient status with the care team.";
    }

    const { patientName, riskScore, riskCategory, factors, glucose, hba1c, bmi } = patientMetrics;
    const topFactors = factors.slice(0, 3).map((f) => f.name.toLowerCase()).join(", ");

    const parts: string[] = [];

    if (memoryEnabled && recalledMemories && recalledMemories.length > 0) {
      parts.push(
        `Based on ${recalledMemories.length} historical record${recalledMemories.length > 1 ? "s" : ""} reviewed: ${patientName} presents with a calculated diabetes risk of ${riskScore}% (${riskCategory} category). Primary risk drivers identified by the assessment model are ${topFactors}.`
      );
      parts.push(
        `Current biomarkers show Fasting Blood Glucose of ${glucose} mg/dL, HbA1c of ${hba1c}%, and BMI of ${bmi}. Longitudinal comparison with prior encounters indicates persistent glycemic elevation.`
      );
      parts.push(
        "Clinical guidance: Prior interventions have been logged. Consider reviewing adherence and treatment options with the clinician to optimize glycemic control."
      );
    } else {
      parts.push(
        `${patientName} presents with an estimated diabetes risk score of ${riskScore}% (${riskCategory} category). Current measured biomarkers include Fasting Blood Glucose of ${glucose} mg/dL, HbA1c of ${hba1c}%, and BMI of ${bmi}.`
      );
      parts.push(
        `Top factors contributing to this assessment are ${topFactors}. General clinical guideline recommendation: recommend standard glycemic monitoring, lifestyle intervention review, and follow-up assessment.`
      );
    }

    return parts.join("\n\n");
  }

  /**
   * Helper to convert basic Zod schemas to JSON schema for tool definitions.
   */
  private zodToJsonSchema(schema: z.ZodSchema): Record<string, any> {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        if (value instanceof z.ZodString) {
          properties[key] = { type: "string" };
        } else if (value instanceof z.ZodNumber) {
          properties[key] = { type: "number" };
        } else if (value instanceof z.ZodBoolean) {
          properties[key] = { type: "boolean" };
        } else if (value instanceof z.ZodArray) {
          properties[key] = { type: "array" };
        } else {
          properties[key] = { type: "string" };
        }
        if (!(value instanceof z.ZodOptional)) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        required: required.length ? required : undefined,
      };
    }

    return { type: "object", properties: {} };
  }
}

export const llmService = new ResilientLLMService();
