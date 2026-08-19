import { ipcMain } from "electron";
import { AssistantChatRequestSchema } from "@horizon/shared-types";
import { startAssistantChat } from "../services/assistant";

export function registerAssistantIpc() {
  ipcMain.handle("assistant:chat", async (_event, payload: unknown) => {
    try {
      const validated = AssistantChatRequestSchema.parse(payload);
      const data = await startAssistantChat(validated);
      return { ok: true, data };
    } catch (err: any) {
      return {
        ok: false,
        error: {
          code: "ASSISTANT_CHAT_FAILED",
          message: err.message || "Failed to start assistant chat",
        },
      };
    }
  });
}
