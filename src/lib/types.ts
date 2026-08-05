export type Provider = 'openai';

export type Tone = 'concise' | 'professional' | 'warm';

export interface Settings {
  provider: Provider;
  apiKey: string;
  /** Free-form so a newer model can be used without shipping a new build. */
  model: string;
  tone: Tone;
  /** Extra standing instructions from the candidate, appended to the system prompt. */
  customInstruction: string;
  /** Send the detected job posting with each question. Off means shorter, cheaper requests. */
  useJobPosting: boolean;
}

export interface Profile {
  /** Resume as plain text. This is the single source of truth. */
  raw: string;
  updatedAt: number;
}

export interface JobContext {
  title?: string;
  company?: string;
  description?: string;
}

/** A posting found on a page, kept so it survives the walk to the form. */
export interface JobCapture extends JobContext {
  url: string;
  /**
   * How it was found. Structured data is trustworthy, meta tags are a guess, and
   * `manual` is the candidate pasting the text themselves, which beats both.
   */
  source: 'json-ld' | 'meta' | 'manual';
  capturedAt: number;
}

/**
 * Why this posting was picked, in descending confidence. Shown to the candidate
 * verbatim: a guess that looks identical to a certainty is the thing to avoid.
 */
export type JobMatch = 'manual' | 'page' | 'origin' | 'recent';

/**
 * What the panel should say about the posting. One case per pill state, so the
 * content script renders what it is told rather than re-deriving it.
 */
export type JobState =
  /** Switched off in settings. The panel shows nothing about postings at all. */
  | { kind: 'disabled' }
  | { kind: 'none' }
  /** `detected` is what a pasted posting is standing in front of, when there is one. */
  | { kind: 'using'; job: JobCapture; match: JobMatch; detected?: JobCapture }
  /** Turned off for this site by the candidate. `available` is what it would use. */
  | { kind: 'off'; available: JobCapture | null };

export interface QuestionContext {
  question: string;
  /** From the field's maxlength attribute, when present. */
  maxChars?: number;
  /** Parsed from nearby text such as "200 words max". */
  wordLimit?: number;
  job?: JobContext;
  pageUrl?: string;
}

/** How the answer should differ from a previous attempt. */
export type Variant = 'default' | 'shorter' | 'custom';

export interface TokenUsage {
  input: number;
  output: number;
}

// Message contract between page scripts and the service worker. The service
// worker is the only context that reads the API key.
export interface GenerateRequest {
  type: 'generate';
  context: QuestionContext;
  variant?: Variant;
  /** Previous answer, required to make `shorter` meaningful. */
  previous?: string;
  /** Free-form revision direction typed by the candidate, used by `custom`. */
  instruction?: string;
}

/** A posting spotted on page load, banked for the form page that comes next. */
export interface RememberJobRequest {
  type: 'remember-job';
  job: JobCapture;
}

/**
 * Which posting applies to this page. Carries any posting found on the page
 * itself, so remembering and resolving happen in one round trip rather than two
 * racing ones.
 */
export interface JobForPageRequest {
  type: 'job-for-page';
  url: string;
  found?: JobCapture;
}

/**
 * The candidate overriding the posting for the site they are on. One message for
 * all three moves, each answering with the state the panel should now show.
 */
export interface SetJobRequest {
  type: 'set-job';
  url: string;
  /**
   * `paste` uses `text` for the site, `use-detected` throws that away for whatever
   * was found on the page, `off` answers without one, and `on` undoes `off`.
   */
  action: 'paste' | 'use-detected' | 'off' | 'on';
  text?: string;
}

export type RuntimeRequest =
  | GenerateRequest
  | RememberJobRequest
  | JobForPageRequest
  | SetJobRequest;

export type GenerateResponse =
  | { ok: true; answer: string; usage?: TokenUsage }
  | { ok: false; error: string };
