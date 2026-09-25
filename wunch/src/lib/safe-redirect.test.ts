import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("allows relative paths only", () => {
    expect(safeNextPath("/checkout")).toBe("/checkout");
    expect(safeNextPath("/en/orders?x=1")).toBe("/en/orders?x=1");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(null, "/account")).toBe("/account");
  });
});
