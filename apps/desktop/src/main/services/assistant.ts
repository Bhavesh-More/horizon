/**
 * assistant.ts
 * Owns: Chat Assistant request lifecycle and renderer stream events.
 * Upholds:
 * - Invariant I-6: delegates to metadata-only retrieval and prompt builders.
 * - Invariant I-7: uses the active configured AI provider only; no cloud fallback.
 */
import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import {
  AssistantChatError,
  AssistantChatRequest,
  AssistantChatStartResponse,
  AssistantStreamEvent,
} from "@horizon/shared-types";
import { generateCompletion, getProvidersStatus } from "./llm-client";
import { buildAssistantRetrievalContext } from "./assistant-retrieval";
import {
  ASSISTANT_SYSTEM_PROMPT,
  buildAssistantPrompt,
} from "./assistant-prompt";

const CHAT_TIMEOUT_MS = 45_000;
const CHUNK_SIZE = 96;

function broadcastAssistantStream(event: AssistantStreamEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("assistant:stream", event);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyAssistantError(err: unknown): AssistantChatError {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (message.includes("api key") || message.includes("key missing")) return "not_configured";
  if (message.includes("auth") || message.includes("unauthorized")) return "authentication_failed";
  if (message.includes("quota") || message.includes("rate limit")) return "quota_exceeded";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("fetch") || message.includes("network") || message.includes("connect")) {
    return "network_error";
  }
  if (message.includes("schema") || message.includes("json")) return "invalid_response";
  return "unknown";
}

function errorMessage(category: AssistantChatError): string {
  if (category === "waiting_for_scan") return "Run a scan before chatting with the assistant.";
  if (category === "provider_unavailable") {
    return "Connect or start the active AI provider in Settings before chatting.";
  }
  if (category === "not_configured") return "The active AI provider is missing its configuration.";
  if (category === "authentication_failed") return "The active AI provider rejected the saved credentials.";
  if (category === "quota_exceeded") return "The active AI provider reported a quota or rate limit.";
  if (category === "network_error") return "The active AI provider could not be reached.";
  if (category === "timeout") return "The assistant request timed out.";
  if (category === "invalid_response") return "The assistant response could not be used.";
  return "The assistant request failed.";
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error("Assistant request timed out")), CHAT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function streamAnswer(requestId: string, answer: string): Promise<void> {
  const cleanAnswer = answer.trim();
  for (let i = 0; i < cleanAnswer.length; i += CHUNK_SIZE) {
    broadcastAssistantStream({
      requestId,
      event: "chunk",
      chunk: cleanAnswer.slice(i, i + CHUNK_SIZE),
    });
    await sleep(12);
  }
  broadcastAssistantStream({ requestId, event: "completed" });
}

async function runAssistantChat(
  requestId: string,
  request: AssistantChatRequest
): Promise<void> {
  broadcastAssistantStream({ requestId, event: "started" });

  try {
    const context = await buildAssistantRetrievalContext(
      request.message,
      request.scanRunId
    );

    if (!context.scan) {
      broadcastAssistantStream({
        requestId,
        event: "failed",
        errorCategory: "waiting_for_scan",
        message: errorMessage("waiting_for_scan"),
      });
      return;
    }

    const providerStatus = await getProvidersStatus();
    const activeProvider = providerStatus.providers.find((provider) => provider.isActive);

    if (!activeProvider?.isConfigured) {
      broadcastAssistantStream({
        requestId,
        event: "failed",
        errorCategory: "provider_unavailable",
        message: errorMessage("provider_unavailable"),
      });
      return;
    }

    if (context.evidenceStrength === "weak" && context.searchTerms.length > 0) {
      await streamAnswer(
        requestId,
        "I found the latest scan summary, but not enough matching metadata for that question. Try naming a specific folder, category, duplicate group, or forecast signal."
      );
      return;
    }

    const prompt = buildAssistantPrompt({ message: request.message, context });
    const answer = await withTimeout(
      generateCompletion({
        prompt,
        systemPrompt: ASSISTANT_SYSTEM_PROMPT,
      })
    );

    await streamAnswer(
      requestId,
      answer ||
        "I could not produce a useful answer from the available metadata. Try asking about duplicates, large files, unused files, or forecast risk."
    );
  } catch (err) {
    const category = classifyAssistantError(err);
    broadcastAssistantStream({
      requestId,
      event: "failed",
      errorCategory: category,
      message: errorMessage(category),
    });
  }
}

export async function startAssistantChat(
  request: AssistantChatRequest
): Promise<AssistantChatStartResponse> {
  const requestId = randomUUID();
  void runAssistantChat(requestId, request);
  return { requestId, state: "started" };
}
