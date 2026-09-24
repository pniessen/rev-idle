// build.mjs — inline src files into index.html.
// No npm dependencies, no bundler. Run: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return readFileSync(join(__dirname, rel), 'utf-8');
}

const template = read('src/template.html');
const style = read('src/styles.css');
const engine = read('src/engine.js');
const render = read('src/render.js');
const ui = read('src/ui.js');

const markers = [
  ['/*@STYLE*/', style],
  ['/*@ENGINE*/', engine],
  ['/*@RENDER*/', render],
  ['/*@UI*/', ui],
];

let out = template;
for (const [marker, content] of markers) {
  if (!out.includes(marker)) {
    throw new Error(`build.mjs: marker ${marker} not found in src/template.html`);
  }
  // Use a function replacer so `$` sequences in the injected content (e.g.
  // template literals, regex replacement patterns) are never interpreted as
  // String.prototype.replace special patterns.
  out = out.replace(marker, () => content);
}

writeFileSync(join(__dirname, 'index.html'), out);
console.log(`index.html written (${out.length} bytes)`);
