import { describe, test, expect } from "bun:test";
import { buildSchema, validateSchema } from "../src/schema";

describe("validateSchema", () => {
  test("accepts valid default schema", () => {
    const schema = buildSchema();
    expect(() => validateSchema(schema)).not.toThrow();
  });

  test("accepts schema with custom model name", () => {
    const schema = buildSchema({ schema: { auditLog: { modelName: "events" } } });
    expect(() => validateSchema(schema)).not.toThrow();
  });

  test("throws if critical field is missing", () => {
    const schema = buildSchema();
    // Deep clone to avoid mutating shared baseSchema
    const cloned = {
      ...schema,
      auditLog: {
        ...schema.auditLog,
        fields: { ...schema.auditLog.fields },
      },
    };
    delete (cloned.auditLog.fields as Record<string, unknown>)["action"];
    expect(() => validateSchema(cloned)).toThrow("missing critical field: action");
  });

  test("throws if fields object is missing", () => {
    const schema = buildSchema();
    const cloned = {
      ...schema,
      auditLog: { ...schema.auditLog, fields: undefined },
    };
    expect(() => validateSchema(cloned as any)).toThrow("must have fields");
  });
});
