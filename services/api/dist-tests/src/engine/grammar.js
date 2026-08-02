"use strict";
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGrammar = checkGrammar;
exports.rewriteText = rewriteText;
exports.validateFactsEndpoint = validateFactsEndpoint;
var writing_core_1 = require("@prosepilot/writing-core");
var crypto_1 = require("crypto");
var DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
var DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
var LANGUAGETOOL_URL = process.env.LANGUAGETOOL_URL || "http://localhost:8010";
function callLanguageTool(text) {
    return __awaiter(this, void 0, void 0, function () {
        var response, data, sourceHash_1, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // Skip if LanguageTool URL is not configured or points to localhost (not deployed on Railway)
                    if (!process.env.LANGUAGETOOL_URL || LANGUAGETOOL_URL === "http://localhost:8010") {
                        return [2 /*return*/, []];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4 /*yield*/, fetch("".concat(LANGUAGETOOL_URL, "/v2/check"), {
                            method: "POST",
                            headers: { "Content-Type": "application/x-www-form-urlencoded" },
                            body: new URLSearchParams({ text: text, language: "en-US" }),
                            signal: AbortSignal.timeout(5000),
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok)
                        return [2 /*return*/, []];
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    return [4 /*yield*/, (0, writing_core_1.computeHash)(text)];
                case 4:
                    sourceHash_1 = _a.sent();
                    return [2 /*return*/, (data.matches || []).map(function (match) {
                            var _a;
                            var category = mapLTCategory(match.rule.category.id);
                            var confidence = match.replacements.length > 0 ? 0.95 : 0.7;
                            return {
                                id: "lt_".concat((0, crypto_1.randomUUID)().slice(0, 8)),
                                category: category,
                                rule: match.rule.id,
                                startUtf16: match.offset,
                                endUtf16: match.offset + match.length,
                                original: text.slice(match.offset, match.offset + match.length),
                                replacement: ((_a = match.replacements[0]) === null || _a === void 0 ? void 0 : _a.value) || text.slice(match.offset, match.offset + match.length),
                                confidence: confidence,
                                safeAuto: isSafeAuto(category, confidence, match.replacements.length),
                                severity: mapLTSeverity(match.rule.category.id),
                                explanation: match.message,
                                sourceHash: sourceHash_1,
                            };
                        })];
                case 5:
                    error_1 = _a.sent();
                    // LanguageTool unavailable — fall through to other tiers
                    return [2 /*return*/, []];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function mapLTCategory(categoryId) {
    if (categoryId.includes("SPELL"))
        return "spelling";
    if (categoryId.includes("GRAMMAR"))
        return "grammar";
    if (categoryId.includes("PUNCT"))
        return "punctuation";
    if (categoryId.includes("STYLE"))
        return "style";
    if (categoryId.includes("TYPO"))
        return "spelling";
    return "grammar";
}
function mapLTSeverity(categoryId) {
    if (categoryId.includes("TYPO") || categoryId.includes("MISSPELL"))
        return "error";
    if (categoryId.includes("GRAMMAR"))
        return "warning";
    return "info";
}
function isSafeAuto(category, confidence, replacementCount) {
    if (confidence < 0.9)
        return false;
    if (replacementCount > 1)
        return false;
    if (category === "clarity" || category === "tone" || category === "style")
        return false;
    return true;
}
// --- DeepSeek Integration ---
function callDeepSeek(messages_1) {
    return __awaiter(this, arguments, void 0, function (messages, model) {
        var response, data;
        var _a, _b, _c;
        if (model === void 0) { model = "deepseek-chat"; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, fetch("".concat(DEEPSEEK_BASE_URL, "/chat/completions"), {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: "Bearer ".concat(DEEPSEEK_API_KEY),
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: messages,
                            temperature: 0.3,
                            max_tokens: 4096,
                        }),
                        signal: AbortSignal.timeout(30000),
                    })];
                case 1:
                    response = _d.sent();
                    if (!response.ok) {
                        throw new Error("DeepSeek API error: ".concat(response.status));
                    }
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _d.sent();
                    return [2 /*return*/, ((_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || ""];
            }
        });
    });
}
// --- Grammar Check Engine ---
// Tier 0: Rule-based fixes (instant, free, no API call)
function detectRuleBasedIssues(text) {
    var issues = [];
    var sourceHash = computeHashSync(text);
    var rules = [
        // === CAPITALIZATION ===
        // Sentence starts with lowercase after period/exclamation/question
        { pattern: /([.!?]\s+)([a-z])/g, replacement: function (_m, p1, p2) { return p1 + p2.toUpperCase(); }, category: "grammar", rule: "capitalize_after_period", explanation: "Capitalize the first word of a new sentence." },
        // Sentence start at beginning of text — capitalize first letter
        { pattern: /^([a-z])/, replacement: function (_m, letter) { return letter.toUpperCase(); }, category: "grammar", rule: "capitalize_sentence_start", explanation: "Capitalize the first word of a sentence." },
        // Product/brand names — Prosepilot → ProsePilot
        { pattern: /\bProsepilot\b/g, replacement: "ProsePilot", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'ProsePilot' should be capitalized correctly." },
        { pattern: /\bGrammarly\b/gi, replacement: "Grammarly", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Grammarly' should be capitalized correctly." },
        { pattern: /\bMicrosoft\b/gi, replacement: "Microsoft", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Microsoft' should be capitalized correctly." },
        { pattern: /\bGoogle\b/gi, replacement: "Google", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'Google' should be capitalized correctly." },
        { pattern: /\bOpenai\b/g, replacement: "OpenAI", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'OpenAI' should be capitalized correctly." },
        { pattern: /\bDeepseek\b/g, replacement: "DeepSeek", category: "spelling", rule: "proper_noun_capitalization", explanation: "Proper noun 'DeepSeek' should be capitalized correctly." },
        // "the edge" → "The Edge" (Microsoft Edge product)
        { pattern: /\bthe edge\b/gi, replacement: "The Edge", category: "grammar", rule: "proper_noun_article", explanation: "'The Edge' is a proper noun (product name) and should be capitalized." },
        // === PUNCTUATION ===
        // Space before comma/period/semicolon/colon
        { pattern: /(\w) ,/g, replacement: "$1,", category: "punctuation", rule: "space_before_comma", explanation: "Remove space before comma." },
        { pattern: /(\w) \./g, replacement: "$1.", category: "punctuation", rule: "space_before_period", explanation: "Remove space before period." },
        { pattern: /(\w) ;/g, replacement: "$1;", category: "punctuation", rule: "space_before_semicolon", explanation: "Remove space before semicolon." },
        { pattern: /(\w) :/g, replacement: "$1:", category: "punctuation", rule: "space_before_colon", explanation: "Remove space before colon." },
        // Space before closing quote/bracket
        { pattern: /(\w) \)/g, replacement: "$1)", category: "punctuation", rule: "space_before_paren", explanation: "Remove space before closing parenthesis." },
        // Double spaces
        { pattern: /  +/g, replacement: " ", category: "style", rule: "double_space", explanation: "Remove extra spaces." },
        // Missing period at end of sentence
        { pattern: /^([A-Z][^.!?}\n"]+)$/m, replacement: "$1.", category: "punctuation", rule: "missing_period", explanation: "Sentences should end with a period." },
        // Double punctuation
        { pattern: /\.\./g, replacement: "...", category: "punctuation", rule: "double_period", explanation: "Use an ellipsis (...) not double periods." },
        // Missing comma after introductory/conditional clause
        { pattern: /\b(If|When|While|Although|Because|Since|Unless|After|Before|Until|Once|Whenever|Wherever|Whether)\s+([^,]+?)\s+([A-Z][a-z]*)/g, replacement: "$1 $2, $3", category: "punctuation", rule: "comma_after_conditional", explanation: "Use a comma after an introductory or conditional clause." },
        // === WORD FORM ERRORS ===
        // Gerund after possessive/preposition — should be noun
        { pattern: /\bour discussing\b/gi, replacement: "our discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
        { pattern: /\btheir discussing\b/gi, replacement: "their discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after a possessive, not the gerund 'discussing'." },
        { pattern: /\bthe discussing\b/gi, replacement: "the discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'the', not the gerund 'discussing'." },
        { pattern: /\ba discussing\b/gi, replacement: "a discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'a', not the gerund 'discussing'." },
        { pattern: /\bduring discussing\b/gi, replacement: "during the discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use 'during the discussion', not 'during discussing'." },
        { pattern: /\bper our discussing\b/gi, replacement: "Per our discussion", category: "grammar", rule: "gerund_to_noun", explanation: "Use the noun form 'discussion' after 'our', not the gerund 'discussing'." },
        // === UNCOUNTABLE NOUNS ===
        { pattern: /\bfoods\b/gi, replacement: "food", category: "grammar", rule: "uncountable_noun", explanation: "'Food' is typically uncountable. Use 'food' not 'foods'." },
        { pattern: /\binformations\b/gi, replacement: "information", category: "grammar", rule: "uncountable_noun", explanation: "'Information' is uncountable. Use 'information' not 'informations'." },
        { pattern: /\badvices\b/gi, replacement: "advice", category: "grammar", rule: "uncountable_noun", explanation: "'Advice' is uncountable. Use 'advice' not 'advices'." },
        { pattern: /\bequipments\b/gi, replacement: "equipment", category: "grammar", rule: "uncountable_noun", explanation: "'Equipment' is uncountable. Use 'equipment' not 'equipments'." },
        { pattern: /\bfurnitures\b/gi, replacement: "furniture", category: "grammar", rule: "uncountable_noun", explanation: "'Furniture' is uncountable. Use 'furniture' not 'furnitures'." },
        { pattern: /\bstaffs\b/gi, replacement: "staff", category: "grammar", rule: "uncountable_noun", explanation: "'Staff' is typically uncountable. Use 'staff' not 'staffs'." },
        { pattern: /\bhomeworks\b/gi, replacement: "homework", category: "grammar", rule: "uncountable_noun", explanation: "'Homework' is uncountable. Use 'homework' not 'homeworks'." },
        { pattern: /\bmails\b/g, replacement: "mail", category: "grammar", rule: "uncountable_noun", explanation: "'Mail' is typically uncountable. Use 'mail' not 'mails'." },
        { pattern: /\bprogresses\b/gi, replacement: "progress", category: "grammar", rule: "uncountable_noun", explanation: "'Progress' is uncountable. Use 'progress' not 'progresses'." },
        { pattern: /\bresearches\b/gi, replacement: "research", category: "grammar", rule: "uncountable_noun", explanation: "'Research' is uncountable. Use 'research' not 'researches'." },
        // === MISSING OBJECT PRONOUN ===
        // "they finished on time" → "they finished it on time"
        { pattern: /\b(finished|completed|submitted|reviewed|approved|processed|resolved|addressed|handled|finished up|wrapped up) (on time|early|late|before|after|today|yesterday|this week|last week|this month|next week)\b/gi, replacement: "$1 it $2", category: "grammar", rule: "missing_object_pronoun", explanation: "This verb typically needs a direct object. Add 'it' to clarify what was finished." },
        // === ADJECTIVE-NOUN WORD ORDER ===
        // Common reversed pairs in property management
        { pattern: /\bupgrade premium\b/gi, replacement: "premium upgrade", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'premium upgrade' not 'upgrade premium'." },
        { pattern: /\breport inspection\b/gi, replacement: "inspection report", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'inspection report' not 'report inspection'." },
        { pattern: /\binspection site visit\b/gi, replacement: "site visit inspection", category: "style", rule: "adjective_noun_order", explanation: "Reorder: 'site visit inspection' not 'inspection site visit'." },
        { pattern: /\btile shower\b/gi, replacement: "shower tile", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'shower tile' not 'tile shower'." },
        { pattern: /\bschedule gate\b/gi, replacement: "gate schedule", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'gate schedule' not 'schedule gate'." },
        { pattern: /\btrim border\b/gi, replacement: "border trim", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'border trim' not 'trim border'." },
        { pattern: /\blist units\b/gi, replacement: "unit list", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'unit list' not 'list units'." },
        { pattern: /\bcondition exterior\b/gi, replacement: "exterior condition", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'exterior condition' not 'condition exterior'." },
        { pattern: /\breadiness unit\b/gi, replacement: "unit readiness", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'unit readiness' not 'readiness unit'." },
        { pattern: /\bupdates progress\b/gi, replacement: "progress updates", category: "style", rule: "adjective_noun_order", explanation: "Adjective before noun: 'progress updates' not 'updates progress'." },
    ];
    for (var _i = 0, rules_1 = rules; _i < rules_1.length; _i++) {
        var rule = rules_1[_i];
        var match = void 0;
        rule.pattern.lastIndex = 0;
        while ((match = rule.pattern.exec(text)) !== null) {
            var start = match.index;
            var end = start + match[0].length;
            // Compute replacement using the pattern's replacement string/function
            var fixed = void 0;
            if (typeof rule.replacement === "function") {
                fixed = match[0].replace(rule.pattern, rule.replacement);
            }
            else if (match.length > 1) {
                // Has capture groups — use the replacement with $1, $2 etc.
                fixed = match[0].replace(rule.pattern, rule.replacement);
            }
            else {
                // No capture groups — use the replacement string directly
                fixed = rule.replacement;
            }
            // Only add if the fix actually changes something
            if (fixed && fixed !== match[0]) {
                issues.push({
                    id: "rule_".concat((0, crypto_1.randomUUID)().slice(0, 8)),
                    category: rule.category,
                    rule: rule.rule,
                    startUtf16: start,
                    endUtf16: end,
                    original: match[0],
                    replacement: fixed,
                    confidence: 0.99,
                    safeAuto: true,
                    severity: "info",
                    explanation: rule.explanation,
                    sourceHash: sourceHash,
                });
            }
        }
    }
    return issues;
}
function computeHashSync(text) {
    // Quick synchronous hash for rule-based issues
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
        var char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return "sha256:".concat(Math.abs(hash).toString(16).padStart(8, "0"));
}
function checkGrammar(request) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, text, mode, lightweight, rulesOnly, voiceProfile, ruleIssues, filteredIssues, latencyMs_1, sourceHash_2, ltIssues, aiIssues, mergedIssues, allIssues, latencyMs, sourceHash;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    text = request.text, mode = request.mode, lightweight = request.lightweight, rulesOnly = request.rulesOnly, voiceProfile = request.voiceProfile;
                    ruleIssues = detectRuleBasedIssues(text);
                    if (!rulesOnly) return [3 /*break*/, 2];
                    filteredIssues = voiceProfile
                        ? ruleIssues.filter(function (issue) { return (0, writing_core_1.shouldShowIssue)(voiceProfile, issue); })
                        : ruleIssues;
                    latencyMs_1 = Date.now() - startTime;
                    return [4 /*yield*/, (0, writing_core_1.computeHash)(text)];
                case 1:
                    sourceHash_2 = _a.sent();
                    return [2 /*return*/, {
                            issues: filteredIssues,
                            updatedHash: sourceHash_2,
                            usage: {
                                characterCount: text.length,
                                issueCount: filteredIssues.length,
                                checkMode: mode,
                                latencyMs: latencyMs_1,
                                engineTier: "rule",
                            },
                        }];
                case 2: return [4 /*yield*/, callLanguageTool(text)];
                case 3:
                    ltIssues = _a.sent();
                    aiIssues = [];
                    if (!(!lightweight && (mode === "rewrite" || mode === "report" || mode === "review" || ltIssues.length > 0))) return [3 /*break*/, 5];
                    return [4 /*yield*/, callDeepSeekForIssues(text)];
                case 4:
                    aiIssues = _a.sent();
                    _a.label = 5;
                case 5:
                    mergedIssues = mergeAllIssues(ruleIssues, ltIssues, aiIssues);
                    allIssues = voiceProfile
                        ? mergedIssues.filter(function (issue) { return (0, writing_core_1.shouldShowIssue)(voiceProfile, issue); })
                        : mergedIssues;
                    latencyMs = Date.now() - startTime;
                    return [4 /*yield*/, (0, writing_core_1.computeHash)(text)];
                case 6:
                    sourceHash = _a.sent();
                    return [2 /*return*/, {
                            issues: allIssues,
                            updatedHash: sourceHash,
                            usage: {
                                characterCount: text.length,
                                issueCount: allIssues.length,
                                checkMode: mode,
                                latencyMs: latencyMs,
                                engineTier: aiIssues.length > 0 ? "deepseek" : ltIssues.length > 0 ? "lt" : "rule",
                            },
                        }];
            }
        });
    });
}
function callDeepSeekForIssues(text) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt_1, response, sourceHash, parsed, validated, _i, parsed_1, item, original, replacement, start, end, actualAtOffset, foundIndex, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    prompt_1 = "You are a professional grammar and style checker. Analyze the following text for grammar, spelling, punctuation, clarity, style, and tone issues.\n\nReturn a JSON array of issues. Each issue must have:\n- \"category\": one of \"grammar\", \"spelling\", \"punctuation\", \"clarity\", \"style\", \"tone\", \"conciseness\"\n- \"rule\": a short rule identifier (e.g. \"passive_voice\", \"wordiness\", \"unclear_antecedent\")\n- \"original\": the EXACT problematic text copied character-for-character from the input\n- \"replacement\": the suggested fix\n- \"confidence\": 0.0 to 1.0\n- \"severity\": \"error\", \"warning\", \"info\", or \"suggestion\"\n- \"explanation\": a clear explanation of the issue\n\nCRITICAL RULES:\n1. The \"original\" field MUST be an exact substring of the input text \u2014 copy it character-for-character\n2. Do NOT include text from multiple sentences in one issue \u2014 keep each issue to a single phrase or clause\n3. Do NOT modify or \"clean up\" the original text \u2014 copy exactly as it appears\n4. If you're unsure about exact text, skip the issue\n\nSPECIFIC PATTERNS TO CHECK:\n- PROPER NOUNS: Product/brand names MUST be capitalized correctly: \"prosepilot\" \u2192 \"ProsePilot\", \"grammarly\" \u2192 \"Grammarly\", \"deepseek\" \u2192 \"DeepSeek\", \"openai\" \u2192 \"OpenAI\", \"microsoft\" \u2192 \"Microsoft\"\n- ARTICLE CAPITALIZATION: \"the edge\" \u2192 \"The Edge\" (when referring to a product), \"the internet\" \u2192 \"The Internet\" (when used as a proper noun)\n- SENTENCE START: First word of every sentence must be capitalized\n- COMPOUND WORDS: \"fireplace\" (not \"fire place\"), \"widespread\" (not \"wide-spread\"), \"inoperable\" (not \"no longer operable\")\n- SPELLING: \"leasing\" used as adjective \u2192 \"leased\" (past participle)\n- PUNCTUATION: semicolons before independent clauses (\"LLC; the service\")\n- CONCISENESS: \"I would like to recommend to have\" \u2192 \"I want to recommend having\"; \"We would like to request\" \u2192 \"We want to request\"\n- PASSIVE VOICE: Flag passive constructions when active voice is clearer\n- MISSING AUXILIARY VERB: \"work orders completed\" \u2192 \"work orders were completed\"; \"the unit delayed\" \u2192 \"the unit was delayed\"; \"the project finished\" \u2192 \"the project was finished\" \u2014 passive constructions missing \"was/were/is/are/been\"\n- WORDINESS: Flag unnecessary words and phrases\n- WRONG WORD FORM: Gerunds used where nouns are needed. \"Per our discussing\" \u2192 \"Per our discussion\"; \"Due to the happening\" \u2192 \"Due to the event\"; \"Based on our meeting discussing\" \u2192 \"Based on our meeting discussion\" \u2014 after possessives (our, their, the, a, an) and prepositions (of, for, during, after, before, per, based on), use the NOUN form not the gerund (-ing form)\n- ADJECTIVE-NOUN WORD ORDER: Adjectives come BEFORE nouns in English. \"upgrade premium\" \u2192 \"premium upgrade\"; \"report inspection\" \u2192 \"inspection report\"; \"tile shower\" \u2192 \"shower tile\"; \"schedule gate\" \u2192 \"gate schedule\"; \"trim border\" \u2192 \"border trim\" \u2014 when two nouns are used together, the describing noun becomes an adjective and goes first\n- REDUNDANT WORDS: \"efforts troubleshooting\" \u2192 \"troubleshooting efforts\"; \"ready units vacant\" \u2192 \"vacant ready units\" \u2014 check for reversed adjective-noun pairs\n- UNCOUNTABLE NOUNS: \"foods\" \u2192 \"food\"; \"informations\" \u2192 \"information\"; \"advices\" \u2192 \"advice\"; \"equipments\" \u2192 \"equipment\"; \"furnitures\" \u2192 \"furniture\"; \"researches\" \u2192 \"research\"; \"progresses\" \u2192 \"progress\" \u2014 these nouns are never pluralized\n- MISSING OBJECT PRONOUN: \"they finished on time\" \u2192 \"they finished it on time\"; \"we submitted early\" \u2192 \"we submitted it early\" \u2014 transitive verbs like finish, complete, submit, review, approve need a direct object\n- COMMA BEFORE \"AND\" IN COMPOUND SENTENCES: When two independent clauses (each with a subject + verb) are joined by \"and\", a comma goes before \"and\": \"The team worked hard and they finished on time\" \u2192 \"The team worked hard, and they finished on time\"\n\nBe AGGRESSIVE about finding issues. Even small improvements count. Return issues for EVERY mistake you find, no matter how minor.\n\nOnly return issues you are confident about. Return an empty array if the text is clean.\n\nText to check:\n\"\"\"\n".concat(text, "\n\"\"\"\n\nReturn ONLY the JSON array, no other text.");
                    return [4 /*yield*/, callDeepSeek([
                            { role: "system", content: "You are a grammar checking engine. Return only valid JSON arrays." },
                            { role: "user", content: prompt_1 },
                        ])];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, (0, writing_core_1.computeHash)(text)];
                case 2:
                    sourceHash = _a.sent();
                    parsed = JSON.parse(response);
                    if (!Array.isArray(parsed))
                        return [2 /*return*/, []];
                    validated = [];
                    for (_i = 0, parsed_1 = parsed; _i < parsed_1.length; _i++) {
                        item = parsed_1[_i];
                        original = item.original || "";
                        replacement = item.replacement || "";
                        if (!original || !replacement || original === replacement)
                            continue;
                        start = item.startUtf16 || 0;
                        end = item.endUtf16 || 0;
                        actualAtOffset = text.slice(start, end);
                        if (actualAtOffset === original) {
                            // Offset is correct
                            validated.push({
                                id: "ds_".concat((0, crypto_1.randomUUID)().slice(0, 8)),
                                category: item.category || "grammar",
                                rule: item.rule || "ai_suggestion",
                                startUtf16: start,
                                endUtf16: end,
                                original: original,
                                replacement: replacement,
                                confidence: item.confidence || 0.8,
                                safeAuto: false,
                                severity: item.severity || "suggestion",
                                explanation: item.explanation || "",
                                sourceHash: sourceHash,
                            });
                            continue;
                        }
                        foundIndex = text.indexOf(original);
                        if (foundIndex === -1) {
                            // Original text not found at all — skip this issue
                            // Skip silently — do not log user text
                            continue;
                        }
                        // Found it — use the correct offset
                        validated.push({
                            id: "ds_".concat((0, crypto_1.randomUUID)().slice(0, 8)),
                            category: item.category || "grammar",
                            rule: item.rule || "ai_suggestion",
                            startUtf16: foundIndex,
                            endUtf16: foundIndex + original.length,
                            original: original,
                            replacement: replacement,
                            confidence: item.confidence || 0.8,
                            safeAuto: false,
                            severity: item.severity || "suggestion",
                            explanation: item.explanation || "",
                            sourceHash: sourceHash,
                        });
                    }
                    return [2 /*return*/, validated];
                case 3:
                    error_2 = _a.sent();
                    // DeepSeek unavailable — return empty results
                    return [2 /*return*/, []];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function mergeAllIssues(ruleIssues, ltIssues, aiIssues) {
    // Start with rule-based issues (highest priority — always correct)
    var merged = __spreadArray([], ruleIssues, true);
    var usedPositions = new Set(ruleIssues.map(function (i) { return "".concat(i.startUtf16, "-").concat(i.endUtf16); }));
    // Add LT issues that don't overlap with rule-based
    for (var _i = 0, ltIssues_1 = ltIssues; _i < ltIssues_1.length; _i++) {
        var ltIssue = ltIssues_1[_i];
        var posKey = "".concat(ltIssue.startUtf16, "-").concat(ltIssue.endUtf16);
        if (!usedPositions.has(posKey)) {
            merged.push(ltIssue);
            usedPositions.add(posKey);
        }
    }
    // Add AI issues that don't overlap with any existing issue
    for (var _a = 0, aiIssues_1 = aiIssues; _a < aiIssues_1.length; _a++) {
        var aiIssue = aiIssues_1[_a];
        var posKey = "".concat(aiIssue.startUtf16, "-").concat(aiIssue.endUtf16);
        if (!usedPositions.has(posKey)) {
            merged.push(aiIssue);
            usedPositions.add(posKey);
        }
    }
    return merged.sort(function (a, b) { return a.startUtf16 - b.startUtf16; });
}
// --- Rewrite Engine ---
function rewriteText(request) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, text, tone, customInstruction, length, facts, factList, lengthInstruction, toneDescriptions, prompt, rewritten, cleaned, factValidation, latencyMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    text = request.text, tone = request.tone, customInstruction = request.customInstruction, length = request.length;
                    facts = (0, writing_core_1.extractProtectedFacts)(text);
                    factList = facts.map(function (f) { return "- ".concat(f.type, ": \"").concat(f.value, "\""); }).join("\n");
                    lengthInstruction = length === "shorter"
                        ? "Make the text shorter and more concise."
                        : length === "longer"
                            ? "Expand the text with more detail."
                            : "Keep approximately the same length.";
                    toneDescriptions = {
                        professional: "Clear, competent, and business-appropriate",
                        executive: "Authoritative, strategic, suitable for leadership audiences",
                        concise: "Brief and to-the-point, no unnecessary words",
                        diplomatic: "Tactful and considerate, softening potentially negative messages",
                        formal: "Standard formal business English, no contractions",
                        affirmative: "Positive and encouraging, emphasizing what can be done",
                        friendly: "Warm and approachable, conversational but professional",
                        confident: "Assertive and self-assured, decisive language",
                        empathetic: "Understanding and supportive, acknowledging feelings",
                        persuasive: "Compelling and convincing, building toward a call to action",
                        casual: "Relaxed and informal, suitable for internal team communication",
                        firm: "Direct and clear about expectations, while remaining respectful",
                    };
                    prompt = "Rewrite the following text in a ".concat(tone, " tone.\nTone description: ").concat(toneDescriptions[tone] || tone, "\n").concat(customInstruction ? "Additional instruction: ".concat(customInstruction) : "", "\n").concat(lengthInstruction, "\n\nCRITICAL: You MUST preserve ALL of the following protected facts exactly as they appear. Do NOT change, rephrase, or omit any of these:\n").concat(factList, "\n\nIf a fact doesn't fit naturally, keep it verbatim. Never invent new facts.\n\nOriginal text:\n\"\"\"\n").concat(text, "\n\"\"\"\n\nReturn ONLY the rewritten text, no explanations or quotes.");
                    return [4 /*yield*/, callDeepSeek([
                            { role: "system", content: "You are a professional text rewriter. Return only the rewritten text, no explanations." },
                            { role: "user", content: prompt },
                        ])];
                case 1:
                    rewritten = _a.sent();
                    cleaned = rewritten.replace(/^["']|["']$/g, "").trim();
                    factValidation = (0, writing_core_1.validateFacts)(facts, cleaned);
                    latencyMs = Date.now() - startTime;
                    return [2 /*return*/, {
                            result: {
                                original: text,
                                rewritten: cleaned,
                                tone: tone,
                                factsProtected: facts,
                                factMismatch: !factValidation.match,
                                meaningSimilarity: 0.9, // TODO: implement proper similarity check
                            },
                            usage: {
                                characterCount: text.length,
                                issueCount: 0,
                                checkMode: "rewrite",
                                latencyMs: latencyMs,
                                engineTier: "deepseek",
                            },
                        }];
            }
        });
    });
}
// --- Fact Validation ---
function validateFactsEndpoint(original, rewritten) {
    return __awaiter(this, void 0, void 0, function () {
        var originalFacts, rewrittenFacts, missing, changed, _loop_1, _i, originalFacts_1, fact;
        return __generator(this, function (_a) {
            originalFacts = (0, writing_core_1.extractProtectedFacts)(original);
            rewrittenFacts = (0, writing_core_1.extractProtectedFacts)(rewritten);
            missing = [];
            changed = [];
            _loop_1 = function (fact) {
                if (!rewritten.includes(fact.value)) {
                    // Check if it was changed (not just removed)
                    var corresponding = rewrittenFacts.find(function (rf) { return rf.type === fact.type && Math.abs(rf.startIndex - fact.startIndex) < 20; });
                    if (corresponding) {
                        changed.push({ original: fact, rewritten: corresponding });
                    }
                    else {
                        missing.push(fact);
                    }
                }
            };
            for (_i = 0, originalFacts_1 = originalFacts; _i < originalFacts_1.length; _i++) {
                fact = originalFacts_1[_i];
                _loop_1(fact);
            }
            return [2 /*return*/, {
                    match: missing.length === 0 && changed.length === 0,
                    missingFacts: missing,
                    changedFacts: changed,
                }];
        });
    });
}
