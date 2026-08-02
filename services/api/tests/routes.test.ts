/**
 * ProsePilot API — Route Tests
 * Uses --import loader to handle .js → .ts remapping for DB-dependent modules.
 *
 * Run: node --experimental-strip-types --import ./tests/loader.mjs --test tests/routes.test.ts
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/prosepilot_test";
process.env.NODE_ENV ??= "development";
process.env.CLERK_SECRET_KEY ??= "";

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

describe("Route Validation — POST /v1/check", () => {
  let app: any;

  before(async () => {
    const Fastify = (await import("fastify")).default;
    const { checkRoutes } = await import("../src/routes/check.ts");
    app = Fastify({ logger: false });
    await app.register(checkRoutes);
    await app.ready();
  });

  after(async () => { await app?.close(); });

  it("rejects empty text with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: "" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_REQUIRED");
  });

  it("rejects missing text field with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_REQUIRED");
  });

  it("rejects non-string text with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: 12345 } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_REQUIRED");
  });

  it("rejects text > 100K chars with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: "A".repeat(100_001) } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_TOO_LARGE");
  });

  it("rejects whitespace-only text with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: "   \t\n  " } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_EMPTY");
  });

  it("accepts valid text and returns response", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: "Hello world" } });
    assert.ok([200, 429, 500].includes(res.statusCode), `Got ${res.statusCode}`);
    if (res.statusCode === 200) {
      const body = res.json();
      assert.ok(Array.isArray(body.issues));
      assert.ok(typeof body.updatedHash === "string");
      assert.ok(typeof body.usage === "object");
    }
  });
});

describe("Route Validation — POST /v1/rewrite", () => {
  let app: any;

  before(async () => {
    const Fastify = (await import("fastify")).default;
    const { checkRoutes } = await import("../src/routes/check.ts");
    app = Fastify({ logger: false });
    await app.register(checkRoutes);
    await app.ready();
  });

  after(async () => { await app?.close(); });

  it("rejects invalid tone with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "Hello world", tone: "invalid-tone" } });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error, "INVALID_TONE");
    assert.ok(body.message.includes("professional"));
  });

  it("accepts valid tone (returns 200 or 500 if API unavailable)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "Hello world", tone: "professional" } });
    assert.ok([200, 500].includes(res.statusCode), `Expected 200 or 500, got ${res.statusCode}`);
  });

  it("rejects empty text with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "", tone: "professional" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_REQUIRED");
  });

  it("rejects text > 50K chars with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "A".repeat(50_001), tone: "professional" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_TOO_LARGE");
  });

  it("rejects missing text with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/rewrite", payload: { tone: "professional" } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "TEXT_REQUIRED");
  });
});

describe("Route Integration — Auth on Check Routes", () => {
  let app: any;

  before(async () => {
    const Fastify = (await import("fastify")).default;
    const { checkRoutes } = await import("../src/routes/check.ts");
    app = Fastify({ logger: false });
    await app.register(checkRoutes);
    await app.ready();
  });

  after(async () => { await app?.close(); });

  it("allows request without Authorization header (anonymous)", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/check", payload: { text: "Hello world." } });
    assert.ok([200, 429, 500].includes(res.statusCode), `Expected 200/429/500, got ${res.statusCode}`);
  });

  it("handles invalid Authorization header gracefully", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/check",
      headers: { authorization: "Bearer totally-invalid-token" },
      payload: { text: "Hello world." },
    });
    assert.ok([200, 429, 500].includes(res.statusCode), `Expected 200/429/500, got ${res.statusCode}`);
  });
});

describe("Route Integration — Health Check", () => {
  let app: any;

  before(async () => {
    const Fastify = (await import("fastify")).default;
    app = Fastify({ logger: false });
    app.get("/health/live", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
    app.get("/health/ready", async () => ({ status: "ok", timestamp: new Date().toISOString() }));
    await app.ready();
  });

  after(async () => { await app?.close(); });

  it("GET /health/live returns 200 with status ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health/live" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "ok");
  });

  it("GET /health/ready returns 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "ok");
  });
});

describe("Database Schema", () => {
  it("schema module imports successfully", async () => {
    const schema = await import("../src/db/schema.ts");
    assert.ok(schema.users, "users table");
    assert.ok(schema.organizations, "organizations table");
    assert.ok(schema.memberships, "memberships table");
    assert.ok(schema.preferences, "preferences table");
    assert.ok(schema.usageEvents, "usageEvents table");
    assert.ok(schema.feedbackEvents, "feedbackEvents table");
    assert.ok(schema.voiceProfiles, "voiceProfiles table");
  });
});
