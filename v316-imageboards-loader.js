// SNT PDF Annotator v3.16 — image-board styling
// Adds opacity and lets selected existing board shapes change colour/opacity.
// Falls back to the proven v3.14 image-board implementation if a patch
// signature no longer matches.

const sourceUrl = new URL('./v312-imageboards.js', location.href);
const configUrl = new URL('./config.js', location.href).href;
const response = await fetch(sourceUrl, { cache: 'no-store' });
if (!response.ok) {
  await import('./v314-imageboards.js');
} else {
  let src = await response.text();
  let ok = true;
  function patch(oldText,newText){if(!src.includes(oldText)){ok=false;return;}src=src.replace(oldText,newText);}

  patch("import { CONFIG } from './config.js';",`import { CONFIG } from '${configUrl}';`);
  patch(
    "function fillColor(){return $('shapeFillColor')?.value||strokeColor();}",
    "function fillColor(){return $('shapeFillColor')?.value||strokeColor();}\nfunction fillOpacity(){return clamp(Number($('shapeFillOpacity')?.value??100)/100,0,1);}"
  );

  src=src.replaceAll('o.fillOpacity??.22','o.fillOpacity??1');
  src=src.replaceAll('fillOpacity:.22','fillOpacity:fillOpacity()');
  src=src.replaceAll('o.fillOpacity=.22','o.fillOpacity=fillOpacity()');

  patch(
    "remember();o.fill=fillEnabled();o.fillColor=fillColor();o.fillOpacity=fillOpacity();drawOverlay();scheduleSave();",
    "remember();o.color=strokeColor();o.fill=fillEnabled();o.fillColor=fillColor();o.fillOpacity=fillOpacity();drawOverlay();scheduleSave();"
  );

  patch(
    "$('shapeFillColor')?.addEventListener('input',applyFillToSelected);",
    "$('shapeFillColor')?.addEventListener('input',applyFillToSelected);$('shapeFillOpacity')?.addEventListener('input',()=>{const v=$('shapeFillOpacityValue');if(v)v.textContent=$('shapeFillOpacity').value+'%';applyFillToSelected();});$('colorInput')?.addEventListener('input',applyFillToSelected);"
  );

  if(!ok){
    console.warn('v3.16 image-board patch mismatch; using stable v3.14.');
    await import('./v314-imageboards.js');
  }else{
    const blob=new Blob([src],{type:'text/javascript'}),blobUrl=URL.createObjectURL(blob);
    try{await import(blobUrl);}catch(e){console.error('v3.16 image boards failed; using v3.14',e);await import('./v314-imageboards.js');}
    finally{setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);}
  }
}
