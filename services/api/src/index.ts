import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { checkRoutes } from "./routes/check.js";
import { healthRoutes } from "./routes/health.js";
import { usageRoutes } from "./routes/usage.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// --- Plugins ---

await app.register(cors, {
  origin: process.env.NODE_ENV === "production"
    ? ["https://prosepilot.io", "https://www.prosepilot.io"]
    : true,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// --- API Routes ---

await app.register(healthRoutes);
await app.register(checkRoutes);
await app.register(usageRoutes);

// --- Serve Frontend & SPA Fallback ---

const webDistPath = join(__dirname, "../../../apps/web/dist");
if (existsSync(webDistPath)) {
  // Serve static assets (JS, CSS, images) with long cache
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/assets/",
    decorateReply: true,
  });

  // Serve index.html with no-cache to prevent stale bundles
  app.get("/", async (_req, reply) => {
    return reply
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .sendFile("index.html");
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/v1/") || req.url.startsWith("/health")) {
      return reply.code(404).send({ error: "Not found" });
    }
    // SPA: serve index.html for all non-API, non-asset routes
    return reply
      .header("Cache-Control", "no-cache, no-store, must-revalidate")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .sendFile("index.html");
  });
}

// --- Start ---

const port = parseInt(process.env.PORT || "3001", 10);
const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";

try {
  await app.listen({ port, host });
  console.log(`ProsePilot API running on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
