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
// pulls its prompt examples from this array automatically (sampling a random subset per request
// once the list is large — see the note at the bottom of this file). Keep to the same bar as the
// existing entries: the word should be immediately placeable in ordinary business writing (a
// report, an email, a proposal) and should not require a reader to already know it, since the
// rewrite panel shows a hover definition for anything the model actually uses. Good sources: the
// "Most Common GRE Words," "Money Matters," and "Talkative Words" sections of a GRE vocabulary
// list, or general-purpose lists like Barron's 800; skip anything themed/obscure (Halloween
// vocabulary, political-scandal words, single-letter word lists, mythology/literature-only terms)
// — those are memorable trivia, not words a business reader should be expected to take in stride.
// Also skip words whose main use is describing a *person's character* in an unflattering way
// (e.g. "indolent," "glib," "garrulous," "obdurate") — even though they're common GRE-list
// entries, using one in a rewritten business email risks reading as a pointed personal insult
// that the user didn't intend to sharpen. Fine to keep words that describe a claim, decision, or
// situation critically (egregious, disparage, ostentatious) since those don't land on a specific
// person the same way.
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

  // Added 2026-08-08 from a Barron's 800 GRE word list the user uploaded, filtered to the same
  // business-safe bar described above.
  { phrase: "prevent something by acting before it happens", word: "forestall", definition: "prevent by acting first" },
  { phrase: "impressively strong, skilled, or difficult to deal with", word: "formidable", definition: "impressively strong or daunting" },
  { phrase: "not able to be defended or maintained", word: "untenable", definition: "impossible to defend or maintain" },
  { phrase: "back up a claim with solid evidence", word: "substantiate", definition: "support with solid evidence" },
  { phrase: "replace something because it's newer or better", word: "supersede", definition: "take the place of, as newer" },
  { phrase: "officially withdraw or cancel a decision", word: "rescind", definition: "officially cancel or withdraw" },
  { phrase: "specify something as a required condition", word: "stipulate", definition: "specify as a required condition" },
  { phrase: "very difficult to manage, solve, or control", word: "intractable", definition: "hard to manage or control" },
  { phrase: "stubbornly resistant to guidance or control", word: "recalcitrant", definition: "stubbornly resistant to guidance" },
  { phrase: "not relevant or necessary to the main point", word: "extraneous", definition: "irrelevant, not essential" },
  { phrase: "done as a routine duty, without real effort", word: "perfunctory", definition: "done half-heartedly, as routine" },
  { phrase: "speak of something in a dismissive, belittling way", word: "disparage", definition: "belittle, speak dismissively of" },
  { phrase: "by accident, without meaning to", word: "inadvertently", definition: "unintentionally, by accident" },
  { phrase: "present or spreading through every part of something", word: "pervasive", definition: "present throughout, widespread" },
  { phrase: "not securely held, likely to fail or fall", word: "precarious", definition: "unstable, at risk of failing" },
  { phrase: "showy in a way meant to impress others", word: "ostentatious", definition: "showy, meant to impress" },
  { phrase: "taking an indirect, roundabout path", word: "circuitous", definition: "roundabout, indirect" },
  { phrase: "place two things side by side for comparison", word: "juxtapose", definition: "place side by side for comparison" },
  { phrase: "reluctant to share thoughts or speak openly", word: "reticent", definition: "reluctant to speak openly" },
  { phrase: "having real, meaningful content rather than superficial", word: "substantive", definition: "meaningful, of real substance" },
  { phrase: "a short document that summarizes everything important", word: "compendium", definition: "a concise, comprehensive summary" },
  { phrase: "an urgent situation that demands immediate action", word: "exigency", definition: "an urgent need or situation" },
  { phrase: "related to the main topic only indirectly", word: "tangential", definition: "related only indirectly, off-topic" },
  { phrase: "existing in large amounts", word: "copious", definition: "abundant, in large amounts" },
  { phrase: "difficult and burdensome to deal with", word: "onerous", definition: "burdensome, hard to bear" },
];

// The list crossed 40 entries with the 2026-08-08 addition above, which is the threshold this
// file previously flagged as "consider sampling instead of sending all of them." rewriteText()
// in grammar.ts now calls sampleVocabularyExamples() to pick a bounded random subset per request
// rather than always sending the full array — keeps the DeepSeek prompt size roughly constant as
// this list keeps growing, at the cost of any single rewrite only ever drawing from a slice of
// the full vocabulary (acceptable: these are illustrative few-shot examples, not a fixed feature
// list the model is required to exhaustively offer).
export function sampleVocabularyExamples(count: number): VocabularyUpgrade[] {
  const pool = ELEVATED_VOCABULARY_EXAMPLES;
  if (pool.length <= count) return pool;
  // Fisher-Yates-ish partial shuffle — only need `count` random picks, not a full shuffle.
  const picked: VocabularyUpgrade[] = [];
  const indices = pool.map((_, i) => i);
  for (let i = 0; i < count && indices.length > 0; i++) {
    const j = Math.floor(Math.random() * indices.length);
    picked.push(pool[indices[j]]);
    indices.splice(j, 1);
  }
  return picked;
}
