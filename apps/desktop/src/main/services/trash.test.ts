import { describe, it, expect, vi, beforeEach } from "vitest";
import { trashFile, trashFiles } from "./trash";

vi.mock("trash", () => ({
  default: vi.fn(),
}));

import trash from "trash";

describe("trash service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls trash package with resolved path and glob disabled", async () => {
    vi.mocked(trash).mockResolvedValue(undefined);

    const res = await trashFile("/tmp/sample_file.txt");
    expect(res.ok).toBe(true);
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash).toHaveBeenCalledWith(["/tmp/sample_file.txt"], { glob: false });
  });

  it("handles trash package failure gracefully without throwing", async () => {
    vi.mocked(trash).mockRejectedValue(new Error("File locked by another process"));

    const res = await trashFile("/tmp/locked_file.txt");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("File locked by another process");
  });

  it("processes batch of files sequentially and aggregates counts", async () => {
    vi.mocked(trash)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Permission denied"))
      .mockResolvedValueOnce(undefined);

    const batch = ["/tmp/file1.txt", "/tmp/file2.txt", "/tmp/file3.txt"];
    const result = await trashFiles(batch);

    expect(result.trashedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.results).toHaveLength(3);
    expect(result.results[0].ok).toBe(true);
    expect(result.results[1].ok).toBe(false);
    expect(result.results[2].ok).toBe(true);
  });
});
