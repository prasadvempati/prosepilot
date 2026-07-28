import type { FastifyInstance } from "fastify";
import { processDocx } from "../engine/docx.js";

export async function documentRoutes(app: FastifyInstance) {
  // POST /v1/documents/check — Upload .docx, get grammar report + processed files
  app.post("/v1/documents/check", async (request, reply) => {
    try {
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

      console.log(`[docx] Processing ${data.filename} (${docxBuffer.length} bytes)`);

      // Process the document
      let result;
      try {
        result = await processDocx(docxBuffer);
      } catch (procErr: any) {
        console.error("[docx] processDocx failed:", procErr);
        return reply.status(400).send({
          error: "INVALID_DOCX",
          message: `Failed to process document: ${procErr.message}`,
        });
      }

      console.log(`[docx] Found ${result.issues.length} issues in ${result.summary.paragraphsChecked} paragraphs`);

      // Store buffers temporarily (in memory, keyed by timestamp)
      const sessionId = `docx_${Date.now()}`;
      (global as any).__docxSessions = (global as any).__docxSessions || {};
      (global as any).__docxSessions[sessionId] = {
        clean: result.cleanBuffer,
        tracked: result.trackedBuffer,
        created: Date.now(),
      };

      // Clean up sessions older than 10 minutes
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [key, session] of Object.entries((global as any).__docxSessions)) {
        if ((session as any).created < cutoff) {
          delete (global as any).__docxSessions[key];
        }
      }

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
      app.log.error(error);
      return reply.status(500).send({
        error: "PROCESSING_ERROR",
        message: error.message || "Failed to process document",
      });
    }
  });

  // GET /v1/documents/download/:sessionId/:type — Download processed .docx
  app.get("/v1/documents/download/:sessionId/:type", async (request, reply) => {
    const { sessionId, type } = request.params as {
      sessionId: string;
      type: string;
    };

    const sessions = (global as any).__docxSessions || {};
    const session = sessions[sessionId];

    if (!session) {
      return reply.status(404).send({
        error: "SESSION_EXPIRED",
        message: "Download session not found or expired. Please upload again.",
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
    return reply.send(buffer);
  });
}
