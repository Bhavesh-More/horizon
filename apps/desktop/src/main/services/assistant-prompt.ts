/**
 * assistant-prompt.ts
 * Owns: Metadata-only chat prompt construction for the Horizon Assistant.
 */
import { AssistantRetrievalContext } from "@horizon/shared-types";

export const ASSISTANT_SYSTEM_PROMPT = [
  "You are Horizon's storage assistant.",
  "Answer only from the supplied metadata context.",
  "Never claim to inspect, read, parse, or understand file contents.",
  "Do not tell the user to delete or move files directly. Suggest review actions in Horizon tabs.",
  "If the metadata is insufficient, say what is missing and ask for a more specific folder, category, or signal.",
  "Keep replies concise and practical.",
].join(" ");

export function buildAssistantPrompt(params: {
  message: string;
  context: AssistantRetrievalContext;
}): string {
  return JSON.stringify(
    {
      userQuestion: params.message,
      metadataContext: params.context,
      responseRules: [
        "Use paths, categories, sizes, duplicate summaries, forecasts, and recommendation card metadata only.",
        "Mention uncertainty when evidenceStrength is none or weak.",
        "Prefer short bullets when listing candidates.",
        "Do not invent file contents, user intent, or cleanup safety beyond the metadata.",
      ],
    },
    null,
    2
  );
}
