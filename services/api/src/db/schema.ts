import { pgTable, timestamp, integer, jsonb, varchar, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: varchar("clerk_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  locale: varchar("locale", { length: 10 }).default("en-US"),
  status: varchar("status", { length: 20 }).default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: varchar("plan", { length: 20 }).default("free"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  dataRegion: varchar("data_region", { length: 50 }).default("us"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id),
  userId: uuid("user_id").references(() => users.id),
  role: varchar("role", { length: 20 }).default("member"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const preferences = pgTable("preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  defaultMode: varchar("default_mode", { length: 20 }).default("review"),
  defaultTone: varchar("default_tone", { length: 30 }).default("professional"),
  language: varchar("language", { length: 10 }).default("en-US"),
  autoRules: jsonb("auto_rules").$type<Array<{ category: string; enabled: boolean; minConfidence: number }>>().default([]),
  customTerminology: jsonb("custom_terminology").$type<string[]>().default([]),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id),
  feature: varchar("feature", { length: 50 }).notNull(),
  characterCount: integer("character_count").notNull(),
  latencyMs: integer("latency_ms"),
  status: varchar("status", { length: 20 }).default("success"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const feedbackEvents = pgTable("feedback_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  issueCategory: varchar("issue_category", { length: 30 }),
  issueRule: varchar("issue_rule", { length: 100 }),
  action: varchar("action", { length: 20 }).notNull(), // "accepted" | "dismissed"
  client: varchar("client", { length: 50 }), // "web" | "extension" | "word" | "outlook"
  modelVersion: varchar("model_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const voiceProfiles = pgTable("voice_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: varchar("user_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).default("My Voice"),
  profileData: jsonb("profile_data").notNull(), // Full VoiceProfile stats (no raw text)
  sampleCount: integer("sample_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
