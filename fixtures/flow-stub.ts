// Stands in for the background service worker. Lives in its own module so the
// stub is installed before the content script's module body runs: imports are
// hoisted, so doing this inline in flow-probe would be too late.
//
// Only chrome.storage is faked. Message handling calls the real background
// functions, so the matching, precedence, and opt-out rules under test are the
// shipped ones rather than a second implementation that could drift from them.
import {
  jobForPage,
  pasteJob,
  rememberJob,
  silenceJob,
  unsilenceJob,
  useDetectedJob,
} from '../src/background/jobs';
import type { JobCapture, JobState, RuntimeRequest, SetJobRequest } from '../src/lib/types';

export const sent: RuntimeRequest[] = [];

const session: Record<string, unknown> = {};
let reply = 'ANSWER-1';
let disabled = false;
let orphaned = false;

export function setReply(next: string): void {
  reply = next;
}

/** Seed the store as if this posting had been captured on some page. */
export function setJob(next: JobCapture | null): void {
  session.jobs = next ? [next] : [];
  session.silencedOrigins = [];
  disabled = false;
}

/** Stand in for the settings switch that takes the feature away entirely. */
export function setDisabled(next: boolean): void {
  disabled = next;
}

/**
 * Stand in for the extension having been reloaded, which orphans the content
 * scripts in every open tab. Note the synchronous throw: that is the whole point,
 * since a `.catch` on the returned promise never sees it.
 */
export function setOrphaned(next: boolean): void {
  orphaned = next;
}

export function storedJobs(): JobCapture[] {
  return (session.jobs as JobCapture[] | undefined) ?? [];
}

async function handleJobForPage(url: string, found?: JobCapture): Promise<JobState> {
  if (found) await rememberJob(found);
  if (disabled) return { kind: 'disabled' };
  return jobForPage(url);
}

async function handleSetJob(request: SetJobRequest): Promise<JobState> {
  if (disabled) return { kind: 'disabled' };

  switch (request.action) {
    case 'paste':
      return pasteJob(request.url, request.text ?? '');
    case 'use-detected':
      return useDetectedJob(request.url);
    case 'off':
      return silenceJob(request.url);
    case 'on':
      return unsilenceJob(request.url);
  }
}

(globalThis as unknown as Record<string, unknown>).chrome = {
  storage: {
    session: {
      get(key: string) {
        return Promise.resolve(key in session ? { [key]: session[key] } : {});
      },
      set(items: Record<string, unknown>) {
        Object.assign(session, items);
        return Promise.resolve();
      },
    },
  },
  runtime: {
    sendMessage(request: RuntimeRequest) {
      if (orphaned) throw new Error('Extension context invalidated.');
      sent.push(request);
      switch (request.type) {
        case 'job-for-page':
          return handleJobForPage(request.url, request.found);
        case 'remember-job':
          return rememberJob(request.job);
        case 'set-job':
          return handleSetJob(request);
        default:
          return Promise.resolve({ ok: true, answer: reply });
      }
    },
  },
};
