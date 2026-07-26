import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { checkRoutes } from "./routes/check.js";
import { healthRoutes } from "./routes/health.js";
import { usageRoutes } from "./routes/usage.js";

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

// --- Routes ---

await app.register(healthRoutes);
await app.register(checkRoutes);
await app.register(usageRoutes);

// --- Root ---

app.get("/", async () => ({
  name: "ProsePilot API",
  version: "0.1.0",
  docs: "/docs",
}));

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
