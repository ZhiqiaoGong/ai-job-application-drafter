// Drives the real content script end to end against a stubbed background, so
// the wiring between focus, generation, direction, the posting, and Undo is
// regression tested rather than reasoned about. Dev only, never shipped.
import { sent, setDisabled, setJob, setOrphaned, setReply, storedJobs } from './flow-stub';
import '../src/content/index';
import { readFieldValue } from '../src/content/detect';
import type { JobCapture, RememberJobRequest } from '../src/lib/types';

function shadow(): ShadowRoot | null {
  const host = document.querySelector('[data-ai-drafter]') as HTMLElement | null;
  return host?.shadowRoot ?? null;
}

function textOf(root: ParentNode | null, selector: string): string | null {
  return root?.querySelector(selector)?.textContent ?? null;
}

(window as unknown as Record<string, unknown>).__flow = {
  sent,
  setReply,
  setJob,
  setDisabled,
  setOrphaned,
  storedJobs,
  readFieldValue,
  /** Bank a posting the way a page load would, without reloading the fixture. */
  remember: (job: JobCapture) =>
    chrome.runtime.sendMessage({ type: 'remember-job', job } satisfies RememberJobRequest),
  lastRequest: () => sent[sent.length - 1],
  lastGenerate: () => [...sent].reverse().find((request) => request.type === 'generate'),
  /** The grey posting pill, which is separate from the blue direction chip. */
  jobLabel: () => textOf(shadow(), '.job'),
  /** Whether the pill is greyed, meaning no posting is really in play. */
  jobIsWeak: () => shadow()?.querySelector('.job')?.classList.contains('weak') ?? null,
  /** What the panel is currently showing, read out of the shadow root. */
  panel() {
    const root = shadow();
    if (!root) return { mounted: false, hidden: true, buttons: [] as string[], chip: null };
    const panel = root.querySelector('.panel') as HTMLElement;
    const chip = root.querySelector('.chip .text');
    return {
      mounted: true,
      hidden: panel.classList.contains('hidden'),
      // The pill is a button too now, but these assertions are about the action row.
      buttons: [...panel.querySelectorAll('button:not(.job)')].map((b) => b.textContent ?? ''),
      chip: chip ? chip.textContent : null,
      error: textOf(panel, '.status.error'),
    };
  },
  /** What the pill's popover is showing, including the paste box. */
  popover() {
    const pop = shadow()?.querySelector('.pop') as HTMLElement | null;
    if (!pop || pop.classList.contains('hidden')) return { open: false };
    return {
      open: true,
      kind: textOf(pop, '.kind'),
      title: textOf(pop, '.title'),
      note: textOf(pop, '.note'),
      /** Whether the note is styled as a guess rather than a certainty. */
      guess: pop.querySelector('.note.guess') !== null,
      /** The separate line about how little the capture actually contains. */
      gap: textOf(pop, '.note.gap'),
      url: pop.querySelector('a')?.getAttribute('href') ?? null,
      actions: [...pop.querySelectorAll('button.act')].map((b) => b.textContent ?? ''),
      pasting: pop.querySelector('textarea') !== null,
    };
  },
  click(label: string) {
    const match = [...shadow()!.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').startsWith(label),
    );
    if (!match) throw new Error(`no button starting with ${label}`);
    match.click();
  },
  /** Click the posting pill, which is the only way into the popover. */
  clickPill() {
    const pill = shadow()?.querySelector('.job') as HTMLButtonElement | null;
    if (!pill) throw new Error('no posting pill');
    pill.click();
  },
  /**
   * Composed on purpose: the dismissal logic reads composedPath, because a
   * document listener only ever sees our host as the target.
   */
  pointerDownIn(selector: string) {
    const node = shadow()?.querySelector(selector) as HTMLElement | null;
    if (!node) throw new Error(`no ${selector} in the panel`);
    node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  },
  pointerDownOutside() {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
  },
  /** A null selector types into the page rather than into the panel. */
  keyDownIn(selector: string | null, key: string, modifiers: { meta?: boolean } = {}) {
    const node = selector
      ? (shadow()?.querySelector(selector) as HTMLElement | null)
      : document.body;
    if (!node) throw new Error(`no ${selector} in the panel`);
    node.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        composed: true,
        metaKey: modifiers.meta ?? false,
      }),
    );
  },
  typeDirection(text: string) {
    const input = shadow()!.querySelector('input') as HTMLInputElement;
    input.value = text;
  },
  typePaste(text: string) {
    const area = shadow()!.querySelector('.pop textarea') as HTMLTextAreaElement;
    area.value = text;
  },
  /** Where the caret lands when an existing direction is reopened for editing. */
  refineCaret() {
    const input = shadow()!.querySelector('input') as HTMLInputElement;
    return { value: input.value, start: input.selectionStart, end: input.selectionEnd };
  },
};
