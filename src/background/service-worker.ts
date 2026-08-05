import { generate } from '../lib/llm';
import { buildSystemPrompt, buildUserPrompt } from '../lib/prompt';
import { getProfile, getSettings } from '../lib/storage';
import type {
  GenerateRequest,
  GenerateResponse,
  JobForPageRequest,
  JobState,
  RuntimeRequest,
  SetJobRequest,
} from '../lib/types';
import {
  jobForPage,
  pasteJob,
  rememberJob,
  silenceJob,
  unsilenceJob,
  useDetectedJob,
} from './jobs';

// All API traffic goes through here on purpose: the key is never exposed to the
// page context of whatever job site the candidate happens to be visiting.
chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  const handler = route(message);
  if (!handler) return false;

  handler
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: errorMessage(error) } satisfies GenerateResponse);
    });

  // Returning true keeps the message channel open for the async reply.
  return true;
});

function route(message: RuntimeRequest): Promise<unknown> | null {
  switch (message?.type) {
    case 'generate':
      return handleGenerate(message);
    case 'remember-job':
      return rememberJob(message.job);
    case 'job-for-page':
      return handleJobForPage(message);
    case 'set-job':
      return handleSetJob(message);
    default:
      return null;
  }
}

async function handleJobForPage(request: JobForPageRequest): Promise<JobState> {
  if (request.found) await rememberJob(request.found);

  // The settings switch takes the feature away entirely rather than reporting an
  // empty result, so the panel does not offer to paste into something that would
  // then be ignored.
  if (!(await getSettings()).useJobPosting) return { kind: 'disabled' };

  // Everything, including a posting found on this very page, goes through the
  // same resolution: it is the only place that knows a pasted posting wins.
  return jobForPage(request.url);
}

async function handleSetJob(request: SetJobRequest): Promise<JobState> {
  if (!(await getSettings()).useJobPosting) return { kind: 'disabled' };

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

// The toolbar button has no popup, so use it as a shortcut to the settings page.
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

async function handleGenerate(request: GenerateRequest): Promise<GenerateResponse> {
  const question = request.context.question?.trim();
  if (!question) {
    return { ok: false, error: 'No question text was found for this field.' };
  }

  const [settings, profile] = await Promise.all([getSettings(), getProfile()]);

  const result = await generate({
    settings,
    system: buildSystemPrompt(settings),
    user: buildUserPrompt({
      context: { ...request.context, question },
      profile,
      variant: request.variant ?? 'default',
      ...(request.previous ? { previous: request.previous } : {}),
      ...(request.instruction ? { instruction: request.instruction } : {}),
    }),
  });

  return { ok: true, answer: result.text, usage: result.usage };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
