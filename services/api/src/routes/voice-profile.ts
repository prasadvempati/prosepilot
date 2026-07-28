import type { FastifyInstance } from "fastify";
import type { VoiceProfile } from "@prosepilot/writing-core";
import { createEmptyProfile, analyzeText, mergeAnalyses, getProfileSummary } from "@prosepilot/writing-core";
import { db } from "../db/index.js";
import { voiceProfiles } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Single profile — cached in memory, persisted to PostgreSQL
const LOCAL_PROFILE_ID = "00000000-0000-0000-0000-000000000001";
let localProfile: VoiceProfile | null = null;
let dbLoaded = false;

// Load profile from database on first access
async function ensureLoaded(): Promise<void> {
  if (dbLoaded) return;
  try {
    const rows = await db.select().from(voiceProfiles).where(eq(voiceProfiles.id, LOCAL_PROFILE_ID)).limit(1);
    if (rows.length > 0) {
      localProfile = rows[0].profileData as unknown as VoiceProfile;
      localProfile!.id = rows[0].id;
      localProfile!.sampleCount = rows[0].sampleCount ?? 0;
    }
  } catch {
    // Table may not exist yet — fall through to in-memory
  }
  dbLoaded = true;
}

// Export for use by other routes (grammar check, document check)
export async function getProfile(): Promise<VoiceProfile | undefined> {
  await ensureLoaded();
  return localProfile ?? undefined;
}

// Sync version for backwards compatibility — returns cached value only
export function getProfileSync(): VoiceProfile | undefined {
  return localProfile ?? undefined;
}

async function saveProfile(profile: VoiceProfile): Promise<void> {
  try {
    const existing = await db.select().from(voiceProfiles).where(eq(voiceProfiles.id, LOCAL_PROFILE_ID)).limit(1);
    if (existing.length > 0) {
      await db.update(voiceProfiles).set({
        profileData: profile as any,
        sampleCount: profile.sampleCount,
        name: profile.name,
        updatedAt: new Date(),
      }).where(eq(voiceProfiles.id, LOCAL_PROFILE_ID));
    } else {
      await db.insert(voiceProfiles).values({
        id: LOCAL_PROFILE_ID as any,
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
  app.get("/v1/voice-profile", async (_request, reply) => {
    await ensureLoaded();
    if (!localProfile) {
      return reply.send({ profile: null, summary: null });
    }

    return reply.send({
      profile: localProfile,
      summary: getProfileSummary(localProfile),
    });
  });

  // POST /v1/voice-profile — Create or update voice profile from text samples
  app.post("/v1/voice-profile", async (request, reply) => {
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

    await ensureLoaded();

    // Get existing profile or create new one
    if (!localProfile) {
      localProfile = createEmptyProfile(LOCAL_PROFILE_ID, name || "My Voice");
    }

    // Analyze the new text
    const analysis = analyzeText(text);

    // Merge with existing profile
    const merged = mergeAnalyses(localProfile, analysis, localProfile.sampleCount);

    // Update profile
    localProfile = {
      ...localProfile,
      ...merged,
      sampleCount: localProfile.sampleCount + 1,
      updatedAt: new Date().toISOString(),
      ...(name ? { name } : {}),
    };

    // Persist to database
    await saveProfile(localProfile);

    return reply.send({
      profile: localProfile,
      summary: getProfileSummary(localProfile),
      message: `Voice profile updated from ${localProfile.sampleCount} sample(s)`,
    });
  });

  // POST /v1/voice-profile/analyze — Analyze text without saving (preview)
  app.post("/v1/voice-profile/analyze", async (request, reply) => {
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
  app.delete("/v1/voice-profile", async (_request, reply) => {
    localProfile = null;
    try {
      await db.delete(voiceProfiles).where(eq(voiceProfiles.id, LOCAL_PROFILE_ID));
    } catch {
      // Ignore — profile cleared from memory
    }
    return reply.send({ message: "Voice profile deleted" });
  });
}
