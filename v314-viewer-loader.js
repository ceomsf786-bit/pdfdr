// SNT PDF Annotator v3.14 — true solid shape fill
// Reuse the v3.13 viewer upgrade, but force shape fill opacity to 100%.
const sourceUrl = new URL('./v313-viewer-loader.js', location.href);
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Could not load v3.13 viewer upgrade.');
let src = await response.text();

// v3.13 intentionally used 0.22 (22%) opacity for filled shapes. v3.14
// changes filled boxes/circles to a true opaque fill. This also fixes shapes
// already saved with fillOpacity:0.22 because rendering/export now uses 1.
src = src.replaceAll('.22', '1');

const blob = new Blob([src], { type: 'text/javascript' });
const blobUrl = URL.createObjectURL(blob);
try { await import(blobUrl); }
finally { setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); }
