import type { FastifyInstance } from "fastify";
import Stripe from "stripe";

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
  app.post("/v1/billing/checkout", async (req, reply) => {
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
      console.error("Checkout error:", error);
      return reply.code(500).send({ error: "Failed to create checkout session" });
    }
  });

  // Create Billing Portal Session
  app.post("/v1/billing/portal", async (req, reply) => {
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
      console.error("Portal error:", error);
      return reply.code(500).send({ error: "Failed to create portal session" });
    }
  });

  // Stripe Webhook
  app.post("/v1/billing/webhook", async (req, reply) => {
    const s = getStripe();
    if (!s) return reply.code(503).send({ error: "Billing not configured" });

    const sig = req.headers["stripe-signature"] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    let event: Stripe.Event;

    try {
      event = s.webhooks.constructEvent(
        req.body as string,
        sig,
        endpointSecret
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return reply.code(400).send({ error: "Webhook signature verification failed" });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log("Checkout completed:", session.id);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log("Invoice paid:", invoice.id);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Subscription updated:", subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log("Subscription cancelled:", subscription.id);
        break;
      }
      default:
        console.log("Unhandled event type:", event.type);
    }

    return { received: true };
  });
}
