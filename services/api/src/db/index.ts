import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Disable SSL for local development, enable for production
const sslReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
const client = postgres(connectionString, {
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: sslReject } : false,
});

export const db = drizzle(client, { schema });

export { schema };
