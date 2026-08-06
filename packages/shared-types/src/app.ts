import { z } from "zod";

export const AppPingRequestSchema = z.object({});
export type AppPingRequest = z.infer<typeof AppPingRequestSchema>;

export const AppPingResponseSchema = z.literal("pong");
export type AppPingResponse = z.infer<typeof AppPingResponseSchema>;