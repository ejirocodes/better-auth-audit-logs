import { describe, test, expect } from "bun:test";
import { validateEntry } from "../../src/utils/validate-entry";

function makeValidEntry() {
  return {
    userId: "user-1",
    action: "sign-in:email",
    status: "success" as const,
    severity: "medium" as const,
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    metadata: {},
    createdAt: new Date(),
  };
}

describe("validateEntry", () => {
  test("returns valid entry unchanged", () => {
    const entry = makeValidEntry();
    const result = validateEntry(entry);
    expect(result).toEqual(entry);
  });

  test("accepts null userId", () => {
    const entry = { ...makeValidEntry(), userId: null };
    const result = validateEntry(entry);
    expect(result?.userId).toBeNull();
  });

  test("rejects entry with missing action", () => {
    const entry = { ...makeValidEntry(), action: "" };
    const result = validateEntry(entry);
    expect(result).toBeNull();
  });

  test("rejects entry with missing required fields", () => {
    const { action: _, ...partial } = makeValidEntry();
    const result = validateEntry(partial);
    expect(result).toBeNull();
  });

  test("rejects entry with invalid status", () => {
    const entry = { ...makeValidEntry(), status: "unknown" };
    const result = validateEntry(entry);
    expect(result).toBeNull();
  });

  test("rejects entry with invalid severity", () => {
    const entry = { ...makeValidEntry(), severity: "extreme" };
    const result = validateEntry(entry);
    expect(result).toBeNull();
  });

  test("rejects completely wrong type", () => {
    expect(validateEntry("string")).toBeNull();
    expect(validateEntry(42)).toBeNull();
    expect(validateEntry(null)).toBeNull();
  });

  test("logs warning with field details when invalid", () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    validateEntry({ ...makeValidEntry(), status: "invalid" }, logger);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("[audit-log]");
  });

  test("does not log when entry is valid", () => {
    const warnings: string[] = [];
    const logger = { warn: (msg: string) => warnings.push(msg) };

    validateEntry(makeValidEntry(), logger);
    expect(warnings).toHaveLength(0);
  });
});
