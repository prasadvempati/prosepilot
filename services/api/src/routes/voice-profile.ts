import type { FastifyInstance } from "fastify";
import type { VoiceProfile } from "@prosepilot/writing-core";
import { createEmptyProfile, analyzeText, mergeAnalyses, getProfileSummary } from "@prosepilot/writing-core";
import { db } from "../db/index.js";
import { voiceProfiles } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { verifyRequest } from "../middleware/auth.js";

// Per-user profile cache — keyed by userId
const profileCache = new Map<string, { profile: VoiceProfile | null; loaded: boolean }>();

function getCacheEntry(userId: string) {
  let entry = profileCache.get(userId);
  if (!entry) {
    entry = { profile: null, loaded: false };
    profileCache.set(userId, entry);
  }
  return entry;
}

// Load profile from database for a specific user
async function ensureLoaded(userId: string): Promise<void> {
  const entry = getCacheEntry(userId);
  if (entry.loaded) return;
  try {
    const rows = await db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId)).limit(1);
    if (rows.length > 0) {
      entry.profile = rows[0].profileData as unknown as VoiceProfile;
      entry.profile!.id = rows[0].id;
      entry.profile!.sampleCount = rows[0].sampleCount ?? 0;
    }
  } catch {
    // Table may not exist yet — fall through to in-memory
  }
  entry.loaded = true;
}

// Export for use by other routes (grammar check, document check)
export async function getProfile(userId: string): Promise<VoiceProfile | undefined> {
  await ensureLoaded(userId);
  return getCacheEntry(userId).profile ?? undefined;
}

// Sync version for backwards compatibility — returns cached value only
export function getProfileSync(userId: string): VoiceProfile | undefined {
  return getCacheEntry(userId).profile ?? undefined;
}

async function saveProfile(userId: string, profile: VoiceProfile): Promise<void> {
  try {
    const existing = await db.select().from(voiceProfiles).where(eq(voiceProfiles.userId, userId)).limit(1);
    if (existing.length > 0) {
      await db.update(voiceProfiles).set({
        profileData: profile as any,
        sampleCount: profile.sampleCount,
        name: profile.name,
        updatedAt: new Date(),
      }).where(eq(voiceProfiles.userId, userId));
    } else {
      await db.insert(voiceProfiles).values({
        userId,
        name: profile.name,
        profileData: profile as any,
        sampleCount: profile.sampleCount,
      });
    }
  } catch {
    // Database save failed — profile still works in-memory for this session
  }
}

export async function voiceProfileRoutes(app: FastifyInstance) {
  // GET /v1/voice-profile — Get voice profile
  app.get("/v1/voice-profile", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId || "anonymous";
    await ensureLoaded(userId);
    const profile = getCacheEntry(userId).profile;
    if (!profile) {
      return reply.send({ profile: null, summary: null });
    }

    return reply.send({
      profile,
      summary: getProfileSummary(profile),
    });
  });

  // POST /v1/voice-profile — Create or update voice profile from text samples
  app.post("/v1/voice-profile", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId || "anonymous";
    const { text, name } = request.body as {
      text: string;
      name?: string;
    };

    if (!text || text.trim().length < 50) {
      return reply.status(400).send({
        error: "INSUFFICIENT_TEXT",
        message: "Provide at least 50 characters of text to build a voice profile",
      });
    }

    await ensureLoaded(userId);
    const entry = getCacheEntry(userId);

    // Get existing profile or create new one
    if (!entry.profile) {
      entry.profile = createEmptyProfile(userId, name || "My Voice");
    }

    // Analyze the new text
    const analysis = analyzeText(text);

    // Merge with existing profile
    const merged = mergeAnalyses(entry.profile, analysis, entry.profile.sampleCount);

    // Update profile
    entry.profile = {
      ...entry.profile,
      ...merged,
      sampleCount: entry.profile.sampleCount + 1,
      updatedAt: new Date().toISOString(),
      ...(name ? { name } : {}),
    };

    // Persist to database
    await saveProfile(userId, entry.profile);

    return reply.send({
      profile: entry.profile,
      summary: getProfileSummary(entry.profile),
      message: `Voice profile updated from ${entry.profile.sampleCount} sample(s)`,
    });
  });

  // POST /v1/voice-profile/analyze — Analyze text without saving (preview)
  app.post("/v1/voice-profile/analyze", { preHandler: [verifyRequest] }, async (request, reply) => {
    const { text } = request.body as { text: string };

    if (!text || text.trim().length < 20) {
      return reply.status(400).send({
        error: "INSUFFICIENT_TEXT",
        message: "Provide at least 20 characters to analyze",
      });
    }

    const analysis = analyzeText(text);
    return reply.send({ analysis });
  });

  // DELETE /v1/voice-profile — Reset voice profile
  app.delete("/v1/voice-profile", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId || "anonymous";
    profileCache.delete(userId);
    try {
      await db.delete(voiceProfiles).where(eq(voiceProfiles.userId, userId));
    } catch {
      // Ignore — profile cleared from memory
    }
    return reply.send({ message: "Voice profile deleted" });
  });
}
