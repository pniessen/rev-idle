// build.mjs — inline src files and emit two outputs.
// No npm dependencies, no bundler. Run: node build.mjs
//
//   dist/artifact.html — a bare fragment (no doctype/html/head/body) meant to
//     be published as a claude.ai Artifact; the Artifact skeleton supplies
//     its own <meta name="viewport" ... viewport-fit=cover>, so this fragment
//     carries no viewport meta of its own.
//   index.html (repo root) — a full standalone document for GitHub Pages,
//     assembled from the same head/body material plus its own doctype/html/
//     head/body wrapper and viewport meta.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BODY_MARKER = '<!--@BODY-->';

function read(rel) {
  return readFileSync(join(__dirname, rel), 'utf-8');
}

const template = read('src/template.html');
const style = read('src/styles.css');
const engine = read('src/engine.js');
const engineInf = read('src/engine-infinity.js');
const engineAuto = read('src/engine-auto.js');
const render = read('src/render.js');
const help = read('src/help.js');
const uiInf = read('src/ui-infinity.js');
const ui = read('src/ui.js');

const markers = [
  ['/*@STYLE*/', style],
  ['/*@ENGINE*/', engine],
  ['/*@ENGINE_INF*/', engineInf],
  ['/*@ENGINE_AUTO*/', engineAuto],
  ['/*@RENDER*/', render],
  ['/*@HELP*/', help],
  ['/*@UI_INF*/', uiInf],
  ['/*@UI*/', ui],
];

let filled = template;
for (const [marker, content] of markers) {
  if (!filled.includes(marker)) {
    throw new Error(`build.mjs: marker ${marker} not found in src/template.html`);
  }
  // Use a function replacer so `$` sequences in the injected content (e.g.
  // template literals, regex replacement patterns) are never interpreted as
  // String.prototype.replace special patterns.
  filled = filled.replace(marker, () => content);
}

if (!filled.includes(BODY_MARKER)) {
  throw new Error(`build.mjs: marker ${BODY_MARKER} not found in src/template.html`);
}
const splitAt = filled.indexOf(BODY_MARKER);
const headMaterial = filled.slice(0, splitAt);
const bodyMaterial = filled.slice(splitAt + BODY_MARKER.length);

// --- dist/artifact.html: bare fragment, no doctype/html/head/body ---
const artifactHtml = headMaterial + bodyMaterial;

mkdirSync(join(__dirname, 'dist'), { recursive: true });
writeFileSync(join(__dirname, 'dist', 'artifact.html'), artifactHtml);
console.log(`dist/artifact.html written (${artifactHtml.length} bytes)`);

// --- index.html: full standalone document for GitHub Pages ---
const standaloneHtml =
  '<!doctype html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  headMaterial +
  '</head>\n' +
  '<body>\n' +
  bodyMaterial +
  '</body>\n' +
  '</html>\n';

writeFileSync(join(__dirname, 'index.html'), standaloneHtml);
console.log(`index.html written (${standaloneHtml.length} bytes)`);

// --- .nojekyll: tells GitHub Pages not to run Jekyll processing ---
writeFileSync(join(__dirname, '.nojekyll'), '');
console.log('.nojekyll written');
