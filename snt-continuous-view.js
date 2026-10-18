import {installInteractionTools} from './snt-interaction-tools.js';
// Optional reading surface. Existing single-page editors remain the editing surface.
export function createContinuousView(adapter){
 const root=document.createElement('section');root.className='continuous-reading-scroller';root.tabIndex=0;root.setAttribute('aria-label','Continuous pages. Use Up and Down to scroll.');
 const stack=document.createElement('div');stack.className='continuous-reading-stack';root.append(stack);
 let rows=[],active=false,disposed=false,zoom=1,currentKey='',queue=Promise.resolve(),generation=0,scrollTimer=null,lastRemote='',refreshTimer=null,boardsPromise=null;
 const rect=()=>root.getBoundingClientRect();
 const enabled=()=>active&&adapter.enabled?.()!==false;
 function width(){return Math.max(240,Math.min(1000,root.clientWidth-28))*zoom;}
 function visible(row,margin=800){const a=row.el.getBoundingClientRect(),b=rect();return a.bottom>b.top-margin&&a.top<b.bottom+margin;}
 function position(){
  const row=rows.find(r=>r.item.key===currentKey);if(!row)return null;
  const a=row.slot.getBoundingClientRect(),b=rect();
  return {item:row.item,index:rows.indexOf(row),centerY:Math.max(0,Math.min(1,(b.top+root.clientHeight/2-a.top)/Math.max(1,a.height)))};
 }
 function updatePosition(){
  if(!active||!rows.length)return;
  const b=rect(),target=b.top+Math.min(root.clientHeight*.3,180);
  const row=(root.scrollHeight>root.clientHeight&&root.scrollTop+root.clientHeight>=root.scrollHeight-2?rows.at(-1):null)||rows.find(r=>{const a=r.el.getBoundingClientRect();return a.top<=target&&a.bottom>target;})||rows.find(r=>r.el.getBoundingClientRect().bottom>b.top)||rows.at(-1);
  currentKey=row.item.key;adapter.position?.(position());
 }
 function clearRow(row){
  row.version++;row.transient?.dispose();row.transient=null;row.task?.cancel();row.task=null;row.ready=false;
  for(const c of row.slot.querySelectorAll('canvas')){c.width=0;c.height=0;}
  row.slot.replaceChildren();
 }
 async function image(url){
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('An inserted image could not be shown.'));img.src=url;});return img;
 }
 async function renderImageBoard(row,canvas,version){
  if(!boardsPromise)boardsPromise=adapter.api('image-boards').catch(error=>{boardsPromise=null;throw error;});
  const data=await boardsPromise,board=(data.boards||[]).find(b=>Number(b.board_no)===Number(row.item.source_image_board_no));
  if(!board)throw new Error('This image page is no longer available.');
  const w=Number(board.canvas_width||1600),h=Number(board.canvas_height||1000),scale=Math.min(width()/w,1.5,Math.sqrt(2200000/(w*h)));
  row.slot.style.aspectRatio=w+'/'+h;canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const images=(await adapter.api('images',{board:board.board_no})).images||[];
  for(let i=0;i<images.length;i++){
   if(!active||row.version!==version)return;
   const entry=images[i],p=board.placements?.[entry.id]||{x:40+i%3*360,y:40+Math.floor(i/3)*280,w:320,h:220};
   const blob=await adapter.imageBlob(entry.id),url=URL.createObjectURL(blob);
   try{
    const img=await image(url),fit=Math.min(p.w/img.naturalWidth,p.h/img.naturalHeight),dw=img.naturalWidth*fit,dh=img.naturalHeight*fit;
    ctx.fillStyle='#fff';ctx.fillRect(p.x*scale,p.y*scale,p.w*scale,p.h*scale);ctx.drawImage(img,(p.x+(p.w-dw)/2)*scale,(p.y+(p.h-dh)/2)*scale,dw*scale,dh*scale);
   }finally{URL.revokeObjectURL(url);}
  }
  const proxy={width:canvas.width,height:canvas.height,getBoundingClientRect:()=>({width:w,height:h})};
  for(const object of board.objects||[])adapter.drawObject(ctx,object,proxy,false);
 }
 async function renderRow(row){
  if(!enabled()||row.generation!==generation||row.ready||row.busy||row.item.kind==='note'||!visible(row))return;
  row.busy=true;const version=row.version,canvas=document.createElement('canvas');
  try{
   if(row.item.kind==='pdf'){
    const page=await adapter.pdfPage(row.item.pdfPage);if(!active||row.version!==version)return;
    const base=page.getViewport({scale:1}),scale=Math.min(width()/base.width*(Math.min(window.devicePixelRatio||1,1.5)),Math.sqrt(2200000/(base.width*base.height)));
    const viewport=page.getViewport({scale});row.slot.style.aspectRatio=base.width+'/'+base.height;canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
    row.slot.replaceChildren(canvas);row.task=page.render({canvasContext:canvas.getContext('2d'),viewport});await row.task.promise;row.task=null;page.cleanup?.();
    if(!active||row.version!==version)return;
    const overlay=document.createElement('canvas');overlay.className='continuous-page-annotations';overlay.width=canvas.width;overlay.height=canvas.height;row.slot.append(overlay);
    const data=await adapter.pageObjects(row.item.pdfPage);if(!active||row.version!==version)return;
    for(const object of data)adapter.drawObject(overlay.getContext('2d'),object,overlay,false);
   }else{
    await renderImageBoard(row,canvas,version);if(!active||row.version!==version)return;row.slot.replaceChildren(canvas);
   }
   if(active&&row.version===version){
    row.ready=true;
    row.transient=installInteractionTools('reading:'+adapter.documentId+':'+row.item.key,{
     canvas:()=>canvas,teacher:()=>false,enabled:()=>false,visible:()=>enabled()&&row.ready&&visible(row,0),
     documentId:()=>adapter.documentId,surfaceKey:()=>row.item.kind==='pdf'?'pdf:'+row.item.pdfPage:'image-board:'+row.item.source_image_board_no,
     items:()=>[],channel:()=>null
    });
   }
  }catch(error){
   if(!active||row.version!==version||error?.name==='RenderingCancelledException')return;
   row.slot.replaceChildren();const message=document.createElement('p');message.className='continuous-page-error';message.textContent=error.message||'Could not load this page.';
   const retry=document.createElement('button');retry.className='btn compact';retry.textContent='Retry page';retry.onclick=()=>{row.slot.replaceChildren();enqueue(row);};row.slot.append(message,retry);
  }finally{row.busy=false;row.task=null;if(!active||row.version!==version){canvas.width=0;canvas.height=0;}}
 }
 function enqueue(row){queue=queue.then(()=>renderRow(row)).catch(error=>adapter.status?.(error.message));return queue;}
 function scan(){
  if(!enabled())return;
  for(const row of rows){
   if(visible(row))enqueue(row);
   else if(row.item.kind!=='note'&&(row.ready||row.busy)&&!visible(row,2200))clearRow(row);
  }
  updatePosition();
 }
 function build(sequence){
  generation++;for(const row of rows)clearRow(row);rows=[];stack.replaceChildren();boardsPromise=null;
  for(const item of sequence){
   const el=document.createElement('article');el.className='continuous-reading-page';el.dataset.key=item.key;
   const heading=document.createElement('header'),label=document.createElement('strong');label.textContent='Page '+item.displayNumber+(item.kind==='pdf'?'':' · '+(item.title||'Added page'));heading.append(label);
   const open=document.createElement('button');open.type='button';open.className='btn compact';open.textContent=adapter.teacher?'Edit page':'Single page';open.onclick=()=>Promise.resolve(adapter.openSingle(item.key)).catch(error=>adapter.status?.(error.message));heading.append(open);
   const slot=document.createElement('div');slot.className='continuous-page-slot';
   if(item.kind==='note'){slot.classList.add('continuous-note-content');adapter.noteHtml(slot,item.text_content||'');}
   else slot.style.aspectRatio=item.kind==='image'?'1.6':'0.707';
   el.append(heading,slot);stack.append(el);rows.push({el,slot,item:{...item},version:0,generation,ready:false,busy:false,task:null});
  }
  stack.style.setProperty('--reading-width',width()+'px');
 }
 function goTo(key,center=null){
  const row=rows.find(r=>r.item.key===key);if(!row)return;
  currentKey=key;
  const offset=row.el.getBoundingClientRect().top-rect().top+root.scrollTop;
  const extra=center===null?0:Math.max(0,center*row.slot.getBoundingClientRect().height-root.clientHeight/2);
  root.scrollTop=Math.max(0,offset+extra);scan();
 }
 function follow(key,center){const mark=key+':'+Math.round((center||0)*25);if(mark===lastRemote)return;lastRemote=mark;goTo(key,center);}
 function setZoom(value){
  const key=currentKey;zoom=Math.max(.4,Math.min(2.5,value));stack.style.setProperty('--reading-width',width()+'px');
  for(const row of rows)if(row.item.kind!=='note')clearRow(row);
  goTo(key);scan();
 }
 function refresh(sequence,force=false){
  if(!active)return;
  if(sequence.map(x=>x.key).join('|')!==rows.map(x=>x.item.key).join('|')){const key=currentKey;build(sequence);goTo(key);return;}
  for(let i=0;i<rows.length;i++){
   const row=rows[i],item=sequence[i];
   if(row.item.title!==item.title||row.item.displayNumber!==item.displayNumber)row.el.querySelector('strong').textContent='Page '+item.displayNumber+(item.kind==='pdf'?'':' · '+(item.title||'Added page'));
   if(item.kind==='note'&&row.item.text_content!==item.text_content)adapter.noteHtml(row.slot,item.text_content||'');
   if(force&&item.kind!=='note'&&row.ready)clearRow(row);
   row.item={...item};
  }
  if(force)boardsPromise=null;scan();
 }
 function keydown(e){
  if(!enabled()||e.ctrlKey||e.metaKey||e.altKey||adapter.modalOpen?.())return;
  const target=document.activeElement;
  if(target?.closest?.('input,textarea,select,[contenteditable="true"],dialog[open]'))return;
  const step={ArrowDown:85,ArrowUp:-85,PageDown:root.clientHeight*.85,PageUp:-root.clientHeight*.85}[e.key];
  if(step===undefined)return;e.preventDefault();e.stopImmediatePropagation();root.scrollBy({top:step,behavior:'auto'});
 }
 const scroll=()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(scan,65);};
 const resize=()=>{if(active)setZoom(zoom);};
 root.addEventListener('scroll',scroll,{passive:true});document.addEventListener('keydown',keydown,true);window.addEventListener('resize',resize);
 const controller={root,get active(){return active;},get currentKey(){return currentKey;},position,goTo,follow,refresh,setZoom,zoomBy:delta=>setZoom(zoom+delta),
  async start(sequence,key){if(disposed)throw new Error('This reading view is closed.');active=true;adapter.parent.append(root);build(sequence);goTo(key||sequence[0]?.key);root.focus({preventScroll:true});refreshTimer=setInterval(()=>adapter.refresh?.(),5000);scan();},
  close(){if(disposed)return;disposed=true;active=false;generation++;clearInterval(refreshTimer);clearTimeout(scrollTimer);for(const row of rows)clearRow(row);rows=[];root.remove();document.removeEventListener('keydown',keydown,true);window.removeEventListener('resize',resize);},
  whenIdle:()=>queue
 };
 return controller;
}
