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

// Add the new opacity controls to the element map that v3.13 injects.
mustReplace(
  "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), undoBtn:$('undoBtn')",
  "shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), shapeFillOpacity:$('shapeFillOpacity'), shapeFillOpacityValue:$('shapeFillOpacityValue'), undoBtn:$('undoBtn')",
  'opacity elements'
);

// Give new/selected filled shapes the exact opacity chosen by the teacher.
mustReplace(
  "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }",
  "function curFillColor(){ return els.shapeFillColor?.value||curColor(); }\nfunction curFillOpacity(){ const n=Number(els.shapeFillOpacity?.value??100); return Math.max(0,Math.min(1,n/100)); }",
  'opacity helper'
);
loader = loader.replaceAll('fillOpacity:.22', 'fillOpacity:curFillOpacity()');
loader = loader.replaceAll('o.fillOpacity??.22', 'o.fillOpacity??curFillOpacity()');
loader = loader.replaceAll('o.fillOpacity=.22', 'o.fillOpacity=curFillOpacity()');

mustReplace(
  "  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);",
  "  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);\n  els.shapeFillOpacity?.addEventListener('input',()=>{if(els.shapeFillOpacityValue)els.shapeFillOpacityValue.textContent=`${els.shapeFillOpacity.value}%`;applyShapeFillToSelection();});",
  'opacity listener'
);

// Insert extra patches into the v3.13 loader before it imports its generated viewer module.
const marker = "const blob = new Blob([src], {type:'text/javascript'});";
const injection = String.raw`
// v3.15: keep the left annotation toolbar fixed while only the PDF canvas scrolls.
replaceOnce(
  "    if(els.toolRail&&window.innerWidth>650)els.toolRail.style.transform=\`translateY(\${-els.pdfScroller.scrollTop}px)\`;",
  "    if(els.toolRail)els.toolRail.style.transform='translateY(0)';",
  'fixed tool rail'
);

// v3.15: preserve safe hyperlinks in rich board notes instead of stripping <a>.
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
