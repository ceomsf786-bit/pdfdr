// SNT PDF Annotator v3.16.2
// Safe incremental upgrade on top of the proven v3.13 shape editor.
// Working opacity + selected existing shape colour/fill/width/opacity.
// If a patch signature ever stops matching, fall back to v3.14 so core
// controls such as Library still start.

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

  // New shapes use the slider. Legacy shapes saved at the old accidental 22%
  // are displayed as solid until the teacher deliberately chooses an opacity.
  loader = loader.replaceAll('fillOpacity:.22', 'fillOpacity:curFillOpacity()');
  loader = loader.replaceAll('o.fillOpacity??.22', 'o.fillOpacity??1');
  loader = loader.replaceAll('Number(o.fillOpacity??1)', 'Number(o.fillOpacity===.22?1:(o.fillOpacity??1))');

  // When Select is used, load that object's current style into the controls.
  patch(
    "const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;drawOverlay();",
    "const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;syncSelectedStyleControls(hit);drawOverlay();"
  );

  patch(
`function applyShapeFillToSelection(){
  if(!TEACHER||!state.selectedId)return;const o=state.pageObjects.find(x=>x.id===state.selectedId);if(!o||(o.type!=='rect'&&o.type!=='ellipse'))return;
  remember();o.fill=curFill();o.fillColor=curFillColor();o.fillOpacity=.22;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.shapeFillToggle?.addEventListener('change',applyShapeFillToSelection);
  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);`,
`function syncSelectedStyleControls(o){
  if(!TEACHER||!o)return;
  if(els.colorInput&&o.color)els.colorInput.value=o.color;
  if(els.widthInput&&Number.isFinite(Number(o.width)))els.widthInput.value=String(Math.max(1,Math.min(18,Number(o.width))));
  if(o.type==='rect'||o.type==='ellipse'){
    if(els.shapeFillToggle)els.shapeFillToggle.checked=!!o.fill;
    if(els.shapeFillColor&&(o.fillColor||o.color))els.shapeFillColor.value=o.fillColor||o.color;
    const opacity=o.fillOpacity===.22?1:Number(o.fillOpacity??1);
    const pct=Math.round(Math.max(0,Math.min(1,opacity))*100);
    if(els.shapeFillOpacity)els.shapeFillOpacity.value=String(pct);
    if(els.shapeFillOpacityValue)els.shapeFillOpacityValue.textContent=\`\${pct}%\`;
  }
}
function applySelectedStyle(){
  if(!TEACHER||!state.selectedId)return;
  const o=state.pageObjects.find(x=>x.id===state.selectedId);if(!o)return;
  remember();
  o.color=curColor();
  if(typeof o.width==='number')o.width=curWidth();
  if(o.type==='rect'||o.type==='ellipse'){
    o.fill=curFill();o.fillColor=curFillColor();o.fillOpacity=curFillOpacity();
  }
  state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.shapeFillToggle?.addEventListener('change',applySelectedStyle);
  els.shapeFillColor?.addEventListener('input',applySelectedStyle);
  els.shapeFillOpacity?.addEventListener('input',()=>{if(els.shapeFillOpacityValue)els.shapeFillOpacityValue.textContent=\`\${els.shapeFillOpacity.value}%\`;applySelectedStyle();});
  els.colorInput?.addEventListener('input',applySelectedStyle);
  els.widthInput?.addEventListener('input',applySelectedStyle);`
  );

  if (!ok) {
    console.warn('v3.16.2 patch signature mismatch; using stable v3.14 viewer.');
    await import('./v314-viewer-loader.js');
  } else {
    const blob = new Blob([loader], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try { await import(blobUrl); }
    catch (e) {
      console.error('v3.16.2 viewer failed; falling back to v3.14', e);
      await import('./v314-viewer-loader.js');
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  }
}
