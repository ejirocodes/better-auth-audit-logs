import { mergeSchema } from "better-auth/db";
import type { AuditLogOptions } from "./types";

export const baseSchema = {
  auditLog: {
    modelName: "auditLog",
    fields: {
      userId: {
        type: "string" as const,
        required: false,
        references: {
          model: "user",
          field: "id",
          onDelete: "set null" as const,
        },
        index: true,
      },
      action: {
        type: "string" as const,
        required: true,
        sortable: true,
        index: true,
      },
      status: {
        type: "string" as const,
        required: true,
        sortable: true,
      },
      severity: {
        type: "string" as const,
        required: true,
        sortable: true,
      },
      ipAddress: {
        type: "string" as const,
        required: false,
      },
      userAgent: {
        type: "string" as const,
        required: false,
        returned: false,
      },
      metadata: {
        type: "string" as const,
        required: false,
      },
      createdAt: {
        type: "date" as const,
        required: true,
        sortable: true,
        index: true,
        defaultValue: () => new Date(),
      },
    },
  },
};

export function buildSchema(options?: AuditLogOptions) {
  return mergeSchema(baseSchema, options?.schema);
}

export function getModelName(options?: AuditLogOptions): string {
  return options?.schema?.auditLog?.modelName ?? "auditLog";
}

const CRITICAL_FIELDS = ["userId", "action", "status", "severity", "metadata", "createdAt"] as const;

export function validateSchema(
  schema: ReturnType<typeof buildSchema>,
): void {
  const model = schema.auditLog;
  if (!model) {
    throw new Error("[audit-log] Schema must define an auditLog model");
  }

  const fields = model.fields;
  if (!fields || typeof fields !== "object") {
    throw new Error("[audit-log] Schema auditLog model must have fields");
  }

  for (const field of CRITICAL_FIELDS) {
    if (!(field in fields)) {
      throw new Error(
        `[audit-log] Schema missing critical field: ${field}`,
      );
    }
  }
}
