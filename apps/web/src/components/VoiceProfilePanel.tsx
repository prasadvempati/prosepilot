import { useState, useEffect } from "react";
import { useGrammarStore } from "../hooks/useGrammarStore";

interface VoiceProfileData {
  id: string;
  name: string;
  sampleCount: number;
  sentenceLength: { avg: number; median: number };
  vocabulary: { typeTokenRatio: number; avgWordLength: number };
  punctuation: { semicolonFrequency: number; commaDensity: number };
  style: { contractionRatio: number; passiveVoiceRatio: number };
  tone: { formalityScore: number; directnessScore: number; confidenceScore: number };
}

interface ProfileSummary {
  profile: VoiceProfileData | null;
  summary: string | null;
}

export function VoiceProfilePanel() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [sampleText, setSampleText] = useState("");
  const [profileName, setProfileName] = useState("My Voice");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const setVoiceProfileId = useGrammarStore((s) => s.setVoiceProfileId);

  // Load existing profile on mount
  useEffect(() => {
    fetch("/v1/voice-profile")
      .then(r => r.json())
      .then(data => {
        if (data.profile) {
          setProfile(data);
          setVoiceProfileId(data.profile.id);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (sampleText.trim().length < 50) {
      setMessage("Please provide at least 50 characters of your writing");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/v1/voice-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sampleText,
          name: profileName,
        }),
      });

      const data = await res.json();
      setProfile(data);
      setVoiceProfileId(data.profile?.id || null);
      setMessage(data.message || "Voice profile updated");
      setSampleText("");
    } catch (err) {
      setMessage("Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    try {
      await fetch("/v1/voice-profile", { method: "DELETE" });
      setProfile(null);
      setVoiceProfileId(null);
      setMessage("Voice profile deleted");
    } catch (err) {
      setMessage("Failed to delete profile");
    }
  };

  return (
    <div className="card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-900">Voice Profile</h3>
          <p className="text-sm text-ink-500">
            Teach ProsePilot how YOU write — so it only flags real errors, not style choices
          </p>
        </div>
        <button
          onClick={() => setShowInfo(!showInfo)}
          className="text-ink-400 hover:text-ink-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* Info panel */}
      {showInfo && (
        <div className="p-4 bg-brand-50 border border-brand-100 rounded-xl text-sm text-ink-700 space-y-2">
          <p className="font-medium text-brand-800">How Voice Profiles work:</p>
          <ul className="list-disc list-inside space-y-1 text-ink-600">
            <li>Paste 3-5 samples of your writing (emails, reports, messages)</li>
            <li>ProsePilot learns your sentence length, vocabulary, punctuation habits, and tone</li>
            <li>When checking new text, it only flags <strong>real errors</strong> — not your personal style</li>
            <li>Your data stays private — nothing is used for AI training</li>
          </ul>
          <p className="text-brand-700 font-medium">Grammarly forces everyone to sound the same. ProsePilot learns how YOU write.</p>
        </div>
      )}

      {/* Current profile status */}
      {profile?.profile ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-green-800">{profile.profile.name} — Active</p>
              <p className="text-xs text-green-600">{profile.profile.sampleCount} writing sample(s) analyzed</p>
            </div>
          </div>

          {/* Profile stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-ink-500 mb-1">Avg Sentence Length</div>
              <div className="font-semibold text-ink-900">{profile.profile.sentenceLength.avg.toFixed(0)} words</div>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-ink-500 mb-1">Vocabulary Richness</div>
              <div className="font-semibold text-ink-900">{(profile.profile.vocabulary.typeTokenRatio * 100).toFixed(0)}%</div>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-ink-500 mb-1">Formality</div>
              <div className="font-semibold text-ink-900">{(profile.profile.tone.formalityScore * 100).toFixed(0)}%</div>
            </div>
            <div className="p-3 bg-surface-50 rounded-lg">
              <div className="text-xs text-ink-500 mb-1">Directness</div>
              <div className="font-semibold text-ink-900">{(profile.profile.tone.directnessScore * 100).toFixed(0)}%</div>
            </div>
          </div>

          {profile.summary && (
            <p className="text-sm text-ink-600 italic">Your style: {profile.summary}</p>
          )}

          {/* Add more samples */}
          <div className="border-t border-surface-200 pt-4">
            <p className="text-sm font-medium text-ink-700 mb-2">Add another writing sample to improve accuracy:</p>
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Paste another piece of your writing here..."
              className="w-full h-24 p-3 border border-surface-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || sampleText.trim().length < 50}
                className="btn-primary text-sm px-4 py-2"
              >
                {isSubmitting ? "Analyzing..." : "Add Sample"}
              </button>
              <button
                onClick={handleReset}
                className="text-sm text-ink-500 hover:text-red-600 transition-colors"
              >
                Reset Profile
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* No profile yet — create one */
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <p className="font-medium mb-1">No voice profile yet</p>
            <p>Paste some of your writing below to teach ProsePilot your style. The more samples you provide, the better it gets.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Profile Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full p-3 border border-surface-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="e.g., Work Emails, Academic Writing"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Your Writing Sample</label>
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Paste a few paragraphs of your writing here — emails, reports, messages, anything that represents your style..."
              className="w-full h-36 p-3 border border-surface-300 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <p className="text-xs text-ink-400 mt-1">
              {sampleText.length} / 50 characters minimum — {sampleText.length >= 50 ? "Ready!" : `Need ${50 - sampleText.length} more`}
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || sampleText.trim().length < 50}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing your writing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Build My Voice Profile
              </>
            )}
          </button>
        </div>
      )}

      {/* Status message */}
      {message && (
        <div className="p-3 bg-brand-50 border border-brand-100 rounded-lg text-sm text-brand-700">
          {message}
        </div>
      )}
    </div>
  );
}
