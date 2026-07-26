// Core types for ProsePilot grammar engine

export type IssueCategory =
  | "grammar"
  | "spelling"
  | "punctuation"
  | "clarity"
  | "style"
  | "tone"
  | "conciseness";

export type IssueSeverity = "error" | "warning" | "info" | "suggestion";

export type CheckMode = "review" | "safe-auto" | "rewrite" | "report";

export type RewriteTone =
  | "professional"
  | "executive"
  | "concise"
  | "diplomatic"
  | "formal"
  | "affirmative"
  | "friendly"
  | "confident"
  | "empathetic"
  | "persuasive"
  | "casual"
  | "firm"
  | "custom";

export interface GrammarIssue {
  id: string;
  category: IssueCategory;
  rule: string;
  startUtf16: number;
  endUtf16: number;
  original: string;
  replacement: string;
  confidence: number;
  safeAuto: boolean;
  severity: IssueSeverity;
  explanation: string;
  sourceHash: string;
}

export interface CheckRequest {
  text: string;
  mode: CheckMode;
  language?: string;
  documentType?: "email" | "report" | "general";
  preferences?: UserPreferences;
}

export interface CheckResponse {
  issues: GrammarIssue[];
  updatedHash: string;
  usage: UsageMetadata;
}

export interface RewriteRequest {
  text: string;
  tone: RewriteTone;
  customInstruction?: string;
  length?: "shorter" | "same" | "longer";
  language?: string;
}

export interface RewriteResult {
  original: string;
  rewritten: string;
  tone: RewriteTone;
  factsProtected: ProtectedFact[];
  factMismatch: boolean;
  meaningSimilarity: number;
  alternatives?: string[];
}

export interface RewriteResponse {
  result: RewriteResult;
  usage: UsageMetadata;
}

export interface ProtectedFact {
  type: "name" | "date" | "currency" | "percentage" | "unit" | "url" | "email" | "id" | "address" | "phone";
  value: string;
  startIndex: number;
  endIndex: number;
}

export interface FactsValidateRequest {
  original: string;
  rewritten: string;
}

export interface FactsValidateResponse {
  match: boolean;
  missingFacts: ProtectedFact[];
  changedFacts: Array<{ original: ProtectedFact; rewritten: ProtectedFact }>;
}

export interface UserPreferences {
  defaultMode: CheckMode;
  defaultTone: RewriteTone;
  language: string;
  autoRules: AutoRule[];
  customTerminology: string[];
}

export interface AutoRule {
  category: IssueCategory;
  enabled: boolean;
  minConfidence: number;
}

export interface UsageMetadata {
  characterCount: number;
  issueCount: number;
  checkMode: CheckMode;
  latencyMs: number;
  engineTier: "lt" | "deepseek-flash" | "deepseek-pro" | "deepseek" | "rule";
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  status: "active" | "suspended" | "deleted";
  createdAt: Date;
  deletedAt?: Date;
}

export interface Organization {
  id: string;
  name: string;
  plan: "free" | "pro" | "team" | "enterprise";
  dataRegion: string;
  retentionPolicy: string;
  createdAt: Date;
}

export interface Membership {
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "member";
}

export interface Subscription {
  id: string;
  userId?: string;
  organizationId?: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: "free" | "pro" | "team" | "enterprise";
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: Date;
}

export interface UsageEvent {
  id: string;
  actorId: string;
  feature: string;
  characterCount: number;
  latencyMs: number;
  status: "success" | "error";
  createdAt: Date;
}
