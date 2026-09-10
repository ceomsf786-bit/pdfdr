// SNT PDF Annotator v3.15 — image boards with teacher-controlled fill opacity.
const sourceUrl = new URL('./v312-imageboards.js', location.href);
const configUrl = new URL('./config.js', location.href).href;
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Could not load image boards.');
let src = await response.text();

function replaceRequired(oldText,newText,label){
  if(!src.includes(oldText)) throw new Error(`Image-board upgrade mismatch: ${label}`);
  src=src.replace(oldText,newText);
}

replaceRequired("import { CONFIG } from './config.js';",`import { CONFIG } from '${configUrl}';`,'config import');
replaceRequired(
  "function fillColor(){return $('shapeFillColor')?.value||strokeColor();}",
  "function fillColor(){return $('shapeFillColor')?.value||strokeColor();}\nfunction fillOpacity(){return clamp(Number($('shapeFillOpacity')?.value??100)/100,0,1);}\nfunction objectFillOpacity(o){const n=Number(o?.fillOpacity);if(Math.abs(n-.22)<.0001)return 1;return Number.isFinite(n)?clamp(n,0,1):fillOpacity();}",
  'opacity helper'
);

src=src.replaceAll('o.fillOpacity??.22','objectFillOpacity(o)');
src=src.replaceAll('fillOpacity:.22','fillOpacity:fillOpacity()');
src=src.replaceAll('o.fillOpacity=.22','o.fillOpacity=fillOpacity()');
replaceRequired(
  "$('shapeFillColor')?.addEventListener('input',applyFillToSelected);",
  "$('shapeFillColor')?.addEventListener('input',applyFillToSelected);$('shapeFillOpacity')?.addEventListener('input',applyFillToSelected);",
  'opacity listener'
);

const blob=new Blob([src],{type:'text/javascript'});
const blobUrl=URL.createObjectURL(blob);
try{await import(blobUrl);}finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);}
