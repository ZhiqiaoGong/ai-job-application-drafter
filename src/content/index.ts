import type {
  GenerateRequest,
  GenerateResponse,
  JobForPageRequest,
  JobState,
  QuestionContext,
  RememberJobRequest,
  RuntimeRequest,
  SetJobRequest,
  Variant,
} from '../lib/types';
import { isAnswerField, readFieldValue, type AnswerField } from './detect';
import { writeAnswer } from './insert';
import { extractJob } from './job';
import { extractLimits, extractQuestion } from './question';
import * as ui from './ui';

interface FieldState {
  element: AnswerField;
  context: QuestionContext;
  /**
   * Field contents from before our first insert, so Undo can restore them.
   * Captured at insert time rather than on focus: the candidate may type their
   * own text first, and that is what Undo has to give back.
   */
  originalValue?: string;
  lastAnswer?: string;
  /**
   * The candidate's steering for this question. It is sticky: Redo and the
   * other revisions keep honouring it, because losing it on the next click
   * would silently discard what they asked for.
   */
  direction?: string;
}

/**
 * Per field, not per focus. Clicking away to read the posting and clicking back
 * used to wipe the draft, the direction, and the pre-insert value that Undo
 * restores, which quietly turned Undo into "restore the answer we wrote".
 */
const states = new WeakMap<AnswerField, FieldState>();

let active: FieldState | null = null;

/**
 * Which posting applies is a property of the page, not of one field. Pasting one
 * or turning it off is a decision about the application being filled, and a form
 * has several questions on it, so all of them see the same answer.
 */
let pageJob: JobState | undefined;
/** Which URL it was resolved for. Forms navigate in-page between applications. */
let pageJobUrl = '';
/** In flight while the posting is being resolved, so generation can wait for it. */
let pageJobPending: Promise<void> | undefined;

const RELOADED = 'The extension was reloaded. Reload this page to use it again.';

/**
 * Every message goes through here. Reloading or updating the extension tears
 * chrome.runtime out from under the content scripts already running in open tabs,
 * and sendMessage then throws synchronously - somewhere no `.catch` on the
 * returned promise can ever see it, which is how it escaped as an uncaught error.
 */
function send(request: RuntimeRequest): Promise<unknown> {
  try {
    return Promise.resolve(chrome.runtime.sendMessage(request)).catch((error: unknown) => {
      throw asError(error);
    });
  } catch (error) {
    return Promise.reject(asError(error));
  }
}

function asError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(/context invalidated/i.test(message) ? RELOADED : message);
}

/** A dead context is not a failed request: nothing works until the page reloads. */
function isReloaded(error: unknown): boolean {
  return error instanceof Error && error.message === RELOADED;
}

const handlers: ui.WidgetHandlers = {
  generate: onGenerate,
  undo: onUndo,
  clearDirection: onClearDirection,
  paste: onPaste,
  useDetected: onUseDetected,
  toggleJob: onToggleJob,
  dismiss,
};

// Focus is the trigger rather than a DOM scan: it costs nothing on pages the
// candidate is only reading, and it works with forms rendered after load.
document.addEventListener('focusin', onFocusIn, true);
document.addEventListener('focusout', onFocusOut, true);
document.addEventListener('pointerdown', onPointerDownAnywhere, true);

function onFocusIn(event: FocusEvent): void {
  const field = event.target;
  if (!isAnswerField(field)) {
    if (!ui.isOwnNode(event.target as Node)) dismiss();
    return;
  }

  const question = extractQuestion(field);
  // No recognisable question means this is some other site's textarea, not an
  // application form. Staying quiet is better than offering to write into it.
  if (!question) {
    dismiss();
    return;
  }

  const context: QuestionContext = {
    question,
    ...extractLimits(field),
    pageUrl: location.href,
  };

  let state = states.get(field);
  if (state) {
    // Re-read the surroundings: the form may have re-rendered since last time.
    state.context = context;
  } else {
    state = { element: field, context };
    states.set(field, state);
  }
  active = state;

  ui.showFor(field, handlers, {
    direction: state.direction,
    hasAnswer: Boolean(state.lastAnswer),
    ...(pageJob ? { job: pageJob } : {}),
  });

  if (pageJob === undefined || pageJobUrl !== location.href) resolvePageJob();
}

/**
 * Asked once per page, when the panel first opens rather than on load, so a form
 * reached by an in-page navigation still gets looked at without anything watching
 * the DOM.
 */
function resolvePageJob(): void {
  const found = extractJob();
  pageJobUrl = location.href;
  const request: JobForPageRequest = {
    type: 'job-for-page',
    url: pageJobUrl,
    ...(found ? { found } : {}),
  };

  pageJobPending = send(request)
    .then((state) => applyJobState(state as JobState))
    .catch((error: unknown) => {
      // A posting is a nice-to-have. Failing to find one must not block writing.
      pageJob = { kind: 'none' };
      if (active && isReloaded(error)) ui.setError(RELOADED);
    })
    .finally(() => {
      pageJobPending = undefined;
    });
}

function applyJobState(state: JobState): void {
  pageJob = state ?? { kind: 'none' };
  if (active) ui.setJob(pageJob);
}

function onPaste(text: string): void {
  void sendSetJob({ type: 'set-job', url: location.href, action: 'paste', text });
}

function onUseDetected(): void {
  void sendSetJob({ type: 'set-job', url: location.href, action: 'use-detected' });
}

function onToggleJob(on: boolean): void {
  void sendSetJob({ type: 'set-job', url: location.href, action: on ? 'on' : 'off' });
}

function sendSetJob(request: SetJobRequest): Promise<void> {
  return send(request)
    .then((state) => applyJobState(state as JobState))
    .catch((error: unknown) => {
      if (active && isReloaded(error)) ui.setError(RELOADED);
    });
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (ui.isOwnNode(next)) return;
  // Moving to another focusable thing, by click or by Tab, means they moved on.
  // A null relatedTarget is left to the pointerdown handler below, because it is
  // also what switching tabs looks like, and coming back should find the draft.
  if (next !== null) dismiss();
}

/**
 * Clicking blank page space fires focusout with a null relatedTarget, which is
 * indistinguishable from switching tabs or clicking browser chrome. A pointerdown
 * is the proof that it happened inside this document, so the panel can get out of
 * the way of the text it is covering without also vanishing on every tab switch.
 */
function onPointerDownAnywhere(event: Event): void {
  if (!active) return;
  const target = event.target as Node | null;
  if (ui.isOwnNode(target) || (target && active.element.contains(target))) return;
  dismiss();
}

function dismiss(): void {
  // Only the panel goes away. What the candidate built up stays with the field.
  active = null;
  ui.hide();
}

function onGenerate(variant: Variant, instruction?: string): void {
  if (!active) return;
  const target = active;

  // A newly typed instruction replaces the standing one for this field.
  if (instruction) {
    target.direction = instruction;
    ui.setDirection(instruction);
  }

  ui.setBusy(true, 'Writing...');

  // The posting resolves asynchronously, and the first click almost always
  // beats it. Sending early would answer without the job while the panel goes
  // on to claim one was used.
  void (pageJobPending ?? Promise.resolve()).then(() => requestAnswer(target, variant));
}

function requestAnswer(target: FieldState, variant: Variant): void {
  const job = pageJob?.kind === 'using' ? pageJob.job : undefined;
  const request: GenerateRequest = {
    type: 'generate',
    context: { ...target.context, ...(job ? { job } : {}) },
    variant,
    ...(target.lastAnswer ? { previous: target.lastAnswer } : {}),
    ...(target.direction ? { instruction: target.direction } : {}),
  };

  send(request)
    .then((result) => {
      const response = result as GenerateResponse;
      // The candidate may have moved to another field while we waited.
      if (active !== target) return;

      if (!response.ok) {
        ui.setBusy(false);
        ui.setError(response.error);
        return;
      }

      if (target.originalValue === undefined) {
        target.originalValue = readFieldValue(target.element);
      }
      writeAnswer(target.element, response.answer);
      target.lastAnswer = response.answer;
      ui.setBusy(false);
      ui.showResultActions();
    })
    .catch((error: unknown) => {
      if (active !== target) return;
      ui.setBusy(false);
      ui.setError(error instanceof Error ? error.message : String(error));
    });
}

function onClearDirection(): void {
  if (!active) return;
  active.direction = undefined;
  ui.setDirection(null);
}

function onUndo(): void {
  if (!active || active.originalValue === undefined) return;
  writeAnswer(active.element, active.originalValue);
  active.lastAnswer = undefined;
  // Undo discards the draft, not what the candidate asked for.
  ui.showFor(active.element, handlers, {
    direction: active.direction,
    hasAnswer: false,
    ...(pageJob ? { job: pageJob } : {}),
  });
}

/**
 * Bank the posting while the candidate is still reading it. The form is often on
 * another page, or another host entirely, and by then the text is gone.
 */
function seedJob(): void {
  const job = extractJob();
  if (!job) return;
  const request: RememberJobRequest = { type: 'remember-job', job };
  // No panel exists yet at this point, so there is nowhere to report anything.
  void send(request).catch(() => {});
}

seedJob();
// Postings on client-rendered pages are frequently not in the DOM yet at
// document_idle. One late retry is cheaper than watching for mutations.
setTimeout(seedJob, 2500);
