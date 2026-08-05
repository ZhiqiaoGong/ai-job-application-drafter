// Renders the README images from fixtures/shot.html with headless Chrome, so the
// screenshots are the real panel rather than a mockup of it. Run `npm run shots`
// after `npm run fixture`. Chrome path is macOS-only; adjust if you are not.
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const page = `file://${process.cwd()}/dist/shot.html`;

// Heights differ because the popover hangs well below the panel row.
const SHOTS = [
  { name: 'panel-idle', size: '880,272' },
  { name: 'panel-result', size: '880,300' },
  { name: 'panel-posting', size: '880,450' },
];

await mkdir('docs', { recursive: true });

for (const shot of SHOTS) {
  const hash = shot.name.replace('panel-', '');
  await run(CHROME, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--virtual-time-budget=3000',
    `--window-size=${shot.size}`,
    `--screenshot=docs/${shot.name}.png`,
    `${page}#${hash}`,
  ]);
  console.log(`docs/${shot.name}.png`);
}
