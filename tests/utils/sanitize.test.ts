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
