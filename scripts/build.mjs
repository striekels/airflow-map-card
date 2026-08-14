import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const outfile = 'dist/airflow-map-card.js';

/**
 * Vite's `?inline` suffix means "give me this stylesheet as a string", which is
 * how the card gets Leaflet's CSS into its shadow root. esbuild does not know
 * the convention, so teach it: strip the query and load the file as text.
 *
 * Keeping the same import specifier means `npm run dev` (Vite) and
 * `npm run build` (esbuild) resolve identically.
 */
const cssInlinePlugin = {
  name: 'css-inline',
  setup(build) {
    build.onResolve({ filter: /\.css\?inline$/ }, (args) => ({
      path: require.resolve(args.path.replace(/\?inline$/, ''), { paths: [args.resolveDir] }),
      namespace: 'css-inline',
    }));
    build.onLoad({ filter: /.*/, namespace: 'css-inline' }, async (args) => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'text',
    }));
  },
};

await mkdir('dist', { recursive: true });

const result = await esbuild.build({
  entryPoints: ['src/airflow-map-card.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  target: 'es2021',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  plugins: [cssInlinePlugin],
  metafile: true,
  logLevel: 'info',
});

const bytes = readFileSync(outfile);
const gzipped = gzipSync(bytes).length;
console.log(
  `\n${outfile}  ${(bytes.length / 1024).toFixed(1)} kB  (gzip ${(gzipped / 1024).toFixed(1)} kB)`,
);

if (process.argv.includes('--analyze')) {
  console.log(await esbuild.analyzeMetafile(result.metafile, { verbose: false }));
}
