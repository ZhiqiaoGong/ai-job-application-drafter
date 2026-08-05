import { clipDescription } from '../lib/jobs';
import type { JobCapture } from '../lib/types';

/** Hosts where a page is a job posting often enough to trust weaker signals. */
const ATS_HOSTS =
  /(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|jobvite\.com|icims\.com|taleo\.net|workable\.com|breezy\.hr|teamtailor\.com|bamboohr\.com|rippling\.com)$/i;

const JOB_PATH = /\/(jobs?|careers?|opening|position|vacancy|apply|application)(\/|$)/i;

/**
 * Read the posting off a page. Structured data first, because it is
 * unambiguous; meta tags only where the page is plausibly a posting at all,
 * since every site on the web has an og:description.
 *
 * The document and URL are parameters rather than globals so this can be run
 * against fixture pages.
 */
export function extractJob(doc: Document = document, url: string = location.href): JobCapture | null {
  const job = fromJsonLd(doc) ?? fromMeta(doc, url);
  if (!job) return null;

  // A capture with no usable content is worse than none: it would win over a
  // real posting remembered from the page the candidate came from.
  if (!job.title && !job.company && !job.description) return null;

  return { ...job, url, capturedAt: Date.now() };
}

type PartialCapture = Omit<JobCapture, 'url' | 'capturedAt'>;

function fromJsonLd(doc: Document): PartialCapture | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? '');
    } catch {
      // Hand-assembled JSON-LD is broken often enough that this is expected.
      continue;
    }

    const posting = findPosting(parsed);
    if (!posting) continue;

    return {
      source: 'json-ld',
      ...pick('title', asText(posting.title)),
      ...pick('company', organisationName(posting.hiringOrganization)),
      ...pick('description', htmlToText(asText(posting.description))),
    };
  }
  return null;
}

function fromMeta(doc: Document, url: string): PartialCapture | null {
  if (!looksLikeJobPage(url)) return null;

  return {
    source: 'meta',
    ...pick('title', meta(doc, 'og:title') || doc.title),
    ...pick('company', meta(doc, 'og:site_name')),
    ...pick('description', clipDescription(meta(doc, 'og:description') || meta(doc, 'description'))),
  };
}

function looksLikeJobPage(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return ATS_HOSTS.test(hostname) || JOB_PATH.test(pathname);
  } catch {
    return false;
  }
}

/** JSON-LD is routinely wrapped in arrays or an @graph, so walk the whole tree. */
function findPosting(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4 || node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  const types = [record['@type']].flat();
  if (types.some((type) => typeof type === 'string' && type.toLowerCase() === 'jobposting')) {
    return record;
  }

  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const found = findPosting(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function organisationName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === 'string') return name;
  }
  return '';
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * JobPosting descriptions are HTML more often than not. Parsed into a detached
 * document, which neither runs scripts nor fetches anything.
 */
function htmlToText(html: string): string {
  if (!html) return '';
  const text = html.includes('<')
    ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '')
    : html;
  return clipDescription(text);
}

function meta(doc: Document, name: string): string {
  const node =
    doc.querySelector(`meta[property="${name}"]`) ?? doc.querySelector(`meta[name="${name}"]`);
  return node?.getAttribute('content')?.trim() ?? '';
}

/** Keep empty strings out of the capture so absent fields stay absent. */
function pick<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  const trimmed = value.trim();
  return trimmed ? ({ [key]: trimmed } as Record<K, string>) : {};
}
