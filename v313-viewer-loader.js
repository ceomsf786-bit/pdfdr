// SNT PDF Annotator v3.13
// Loads the stable viewer core and applies the small shape-editing upgrade at runtime.
// This keeps the proven viewer core intact while adding fill + resize behavior.

const coreUrl = new URL('./viewer.js', location.href);
const configUrl = new URL('./config.js', location.href).href;
const response = await fetch(coreUrl, { cache: 'no-store' });
if (!response.ok) throw new Error('Could not load viewer core.');
let src = await response.text();

function replaceOnce(oldText, newText, label){
  const pos = src.indexOf(oldText);
  if(pos < 0) throw new Error(`Viewer upgrade mismatch: ${label}`);
  src = src.slice(0,pos) + newText + src.slice(pos + oldText.length);
}

replaceOnce(
  "import { CONFIG } from './config.js';",
  `import { CONFIG } from '${configUrl}';`,
  'config import'
);

replaceOnce(
  "toolRail:$('toolRail'), toolButtons:[...document.querySelectorAll('[data-tool]')], widthInput:$('widthInput'), colorInput:$('colorInput'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelected:$('deleteSelected'),",
  "toolRail:$('toolRail'), toolButtons:[...document.querySelectorAll('[data-tool]')], widthInput:$('widthInput'), colorInput:$('colorInput'), shapeFillToggle:$('shapeFillToggle'), shapeFillColor:$('shapeFillColor'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelected:$('deleteSelected'),",
  'shape fill elements'
);

replaceOnce(
`function curColor(){ return els.colorInput?.value||'#1f2937'; }
function curWidth(){ return Number(els.widthInput?.value||4); }
function norm(evt,canvas){ const r=canvas.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))}; }
function objectPoints(o){ if(o.type==='pen'||o.type==='highlighter') return o.points||[]; if(o.type==='text') return [{x:o.x,y:o.y}]; return [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]; }`,
`function curColor(){ return els.colorInput?.value||'#1f2937'; }
function curWidth(){ return Number(els.widthInput?.value||4); }
function curFill(){ return !!els.shapeFillToggle?.checked; }
function curFillColor(){ return els.shapeFillColor?.value||curColor(); }
function norm(evt,canvas){ const r=canvas.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))}; }
function objectPoints(o){ if(o.type==='pen'||o.type==='highlighter') return o.points||[]; if(o.type==='text') return [{x:o.x,y:o.y}]; return [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]; }
function objectBounds(o){
  const pts=objectPoints(o);if(!pts.length)return null;
  const xs=pts.map(p=>Number(p.x)||0),ys=pts.map(p=>Number(p.y)||0);
  return {minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)};
}
function resizeHandles(o){
  if(!o)return [];
  if(o.type==='line'||o.type==='arrow')return [{name:'p1',x:o.x1,y:o.y1},{name:'p2',x:o.x2,y:o.y2}];
  if(o.type!=='rect'&&o.type!=='ellipse')return [];
  const b=objectBounds(o);if(!b)return [];
  return [{name:'nw',x:b.minx,y:b.miny},{name:'ne',x:b.maxx,y:b.miny},{name:'sw',x:b.minx,y:b.maxy},{name:'se',x:b.maxx,y:b.maxy}];
}
function resizeHandleAt(o,p,canvas){
  const r=canvas.getBoundingClientRect(),tol=Math.max(.012,10/Math.max(1,Math.min(r.width,r.height)));
  return resizeHandles(o).find(h=>Math.hypot(p.x-h.x,p.y-h.y)<=tol)||null;
}
function resizeObject(o,handle,p){
  const clamp=v=>Math.max(0,Math.min(1,v));
  if(o.type==='line'||o.type==='arrow'){
    if(handle==='p1'){o.x1=clamp(p.x);o.y1=clamp(p.y);}else{o.x2=clamp(p.x);o.y2=clamp(p.y);}return;
  }
  if(o.type!=='rect'&&o.type!=='ellipse')return;
  const b=objectBounds(o);if(!b)return;
  let left=b.minx,right=b.maxx,top=b.miny,bottom=b.maxy;
  if(handle.includes('w'))left=clamp(Math.min(p.x,right-.005));
  if(handle.includes('e'))right=clamp(Math.max(p.x,left+.005));
  if(handle.includes('n'))top=clamp(Math.min(p.y,bottom-.005));
  if(handle.includes('s'))bottom=clamp(Math.max(p.y,top+.005));
  o.x1=left;o.y1=top;o.x2=right;o.y2=bottom;
}`,
  'shape helpers'
);

const drawStart = src.indexOf('function drawObject(ctx,o,canvas,selected=false){');
const drawEnd = src.indexOf('\nfunction drawOverlay()', drawStart);
if(drawStart < 0 || drawEnd < 0) throw new Error('Viewer upgrade mismatch: drawing function');
src = src.slice(0,drawStart) + `function drawObject(ctx,o,canvas,selected=false){
  const w=canvas.width,h=canvas.height,ratio=strokeRatio(canvas),X=x=>x*w,Y=y=>y*h;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color||'#1f2937';ctx.fillStyle=o.color||'#1f2937';ctx.lineWidth=Math.max(1,(o.width||4)*ratio);ctx.globalAlpha=o.type==='highlighter'?.28:1;
  if(o.type==='pen'||o.type==='highlighter'){ const pts=o.points||[];if(pts.length){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.stroke();} }
  else if(o.type==='text'){ctx.globalAlpha=1;ctx.font=\`\${Math.max(14,(o.fontSize||18)*ratio)}px system-ui,sans-serif\`;ctx.fillText(o.text||'',X(o.x),Y(o.y));}
  else if(o.type==='line'||o.type==='arrow'){
    ctx.beginPath();ctx.moveTo(X(o.x1),Y(o.y1));ctx.lineTo(X(o.x2),Y(o.y2));ctx.stroke();
    if(o.type==='arrow'){const ang=Math.atan2(Y(o.y2)-Y(o.y1),X(o.x2)-X(o.x1)),len=12*ratio;ctx.beginPath();ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang-Math.PI/6),Y(o.y2)-len*Math.sin(ang-Math.PI/6));ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang+Math.PI/6),Y(o.y2)-len*Math.sin(ang+Math.PI/6));ctx.stroke();}
  }
  else if(o.type==='rect'){
    const x=X(Math.min(o.x1,o.x2)),y=Y(Math.min(o.y1,o.y2)),rw=Math.abs(o.x2-o.x1)*w,rh=Math.abs(o.y2-o.y1)*h;
    if(o.fill){ctx.save();ctx.globalAlpha=Number(o.fillOpacity??.22);ctx.fillStyle=o.fillColor||o.color||'#1f2937';ctx.fillRect(x,y,rw,rh);ctx.restore();}ctx.strokeRect(x,y,rw,rh);
  }
  else if(o.type==='ellipse'){
    ctx.beginPath();ctx.ellipse(X((o.x1+o.x2)/2),Y((o.y1+o.y2)/2),Math.abs(o.x2-o.x1)*w/2,Math.abs(o.y2-o.y1)*h/2,0,0,Math.PI*2);if(o.fill){ctx.save();ctx.globalAlpha=Number(o.fillOpacity??.22);ctx.fillStyle=o.fillColor||o.color||'#1f2937';ctx.fill();ctx.restore();}ctx.stroke();
  }
  if(selected){
    ctx.globalAlpha=1;ctx.setLineDash([6*ratio,5*ratio]);ctx.strokeStyle='#147a5a';ctx.lineWidth=2*ratio;const b=objectBounds(o);
    if(b){ctx.strokeRect(X(b.minx)-6*ratio,Y(b.miny)-6*ratio,Math.max(12*ratio,X(b.maxx-b.minx)+12*ratio),Math.max(12*ratio,Y(b.maxy-b.miny)+12*ratio));}
    ctx.setLineDash([]);for(const hnd of resizeHandles(o)){const sz=5*ratio;ctx.fillStyle='#ffffff';ctx.strokeStyle='#147a5a';ctx.lineWidth=2*ratio;ctx.fillRect(X(hnd.x)-sz,Y(hnd.y)-sz,sz*2,sz*2);ctx.strokeRect(X(hnd.x)-sz,Y(hnd.y)-sz,sz*2,sz*2);}
  }
  ctx.restore();
}` + src.slice(drawEnd);

replaceOnce(
`  if(state.tool==='select'){
    const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;drawOverlay();
    if(hit){remember();state.pointer={id:hit.id,last:p,kind:'move',surface:'pdf'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);}return;
  }`,
`  if(state.tool==='select'){
    const already=state.pageObjects.find(x=>x.id===state.selectedId),handle=already?resizeHandleAt(already,p,els.overlayCanvas):null;
    if(already&&handle){remember();state.pointer={id:already.id,last:p,kind:'resize',handle:handle.name,surface:'pdf'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);return;}
    const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;drawOverlay();
    if(hit){remember();state.pointer={id:hit.id,last:p,kind:'move',surface:'pdf'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);}return;
  }`,
  'select resize'
);

replaceOnce(
"  let o;if(state.tool==='pen'||state.tool==='highlighter')o={id:uuid(),type:state.tool,points:[p],color:curColor(),width:curWidth()};else o={id:uuid(),type:state.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:curColor(),width:curWidth()};",
"  let o;if(state.tool==='pen'||state.tool==='highlighter')o={id:uuid(),type:state.tool,points:[p],color:curColor(),width:curWidth()};else o={id:uuid(),type:state.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:curColor(),width:curWidth(),fill:(state.tool==='rect'||state.tool==='ellipse')?curFill():false,fillColor:curFillColor(),fillOpacity:.22};",
  'new shape fill'
);

replaceOnce(
"  if(state.pointer.kind==='move'){const dx=p.x-state.pointer.last.x,dy=p.y-state.pointer.last.y;translateObject(o,dx,dy);state.pointer.last=p;scheduleOverlayRedraw();return;}\n  if(o.type==='pen'||o.type==='highlighter'){",
"  if(state.pointer.kind==='move'){const dx=p.x-state.pointer.last.x,dy=p.y-state.pointer.last.y;translateObject(o,dx,dy);state.pointer.last=p;scheduleOverlayRedraw();return;}\n  if(state.pointer.kind==='resize'){resizeObject(o,state.pointer.handle,p);scheduleOverlayRedraw();return;}\n  if(o.type==='pen'||o.type==='highlighter'){",
  'pointer resize'
);

replaceOnce(
'function bindTeacher(){\n  els.toolButtons.forEach(b=>b.addEventListener(\'click\',()=>setTool(b.dataset.tool)));',
`function applyShapeFillToSelection(){
  if(!TEACHER||!state.selectedId)return;const o=state.pageObjects.find(x=>x.id===state.selectedId);if(!o||(o.type!=='rect'&&o.type!=='ellipse'))return;
  remember();o.fill=curFill();o.fillColor=curFillColor();o.fillOpacity=.22;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.shapeFillToggle?.addEventListener('change',applyShapeFillToSelection);
  els.shapeFillColor?.addEventListener('input',applyShapeFillToSelection);`,
  'fill listeners'
);

replaceOnce(
`        else if(o.type==='rect')page.drawRectangle({x:X(Math.min(o.x1,o.x2)),y:Y(Math.max(o.y1,o.y2)),width:Math.abs(o.x2-o.x1)*width,height:Math.abs(o.y2-o.y1)*height,borderColor:color,borderWidth:th,opacity:0});
        else if(o.type==='ellipse')page.drawEllipse({x:X((o.x1+o.x2)/2),y:Y((o.y1+o.y2)/2),xScale:Math.abs(o.x2-o.x1)*width/2,yScale:Math.abs(o.y2-o.y1)*height/2,borderColor:color,borderWidth:th});`,
`        else if(o.type==='rect'){const fillColor=hex(o.fillColor||o.color);page.drawRectangle({x:X(Math.min(o.x1,o.x2)),y:Y(Math.max(o.y1,o.y2)),width:Math.abs(o.x2-o.x1)*width,height:Math.abs(o.y2-o.y1)*height,borderColor:color,borderWidth:th,color:fillColor,opacity:o.fill?Number(o.fillOpacity??.22):0,borderOpacity:1});}
        else if(o.type==='ellipse'){const fillColor=hex(o.fillColor||o.color);page.drawEllipse({x:X((o.x1+o.x2)/2),y:Y((o.y1+o.y2)/2),xScale:Math.abs(o.x2-o.x1)*width/2,yScale:Math.abs(o.y2-o.y1)*height/2,borderColor:color,borderWidth:th,color:fillColor,opacity:o.fill?Number(o.fillOpacity??.22):0,borderOpacity:1});}`,
  'PDF export fill'
);

const blob = new Blob([src], {type:'text/javascript'});
const blobUrl = URL.createObjectURL(blob);
try { await import(blobUrl); }
finally { setTimeout(()=>URL.revokeObjectURL(blobUrl),1000); }
