// SNT PDF Annotator v3.15.1 HOTFIX
// The v3.15 runtime-patching layer could abort viewer startup, which meant
// core controls such as Library never received their event handlers.
// Restore the proven v3.14 viewer immediately; reintroduce v3.15 features
// incrementally after the core is confirmed healthy.
import './v314-viewer-loader.js';
