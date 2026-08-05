import type { JobCapture, JobMatch, JobState } from './types';

/** Enough to cover a browse-then-apply session without hoarding history. */
export const MAX_REMEMBERED = 5;

/**
 * How far back we are willing to reach for a posting captured on a different
 * host. Applying through an ATS on another domain is normal, but a posting from
 * hours ago is more likely to be a different job than the one on screen.
 *
 * Getting this wrong is recoverable: the panel names the posting it picked, and
 * pasting the right one is two clicks away. So it does not need to be a setting.
 */
export const RECENT_MS = 30 * 60 * 1000;

/**
 * Roughly 1500 tokens. A long posting is mostly boilerplate after this point,
 * and the whole thing rides along on every single request.
 */
export const MAX_DESCRIPTION_CHARS = 6000;

/**
 * Newest first, one entry per URL per kind. Pasted text and what was scraped off
 * the same URL have to coexist: deduplicating on URL alone deleted the detected
 * posting the moment anything was pasted, which made pasting a one-way door with
 * nothing left to go back to.
 */
export function rememberInto(jobs: JobCapture[], job: JobCapture): JobCapture[] {
  const manual = isManual(job);
  const kept = jobs.filter((e) => !(e.url === job.url && isManual(e) === manual));
  const next = [job, ...kept];
  // Capped per kind, so browsing a few more postings cannot evict text the
  // candidate typed in. That is the most expensive thing in here to replace.
  return [
    ...next.filter(isManual).slice(0, MAX_REMEMBERED),
    ...next.filter((e) => !isManual(e)).slice(0, MAX_REMEMBERED),
  ];
}

/**
 * Pick the posting that belongs to `url`, most trustworthy match first. Only the
 * last tier is a real guess, and the caller shows the tier to the candidate:
 * quietly answering with the wrong posting is the failure worth avoiding.
 */
export function pickJob(
  jobs: JobCapture[],
  url: string,
  now: number,
): { job: JobCapture; match: JobMatch } | null {
  // Explicit beats inferred, and it covers the whole site it was pasted on so
  // the other questions on the same form do not have to be pasted into again.
  const origin = originOf(url);
  if (origin) {
    const manual = jobs.find((job) => isManual(job) && originOf(job.url) === origin);
    if (manual) return { job: manual, match: 'manual' };
  }

  return pickDetected(jobs, url, now);
}

/**
 * The same tiers over what was found on pages, ignoring anything pasted. Kept
 * separate so the popover can name what a paste is standing in front of, and so
 * removing the paste has something to fall back to.
 *
 * Pasted text is deliberately excluded from the cross-host reach: it is scoped to
 * the site it was typed on and must never travel to another one.
 */
export function pickDetected(
  jobs: JobCapture[],
  url: string,
  now: number,
): { job: JobCapture; match: JobMatch } | null {
  const detected = jobs.filter((job) => !isManual(job));
  const origin = originOf(url);

  const exact = detected.find((job) => job.url === url);
  if (exact) return { job: exact, match: 'page' };

  if (origin) {
    const sameOrigin = detected.find((job) => originOf(job.url) === origin);
    if (sameOrigin) return { job: sameOrigin, match: 'origin' };
  }

  const [latest] = detected;
  if (latest && now - latest.capturedAt <= RECENT_MS) return { job: latest, match: 'recent' };

  return null;
}

/** Discard the pasted override for this site, back to whatever was detected. */
export function dropManual(jobs: JobCapture[], url: string): JobCapture[] {
  const origin = originOf(url);
  if (!origin) return jobs;
  return jobs.filter((job) => !(isManual(job) && originOf(job.url) === origin));
}

function isManual(job: JobCapture): boolean {
  return job.source === 'manual';
}

/**
 * What the panel should show for this page, including the candidate having turned
 * the posting off for the site. Kept whole and pure so every state is testable
 * without storage or a browser.
 */
export function resolveJob(
  jobs: JobCapture[],
  silenced: string[],
  url: string,
  now: number,
): JobState {
  const picked = pickJob(jobs, url, now);
  if (isSilenced(silenced, url)) {
    return { kind: 'off', available: picked?.job ?? null };
  }
  if (!picked) return { kind: 'none' };

  // What the paste is covering up, so the popover can offer it back. Without it
  // pasting was a one-way door: it won every tier and nothing undid it short of
  // closing the browser.
  const detected = picked.match === 'manual' ? pickDetected(jobs, url, now)?.job : undefined;
  return { kind: 'using', ...picked, ...(detected ? { detected } : {}) };
}

/**
 * Turning the posting off is per site, not per question: deciding it is the wrong
 * job is a decision about the application, and a form has several questions.
 */
export function silence(silenced: string[], url: string): string[] {
  const origin = originOf(url);
  if (!origin || silenced.includes(origin)) return silenced;
  return [...silenced, origin];
}

export function unsilence(silenced: string[], url: string): string[] {
  const origin = originOf(url);
  return origin ? silenced.filter((entry) => entry !== origin) : silenced;
}

export function isSilenced(silenced: string[], url: string): boolean {
  const origin = originOf(url);
  return origin !== null && silenced.includes(origin);
}

/** A posting the candidate typed in, pinned to the site they typed it on. */
export function manualCapture(url: string, text: string, now: number): JobCapture | null {
  const description = clipDescription(text);
  if (!description) return null;
  return { url, source: 'manual', capturedAt: now, description };
}

export function describeJob(job: JobCapture): string {
  // Pasted text has no title to read, and labelling it by its host would make it
  // look like something we found rather than something the candidate supplied.
  if (job.source === 'manual') return 'Pasted posting';

  const parts = [job.company, job.title].filter(Boolean);
  return parts.length > 0 ? parts.join(' - ') : (originOf(job.url) ?? job.url);
}

/** The one line in the popover that has to explain the whole memory. */
export function describeMatch(job: JobCapture, match: JobMatch, now: number): string {
  switch (match) {
    case 'manual':
      return 'You pasted this. Used for every question on this page.';
    case 'page':
      return 'Found on this page.';
    case 'origin':
      return `Found on ${originLabel(job.url)}.`;
    case 'recent':
      return `From ${originLabel(job.url)}, ${describeAge(now - job.capturedAt)}.`;
  }
}

/**
 * Whether the capture carries anything worth sending. A page title scraped by the
 * meta fallback passes extractJob's guard on its own, and `Title: Internal form
 * 4471` is worse than nothing: the model tries to speak to it.
 */
export function isThin(job: JobCapture): boolean {
  return !job.description?.trim();
}

/**
 * The other half of the confidence report. Provenance says where the posting came
 * from, which is a different question from whether there is anything in it, and
 * the two point opposite ways: a title scraped off the page in front of you has
 * the best provenance there is and almost no content.
 */
export function describeGaps(job: JobCapture): string | null {
  if (!isThin(job)) return null;
  return 'No description was found, so this posting adds almost nothing.';
}

function describeAge(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
}

export function clipDescription(text: string): string {
  const collapsed = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return collapsed.length > MAX_DESCRIPTION_CHARS
    ? `${collapsed.slice(0, MAX_DESCRIPTION_CHARS).trimEnd()}...`
    : collapsed;
}

function originLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
