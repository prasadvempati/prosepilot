import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// postgres.js client
const client = postgres(connectionString);

// Drizzle ORM instance
export const db = drizzle(client, { schema });

export { schema };
