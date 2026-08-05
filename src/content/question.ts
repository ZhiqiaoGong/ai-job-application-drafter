import type { AnswerField } from './detect';

const MIN_LENGTH = 12;
const MAX_LENGTH = 400;
const MAX_ANCESTOR_DEPTH = 5;
/** Skip container scraping when the subtree is huge; it means we walked too far up. */
const MAX_CONTAINER_TEXT = 4000;
/** Containers whose text spans the whole page or form rather than one question. */
const COARSE_CONTAINERS = new Set(['BODY', 'HTML', 'MAIN', 'FORM', 'ARTICLE']);
/** Controls that hold an answer, and therefore mark the edge of a question block. */
const CONTROL_SELECTOR =
  'textarea, select, [contenteditable="true"], input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])';

/**
 * Find the question a field belongs to, trying the most reliable signals first.
 * Returns an empty string when nothing plausible is found, which is the signal
 * to leave the field alone entirely.
 */
export function extractQuestion(field: AnswerField): string {
  const strategies = [
    fromLabelFor,
    fromAriaLabelledBy,
    fromAriaLabel,
    fromWrappingLabel,
    fromNearbyText,
  ];

  for (const strategy of strategies) {
    const text = clean(strategy(field));
    if (isPlausibleQuestion(text)) return text;
  }

  // Placeholders are the weakest signal and the easiest way to get a false
  // positive on an ordinary comment box, so they must also read like a prompt.
  const placeholder = clean(fromPlaceholder(field));
  if (isPlausibleQuestion(placeholder) && looksLikePrompt(placeholder)) return placeholder;

  return '';
}

export interface FieldLimits {
  maxChars?: number;
  wordLimit?: number;
}

/** Length caps, so the answer is not silently truncated by the form. */
export function extractLimits(field: AnswerField): FieldLimits {
  const limits: FieldLimits = {};

  if (field instanceof HTMLTextAreaElement && field.maxLength > 0) {
    limits.maxChars = field.maxLength;
  }

  const nearby = nearbyTextForLimits(field);
  const words = /(\d{2,4})\s*(?:words|word)\b/i.exec(nearby);
  if (words?.[1]) limits.wordLimit = Number(words[1]);

  if (!limits.maxChars) {
    const chars = /(\d{2,5})\s*(?:characters|chars)\b/i.exec(nearby);
    if (chars?.[1]) limits.maxChars = Number(chars[1]);
  }

  return limits;
}

// --- strategies, most reliable first -------------------------------------

function fromLabelFor(field: AnswerField): string {
  if (!field.id) return '';
  const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
  return label ? visibleText(label) : '';
}

function fromAriaLabelledBy(field: AnswerField): string {
  const ids = field.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null)
    .map(visibleText)
    .join(' ');
}

function fromAriaLabel(field: AnswerField): string {
  return field.getAttribute('aria-label') ?? '';
}

function fromWrappingLabel(field: AnswerField): string {
  const label = field.closest('label');
  return label ? textWithoutControls(label) : '';
}

/**
 * Fallback for forms that never wire up labels: walk up a few ancestors and
 * look for question text in preceding siblings, then in the container itself.
 */
function fromNearbyText(field: AnswerField): string {
  let node: HTMLElement | null = field;

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && node; depth += 1) {
    let sibling = node.previousElementSibling;
    while (sibling) {
      // A sibling holding its own control belongs to a different question.
      // Reading past it would attribute the previous question to this field.
      if (containsControl(sibling)) break;

      const text = clean(visibleText(sibling));
      if (isPlausibleQuestion(text)) return text;
      sibling = sibling.previousElementSibling;
    }

    node = node.parentElement;
    if (!node) break;

    // Scraping a page-level container, or one wrapping several questions, would
    // return unrelated text. Keep walking so siblings are still checked, but
    // never treat these elements' own text as the question.
    if (COARSE_CONTAINERS.has(node.tagName)) continue;
    if (node.querySelectorAll(CONTROL_SELECTOR).length > 1) continue;

    const text = clean(textWithoutControls(node));
    if (isPlausibleQuestion(text)) return text;
  }

  return '';
}

function containsControl(element: Element): boolean {
  return element.matches(CONTROL_SELECTOR) || element.querySelector(CONTROL_SELECTOR) !== null;
}

function fromPlaceholder(field: AnswerField): string {
  return field.getAttribute('placeholder') ?? '';
}

// --- helpers --------------------------------------------------------------

function nearbyTextForLimits(field: AnswerField): string {
  const container = field.closest('div, section, fieldset, li') ?? field.parentElement;
  return container ? textWithoutControls(container) : '';
}

/**
 * Text of a container with form controls stripped out, so we never mistake the
 * candidate's own answer or a button label for the question.
 */
function textWithoutControls(container: Element): string {
  if ((container.textContent?.length ?? 0) > MAX_CONTAINER_TEXT) return '';

  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll('textarea, input, select, button, option, [contenteditable="true"], script, style')
    .forEach((node) => node.remove());
  return clone.textContent ?? '';
}

function visibleText(element: Element): string {
  return (element as HTMLElement).innerText || element.textContent || '';
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*\*\s*$/, '')
    .replace(/\s*\((?:required|optional)\)\s*$/i, '')
    .trim();
}

function isPlausibleQuestion(text: string): boolean {
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return false;
  if (!/[a-z]/i.test(text)) return false;
  // A real question or prompt is a sentence, not a one-word control label.
  return text.split(/\s+/).length >= 3;
}

function looksLikePrompt(text: string): boolean {
  return (
    text.includes('?') ||
    /^(why|what|how|when|where|which|who|describe|tell|explain|share|list|summari[sz]e|walk|give)\b/i.test(
      text,
    )
  );
}
