import type { FastifyRequest, FastifyReply } from "fastify";
import { verifyToken } from "@clerk/backend";

declare module "fastify" {
  interface FastifyRequest {
    auth: { userId: string | null };
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

  // No Clerk key configured — allow anonymous access
  if (!process.env.CLERK_SECRET_KEY) {
    request.auth = { userId: null };
    return;
  }

  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    // No token provided — allow anonymous access (lower limits)
    request.auth = { userId: null };
    return;
  }

  const token = header.slice(7);
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY!,
    });
    request.auth = { userId: payload.sub };
  } catch {
    // Invalid token — allow anonymous access rather than blocking
    request.auth = { userId: null };
  }
}
