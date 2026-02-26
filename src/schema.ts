import { mergeSchema } from "better-auth/db";
import type { AuditLogOptions } from "./types";

export const baseSchema = {
  auditLog: {
    modelName: "audit_log",
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
  return options?.schema?.auditLog?.modelName ?? "audit_log";
}
