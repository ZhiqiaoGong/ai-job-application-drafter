/** Elements we are willing to write an answer into. */
export type AnswerField = HTMLTextAreaElement | HTMLInputElement | HTMLElement;

/**
 * Editing surfaces that are never a job application answer, however question-like
 * the text around them looks. Code editors are obvious; the rich text ones are
 * here because they are what chat composers are built from, and a composer whose
 * placeholder happens to be a question ("How can I help you today?") otherwise
 * reads as a perfectly good application prompt.
 *
 * The cost is an ATS that uses one of these for a cover letter box. That is rarer
 * than the false positives, and the list is easy to shorten.
 */
const EDITOR_ROOTS = [
  '.cm-editor', // CodeMirror 6, used by Overleaf
  '.CodeMirror', // CodeMirror 5
  '.monaco-editor',
  '.ace_editor',
  '.ProseMirror',
  '[data-lexical-editor]',
  '.ql-editor', // Quill
].join(',');

/**
 * A dropdown wearing a text box. Component libraries build their selects out of a
 * real `<input>` used to filter the options, and on a form that input sits under
 * a perfectly good question label - "How did you hear about us?" - so nothing in
 * the text tells it apart. The ARIA it carries does.
 *
 * A choice question is not an open-ended one. Prose typed into the filter box
 * would match no option and submit nothing.
 */
function isCombobox(node: HTMLElement): boolean {
  // A datalist is the same idea without the library.
  if (node.hasAttribute('list')) return true;
  if (node.hasAttribute('aria-autocomplete') || node.hasAttribute('aria-expanded')) return true;

  const popup = node.getAttribute('aria-haspopup');
  if (popup && popup !== 'false') return true;

  // The wrapper pattern: react-select and friends put the role on a container
  // around the filter input. Bounded, because `closest` runs to <html>, and one
  // page-level role would otherwise silence every field beneath it.
  let ancestor: HTMLElement | null = node.parentElement;
  for (let depth = 0; depth < 3 && ancestor; depth += 1) {
    const role = ancestor.getAttribute('role');
    if (role === 'combobox' || role === 'listbox') return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

export function isAnswerField(node: EventTarget | null): node is AnswerField {
  if (!(node instanceof HTMLElement)) return false;
  if (isOwnUi(node)) return false;
  if (node.closest(EDITOR_ROOTS)) return false;
  if (isCombobox(node)) return false;

  if (node instanceof HTMLTextAreaElement) {
    return !node.readOnly && !node.disabled;
  }

  if (node instanceof HTMLInputElement) {
    return isAnswerableInput(node);
  }

  // Only treat the editing host itself as the field, not nested markup.
  return node.isContentEditable && node.getAttribute('contenteditable') !== 'false';
}

/**
 * Short application questions do appear in single-line inputs, but so does almost
 * every search and filter box on the web, so the bar is higher: the right type,
 * and no autocomplete hint. A hint means the browser already knows what belongs
 * there, which makes it an identity field that the autofill tools own, not a
 * question. `question.ts` additionally demands a labelled, question-shaped prompt.
 */
function isAnswerableInput(node: HTMLInputElement): boolean {
  if (node.readOnly || node.disabled) return false;

  const type = (node.getAttribute('type') ?? 'text').toLowerCase();
  if (type !== 'text') return false;

  const hint = node.getAttribute('autocomplete')?.trim().toLowerCase();
  return !hint || hint === 'off';
}

/** Guard against reacting to focus inside our own injected UI. */
export function isOwnUi(node: Node | null): boolean {
  const root = (node as HTMLElement | null)?.getRootNode?.();
  return root instanceof ShadowRoot && (root.host as HTMLElement).dataset.aiDrafter === 'true';
}

export function readFieldValue(field: AnswerField): string {
  return hasValue(field) ? field.value : (field.innerText ?? '');
}

export function hasValue(
  field: AnswerField,
): field is HTMLTextAreaElement | HTMLInputElement {
  return field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement;
}
