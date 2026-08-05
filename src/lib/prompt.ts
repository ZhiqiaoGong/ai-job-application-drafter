import type { Profile, QuestionContext, Settings, Tone, Variant } from './types';

const TONE_GUIDANCE: Record<Tone, string> = {
  concise: 'Direct and economical. Short sentences, no filler, no restating the question.',
  professional: 'Clear and professional but recognisably human. No corporate boilerplate.',
  warm: 'Personable and genuine while staying professional.',
};

const VARIANT_GUIDANCE: Record<Exclude<Variant, 'custom'>, string> = {
  default: '',
  shorter: 'Rewrite the previous answer substantially shorter while keeping the strongest specifics.',
};

export interface AnswerRequest {
  context: QuestionContext;
  profile: Profile;
  variant: Variant;
  previous?: string;
  /** The candidate's own revision direction, used when variant is `custom`. */
  instruction?: string;
}

/**
 * `today` is a parameter so the prompt stays testable, but it is not optional in
 * spirit: a model has no clock, so without it every date range on the resume is
 * unreadable. "Sep 2024 - Jun 2026" then gets treated as the current situation
 * however long ago it ended, and the answers claim the candidate is still there.
 */
export function buildSystemPrompt(settings: Settings, today: Date = new Date()): string {
  // Only the rules are filtered: the standing instruction is the one optional
  // line. Filtering the whole thing also ate the blank line above "Rules:".
  const rules = [
    '- Stay within what the resume says and what the candidate tells you under DIRECTION. Never invent employers, job titles, dates, metrics, credentials, or skills that appear in neither.',
    '- DIRECTION is the candidate speaking about themselves, and it outranks the resume. A resume is a snapshot and goes stale; where the two disagree, the candidate is right and the resume is out of date.',
    '- If neither contains what the question asks for, answer honestly around the gap instead of fabricating. Do not claim experience the candidate does not have.',
    '- Output only the answer text. No preamble, no greeting, no sign-off, no "Here is my answer", no surrounding quotes.',
    '- Avoid cliches such as "I am passionate about", "team player", "hit the ground running", "fast-paced environment".',
    '- Prefer concrete specifics from the resume over generic enthusiasm.',
    `- Tone: ${TONE_GUIDANCE[settings.tone]}`,
    settings.customInstruction.trim()
      ? `- Standing instructions from the candidate: ${settings.customInstruction.trim()}`
      : '',
  ].filter(Boolean);

  return [
    'You draft answers to open-ended questions on job application forms.',
    'You write as the candidate, in first person.',
    `Today is ${isoDate(today)}. Read every date on the resume against it: a range whose end date has passed is finished, not ongoing, and a degree whose end date has passed has been awarded.`,
    '',
    'Rules:',
    ...rules,
  ].join('\n');
}

export function buildUserPrompt({
  context: ctx,
  profile,
  variant,
  previous,
  instruction,
}: AnswerRequest): string {
  const parts: string[] = [];

  parts.push(section('RESUME', profile.raw.trim() || '(no resume saved)'));

  if (ctx.job) {
    const job = [
      ctx.job.title ? `Title: ${ctx.job.title}` : '',
      ctx.job.company ? `Company: ${ctx.job.company}` : '',
      ctx.job.description ? `Description:\n${ctx.job.description.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    if (job) parts.push(section('JOB POSTING', job));
  }

  parts.push(section('QUESTION', ctx.question.trim()));

  const limits = describeLimits(ctx);
  if (limits) parts.push(section('LENGTH LIMIT', limits));

  // The direction is standing guidance for this question: it applies to every
  // attempt, including a fresh one, not just the click that introduced it.
  const direction = instruction?.trim();
  if (direction) {
    // Not "the candidate asked for this": that read as a styling request, and a
    // correction of fact phrased that way lost to the resume every time.
    parts.push(
      section(
        'DIRECTION',
        `The candidate, telling you about themselves or about this answer. Take it as true, including where it contradicts the resume:\n${direction}`,
      ),
    );
  }

  const revision = describeRevision(variant, Boolean(previous?.trim()));
  if (revision) {
    parts.push(section('PREVIOUS ANSWER', previous!.trim()));
    parts.push(section('REVISION', revision));
  }

  parts.push('Write the answer now.');
  return parts.join('\n\n');
}

/**
 * Revisions transform the previous answer, so they are only meaningful once one
 * exists. Without it the direction above is what shapes the draft.
 */
function describeRevision(variant: Variant, hasPrevious: boolean): string {
  if (!hasPrevious) return '';
  if (variant === 'custom') return 'Rewrite the previous answer to follow the direction above.';
  return VARIANT_GUIDANCE[variant];
}

function describeLimits(ctx: QuestionContext): string {
  const limits: string[] = [];
  // Leave headroom so the answer is not truncated by the form itself.
  if (ctx.maxChars) limits.push(`Hard limit ${ctx.maxChars} characters. Stay under ${Math.floor(ctx.maxChars * 0.9)}.`);
  if (ctx.wordLimit) limits.push(`Hard limit ${ctx.wordLimit} words. Do not exceed it.`);
  return limits.join(' ');
}

function section(label: string, body: string): string {
  return `### ${label}\n${body}`;
}

/** Unambiguous in every locale, unlike anything with the month spelled or ordered. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
