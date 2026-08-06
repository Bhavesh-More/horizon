import { describe, it, expect } from "vitest";
import { FileCategoryEnum } from "@horizon/shared-types";

describe("Scanner File Categorization", () => {
  it("validates categories supported in FileCategoryEnum", () => {
    const categories = [
      "image",
      "video",
      "audio",
      "document",
      "archive",
      "dev_artifact",
      "other",
    ];

    categories.forEach((cat) => {
      expect(FileCategoryEnum.parse(cat)).toBe(cat);
    });
  });
});
