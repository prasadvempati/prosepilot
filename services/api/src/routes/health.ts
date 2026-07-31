import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health/live", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/health/ready", async () => {
    // TODO: Check database connectivity, DeepSeek API
    return { status: "ok", timestamp: new Date().toISOString() };
  });
}
