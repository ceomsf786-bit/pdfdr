// Shared transient interaction layer. Selection and laser marks are never saved.
export const LASER_LIFETIME_MS = 2200;
const surfaces = new Map();
const clamp = v => Math.max(0, Math.min(1, v));
const copy = v => JSON.parse(JSON.stringify(v));

export function objectBounds(o, canvas) {
  let points = o.points || (o.type === 'text' ? [{x:o.x,y:o.y}] : [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]);
  points = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!points.length) return null;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const b = {minx:Math.min(...xs),maxx:Math.max(...xs),miny:Math.min(...ys),maxy:Math.max(...ys)};
  if (o.type === 'text') {
    const rect = canvas.getBoundingClientRect(), size = Math.max(14, o.fontSize || 18);
    b.maxx += String(o.text || '').length * size * .6 / Math.max(1, rect.width);
    b.miny -= size / Math.max(1, rect.height);
  }
  return Object.fromEntries(Object.entries(b).map(([k,v]) => [k,clamp(v)]));
}
export function enclosed(b, area) {
  const e = .002;
  return b && b.minx >= area.minx-e && b.maxx <= area.maxx+e && b.miny >= area.miny-e && b.maxy <= area.maxy+e;
}
export function groupBounds(items) {
  if (!items.length) return null;
  return {minx:Math.min(...items.map(i=>i.bounds.minx)),maxx:Math.max(...items.map(i=>i.bounds.maxx)),miny:Math.min(...items.map(i=>i.bounds.miny)),maxy:Math.max(...items.map(i=>i.bounds.maxy))};
}
export function moveGroup(items, dx, dy) {
  const b = groupBounds(items); if (!b) return;
  // Clamp once for the whole group, keeping distances between items unchanged.
  dx = Math.max(-b.minx,Math.min(1-b.maxx,dx));
  dy = Math.max(-b.miny,Math.min(1-b.maxy,dy));
  for (const item of items) {
    if (item.placement) { item.placement.x += dx*item.boardWidth; item.placement.y += dy*item.boardHeight; }
    else {
      const o = item.object;
      if (o.points) o.points = o.points.map(p=>({...p,x:p.x+dx,y:p.y+dy}));
      for (const k of ['x','x1','x2']) if (typeof o[k] === 'number') o[k] += dx;
      for (const k of ['y','y1','y2']) if (typeof o[k] === 'number') o[k] += dy;
    }
  }
}
function inBounds(p,b) { return b && p.x>=b.minx-.008 && p.x<=b.maxx+.008 && p.y>=b.miny-.008 && p.y<=b.maxy+.008; }
function area(a,b) { return {minx:Math.min(a.x,b.x),maxx:Math.max(a.x,b.x),miny:Math.min(a.y,b.y),maxy:Math.max(a.y,b.y)}; }

export function installInteractionTools(name, adapter) {
  const canvas = adapter.canvas(); if (!canvas) return;
  if (surfaces.get(name)?.canvas === canvas) return surfaces.get(name);
  surfaces.get(name)?.dispose();
  const overlay = document.createElement('canvas');
  overlay.className = 'snt-interaction-overlay'; overlay.setAttribute('aria-hidden','true');
  canvas.parentElement.appendChild(overlay);
  let selected = new Set(), scope = '', pointer = null, marquee = null;
  let laser = [], pending = [], pendingStroke = '', timer = null, frame = null, sequence = 0, remoteSequences = new Map();
  const sender = globalThis.crypto?.randomUUID?.() || String(Math.random());
  let stroke = sender+':0', strokeNumber = 0;
  const scopeKey = () => String(adapter.documentId()||'') + '/' + adapter.surfaceKey();
  const items = () => adapter.items().filter(i=>i.bounds);
  const selectedItems = () => items().filter(i=>selected.has(i.id));
  function resetScope() {
    const key = scopeKey();
    if (scope !== key) { scope=key; selected.clear(); pointer=null; marquee=null; laser=[];remoteSequences.clear();pending=[];clearTimeout(timer);timer=null;adapter.selection?.([]); }
  }
  function select(ids) { selected = new Set(ids); adapter.selection?.(selectedItems()); render(); }
  function point(e) {
    const r=canvas.getBoundingClientRect();
    return {x:clamp((e.clientX-r.left)/Math.max(1,r.width)),y:clamp((e.clientY-r.top)/Math.max(1,r.height))};
  }
  function render() {
    resetScope();
    if (!adapter.visible()) { laser=[]; overlay.getContext('2d').clearRect(0,0,overlay.width,overlay.height); return; }
    if (overlay.width!==canvas.width) overlay.width=canvas.width;
    if (overlay.height!==canvas.height) overlay.height=canvas.height;
    overlay.style.width=canvas.style.width||'100%'; overlay.style.height=canvas.style.height||'100%';
    const ctx=overlay.getContext('2d'), w=overlay.width, h=overlay.height;
    ctx.clearRect(0,0,w,h);
    const ratio=w/Math.max(1,canvas.getBoundingClientRect().width);
    if (adapter.teacher()) {
      const list=selectedItems(); selected=new Set(list.map(i=>i.id));
      const boxes=list.map(i=>i.bounds); if (list.length>1) boxes.push(groupBounds(list)); if(marquee)boxes.push(marquee);
      ctx.save();ctx.strokeStyle='#147a5a';ctx.fillStyle='rgba(20,122,90,.08)';ctx.lineWidth=2*ratio;ctx.setLineDash([6*ratio,4*ratio]);
      for(const b of boxes){ctx.strokeRect(b.minx*w,b.miny*h,Math.max(3*ratio,(b.maxx-b.minx)*w),Math.max(3*ratio,(b.maxy-b.miny)*h));}
      if(marquee)ctx.fillRect(marquee.minx*w,marquee.miny*h,(marquee.maxx-marquee.minx)*w,(marquee.maxy-marquee.miny)*h);
      ctx.restore();
    }
    const now=Date.now(); laser=laser.filter(p=>now-p.at<LASER_LIFETIME_MS);
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#ff234b';ctx.fillStyle='#ff234b';ctx.shadowColor='#ff234b';ctx.shadowBlur=8*ratio;
    for(let i=0;i<laser.length;i++){
      const p=laser[i], prev=laser[i-1];ctx.globalAlpha=Math.max(0,1-(now-p.at)/LASER_LIFETIME_MS);ctx.lineWidth=4*ratio;
      if(prev&&prev.stroke===p.stroke){ctx.beginPath();ctx.moveTo(prev.x*w,prev.y*h);ctx.lineTo(p.x*w,p.y*h);ctx.stroke();}
    }
    const last=laser.at(-1);
    if(last){ctx.globalAlpha=Math.max(0,1-(now-last.at)/LASER_LIFETIME_MS);ctx.beginPath();ctx.arc(last.x*w,last.y*h,5*ratio,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    if(laser.length&&frame===null)frame=requestAnimationFrame(()=>{frame=null;render();});
  }
  function flushLaser() {
    clearTimeout(timer);timer=null; if(!pending.length)return;
    const payload={doc_id:adapter.documentId(),surface_key:adapter.surfaceKey(),stroke:pendingStroke,seq:++sequence,points:pending.splice(0,32)};
    const channel=adapter.channel(); if(channel)channel.send({type:'broadcast',event:'teacher-laser',payload}).catch(()=>{});
    pending=[];
  }
  function addLaser(p) {
    resetScope();const prev=laser.at(-1);
    if(prev&&prev.stroke===stroke&&Math.hypot(p.x-prev.x,p.y-prev.y)<.001)return;
    if(pending.length&&pendingStroke!==stroke)flushLaser();pendingStroke=stroke;
    laser.push({...p,at:Date.now(),stroke});laser=laser.slice(-180);pending.push(p);pending=pending.slice(-32);
    if(timer===null)timer=setTimeout(flushLaser,40); render();
  }
  function resizeHandle(item,p) {
    const o=item?.object; if(!o)return null;
    let handles=[];
    if(['line','arrow'].includes(o.type))handles=[{name:'p1',x:o.x1,y:o.y1},{name:'p2',x:o.x2,y:o.y2}];
    if(['rect','ellipse'].includes(o.type)){const b=item.bounds;handles=[{name:'nw',x:b.minx,y:b.miny},{name:'ne',x:b.maxx,y:b.miny},{name:'sw',x:b.minx,y:b.maxy},{name:'se',x:b.maxx,y:b.maxy}];}
    const r=canvas.getBoundingClientRect();return handles.find(h=>Math.hypot((h.x-p.x)*r.width,(h.y-p.y)*r.height)<10)?.name||null;
  }
  function stop(e) { e.preventDefault();e.stopImmediatePropagation(); }
  function down(e) {
    resetScope(); if(!adapter.teacher()||!adapter.visible()||!adapter.enabled())return;
    const tool=adapter.tool();if(!['select','laser'].includes(tool)||e.button>0)return;
    stop(e);const p=point(e);canvas.setPointerCapture?.(e.pointerId);
    if(tool==='laser'){stroke=sender+':'+(++strokeNumber);pointer={kind:'laser',id:e.pointerId};addLaser(p);return;}
    const list=items(), old=selectedItems(), one=old.length===1?old[0]:null, handle=resizeHandle(one,p);
    if(handle&&!e.shiftKey){adapter.remember();pointer={kind:'resize',id:e.pointerId,item:one,handle,original:copy(one.object)};return;}
    const objectHit=[...list].reverse().find(i=>i.object&&inBounds(p,i.bounds));
    const hit=objectHit||[...list].reverse().find(i=>inBounds(p,i.bounds));
    if(e.shiftKey&&hit){const ids=new Set(selected);ids.has(hit.id)?ids.delete(hit.id):ids.add(hit.id);select([...ids]);return;}
    if(hit&&selected.has(hit.id)||objectHit){
      if(!hit||!selected.has(hit.id))select([objectHit.id]);
      adapter.remember();pointer={kind:'move',id:e.pointerId,last:p};return;
    }
    pointer={kind:'marquee',id:e.pointerId,start:p,last:p,hit,original:e.shiftKey?[...selected]:[]};
    if(!e.shiftKey)select([]);marquee=area(p,p);render();
  }
  function move(e) {
    if(!adapter.teacher()||!adapter.visible()||!adapter.enabled())return;
    const tool=adapter.tool();
    if(tool==='laser'){stop(e);addLaser(point(e));return;}
    if(!pointer||pointer.id!==e.pointerId)return;
    stop(e);const p=point(e);
    if(pointer.kind==='marquee'){pointer.last=p;marquee=area(pointer.start,p);render();return;}
    if(pointer.kind==='move'){moveGroup(selectedItems(),p.x-pointer.last.x,p.y-pointer.last.y);pointer.last=p;adapter.changed();render();return;}
    if(pointer.kind==='resize'){
      const o=pointer.item.object,h=pointer.handle,b=objectBounds(pointer.original,canvas);
      if(h==='p1'){o.x1=p.x;o.y1=p.y;}else if(h==='p2'){o.x2=p.x;o.y2=p.y;}
      else{o.x1=h.includes('w')?Math.min(p.x,b.maxx-.005):b.minx;o.x2=h.includes('e')?Math.max(p.x,b.minx+.005):b.maxx;o.y1=h.includes('n')?Math.min(p.y,b.maxy-.005):b.miny;o.y2=h.includes('s')?Math.max(p.y,b.miny+.005):b.maxy;}
      adapter.changed();render();
    }
  }
  function up(e) {
    if(!pointer||pointer.id!==e.pointerId)return;stop(e);
    const was=pointer;pointer=null;
    if(was.kind==='marquee'){
      const r=canvas.getBoundingClientRect(), distance=Math.hypot((was.last.x-was.start.x)*r.width,(was.last.y-was.start.y)*r.height);
      const ids=distance<4?(was.hit?[was.hit.id]:[]):items().filter(i=>enclosed(i.bounds,marquee)).map(i=>i.id);
      marquee=null;select([...was.original,...ids]);adapter.status?.(selected.size+' items selected — drag a selected item to move them.');
    }else if(was.kind!=='laser'){adapter.changed();adapter.save();}
    canvas.releasePointerCapture?.(e.pointerId);render();
  }
  function leave() { if(!pointer)stroke=sender+':'+(++strokeNumber); }
  function receive(payload) {
    resetScope();
    if(adapter.teacher()||!adapter.visible()||payload?.doc_id!==adapter.documentId()||payload?.surface_key!==adapter.surfaceKey())return;
    if(typeof payload.stroke!=='string'||!Number.isFinite(payload.seq)||!Array.isArray(payload.points))return;
    if(payload.stroke.length>120||!Number.isSafeInteger(payload.seq)||payload.seq<1||payload.seq<=(remoteSequences.get(payload.stroke)||0))return;
    remoteSequences.set(payload.stroke,payload.seq);if(remoteSequences.size>16)remoteSequences.delete(remoteSequences.keys().next().value);
    const points=payload.points.slice(0,32).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
    laser.push(...points.map(p=>({x:p.x,y:p.y,at:Date.now(),stroke:payload.stroke})));laser=laser.slice(-180);render();
  }
  canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
  canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);canvas.addEventListener('pointerleave',leave);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(render):null;observer?.observe(canvas);
  const controller={canvas,receive,refresh:render,clearSelection(){select([]);},dispose(){
    canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true);canvas.removeEventListener('pointerleave',leave);
    observer?.disconnect();clearTimeout(timer);if(frame!==null)cancelAnimationFrame(frame);overlay.remove();
  }};
  surfaces.set(name,controller);render();return controller;
}
window.SNTInteractionTools={
  receiveLaser(payload){for(const s of surfaces.values())s.receive(payload);},
  refresh(name){surfaces.get(name)?.refresh();},
  clearSelection(name){surfaces.get(name)?.clearSelection();}
};
