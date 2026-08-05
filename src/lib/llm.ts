import type { Settings, TokenUsage } from './types';

export interface GenerateParams {
  settings: Settings;
  system: string;
  user: string;
}

export interface GenerateResult {
  text: string;
  usage?: TokenUsage;
}

/**
 * Provider adapter. Only OpenAI is wired up; adding another provider means
 * adding a branch here, nothing else in the extension changes.
 */
export async function generate(params: GenerateParams): Promise<GenerateResult> {
  switch (params.settings.provider) {
    case 'openai':
      return generateOpenAI(params);
    default:
      throw new Error(`Unsupported provider: ${params.settings.provider}`);
  }
}

const OPENAI_CHAT_COMPLETIONS = 'https://api.openai.com/v1/chat/completions';

async function generateOpenAI({ settings, system, user }: GenerateParams): Promise<GenerateResult> {
  if (!settings.apiKey.trim()) {
    throw new Error('No API key saved. Open the extension settings and add one.');
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_COMPLETIONS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch {
    throw new Error('Could not reach the API. Check your network connection.');
  }

  if (!response.ok) {
    throw new Error(await describeHttpError(response, settings.model));
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('The API returned an empty answer. Try again.');
  }

  return {
    text,
    usage: data.usage
      ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
      : undefined,
  };
}

/** Turn API error responses into something actionable rather than a raw status code. */
async function describeHttpError(response: Response, model: string): Promise<string> {
  const detail = await readErrorMessage(response);

  switch (response.status) {
    case 401:
      return 'API key rejected (401). Check that the key is correct and still active.';
    case 403:
      return `Access denied (403). Your account may not have access to "${model}".${detail}`;
    case 404:
      return `Model "${model}" not found (404). Check the model name in settings.${detail}`;
    case 429:
      return 'Rate limited or out of credit (429). Check your API billing balance, then retry.';
    default:
      return `API error ${response.status}.${detail}`;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ? ` ${body.error.message}` : '';
  } catch {
    return '';
  }
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}
