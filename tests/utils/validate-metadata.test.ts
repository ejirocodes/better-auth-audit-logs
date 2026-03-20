import { describe, test, expect } from "bun:test";
import { validateMetadataSize } from "../../src/utils/validate-metadata";

describe("validateMetadataSize", () => {
  test("accepts empty metadata", () => {
    expect(validateMetadataSize({})).toBeNull();
  });

  test("accepts metadata within limits", () => {
    expect(validateMetadataSize({ key: "value" })).toBeNull();
  });

  test("rejects metadata exceeding max depth", () => {
    const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    const result = validateMetadataSize(deep, { maxBytes: 65536, maxDepth: 3 });
    expect(result).toContain("depth");
  });

  test("accepts metadata at exact max depth", () => {
    const atLimit = { a: { b: { c: "ok" } } };
    const result = validateMetadataSize(atLimit, { maxBytes: 65536, maxDepth: 3 });
    expect(result).toBeNull();
  });

  test("rejects metadata exceeding max bytes", () => {
    const large = { data: "x".repeat(1000) };
    const result = validateMetadataSize(large, { maxBytes: 100, maxDepth: 5 });
    expect(result).toContain("size");
  });

  test("accepts metadata at exactly max bytes", () => {
    const small = { a: "b" };
    const bytes = new TextEncoder().encode(JSON.stringify(small)).byteLength;
    const result = validateMetadataSize(small, { maxBytes: bytes, maxDepth: 5 });
    expect(result).toBeNull();
  });

  test("measures depth through arrays", () => {
    const withArray = { items: [{ nested: { deep: true } }] };
    const result = validateMetadataSize(withArray, { maxBytes: 65536, maxDepth: 2 });
    expect(result).toContain("depth");
  });

  test("uses defaults when no limits provided", () => {
    expect(validateMetadataSize({ key: "value" })).toBeNull();
  });
});
