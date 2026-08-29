import type { RetentionSweep } from "./retention";
import type { AppendToChain } from "./tamper";

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
  /** Chain signature over this entry. Present only with tamper detection on. */
  hash?: string | null;
  /** Signature of the entry written before this one in the same chain. */
  previousHash?: string | null;
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

export interface ChainReadOptions {
  /** Omitted reads every chain; `null` reads the chain of entries with no user. */
  userId?: string | null;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface AuditLogStorage {
  write(entry: AuditLogEntry): Promise<void>;
  read?(options: StorageReadOptions): Promise<StorageReadResult>;
  readById?(id: string): Promise<AuditLogEntry | null>;
  deleteOlderThan?(date: Date): Promise<number>;
  /** Required by tamper detection. Must return entries newest first. */
  readChain?(options: ChainReadOptions): Promise<AuditLogEntry[]>;
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
  /** Minimum gap between automatic cleanup sweeps. Defaults to 24 hours. */
  intervalMs?: number;
}

export type TamperDetectionScope = "user" | "global";

export interface TamperDetectionConfig {
  enabled: boolean;
  /** One chain per user (default), or a single chain across every entry. */
  scope?: TamperDetectionScope;
  /** Defaults to a key derived from Better Auth's `secret`. */
  secret?: string;
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
  tamperDetection?: TamperDetectionConfig;
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

export interface ResolvedTamperDetection {
  scope: TamperDetectionScope;
  secret: string | undefined;
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
  sweepRetention: RetentionSweep | undefined;
  appendToChain: AppendToChain | undefined;
  metadataLimits: ResolvedMetadataLimits | false;
  beforePaths: readonly string[];
  beforeLog: AuditLogOptions["beforeLog"];
  afterLog: AuditLogOptions["afterLog"];
  onWriteError: AuditLogOptions["onWriteError"];
  shouldCapture: (path: string) => boolean;
  getPathConfig: (path: string) => PathConfig | undefined;
}
