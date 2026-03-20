import { describe, test, expect } from "bun:test";
import { withRetry } from "../../src/utils/retry";

describe("withRetry", () => {
  test("returns on first success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    }, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retries on failure then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("fail");
      return "recovered";
    }, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe("recovered");
    expect(calls).toBe(3);
  });

  test("throws after all retries exhausted", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("persistent failure");
      }, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow("persistent failure");

    expect(calls).toBe(3);
  });

  test("with zero retries, throws immediately", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("no retry");
      }, { maxRetries: 0, baseDelayMs: 10 }),
    ).rejects.toThrow("no retry");

    expect(calls).toBe(1);
  });
});
