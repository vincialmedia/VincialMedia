import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/checkout")).toBe("/checkout");
    expect(safeNextPath("/en/orders?x=1#top")).toBe("/en/orders?x=1#top");
  });
  it("rejects other sites in every disguise", () => {
    for (const evil of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "/%09/evil.example".replace("%09", "\t"),
      "/\n/evil.example",
      "/\r\n/evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(evil)).toBe("/");
    }
  });
  it("uses the fallback when empty", () => {
    expect(safeNextPath(null, "/account")).toBe("/account");
    expect(safeNextPath("", "/en")).toBe("/en");
  });
});
