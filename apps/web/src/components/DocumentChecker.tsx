import { useState, useRef } from "react";
import { useGrammarStore } from "../hooks/useGrammarStore";

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
  sessionId: string;
  issues: DocxIssue[];
  summary: {
    totalParagraphs: number;
    paragraphsChecked: number;
    totalIssues: number;
    categories: Record<string, number>;
  };
  downloads: {
    clean: string;
    tracked: string;
  };
}

export function DocumentChecker() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<DocxResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceProfileId = useGrammarStore((s) => s.voiceProfileId);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".docx")) {
      setError("Only .docx files are supported");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("File must be under 5MB");
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const url = voiceProfileId
        ? `https://prosepilot.io/v1/documents/check?voiceProfileId=${encodeURIComponent(voiceProfileId)}`
        : "https://prosepilot.io/v1/documents/check";

      const res = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Processing failed");
      }

      const data: DocxResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadUrl = (type: "clean" | "tracked") => {
    if (!result) return "#";
    return `https://prosepilot.io${result.downloads[type]}`;
  };

  const categoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      spelling: "#dc2626",
      grammar: "#ea580c",
      punctuation: "#d97706",
      style: "#6366f1",
      clarity: "#8b5cf6",
      conciseness: "#059669",
      tone: "#0891b2",
    };
    return colors[cat] || "#6366f1";
  };

  return (
    <div className="card p-6">
      {/* Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? "border-brand-500 bg-brand-50"
            : file
              ? "border-brand-300 bg-brand-50/50"
              : "border-surface-300 hover:border-brand-400 hover:bg-surface-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <div className="space-y-2">
            <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="font-medium text-ink-900">{file.name}</p>
            <p className="text-sm text-ink-400">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-12 h-12 bg-surface-100 rounded-xl flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="font-medium text-ink-700">Drop a Word document here</p>
            <p className="text-sm text-ink-400">or click to browse (.docx, max 5MB)</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Process Button */}
      {file && !result && (
        <button
          onClick={handleUpload}
          disabled={isProcessing}
          className="mt-4 w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing document...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Check Grammar
            </>
          )}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="mt-6 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-ink-900">{result.summary.paragraphsChecked}</div>
              <div className="text-xs text-ink-500">Paragraphs checked</div>
            </div>
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-brand-600">{result.summary.totalIssues}</div>
              <div className="text-xs text-ink-500">Issues found</div>
            </div>
            <div className="text-center p-3 bg-surface-50 rounded-lg">
              <div className="text-2xl font-bold text-ink-900">{result.summary.totalParagraphs}</div>
              <div className="text-xs text-ink-500">Total paragraphs</div>
            </div>
          </div>

          {/* Category breakdown */}
          {Object.keys(result.summary.categories).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.summary.categories).map(([cat, count]) => (
                <span
                  key={cat}
                  className="px-3 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: categoryColor(cat) }}
                >
                  {cat}: {count}
                </span>
              ))}
            </div>
          )}

          {/* Issues list */}
          {result.issues.length > 0 && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              <h4 className="font-semibold text-ink-900 text-sm">Issues Found</h4>
              {result.issues.map((issue, i) => (
                <div
                  key={i}
                  className="p-3 bg-surface-50 rounded-lg border-l-3"
                  style={{ borderLeftColor: categoryColor(issue.category) }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: categoryColor(issue.category) }}
                    >
                      {issue.category}
                    </span>
                    <span className="text-xs text-ink-400">
                      Para {issue.paragraphIndex + 1}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-red-600 line-through">{issue.original}</span>
                    <span className="text-ink-400 mx-2">→</span>
                    <span className="text-green-600 font-medium">{issue.replacement}</span>
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{issue.explanation}</p>
                </div>
              ))}
            </div>
          )}

          {/* Download buttons */}
          <div className="flex gap-3">
            <a
              href={downloadUrl("clean")}
              className="flex-1 btn-primary py-3 text-center flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Fixed (.docx)
            </a>
            <a
              href={downloadUrl("tracked")}
              className="flex-1 btn-secondary py-3 text-center flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download with Track Changes
            </a>
          </div>

          {/* Reset */}
          <button
            onClick={() => { setFile(null); setResult(null); setError(null); }}
            className="w-full text-sm text-ink-500 hover:text-ink-700"
          >
            Check another document
          </button>
        </div>
      )}
    </div>
  );
}
