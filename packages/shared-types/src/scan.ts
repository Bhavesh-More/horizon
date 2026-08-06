import { z } from "zod";

export const ScanStartRequest = z.object({
  scope: z.array(z.string()),
});
export type ScanStartRequest = z.infer<typeof ScanStartRequest>;

export const ScanProgressEvent = z.object({
  event: z.enum(["found", "complete"]),
  path: z.string().optional(),
  summary: z
    .object({ totalFiles: z.number(), totalBytes: z.number() })
    .optional(),
});
export type ScanProgressEvent = z.infer<typeof ScanProgressEvent>;
