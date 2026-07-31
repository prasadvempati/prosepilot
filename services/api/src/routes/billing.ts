import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { verifyRequest } from "../middleware/auth.js";
import { db } from "../db/index.js";
import { organizations, users, memberships } from "../db/schema.js";

let stripe: Stripe | null = null;
const PRICE_ID = process.env.STRIPE_PRICE_PRO_MONTHLY || "";

function getStripe(): Stripe | null {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export async function billingRoutes(app: FastifyInstance) {
  // Create Checkout Session
  app.post("/v1/billing/checkout", { preHandler: [verifyRequest] }, async (req, reply) => {
    const s = getStripe();
    if (!s) return reply.code(503).send({ error: "Billing not configured" });

    try {
      const session = await s.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: PRICE_ID,
            quantity: 1,
          },
        ],
        success_url: `${process.env.APP_URL || "https://prosepilot.io"}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || "https://prosepilot.io"}/pricing`,
        metadata: {
          userId: (req as any).auth?.userId || "anonymous",
        },
      });

      return { url: session.url };
    } catch (error) {
      return reply.code(500).send({ error: "Failed to create checkout session" });
    }
  });

  // Create Billing Portal Session
  app.post("/v1/billing/portal", { preHandler: [verifyRequest] }, async (req, reply) => {
    const s = getStripe();
    if (!s) return reply.code(503).send({ error: "Billing not configured" });

    try {
      const { customerId } = req.body as { customerId: string };

      const session = await s.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.APP_URL || "https://prosepilot.io"}/dashboard`,
      });

      return { url: session.url };
    } catch (error) {
      return reply.code(500).send({ error: "Failed to create portal session" });
    }
  });

  // Stripe Webhook — rawBody must be preserved for signature verification
  app.post("/v1/billing/webhook", { config: { rawBody: true } }, async (req, reply) => {
    const s = getStripe();
    if (!s) return reply.code(503).send({ error: "Billing not configured" });

    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    let event: Stripe.Event;

    try {
      event = s.webhooks.constructEvent(
        req.rawBody as string,
        sig,
        endpointSecret
      );
    } catch (err) {
      return reply.code(400).send({ error: "Webhook signature verification failed" });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        try {
          const userId = session.metadata?.userId;
          const stripeCustomerId = session.customer as string;
          if (userId && stripeCustomerId) {
            const [user] = await db.select().from(users).where(eq(users.clerkId, userId)).limit(1);
            if (user) {
              const [membership] = await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1);
              if (membership) {
                await db
                  .update(organizations)
                  .set({
                    stripeCustomerId,
                    stripeSubscriptionId: session.subscription as string,
                    plan: "pro",
                  })
                  .where(eq(organizations.id, membership.organizationId));
              }
            }
          }
        } catch (err) {
          console.error("checkout.session.completed processing failed:", err);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Invoice paid:", invoice.id);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        try {
          const [org] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.stripeSubscriptionId, subscription.id))
            .limit(1);
          if (org) {
            const plan =
              subscription.status === "active" ? "pro" : "free";
            await db
              .update(organizations)
              .set({ plan })
              .where(eq(organizations.id, org.id));
          }
        } catch (err) {
          console.error("customer.subscription.updated processing failed:", err);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        try {
          const [org] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.stripeSubscriptionId, subscription.id))
            .limit(1);
          if (org) {
            await db
              .update(organizations)
              .set({ plan: "free", stripeSubscriptionId: null })
              .where(eq(organizations.id, org.id));
          }
        } catch (err) {
          console.error("customer.subscription.deleted processing failed:", err);
        }
        break;
      }
      default:
        console.log("Unhandled event type:", event.type);
    }

    return { received: true };
  });
}
