import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import { db } from "../db/index.js";
import { users, organizations, memberships } from "../db/schema.js";
import { eq } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || "";

function verifyClerkSignature(
  body: string,
  headers: Record<string, string>,
  secret: string
): boolean {
  const svixId = headers["svix-id"];
  const svixTimestamp = headers["svix-timestamp"];
  const svixSignature = headers["svix-signature"];

  if (!svixId || !svixTimestamp || !svixSignature || !secret) {
    return false;
  }

  // Timestamp tolerance: 5 minutes
  const timestamp = parseInt(svixTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const toSign = `${svixId}.${svixTimestamp}.${body}`;
  const secretBytes = Buffer.from(secret.replace("whsec_", ""), "base64");
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(toSign)
    .digest("base64");

  // Each token in svix-signature is "v1,<base64>" — strip prefix before comparing
  const signatures = svixSignature.split(" ");
  for (const sig of signatures) {
    const bareSig = sig.replace(/^v1,/, "");
    if (
      bareSig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(bareSig), Buffer.from(expected))
    ) {
      return true;
    }
  }
  return false;
}

export async function clerkWebhookRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/clerk",
    { config: { rawBody: true } },
    async (req, reply) => {
      if (!WEBHOOK_SECRET) {
        return reply.code(500).send({ error: "Clerk webhook secret not configured" });
      }

      const rawBody = req.rawBody as string;
      if (!rawBody) {
        return reply.code(400).send({ error: "Missing request body" });
      }

      const headers = {
        "svix-id": (req.headers["svix-id"] as string) || "",
        "svix-timestamp": (req.headers["svix-timestamp"] as string) || "",
        "svix-signature": (req.headers["svix-signature"] as string) || "",
      };

      if (!verifyClerkSignature(rawBody, headers, WEBHOOK_SECRET)) {
        return reply.code(401).send({ error: "Invalid webhook signature" });
      }

      let event: { type: string; data: any };
      try {
        event = JSON.parse(rawBody);
      } catch {
        return reply.code(400).send({ error: "Invalid JSON body" });
      }

      const { type, data } = event;

      try {
        switch (type) {
          case "user.created": {
            const displayName =
              [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

            // Insert user, ignoring duplicate clerkId (Svix retry safety)
            await db
              .insert(users)
              .values({
                clerkId: data.id,
                email: data.email_addresses?.[0]?.email_address || "",
                displayName,
                locale: data.public_metadata?.locale || "en-US",
                status: "active",
              })
              .onConflictDoNothing({ target: users.clerkId });

            // Fetch the user regardless of whether insert or conflict
            const [user] = await db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.clerkId, data.id))
              .limit(1);
            if (!user) return reply.code(500).send({ error: "Failed to resolve user" });

            // Only create org + membership if this user has none yet (idempotent)
            const [existingMembership] = await db
              .select()
              .from(memberships)
              .where(eq(memberships.userId, user.id))
              .limit(1);

            if (!existingMembership) {
              const [org] = await db
                .insert(organizations)
                .values({
                  name: `${displayName || "My"}'s Organization`,
                  plan: "free",
                })
                .returning({ id: organizations.id });

              await db.insert(memberships).values({
                organizationId: org.id,
                userId: user.id,
                role: "owner",
              });
            }

            break;
          }
          case "user.updated": {
            await db
              .update(users)
              .set({
                email: data.email_addresses?.[0]?.email_address || undefined,
                displayName: [data.first_name, data.last_name].filter(Boolean).join(" ") || undefined,
              })
              .where(eq(users.clerkId, data.id));
            break;
          }
          case "user.deleted": {
            await db
              .update(users)
              .set({ deletedAt: new Date(), status: "deleted" })
              .where(eq(users.clerkId, data.id));
            break;
          }
          default:
            // Unhandled event type — acknowledge silently
            break;
        }
      } catch (err) {
        return reply.code(500).send({ error: "Failed to process webhook event" });
      }

      return { received: true };
    }
  );
}
