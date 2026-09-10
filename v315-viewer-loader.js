// SNT PDF Annotator v3.17.1 entry shim
// Use the direct v3.17 shape editor, but never sacrifice core startup/Library.
try {
  await import('./v317-viewer-loader.js');
} catch (e) {
  console.error('v3.17 viewer upgrade failed; restoring stable v3.14 viewer', e);
  await import('./v314-viewer-loader.js');
}
