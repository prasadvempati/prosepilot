import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { processDocx } from "../engine/docx.js";
import { getProfile } from "./voice-profile.js";
import { verifyRequest } from "../middleware/auth.js";

interface DocxSession {
  userId: string;
  clean: Buffer;
  tracked: Buffer;
  created: number;
}

const docxSessions = new Map<string, DocxSession>();
const DOCX_SESSION_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_DOCX_SESSIONS = 50;

function cleanupDocxSessions() {
  const cutoff = Date.now() - DOCX_SESSION_TTL;
  for (const [key, session] of docxSessions) {
    if (session.created < cutoff) docxSessions.delete(key);
  }
  if (docxSessions.size > MAX_DOCX_SESSIONS) {
    const oldest = [...docxSessions.entries()]
      .sort((a, b) => a[1].created - b[1].created)
      .slice(0, docxSessions.size - MAX_DOCX_SESSIONS);
    for (const [key] of oldest) docxSessions.delete(key);
  }
}

export async function documentRoutes(app: FastifyInstance) {
  // POST /v1/documents/check — Upload .docx, get grammar report + processed files
  app.post("/v1/documents/check", { preHandler: [verifyRequest] }, async (request, reply) => {
    try {
      const userId = (request as any).auth?.userId || "anonymous";
      const voiceProfile = await getProfile(userId);

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({
          error: "FILE_REQUIRED",
          message: "Upload a .docx file",
        });
      }

      if (!data.filename.endsWith(".docx")) {
        return reply.status(400).send({
          error: "INVALID_FILE",
          message: "Only .docx files are supported",
        });
      }

      // Collect file buffer using toBuffer() (more reliable than async iteration)
      const docxBuffer = await data.toBuffer();

      // Limit: 5MB
      if (docxBuffer.length > 5 * 1024 * 1024) {
        return reply.status(400).send({
          error: "FILE_TOO_LARGE",
          message: "File must be under 5MB",
        });
      }

      // Process the document
      let result;
      try {
        result = await processDocx(docxBuffer, voiceProfile);
      } catch (procErr: any) {
        return reply.status(400).send({
          error: "INVALID_DOCX",
          message: "Failed to process document",
        });
      }

      // Store buffers temporarily with random session ID (not predictable)
      cleanupDocxSessions();
      const sessionId = randomUUID();
      docxSessions.set(sessionId, {
        userId: request.auth.userId,
        clean: result.cleanBuffer,
        tracked: result.trackedBuffer,
        created: Date.now(),
      });

      return reply.send({
        sessionId,
        issues: result.issues,
        summary: result.summary,
        downloads: {
          clean: `/v1/documents/download/${sessionId}/clean`,
          tracked: `/v1/documents/download/${sessionId}/tracked`,
        },
      });
    } catch (error: any) {
      return reply.status(500).send({
        error: "PROCESSING_ERROR",
        message: "Failed to process document",
      });
    }
  });

  // GET /v1/documents/download/:sessionId/:type — Download processed .docx
  app.get("/v1/documents/download/:sessionId/:type", { preHandler: [verifyRequest] }, async (request, reply) => {
    const { sessionId, type } = request.params as {
      sessionId: string;
      type: string;
    };

    const session = docxSessions.get(sessionId);

    if (!session) {
      return reply.status(404).send({
        error: "SESSION_EXPIRED",
        message: "Download session not found or expired. Please upload again.",
      });
    }

    if (session.userId !== request.auth.userId) {
      return reply.status(403).send({
        error: "FORBIDDEN",
        message: "You do not have access to this document.",
      });
    }

    const buffer = type === "tracked" ? session.tracked : session.clean;
    if (!buffer) {
      return reply.status(404).send({ error: "INVALID_TYPE" });
    }

    const filename =
      type === "tracked"
        ? "ProsePilot_TrackedChanges.docx"
        : "ProsePilot_Fixed.docx";

    reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);

    // Clean up this session after download
    docxSessions.delete(sessionId);

    return reply.send(buffer);
  });
}
