// Vice Cover Studio — make.fun entry program (Node 22, standard library only).
// Hands the app in: copies app/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with
// the vendored make.fun library (vendor/makefun-app.ts, unchanged).
//
// Serve the app locally with any static server, e.g. from this directory:
//   python3 -m http.server 8080 --directory app
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail fast with a clear message when the entry is incomplete, instead of
// handing the grader a broken /output.
const appIndex = join(here, 'app', 'index.html');
if (!existsSync(appIndex)) {
  throw new Error('Vice Cover Studio: app/index.html is missing — cannot hand in.');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the other limits refuse an entry the scorer would refuse — more than
// 4 screenshots or one over 256 KiB; more than 993 files in app/ or 48 MiB of
// app files in all, or a path under app/ over 1000 bytes. app/ counts beside
// /output's own 1000-entry cap, its screenshots/ and dossier.json.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);

// Short human-readable summary on stdout so a local run shows what was built.
const shotCount = readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.')).length;
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`Vice Cover Studio: wrote ${shotCount} screenshot(s) and dossier.json (${dossierBytes} bytes) to ${out}.`);
