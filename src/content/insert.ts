import { hasValue, type AnswerField } from './detect';

/**
 * Write text into a field so that React, Vue, and friends actually notice.
 *
 * Assigning `element.value` directly is invisible to React: its synthetic event
 * layer tracks the last value it set and will overwrite the change on the next
 * render. Calling the native prototype setter and then dispatching a bubbling
 * `input` event is what makes a controlled component accept the text.
 */
export function writeAnswer(field: AnswerField, text: string): void {
  if (hasValue(field)) {
    // The setter has to come from the matching prototype: React tracks them
    // separately, and an input written through the textarea setter is ignored.
    const prototype =
      field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) {
      setter.call(field, text);
    } else {
      field.value = text;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  writeContentEditable(field, text);
}

/**
 * execCommand is deprecated but remains the only way to edit a contenteditable
 * that keeps the native undo stack intact and fires the events rich text
 * editors listen for.
 */
function writeContentEditable(field: HTMLElement, text: string): void {
  field.focus();

  const range = document.createRange();
  range.selectNodeContents(field);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand('insertText', false, text);
  if (!inserted) {
    field.textContent = text;
    field.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}
