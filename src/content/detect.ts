/** Elements we are willing to write an answer into. */
export type AnswerField = HTMLTextAreaElement | HTMLElement;

/**
 * Open-ended application questions are essentially always a textarea or a rich
 * text editor. Single-line inputs are deliberately ignored so the widget never
 * appears on search boxes, name fields, and the like.
 */
export function isAnswerField(node: EventTarget | null): node is AnswerField {
  if (!(node instanceof HTMLElement)) return false;
  if (isOwnUi(node)) return false;

  if (node instanceof HTMLTextAreaElement) {
    return !node.readOnly && !node.disabled;
  }

  // Only treat the editing host itself as the field, not nested markup.
  return node.isContentEditable && node.getAttribute('contenteditable') !== 'false';
}

/** Guard against reacting to focus inside our own injected UI. */
export function isOwnUi(node: Node | null): boolean {
  const root = (node as HTMLElement | null)?.getRootNode?.();
  return root instanceof ShadowRoot && (root.host as HTMLElement).dataset.applicationFiller === 'true';
}

export function readFieldValue(field: AnswerField): string {
  return field instanceof HTMLTextAreaElement ? field.value : (field.innerText ?? '');
}
