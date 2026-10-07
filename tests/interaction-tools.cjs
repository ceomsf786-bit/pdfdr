const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="teacher"><canvas width="1000" height="600"></canvas></div><div id="student"><canvas width="1000" height="600"></canvas></div>');
let now=10000,timerId=0,frameId=0;const timers=new Map(),frames=new Map(),draws=[];
dom.window.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return new Proxy({},{get:(_o,key)=> (...args)=>draws.push({canvas,op:key,args})});};
for(const canvas of dom.window.document.querySelectorAll('canvas')){canvas.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:600});canvas.setPointerCapture=()=>{};canvas.releasePointerCapture=()=>{};}
const ctx={window:dom.window,document:dom.window.document,console,Math,JSON,Map,Set,Number,String,Object,Array,Date:{now:()=>now},crypto:require('crypto').webcrypto,setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id)};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../snt-interaction-tools.js'),'utf8').replace(/^export /gm,''),ctx);
const tc=dom.window.document.querySelector('#teacher canvas'),sc=dom.window.document.querySelector('#student canvas');
let tool='select',scope='pdf:1',visible=true,selected=[],saves=0,remembers=0,originalHandlers=0,sent=[];
const objects=[{id:'rect',type:'rect',x1:.2,y1:.2,x2:.3,y2:.3},{id:'pen',type:'pen',points:[{x:.35,y:.22},{x:.38,y:.28}]},{id:'outside',type:'rect',x1:.8,y1:.8,x2:.9,y2:.9}];const placement={x:450,y:120,w:100,h:90};
const teacher={canvas:()=>tc,teacher:()=>true,enabled:()=>true,visible:()=>visible,documentId:()=> 'doc',surfaceKey:()=>scope,tool:()=>tool,channel:()=>({send:async packet=>{sent.push(packet);ctx.window.SNTInteractionTools.receiveLaser(packet.payload)}}),items:()=>[{id:'image:photo',placement,boardWidth:1000,boardHeight:600,bounds:{minx:placement.x/1000,maxx:(placement.x+placement.w)/1000,miny:placement.y/600,maxy:(placement.y+placement.h)/600}},...objects.map(o=>({id:'object:'+o.id,object:o,bounds:ctx.objectBounds(o,tc)}))],remember:()=>remembers++,changed:()=>{},save:()=>saves++,selection:items=>selected=Array.from(items,x=>x.id),status:()=>{}};
const student={...teacher,canvas:()=>sc,teacher:()=>false,surfaceKey:()=>scope,items:()=>[],selection:()=>{}};
ctx.installInteractionTools('teacher',teacher);ctx.installInteractionTools('student',student);tc.addEventListener('pointerdown',()=>originalHandlers++);
function event(type,x,y,extra={}){const e=new dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x*1000,clientY:y*600,button:0,...extra});Object.defineProperty(e,'pointerId',{value:1});tc.dispatchEvent(e);return e;}
function flushTimers(){const pending=[...timers];timers.clear();pending.forEach(([,fn])=>fn());}
function flushFrames(){const pending=[...frames];frames.clear();pending.forEach(([,fn])=>fn());}
function near(a,b){assert(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);}
event('pointerdown',.1,.1);event('pointermove',.6,.4);event('pointerup',.6,.4);
assert.deepEqual(selected.sort(),['image:photo','object:pen','object:rect'].sort());assert.equal(saves,0,'selecting does not save or draw');assert.equal(originalHandlers,0,'capture handler prevents old single-item handler');
event('pointerdown',.25,.25);event('pointermove',.35,.35);event('pointerup',.35,.35);near(objects[0].x1,.3);near(objects[1].points[0].x,.45);near(placement.x,550);near(placement.y,180);near(objects[2].x1,.8);assert.equal(saves,1);assert.equal(remembers,1,'one undo snapshot for whole move');
const gap=placement.x/1000-objects[0].x1;event('pointerdown',.35,.35);event('pointermove',.99,.99);event('pointerup',.99,.99);near(placement.x/1000-objects[0].x1,gap);near(placement.x+placement.w,1000);assert(objects[0].x1>=0&&objects[0].x2<=1);
// A new page discards the previous selection and any pending laser packet.
scope='pdf:2';ctx.window.SNTInteractionTools.refresh('teacher');assert.equal(selected.length,0);
const before=JSON.stringify({objects,placement}),savedBefore=saves;tool='laser';event('pointerdown',.2,.2);event('pointermove',.25,.25);event('pointermove',.3,.3);event('pointerup',.3,.3);flushTimers();assert(sent.length>0);assert.equal(sent.at(-1).event,'teacher-laser');assert.equal(sent.at(-1).payload.surface_key,'pdf:2');assert.equal(JSON.stringify({objects,placement}),before);assert.equal(saves,savedBefore,'laser never saves');
const studentOverlay=dom.window.document.querySelector('#student .snt-interaction-overlay');assert(draws.some(x=>x.canvas===studentOverlay&&x.op==='arc'),'student receives visible pointer');
const arcs=draws.filter(x=>x.canvas===studentOverlay&&x.op==='arc').length;ctx.window.SNTInteractionTools.receiveLaser(sent.at(-1).payload);assert.equal(draws.filter(x=>x.canvas===studentOverlay&&x.op==='arc').length,arcs,'duplicate channels do not duplicate laser');
ctx.window.SNTInteractionTools.receiveLaser({...sent.at(-1).payload,doc_id:'wrong'});ctx.window.SNTInteractionTools.receiveLaser({...sent.at(-1).payload,surface_key:'image-board:99'});assert.equal(draws.filter(x=>x.canvas===studentOverlay&&x.op==='arc').length,arcs,'wrong document/page ignored');
now+=2300;draws.length=0;flushFrames();assert(!draws.some(x=>x.op==='arc'),'trail disappears on both screens');assert(draws.some(x=>x.canvas===studentOverlay&&x.op==='clearRect'));assert.equal(frames.size,0,'animation stops after fade');
event('pointermove',.4,.4);scope='pdf:3';ctx.window.SNTInteractionTools.refresh('teacher');const previousSent=sent.length;flushTimers();assert.equal(sent.length,previousSent,'page switch drops stale pending points');
// The same geometry at a different zoom remains normalized.
tool='select';objects[0]={id:'rect',type:'rect',x1:.2,y1:.2,x2:.3,y2:.3};objects.splice(1);teacher.items=()=>objects.map(o=>({id:'object:'+o.id,object:o,bounds:ctx.objectBounds(o,tc)}));tc.getBoundingClientRect=()=>({left:0,top:0,width:500,height:300});
function zoomEvent(type,x,y){event(type,x/2,y/2);}
zoomEvent('pointerdown',.1,.1);zoomEvent('pointermove',.4,.4);zoomEvent('pointerup',.4,.4);assert.equal(selected.length,1);zoomEvent('pointerdown',.2,.2);zoomEvent('pointermove',.1,.1);zoomEvent('pointerup',.1,.1);near(objects[0].x1,.1);near(objects[0].y1,.1);near(objects[0].x2,.3);
visible=false;ctx.window.SNTInteractionTools.refresh('teacher');
console.log('Interactions: mixed image/drawing area selection, group movement/clamping, undo snapshot, resize at zoom, event interception, shared laser, fade expiry, duplicate filtering, page/document isolation and no laser persistence passed');
