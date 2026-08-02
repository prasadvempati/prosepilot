// Throwaway manual test — NOT part of the build (lives outside src/, so tsc/pnpm build
// ignores it per tsconfig's "include": ["src"]). Delete this file whenever you're done.
//
// Calls the REAL checkGrammar() pipeline directly (rule engine + local model + LT +
// DeepSeek merge), bypassing Fastify/DB/Clerk entirely — so it works without DATABASE_URL
// or any other server env vars. If DEEPSEEK_API_KEY isn't set, DeepSeek calls just fail
// safe and return no issues (same fail-safe behavior as production); everything else
// still runs normally.
//
// Run from inside services/api:
//   npx tsx manual-test-local-model.ts

import { checkGrammar } from "./src/engine/grammar.js";

const tests = [
  "i has book on the table.",
  "I have a book on my table, which can be opened by someone who is able to read it completely.",
  "So wen someone open the book they have to close it immediately.",
  "The tenant have not paid rent for teh month of March.",
  "Please reach out too me if you have any questions regarding the leasing offical documents.",
  "This is a perfectly correct sentence with no errors at all.",
];

for (const text of tests) {
  console.log(`\nTEXT: ${text}`);

  // Lightweight (fast-pass) check — this is what Auto mode fires first on every keystroke pause.
  const t0 = Date.now();
  const fast = await checkGrammar({ text, mode: "review", lightweight: true });
  console.log(`  [lightweight] ${Date.now() - t0}ms, tier=${fast.usage.engineTier}, ${fast.issues.length} issue(s)`);
  for (const issue of fast.issues) {
    console.log(`    [${issue.safeAuto ? "AUTO-APPLY" : "suggest-only"}] "${issue.original}" -> "${issue.replacement}" (${issue.rule})`);
  }

  // Full check — what runs right after, picks up DeepSeek too if configured.
  const t1 = Date.now();
  const full = await checkGrammar({ text, mode: "review", lightweight: false });
  console.log(`  [full] ${Date.now() - t1}ms, tier=${full.usage.engineTier}, ${full.issues.length} issue(s)`);
  for (const issue of full.issues) {
    console.log(`    [${issue.safeAuto ? "AUTO-APPLY" : "suggest-only"}] "${issue.original}" -> "${issue.replacement}" (${issue.rule})`);
  }
}
