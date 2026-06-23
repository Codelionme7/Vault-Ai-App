import { context, build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outdir = fileURLToPath(new URL('./dist', import.meta.url));
const watch = process.argv.includes('--watch');

// Resolve workspace packages to source so the engine is bundled into each
// extension entry point (service worker, offscreen doc, popup, content script).
const alias = {
  '@echovault/audio-engine': fileURLToPath(
    new URL('../../packages/audio-engine/src/index.ts', import.meta.url),
  ),
  '@echovault/shared': fileURLToPath(
    new URL('../../packages/shared/src/index.ts', import.meta.url),
  ),
};

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: 'esm',
  target: 'chrome114',
  sourcemap: true,
  logLevel: 'info',
  alias,
};

const entries = {
  background: 'src/background.ts',
  offscreen: 'src/offscreen.ts',
  popup: 'src/popup.ts',
  content: 'src/content/meet-detector.ts',
};

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  // Static assets (manifest + html/css).
  await cp(new URL('./manifest.json', import.meta.url), new URL('./dist/manifest.json', import.meta.url));
  await cp(new URL('./public', import.meta.url), new URL('./dist', import.meta.url), {
    recursive: true,
  });

  const opts = Object.entries(entries).map(([name, entry]) => ({
    ...common,
    entryPoints: [entry],
    outfile: `dist/${name}.js`,
  }));

  if (watch) {
    const ctxs = await Promise.all(opts.map((o) => context(o)));
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('Watching extension sources…');
  } else {
    await Promise.all(opts.map((o) => build(o)));
    console.log('Extension built to dist/');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
