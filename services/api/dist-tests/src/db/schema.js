"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voiceProfiles = exports.feedbackEvents = exports.usageEvents = exports.preferences = exports.memberships = exports.organizations = exports.users = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    clerkId: (0, pg_core_1.varchar)("clerk_id", { length: 255 }).notNull().unique(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull(),
    displayName: (0, pg_core_1.varchar)("display_name", { length: 255 }),
    locale: (0, pg_core_1.varchar)("locale", { length: 10 }).default("en-US"),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).default("active"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at"),
});
exports.organizations = (0, pg_core_1.pgTable)("organizations", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    plan: (0, pg_core_1.varchar)("plan", { length: 20 }).default("free"),
    stripeCustomerId: (0, pg_core_1.varchar)("stripe_customer_id", { length: 255 }),
    stripeSubscriptionId: (0, pg_core_1.varchar)("stripe_subscription_id", { length: 255 }),
    dataRegion: (0, pg_core_1.varchar)("data_region", { length: 50 }).default("us"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.memberships = (0, pg_core_1.pgTable)("memberships", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.uuid)("organization_id").references(function () { return exports.organizations.id; }),
    userId: (0, pg_core_1.uuid)("user_id").references(function () { return exports.users.id; }),
    role: (0, pg_core_1.varchar)("role", { length: 20 }).default("member"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.preferences = (0, pg_core_1.pgTable)("preferences", {
    userId: (0, pg_core_1.uuid)("user_id").primaryKey().references(function () { return exports.users.id; }),
    defaultMode: (0, pg_core_1.varchar)("default_mode", { length: 20 }).default("review"),
    defaultTone: (0, pg_core_1.varchar)("default_tone", { length: 30 }).default("professional"),
    language: (0, pg_core_1.varchar)("language", { length: 10 }).default("en-US"),
    autoRules: (0, pg_core_1.jsonb)("auto_rules").$type().default([]),
    customTerminology: (0, pg_core_1.jsonb)("custom_terminology").$type().default([]),
});
exports.usageEvents = (0, pg_core_1.pgTable)("usage_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    actorId: (0, pg_core_1.uuid)("actor_id").references(function () { return exports.users.id; }),
    feature: (0, pg_core_1.varchar)("feature", { length: 50 }).notNull(),
    characterCount: (0, pg_core_1.integer)("character_count").notNull(),
    latencyMs: (0, pg_core_1.integer)("latency_ms"),
    status: (0, pg_core_1.varchar)("status", { length: 20 }).default("success"),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.feedbackEvents = (0, pg_core_1.pgTable)("feedback_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)("user_id").references(function () { return exports.users.id; }),
    issueCategory: (0, pg_core_1.varchar)("issue_category", { length: 30 }),
    issueRule: (0, pg_core_1.varchar)("issue_rule", { length: 100 }),
    action: (0, pg_core_1.varchar)("action", { length: 20 }).notNull(), // "accepted" | "dismissed"
    client: (0, pg_core_1.varchar)("client", { length: 50 }), // "web" | "extension" | "word" | "outlook"
    modelVersion: (0, pg_core_1.varchar)("model_version", { length: 50 }),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
});
exports.voiceProfiles = (0, pg_core_1.pgTable)("voice_profiles", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    userId: (0, pg_core_1.varchar)("user_id", { length: 255 }).notNull().unique(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).default("My Voice"),
    profileData: (0, pg_core_1.jsonb)("profile_data").notNull(), // Full VoiceProfile stats (no raw text)
    sampleCount: (0, pg_core_1.integer)("sample_count").default(0),
    createdAt: (0, pg_core_1.timestamp)("created_at").defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow().notNull(),
});
