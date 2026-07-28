/**
 * Voice Profile Engine
 * 
 * Learns a user's writing style from their documents.
 * During grammar checking, uses the profile to distinguish between:
 * - Actual errors (grammar, spelling, punctuation mistakes)
 * - Style preferences (how the user intentionally writes)
 * 
 * This is the core differentiator from Grammarly:
 * Grammarly forces everyone to sound the same.
 * ProsePilot learns how YOU write and only flags real problems.
 */

export interface VoiceProfile {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  sampleCount: number; // number of documents analyzed
  
  // Sentence structure
  sentenceLength: {
    avg: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
  };
  
  // Vocabulary
  vocabulary: {
    typeTokenRatio: number; // unique words / total words (richness)
    avgWordLength: number;
    rareWordFrequency: number; // % of words not in common 5000
  };
  
  // Punctuation habits
  punctuation: {
    semicolonFrequency: number; // per 1000 words
    emDashFrequency: number;
    commaDensity: number; // commas per 100 words
    exclamationFrequency: number;
    questionMarkFrequency: number;
    ellipsisFrequency: number;
  };
  
  // Style markers
  style: {
    contractionRatio: number; // "don't" vs "do not"
    passiveVoiceRatio: number;
    hedgingWordFrequency: number; // "perhaps", "maybe", "might"
    sentenceStarterDistribution: Record<string, number>; // "The" → 0.15, "I" → 0.08, etc.
    avgParagraphLength: number; // sentences per paragraph
  };
  
  // Tone
  tone: {
    formalityScore: number; // 0=casual, 1=formal
    directnessScore: number; // 0=hedging, 1=direct
    confidenceScore: number; // 0=uncertain, 1=confident
  };
  
  // Common word preferences (user's preferred synonyms)
  wordPreferences: Record<string, string[]>; // "utilize" → ["use"] (user prefers "use")
}

// Default empty profile
export function createEmptyProfile(userId: string, name: string = "My Voice"): VoiceProfile {
  return {
    id: `vp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sampleCount: 0,
    sentenceLength: { avg: 15, median: 14, stdDev: 5, min: 3, max: 40 },
    vocabulary: { typeTokenRatio: 0.65, avgWordLength: 5.2, rareWordFrequency: 0.05 },
    punctuation: { semicolonFrequency: 2, emDashFrequency: 1, commaDensity: 8, exclamationFrequency: 1, questionMarkFrequency: 2, ellipsisFrequency: 0.5 },
    style: { contractionRatio: 0.3, passiveVoiceRatio: 0.1, hedgingWordFrequency: 0.02, sentenceStarterDistribution: {}, avgParagraphLength: 4 },
    tone: { formalityScore: 0.6, directnessScore: 0.7, confidenceScore: 0.8 },
    wordPreferences: {},
  };
}

// --- Analysis Functions ---

function splitSentences(text: string): string[] {
  // Split on sentence boundaries, keeping the delimiter
  const sentences = text
    .replace(/([.!?])\s+/g, "$1|")
    .split("|")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  return sentences;
}

function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(v => Math.pow(v - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

// Common 5000 English words (simplified set for rare word detection)
const COMMON_WORDS = new Set([
  "the","be","to","of","and","a","in","that","have","i","it","for","not","on","with","he",
  "as","you","do","at","this","but","his","by","from","they","we","say","her","she","or",
  "an","will","my","one","all","would","there","their","what","so","up","out","if","about",
  "who","get","which","go","me","when","make","can","like","time","no","just","him","know",
  "take","people","into","year","your","good","some","could","them","see","other","than",
  "then","now","look","only","come","its","over","think","also","back","after","use","two",
  "how","our","work","first","well","way","even","new","want","because","any","these","give",
  "day","most","us","find","here","thing","many","well","those","tell","one","very","her",
  "own","may","still","should","world","long","part","keep","place","much","help","where",
  "through","show","try","life","every","point","number","hand","high","keep","last","let",
  "begin","thought","city","tree","cross","hard","start","might","story","saw","far","sea",
  "draw","left","late","while","press","close","night","real","life","few","north","open",
  "seem","together","next","white","children","begin","got","walk","example","ease","paper",
  "group","always","music","those","both","mark","book","letter","until","mile","river",
  "car","feet","care","second","enough","plain","girl","usual","young","ready","above",
  "ever","red","list","though","feel","talk","bird","soon","body","dog","family","direct",
  "pose","leave","song","measure","door","product","black","short","numeral","class","wind",
  "question","happen","complete","ship","area","half","rock","order","fire","south","problem",
  "piece","told","knew","pass","since","top","whole","king","space","heard","best","hour",
  "better","true","during","hundred","five","remember","step","early","hold","west","ground",
  "interest","reach","fast","verb","sing","listen","six","table","travel","less","morning",
  "ten","simple","several","vowel","toward","war","lay","against","pattern","slow","center",
  "love","person","money","serve","appear","road","map","rain","rule","govern","pull","cold",
  "notice","voice","energy","hunt","probable","bed","brother","egg","ride","cell","believe",
  "perhaps","pick","sudden","count","reason","square","moment","develop","catch","sleep",
  "prevent","cost","own","little","among","element","hour","again","nobel","wait","branch",
  "meet","root","buy","human","pair","change","run","press","face","spell","attract","play",
  "small","end","put","home","read","hand","port","large","spell","add","land","here","must",
  "big","such","why","ask","went","men","went","said","each","which","she","do","how","their",
  "if","will","up","other","about","out","many","then","them","these","so","some","her",
  "would","make","like","him","into","time","has","look","two","more","write","go","see",
  "number","no","way","could","people","my","than","first","water","been","call","who",
  "oil","its","sit","now","find","long","down","day","did","get","come","made","may","part",
]);

/**
 * Analyze a single document and extract voice features
 */
export function analyzeText(text: string): Partial<VoiceProfile> {
  const sentences = splitSentences(text);
  const words = splitWords(text);
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  
  if (sentences.length === 0 || words.length === 0) {
    return {};
  }
  
  // Sentence length
  const sentenceLengths = sentences.map(s => splitWords(s).length);
  
  // Word lengths
  const wordLengths = words.map(w => w.length);
  
  // Rare words
  const rareWords = words.filter(w => !COMMON_WORDS.has(w) && w.length > 3);
  
  // Punctuation counts (on original text)
  const semicolons = (text.match(/;/g) || []).length;
  const emDashes = (text.match(/—|–/g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;
  const questionMarks = (text.match(/\?/g) || []).length;
  const ellipses = (text.match(/\.\.\./g) || []).length;
  
  const wordCount = words.length;
  
  // Contractions
  const contractions = words.filter(w => w.includes("'")).length;
  
  // Passive voice (simple heuristic: "was/were/is/are/been + past participle")
  const passivePatterns = /\b(was|were|is|are|been|being|be)\s+\w+ed\b/gi;
  const passiveMatches = text.match(passivePatterns) || [];
  
  // Hedging words
  const hedgeWords = ["perhaps", "maybe", "might", "could", "possibly", "arguably", "somewhat", "roughly", "apparently", "seemingly"];
  const hedgeCount = words.filter(w => hedgeWords.includes(w)).length;
  
  // Sentence starters
  const starters: Record<string, number> = {};
  for (const s of sentences) {
    const firstWord = splitWords(s)[0];
    if (firstWord) {
      starters[firstWord] = (starters[firstWord] || 0) + 1;
    }
  }
  // Normalize to percentages
  const starterDist: Record<string, number> = {};
  for (const [word, count] of Object.entries(starters)) {
    starterDist[word] = count / sentences.length;
  }
  
  // Formality indicators
  const formalWords = ["furthermore", "moreover", "consequently", "nevertheless", "regarding", "concerning", "subsequently", "henceforth"];
  const casualWords = ["gonna", "wanna", "hey", "yeah", "ok", "okay", "btw", "tbh", "imo", "afaik"];
  const formalCount = words.filter(w => formalWords.includes(w)).length;
  const casualCount = words.filter(w => casualWords.includes(w)).length;
  
  // Directness (imperatives, strong verbs vs hedging)
  const directPatterns = /\b(must|should|will|need to|have to|ensure|confirm|verify)\b/gi;
  const directMatches = text.match(directPatterns) || [];
  
  return {
    sentenceLength: {
      avg: sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length,
      median: median(sentenceLengths),
      stdDev: standardDeviation(sentenceLengths),
      min: Math.min(...sentenceLengths),
      max: Math.max(...sentenceLengths),
    },
    vocabulary: {
      typeTokenRatio: new Set(words).size / words.length,
      avgWordLength: wordLengths.reduce((a, b) => a + b, 0) / wordLengths.length,
      rareWordFrequency: rareWords.length / words.length,
    },
    punctuation: {
      semicolonFrequency: (semicolons / wordCount) * 1000,
      emDashFrequency: (emDashes / wordCount) * 1000,
      commaDensity: (commas / wordCount) * 100,
      exclamationFrequency: (exclamations / wordCount) * 1000,
      questionMarkFrequency: (questionMarks / wordCount) * 1000,
      ellipsisFrequency: (ellipses / wordCount) * 1000,
    },
    style: {
      contractionRatio: contractions / words.length,
      passiveVoiceRatio: passiveMatches.length / sentences.length,
      hedgingWordFrequency: hedgeCount / words.length,
      sentenceStarterDistribution: starterDist,
      avgParagraphLength: paragraphs.reduce((sum, p) => sum + splitSentences(p).length, 0) / paragraphs.length,
    },
    tone: {
      formalityScore: Math.min(1, (formalCount * 0.1 + (1 - casualCount * 0.1))),
      directnessScore: Math.min(1, directMatches.length / sentences.length + 0.3),
      confidenceScore: Math.min(1, 1 - (hedgeCount / words.length) * 10),
    },
  };
}

/**
 * Merge multiple document analyses into a single profile
 * Uses exponential moving average to weight recent documents more
 */
export function mergeAnalyses(
  existing: Partial<VoiceProfile>,
  newAnalysis: Partial<VoiceProfile>,
  sampleCount: number
): Partial<VoiceProfile> {
  // Weight: existing documents have weight (sampleCount-1)/sampleCount, new has 1/sampleCount
  // This gives more weight to the existing profile as sample count grows
  const w = sampleCount > 0 ? 1 / (sampleCount + 1) : 1;
  
  function mergeNum(a: number | undefined, b: number | undefined): number {
    if (a === undefined) return b ?? 0;
    if (b === undefined) return a;
    return a * (1 - w) + b * w;
  }
  
  function mergeObj(a: any, b: any): any {
    if (!a) return b ?? {};
    if (!b) return a;
    const result: any = {};
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (typeof a[key] === "number" && typeof b[key] === "number") {
        result[key] = mergeNum(a[key], b[key]);
      } else if (typeof a[key] === "object" && typeof b[key] === "object" && !Array.isArray(a[key])) {
        result[key] = mergeObj(a[key], b[key]);
      } else {
        result[key] = b[key] ?? a[key];
      }
    }
    return result;
  }
  
  return {
    sentenceLength: mergeObj(existing.sentenceLength, newAnalysis.sentenceLength),
    vocabulary: mergeObj(existing.vocabulary, newAnalysis.vocabulary),
    punctuation: mergeObj(existing.punctuation, newAnalysis.punctuation),
    style: mergeObj(existing.style, newAnalysis.style),
    tone: mergeObj(existing.tone, newAnalysis.tone),
  };
}

/**
 * Determine if an issue is a "real error" or a "style deviation"
 * Returns true if the issue should be shown to the user
 */
export function shouldShowIssue(
  profile: VoiceProfile | null,
  issue: {
    category: string;
    rule: string;
    original: string;
    replacement: string;
    confidence: number;
  }
): boolean {
  // If no profile, show everything ( Grammarly behavior)
  if (!profile || profile.sampleCount < 3) {
    return true;
  }
  
  // Always show: spelling errors, grammar errors, missing words
  if (issue.category === "spelling" || issue.rule === "missing_period" || issue.rule === "double_space") {
    return true;
  }
  
  // Show high-confidence grammar issues (>0.9)
  if (issue.category === "grammar" && issue.confidence > 0.9) {
    return true;
  }
  
  // Style deviations: check against profile
  if (issue.category === "style" || issue.category === "tone" || issue.category === "conciseness") {
    // Passive voice: only flag if user doesn't normally use it
    if (issue.rule === "passive_voice") {
      return profile.style.passiveVoiceRatio < 0.15; // user rarely uses passive
    }
    
    // Wordiness: only flag if user is usually concise
    if (issue.rule === "wordiness" || issue.rule === "conciseness") {
      return profile.tone.directnessScore > 0.7; // user is usually direct
    }
    
    // Formality: only flag if it mismatches user's tone
    if (issue.rule === "formality" || issue.rule === "tone") {
      // Don't flag formality deviations — this is style preference
      return false;
    }
    
    // Semicolons: only flag if user rarely uses them
    if (issue.original === ";") {
      return profile.punctuation.semicolonFrequency < 1;
    }
  }
  
  // For everything else, show it
  return true;
}

/**
 * Get a human-readable summary of a voice profile
 */
export function getProfileSummary(profile: VoiceProfile): string {
  const parts: string[] = [];
  
  // Sentence style
  if (profile.sentenceLength.avg < 12) {
    parts.push("short, punchy sentences");
  } else if (profile.sentenceLength.avg > 25) {
    parts.push("long, detailed sentences");
  } else {
    parts.push("medium-length sentences");
  }
  
  // Vocabulary
  if (profile.vocabulary.typeTokenRatio > 0.7) {
    parts.push("rich vocabulary");
  } else if (profile.vocabulary.typeTokenRatio < 0.5) {
    parts.push("simple vocabulary");
  }
  
  // Punctuation
  if (profile.punctuation.semicolonFrequency > 5) {
    parts.push("heavy semicolon user");
  }
  if (profile.punctuation.emDashFrequency > 3) {
    parts.push("frequent em-dashes");
  }
  
  // Tone
  if (profile.tone.formalityScore > 0.7) {
    parts.push("formal tone");
  } else if (profile.tone.formalityScore < 0.3) {
    parts.push("casual tone");
  }
  
  if (profile.tone.directnessScore > 0.7) {
    parts.push("direct writing style");
  } else if (profile.tone.directnessScore < 0.3) {
    parts.push("hedging, cautious style");
  }
  
  // Contractions
  if (profile.style.contractionRatio > 0.05) {
    parts.push("uses contractions freely");
  } else if (profile.style.contractionRatio < 0.01) {
    parts.push("avoids contractions");
  }
  
  return parts.length > 0 ? parts.join(", ") : "balanced writing style";
}
