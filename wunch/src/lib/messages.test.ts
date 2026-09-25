import { describe, expect, it } from "vitest";
import de from "../../messages/de.json";
import en from "../../messages/en.json";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("messages", () => {
  it("German and English have exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(de).sort());
  });
  it("German copy uses Swiss spelling (no ß)", () => {
    expect(JSON.stringify(de)).not.toContain("ß");
  });
});
