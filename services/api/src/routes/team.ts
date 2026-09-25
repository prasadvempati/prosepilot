import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizations, memberships, teamSettings, users, usageEvents } from "../db/schema.js";
import { verifyRequest } from "../middleware/auth.js";

export async function teamRoutes(app: FastifyInstance) {
  // GET /v1/team/info - Get current user's team info
  app.get("/v1/team/info", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      // Get user's organization
      const userMemberships = await db
        .select({
          organization: organizations,
          membership: memberships,
        })
        .from(memberships)
        .innerJoin(organizations, sql`${memberships.organizationId} = ${organizations.id}`)
        .where(eq(memberships.userId, (await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1))[0]?.id ?? ""));

      if (userMemberships.length === 0) {
        return reply.send({ team: null, isAdmin: false });
      }

      const membership = userMemberships[0];
      const isAdmin = membership.membership.role === "admin" || membership.membership.role === "owner";

      // Get team settings
      const settings = await db.select().from(teamSettings).where(eq(teamSettings.organizationId, membership.organization.id)).limit(1);

      // Get member count
      const memberCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(memberships)
        .where(sql`${memberships.organizationId} = ${membership.organization.id}`);

      // Get SSO status
      const ssoStatus = {
        enabled: membership.organization.ssoEnabled,
        provider: membership.organization.ssoProvider,
        entityId: membership.organization.ssoEntityId,
      };

      return reply.send({
        team: {
          id: membership.organization.id,
          name: membership.organization.name,
          plan: membership.organization.plan,
          memberCount: memberCount[0]?.count || 1,
          role: membership.membership.role,
          sso: ssoStatus,
          settings: settings[0] || null,
        },
        isAdmin,
      });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR", message: "Failed to fetch team info" });
    }
  });

  // GET /v1/team/members - List team members (admin only)
  app.get("/v1/team/members", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({
          membership: memberships,
          user: users,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .innerJoin(organizations, sql`${memberships.organizationId} = ${organizations.id}`)
        .where(eq(memberships.userId, user[0].id));

      if (membershipsData.length === 0) {
        return reply.send({ members: [] });
      }

      const userRole = membershipsData[0].membership.role!;

      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      const allMembers = await db
        .select({
          membership: memberships,
          user: users,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(sql`${memberships.organizationId} = ${membershipsData[0].membership.organizationId!}`);

      const members = allMembers.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        role: m.membership.role,
        joinedAt: m.membership.createdAt,
      }));

      return reply.send({ members });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // POST /v1/team/invite - Invite member (admin only)
  app.post("/v1/team/invite", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    const { email, role = "member" } = request.body as any;

    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });
    if (!email || !email.includes("@")) {
      return reply.status(400).send({ error: "INVALID_EMAIL" });
    }

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({ organizationId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user[0].id))
        .limit(1);

if (membershipsData.length === 0 || !membershipsData[0].organizationId) {
        return reply.status(403).send({ error: "NO_TEAM" });
      }

      const userRole = membershipsData[0].role!;
      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      // Check if user already exists
      const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      
      if (existingUser.length > 0) {
        // Check if already a member
        const existingMembership = await db
          .select()
          .from(memberships)
          .where(and(
            sql`${memberships.organizationId} = ${membershipsData[0].organizationId!}`,
            eq(memberships.userId, existingUser[0].id!)
          ))
          .limit(1);

        if (existingMembership.length > 0) {
          return reply.status(409).send({ error: "ALREADY_MEMBER" });
        }

        // Add existing user to organization
        await db.insert(memberships).values({
          organizationId: membershipsData[0].organizationId,
          userId: existingUser[0].id,
          role,
        });
      } else {
        // User doesn't exist yet - they'll need to sign up first
        // In a real implementation, you'd send an invitation email
        return reply.status(400).send({ error: "USER_NOT_FOUND", message: "User must sign up first" });
      }

      return reply.send({ success: true });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // DELETE /v1/team/members/:userId - Remove member (admin only)
  app.delete("/v1/team/members/:targetUserId", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    const { targetUserId } = request.params as any;

    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({ organizationId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user[0].id))
        .limit(1);

      if (membershipsData.length === 0 || !membershipsData[0].organizationId) {
        return reply.status(403).send({ error: "NO_TEAM" });
      }

      const userRole = membershipsData[0].role!;
      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      // Can't remove yourself
      if (targetUserId === user[0].id) {
        return reply.status(400).send({ error: "CANNOT_REMOVE_SELF" });
      }

      // Remove membership
      await db
        .delete(memberships)
        .where(and(
          sql`${memberships.organizationId} = ${membershipsData[0].organizationId!}`,
          eq(memberships.userId, targetUserId)
        ));

      return reply.send({ success: true });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // PATCH /v1/team/settings - Update team settings (admin only)
  app.patch("/v1/team/settings", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    const updates = request.body as any;

    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({ organizationId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user[0].id))
        .limit(1);

      if (membershipsData.length === 0 || !membershipsData[0].organizationId) {
        return reply.status(403).send({ error: "NO_TEAM" });
      }

      const userRole = membershipsData[0].role!;
      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      // Update team settings
      const allowedFields = ["styleGuide", "sharedVocabulary", "blockedTerms", "customRules", "defaultTone", "defaultLanguage", "allowedDomains", "enforceSso"];
      const filteredUpdates: any = {};
      
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          if (field === "defaultTone" || field === "defaultLanguage" || field === "enforceSso") {
            // These go on organizations table
            await db
              .update(organizations)
              .set({ [field]: updates[field] })
              .where(eq(organizations.id, membershipsData[0].organizationId!));
          } else {
            filteredUpdates[field] = updates[field];
          }
        }
      }

      if (Object.keys(filteredUpdates).length > 0) {
        await db
          .insert(teamSettings)
          .values({
            organizationId: membershipsData[0].organizationId!,
            ...filteredUpdates,
            updatedAt: new Date(),
            updatedBy: user[0].id,
          })
          .onConflictDoUpdate({
            target: teamSettings.organizationId,
            set: { ...filteredUpdates, updatedAt: new Date(), updatedBy: user[0].id },
          });
      }

      return reply.send({ success: true });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // POST /v1/team/sso/configure - Configure SSO (admin only)
  app.post("/v1/team/sso/configure", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    const { enabled, provider, entityId, ssoUrl, certificate, attributeMapping, enforceSso } = request.body as any;

    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({ organizationId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user[0].id))
        .limit(1);

      if (membershipsData.length === 0) {
        return reply.status(403).send({ error: "NO_TEAM" });
      }

      const userRole = membershipsData[0].role!;
      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      // Validate SSO config if enabling
      if (enabled) {
        if (!provider || !["saml", "oidc"].includes(provider)) {
          return reply.status(400).send({ error: "INVALID_PROVIDER", message: "Provider must be 'saml' or 'oidc'" });
        }
        if (!entityId || !ssoUrl) {
          return reply.status(400).send({ error: "MISSING_FIELDS", message: "entityId and ssoUrl are required when enabling SSO" });
        }
        if (provider === "saml" && !certificate) {
          return reply.status(400).send({ error: "MISSING_CERTIFICATE", message: "SAML requires a certificate" });
        }
      }

      await db
        .update(organizations)
        .set({
          ssoEnabled: enabled,
          ssoProvider: provider,
          ssoEntityId: entityId,
          ssoSsoUrl: ssoUrl,
          ssoCertificate: certificate,
          ssoAttributeMapping: attributeMapping || {},
          enforceSso: enforceSso ?? false,
        })
        .where(eq(organizations.id, membershipsData[0].organizationId!));

      // TODO: Configure Clerk SAML/OIDC connection via Clerk API
      // This would require using Clerk's Admin API to set up the connection

      return reply.send({ success: true });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });

  // GET /v1/team/usage - Team usage analytics (admin only)
  app.get("/v1/team/usage", { preHandler: [verifyRequest] }, async (request, reply) => {
    const userId = (request as any).auth?.userId;
    const { period = "30d" } = request.query as any;

    if (!userId) return reply.status(401).send({ error: "UNAUTHORIZED" });

    try {
      const user = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, userId)).limit(1);
      if (!user[0]) return reply.status(404).send({ error: "USER_NOT_FOUND" });

      const membershipsData = await db
        .select({ organizationId: memberships.organizationId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, user[0].id))
        .limit(1);

      if (membershipsData.length === 0 || !membershipsData[0].organizationId) {
        return reply.status(403).send({ error: "NO_TEAM" });
      }

      const userRole = membershipsData[0].role!;
      if (!["admin", "owner"].includes(userRole)) {
        return reply.status(403).send({ error: "FORBIDDEN", message: "Admin access required" });
      }

      const periodDays = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

      // Get all team members
      const members = await db
        .select({ userId: users.id, email: users.email, displayName: users.displayName })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(sql`${memberships.organizationId} = ${membershipsData[0].organizationId!}`);

      // Get usage per member
      const usage = await db
        .select({
          actorId: usageEvents.actorId,
          totalChars: sql<number>`sum(${usageEvents.characterCount})`,
          checkCount: sql<number>`count(*)`,
          avgLatency: sql<number>`avg(${usageEvents.latencyMs})`,
        })
        .from(usageEvents)
        .where(and(
          sql`${usageEvents.actorId} IN (${sql.join(members.map(m => m.userId!), sql`, `)})`,
          sql`${usageEvents.createdAt} >= ${periodStart}`
        ))
        .groupBy(usageEvents.actorId);

      const memberUsage = members.map(m => {
        const u = usage.find(u => u.actorId === m.userId);
        return {
          ...m,
          charactersUsed: u?.totalChars || 0,
          checksPerformed: u?.checkCount || 0,
          avgLatencyMs: Math.round(u?.avgLatency || 0),
        };
      });

      return reply.send({
        period: { days: periodDays, start: periodStart.toISOString() },
        members: memberUsage,
        totalCharacters: memberUsage.reduce((sum, m) => sum + m.charactersUsed, 0),
        totalChecks: memberUsage.reduce((sum, m) => sum + m.checksPerformed, 0),
      });
    } catch (error) {
      return reply.status(500).send({ error: "INTERNAL_ERROR" });
    }
  });
}