#!/usr/bin/env npx tsx
"use strict";
/**
 * ProsePilot API — Comprehensive Unit Tests
 *
 * Run: cd services/api && npx tsx tests/api.test.ts
 *
 * ENV vars are set at the very top BEFORE any imports to prevent
 * drizzle/postgres from throwing on missing DATABASE_URL.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b, _c;
var _d, _e, _f;
Object.defineProperty(exports, "__esModule", { value: true });
// ─── 1. Set required env vars BEFORE any module imports ────────────────────
(_a = (_d = process.env).DATABASE_URL) !== null && _a !== void 0 ? _a : (_d.DATABASE_URL = "postgresql://test:test@localhost:5432/prosepilot_test");
(_b = (_e = process.env).NODE_ENV) !== null && _b !== void 0 ? _b : (_e.NODE_ENV = "development");
(_c = (_f = process.env).CLERK_SECRET_KEY) !== null && _c !== void 0 ? _c : (_f.CLERK_SECRET_KEY = "");
// ─── 2. Imports ────────────────────────────────────────────────────────────
var node_test_1 = require("node:test");
var strict_1 = require("node:assert/strict");
// ─── Grammar Engine — checkGrammar (rulesOnly mode) ───────────────────────
(0, node_test_1.describe)("Grammar Engine — checkGrammar (rulesOnly)", function () {
    var checkGrammar;
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var mod;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    mod = _a.sent();
                    checkGrammar = mod.checkGrammar;
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects missing period at end of sentence", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "This is a sentence without a period",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "missing_period"; });
                    strict_1.default.ok(issue, "Should detect missing period");
                    strict_1.default.equal(issue.category, "punctuation");
                    strict_1.default.equal(issue.original, "This is a sentence without a period");
                    strict_1.default.equal(issue.replacement, "This is a sentence without a period.");
                    strict_1.default.equal(issue.confidence, 0.99);
                    strict_1.default.equal(issue.safeAuto, true);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("returns no missing_period issue for correct text", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "This is a correct sentence.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "missing_period"; });
                    strict_1.default.equal(issue, undefined);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects capitalization after period", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "First sentence. second sentence.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "capitalize_after_period"; });
                    strict_1.default.ok(issue, "Should detect lowercase after period");
                    strict_1.default.equal(issue.category, "grammar");
                    strict_1.default.equal(issue.original, ". s");
                    strict_1.default.equal(issue.replacement, ". S");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects missing capitalization at start of text", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "this starts lowercase.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "capitalize_sentence_start"; });
                    strict_1.default.ok(issue, "Should detect lowercase at text start");
                    strict_1.default.equal(issue.category, "grammar");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects space before comma", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Hello world , how are you?",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "space_before_comma"; });
                    strict_1.default.ok(issue, "Should detect space before comma");
                    strict_1.default.equal(issue.category, "punctuation");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects space before period", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Hello world .",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "space_before_period"; });
                    strict_1.default.ok(issue, "Should detect space before period");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects space before semicolon", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "The report is done ; please review.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "space_before_semicolon"; });
                    strict_1.default.ok(issue, "Should detect space before semicolon");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects double spaces", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Hello  world",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "double_space"; });
                    strict_1.default.ok(issue, "Should detect double spaces");
                    strict_1.default.equal(issue.category, "style");
                    strict_1.default.equal(issue.replacement, "Hello world");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects double period (should be ellipsis)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Wait..",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "double_period"; });
                    strict_1.default.ok(issue, "Should detect double period");
                    strict_1.default.equal(issue.replacement, "Wait...");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects uncountable noun 'informations'", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Please provide the informations.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "uncountable_noun" && i.original.toLowerCase().includes("information"); });
                    strict_1.default.ok(issue, "Should detect uncountable noun 'informations'");
                    strict_1.default.equal(issue.replacement, "information");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects uncountable noun 'equipments'", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "We need new equipments.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "uncountable_noun" && i.original.toLowerCase().includes("equipment"); });
                    strict_1.default.ok(issue, "Should detect 'equipments' → 'equipment'");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects gerund after possessive ('our discussing' → 'discussion')", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Per our discussing, the project is on track.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "gerund_to_noun"; });
                    strict_1.default.ok(issue, "Should detect gerund after possessive");
                    strict_1.default.ok(issue.replacement.toLowerCase().includes("discussion"));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects proper noun capitalization (Prosepilot → ProsePilot)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "I use Prosepilot every day.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "proper_noun_capitalization" && i.original === "Prosepilot"; });
                    strict_1.default.ok(issue, "Should detect Prosepilot → ProsePilot");
                    strict_1.default.equal(issue.replacement, "ProsePilot");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects missing comma after introductory clause", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "If the unit is ready we can show it.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "comma_after_conditional"; });
                    strict_1.default.ok(issue, "Should detect missing comma after 'If' clause");
                    strict_1.default.equal(issue.category, "punctuation");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects adjective-noun word order issues", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "We need an upgrade premium for the unit.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "adjective_noun_order"; });
                    strict_1.default.ok(issue, "Should detect reversed adjective-noun order");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("detects missing object pronoun ('finished on time')", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result, issue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "They finished on time.",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    issue = result.issues.find(function (i) { return i.rule === "missing_object_pronoun"; });
                    strict_1.default.ok(issue, "Should detect missing object pronoun");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles empty text gracefully", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({ text: "", mode: "review", rulesOnly: true })];
                case 1:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    strict_1.default.equal(result.issues.length, 0);
                    strict_1.default.equal(result.usage.characterCount, 0);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles long text (10K chars) without crashing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var sentence, longText, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    sentence = "The quick brown fox jumps over the lazy dog. ";
                    longText = sentence.repeat(Math.ceil(10000 / sentence.length)).slice(0, 10001);
                    return [4 /*yield*/, checkGrammar({ text: longText, mode: "review", rulesOnly: true })];
                case 1:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    strict_1.default.ok(result.usage.characterCount >= 10000);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with only whitespace", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({ text: "   \t\n  ", mode: "review", rulesOnly: true })];
                case 1:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with only punctuation", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({ text: "...!??;;", mode: "review", rulesOnly: true })];
                case 1:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with special characters (emoji, unicode)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, checkGrammar({
                        text: "Hello \uD83C\uDF0D \u2014 caf\u00E9 r\u00E9sum\u00E9 na\u00EFve \u4F60\u597D\u4E16\u754C",
                        mode: "review",
                        rulesOnly: true,
                    })];
                case 1:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("returns correct usage metadata", function () { return __awaiter(void 0, void 0, void 0, function () {
        var text, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    text = "Hello world.";
                    return [4 /*yield*/, checkGrammar({ text: text, mode: "review", rulesOnly: true })];
                case 1:
                    result = _a.sent();
                    strict_1.default.equal(result.usage.characterCount, text.length);
                    strict_1.default.equal(result.usage.checkMode, "review");
                    strict_1.default.equal(result.usage.engineTier, "rule");
                    strict_1.default.equal(typeof result.usage.latencyMs, "number");
                    strict_1.default.ok(result.usage.latencyMs >= 0);
                    strict_1.default.equal(typeof result.updatedHash, "string");
                    strict_1.default.ok(result.updatedHash.startsWith("sha256:"));
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Grammar Engine — mergeAllIssues deduplication ─────────────────────────
(0, node_test_1.describe)("Grammar Engine — mergeAllIssues deduplication", function () {
    (0, node_test_1.it)("no duplicate positions in merged issues", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result, positions, unique;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({
                            text: "Hello  world  there",
                            mode: "review",
                            rulesOnly: true,
                        })];
                case 2:
                    result = _a.sent();
                    positions = result.issues.map(function (i) { return "".concat(i.startUtf16, "-").concat(i.endUtf16); });
                    unique = new Set(positions);
                    strict_1.default.equal(positions.length, unique.size, "No duplicate positions");
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Auth Middleware ────────────────────────────────────────────────────────
(0, node_test_1.describe)("Auth Middleware — verifyRequest", function () {
    var verifyRequest;
    var savedEnv = {};
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var mod;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/middleware/auth.js"); })];
                case 1:
                    mod = _a.sent();
                    verifyRequest = mod.verifyRequest;
                    savedEnv.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
                    savedEnv.NODE_ENV = process.env.NODE_ENV;
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.after)(function () {
        if ("CLERK_SECRET_KEY" in savedEnv)
            process.env.CLERK_SECRET_KEY = savedEnv.CLERK_SECRET_KEY;
        else
            delete process.env.CLERK_SECRET_KEY;
        if ("NODE_ENV" in savedEnv)
            process.env.NODE_ENV = savedEnv.NODE_ENV;
        else
            delete process.env.NODE_ENV;
    });
    (0, node_test_1.it)("sets userId to 'dev-user' when CLERK_SECRET_KEY absent and not production", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    delete process.env.CLERK_SECRET_KEY;
                    process.env.NODE_ENV = "development";
                    req = { headers: {} };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, "dev-user");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("sets userId to null when CLERK_SECRET_KEY absent and production", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    delete process.env.CLERK_SECRET_KEY;
                    process.env.NODE_ENV = "production";
                    req = { headers: {} };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, null);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("sets userId to null when no Authorization header", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.env.CLERK_SECRET_KEY = "test-secret-key";
                    process.env.NODE_ENV = "development";
                    req = { headers: {} };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, null);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("sets userId to null for invalid Bearer token (doesn't crash)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.env.CLERK_SECRET_KEY = "test-secret-key";
                    process.env.NODE_ENV = "development";
                    req = { headers: { authorization: "Bearer invalid-token-xyz" } };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, null);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("sets userId to null for malformed Authorization header", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.env.CLERK_SECRET_KEY = "test-secret-key";
                    process.env.NODE_ENV = "development";
                    req = { headers: { authorization: "Basic dXNlcjpwYXNz" } };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, null);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("sets userId to null for 'Bearer' without token", function () { return __awaiter(void 0, void 0, void 0, function () {
        var req;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    process.env.CLERK_SECRET_KEY = "test-secret-key";
                    process.env.NODE_ENV = "development";
                    req = { headers: { authorization: "Bearer " } };
                    return [4 /*yield*/, verifyRequest(req, {})];
                case 1:
                    _a.sent();
                    strict_1.default.equal(req.auth.userId, null);
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Route Validation — POST /v1/check ──────────────────────────────────────
(0, node_test_1.describe)("Route Validation — POST /v1/check", function () {
    var app;
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var Fastify, checkRoutes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("fastify"); })];
                case 1:
                    Fastify = (_a.sent()).default;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/routes/check.js"); })];
                case 2:
                    checkRoutes = (_a.sent()).checkRoutes;
                    app = Fastify({ logger: false });
                    return [4 /*yield*/, app.register(checkRoutes)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, app.ready()];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.after)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (app === null || app === void 0 ? void 0 : app.close())];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects empty text with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: "" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_EMPTY");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects missing text field with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: {} })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_REQUIRED");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects non-string text with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: 12345 } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_REQUIRED");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects text > 100K chars with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: "A".repeat(100001) } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_TOO_LARGE");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects whitespace-only text with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: "   \t\n  " } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_EMPTY");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("accepts valid text and returns response", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: "Hello world" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.ok([200, 429, 500].includes(res.statusCode), "Got ".concat(res.statusCode));
                    if (res.statusCode === 200) {
                        body = res.json();
                        strict_1.default.ok(Array.isArray(body.issues));
                        strict_1.default.ok(typeof body.updatedHash === "string");
                        strict_1.default.ok(typeof body.usage === "object");
                    }
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Route Validation — POST /v1/rewrite ───────────────────────────────────
(0, node_test_1.describe)("Route Validation — POST /v1/rewrite", function () {
    var app;
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var Fastify, checkRoutes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("fastify"); })];
                case 1:
                    Fastify = (_a.sent()).default;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/routes/check.js"); })];
                case 2:
                    checkRoutes = (_a.sent()).checkRoutes;
                    app = Fastify({ logger: false });
                    return [4 /*yield*/, app.register(checkRoutes)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, app.ready()];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.after)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (app === null || app === void 0 ? void 0 : app.close())];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects invalid tone with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "Hello world", tone: "invalid-tone" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    body = res.json();
                    strict_1.default.equal(body.error, "INVALID_TONE");
                    strict_1.default.ok(body.message.includes("professional"));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("accepts valid tone (returns 200 or 500 if API unavailable)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "Hello world", tone: "professional" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.ok([200, 500].includes(res.statusCode), "Expected 200 or 500, got ".concat(res.statusCode));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects empty text with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "", tone: "professional" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_REQUIRED");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects text > 50K chars with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/rewrite", payload: { text: "A".repeat(50001), tone: "professional" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_TOO_LARGE");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("rejects missing text with 400", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/rewrite", payload: { tone: "professional" } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 400);
                    strict_1.default.equal(res.json().error, "TEXT_REQUIRED");
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Edge Cases — Grammar Engine ───────────────────────────────────────────
(0, node_test_1.describe)("Edge Cases — Grammar Engine", function () {
    (0, node_test_1.it)("handles text with only whitespace (no crash)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({ text: "     ", mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    strict_1.default.equal(result.usage.characterCount, 5);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with only punctuation", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({ text: "!!!???...", mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles mixed-language text without crashing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, text, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    text = "HelloBonjour Hola\u4E16\u754C \u041F\u0440\u0438\u0432\u0435\u0442 \u0645\u0631\u062D\u0628\u0627";
                    return [4 /*yield*/, checkGrammar({ text: text, mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    strict_1.default.equal(result.usage.characterCount, text.length);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with emoji and unicode", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({
                            text: "Great job \uD83C\uDF89! The caf\u00E9 r\u00E9sum\u00E9 na\u00EFve work is done \u2014 thank you \uD83D\uDE4F",
                            mode: "review",
                            rulesOnly: true,
                        })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles single character text", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result, capIssue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({ text: "a", mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    capIssue = result.issues.find(function (i) { return i.rule === "capitalize_sentence_start"; });
                    strict_1.default.ok(capIssue, "Single lowercase char at start should be flagged");
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles text with newlines and tabs", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({ text: "Line one.\n\tLine two.", mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles single period", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    return [4 /*yield*/, checkGrammar({ text: ".", mode: "review", rulesOnly: true })];
                case 2:
                    result = _a.sent();
                    strict_1.default.ok(Array.isArray(result.issues));
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Concurrent Requests (Stress Test) ─────────────────────────────────────
(0, node_test_1.describe)("Concurrent Requests — Stress Test", function () {
    (0, node_test_1.it)("handles 10 parallel checkGrammar calls without crashing", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, texts, results, _i, results_1, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    texts = Array.from({ length: 10 }, function (_, i) {
                        return "This is test sentence number ".concat(i + 1, ". It has some text to check.");
                    });
                    return [4 /*yield*/, Promise.all(texts.map(function (text) { return checkGrammar({ text: text, mode: "review", rulesOnly: true }); }))];
                case 2:
                    results = _a.sent();
                    strict_1.default.equal(results.length, 10);
                    for (_i = 0, results_1 = results; _i < results_1.length; _i++) {
                        result = results_1[_i];
                        strict_1.default.ok(Array.isArray(result.issues));
                        strict_1.default.equal(typeof result.updatedHash, "string");
                        strict_1.default.ok(result.usage.latencyMs >= 0);
                    }
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles 10 parallel requests with mixed text lengths", function () { return __awaiter(void 0, void 0, void 0, function () {
        var checkGrammar, texts, results, _i, results_2, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/engine/grammar.js"); })];
                case 1:
                    checkGrammar = (_a.sent()).checkGrammar;
                    texts = [
                        "Short.",
                        "A medium length sentence that has some words.",
                        "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. ",
                        "Another short one.",
                        "X",
                        "The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.",
                        "A quick brown fox jumps over the lazy dog. ".repeat(25),
                        "Hello world",
                        "Multiple  double  spaces  here.",
                        "Per our discussing the upgrade premium is complete.",
                    ];
                    return [4 /*yield*/, Promise.all(texts.map(function (text) { return checkGrammar({ text: text, mode: "review", rulesOnly: true }); }))];
                case 2:
                    results = _a.sent();
                    strict_1.default.equal(results.length, 10);
                    for (_i = 0, results_2 = results; _i < results_2.length; _i++) {
                        result = results_2[_i];
                        strict_1.default.ok(Array.isArray(result.issues));
                    }
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Route Integration — Health Check ──────────────────────────────────────
(0, node_test_1.describe)("Route Integration — Health Check", function () {
    var app;
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var Fastify, healthRoutes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("fastify"); })];
                case 1:
                    Fastify = (_a.sent()).default;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/routes/health.js"); })];
                case 2:
                    healthRoutes = (_a.sent()).healthRoutes;
                    app = Fastify({ logger: false });
                    return [4 /*yield*/, app.register(healthRoutes)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, app.ready()];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.after)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (app === null || app === void 0 ? void 0 : app.close())];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("GET /health/live returns 200 with status ok", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res, body;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "GET", url: "/health/live" })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 200);
                    body = res.json();
                    strict_1.default.equal(body.status, "ok");
                    strict_1.default.ok(body.timestamp);
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("GET /health/ready returns 200", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "GET", url: "/health/ready" })];
                case 1:
                    res = _a.sent();
                    strict_1.default.equal(res.statusCode, 200);
                    strict_1.default.equal(res.json().status, "ok");
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Route Integration — Auth on Check Routes ──────────────────────────────
(0, node_test_1.describe)("Route Integration — Auth on Check Routes", function () {
    var app;
    (0, node_test_1.before)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var Fastify, checkRoutes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("fastify"); })];
                case 1:
                    Fastify = (_a.sent()).default;
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/routes/check.js"); })];
                case 2:
                    checkRoutes = (_a.sent()).checkRoutes;
                    app = Fastify({ logger: false });
                    return [4 /*yield*/, app.register(checkRoutes)];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, app.ready()];
                case 4:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.after)(function () { return __awaiter(void 0, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (app === null || app === void 0 ? void 0 : app.close())];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("allows request without Authorization header (anonymous)", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({ method: "POST", url: "/v1/check", payload: { text: "Hello world." } })];
                case 1:
                    res = _a.sent();
                    strict_1.default.ok([200, 429, 500].includes(res.statusCode), "Expected 200/429/500, got ".concat(res.statusCode));
                    return [2 /*return*/];
            }
        });
    }); });
    (0, node_test_1.it)("handles invalid Authorization header gracefully", function () { return __awaiter(void 0, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, app.inject({
                        method: "POST",
                        url: "/v1/check",
                        headers: { authorization: "Bearer totally-invalid-token" },
                        payload: { text: "Hello world." },
                    })];
                case 1:
                    res = _a.sent();
                    strict_1.default.ok([200, 429, 500].includes(res.statusCode), "Expected 200/429/500, got ".concat(res.statusCode));
                    return [2 /*return*/];
            }
        });
    }); });
});
// ─── Database Schema ────────────────────────────────────────────────────────
(0, node_test_1.describe)("Database Schema", function () {
    (0, node_test_1.it)("schema module imports successfully", function () { return __awaiter(void 0, void 0, void 0, function () {
        var schema;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../src/db/schema.js"); })];
                case 1:
                    schema = _a.sent();
                    strict_1.default.ok(schema.users, "users table");
                    strict_1.default.ok(schema.organizations, "organizations table");
                    strict_1.default.ok(schema.memberships, "memberships table");
                    strict_1.default.ok(schema.preferences, "preferences table");
                    strict_1.default.ok(schema.usageEvents, "usageEvents table");
                    strict_1.default.ok(schema.feedbackEvents, "feedbackEvents table");
                    strict_1.default.ok(schema.voiceProfiles, "voiceProfiles table");
                    return [2 /*return*/];
            }
        });
    }); });
});
