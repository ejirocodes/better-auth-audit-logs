import { mergeSchema } from "better-auth/db";
import type { AuditLogOptions } from "./types";

export const DEFAULT_MODEL_NAME = "auditLog";

export const baseSchema = {
  auditLog: {
    modelName: DEFAULT_MODEL_NAME,
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

const chainFields = {
  hash: {
    type: "string" as const,
    required: false,
  },
  previousHash: {
    type: "string" as const,
    required: false,
  },
};

export function buildSchema(options?: AuditLogOptions) {
  const base = options?.tamperDetection?.enabled
    ? {
        auditLog: {
          ...baseSchema.auditLog,
          fields: { ...baseSchema.auditLog.fields, ...chainFields },
        },
      }
    : baseSchema;

  return mergeSchema(base, options?.schema);
}

export function getModelName(options?: AuditLogOptions): string {
  return options?.schema?.auditLog?.modelName ?? DEFAULT_MODEL_NAME;
}

const CRITICAL_FIELDS = ["userId", "action", "status", "severity", "metadata", "createdAt"] as const;

export function validateSchema(
  schema: ReturnType<typeof buildSchema>,
  options?: AuditLogOptions,
): void {
  const model = schema.auditLog;
  if (!model) {
    throw new Error("[audit-log] Schema must define an auditLog model");
  }

  const fields = model.fields;
  if (!fields || typeof fields !== "object") {
    throw new Error("[audit-log] Schema auditLog model must have fields");
  }

  const required = options?.tamperDetection?.enabled
    ? [...CRITICAL_FIELDS, ...Object.keys(chainFields)]
    : CRITICAL_FIELDS;

  for (const field of required) {
    if (!(field in fields)) {
      throw new Error(
        `[audit-log] Schema missing critical field: ${field}`,
      );
    }
  }
}
