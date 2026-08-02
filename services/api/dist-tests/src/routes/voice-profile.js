"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
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
exports.getProfile = getProfile;
exports.getProfileSync = getProfileSync;
exports.voiceProfileRoutes = voiceProfileRoutes;
var writing_core_1 = require("@prosepilot/writing-core");
var index_js_1 = require("../db/index.js");
var schema_js_1 = require("../db/schema.js");
var drizzle_orm_1 = require("drizzle-orm");
var auth_js_1 = require("../middleware/auth.js");
// Per-user profile cache — keyed by userId
var profileCache = new Map();
function getCacheEntry(userId) {
    var entry = profileCache.get(userId);
    if (!entry) {
        entry = { profile: null, loaded: false };
        profileCache.set(userId, entry);
    }
    return entry;
}
// Load profile from database for a specific user
function ensureLoaded(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var entry, rows, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    entry = getCacheEntry(userId);
                    if (entry.loaded)
                        return [2 /*return*/];
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, index_js_1.db.select().from(schema_js_1.voiceProfiles).where((0, drizzle_orm_1.eq)(schema_js_1.voiceProfiles.userId, userId)).limit(1)];
                case 2:
                    rows = _c.sent();
                    if (rows.length > 0) {
                        entry.profile = rows[0].profileData;
                        entry.profile.id = rows[0].id;
                        entry.profile.sampleCount = (_b = rows[0].sampleCount) !== null && _b !== void 0 ? _b : 0;
                    }
                    return [3 /*break*/, 4];
                case 3:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 4:
                    entry.loaded = true;
                    return [2 /*return*/];
            }
        });
    });
}
// Export for use by other routes (grammar check, document check)
function getProfile(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, ensureLoaded(userId)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, (_a = getCacheEntry(userId).profile) !== null && _a !== void 0 ? _a : undefined];
            }
        });
    });
}
// Sync version for backwards compatibility — returns cached value only
function getProfileSync(userId) {
    var _a;
    return (_a = getCacheEntry(userId).profile) !== null && _a !== void 0 ? _a : undefined;
}
function saveProfile(userId, profile) {
    return __awaiter(this, void 0, void 0, function () {
        var existing, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, index_js_1.db.select().from(schema_js_1.voiceProfiles).where((0, drizzle_orm_1.eq)(schema_js_1.voiceProfiles.userId, userId)).limit(1)];
                case 1:
                    existing = _b.sent();
                    if (!(existing.length > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, index_js_1.db.update(schema_js_1.voiceProfiles).set({
                            profileData: profile,
                            sampleCount: profile.sampleCount,
                            name: profile.name,
                            updatedAt: new Date(),
                        }).where((0, drizzle_orm_1.eq)(schema_js_1.voiceProfiles.userId, userId))];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 5];
                case 3: return [4 /*yield*/, index_js_1.db.insert(schema_js_1.voiceProfiles).values({
                        userId: userId,
                        name: profile.name,
                        profileData: profile,
                        sampleCount: profile.sampleCount,
                    })];
                case 4:
                    _b.sent();
                    _b.label = 5;
                case 5: return [3 /*break*/, 7];
                case 6:
                    _a = _b.sent();
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
function voiceProfileRoutes(app) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            // GET /v1/voice-profile — Get voice profile
            app.get("/v1/voice-profile", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var userId, profile;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            userId = ((_a = request.auth) === null || _a === void 0 ? void 0 : _a.userId) || "anonymous";
                            return [4 /*yield*/, ensureLoaded(userId)];
                        case 1:
                            _b.sent();
                            profile = getCacheEntry(userId).profile;
                            if (!profile) {
                                return [2 /*return*/, reply.send({ profile: null, summary: null })];
                            }
                            return [2 /*return*/, reply.send({
                                    profile: profile,
                                    summary: (0, writing_core_1.getProfileSummary)(profile),
                                })];
                    }
                });
            }); });
            // POST /v1/voice-profile — Create or update voice profile from text samples
            app.post("/v1/voice-profile", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var userId, _a, text, name, entry, analysis, merged;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            userId = ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.userId) || "anonymous";
                            _a = request.body, text = _a.text, name = _a.name;
                            if (!text || text.trim().length < 50) {
                                return [2 /*return*/, reply.status(400).send({
                                        error: "INSUFFICIENT_TEXT",
                                        message: "Provide at least 50 characters of text to build a voice profile",
                                    })];
                            }
                            return [4 /*yield*/, ensureLoaded(userId)];
                        case 1:
                            _c.sent();
                            entry = getCacheEntry(userId);
                            // Get existing profile or create new one
                            if (!entry.profile) {
                                entry.profile = (0, writing_core_1.createEmptyProfile)(userId, name || "My Voice");
                            }
                            analysis = (0, writing_core_1.analyzeText)(text);
                            merged = (0, writing_core_1.mergeAnalyses)(entry.profile, analysis, entry.profile.sampleCount);
                            // Update profile
                            entry.profile = __assign(__assign(__assign(__assign({}, entry.profile), merged), { sampleCount: entry.profile.sampleCount + 1, updatedAt: new Date().toISOString() }), (name ? { name: name } : {}));
                            // Persist to database
                            return [4 /*yield*/, saveProfile(userId, entry.profile)];
                        case 2:
                            // Persist to database
                            _c.sent();
                            return [2 /*return*/, reply.send({
                                    profile: entry.profile,
                                    summary: (0, writing_core_1.getProfileSummary)(entry.profile),
                                    message: "Voice profile updated from ".concat(entry.profile.sampleCount, " sample(s)"),
                                })];
                    }
                });
            }); });
            // POST /v1/voice-profile/analyze — Analyze text without saving (preview)
            app.post("/v1/voice-profile/analyze", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var text, analysis;
                return __generator(this, function (_a) {
                    text = request.body.text;
                    if (!text || text.trim().length < 20) {
                        return [2 /*return*/, reply.status(400).send({
                                error: "INSUFFICIENT_TEXT",
                                message: "Provide at least 20 characters to analyze",
                            })];
                    }
                    analysis = (0, writing_core_1.analyzeText)(text);
                    return [2 /*return*/, reply.send({ analysis: analysis })];
                });
            }); });
            // DELETE /v1/voice-profile — Reset voice profile
            app.delete("/v1/voice-profile", { preHandler: [auth_js_1.verifyRequest] }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var userId, _a;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            userId = ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.userId) || "anonymous";
                            profileCache.delete(userId);
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, index_js_1.db.delete(schema_js_1.voiceProfiles).where((0, drizzle_orm_1.eq)(schema_js_1.voiceProfiles.userId, userId))];
                        case 2:
                            _c.sent();
                            return [3 /*break*/, 4];
                        case 3:
                            _a = _c.sent();
                            return [3 /*break*/, 4];
                        case 4: return [2 /*return*/, reply.send({ message: "Voice profile deleted" })];
                    }
                });
            }); });
            return [2 /*return*/];
        });
    });
}
