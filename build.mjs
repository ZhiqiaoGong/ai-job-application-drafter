// Minimal build for the MV3 extension: bundle each entry point, copy static files.
// Run `npm run build` for a release bundle, `npm run watch` while developing.
import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

const shared = {
  bundle: true,
  target: 'chrome120',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
};

// The service worker runs as an ES module (declared in the manifest).
// Page scripts are bundled as IIFE so they need no module loader.
const entries = [
  {
    entryPoints: ['src/background/service-worker.ts'],
    outfile: `${outdir}/service-worker.js`,
    format: 'esm',
  },
  {
    entryPoints: ['src/content/index.ts'],
    outfile: `${outdir}/content.js`,
    format: 'iife',
  },
  {
    entryPoints: ['src/options/options.ts'],
    outfile: `${outdir}/options.js`,
    format: 'iife',
  },
];

const statics = [
  ['manifest.json', `${outdir}/manifest.json`],
  ['src/options/options.html', `${outdir}/options.html`],
];

// PNGs are committed rather than generated at build time: rsvg-convert is not a
// dependency, and nobody should need it installed to build the extension.
const icons = [16, 32, 48, 128].map((size) => [
  `src/icons/icon-${size}.png`,
  `${outdir}/icons/icon-${size}.png`,
]);

await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/icons`, { recursive: true });
await Promise.all([...statics, ...icons].map(([from, to]) => cp(from, to)));

if (watch) {
  const contexts = await Promise.all(entries.map((entry) => context({ ...shared, ...entry })));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('watching for changes (static files are copied once, re-run to refresh them)');
} else {
  await Promise.all(entries.map((entry) => build({ ...shared, ...entry })));
  console.log(`built to ${outdir}/`);
}
