export { computeEntryHash } from "./hash";
export { createAppendToChain, selectHead } from "./chain";
export type { AppendToChain, PersistEntry } from "./chain";
export { verifyAuditLogChain } from "./verify";
export type {
  AuditLogChainFinding,
  AuditLogChainFindingType,
  AuditLogChainReport,
  AuditLogVerificationContext,
  VerifyAuditLogChainOptions,
} from "./verify";
