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
import { BACKEND_API_URL, WEB_API_URL } from '../utils/config';
import { deviceBoundFetch } from '../utils/deviceBoundFetch';
import { openBrowserUrl } from '../utils/browser';
import { getStoredToken } from '../utils/store';
import {
  buildInterviewInstructions,
  getInterviewFocus,
  INTERVIEW_FOCUS_OPTIONS,
  InterviewFocusId,
} from '../utils/interviewFocus';

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

interface InterviewModelOption {
  id: string;
  label: string;
}

function getInterviewModelDisplayName(label: string): string {
  return label
    .replace(/\s*\(\s*free\s*\)\s*/gi, ' ')
    .replace(/\s*[·•|–—-]\s*free\s*$/i, '')
    .trim();
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
  const [interviewFocus, setInterviewFocus] = useState<InterviewFocusId | ''>('');
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
  const [contextLoadError, setContextLoadError] = useState<string | null>(null);

  // Step 2: Preferences
  const [language, setLanguage] = useState('English');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState<InterviewModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [aiInstructions, setAiInstructions] = useState('');
  const [showInstructions, setShowInstructions] = useState(false);
  const [saveTranscript, setSaveTranscript] = useState(true);

  // Status
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchInterviewModels = useCallback(async (signal?: AbortSignal) => {
    setModelsLoading(true);
    setModelsError(null);

    try {
      const activeToken = token || (await getStoredToken());
      const headers: Record<string, string> = {};
      if (activeToken) headers.Authorization = `Bearer ${activeToken}`;

      const response = await deviceBoundFetch(`${BACKEND_API_URL}/api/interview-models`, {
        headers,
        cache: 'no-store',
        signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.detail || `Could not load active interview models (${response.status}).`);
      }

      const models = Array.isArray(data?.models)
        ? data.models.filter((item: unknown): item is InterviewModelOption => {
            if (!item || typeof item !== 'object') return false;
            const candidate = item as Partial<InterviewModelOption>;
            return typeof candidate.id === 'string' && typeof candidate.label === 'string';
          })
        : [];

      setAvailableModels(models);
      const defaultModel = typeof data?.defaultModel === 'string' && models.some((item: InterviewModelOption) => item.id === data.defaultModel)
        ? data.defaultModel
        : models[0]?.id || '';
      setModel(defaultModel);
      if (models.length === 0) setModelsError('No interview models are currently active. Please try again later.');
    } catch (error) {
      if (signal?.aborted) return;
      setAvailableModels([]);
      setModel('');
      setModelsError(error instanceof Error ? error.message : 'Could not load active interview models.');
    } finally {
      if (!signal?.aborted) setModelsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void fetchInterviewModels(controller.signal);
    return () => controller.abort();
  }, [isOpen, fetchInterviewModels]);

  useEffect(() => {
    if (!isOpen) return;

    setStep(1);
    setCompany('');
    setRole('');
    setJobDescription('');
    setJobLink('');
    setInterviewFocus('');
    setErrors({});
    setSelectedResumeId('');
    setSelectedDocumentId('');
    setContextLoadError(null);
  }, [isOpen]);

  // Fetch user's resumes and documents from the backend API.
  const fetchContextData = useCallback(async () => {
    setLoadingContext(true);
    setContextLoadError(null);
    try {
      const activeToken = token || (await getStoredToken());
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const fetchJson = async (path: string) => {
        const response = await deviceBoundFetch(`${BACKEND_API_URL}${path}`, { headers, cache: 'no-store' });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.detail || `Backend returned ${response.status} for ${path}`);
        }
        return body;
      };

      const [resumesRes, docsRes] = await Promise.allSettled([
        fetchJson('/api/resumes'),
        fetchJson('/api/documents'),
      ]);
      const errors: string[] = [];

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
          errors.push('resumes');
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
          errors.push('documents');
        }
        setDocuments([]);
      }
      if (errors.length > 0) {
        setContextLoadError(`Could not load ${errors.join(' and ')} from Ghostove Backend. Check the connection and retry.`);
      }
    } catch (err) {
      console.warn('[Desktop Modal] Error fetching resumes/documents:', err);
      setContextLoadError('Could not reach Ghostove Backend. Check the connection and retry.');
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
    if (modelsLoading || !availableModels.some((item) => item.id === model)) {
      setErrors((current) => ({
        ...current,
        submit: modelsError || 'Select an active interview model before creating the session.',
      }));
      return;
    }

    setSubmitting(true);
    setErrors({});

    const payload = {
      session_type: sessionType,
      interview_mode: interviewFocus || null,
      company_name: company.trim(),
      role: role.trim(),
      job_link: jobLink.trim(),
      job_description: jobDescription.trim(),
      resume_id: selectedResumeId || null,
      document_id: selectedDocumentId || null,
      language: language,
      model: model,
      ai_instructions: buildInterviewInstructions(interviewFocus, aiInstructions),
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
      // Create the session through the backend API; Web remains the pairing and dashboard surface.
      const res = await deviceBoundFetch(`${BACKEND_API_URL}/api/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
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
          interview_mode: interviewFocus || null,
          ai_instructions: buildInterviewInstructions(interviewFocus, aiInstructions),
          language,
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
        const errorBody = await res.json().catch(() => null);
        const errText = errorBody?.detail || errorBody?.error || `Backend returned ${res.status}`;
        setErrors({
          submit: `Could not create session: ${errText}`,
        });
        console.warn('[Desktop Create Session] Error response:', errorBody);
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
                    onClick={() => {
                      setSessionType('mock');
                      if (model.toLowerCase().includes('claude')) {
                        const fallback = availableModels.find((item) => !item.id.toLowerCase().includes('claude'));
                        if (fallback) setModel(fallback.id);
                      }
                    }}
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

              <div className="space-y-1.5">
                <label htmlFor="interview-focus" className="font-semibold text-slate-700 dark:text-slate-300">
                  Interview focus <span className="font-normal text-slate-400">(Optional)</span>
                </label>
                <select
                  id="interview-focus"
                  value={interviewFocus}
                  onChange={(event) => setInterviewFocus(event.target.value as InterviewFocusId | '')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 transition-colors focus:border-emerald-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">No specific focus</option>
                  {INTERVIEW_FOCUS_OPTIONS.map((focus) => (
                    <option key={focus.id} value={focus.id}>{focus.label}</option>
                  ))}
                </select>
                <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400" aria-live="polite">
                  {getInterviewFocus(interviewFocus)?.description || 'Ghostove will use your role and job description for general interview help.'}
                </p>
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
                      <span>Syncing backend data...</span>
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
                        No resumes found on your account.
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
                        No context documents found on your account.
                      </p>
                    )}
                  </div>
                </div>
                {contextLoadError && (
                  <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                    <span>{contextLoadError}</span>
                    <button
                      type="button"
                      onClick={() => fetchContextData()}
                      disabled={loadingContext}
                      className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      Retry
                    </button>
                  </div>
                )}
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

              {/* Model Selection */}
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
                  onChange={(e) => {
                    setModel(e.target.value);
                    if (errors.submit) setErrors((current) => ({ ...current, submit: '' }));
                  }}
                  disabled={modelsLoading || availableModels.length === 0}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-slate-200 font-medium"
                >
                  {modelsLoading && <option value="">Loading active models…</option>}
                  {!modelsLoading && availableModels.length === 0 && <option value="">No active models</option>}
                  {availableModels.map((item) => (
                    <option key={item.id} value={item.id}>
                      {getInterviewModelDisplayName(item.label)}
                    </option>
                  ))}
                </select>
              </div>
              {modelsError && (
                <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                  <span>{modelsError}</span>
                  <button
                    type="button"
                    onClick={() => void fetchInterviewModels()}
                    disabled={modelsLoading}
                    className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              )}

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
              disabled={submitting || modelsLoading || !availableModels.some((item) => item.id === model)}
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
