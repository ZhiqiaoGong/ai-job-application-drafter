// Exposes the prompt assembly to the fixture page. Dev only, never shipped.
import { buildSystemPrompt, buildUserPrompt } from '../src/lib/prompt';

(window as unknown as Record<string, unknown>).__prompt = {
  buildSystemPrompt,
  buildUserPrompt,
};
