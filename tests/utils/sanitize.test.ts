import { describe, test, expect } from "bun:test";
import { redactPII } from "../../src/utils/sanitize";

describe("redactPII", () => {
  test("masks password by default", async () => {
    const result = await redactPII(
      { email: "user@example.com", password: "secret123" },
      { enabled: true, strategy: "mask" },
    );
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });

  test("removes fields with remove strategy", async () => {
    const result = await redactPII(
      { password: "secret", token: "abc" },
      { enabled: true, strategy: "remove" },
    );
    expect("password" in result).toBe(false);
    expect("token" in result).toBe(false);
  });

  test("hashes fields with hash strategy", async () => {
    const result = await redactPII(
      { password: "secret" },
      { enabled: true, strategy: "hash" },
    );
    expect(typeof result.password).toBe("string");
    expect((result.password as string).length).toBe(64);
  });

  test("same input produces same hash", async () => {
    const a = await redactPII(
      { password: "deterministic" },
      { enabled: true, strategy: "hash" },
    );
    const b = await redactPII(
      { password: "deterministic" },
      { enabled: true, strategy: "hash" },
    );
    expect(a.password).toBe(b.password);
  });

  test("skips redaction when disabled", async () => {
    const result = await redactPII(
      { password: "secret" },
      { enabled: false },
    );
    expect(result.password).toBe("secret");
  });

  test("skips null/undefined fields", async () => {
    const result = await redactPII(
      { password: null },
      { enabled: true, strategy: "mask" },
    );
    expect(result.password).toBeNull();
  });

  test("respects custom field list", async () => {
    const result = await redactPII(
      { email: "user@example.com", customField: "sensitive" },
      { enabled: true, strategy: "mask", fields: ["customField"] },
    );
    expect(result.customField).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });
});


describe("recursive PII redaction", () => {
  test("redacts nested objects and arrays while preserving error diagnostics", async () => {
    const source = {
      requestBody: { password: "private", items: [{ code: "private", email: "kept" }] },
      error: { code: "INVALID_CODE" },
    };
    for (const strategy of ["mask", "remove", "hash"] as const) {
      const result = await redactPII(source, { enabled: true, strategy });
      const body = result.requestBody as typeof source.requestBody;
      expect(result.error).toEqual({ code: "INVALID_CODE" });
      if (strategy === "remove") {
        expect(body.password).toBeUndefined();
        expect(body.items[0]!.code).toBeUndefined();
      } else {
        expect(body.password).toBe(strategy === "mask" ? "[REDACTED]" : body.items[0]!.code);
        expect(body.items[0]!.code).toMatch(strategy === "hash" ? /^[0-9a-f]{64}$/ : /^\[REDACTED\]$/);
      }
      expect(body.items[0]!.email).toBe("kept");
    }
    expect(source.requestBody.password).toBe("private");
    expect(source.requestBody.items[0]!.code).toBe("private");
  });

  test("redacts shared references independently and replaces cycles", async () => {
    const shared: Record<string, unknown> = { password: "private" };
    shared.self = shared;
    expect(await redactPII({ a: shared, b: shared }, { enabled: true })).toEqual({
      a: { password: "[REDACTED]", self: "[Circular]" },
      b: { password: "[REDACTED]", self: "[Circular]" },
    });
  });

  test("bounds traversal at 32 independently of metadata validation", async () => {
    const { resolveOptions } = await import("../../src/plugin");
    const { buildLogEntryFromAction } = await import("../../src/internal");
    let metadata: Record<string, unknown> = { password: "private" };
    for (let i = 0; i < 32; i++) metadata = { nested: metadata };
    const options = resolveOptions({ metadataLimits: false, piiRedaction: { enabled: true } });
    const entry = await buildLogEntryFromAction("test", "success", {
      metadata, userId: null, request: undefined, headers: undefined, options, authOptions: {},
    });
    expect(JSON.stringify(entry.metadata)).toContain("[REDACTED]");
    expect(JSON.stringify(entry.metadata)).not.toContain("[MaxDepth]");
    const beyond = await redactPII({ nested: metadata }, { enabled: true });
    expect(JSON.stringify(beyond)).toContain("[MaxDepth]");
    expect(JSON.stringify(beyond)).not.toContain("private");
  });
});
