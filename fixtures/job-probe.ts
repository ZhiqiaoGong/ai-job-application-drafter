// Exposes the job-posting capture and matching logic to the fixture page.
// Dev only, never shipped.
import { extractJob } from '../src/content/job';
import {
  describeGaps,
  describeJob,
  describeMatch,
  dropManual,
  isThin,
  manualCapture,
  pickDetected,
  pickJob,
  rememberInto,
  resolveJob,
  silence,
} from '../src/lib/jobs';

(window as unknown as Record<string, unknown>).__job = {
  /** Parse a page's markup in isolation, as if it had been loaded from `url`. */
  extract(html: string, url: string) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return extractJob(doc, url);
  },
  pickJob,
  pickDetected,
  dropManual,
  rememberInto,
  resolveJob,
  silence,
  manualCapture,
  describeJob,
  describeMatch,
  describeGaps,
  isThin,
};
