// SNT PDF Annotator v3.14 — true solid shape fill on image boards
// Reuse the stable v3.13 image-board implementation and force fill opacity to 100%.
const sourceUrl = new URL('./v312-imageboards.js', location.href);
const configUrl = new URL('./config.js', location.href).href;
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Could not load image boards.');
let src = await response.text();

// Blob modules cannot resolve a relative config import, so make it absolute.
src = src.replace("import { CONFIG } from './config.js';", `import { CONFIG } from '${configUrl}';`);

// v3.13 used 22% opacity for fills. v3.14 makes them truly opaque so the
// content underneath is completely hidden, including for already-saved shapes.
src = src.replaceAll('.22', '1');

const blob = new Blob([src], { type: 'text/javascript' });
const blobUrl = URL.createObjectURL(blob);
try { await import(blobUrl); }
finally { setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); }
