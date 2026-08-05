// Exposes the content-script heuristics to the fixture page. Dev only, never shipped.
import { isAnswerField } from '../src/content/detect';
import { writeAnswer } from '../src/content/insert';
import { extractLimits, extractQuestion } from '../src/content/question';

(window as unknown as Record<string, unknown>).__af = {
  extractQuestion,
  extractLimits,
  writeAnswer,
  isAnswerField,
};
