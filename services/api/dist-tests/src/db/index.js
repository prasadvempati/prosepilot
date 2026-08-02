"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schema = exports.db = void 0;
var postgres_js_1 = require("drizzle-orm/postgres-js");
var postgres_1 = require("postgres");
var schema = require("./schema.js");
exports.schema = schema;
var connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
}
// Disable SSL for local development, enable for production
var sslReject = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false";
var client = (0, postgres_1.default)(connectionString, {
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: sslReject } : false,
});
exports.db = (0, postgres_js_1.drizzle)(client, { schema: schema });
