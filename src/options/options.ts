import { getProfile, getSettings, saveProfile, saveSettings } from '../lib/storage';
import type { GenerateRequest, GenerateResponse, Tone } from '../lib/types';

const apiKey = required<HTMLInputElement>('apiKey');
const model = required<HTMLInputElement>('model');
const tone = required<HTMLSelectElement>('tone');
const customInstruction = required<HTMLTextAreaElement>('customInstruction');
const useJobPosting = required<HTMLInputElement>('useJobPosting');
const resume = required<HTMLTextAreaElement>('resume');
const resumeMeta = required<HTMLParagraphElement>('resumeMeta');

const saveButton = required<HTMLButtonElement>('save');
const saveStatus = required<HTMLSpanElement>('saveStatus');

const testQuestion = required<HTMLTextAreaElement>('testQuestion');
const testJob = required<HTMLTextAreaElement>('testJob');
const generateButton = required<HTMLButtonElement>('generate');
const generateStatus = required<HTMLSpanElement>('generateStatus');
const result = required<HTMLOutputElement>('result');

void load();

saveButton.addEventListener('click', () => {
  void persist().then(() => setStatus(saveStatus, 'Saved.'));
});

generateButton.addEventListener('click', () => {
  void runTest();
});

async function load(): Promise<void> {
  const [settings, profile] = await Promise.all([getSettings(), getProfile()]);

  apiKey.value = settings.apiKey;
  model.value = settings.model;
  tone.value = settings.tone;
  customInstruction.value = settings.customInstruction;
  useJobPosting.checked = settings.useJobPosting;
  resume.value = profile.raw;

  if (profile.updatedAt) {
    resumeMeta.textContent = `Every answer is grounded in this text. Last updated ${new Date(
      profile.updatedAt,
    ).toLocaleString()}.`;
  }
}

/** Persist the whole form. The service worker reads settings from storage, not from this page. */
async function persist(): Promise<void> {
  await Promise.all([
    saveSettings({
      apiKey: apiKey.value.trim(),
      model: model.value.trim() || 'gpt-4o',
      tone: tone.value as Tone,
      customInstruction: customInstruction.value,
      useJobPosting: useJobPosting.checked,
    }),
    saveProfile(resume.value),
  ]);
}

async function runTest(): Promise<void> {
  const question = testQuestion.value.trim();
  if (!question) {
    setStatus(generateStatus, 'Enter a question first.', true);
    return;
  }

  // Save first so the test uses what is currently on screen rather than a stale save.
  await persist();

  generateButton.disabled = true;
  setStatus(generateStatus, 'Generating...');
  result.textContent = '';

  const request: GenerateRequest = {
    type: 'generate',
    context: {
      question,
      ...(testJob.value.trim() ? { job: { description: testJob.value.trim() } } : {}),
    },
  };

  try {
    const response = (await chrome.runtime.sendMessage(request)) as GenerateResponse;
    if (!response.ok) {
      setStatus(generateStatus, response.error, true);
      return;
    }
    result.textContent = response.answer;
    setStatus(
      generateStatus,
      response.usage
        ? `Done. ${response.usage.input} input + ${response.usage.output} output tokens.`
        : 'Done.',
    );
  } catch (error) {
    setStatus(generateStatus, error instanceof Error ? error.message : String(error), true);
  } finally {
    generateButton.disabled = false;
  }
}

function setStatus(target: HTMLElement, text: string, isError = false): void {
  target.textContent = text;
  target.classList.toggle('error', isError);
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}
