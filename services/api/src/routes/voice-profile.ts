import type { FastifyInstance } from "fastify";
import type { VoiceProfile } from "@prosepilot/writing-core";
import { createEmptyProfile, analyzeText, mergeAnalyses, getProfileSummary } from "@prosepilot/writing-core";

// Single in-memory profile — no per-user storage, no user identification
const LOCAL_PROFILE_KEY = "local";
let localProfile: VoiceProfile | null = null;

// Export for use by other routes (grammar check, document check)
export function getProfile(): VoiceProfile | undefined {
  return localProfile ?? undefined;
}

export async function voiceProfileRoutes(app: FastifyInstance) {
  // GET /v1/voice-profile — Get voice profile
  app.get("/v1/voice-profile", async (_request, reply) => {
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

    // Get existing profile or create new one
    if (!localProfile) {
      localProfile = createEmptyProfile(LOCAL_PROFILE_KEY, name || "My Voice");
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
    return reply.send({ message: "Voice profile deleted" });
  });
}
