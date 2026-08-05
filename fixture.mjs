// Builds the dev fixtures into dist/ for manual checks. Run `npm run fixture`.
//   dist/fixture.html - question-extraction regression cases, self-scoring
//   dist/job.html     - job-posting capture and matching cases, self-scoring
//   dist/flow.html    - content-script wiring regression cases, self-scoring
//   dist/prompt.html  - what actually reaches the API, self-scoring
//   dist/panel.html   - the injected panel, so its states can be eyeballed
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const FIXTURES = [
  { probe: 'fixtures/probe.ts', page: 'fixtures/questions.html', script: 'probe.js', out: 'dist/fixture.html' },
  { probe: 'fixtures/job-probe.ts', page: 'fixtures/job.html', script: 'job-probe.js', out: 'dist/job.html' },
  { probe: 'fixtures/flow-probe.ts', page: 'fixtures/flow.html', script: 'flow-probe.js', out: 'dist/flow.html' },
  { probe: 'fixtures/prompt-probe.ts', page: 'fixtures/prompt.html', script: 'prompt-probe.js', out: 'dist/prompt.html' },
  { probe: 'fixtures/panel-probe.ts', page: 'fixtures/panel.html', script: 'panel-probe.js', out: 'dist/panel.html' },
];

await mkdir('dist', { recursive: true });

for (const fixture of FIXTURES) {
  const bundle = `dist/${fixture.script}`;

  await build({
    entryPoints: [fixture.probe],
    bundle: true,
    format: 'iife',
    target: 'chrome120',
    outfile: bundle,
    logLevel: 'info',
  });

  const [html, js] = await Promise.all([readFile(fixture.page, 'utf8'), readFile(bundle, 'utf8')]);

  // Inline the bundle: browsers block external file:// scripts when the page is
  // opened straight from disk.
  await writeFile(
    fixture.out,
    html.replace(`<script src="${fixture.script}"></script>`, `<script>\n${js}\n</script>`),
  );
  console.log(`open ${fixture.out}`);
}
