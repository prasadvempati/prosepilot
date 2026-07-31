import type { FastifyInstance } from "fastify";
import { sql, eq } from "drizzle-orm";
import { checkGrammar, rewriteText, validateFactsEndpoint } from "../engine/grammar.js";
import { db } from "../db/index.js";
import { users, usageEvents } from "../db/schema.js";
import { getProfile } from "./voice-profile.js";
import { verifyRequest } from "../middleware/auth.js";

export async function checkRoutes(app: FastifyInstance) {
  // POST /v1/check - Grammar, spelling, punctuation, clarity, style issues
  app.post("/v1/check", { preHandler: [verifyRequest] }, async (request, reply) => {
    const { text, mode = "review", language = "en-US", documentType = "general" } = request.body as any;

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
      const userId = (request as any).auth?.userId || "anonymous";

      // Usage limit enforcement
      const userRows = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      const CHAR_LIMIT = userRows.length > 0 ? 100000 : 10000;

      const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const usageResult = await db
        .select({ totalChars: sql<number>`coalesce(sum(${usageEvents.characterCount}), 0)` })
        .from(usageEvents)
        .where(
          userRows.length > 0
            ? sql`${usageEvents.actorId} = ${userRows[0].id} AND ${usageEvents.createdAt} >= ${periodStart}`
            : sql`${usageEvents.actorId} IS NULL AND ${usageEvents.createdAt} >= ${periodStart}`
        );

      const charsUsed = usageResult[0]?.totalChars || 0;
      if (charsUsed + text.length > CHAR_LIMIT) {
        return reply.status(429).send({
          error: "USAGE_LIMIT_EXCEEDED",
          message: `Monthly character limit reached. Used ${charsUsed.toLocaleString()} of ${CHAR_LIMIT.toLocaleString()} characters.`,
          charactersUsed: charsUsed,
          charactersLimit: CHAR_LIMIT,
        });
      }

      // Use local voice profile if available
      const voiceProfile = await getProfile(userId);

      const result = await checkGrammar({ text, mode, language, documentType, voiceProfile });

      // Record usage (fire-and-forget — don't block the response)
      try {
        const userRows = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
        if (userRows.length > 0) {
          await db.insert(usageEvents).values({
            actorId: userRows[0].id,
            feature: "check",
            characterCount: text.length,
            latencyMs: result.usage?.latencyMs || 0,
          });
        }
      } catch {
        // Usage recording is best-effort — don't fail the request
      }

      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Check failed" });
    }
  });

  // POST /v1/rewrite - Rewrite selected text with tone control
  app.post("/v1/rewrite", { preHandler: [verifyRequest] }, async (request, reply) => {
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
      const userId = (request as any).auth?.userId || "anonymous";

      // Usage limit enforcement
      const userRows = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      const CHAR_LIMIT = userRows.length > 0 ? 100000 : 10000;

      const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const usageResult = await db
        .select({ totalChars: sql<number>`coalesce(sum(${usageEvents.characterCount}), 0)` })
        .from(usageEvents)
        .where(
          userRows.length > 0
            ? sql`${usageEvents.actorId} = ${userRows[0].id} AND ${usageEvents.createdAt} >= ${periodStart}`
            : sql`${usageEvents.actorId} IS NULL AND ${usageEvents.createdAt} >= ${periodStart}`
        );

      const charsUsed = usageResult[0]?.totalChars || 0;
      if (charsUsed + text.length > CHAR_LIMIT) {
        return reply.status(429).send({
          error: "USAGE_LIMIT_EXCEEDED",
          message: `Monthly character limit reached. Used ${charsUsed.toLocaleString()} of ${CHAR_LIMIT.toLocaleString()} characters.`,
          charactersUsed: charsUsed,
          charactersLimit: CHAR_LIMIT,
        });
      }

      const result = await rewriteText({ text, tone, customInstruction, length, language });

      // Record usage (fire-and-forget — don't block the response)
      try {
        const userRows = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
        if (userRows.length > 0) {
          await db.insert(usageEvents).values({
            actorId: userRows[0].id,
            feature: "rewrite",
            characterCount: text.length,
            latencyMs: result.usage?.latencyMs || 0,
          });
        }
      } catch {
        // Usage recording is best-effort — don't fail the request
      }

      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Rewrite failed" });
    }
  });

  // POST /v1/facts/validate - Compare protected facts
  app.post("/v1/facts/validate", { preHandler: [verifyRequest] }, async (request, reply) => {
    const { original, rewritten } = request.body as any;

    if (!original || !rewritten) {
      return reply.status(400).send({ error: "BOTH_REQUIRED", message: "Both original and rewritten text are required" });
    }

    try {
      const userId = (request as any).auth?.userId || "anonymous";
      const result = await validateFactsEndpoint(original, rewritten);
      return reply.send(result);
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Fact validation failed" });
    }
  });
}
