import JSZip from "jszip";
import { checkGrammar } from "./grammar.js";

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

// Extract paragraphs from word/document.xml
function extractParagraphs(docXml: string): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  const pRegex = /<w:p[\s>](?:[^<]|<(?!\/w:p>))*<\/w:p>/gs;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pRegex.exec(docXml)) !== null) {
    const pXml = match[0];
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
export async function processDocx(docxBuffer: Buffer): Promise<DocxResult> {
  // 1. Load the .docx ZIP
  const zip = await JSZip.loadAsync(docxBuffer);

  // 2. Get the main document XML
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Invalid .docx file: word/document.xml not found");
  }
  const docXml = await docXmlFile.async("string");

  // 3. Extract paragraphs
  const paragraphs = extractParagraphs(docXml);
  const paragraphsChecked = paragraphs.filter((p) => p.text.length >= 10).slice(0, 10); // Max 10 paragraphs

  // 4. Check grammar on each paragraph (with per-paragraph timeout)
  const allIssues: DocxIssue[] = [];
  const categories: Record<string, number> = {};

  for (const para of paragraphsChecked) {
    try {
      const result = await Promise.race([
        checkGrammar({ text: para.text, mode: "review", lightweight: true }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
      ]);
      for (const issue of result.issues) {
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
    } catch (err) {
      console.error(`Grammar check failed for paragraph ${para.index}:`, err);
    }
  }

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
