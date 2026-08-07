import JSZip from "jszip";
import { checkGrammar } from "./grammar.js";
import type { VoiceProfile } from "@prosepilot/writing-core";

// Same overall size convention used for direct text checks (services/api/src/routes/check.ts)
// — a cumulative cap across all paragraphs rather than a fixed paragraph count, so a normal
// document (which is the vast majority of real uploads) gets checked in FULL instead of
// silently truncating after an arbitrary first N paragraphs, while an extreme outlier
// document still has a sane upper bound.
const MAX_DOCX_CHECK_CHARS = 100000;

// Simple concurrency-limited map — checking every paragraph of a real document sequentially
// (one at a time, each with its own network round-trips) would make a multi-page document
// take a very long time. No new dependency needed for something this small.
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

interface DocxParagraph {
  index: number;
  text: string;
  xml: string; // original XML of the <w:p> element
}

interface DocxIssue {
  paragraphIndex: number;
  paragraphText: string;
  category: string;
  original: string;
  replacement: string;
  explanation: string;
  confidence: number;
}

interface DocxResult {
  cleanBuffer: Buffer;
  trackedBuffer: Buffer;
  issues: DocxIssue[];
  summary: {
    totalParagraphs: number;
    paragraphsChecked: number;
    totalIssues: number;
    categories: Record<string, number>;
  };
}

// Extract paragraphs from word/document.xml using simple string splitting
// (avoids catastrophic regex backtracking on complex XML)
function extractParagraphs(docXml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  // Split on </w:p> boundaries — simple and O(n)
  const parts = docXml.split("</w:p>");
  let index = 0;

  for (const part of parts) {
    // Only process parts that contain <w:p (actual paragraph elements)
    const pStart = part.lastIndexOf("<w:p");
    if (pStart === -1) continue;

    const pXml = part.slice(pStart) + "</w:p>";

    // Extract text from <w:t> elements
    const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let text = "";
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(pXml)) !== null) {
      text += tMatch[1];
    }

    if (text.trim().length > 0) {
      paragraphs.push({ index, text: text.trim(), xml: pXml });
    }
    index++;
  }

  return paragraphs;
}

// Replace text in a paragraph XML while preserving formatting
function replaceInParagraphXml(
  pXml: string,
  original: string,
  replacement: string
): string {
  // Find the text nodes containing the original and replace
  // This preserves <w:rPr> (formatting) and <w:pPr> (paragraph props)
  const tRegex = /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g;

  return pXml.replace(tRegex, (full, open, content, close) => {
    const idx = content.indexOf(original);
    if (idx === -1) return full;
    const newContent =
      content.slice(0, idx) + replacement + content.slice(idx + original.length);
    return open + newContent + close;
  });
}

// Generate tracked changes XML (Word revision markup)
function generateTrackedChangesXml(
  pXml: string,
  original: string,
  replacement: string,
  revId: number,
  author: string = "ProsePilot",
  date: string = new Date().toISOString()
): string {
  // Find the text node containing the original and wrap with ins/del markup
  const tRegex = /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g;

  return pXml.replace(tRegex, (full, _open, content, _close) => {
    const idx = content.indexOf(original);
    if (idx === -1) return full;

    const before = content.slice(0, idx);
    const after = content.slice(idx + original.length);

    // Word tracked changes format:
    // <w:del w:id="1" w:author="ProsePilot" w:date="...">
    //   <w:r><w:delText>original</w:delText></w:r>
    // </w:del>
    // <w:ins w:id="2" w:author="ProsePilot" w:date="...">
    //   <w:r><w:t>replacement</w:t></w:r>
    // </w:ins>

    let result = "";
    if (before) {
      result += `<w:r><w:t xml:space="preserve">${escapeXml(before)}</w:t></w:r>`;
    }

    result += `<w:del w:id="${revId}" w:author="${escapeXml(author)}" w:date="${escapeXml(date)}">`;
    result += `<w:r><w:delText xml:space="preserve">${escapeXml(original)}</w:delText></w:r>`;
    result += `</w:del>`;

    result += `<w:ins w:id="${revId + 1}" w:author="${escapeXml(author)}" w:date="${escapeXml(date)}">`;
    result += `<w:r><w:t xml:space="preserve">${escapeXml(replacement)}</w:t></w:r>`;
    result += `</w:ins>`;

    if (after) {
      result += `<w:r><w:t xml:space="preserve">${escapeXml(after)}</w:t></w:r>`;
    }

    return result;
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Main processing function
export async function processDocx(docxBuffer: Buffer, voiceProfile?: VoiceProfile | null): Promise<DocxResult> {
  // 1. Load the .docx ZIP
  const zip = await JSZip.loadAsync(docxBuffer);

  // 2. Get the main document XML
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Invalid .docx file: word/document.xml not found");
  }
  const docXml = await docXmlFile.async("string");

  // 3. Extract paragraphs. Cumulative char cap instead of a fixed paragraph count — checks
  // the WHOLE document for the vast majority of real uploads, with a sane upper bound for
  // outliers instead of an arbitrary "first 10 paragraphs only" truncation.
  const paragraphs = extractParagraphs(docXml);
  const paragraphsChecked: typeof paragraphs = [];
  let cumulativeChars = 0;
  for (const p of paragraphs) {
    if (p.text.length < 10) continue;
    if (cumulativeChars + p.text.length > MAX_DOCX_CHECK_CHARS) break;
    paragraphsChecked.push(p);
    cumulativeChars += p.text.length;
  }

  // 4. Check grammar on each paragraph, concurrently, with a two-pass tiered strategy:
  //   Pass 1 (always, free): rule engine + local small model, in-process, no network call.
  //   Pass 2 (only if pass 1 found nothing): escalate to the full pipeline (LanguageTool +
  //   DeepSeek) for a deeper "second opinion." A paragraph the free tiers already found and
  //   fixed issues in doesn't need that deeper pass as urgently as one that came back looking
  //   clean — that's exactly where DeepSeek earns its cost, catching what pattern-matching
  //   can't. This keeps DeepSeek spend roughly proportional to how much of the document
  //   actually needs it, instead of billing the entire document regardless.
  const allIssues: DocxIssue[] = [];
  const categories: Record<string, number> = {};

  const perParagraphResults = await mapWithConcurrency(paragraphsChecked, 5, async (para) => {
    try {
      const localResult = await Promise.race([
        checkGrammar({ text: para.text, mode: "review", localOnly: true, voiceProfile }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);

      if (localResult.issues.length > 0) return localResult.issues;

      // Free tiers found nothing — worth a deeper look.
      const fullResult = await Promise.race([
        checkGrammar({ text: para.text, mode: "review", voiceProfile }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      return fullResult.issues;
    } catch (err) {
      // Skip failed/timed-out paragraphs silently — same behavior as before.
      return [];
    }
  });

  perParagraphResults.forEach((issues, i) => {
    const para = paragraphsChecked[i];
    for (const issue of issues) {
      allIssues.push({
        paragraphIndex: para.index,
        paragraphText: para.text,
        category: issue.category,
        original: issue.original,
        replacement: issue.replacement,
        explanation: issue.explanation,
        confidence: issue.confidence,
      });
      categories[issue.category] = (categories[issue.category] || 0) + 1;
    }
  });

  // 5. Generate clean .docx (all fixes applied)
  let cleanXml = docXml;
  for (const issue of allIssues) {
    const para = paragraphs.find((p) => p.index === issue.paragraphIndex);
    if (para) {
      const newParaXml = replaceInParagraphXml(
        para.xml,
        issue.original,
        issue.replacement
      );
      cleanXml = cleanXml.replace(para.xml, newParaXml);
      // Update the paragraph reference for subsequent fixes
      para.xml = newParaXml;
    }
  }

  const cleanZip = new JSZip();
  // Copy all files except document.xml
  for (const [path, file] of Object.entries(zip.files)) {
    if (path === "word/document.xml") {
      cleanZip.file(path, cleanXml);
    } else if (!file.dir) {
      const content = await file.async("arraybuffer");
      cleanZip.file(path, content);
    }
  }
  const cleanBuffer = await cleanZip.generateAsync({ type: "nodebuffer" });

  // 6. Generate tracked changes .docx
  let trackedXml = docXml;
  let revId = 1;
  for (const issue of allIssues) {
    const para = paragraphs.find((p) => p.index === issue.paragraphIndex);
    if (para) {
      const newParaXml = generateTrackedChangesXml(
        para.xml,
        issue.original,
        issue.replacement,
        revId
      );
      trackedXml = trackedXml.replace(para.xml, newParaXml);
      para.xml = newParaXml;
      revId += 2;
    }
  }

  const trackedZip = new JSZip();
  for (const [path, file] of Object.entries(zip.files)) {
    if (path === "word/document.xml") {
      trackedZip.file(path, trackedXml);
    } else if (!file.dir) {
      const content = await file.async("arraybuffer");
      trackedZip.file(path, content);
    }
  }
  const trackedBuffer = await trackedZip.generateAsync({ type: "nodebuffer" });

  return {
    cleanBuffer,
    trackedBuffer,
    issues: allIssues,
    summary: {
      totalParagraphs: paragraphs.length,
      paragraphsChecked: paragraphsChecked.length,
      totalIssues: allIssues.length,
      categories,
    },
  };
}
