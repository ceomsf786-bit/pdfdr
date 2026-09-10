// SNT PDF Annotator v3.16
// Safe incremental upgrade on top of the proven v3.13 shape editor.
// Adds working opacity and lets a previously selected object change colour/style.
// If a patch signature ever stops matching, we fall back to v3.14 instead of
// allowing the main viewer (and Library button) to fail at startup.

const baseUrl = new URL('./v313-viewer-loader.js', location.href);
const response = await fetch(baseUrl, { cache: 'no-store' });
if (!response.ok) {
  await import('./v314-viewer-loader.js');
} else {
  let loader = await response.text();
  let ok = true;

  function patch(oldText, newText) {
    if (!loader.includes(oldText)) { ok = false; return; }
    loader = loader.replace(oldText, newText);
  }

  patch(
    "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), undoBtn:$('undoBtn')",
    "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), shapeFillOpacity:$('shapeFillOpacity'), shapeFillOpacityValue:$('shapeFillOpacityValue'), undoBtn:$('undoBtn')"
  );

  patch(
    "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }",
    "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }\nfunction curFillOpacity(){const n=Number(els.shapeFillOpacity?.value??100);return Math.max(0,Math.min(1,n/100));}"
  );

  loader = loader.replaceAll('fillOpacity:.22', 'fillOpacity:curFillOpacity()');
  loader = loader.replaceAll('o.fillOpacity??.22', 'o.fillOpacity??1');

  patch(
`function applyShapeFillToSelection(){
  if(!TEACHER||!state.selectedId)return;const o=state.pageObjects.find(x=>x.id===state.selectedId);if(!o||(o.type!=='rect'&&o.type!=='ellipse'))return;
  remember();o.fill=curFill();o.fillColor=curFillColor();o.fillOpacity=.22;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.shapeFillToggle?.addEventListener('change',applyShapeFillToSelection);
  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);`,
`function applySelectedStyle(){
  if(!TEACHER||!state.selectedId)return;
  const o=state.pageObjects.find(x=>x.id===state.selectedId);if(!o)return;
  remember();
  o.color=curColor();
  if(o.type==='rect'||o.type==='ellipse'){
    o.fill=curFill();o.fillColor=curFillColor();o.fillOpacity=curFillOpacity();
  }
  state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.shapeFillToggle?.addEventListener('change',applySelectedStyle);
  els.shapeFillColor?.addEventListener('input',applySelectedStyle);
  els.shapeFillOpacity?.addEventListener('input',()=>{if(els.shapeFillOpacityValue)els.shapeFillOpacityValue.textContent=\`${els.shapeFillOpacity.value}%\`;applySelectedStyle();});
  els.colorInput?.addEventListener('input',applySelectedStyle);`
  );

  if (!ok) {
    console.warn('v3.16 patch signature mismatch; using stable v3.14 viewer.');
    await import('./v314-viewer-loader.js');
  } else {
    const blob = new Blob([loader], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try { await import(blobUrl); }
    catch (e) {
      console.error('v3.16 viewer failed; falling back to v3.14', e);
      await import('./v314-viewer-loader.js');
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  }
}
