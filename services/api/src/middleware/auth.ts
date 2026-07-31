import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "@clerk/backend";

declare module "fastify" {
  interface FastifyRequest {
    auth: { userId: string };
  }
}

export async function verifyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Dev mode: skip auth when CLERK_SECRET_KEY is not configured
  if (!process.env.CLERK_SECRET_KEY && process.env.NODE_ENV !== "production") {
    request.auth = { userId: "dev-user" };
    return;
  }

  if (!process.env.CLERK_SECRET_KEY) {
    return reply.status(500).send({ error: "SERVER_MISCONFIGURED", message: "Authentication not configured" });
  }

  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply
      .status(401)
      .send({ error: "UNAUTHORIZED", message: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    request.auth = { userId: payload.sub };
  } catch {
    return reply
      .status(401)
      .send({ error: "UNAUTHORIZED", message: "Invalid or expired token" });
  }
}
