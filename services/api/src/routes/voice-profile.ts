import type { FastifyInstance } from "fastify";
import type { VoiceProfile } from "@prosepilot/writing-core";
import { createEmptyProfile, analyzeText, mergeAnalyses, getProfileSummary } from "@prosepilot/writing-core";

// In-memory store (keyed by userId)
const profiles = new Map<string, VoiceProfile>();

export async function voiceProfileRoutes(app: FastifyInstance) {
  // GET /v1/voice-profile — Get user's voice profile
  app.get("/v1/voice-profile", async (request, reply) => {
    const userId = (request.query as any)?.userId || "default";
    const profile = profiles.get(userId);

    if (!profile) {
      return reply.send({ profile: null, summary: null });
    }

    return reply.send({
      profile,
      summary: getProfileSummary(profile),
    });
  });

  // POST /v1/voice-profile — Create or update voice profile from text samples
  app.post("/v1/voice-profile", async (request, reply) => {
    const { userId = "default", text, name } = request.body as {
      userId?: string;
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
    let profile = profiles.get(userId);
    if (!profile) {
      profile = createEmptyProfile(userId, name || "My Voice");
    }

    // Analyze the new text
    const analysis = analyzeText(text);

    // Merge with existing profile
    const merged = mergeAnalyses(profile, analysis, profile.sampleCount);

    // Update profile
    profile = {
      ...profile,
      ...merged,
      sampleCount: profile.sampleCount + 1,
      updatedAt: new Date().toISOString(),
      ...(name ? { name } : {}),
    };

    profiles.set(userId, profile);

    return reply.send({
      profile,
      summary: getProfileSummary(profile),
      message: `Voice profile updated from ${profile.sampleCount} sample(s)`,
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
  app.delete("/v1/voice-profile", async (request, reply) => {
    const userId = (request.body as any)?.userId || "default";
    profiles.delete(userId);
    return reply.send({ message: "Voice profile deleted" });
  });
}
