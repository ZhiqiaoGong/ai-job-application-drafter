import {
  dropManual,
  manualCapture,
  rememberInto,
  resolveJob,
  silence,
  unsilence,
} from '../lib/jobs';
import type { JobCapture, JobState } from '../lib/types';

const JOBS = 'jobs';
const SILENCED = 'silencedOrigins';

/**
 * Session storage on purpose: a posting is only relevant to the application the
 * candidate is filling right now, and it should not outlive the browser. That
 * goes double for text they pasted in themselves.
 */
export async function rememberJob(job: JobCapture): Promise<void> {
  const jobs = await readJobs();
  await chrome.storage.session.set({ [JOBS]: rememberInto(jobs, job) });
}

export async function jobForPage(url: string): Promise<JobState> {
  const [jobs, silenced] = await Promise.all([readJobs(), readSilenced()]);
  return resolveJob(jobs, silenced, url, Date.now());
}

/** Save a pasted posting for the site, replacing whatever was detected there. */
export async function pasteJob(url: string, text: string): Promise<JobState> {
  const job = manualCapture(url, text, Date.now());
  if (job) {
    await rememberJob(job);
    // Pasting is also a statement that the posting should be used, so a site
    // turned off earlier does not swallow the text that was just typed in.
    await setSilenced(unsilence(await readSilenced(), url));
  }
  return jobForPage(url);
}

/** Throw away the pasted override for this site and go back to what was found. */
export async function useDetectedJob(url: string): Promise<JobState> {
  await chrome.storage.session.set({ [JOBS]: dropManual(await readJobs(), url) });
  return jobForPage(url);
}

export async function silenceJob(url: string): Promise<JobState> {
  await setSilenced(silence(await readSilenced(), url));
  return jobForPage(url);
}

export async function unsilenceJob(url: string): Promise<JobState> {
  await setSilenced(unsilence(await readSilenced(), url));
  return jobForPage(url);
}

async function readJobs(): Promise<JobCapture[]> {
  const stored = await chrome.storage.session.get(JOBS);
  const jobs = stored[JOBS];
  return Array.isArray(jobs) ? (jobs as JobCapture[]) : [];
}

async function readSilenced(): Promise<string[]> {
  const stored = await chrome.storage.session.get(SILENCED);
  const origins = stored[SILENCED];
  return Array.isArray(origins) ? (origins as string[]) : [];
}

async function setSilenced(origins: string[]): Promise<void> {
  await chrome.storage.session.set({ [SILENCED]: origins });
}
