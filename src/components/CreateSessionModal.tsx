import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Briefcase,
  Bot,
  Globe,
  Cpu,
  Sparkles,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
  BookOpen,
  ExternalLink,
  RotateCw,
} from 'lucide-react';
import { WEB_API_URL } from '../utils/config';
import { openBrowserUrl } from '../utils/browser';
import { getStoredToken } from '../utils/store';

interface ResumeOption {
  id: string;
  title: string;
  file_name?: string;
  is_active?: boolean;
}

interface DocumentOption {
  id: string;
  title: string;
  category?: string;
  file_name?: string;
}

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  token?: string | null;
  onSessionCreated?: (sessionId: string, session?: any) => void;
}

export function CreateSessionModal({
  isOpen,
  onClose,
  token,
  onSessionCreated,
}: CreateSessionModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1: Details
  const [sessionType, setSessionType] = useState<'interview' | 'mock'>('interview');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobLink, setJobLink] = useState('');

  // Grounding Context: Resumes & Documents
  const [resumes, setResumes] = useState<ResumeOption[]>([]);
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [loadingContext, setLoadingContext] = useState<boolean>(false);

  // Step 2: Preferences
  const [language, setLanguage] = useState('English');
  const [model, setModel] = useState('gemini');
  const [aiInstructions, setAiInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [saveTranscript, setSaveTranscript] = useState(true);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;

    setStep(1);
    setCompany('');
    setRole('');
    setJobDescription('');
    setJobLink('');
    setErrors({});
    setSelectedResumeId('');
    setSelectedDocumentId('');
  }, [isOpen]);

  // Fetch user's resumes and documents from web API
  const fetchContextData = useCallback(async () => {
    setLoadingContext(true);
    try {
      const activeToken = token || (await getStoredToken());
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const [resumesRes, docsRes] = await Promise.allSettled([
        fetch(`${WEB_API_URL}/api/resumes`, { headers }).then(async (r) => {
          if (!r.ok) {
            console.warn(`[Desktop Modal] /api/resumes responded with status ${r.status}`);
            return null;
          }
          return r.json();
        }),
        fetch(`${WEB_API_URL}/api/documents`, { headers }).then(async (r) => {
          if (!r.ok) {
            console.warn(`[Desktop Modal] /api/documents responded with status ${r.status}`);
            return null;
          }
          return r.json();
        }),
      ]);

      if (resumesRes.status === 'fulfilled' && resumesRes.value) {
        const list: ResumeOption[] = resumesRes.value.resumes || [];
        setResumes(list);
        const active = list.find((r) => r.is_active) || list[0];
        if (active) {
          setSelectedResumeId(active.id);
        }
      } else {
        if (resumesRes.status === 'rejected') {
          console.warn('[Desktop Modal] Resumes fetch rejected:', resumesRes.reason);
        }
        setResumes([]);
      }

      if (docsRes.status === 'fulfilled' && docsRes.value) {
        const list: DocumentOption[] = docsRes.value.documents || [];
        setDocuments(list);
        if (list.length > 0) {
          setSelectedDocumentId(list[0].id);
        }
      } else {
        if (docsRes.status === 'rejected') {
          console.warn('[Desktop Modal] Documents fetch rejected:', docsRes.reason);
        }
        setDocuments([]);
      }
    } catch (err) {
      console.warn('[Desktop Modal] Error fetching resumes/documents:', err);
    } finally {
      setLoadingContext(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      fetchContextData();
    }
  }, [isOpen, fetchContextData]);

  if (!isOpen) return null;

  const handleNext = () => {
    const errs: Record<string, string> = {};
    if (!company.trim()) {
      errs.company = 'Company name is required';
    }
    if (!role.trim()) {
      errs.role = 'Target role is required (e.g. Frontend Developer)';
    }
    if (!jobDescription.trim()) {
      errs.jobDescription = 'Job description is required';
    } else if (jobDescription.trim().length < 5) {
      errs.jobDescription = 'Job description must be at least 5 characters';
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep(2);
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setErrors({});

    const payload = {
      session_type: sessionType,
      company_name: company.trim(),
      role: role.trim(),
      job_link: jobLink.trim(),
      job_description: jobDescription.trim(),
      resume_id: selectedResumeId || null,
      document_id: selectedDocumentId || null,
      language: language,
      model: model,
      ai_instructions: aiInstructions.trim(),
      auto_generate: false,
      save_transcript: saveTranscript,
    };

    const activeToken = token || (await getStoredToken());
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }

    try {
      // Create session directly via cloud web API
      const res = await fetch(`${WEB_API_URL}/api/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        const createdSessionId = data.session_id || data.id;
        const newSessionObj = {
          id: createdSessionId,
          title: role.trim() ? `${company.trim()} - ${role.trim()}` : `${company.trim()} Session`,
          company_name: company.trim(),
          role: role.trim(),
          job_description: jobDescription.trim(),
          resume_id: selectedResumeId || null,
          document_id: selectedDocumentId || null,
          mode: sessionType,
          model: model,
          duration_seconds: 0,
          save_transcript: saveTranscript,
          created_at: new Date().toISOString(),
        };

        if (onSessionCreated) {
          onSessionCreated(createdSessionId, newSessionObj);
        }
        onClose();
      } else {
        const errText = res ? await res.text().catch(() => '') : '';
        setErrors({
          submit: 'Could not create session. Please make sure the service is running.',
        });
        console.warn('[Desktop Create Session] Error response:', errText);
      }
    } catch (e: any) {
      console.error('[Desktop Create Session] Error:', e);
      setErrors({
        submit: e?.message || 'Failed to connect to backend server.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs">
              {step === 1 ? '1' : '2'}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {step === 1 ? 'New Interview Session' : 'Session Preferences'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {step === 1 ? 'Enter your target job details' : 'Configure model & AI copilot'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {errors.submit && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 flex items-center gap-2 text-rose-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[11px]">{errors.submit}</span>
            </div>
          )}

          {step === 1 && (
            <>
              {/* Session Type */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300">Session Type</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSessionType('interview')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      sessionType === 'interview'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Interview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSessionType('mock')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      sessionType === 'mock'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Bot className="w-3.5 h-3.5 text-purple-500" />
                    <span>Mock Interview</span>
                  </button>
                </div>
              </div>

              {/* Company Name */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    if (errors.company) setErrors((prev) => ({ ...prev, company: '' }));
                  }}
                  placeholder="e.g. Google, Stripe, Microsoft"
                  className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
                    errors.company
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-slate-200 dark:border-slate-800 focus:border-emerald-500'
                  }`}
                />
                {errors.company && (
                  <p className="text-[11px] text-rose-500">{errors.company}</p>
                )}
              </div>

              {/* Target Role / Position */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Target Role / Position <span className="text-rose-500">*</span>
                  </label>
                  {errors.role && (
                    <span className="text-[11px] text-rose-500">{errors.role}</span>
                  )}
                </div>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value);
                    if (errors.role) setErrors((prev) => ({ ...prev, role: '' }));
                  }}
                  placeholder="e.g. Frontend Developer, Data Analyst, Product Manager"
                  className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
                    errors.role
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-slate-200 dark:border-slate-800 focus:border-emerald-500'
                  }`}
                />

                {/* Role Suggestion Quick-Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-400">Suggestions:</span>
                  {[
                    'Frontend Developer',
                    'Backend Developer',
                    'Full Stack Engineer',
                    'Data Analyst',
                    'Product Manager',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setRole(preset);
                        if (errors.role) setErrors((prev) => ({ ...prev, role: '' }));
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all cursor-pointer font-medium ${
                        role.toLowerCase() === preset.toLowerCase()
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold'
                          : 'bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Job Description */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Job Description / Requirements <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={jobDescription}
                  onChange={(e) => {
                    setJobDescription(e.target.value);
                    if (errors.jobDescription) setErrors((prev) => ({ ...prev, jobDescription: '' }));
                  }}
                  placeholder="Paste key responsibilities or requirements..."
                  className={`w-full bg-slate-50 dark:bg-slate-950 border rounded-xl p-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
                    errors.jobDescription
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-slate-200 dark:border-slate-800 focus:border-emerald-500'
                  }`}
                />
                {errors.jobDescription && (
                  <p className="text-[11px] text-rose-500">{errors.jobDescription}</p>
                )}
              </div>

              {/* Job Link */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Job Link <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="url"
                  value={jobLink}
                  onChange={(e) => setJobLink(e.target.value)}
                  placeholder="https://linkedin.com/jobs/view/..."
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Grounding Context */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Grounding Context
                  </span>
                  {loadingContext && (
                    <span className="text-[10px] text-emerald-500 flex items-center gap-1 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Syncing web data...</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Resume Selector */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span>Active Resume</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fetchContextData()}
                          disabled={loadingContext}
                          className="text-[10px] text-slate-400 hover:text-emerald-500 flex items-center gap-0.5 cursor-pointer font-medium transition-colors disabled:opacity-50"
                          title="Refresh resumes list"
                        >
                          <RotateCw className={`w-2.5 h-2.5 ${loadingContext ? 'animate-spin text-emerald-500' : ''}`} />
                          <span>Refresh</span>
                        </button>
                        <span className="text-slate-600 text-[10px]">·</span>
                        <button
                          type="button"
                          onClick={() => openBrowserUrl(`${WEB_API_URL}/dashboard/resumes`)}
                          className="text-[10px] text-emerald-500 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                          title="Manage resumes on web dashboard"
                        >
                          <span>Manage</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <select
                      value={selectedResumeId}
                      onChange={(e) => setSelectedResumeId(e.target.value)}
                      disabled={loadingContext}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      <option value="">None / Auto-detect</option>
                      {resumes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title || r.file_name || 'Resume'}{r.is_active ? ' (Active)' : ''}
                        </option>
                      ))}
                    </select>
                    {resumes.length === 0 && !loadingContext && (
                      <p className="text-[10px] text-slate-400">
                        No resumes found on web profile.
                      </p>
                    )}
                  </div>

                  {/* Document Selector */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        <span>Context Document</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fetchContextData()}
                          disabled={loadingContext}
                          className="text-[10px] text-slate-400 hover:text-teal-500 flex items-center gap-0.5 cursor-pointer font-medium transition-colors disabled:opacity-50"
                          title="Refresh documents list"
                        >
                          <RotateCw className={`w-2.5 h-2.5 ${loadingContext ? 'animate-spin text-teal-500' : ''}`} />
                          <span>Refresh</span>
                        </button>
                        <span className="text-slate-600 text-[10px]">·</span>
                        <button
                          type="button"
                          onClick={() => openBrowserUrl(`${WEB_API_URL}/dashboard/documents`)}
                          className="text-[10px] text-teal-500 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                          title="Manage documents on web dashboard"
                        >
                          <span>Manage</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                    <select
                      value={selectedDocumentId}
                      onChange={(e) => setSelectedDocumentId(e.target.value)}
                      disabled={loadingContext}
                      className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      <option value="">None / General prep</option>
                      {documents.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title || d.file_name || 'Document'}{d.category ? ` (${d.category})` : ''}
                        </option>
                      ))}
                    </select>
                    {documents.length === 0 && !loadingContext && (
                      <p className="text-[10px] text-slate-400">
                        No custom docs found on web profile.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Language Selection */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Language</div>
                    <div className="text-[10px] text-slate-500">Audio recognition</div>
                  </div>
                </div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-200"
                >
                  <option value="English">English</option>
                  <option value="Spanish">Spanish</option>
                  <option value="French">French</option>
                  <option value="German">German</option>
                </select>
              </div>

              {/* Model Selection - STRICTLY GEMINI AND CHATGPT */}
              <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-purple-500" />
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">AI Model</div>
                    <div className="text-[10px] text-slate-500">Speed and answer style</div>
                  </div>
                </div>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-200 font-medium"
                >
                  <option value="gemini">⚡ Gemini (Google AI)</option>
                  <option value="chatgpt">🚀 ChatGPT (OpenAI)</option>
                </select>
              </div>

              {/* AI Instructions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Custom AI Instructions</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="text-[11px] text-emerald-500 hover:underline cursor-pointer font-semibold"
                  >
                    {showInstructions ? 'Hide' : '+ Add'}
                  </button>
                </div>
                {showInstructions && (
                  <textarea
                    rows={2}
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    placeholder="e.g. Focus on concise 3-bullet STAR answers with high technical depth."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                )}
              </div>

              {/* Save Transcript */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={saveTranscript}
                  onChange={(e) => setSaveTranscript(e.target.checked)}
                  className="rounded text-emerald-500 focus:ring-0"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-400">
                  Save call transcripts and AI answers in history
                </span>
              </label>
            </>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer"
            >
              Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold cursor-pointer"
            >
              Cancel
            </button>
          )}

          {step === 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
            >
              <span>Next: Preferences</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-emerald-600/20"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Session</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
