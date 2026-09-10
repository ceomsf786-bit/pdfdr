// SNT PDF Annotator v3.15
// Builds on the proven v3.13 shape upgrade and adds:
// - user-controlled shape opacity
// - safe clickable http/https links in note boards
// - fixed annotation toolbar while the PDF itself scrolls

const loaderUrl = new URL('./v313-viewer-loader.js', location.href);
const response = await fetch(loaderUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Could not load viewer upgrade.');
let loader = await response.text();

function mustReplace(oldText, newText, label){
  const pos = loader.indexOf(oldText);
  if(pos < 0) throw new Error(`v3.15 loader mismatch: ${label}`);
  loader = loader.slice(0,pos) + newText + loader.slice(pos + oldText.length);
}

mustReplace(
  "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), undoBtn:$('undoBtn')",
  "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), shapeFillOpacity:$('shapeFillOpacity'), shapeFillOpacityValue:$('shapeFillOpacityValue'), undoBtn:$('undoBtn')",
  'opacity elements'
);

mustReplace(
  "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }",
  "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }\nfunction curFillOpacity(){ const n=Number(els.shapeFillOpacity?.value??100); return Math.max(0,Math.min(1,n/100)); }\nfunction objectFillOpacity(o){ const n=Number(o?.fillOpacity); if(Math.abs(n-.22)<.0001)return 1; return Number.isFinite(n)?Math.max(0,Math.min(1,n)):curFillOpacity(); }",
  'opacity helper'
);

// 0.22 is the old pre-slider fixed fill value. Treat that legacy value as
// 100% so shapes made before v3.15 stay solid. New slider values use 5% steps,
// so an intentional 22% value is never created by this UI.
loader = loader.replaceAll('fillOpacity:.22', 'fillOpacity:curFillOpacity()');
loader = loader.replaceAll('o.fillOpacity??.22', 'objectFillOpacity(o)');
loader = loader.replaceAll('o.fillOpacity=.22', 'o.fillOpacity=curFillOpacity()');

mustReplace(
  "  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);",
  "  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);\n  els.shapeFillOpacity?.addEventListener('input',()=>{if(els.shapeFillOpacityValue)els.shapeFillOpacityValue.textContent=`${els.shapeFillOpacity.value}%`;applyShapeFillToSelection();});",
  'opacity listener'
);

const marker = "const blob = new Blob([src], {type:'text/javascript'});";
const injection = String.raw`
replaceOnce(
  "    if(els.toolRail&&window.innerWidth>650)els.toolRail.style.transform=\`translateY(\${-els.pdfScroller.scrollTop}px)\`;",
  "    if(els.toolRail)els.toolRail.style.transform='translateY(0)';",
  'fixed tool rail'
);

replaceOnce(
  "const allowed=new Set(['DIV','P','BR','SPAN','U','B','STRONG','I','EM','FONT']);",
  "const allowed=new Set(['DIV','P','BR','SPAN','U','B','STRONG','I','EM','FONT','A']);",
  'allow note links'
);
replaceOnce(
  "      const oldStyle=child.getAttribute('style')||'';\n      const oldColor=child.getAttribute('color')||'';\n      const oldSize=child.getAttribute('size')||'';\n      for(const a of [...child.attributes])child.removeAttribute(a.name);",
  "      const oldStyle=child.getAttribute('style')||'';\n      const oldColor=child.getAttribute('color')||'';\n      const oldSize=child.getAttribute('size')||'';\n      const oldHref=child.tagName==='A'?(child.getAttribute('href')||''):'';\n      for(const a of [...child.attributes])child.removeAttribute(a.name);\n      if(child.tagName==='A'&&oldHref){try{const u=new URL(oldHref,location.href);if(u.protocol==='http:'||u.protocol==='https:'){child.setAttribute('href',u.href);child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer');}}catch{}}",
  'safe note link attributes'
);

`;
if(!loader.includes(marker)) throw new Error('v3.15 loader mismatch: import marker');
loader = loader.replace(marker, injection + marker);

const blob = new Blob([loader], { type: 'text/javascript' });
const blobUrl = URL.createObjectURL(blob);
try { await import(blobUrl); }
finally { setTimeout(()=>URL.revokeObjectURL(blobUrl),1000); }
