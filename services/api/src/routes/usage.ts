import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { users, usageEvents } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { verifyRequest } from "../middleware/auth.js";

const DEFAULT_CHARACTERS_LIMIT = 100_000;
const DEFAULT_REQUESTS_LIMIT = 1_000;
const BILLING_PERIOD_DAYS = 30;

export async function usageRoutes(app: FastifyInstance) {
  app.get("/v1/usage", { preHandler: [verifyRequest] }, async (request, reply) => {
    const clerkId = request.auth?.userId;
    if (!clerkId) {
      return reply.status(401).send({ error: "UNAUTHORIZED", message: "User not authenticated" });
    }

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    const userId = user?.id;

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - BILLING_PERIOD_DAYS);

    const events = userId
      ? await db
          .select({
            feature: usageEvents.feature,
            characterCount: usageEvents.characterCount,
          })
          .from(usageEvents)
          .where(
            sql`${usageEvents.actorId} = ${userId} AND ${usageEvents.createdAt} >= ${periodStart}`
          )
      : [];

    let charactersUsed = 0;
    let requestsUsed = 0;

    for (const event of events) {
      charactersUsed += event.characterCount;
      requestsUsed += 1;
    }

    const resetDate = new Date();
    resetDate.setDate(resetDate.getDate() + BILLING_PERIOD_DAYS);

    return {
      charactersUsed,
      charactersLimit: DEFAULT_CHARACTERS_LIMIT,
      requestsUsed,
      requestsLimit: DEFAULT_REQUESTS_LIMIT,
      resetDate: resetDate.toISOString(),
    };
  });
}
