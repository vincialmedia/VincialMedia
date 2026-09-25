import { describe, expect, it } from "vitest";
import { db } from "./helpers";

describe("rate limiter", () => {
  it("counts hits and blocks over the limit; peek never counts", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const peek = async () => (await db.rpc("rate_limit_peek", { p_key: key, p_max: 2, p_window_seconds: 600 })).data;
    const hit = async () => (await db.rpc("rate_limit_hit", { p_key: key, p_max: 2, p_window_seconds: 600 })).data;
    expect(await peek()).toBe(true);
    expect(await peek()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await peek()).toBe(true); // 2 of 2 used, still allowed to have happened
    expect(await hit()).toBe(false); // third is over the limit
    expect(await peek()).toBe(false);
    await db.from("rate_limits").delete().eq("key", key);
  });
});
