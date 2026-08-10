import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import fastifyRawBody from "fastify-raw-body";
import { checkRoutes } from "./routes/check.js";
import { healthRoutes } from "./routes/health.js";
import { usageRoutes } from "./routes/usage.js";
import { billingRoutes } from "./routes/billing.js";
import { documentRoutes } from "./routes/documents.js";
import { voiceProfileRoutes } from "./routes/voice-profile.js";
import { clerkWebhookRoutes } from "./routes/clerk-webhook.js";
import { warmUpLocalModel } from "./engine/localGrammarModel.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

process.on("uncaughtException", () => {
  // Don't exit — keep serving other requests
  // Don't log error details — they may contain user text
});
process.on("unhandledRejection", () => {
  // Don't exit — keep serving other requests
  // Don't log error details — they may contain user text
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "warn" : "warn",
    // Never log request/response bodies — user text must not appear in logs
    serializers: {
      req(req) {
        return { method: req.method, url: req.url };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  },
});

// --- Plugins ---

await app.register(cors, {
  origin:
    process.env.NODE_ENV === "production"
      ? (origin, cb) => {
          // No Origin header at all (e.g. a server-to-server call, or some extension
          // background-script fetches) — nothing to check against, allow it through.
          if (!origin) return cb(null, true);

          if (origin === "https://prosepilot.io" || origin === "https://www.prosepilot.io") {
            return cb(null, true);
          }

          // Both Chrome Web Store and Edge Add-ons extensions run on Chromium and use the
          // same "chrome-extension://<id>" origin scheme — but the two stores assign
          // *different* IDs to the same codebase, so a single hardcoded ID (the previous
          // approach, gated behind an unset CORS_EXTENSION_ID env var) could never cover
          // both at once, and in practice covered neither since the variable was never set.
          // Any chrome-extension:// origin is already sandboxed and permission-gated by the
          // browser's own extension model, so allowing the scheme generically (rather than
          // pinning to one store's ID) is safe and store-agnostic.
          if (/^chrome-extension:\/\//.test(origin)) {
            return cb(null, true);
          }

          cb(new Error("Not allowed by CORS"), false);
        }
      : true,
  credentials: true,
});

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

await app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

await app.register(fastifyRawBody, {
  field: "rawBody",
  global: false,
  runFirst: true,
});

// --- API Routes ---

await app.register(healthRoutes);
await app.register(checkRoutes);
await app.register(usageRoutes);
await app.register(billingRoutes);
await app.register(documentRoutes);
await app.register(voiceProfileRoutes);
await app.register(clerkWebhookRoutes);

// --- Serve Frontend & SPA Fallback ---

const webDistPath = join(__dirname, "../../../apps/web/dist");
if (existsSync(webDistPath)) {
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: "/",
    decorateReply: true,
    maxAge: 0,
    etag: false,
    lastModified: false,
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/v1/") || req.url.startsWith("/health") || req.url.startsWith("/webhooks/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
    return reply.sendFile("index.html");
  });
}

// --- Start ---

const port = parseInt(process.env.PORT || "8080", 10);
const host = "0.0.0.0";

try {
  await app.listen({ port, host });
  // Warm up the local grammar model in the background so the ~30-45s first-load cost
  // happens once at boot, not on some unlucky user's first request. Deliberately not
  // awaited — the server should start accepting traffic immediately either way, and
  // checkWithLocalModel() already fails safe (returns []) if the model isn't ready yet.
  warmUpLocalModel();
} catch (err) {
  process.exit(1);
}
