"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkRoutes = checkRoutes;
var drizzle_orm_1 = require("drizzle-orm");
var grammar_js_1 = require("../engine/grammar.js");
var index_js_1 = require("../db/index.js");
var schema_js_1 = require("../db/schema.js");
var voice_profile_js_1 = require("./voice-profile.js");
var auth_js_1 = require("../middleware/auth.js");
function checkRoutes(app) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            // POST /v1/check - Grammar, spelling, punctuation, clarity, style issues
            app.post("/v1/check", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var _a, text, _b, mode, _c, language, _d, documentType, userId, userRows, CHAR_LIMIT, periodStart, usageResult, charsUsed, voiceProfile, result, userRows_1, _e, error_1;
                var _f, _g, _h;
                return __generator(this, function (_j) {
                    switch (_j.label) {
                        case 0:
                            _a = request.body, text = _a.text, _b = _a.mode, mode = _b === void 0 ? "review" : _b, _c = _a.language, language = _c === void 0 ? "en-US" : _c, _d = _a.documentType, documentType = _d === void 0 ? "general" : _d;
                            if (!text || typeof text !== "string") {
                                return [2 /*return*/, reply.status(400).send({ error: "TEXT_REQUIRED", message: "Text field is required" })];
                            }
                            if (text.length > 100000) {
                                return [2 /*return*/, reply.status(400).send({ error: "TEXT_TOO_LARGE", message: "Text exceeds 100,000 character limit" })];
                            }
                            if (text.trim().length === 0) {
                                return [2 /*return*/, reply.status(400).send({ error: "TEXT_EMPTY", message: "Text cannot be empty" })];
                            }
                            _j.label = 1;
                        case 1:
                            _j.trys.push([1, 12, , 13]);
                            userId = ((_f = request.auth) === null || _f === void 0 ? void 0 : _f.userId) || "anonymous";
                            return [4 /*yield*/, index_js_1.db.select({ id: schema_js_1.users.id }).from(schema_js_1.users).where((0, drizzle_orm_1.eq)(schema_js_1.users.clerkId, userId)).limit(1)];
                        case 2:
                            userRows = _j.sent();
                            CHAR_LIMIT = userRows.length > 0 ? 100000 : 10000;
                            periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                            return [4 /*yield*/, index_js_1.db
                                    .select({ totalChars: (0, drizzle_orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["coalesce(sum(", "), 0)"], ["coalesce(sum(", "), 0)"])), schema_js_1.usageEvents.characterCount) })
                                    .from(schema_js_1.usageEvents)
                                    .where(userRows.length > 0
                                    ? (0, drizzle_orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["", " = ", " AND ", " >= ", ""], ["", " = ", " AND ", " >= ", ""])), schema_js_1.usageEvents.actorId, userRows[0].id, schema_js_1.usageEvents.createdAt, periodStart) : (0, drizzle_orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["", " IS NULL AND ", " >= ", ""], ["", " IS NULL AND ", " >= ", ""])), schema_js_1.usageEvents.actorId, schema_js_1.usageEvents.createdAt, periodStart))];
                        case 3:
                            usageResult = _j.sent();
                            charsUsed = ((_g = usageResult[0]) === null || _g === void 0 ? void 0 : _g.totalChars) || 0;
                            if (charsUsed + text.length > CHAR_LIMIT) {
                                return [2 /*return*/, reply.status(429).send({
                                        error: "USAGE_LIMIT_EXCEEDED",
                                        message: "Monthly character limit reached. Used ".concat(charsUsed.toLocaleString(), " of ").concat(CHAR_LIMIT.toLocaleString(), " characters."),
                                        charactersUsed: charsUsed,
                                        charactersLimit: CHAR_LIMIT,
                                    })];
                            }
                            return [4 /*yield*/, (0, voice_profile_js_1.getProfile)(userId)];
                        case 4:
                            voiceProfile = _j.sent();
                            return [4 /*yield*/, (0, grammar_js_1.checkGrammar)({ text: text, mode: mode, language: language, documentType: documentType, voiceProfile: voiceProfile })];
                        case 5:
                            result = _j.sent();
                            _j.label = 6;
                        case 6:
                            _j.trys.push([6, 10, , 11]);
                            return [4 /*yield*/, index_js_1.db.select({ id: schema_js_1.users.id }).from(schema_js_1.users).where((0, drizzle_orm_1.eq)(schema_js_1.users.clerkId, userId)).limit(1)];
                        case 7:
                            userRows_1 = _j.sent();
                            if (!(userRows_1.length > 0)) return [3 /*break*/, 9];
                            return [4 /*yield*/, index_js_1.db.insert(schema_js_1.usageEvents).values({
                                    actorId: userRows_1[0].id,
                                    feature: "check",
                                    characterCount: text.length,
                                    latencyMs: ((_h = result.usage) === null || _h === void 0 ? void 0 : _h.latencyMs) || 0,
                                })];
                        case 8:
                            _j.sent();
                            _j.label = 9;
                        case 9: return [3 /*break*/, 11];
                        case 10:
                            _e = _j.sent();
                            return [3 /*break*/, 11];
                        case 11: return [2 /*return*/, reply.send(result)];
                        case 12:
                            error_1 = _j.sent();
                            return [2 /*return*/, reply.status(500).send({ error: "INTERNAL_ERROR", message: "Check failed" })];
                        case 13: return [2 /*return*/];
                    }
                });
            }); });
            // POST /v1/rewrite - Rewrite selected text with tone control
            app.post("/v1/rewrite", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var _a, text, _b, tone, customInstruction, _c, length, _d, language, validTones, userId, userRows, CHAR_LIMIT, periodStart, usageResult, charsUsed, result, userRows_2, _e, error_2;
                var _f, _g, _h;
                return __generator(this, function (_j) {
                    switch (_j.label) {
                        case 0:
                            _a = request.body, text = _a.text, _b = _a.tone, tone = _b === void 0 ? "professional" : _b, customInstruction = _a.customInstruction, _c = _a.length, length = _c === void 0 ? "same" : _c, _d = _a.language, language = _d === void 0 ? "en-US" : _d;
                            if (!text || typeof text !== "string") {
                                return [2 /*return*/, reply.status(400).send({ error: "TEXT_REQUIRED", message: "Text field is required" })];
                            }
                            if (text.length > 50000) {
                                return [2 /*return*/, reply.status(400).send({ error: "TEXT_TOO_LARGE", message: "Text exceeds 50,000 character limit for rewrite" })];
                            }
                            validTones = ["professional", "executive", "concise", "diplomatic", "formal", "affirmative", "friendly", "confident", "empathetic", "persuasive", "casual", "firm", "custom"];
                            if (!validTones.includes(tone)) {
                                return [2 /*return*/, reply.status(400).send({ error: "INVALID_TONE", message: "Invalid tone. Must be one of: ".concat(validTones.join(", ")) })];
                            }
                            _j.label = 1;
                        case 1:
                            _j.trys.push([1, 11, , 12]);
                            userId = ((_f = request.auth) === null || _f === void 0 ? void 0 : _f.userId) || "anonymous";
                            return [4 /*yield*/, index_js_1.db.select({ id: schema_js_1.users.id }).from(schema_js_1.users).where((0, drizzle_orm_1.eq)(schema_js_1.users.clerkId, userId)).limit(1)];
                        case 2:
                            userRows = _j.sent();
                            CHAR_LIMIT = userRows.length > 0 ? 100000 : 10000;
                            periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                            return [4 /*yield*/, index_js_1.db
                                    .select({ totalChars: (0, drizzle_orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["coalesce(sum(", "), 0)"], ["coalesce(sum(", "), 0)"])), schema_js_1.usageEvents.characterCount) })
                                    .from(schema_js_1.usageEvents)
                                    .where(userRows.length > 0
                                    ? (0, drizzle_orm_1.sql)(templateObject_5 || (templateObject_5 = __makeTemplateObject(["", " = ", " AND ", " >= ", ""], ["", " = ", " AND ", " >= ", ""])), schema_js_1.usageEvents.actorId, userRows[0].id, schema_js_1.usageEvents.createdAt, periodStart) : (0, drizzle_orm_1.sql)(templateObject_6 || (templateObject_6 = __makeTemplateObject(["", " IS NULL AND ", " >= ", ""], ["", " IS NULL AND ", " >= ", ""])), schema_js_1.usageEvents.actorId, schema_js_1.usageEvents.createdAt, periodStart))];
                        case 3:
                            usageResult = _j.sent();
                            charsUsed = ((_g = usageResult[0]) === null || _g === void 0 ? void 0 : _g.totalChars) || 0;
                            if (charsUsed + text.length > CHAR_LIMIT) {
                                return [2 /*return*/, reply.status(429).send({
                                        error: "USAGE_LIMIT_EXCEEDED",
                                        message: "Monthly character limit reached. Used ".concat(charsUsed.toLocaleString(), " of ").concat(CHAR_LIMIT.toLocaleString(), " characters."),
                                        charactersUsed: charsUsed,
                                        charactersLimit: CHAR_LIMIT,
                                    })];
                            }
                            return [4 /*yield*/, (0, grammar_js_1.rewriteText)({ text: text, tone: tone, customInstruction: customInstruction, length: length, language: language })];
                        case 4:
                            result = _j.sent();
                            _j.label = 5;
                        case 5:
                            _j.trys.push([5, 9, , 10]);
                            return [4 /*yield*/, index_js_1.db.select({ id: schema_js_1.users.id }).from(schema_js_1.users).where((0, drizzle_orm_1.eq)(schema_js_1.users.clerkId, userId)).limit(1)];
                        case 6:
                            userRows_2 = _j.sent();
                            if (!(userRows_2.length > 0)) return [3 /*break*/, 8];
                            return [4 /*yield*/, index_js_1.db.insert(schema_js_1.usageEvents).values({
                                    actorId: userRows_2[0].id,
                                    feature: "rewrite",
                                    characterCount: text.length,
                                    latencyMs: ((_h = result.usage) === null || _h === void 0 ? void 0 : _h.latencyMs) || 0,
                                })];
                        case 7:
                            _j.sent();
                            _j.label = 8;
                        case 8: return [3 /*break*/, 10];
                        case 9:
                            _e = _j.sent();
                            return [3 /*break*/, 10];
                        case 10: return [2 /*return*/, reply.send(result)];
                        case 11:
                            error_2 = _j.sent();
                            return [2 /*return*/, reply.status(500).send({ error: "INTERNAL_ERROR", message: "Rewrite failed" })];
                        case 12: return [2 /*return*/];
                    }
                });
            }); });
            // POST /v1/facts/validate - Compare protected facts
            app.post("/v1/facts/validate", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var _a, original, rewritten, result, error_3;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _a = request.body, original = _a.original, rewritten = _a.rewritten;
                            if (!original || !rewritten) {
                                return [2 /*return*/, reply.status(400).send({ error: "BOTH_REQUIRED", message: "Both original and rewritten text are required" })];
                            }
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, grammar_js_1.validateFactsEndpoint)(original, rewritten)];
                        case 2:
                            result = _b.sent();
                            return [2 /*return*/, reply.send(result)];
                        case 3:
                            error_3 = _b.sent();
                            return [2 /*return*/, reply.status(500).send({ error: "INTERNAL_ERROR", message: "Fact validation failed" })];
                        case 4: return [2 /*return*/];
                    }
                });
            }); });
            return [2 /*return*/];
        });
    });
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4, templateObject_5, templateObject_6;
