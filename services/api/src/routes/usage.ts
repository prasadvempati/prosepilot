import type { FastifyInstance } from "fastify";

// Simple usage tracking middleware - returns today's usage for the user
export async function usageRoutes(app: FastifyInstance) {
  // GET /v1/usage - Current quota and usage
  app.get("/v1/usage", async () => {
    // TODO: Get actual user from auth middleware
    // For now, return demo usage
    return {
      plan: "free",
      daily: {
        checksUsed: 0,
        checksLimit: 50,
        rewritesUsed: 0,
        rewritesLimit: 3,
        charactersUsed: 0,
        charactersLimit: 50000,
      },
      monthly: {
        checksUsed: 0,
        checksLimit: 1500,
        charactersUsed: 0,
        charactersLimit: 1500000,
      },
      resetAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
    };
  });
}
