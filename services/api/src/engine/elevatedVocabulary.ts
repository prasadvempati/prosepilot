// Example word-upgrade pairs for the "elevated" rewrite tone (see rewriteText() in grammar.ts).
//
// WHY THIS FILE EXISTS: the "elevated" tone works by giving DeepSeek a handful of few-shot
// examples of "wordy phrase -> single precise word" and letting it apply that pattern to the
// user's actual text in context. It is deliberately NOT a deterministic find-and-replace
// dictionary — blindly swapping a phrase for a word without checking it fits the surrounding
// grammar is exactly the "safe auto-fix" bug class that caused real problems elsewhere in this
// app (see localGrammarModel.ts's HIGH_RISK_SHORT_WORDS comment). The model still has to decide
// whether a given upgrade actually reads naturally in the sentence it's rewriting.
//
// TO ADD MORE WORDS: just append an entry below. No other file needs to change — rewriteText()
// pulls its prompt examples from this array automatically. Keep to the same bar as the existing
// entries: the word should be immediately placeable in ordinary business writing (a report, an
// email, a proposal) and should not require a reader to already know it, since the rewrite panel
// shows a hover definition for anything the model actually uses. Good source: the "Most Common
// GRE Words," "Money Matters," and "Talkative Words" sections of a GRE vocabulary list tend to
// fit; skip anything themed/obscure (Halloween vocabulary, political-scandal words, single-letter
// word lists) — those are memorable trivia, not words a business reader should be expected to
// take in stride.
export interface VocabularyUpgrade {
  // The wordy phrase this word can replace — used only as a prompt example, not matched
  // literally against user text.
  phrase: string;
  // The single elevated word.
  word: string;
  // Plain-English definition (3-6 words), matching the bar we ask the model to hit for its own
  // glossary output.
  definition: string;
}

export const ELEVATED_VOCABULARY_EXAMPLES: VocabularyUpgrade[] = [
  { phrase: "help pay for", word: "defray", definition: "help cover the cost of" },
  { phrase: "speak vaguely to avoid a direct answer", word: "equivocate", definition: "avoid giving a straight answer" },
  { phrase: "extremely stingy with money", word: "parsimonious", definition: "unwilling to spend money" },
  { phrase: "a lack of something", word: "paucity", definition: "a shortage of something" },
  { phrase: "an eager willingness to do something", word: "alacrity", definition: "eager, cheerful readiness" },
  { phrase: "honest and straightforward", word: "candid", definition: "honest and direct" },
  { phrase: "unpredictable and inconsistent", word: "erratic", definition: "irregular and unpredictable" },
  { phrase: "fundamentally different from each other", word: "disparate", definition: "very different from each other" },
  { phrase: "outstandingly bad or shocking", word: "egregious", definition: "strikingly bad" },
  { phrase: "harmless and not likely to upset anyone", word: "innocuous", definition: "harmless, not offensive" },
  { phrase: "likely to cause an argument", word: "contentious", definition: "likely to cause disagreement" },
  { phrase: "showing signs it will go well", word: "auspicious", definition: "promising future success" },
  { phrase: "having mixed or conflicting feelings about something", word: "ambivalent", definition: "having mixed feelings" },
  { phrase: "diligent and careful in effort", word: "sedulous", definition: "diligent and hard-working" },
  { phrase: "careful and sensible with money", word: "thrifty", definition: "careful with money" },
  { phrase: "having a great deal of money", word: "affluent", definition: "wealthy" },
  { phrase: "a regular fixed payment or allowance", word: "stipend", definition: "a regular fixed allowance" },
  { phrase: "a very small, inadequate amount of money", word: "pittance", definition: "a very small amount" },
  { phrase: "friendly and enjoys the company of others", word: "gregarious", definition: "sociable, enjoys company" },
  { phrase: "read something carefully and thoroughly", word: "peruse", definition: "read carefully" },
  { phrase: "convince someone that a belief isn't true", word: "disabuse", definition: "correct a mistaken belief" },
  { phrase: "come to a peaceful agreement with someone", word: "conciliate", definition: "make peace with" },
  { phrase: "confirm or support with additional evidence", word: "corroborate", definition: "confirm with evidence" },
  { phrase: "in proportion to, matching the size or degree of", word: "commensurate", definition: "proportionate, matching in degree" },
  { phrase: "clear, logical, and convincing", word: "cogent", definition: "clear and convincing" },
  { phrase: "the highest point of something", word: "zenith", definition: "the highest point" },
  { phrase: "the lowest point of something", word: "nadir", definition: "the lowest point" },
  { phrase: "strongly encourage someone to take a positive action", word: "exhort", definition: "strongly urge to act" },
  { phrase: "calm someone down by doing something to please them", word: "propitiate", definition: "calm someone by pleasing them" },
  { phrase: "careless or negligent about a duty or responsibility", word: "remiss", definition: "negligent in a duty" },
  { phrase: "open, honest, and not secretive", word: "aboveboard", definition: "honest and not secretive" },
];

// Kept small and business-safe by design (see file header) — pulled into the prompt as few-shot
// examples in rewriteText(). If this list grows past ~40 entries, consider sampling a random
// subset per request in grammar.ts instead of sending all of them, to keep prompt size bounded.
