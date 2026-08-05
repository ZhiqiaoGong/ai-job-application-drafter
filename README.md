# AI Job Application Drafter

AI drafts your answers to the open-ended questions on job application forms. Chrome extension, your own OpenAI key, your resume stays on your machine.

Click into a question like *"Why do you want to work here?"* and a small panel appears under the field. One click writes a draft straight into the box. No copy-paste step.

## What it does not do

**No form autofill.** Name, email, phone, work authorisation — Simplify and friends already do that well, and this deliberately stays out of their way. It only touches the free-text boxes those tools leave empty.

**No application tracking.** No dashboard, no pipeline, no history.

The whole tool is one job: the handful of questions per application that actually need writing.

## How it works

**It waits for you.** No DOM scanning, no MutationObserver. The panel appears when you focus a field that has a recognisable question near it, and stays quiet everywhere else. A textarea with no question attached gets nothing.

**It finds the job posting.** On every page it reads Schema.org `JobPosting` JSON-LD, falling back to `og:` tags only where the URL is plausibly a posting at all. Postings are remembered for the browser session, so a description read on a company careers page is still available when the form turns out to live on Greenhouse.

Matching runs in tiers, most trustworthy first:

| Tier | Rule |
| --- | --- |
| `manual` | You pasted it in for this site |
| `page` | Captured on this exact URL |
| `origin` | Captured on this host |
| `recent` | Captured anywhere in the last 30 minutes |

Only the last one is a guess, so **the panel always names the posting it picked and says where it came from**. A wrong match is visible rather than silent. If it is wrong, or if nothing was found, or if what was found is a bare page title with no description, the panel says so and you can paste the real description in — once per site, not once per question.

**Revisions keep your steering.** Type a direction like *"mention the Postgres migration and keep it under 3 sentences"* and it sticks to that question: Redo and Shorter keep honouring it until you clear it.

**Undo gives back what you wrote.** Not the previous draft — whatever was in the field before the tool first touched it.

## Install

No store listing. Load it unpacked:

```bash
npm install && npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select the `dist/` directory.

## Setup

Click the toolbar icon to open settings, then fill in three things:

1. **API key** — yours, from [platform.openai.com](https://platform.openai.com/api-keys). Billed to your account.
2. **Model** — free text, so a newer model works without a new build.
3. **Resume** — plain text. This is the single source of truth for every answer, so keep it current; a stale graduation date produces answers that say you are still in school.

## Privacy

Worth being precise about, since this handles a resume and an API key.

- **The API key never leaves the service worker.** Content scripts run in the page context of whatever job site you are on, so they never see it. All API traffic goes through the background worker.
- **Your resume and the matched job posting are sent to OpenAI with every request**, under your own key. Nothing goes anywhere else — there is no server in this project.
- **Settings and resume live in `chrome.storage.local`**, which is unencrypted on disk in your Chrome profile. Anyone with your unlocked machine can read it.
- **Captured job postings live in `chrome.storage.session`** and are gone when you close the browser.
- The posting adds roughly 1500 tokens per request. There is a settings switch to turn it off.

## Development

```bash
npm run build      # bundle to dist/
npm run watch      # rebuild on change
npm run typecheck  # tsc --noEmit
npm run fixture    # build the fixtures below
```

There is no test runner. Instead `npm run fixture` builds self-scoring HTML pages you open in a browser — they exercise the real modules and print a pass/fail list.

| Page | Covers |
| --- | --- |
| `dist/fixture.html` | Pulling the question text off a field |
| `dist/job.html` | Reading a posting off a page, and the matching tiers |
| `dist/flow.html` | The content script end to end, against a stubbed background |
| `dist/prompt.html` | What actually reaches the API, plus a dump of the full prompt |
| `dist/panel.html` | Every panel state, for eyeballing |

`flow.html` drives the real content script and calls the real background functions, faking only `chrome.storage`, so the rules under test are the shipped ones. `fixtures/manual/no-posting.html` is a hand-driven page for the case where no posting can be detected.

Each fixture case exists because something was actually wrong. A few of them:

- Leaving a field and coming back used to wipe the pre-insert value, quietly turning Undo into *restore the answer we just wrote*.
- The first Draft click beat the async posting lookup, so the very first answer never saw the job description while the panel claimed it did.
- Pasting a description deleted the one detected on the same URL, which made pasting a one-way door with nothing to go back to.
- Reloading the extension orphans content scripts in open tabs, where `chrome.runtime.sendMessage` throws *synchronously* — somewhere no `.catch` on the returned promise can see it.
- The prompt never stated the current date, so a model with no clock read `Sep 2024 - Jun 2026` as ongoing and insisted the candidate was still enrolled.

## Layout

```
src/background/   service worker; the only context that reads the API key
src/content/      field detection, question extraction, the panel, insertion
src/lib/          prompt assembly, posting matching, storage, provider adapter
fixtures/         self-scoring dev pages
```

Adding another LLM provider means one branch in `src/lib/llm.ts` and nothing else.

## License

MIT
