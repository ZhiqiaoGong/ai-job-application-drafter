import { describeGaps, describeJob, describeMatch, isThin } from '../lib/jobs';
import type { JobCapture, JobState, Variant } from '../lib/types';

export interface WidgetHandlers {
  generate: (variant: Variant, instruction?: string) => void;
  undo: () => void;
  clearDirection: () => void;
  /** Use this text as the posting for the site, replacing whatever was detected. */
  paste: (text: string) => void;
  /** Throw away the pasted posting and go back to what the page offered. */
  useDetected: () => void;
  /** Answer without a posting on this site, or go back to using one. */
  toggleJob: (on: boolean) => void;
  /** Get the panel out of the way. Everything it holds stays with the field. */
  dismiss: () => void;
}

/**
 * What the panel should come up showing. Returning to a field the candidate has
 * already worked on must not look like a fresh one.
 */
export interface WidgetState {
  direction?: string;
  hasAnswer?: boolean;
  job?: JobState;
}

/** Which controls the panel is showing. Only ever one row of them. */
type State = 'idle' | 'busy' | 'result' | 'refine';

const GAP = 6;

const STYLES = `
  :host { all: initial; }
  .panel, .pop {
    position: fixed;
    z-index: 2147483647;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.18);
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1a1a1a;
  }
  .panel {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 2px;
    padding: 4px;
    white-space: nowrap;
  }
  .panel.hidden, .pop.hidden { display: none; }
  button {
    flex: none;
    padding: 4px 9px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) { background: rgba(0, 0, 0, 0.07); }
  button:disabled { opacity: 0.5; cursor: default; }
  button.primary { background: #2563eb; color: #ffffff; }
  button.primary:hover:not(:disabled) { background: #1d4ed8; }
  input {
    flex: none;
    width: 240px;
    padding: 4px 8px;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
  }
  input:focus { outline: 2px solid #2563eb; outline-offset: -1px; }
  .chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 190px;
    padding: 3px 3px 3px 9px;
    border-radius: 999px;
    background: rgba(37, 99, 235, 0.12);
    color: #1d4ed8;
  }
  .chip .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip button { padding: 0 5px; font-size: 14px; line-height: 1; color: inherit; }
  .job {
    flex: none;
    max-width: 170px;
    padding: 3px 9px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.05);
    color: #475569;
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .job:hover { background: rgba(0, 0, 0, 0.1); }
  .job.weak { color: #8a94a6; }
  .status { flex: none; padding: 0 6px; opacity: 0.75; }
  .status.error { color: #d92d20; opacity: 1; max-width: 300px; white-space: normal; }
  .pop { width: 290px; padding: 10px; }
  .pop .kind { margin: 0 0 5px; font-size: 11px; color: #8a94a6; }
  .pop .title { margin: 0 0 2px; font-size: 13px; }
  .pop .note { margin: 0; font-size: 11px; color: #8a94a6; }
  .pop .note.guess, .pop .note.gap { color: #b54708; }
  .pop .note.gap { margin-top: 4px; }
  .pop a { display: block; margin: 0 0 6px; font-size: 11px; color: #2563eb; word-break: break-all; }
  .pop hr { border: 0; border-top: 1px solid rgba(0, 0, 0, 0.1); margin: 9px 0 7px; }
  .pop .act {
    display: block;
    width: 100%;
    padding: 5px 7px;
    text-align: left;
    font-weight: 400;
  }
  .pop textarea {
    box-sizing: border-box;
    width: 100%;
    height: 96px;
    padding: 7px;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 5px;
    background: transparent;
    color: inherit;
    /* Not the font shorthand: it cannot take inherit for the family, and silently
       falling back left the paste box in the browser default monospace. */
    font-family: inherit;
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
  }
  .pop textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; }
  .pop .row { display: flex; gap: 6px; margin-top: 8px; }
  @media (prefers-color-scheme: dark) {
    .panel, .pop { background: #26272b; border-color: rgba(255, 255, 255, 0.14); color: #e8e8ea; }
    button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.1); }
    .chip { background: rgba(59, 130, 246, 0.22); color: #bfdbfe; }
    .job { background: rgba(255, 255, 255, 0.08); color: #a9b0bb; }
    .job:hover { background: rgba(255, 255, 255, 0.14); }
    .job.weak { color: #7d848f; }
    input, .pop textarea { border-color: rgba(255, 255, 255, 0.22); }
    .pop .kind, .pop .note { color: #8b929d; }
    .pop .note.guess, .pop .note.gap { color: #f5a524; }
    .pop a { color: #7cb0f0; }
    .pop hr { border-top-color: rgba(255, 255, 255, 0.12); }
    .status.error { color: #f97066; }
  }
`;

let host: HTMLElement | null = null;
let panel: HTMLElement;
let popover: HTMLElement;
let statusEl: HTMLElement;
let draftButton: HTMLButtonElement;
let directionButton: HTMLButtonElement;
let resultButtons: HTMLButtonElement[];
let refineInput: HTMLInputElement;
let refineControls: HTMLElement[];
let directionChip: HTMLElement;
let directionChipText: HTMLElement;
let jobChip: HTMLButtonElement;
let pasteInput: HTMLTextAreaElement;
let direction: string | null = null;
let job: JobState = { kind: 'none' };

let anchor: HTMLElement | null = null;
let handlers: WidgetHandlers | null = null;
let state: State = 'idle';
let message = '';
let messageIsError = false;
let hasAnswer = false;
let popoverOpen = false;
let pasting = false;
let repositionQueued = false;

function ensureMounted(): void {
  if (host) return;

  host = document.createElement('div');
  host.dataset.aiDrafter = 'true';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;

  panel = document.createElement('div');
  panel.className = 'panel';

  popover = document.createElement('div');
  popover.className = 'pop hidden';

  statusEl = document.createElement('span');
  statusEl.className = 'status';

  draftButton = button('Draft answer', 'primary');
  draftButton.addEventListener('click', () => handlers?.generate('default'));

  // Steering the very first draft has to be reachable before one exists.
  directionButton = button('Add direction...');
  directionButton.addEventListener('click', openRefine);

  const redo = button('Redo');
  redo.addEventListener('click', () => handlers?.generate('default'));
  // Only the unambiguous revision gets a preset. "More specific" used to sit
  // here, but the specifics the candidate wants are ones the model cannot guess,
  // so it mostly returned differently worded filler. Refine says which ones.
  const shorter = button('Shorter');
  shorter.addEventListener('click', () => handlers?.generate('shorter'));
  const refine = button('Refine...');
  refine.addEventListener('click', openRefine);
  const undo = button('Undo');
  undo.addEventListener('click', () => handlers?.undo());
  resultButtons = [redo, shorter, refine, undo];

  refineInput = document.createElement('input');
  refineInput.type = 'text';
  refineInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      // Plain Enter deliberately does nothing. Sending costs a request and
      // overwrites the field, and a stray Enter part way through typing a
      // direction is easy on a page that is otherwise full of form fields.
      event.preventDefault();
      if (event.metaKey || event.ctrlKey) submitRefine();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeRefine();
    }
    // Keep the host page from acting on keys typed into our own input.
    event.stopPropagation();
  });

  // The standing direction has to stay visible: it keeps shaping every answer,
  // and hidden state the candidate cannot see or remove would be worse than
  // dropping it.
  directionChip = document.createElement('span');
  directionChip.className = 'chip';
  directionChipText = document.createElement('span');
  directionChipText.className = 'text';
  const clearDirection = button('×');
  clearDirection.title = 'Remove this direction';
  clearDirection.addEventListener('click', () => {
    handlers?.clearDirection();
  });
  directionChip.append(directionChipText, clearDirection);
  directionChip.addEventListener('click', (event) => {
    if (event.target === clearDirection) return;
    openRefine();
  });

  // Always rendered, even with nothing detected: this is the only way to reach
  // pasting, and a posting that was never found is exactly when that is needed.
  jobChip = button('', 'job');
  jobChip.addEventListener('click', togglePopover);

  // No placeholder: the row above it is already the label, and repeating it there
  // reads as two separate instructions.
  pasteInput = document.createElement('textarea');
  pasteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      pasting = false;
      renderPopover();
    }
    event.stopPropagation();
  });

  const send = button('Send', 'primary');
  send.addEventListener('click', submitRefine);
  const cancel = button('Cancel');
  cancel.addEventListener('click', closeRefine);
  refineControls = [send, cancel];

  shadow.append(style, panel, popover);
  document.body.append(host);

  // Keep focus in the answer field when our buttons are clicked, but let text
  // fields and the posting link behave normally.
  for (const layer of [panel, popover]) {
    layer.addEventListener('mousedown', (event) => {
      const target = event.target as HTMLElement;
      if (target !== refineInput && target !== pasteInput && target.tagName !== 'A') {
        event.preventDefault();
      }
    });
  }

  document.addEventListener('pointerdown', onPointerDownAnywhere, true);
  // Bubble phase, so Escape typed into the paste box cancels the paste rather
  // than throwing away the popover along with the text in it.
  document.addEventListener('keydown', onKeyDownAnywhere);

  addEventListener('scroll', queueReposition, true);
  addEventListener('resize', queueReposition);
}

/**
 * Anywhere but the popover dismisses it, including our own buttons: clicking
 * Draft answer is moving on. The pill is left out because its own click toggles,
 * and closing here first would just make it reopen.
 *
 * composedPath rather than target: an event from inside the shadow root is
 * retargeted to the host by the time a document listener sees it, so target
 * cannot tell the popover apart from anything else of ours.
 */
function onPointerDownAnywhere(event: Event): void {
  if (!popoverOpen) return;
  const path = event.composedPath();
  if (path.includes(popover) || path.includes(jobChip)) return;
  // Only the popover goes away, and hiding it needs no re-render: rebuilding the
  // row mid-mousedown would pull the button out from under the click.
  closePopover();
}

/**
 * Escape backs out one layer at a time. Refine is not handled here: its input
 * stops the event, so Escape there closes the input rather than the whole panel.
 */
function onKeyDownAnywhere(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !anchor) return;
  if (popoverOpen) {
    closePopover();
  } else {
    handlers?.dismiss();
  }
}

export function showFor(field: HTMLElement, next: WidgetHandlers, restore: WidgetState = {}): void {
  ensureMounted();
  anchor = field;
  handlers = next;
  hasAnswer = restore.hasAnswer ?? false;
  state = hasAnswer ? 'result' : 'idle';
  applyDirection(restore.direction ?? null);
  job = restore.job ?? { kind: 'none' };
  closePopover();
  clearMessage();
  render();
}

/** Report which posting is in play, or that there is none to be had. */
export function setJob(next: JobState): void {
  if (!host) return;
  job = next;
  // A fresh state means the mutation the popover was showing has landed.
  pasting = false;
  render();
}

/** Show, or clear, the standing direction for the current field. */
export function setDirection(text: string | null): void {
  if (!host) return;
  applyDirection(text);
  render();
}

function applyDirection(text: string | null): void {
  direction = text;
  if (text) {
    directionChipText.textContent = text;
    directionChip.title = text;
  }
}

export function hide(): void {
  anchor = null;
  handlers = null;
  if (host) {
    closePopover();
    panel.classList.add('hidden');
  }
}

export function isOwnNode(node: Node | null): boolean {
  return host !== null && node !== null && host.contains(node);
}

export function setBusy(busy: boolean, text = ''): void {
  if (!host) return;
  if (busy) {
    state = 'busy';
    message = text;
    messageIsError = false;
  } else if (state === 'busy') {
    state = hasAnswer ? 'result' : 'idle';
    clearMessage();
  }
  render();
}

export function setError(text: string): void {
  if (!host) return;
  state = hasAnswer ? 'result' : 'idle';
  message = text;
  messageIsError = true;
  render();
}

/** Switch to the post-insert row, where the useful actions are revisions. */
export function showResultActions(): void {
  if (!host) return;
  hasAnswer = true;
  state = 'result';
  clearMessage();
  render();
}

function togglePopover(): void {
  if (popoverOpen) {
    closePopover();
  } else {
    popoverOpen = true;
    pasting = false;
  }
  render();
}

function closePopover(): void {
  popoverOpen = false;
  pasting = false;
  popover.classList.add('hidden');
}

function openPaste(): void {
  pasting = true;
  renderPopover();
  pasteInput.value = job.kind === 'using' ? (job.job.description ?? '') : '';
  pasteInput.focus();
}

function submitPaste(): void {
  const text = pasteInput.value.trim();
  if (!text) {
    pasteInput.focus();
    return;
  }
  handlers?.paste(text);
}

function openRefine(): void {
  state = 'refine';
  closePopover();
  clearMessage();
  // Before a draft exists the input steers the first attempt rather than revising.
  refineInput.placeholder = hasAnswer ? 'What should change?' : 'What should this answer cover?';
  render();
  // Prefill so an existing direction can be edited rather than retyped, with the
  // caret at the end: adding a second requirement is far more common than
  // replacing the first, and one text field composes them better than a row of
  // chips with no defined precedence.
  refineInput.value = direction ?? '';
  refineInput.focus();
  refineInput.setSelectionRange(refineInput.value.length, refineInput.value.length);
}

function closeRefine(): void {
  state = hasAnswer ? 'result' : 'idle';
  render();
}

function submitRefine(): void {
  const instruction = refineInput.value.trim();
  if (!instruction) {
    refineInput.focus();
    return;
  }
  handlers?.generate('custom', instruction);
}

function clearMessage(): void {
  message = '';
  messageIsError = false;
}

function render(): void {
  const children: HTMLElement[] = [];

  // The pill stays through every row. It is the only handle on which posting is
  // being used, and noticing the wrong one usually happens after reading a draft.
  if (job.kind !== 'disabled' && state !== 'refine') {
    jobChip.textContent = pillLabel(state === 'result');
    // Grey covers every state where the answer is not really getting a posting:
    // none found, turned off, and a capture that is a name with nothing behind it.
    jobChip.classList.toggle('weak', job.kind !== 'using' || isThin(job.job));
    children.push(jobChip);
  }
  if (direction && state !== 'refine') children.push(directionChip);

  switch (state) {
    case 'idle':
    case 'busy':
      draftButton.disabled = state === 'busy';
      directionButton.disabled = state === 'busy';
      children.push(draftButton);
      // Once a direction exists the chip is the way to edit it.
      if (!direction) children.push(directionButton);
      break;
    case 'result':
      children.push(...resultButtons);
      break;
    case 'refine':
      children.push(refineInput, ...refineControls);
      break;
  }

  if (message) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', messageIsError);
    children.push(statusEl);
  }

  panel.replaceChildren(...children);
  panel.classList.remove('hidden');
  renderPopover();
  queueReposition();
}

/** Collapsed to the company once the draft row needs the width. */
function pillLabel(collapsed: boolean): string {
  switch (job.kind) {
    case 'using':
      return collapsed ? (job.job.company || describeJob(job.job)) : describeJob(job.job);
    case 'off':
      return 'Posting off';
    default:
      return 'No posting';
  }
}

function renderPopover(): void {
  if (!popoverOpen || job.kind === 'disabled') {
    popover.classList.add('hidden');
    return;
  }

  popover.replaceChildren(...(pasting ? pasteRows() : jobRows()));
  popover.classList.remove('hidden');
  queueReposition();
}

function pasteRows(): HTMLElement[] {
  const use = button('Use this', 'primary');
  use.addEventListener('click', submitPaste);
  const cancel = button('Cancel');
  cancel.addEventListener('click', () => {
    pasting = false;
    renderPopover();
  });

  const row = document.createElement('div');
  row.className = 'row';
  row.append(use, cancel);

  return [
    line('kind', 'Paste the job description'),
    pasteInput,
    row,
    line('note', 'Kept for this site until you close the browser.'),
  ];
}

function jobRows(): HTMLElement[] {
  const rows: HTMLElement[] = [];

  if (job.kind === 'using') {
    const { job: capture, match, detected } = job;
    rows.push(line('kind', 'Answering with'), line('title', headline(capture)));
    if (capture.source !== 'manual') rows.push(link(capture.url));
    rows.push(line(match === 'recent' ? 'note guess' : 'note', describeMatch(capture, match, Date.now())));
    // Where it came from and how much of it there is are separate questions, so
    // they get separate lines. Answering only the first one let a scraped page
    // title read as the most trustworthy state there is.
    const gap = describeGaps(capture);
    if (gap) rows.push(line('note gap', gap));
    rows.push(document.createElement('hr'));
    rows.push(
      action(capture.source === 'manual' ? 'Edit the pasted text' : 'Paste a different posting', openPaste),
    );
    // Named rather than called "the detected one": switching back is only a real
    // choice if you can see what you would be switching to.
    if (detected) {
      rows.push(action(`Use ${describeJob(detected)} instead`, () => handlers?.useDetected()));
    }
    rows.push(action('Answer without a posting', () => handlers?.toggleJob(false)));
    return rows;
  }

  if (job.kind === 'off') {
    rows.push(line('kind', 'Not using a posting'));
    if (job.available) {
      rows.push(line('note', `${describeJob(job.available)} was found for this site.`));
      rows.push(document.createElement('hr'));
      rows.push(action('Use it', () => handlers?.toggleJob(true)));
    } else {
      rows.push(document.createElement('hr'));
    }
    rows.push(action('Paste a posting', openPaste));
    return rows;
  }

  rows.push(
    line('kind', 'No posting'),
    line('note', 'This answer will use your resume only.'),
    document.createElement('hr'),
    action('Paste a posting', openPaste),
  );
  return rows;
}

/** Pasted text has no title, so say how much of it there is instead. */
function headline(capture: JobCapture): string {
  if (capture.source !== 'manual') return describeJob(capture);
  const size = (capture.description ?? '').length.toLocaleString();
  return `Pasted posting - ${size} characters`;
}

function line(className: string, text: string): HTMLElement {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

function link(url: string): HTMLElement {
  const element = document.createElement('a');
  element.href = url;
  element.target = '_blank';
  element.rel = 'noreferrer noopener';
  element.textContent = url;
  return element;
}

function action(label: string, onClick: () => void): HTMLButtonElement {
  const element = button(label, 'act');
  element.addEventListener('click', onClick);
  return element;
}

function queueReposition(): void {
  if (repositionQueued) return;
  repositionQueued = true;
  requestAnimationFrame(() => {
    repositionQueued = false;
    reposition();
  });
}

/**
 * Sit just below the field, right-aligned with it, flipping above when there is
 * no room. The panel must never overlap the field: it would cover the answer.
 */
function reposition(): void {
  if (!host || !anchor) return;

  const field = anchor.getBoundingClientRect();
  const offscreen =
    field.width === 0 || field.height === 0 || field.bottom < 0 || field.top > innerHeight;

  panel.classList.toggle('hidden', offscreen);
  if (offscreen) {
    popover.classList.add('hidden');
    return;
  }

  const self = panel.getBoundingClientRect();

  let top = field.bottom + GAP;
  if (top + self.height > innerHeight - GAP) {
    const above = field.top - self.height - GAP;
    if (above >= GAP) top = above;
  }
  top = clamp(top, GAP, Math.max(GAP, innerHeight - self.height - GAP));

  const left = clamp(field.right - self.width, GAP, Math.max(GAP, innerWidth - self.width - GAP));

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;

  if (popoverOpen) positionPopover(top, self.height);
}

/** Hangs off the pill, below the panel unless that would run off the bottom. */
function positionPopover(panelTop: number, panelHeight: number): void {
  const pill = jobChip.getBoundingClientRect();
  const self = popover.getBoundingClientRect();

  let top = panelTop + panelHeight + GAP;
  if (top + self.height > innerHeight - GAP) {
    const above = panelTop - self.height - GAP;
    top = above >= GAP ? above : clamp(top, GAP, Math.max(GAP, innerHeight - self.height - GAP));
  }

  const left = clamp(pill.left, GAP, Math.max(GAP, innerWidth - self.width - GAP));

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function button<T extends string>(label: string, className: T | '' = ''): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  return element;
}
