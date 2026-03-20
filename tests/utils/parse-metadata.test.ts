import { describe, test, expect } from "bun:test";
import { parseMetadata } from "../../src/utils/parse-metadata";

describe("parseMetadata", () => {
  test("returns empty object for null", () => {
    expect(parseMetadata(null)).toEqual({});
  });

  test("returns empty object for undefined", () => {
    expect(parseMetadata(undefined)).toEqual({});
  });

  test("returns the object as-is when already an object", () => {
    const obj = { key: "value" };
    expect(parseMetadata(obj)).toEqual(obj);
  });

  test("parses valid JSON string", () => {
    expect(parseMetadata('{"key":"value"}')).toEqual({ key: "value" });
  });

  test("returns empty object for malformed JSON", () => {
    expect(parseMetadata("{not valid json")).toEqual({});
  });

  test("returns empty object for JSON array string", () => {
    expect(parseMetadata("[1,2,3]")).toEqual({});
  });

  test("returns empty object for JSON primitive string", () => {
    expect(parseMetadata('"just a string"')).toEqual({});
    expect(parseMetadata("42")).toEqual({});
    expect(parseMetadata("true")).toEqual({});
  });

  test("returns empty object for array input", () => {
    expect(parseMetadata([1, 2, 3])).toEqual({});
  });

  test("returns empty object for numeric input", () => {
    expect(parseMetadata(42)).toEqual({});
  });

  test("handles nested JSON objects", () => {
    const input = '{"user":{"name":"test"},"count":5}';
    expect(parseMetadata(input)).toEqual({ user: { name: "test" }, count: 5 });
  });

  test("handles empty JSON object string", () => {
    expect(parseMetadata("{}")).toEqual({});
  });
});
