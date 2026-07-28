import type { FastifyInstance } from "fastify";
import { checkGrammar, rewriteText, validateFactsEndpoint } from "../engine/grammar.js";
import { getProfile } from "./voice-profile.js";

export async function checkRoutes(app: FastifyInstance) {
  // POST /v1/check - Grammar, spelling, punctuation, clarity, style issues
  app.post("/v1/check", async (request, reply) => {
    const { text, mode = "review", language = "en-US", documentType = "general", voiceProfileId } = request.body as any;

    if (!text || typeof text !== "string") {
      return reply.status(400).send({ error: "TEXT_REQUIRED", message: "Text field is required" });
    }

    if (text.length > 100000) {
      return reply.status(400).send({ error: "TEXT_TOO_LARGE", message: "Text exceeds 100,000 character limit" });
    }

    if (text.trim().length === 0) {
      return reply.status(400).send({ error: "TEXT_EMPTY", message: "Text cannot be empty" });
    }

    try {
      // Look up voice profile if provided
      const voiceProfile = voiceProfileId ? getProfile(voiceProfileId) : undefined;

      const result = await checkGrammar({ text, mode, language, documentType, voiceProfile });
      return reply.send(result);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Check failed" });
    }
  });

  // POST /v1/rewrite - Rewrite selected text with tone control
  app.post("/v1/rewrite", async (request, reply) => {
    const { text, tone = "professional", customInstruction, length = "same", language = "en-US" } = request.body as any;

    if (!text || typeof text !== "string") {
      return reply.status(400).send({ error: "TEXT_REQUIRED", message: "Text field is required" });
    }

    if (text.length > 50000) {
      return reply.status(400).send({ error: "TEXT_TOO_LARGE", message: "Text exceeds 50,000 character limit for rewrite" });
    }

    const validTones = ["professional", "executive", "concise", "diplomatic", "formal", "affirmative", "friendly", "confident", "empathetic", "persuasive", "casual", "firm", "custom"];
    if (!validTones.includes(tone)) {
      return reply.status(400).send({ error: "INVALID_TONE", message: `Invalid tone. Must be one of: ${validTones.join(", ")}` });
    }

    try {
      const result = await rewriteText({ text, tone, customInstruction, length, language });
      return reply.send(result);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Rewrite failed" });
    }
  });

  // POST /v1/facts/validate - Compare protected facts
  app.post("/v1/facts/validate", async (request, reply) => {
    const { original, rewritten } = request.body as any;

    if (!original || !rewritten) {
      return reply.status(400).send({ error: "BOTH_REQUIRED", message: "Both original and rewritten text are required" });
    }

    try {
      const result = await validateFactsEndpoint(original, rewritten);
      return reply.send(result);
    } catch (error) {
      app.log.error(error);
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Fact validation failed" });
    }
  });
}
