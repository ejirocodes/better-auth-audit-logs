export type AuditLogStatus = "success" | "failed";
export type AuditLogSeverity = "low" | "medium" | "high" | "critical";
export type PIIStrategy = "mask" | "hash" | "remove";

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  status: AuditLogStatus;
  severity: AuditLogSeverity;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface StorageReadOptions {
  userId?: string;
  action?: string;
  status?: AuditLogStatus;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface StorageReadResult {
  entries: AuditLogEntry[];
  total: number;
}

export interface AuditLogStorage {
  write(entry: AuditLogEntry): Promise<void>;
  read?(options: StorageReadOptions): Promise<StorageReadResult>;
  readById?(id: string): Promise<AuditLogEntry | null>;
  deleteOlderThan?(date: Date): Promise<number>;
}

export interface PIIRedactionOptions {
  enabled: boolean;
  fields?: string[];
  strategy?: PIIStrategy;
}

export interface CaptureOptions {
  ipAddress?: boolean;
  userAgent?: boolean;
  requestBody?: boolean;
}

export interface PathConfig {
  severity?: AuditLogSeverity;
  capture?: CaptureOptions;
}

export interface RetentionConfig {
  enabled: boolean;
  days: number;
}

export interface MetadataLimitsConfig {
  maxBytes?: number;
  maxDepth?: number;
}

export interface AuditLogOptions {
  enabled?: boolean;
  nonBlocking?: boolean;
  storage?: AuditLogStorage;
  paths?: (string | { path: string; config?: PathConfig })[];
  beforePaths?: string[];
  piiRedaction?: PIIRedactionOptions;
  capture?: CaptureOptions;
  retention?: RetentionConfig;
  metadataLimits?: MetadataLimitsConfig | false;
  schema?: {
    auditLog?: {
      modelName?: string;
      fields?: Record<string, string>;
    };
  };
  beforeLog?: (
    entry: Omit<AuditLogEntry, "id">,
  ) => Promise<Omit<AuditLogEntry, "id"> | null>;
  afterLog?: (entry: AuditLogEntry) => Promise<void>;
  onWriteError?: (error: unknown, entry: Omit<AuditLogEntry, "id">) => void;
}

export interface ResolvedMetadataLimits {
  maxBytes: number;
  maxDepth: number;
}

export interface ResolvedOptions {
  enabled: boolean;
  nonBlocking: boolean;
  storage: AuditLogStorage | undefined;
  capture: Required<CaptureOptions>;
  piiRedaction: { enabled: boolean; fields?: string[]; strategy: PIIStrategy };
  retention: RetentionConfig | undefined;
  metadataLimits: ResolvedMetadataLimits | false;
  beforePaths: readonly string[];
  beforeLog: AuditLogOptions["beforeLog"];
  afterLog: AuditLogOptions["afterLog"];
  onWriteError: AuditLogOptions["onWriteError"];
  shouldCapture: (path: string) => boolean;
  getPathConfig: (path: string) => PathConfig | undefined;
}
