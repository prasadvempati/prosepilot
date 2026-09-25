const CACHE_DB = "prosepilot-grammar-cache";
const CACHE_STORE = "checks";
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

let dbPromise = null;

function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "hash" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
  return dbPromise;
}

function getCacheKey(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sha256:${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

async function getCached(text) {
  const db = await initDB();
  const hash = getCacheKey(text);
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const store = tx.objectStore(CACHE_STORE);
    const request = store.get(hash);
    request.onsuccess = () => {
      if (request.result && Date.now() - request.result.timestamp < MAX_CACHE_AGE) {
        resolve(request.result.issues);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

async function setCached(text, issues) {
  const db = await initDB();
  const hash = getCacheKey(text);
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    const store = tx.objectStore(CACHE_STORE);
    store.put({ hash, text, issues, timestamp: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

const CONTRACTIONS = [
  { wrong: "dont", right: "don't" },
  { wrong: "cant", right: "can't" },
  { wrong: "wont", right: "won't" },
  { wrong: "isnt", right: "isn't" },
  { wrong: "arent", right: "aren't" },
  { wrong: "wasnt", right: "wasn't" },
  { wrong: "werent", right: "weren't" },
  { wrong: "doesnt", right: "doesn't" },
  { wrong: "didnt", right: "didn't" },
  { wrong: "hasnt", right: "hasn't" },
  { wrong: "havent", right: "haven't" },
  { wrong: "hadnt", right: "hadn't" },
  { wrong: "wouldnt", right: "wouldn't" },
  { wrong: "couldnt", right: "couldn't" },
  { wrong: "shouldnt", right: "shouldn't" },
  { wrong: "theyre", right: "they're" },
  { wrong: "youre", right: "you're" },
  { wrong: "weve", right: "we've" },
  { wrong: "whats", right: "what's" },
  { wrong: "thats", right: "that's" },
  { wrong: "shant", right: "shan't" },
];

const UNCOUNTABLE = {
  informations: "information",
  advices: "advice",
  equipments: "equipment",
  furnitures: "furniture",
  staffs: "staff",
  homeworks: "homework",
  mails: "mail",
  progresses: "progress",
  researches: "research",
  evidences: "evidence",
};

const PROPER_NOUNS = {
  prosepilot: "ProsePilot",
  grammarly: "Grammarly",
  microsoft: "Microsoft",
  google: "Google",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

const ADJECTIVE_NOUN = {
  "upgrade premium": "premium upgrade",
  "report inspection": "inspection report",
  "inspection site visit": "site visit inspection",
  "tile shower": "shower tile",
  "schedule gate": "gate schedule",
  "trim border": "border trim",
  "list units": "unit list",
  "condition exterior": "exterior condition",
  "readiness unit": "unit readiness",
  "updates progress": "progress updates",
};

const GERUND_TO_NOUN = [
  { pattern: /\bour discussing\b/gi, replacement: "our discussion" },
  { pattern: /\btheir discussing\b/gi, replacement: "their discussion" },
  { pattern: /\bthe discussing\b/gi, replacement: "the discussion" },
  { pattern: /\ba discussing\b/gi, replacement: "a discussion" },
  { pattern: /\bduring discussing\b/gi, replacement: "during the discussion" },
  { pattern: /\bper our discussing\b/gi, replacement: "Per our discussion" },
];

// === Common confusion patterns (your/you're, their/there/they're, etc.) ===
const CONFUSION_PATTERNS = [
  { pattern: /\byour\s+(going|here|there|welcome|right|sure)\b/gi, replacement: "you're $1", category: "grammar", rule: "confused_your_youre", explanation: "Use 'you're' (you are), not 'your' (possessive)." },
  { pattern: /\btheir\s+(going|here|there)\b/gi, replacement: "they're $1", category: "grammar", rule: "confused_their_theyre", explanation: "Use 'they're' (they are), not 'their' (possessive)." },
  { pattern: /\bthere\s+(is|are|was|were|goes|come)\b/gi, replacement: "they're $1", category: "grammar", rule: "confused_there_theyre", explanation: "Likely 'they're' (they are), not 'there' (location)." },
  { pattern: /\bits\s+(a|an|the|going|time|been|good|bad|hard|easy|important|possible|likely|unlikely)\b/gi, replacement: "it's $1", category: "grammar", rule: "confused_its_its", explanation: "Use 'it's' (it is), not 'its' (possessive)." },
  { pattern: /\bwho's\s+(car|house|book|phone|idea|fault|turn|responsibility)\b/gi, replacement: "whose $1", category: "grammar", rule: "confused_whos_whose", explanation: "Use 'whose' (possessive), not 'who's' (who is)." },
  { pattern: /\bthen\s+(is|are|was|were|has|have|had|does|did|can|could|will|would|should|may|might|must)\b/gi, replacement: "than $1", category: "grammar", rule: "confused_then_than", explanation: "Use 'than' for comparisons, not 'then' (time)." },
  { pattern: /\b(?:more|less|better|worse|greater|fewer|older|younger|faster|slower)\s+then\b/gi, replacement: (m) => m.replace(/\bthen\b/gi, "than"), category: "grammar", rule: "confused_then_than", explanation: "Use 'than' for comparisons, not 'then' (time)." },
  { pattern: /\b(could|should|would|must|might)\s+of\b/gi, replacement: (m) => m.replace(/\bof\b/gi, "have"), category: "grammar", rule: "confused_could_of", explanation: "Use 'have', not 'of' (e.g., 'could have', not 'could of')." },
];

// === Missing auxiliary verbs (passive constructions) ===
const AUXILIARY_PATTERNS = [
  { pattern: /\b(?:work\s+orders?|the\s+unit|maintenance|repairs?)\s+(completed|finished|done|resolved|addressed)\b/gi, replacement: (m) => m.replace(/\b(completed|finished|done|resolved|addressed)\b/gi, "were $1"), category: "grammar", rule: "missing_auxiliary_passive", explanation: "Passive construction needs 'were' (e.g., 'were completed')." },
  { pattern: /\b(?:the\s+unit|it|this|that)\s+(delayed|postponed|cancelled|scheduled)\b/gi, replacement: (m) => m.replace(/\b(delayed|postponed|cancelled|scheduled)\b/gi, "was $1"), category: "grammar", rule: "missing_auxiliary_passive", explanation: "Passive construction needs 'was' (e.g., 'was delayed')." },
];

function applyContractionCase(matched, canonical) {
  if (matched === matched.toUpperCase()) return canonical.toUpperCase();
  if (matched[0] === matched[0]?.toUpperCase()) return canonical[0].toUpperCase() + canonical.slice(1);
  return canonical;
}

function checkContractions(text) {
  const issues = [];
  for (const { wrong, right } of CONTRACTIONS) {
    const regex = new RegExp(`\\b${wrong}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        id: `contraction_${Math.random().toString(36).slice(2, 10)}`,
        category: "grammar",
        rule: "missing_apostrophe_contraction",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0],
        replacement: applyContractionCase(match[0], right),
        confidence: 0.99,
        safeAuto: true,
        severity: "info",
        explanation: `Missing apostrophe: should be "${right}"`,
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

function checkUncountable(text) {
  const issues = [];
  for (const [wrong, right] of Object.entries(UNCOUNTABLE)) {
    const regex = new RegExp(`\\b${wrong}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        id: `uncount_${Math.random().toString(36).slice(2, 10)}`,
        category: "grammar",
        rule: "uncountable_noun",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0],
        replacement: right,
        confidence: 0.9,
        safeAuto: true,
        severity: "info",
        explanation: `'${wrong}' is uncountable. Use '${right}'`,
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

function checkProperNouns(text) {
  const issues = [];
  for (const [wrong, right] of Object.entries(PROPER_NOUNS)) {
    const regex = new RegExp(`\\b${wrong}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        id: `proper_${Math.random().toString(36).slice(2, 10)}`,
        category: "spelling",
        rule: "proper_noun_capitalization",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0],
        replacement: right,
        confidence: 0.95,
        safeAuto: true,
        severity: "info",
        explanation: `Proper noun '${right}' should be capitalized correctly`,
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

function checkAdjectiveNoun(text) {
  const issues = [];
  for (const [wrong, right] of Object.entries(ADJECTIVE_NOUN)) {
    const regex = new RegExp(`\\b${wrong.replace(/\s+/g, "\\s+")}\\b`, "gi");
    let match;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        id: `adj_noun_${Math.random().toString(36).slice(2, 10)}`,
        category: "style",
        rule: "adjective_noun_order",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0],
        replacement: right,
        confidence: 0.9,
        safeAuto: true,
        severity: "info",
        explanation: `Adjective before noun: '${right}' not '${wrong}'`,
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

function checkGerundToNoun(text) {
  const issues = [];
  for (const { pattern, replacement } of GERUND_TO_NOUN) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      issues.push({
        id: `gerund_${Math.random().toString(36).slice(2, 10)}`,
        category: "grammar",
        rule: "gerund_to_noun",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0],
        replacement: replacement,
        confidence: 0.95,
        safeAuto: true,
        severity: "info",
        explanation: `Use noun form after possessive/preposition`,
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

function checkCapitalization(text) {
  const issues = [];
  const sentences = text.split(/([.!?]\s+)/);
  let offset = 0;
  
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    if (!sentence || !sentence.trim()) {
      offset += sentence.length + (sentences[i + 1]?.length || 0);
      continue;
    }
    
    const trimmed = sentence.trimStart();
    const leadingSpace = sentence.length - trimmed.length;
    const sentenceStart = offset + leadingSpace;
    
    if (/^[a-z]/.test(trimmed)) {
      const firstChar = trimmed[0];
      issues.push({
        id: `cap_${Math.random().toString(36).slice(2, 10)}`,
        category: "grammar",
        rule: "capitalize_sentence_start",
        startUtf16: sentenceStart,
        endUtf16: sentenceStart + 1,
        original: firstChar,
        replacement: firstChar.toUpperCase(),
        confidence: 0.95,
        safeAuto: true,
        severity: "info",
        explanation: "Capitalize the first word of a sentence",
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
    
    if (!/[.!?]$/.test(trimmed) && trimmed.length > 3) {
      issues.push({
        id: `punct_${Math.random().toString(36).slice(2, 10)}`,
        category: "punctuation",
        rule: "missing_period",
        startUtf16: sentenceStart + trimmed.length - 1,
        endUtf16: sentenceStart + trimmed.length,
        original: trimmed.slice(-1),
        replacement: trimmed.slice(-1) + ".",
        confidence: 0.75,
        safeAuto: true,
        severity: "info",
        explanation: "Sentence appears to be missing ending punctuation",
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
    
    offset += sentence.length + (sentences[i + 1]?.length || 0);
  }
  
  return issues;
}

// === Common confusion patterns (your/you're, their/there/they're, etc.) ===
function checkConfusionPatterns(text) {
  const issues = [];
  for (const { pattern, replacement, category, rule, explanation } of CONFUSION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      let fixed;
      if (typeof replacement === "function") {
        fixed = match[0].replace(pattern, replacement);
      } else {
        fixed = match[0].replace(pattern, replacement);
      }
      
      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `confusion_${Math.random().toString(36).slice(2, 10)}`,
          category,
          rule,
          startUtf16: match.index,
          endUtf16: match.index + match[0].length,
          original: match[0],
          replacement: fixed,
          confidence: 0.95,
          safeAuto: true,
          severity: "info",
          explanation,
          sourceHash: getCacheKey(text),
          source: "offline-grammar",
        });
      }
    }
  }
  return issues;
}

// === Missing auxiliary verbs (passive constructions) ===
function checkMissingAuxiliaries(text) {
  const issues = [];
  for (const { pattern, replacement, category, rule, explanation } of AUXILIARY_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const fixed = match[0].replace(pattern, replacement);
      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `aux_${Math.random().toString(36).slice(2, 10)}`,
          category,
          rule,
          startUtf16: match.index,
          endUtf16: match.index + match[0].length,
          original: match[0],
          replacement: fixed,
          confidence: 0.85,
          safeAuto: false,
          severity: "warning",
          explanation,
          sourceHash: getCacheKey(text),
          source: "offline-grammar",
        });
      }
    }
  }
  return issues;
}

// === Run-on sentences / comma splices ===
function checkRunOnSentences(text) {
  const issues = [];
  const regex = /\b([A-Z][^.!?]*\b(?:I|we|you|he|she|it|they|the\s+\w+|a\s+\w+)\s+\w+[^.!?]*),\s+(I|we|you|he|she|it|they|the\s+\w+|a\s+\w+)\s+\w+[^.!?]*([.!?])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const afterComma = text.substring(match.index + match[0].indexOf(',') + 1, match.index + match[0].indexOf(',') + 20);
    if (!/^\s*(and|but|or|so|yet|for|nor)\b/i.test(afterComma)) {
      issues.push({
        id: `runon_${Math.random().toString(36).slice(2, 10)}`,
        category: "punctuation",
        rule: "comma_splice",
        startUtf16: match.index,
        endUtf16: match.index + match[0].length,
        original: match[0].trim(),
        replacement: match[0].replace(/,(\s+)(I|we|you|he|she|it|they|the\s+\w+|a\s+\w+)/, '; $1$2'),
        confidence: 0.75,
        safeAuto: false,
        severity: "warning",
        explanation: "Possible comma splice — use semicolon or add conjunction.",
        sourceHash: getCacheKey(text),
        source: "offline-grammar",
      });
    }
  }
  return issues;
}

// === Parallel structure ===
function checkParallelStructure(text) {
  const issues = [];
  const regex = /\b(to\s+\w+|ing\s+\w+|\w+\s+ing)\s+and\s+(to\s+\w+|\w+)\b/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const parts = match[0].split(/\s+and\s+/);
    if (parts.length === 2) {
      const first = parts[0].trim();
      const second = parts[1].trim();
      const firstIsInfinitive = /^to\s+\w+$/.test(first);
      const firstIsGerund = /\w+ing$/.test(first);
      const secondIsInfinitive = /^to\s+\w+$/.test(second);
      const secondIsGerund = /\w+ing$/.test(second);
      
      if ((firstIsInfinitive && !secondIsInfinitive) || (firstIsGerund && !secondIsGerund)) {
        issues.push({
          id: `parallel_${Math.random().toString(36).slice(2, 10)}`,
          category: "style",
          rule: "parallel_structure",
          startUtf16: match.index,
          endUtf16: match.index + match[0].length,
          original: match[0],
          replacement: firstIsInfinitive ? `to ${first.replace('to ', '')} and to ${second}` : `${first.replace(/ing$/, 'ing')} and ${second.replace(/ing$/, 'ing')}`,
          confidence: 0.7,
          safeAuto: false,
          severity: "info",
          explanation: "Parallel structure: use matching forms (both 'to X' or both '-ing').",
          sourceHash: getCacheKey(text),
          source: "offline-grammar",
        });
      }
    }
  }
  return issues;
}

// === Subject-verb agreement for complex subjects ===
function checkSubjectVerbAgreement(text) {
  const issues = [];
  const patterns = [
    { pattern: /\b(each|every|either|neither)\s+of\s+the\s+\w+\s+(are|were|have|has|do|does)\b/gi, replacement: (m) => m.replace(/\b(are|were)\b/gi, "is").replace(/\b(have)\b/gi, "has").replace(/\b(do)\b/gi, "does"), explanation: "'Each/every/either/neither of the X' takes singular verb." },
    { pattern: /\b(?:the\s+number\s+of)\s+\w+\s+(are|were|have)\b/gi, replacement: (m) => m.replace(/\b(are|were)\b/gi, "is").replace(/\b(have)\b/gi, "has"), explanation: "'The number of' takes singular verb." },
    { pattern: /\b(?:a\s+number\s+of)\s+\w+\s+(is|was|has)\b/gi, replacement: (m) => m.replace(/\b(is|was)\b/gi, "are").replace(/\b(has)\b/gi, "have"), explanation: "'A number of' takes plural verb." },
  ];
  
  for (const { pattern, replacement, explanation } of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const fixed = match[0].replace(pattern, replacement);
      if (fixed && fixed !== match[0]) {
        issues.push({
          id: `sv_${Math.random().toString(36).slice(2, 10)}`,
          category: "grammar",
          rule: "subject_verb_agreement_complex",
          startUtf16: match.index,
          endUtf16: match.index + match[0].length,
          original: match[0],
          replacement: fixed,
          confidence: 0.9,
          safeAuto: true,
          severity: "info",
          explanation,
          sourceHash: getCacheKey(text),
          source: "offline-grammar",
        });
      }
    }
  }
  return issues;
}

function checkRepeatedWords(text) {
  const issues = [];
  const regex = /\b(the|a|an|is|are|was|were|have|has|had|do|does|did|can|could|will|would|shall|should|may|might|must)\s+\1\b/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    issues.push({
      id: `repeat_${Math.random().toString(36).slice(2, 10)}`,
      category: "grammar",
      rule: "repeated_word",
      startUtf16: match.index,
      endUtf16: match.index + match[0].length,
      original: match[0],
      replacement: match[1],
      confidence: 0.99,
      safeAuto: true,
      severity: "info",
      explanation: "Word is repeated",
      sourceHash: getCacheKey(text),
      source: "offline-grammar",
    });
  }
  return issues;
}

async function checkGrammar(text) {
  const cached = await getCached(text);
  if (cached) {
    return { issues: cached, cached: true, source: "offline-cache" };
  }
  
  const allIssues = [
    ...checkContractions(text),
    ...checkUncountable(text),
    ...checkProperNouns(text),
    ...checkAdjectiveNoun(text),
    ...checkGerundToNoun(text),
    ...checkCapitalization(text),
    ...checkRepeatedWords(text),
    // NEW checks
    ...checkConfusionPatterns(text),
    ...checkMissingAuxiliaries(text),
    ...checkRunOnSentences(text),
    ...checkParallelStructure(text),
    ...checkSubjectVerbAgreement(text),
  ];
  
  await setCached(text, allIssues);
  
  return { issues: allIssues, cached: false, source: "offline-engine" };
}

self.onmessage = async (event) => {
  const { id, text, mode } = event.data;
  
  if (!text || typeof text !== "string") {
    self.postMessage({ id, issues: [], error: "Invalid text" });
    return;
  }
  
  try {
    const result = await checkGrammar(text);
    self.postMessage({ 
      id, 
      issues: result.issues, 
      cached: result.cached,
      source: result.source,
      latencyMs: 0 
    });
  } catch (error) {
    self.postMessage({ id, issues: [], error: error.message });
  }
};