// SNT PDF Annotator v3.18
// Opacity control removed for stability. Shapes use solid fills.
// Keep the direct v3.17 editor so selected-object colour/width editing remains,
// but with no opacity input present curFillOpacity() defaults to 100%.
try {
  await import('./v317-viewer-loader.js');
} catch (e) {
  console.error('v3.18 viewer upgrade failed; restoring stable v3.14 viewer', e);
  await import('./v314-viewer-loader.js');
}
