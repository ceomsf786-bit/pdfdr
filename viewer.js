import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const pdfjsLib = window.pdfjsLib;
if (!pdfjsLib) throw new Error('PDF.js failed to load.');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const MODE = document.body.dataset.mode || 'student';
const TEACHER = MODE === 'teacher';
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

const els = {
  loading:$('loading'), error:$('error'), workspace:$('workspace'), docTitle:$('docTitle'), contextText:$('contextText'),
  pdfScroller:$('pdfScroller'), canvasWrap:$('canvasWrap'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'),
  prevPage:$('prevPage'), nextPage:$('nextPage'), pageInput:$('pageInput'), pageCount:$('pageCount'), zoomOut:$('zoomOut'), zoomIn:$('zoomIn'), fitPage:$('fitPage'),
  boardPanel:$('boardPanel'), toggleBoard:$('toggleBoard'), boardText:$('boardText'), boardLabel:$('boardLabel'), boardScopeLabel:$('boardScopeLabel'), boardTitleInput:$('boardTitleInput'), boardTitleDisplay:$('boardTitleDisplay'),
  permanentNotesSection:$('permanentNotesSection'), permanentTitle:$('permanentTitle'), permanentText:$('permanentText'), pageNotesSection:$('pageNotesSection'), pageNotesBadge:$('pageNotesBadge'), pageNotesList:$('pageNotesList'), studentImageTitle:$('studentImageTitle'),
  boardPrev:$('boardPrev'), boardNext:$('boardNext'), boardAdd:$('boardAdd'), boardDelete:$('boardDelete'),
  imageSection:$('imageSection'), imageStage:$('imageStage'), boardImage:$('boardImage'), imageCounter:$('imageCounter'), imagePrev:$('imagePrev'), imageNext:$('imageNext'), imageZoomOut:$('imageZoomOut'), imageZoomReset:$('imageZoomReset'), imageZoomIn:$('imageZoomIn'), pasteImageBtn:$('pasteImageBtn'), deleteImageBtn:$('deleteImageBtn'), imageFileInput:$('imageFileInput'),
  statusText:$('statusText'), liveText:$('liveText'),
  toolRail:$('toolRail'), toolButtons:[...document.querySelectorAll('[data-tool]')], widthInput:$('widthInput'), colorInput:$('colorInput'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelected:$('deleteSelected'),
  toolSplit:$('toolSplit'), noteSplit:$('noteSplit'), noteInnerSplit:$('noteInnerSplit'), studentSplit:$('studentSplit'), studentPermanentSplit:$('studentPermanentSplit'), studentPageSplit:$('studentPageSplit'),
  loginPanel:$('loginPanel'), loginForm:$('loginForm'), emailInput:$('emailInput'), passwordInput:$('passwordInput'), signOutBtn:$('signOutBtn'),
  libraryBtn:$('libraryBtn'), libraryDialog:$('libraryDialog'), libraryList:$('libraryList'), createDocBtn:$('createDocBtn'), newTitle:$('newTitle'), newDriveUrl:$('newDriveUrl'), copyStudentLink:$('copyStudentLink'), hookStudentsBtn:$('hookStudentsBtn'), exportPdf:$('exportPdf'),
  fullscreenBtn:$('fullscreenBtn'), focusPdfBtn:$('focusPdfBtn'), resetLayoutBtn:$('resetLayoutBtn')
};

const state = {
  token:null, session:null, doc:null, pdf:null, pageNo:1, scale:1.15, fit:true, rendering:false, pendingPage:null,
  pageObjects:[], pageCache:new Map(), boards:[], boardNo:1, images:[], imageIndex:0, imageBlobUrls:new Map(), revision:0,
  tool:'pen', activeSurface:'pdf', pointer:null, selectedId:null, clipboard:null, undo:[], redo:[], rafPending:false,
  saveTimer:null, boardSaveTimer:null, boardTextTimer:null, boardTitleTimer:null, pollTimer:null, heartbeatTimer:null,
  boardOpen:true, teacherOnline:false, studentHooked:true, followTeacher:true, liveBoardNo:1, liveImageId:null, liveScrollRatio:0, liveCenterX:.5, liveCenterY:.5, liveZoom:1, imageZoom:1, pinch:null, scrollSyncTimer:null
};

function showError(message){
  els.loading?.classList.add('hidden');
  els.workspace?.classList.add('hidden');
  if(els.error){ els.error.textContent=message; els.error.classList.remove('hidden'); }
}
function showLoading(message='Loading…'){
  els.error?.classList.add('hidden');
  if(els.loading){ els.loading.textContent=message; els.loading.classList.remove('hidden'); }
}
function setStatus(message){ if(els.statusText) els.statusText.textContent=message; }
// Explicit hook is authoritative. Teacher-online is only informational.
function studentFollowActive(){ return !TEACHER && state.studentHooked; }
function updateHookButton(){
  if(!TEACHER || !els.hookStudentsBtn) return;
  els.hookStudentsBtn.textContent=state.studentHooked?'🔗 Students hooked':'⛓ Students unhooked';
  els.hookStudentsBtn.classList.toggle('hooked',state.studentHooked);
  els.hookStudentsBtn.classList.toggle('unhooked',!state.studentHooked);
  els.hookStudentsBtn.setAttribute('aria-pressed',String(state.studentHooked));
  els.hookStudentsBtn.title=state.studentHooked?'Students follow your PDF page and position. Their zoom and notes panel stay under their own control.':'Students can browse pages freely. Your annotations still update.';
}
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function randomToken(){ const a=new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function uuid(){
  if(crypto.randomUUID) return crypto.randomUUID();
  const a=new Uint8Array(16); crypto.getRandomValues(a); a[6]=(a[6]&15)|64; a[8]=(a[8]&63)|128;
  const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function extractDriveId(value=''){
  const s=String(value).trim();
  let m=s.match(/\/file\/d\/([A-Za-z0-9_-]+)/); if(m) return m[1];
  m=s.match(/[?&]id=([A-Za-z0-9_-]+)/); if(m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
}
function studentUrl(doc=state.doc){ const u=new URL('./index.html',location.href); u.hash=`t=${doc.student_token}`; return u.href; }
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); }
  catch{ const t=document.createElement('textarea'); t.value=text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
}
function apiUrl(action, extra={}){
  const u=new URL(`${CONFIG.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/${CONFIG.API_FUNCTION}`);
  u.searchParams.set('action',action);
  for(const [k,v] of Object.entries(extra)) if(v!==null && v!==undefined) u.searchParams.set(k,String(v));
  if(TEACHER && state.doc?.id) u.searchParams.set('doc',state.doc.id);
  return u.toString();
}
function authHeaders(extra={}){
  const h={apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,...extra};
  if(TEACHER && state.session?.access_token) h.Authorization=`Bearer ${state.session.access_token}`;
  if(!TEACHER && state.token) h['x-viewer-token']=state.token;
  return h;
}
async function api(action, extra={}){
  const r=await fetch(apiUrl(action,extra),{headers:authHeaders()});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error||`Request failed (${r.status})`);
  return data;
}
function persistStudentState(){
  if(TEACHER || !state.doc) return;
  try{
    const cs=getComputedStyle(document.documentElement);
    localStorage.setItem(`sntpdf:${state.doc.id}`,JSON.stringify({
      pageNo:state.pageNo,boardNo:state.boardNo,scale:state.scale,fit:state.fit,
      boardOpen:state.boardOpen,imageIndex:state.imageIndex,
      studentNoteH:cs.getPropertyValue('--student-note-h').trim(),
      permanentH:cs.getPropertyValue('--student-permanent-h').trim(),
      pageNotesH:cs.getPropertyValue('--student-page-h').trim()
    }));
  }catch{}
}
function restoreStudentState(){
  if(TEACHER || !state.doc) return;
  try{
    const v=JSON.parse(localStorage.getItem(`sntpdf:${state.doc.id}`)||'null'); if(!v) return;
    state.pageNo=Math.max(1,Number(v.pageNo||1)); state.boardNo=Math.max(1,Number(v.boardNo||1)); state.scale=Math.max(.4,Math.min(3.5,Number(v.scale||1.15))); state.fit=v.fit!==false; state.boardOpen=v.boardOpen!==false; state.imageIndex=Math.max(0,Number(v.imageIndex||0));
    if(v.studentNoteH)document.documentElement.style.setProperty('--student-note-h',v.studentNoteH);
    if(v.permanentH)document.documentElement.style.setProperty('--student-permanent-h',v.permanentH);
    if(v.pageNotesH)document.documentElement.style.setProperty('--student-page-h',v.pageNotesH);
  }catch{}
}

function curColor(){ return els.colorInput?.value||'#1f2937'; }
function curWidth(){ return Number(els.widthInput?.value||4); }
function norm(evt,canvas){ const r=canvas.getBoundingClientRect(); return {x:Math.max(0,Math.min(1,(evt.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(evt.clientY-r.top)/r.height))}; }
function objectPoints(o){ if(o.type==='pen'||o.type==='highlighter') return o.points||[]; if(o.type==='text') return [{x:o.x,y:o.y}]; return [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}]; }
function distPointSegment(p,a,b){ const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c1=vx*wx+vy*wy; if(c1<=0)return Math.hypot(p.x-a.x,p.y-a.y); const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p.x-b.x,p.y-b.y);const t=c1/c2;return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy)); }
function hitTest(objects,p){
  for(let i=objects.length-1;i>=0;i--){
    const o=objects[i];
    if(o.type==='text' && Math.hypot(p.x-o.x,p.y-o.y)<.045) return o;
    if(o.type==='pen'||o.type==='highlighter'){ const pts=o.points||[]; for(let j=1;j<pts.length;j++) if(distPointSegment(p,pts[j-1],pts[j])<.024) return o; }
    else if(o.type==='line'||o.type==='arrow'){ if(distPointSegment(p,{x:o.x1,y:o.y1},{x:o.x2,y:o.y2})<.024)return o; }
    else if(o.type==='rect'||o.type==='ellipse'){ const minx=Math.min(o.x1,o.x2)-.025,maxx=Math.max(o.x1,o.x2)+.025,miny=Math.min(o.y1,o.y2)-.025,maxy=Math.max(o.y1,o.y2)+.025;if(p.x>=minx&&p.x<=maxx&&p.y>=miny&&p.y<=maxy)return o; }
  }
  return null;
}
function translateObject(o,dx,dy){
  const clamp=v=>Math.max(0,Math.min(1,v));
  if(o.points)o.points=o.points.map(p=>({x:clamp(p.x+dx),y:clamp(p.y+dy)}));
  for(const k of ['x','x1','x2']) if(typeof o[k]==='number') o[k]=clamp(o[k]+dx);
  for(const k of ['y','y1','y2']) if(typeof o[k]==='number') o[k]=clamp(o[k]+dy);
}
function strokeRatio(canvas){ const r=canvas.getBoundingClientRect(); return r.width ? canvas.width/r.width : 1; }
function drawObject(ctx,o,canvas,selected=false){
  const w=canvas.width,h=canvas.height,ratio=strokeRatio(canvas),X=x=>x*w,Y=y=>y*h;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color||'#1f2937';ctx.fillStyle=o.color||'#1f2937';ctx.lineWidth=Math.max(1,(o.width||4)*ratio);ctx.globalAlpha=o.type==='highlighter'?.28:1;
  if(o.type==='pen'||o.type==='highlighter'){ const pts=o.points||[];if(pts.length){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.stroke();} }
  else if(o.type==='text'){ctx.globalAlpha=1;ctx.font=`${Math.max(14,(o.fontSize||18)*ratio)}px system-ui,sans-serif`;ctx.fillText(o.text||'',X(o.x),Y(o.y));}
  else if(o.type==='line'||o.type==='arrow'){
    ctx.beginPath();ctx.moveTo(X(o.x1),Y(o.y1));ctx.lineTo(X(o.x2),Y(o.y2));ctx.stroke();
    if(o.type==='arrow'){const ang=Math.atan2(Y(o.y2)-Y(o.y1),X(o.x2)-X(o.x1)),len=12*ratio;ctx.beginPath();ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang-Math.PI/6),Y(o.y2)-len*Math.sin(ang-Math.PI/6));ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(ang+Math.PI/6),Y(o.y2)-len*Math.sin(ang+Math.PI/6));ctx.stroke();}
  }
  else if(o.type==='rect'){ctx.strokeRect(X(Math.min(o.x1,o.x2)),Y(Math.min(o.y1,o.y2)),Math.abs(o.x2-o.x1)*w,Math.abs(o.y2-o.y1)*h);}
  else if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(X((o.x1+o.x2)/2),Y((o.y1+o.y2)/2),Math.abs(o.x2-o.x1)*w/2,Math.abs(o.y2-o.y1)*h/2,0,0,Math.PI*2);ctx.stroke();}
  if(selected){ctx.globalAlpha=1;ctx.setLineDash([6*ratio,5*ratio]);ctx.strokeStyle='#147a5a';ctx.lineWidth=2*ratio;const pts=objectPoints(o);if(pts.length){const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);ctx.strokeRect(X(minx)-6*ratio,Y(miny)-6*ratio,Math.max(12*ratio,X(maxx-minx)+12*ratio),Math.max(12*ratio,Y(maxy-miny)+12*ratio));}}
  ctx.restore();
}
function drawOverlay(){ const c=els.overlayCanvas,ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);for(const o of state.pageObjects)drawObject(ctx,o,c,TEACHER&&o.id===state.selectedId); }
function drawLiveSegment(o,a,b){ const c=els.overlayCanvas,ctx=c.getContext('2d'),ratio=strokeRatio(c);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color;ctx.lineWidth=Math.max(1,(o.width||4)*ratio);ctx.globalAlpha=o.type==='highlighter'?.28:1;ctx.beginPath();ctx.moveTo(a.x*c.width,a.y*c.height);ctx.lineTo(b.x*c.width,b.y*c.height);ctx.stroke();ctx.restore(); }
function scheduleOverlayRedraw(){ if(state.rafPending)return;state.rafPending=true;requestAnimationFrame(()=>{state.rafPending=false;drawOverlay();}); }
function remember(){ if(!TEACHER)return;state.undo.push(clone(state.pageObjects));if(state.undo.length>70)state.undo.shift();state.redo=[]; }
function applyHistory(from,to){ const item=from.pop();if(!item)return;to.push(clone(state.pageObjects));state.pageObjects=clone(item);state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;drawOverlay();savePageSoon(20); }
function setTool(tool){state.tool=tool;state.selectedId=null;els.toolButtons.forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));els.canvasWrap?.classList.toggle('hand',tool==='hand');drawOverlay();}
function pointerDown(evt){
  if(!TEACHER)return;
  const p=norm(evt,els.overlayCanvas);
  if(state.tool==='hand')return;
  if(state.tool==='select'){
    const hit=hitTest(state.pageObjects,p);state.selectedId=hit?.id||null;drawOverlay();
    if(hit){remember();state.pointer={id:hit.id,last:p,kind:'move'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);}return;
  }
  if(state.tool==='eraser'){
    const hit=hitTest(state.pageObjects,p);if(hit){remember();state.pageObjects=state.pageObjects.filter(x=>x.id!==hit.id);state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;drawOverlay();savePageSoon(20);}return;
  }
  if(state.tool==='text'){
    const text=prompt('Text to add:');if(!text)return;remember();state.pageObjects.push({id:uuid(),type:'text',x:p.x,y:p.y,text:text.slice(0,600),color:curColor(),fontSize:Math.max(14,curWidth()*5)});state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);return;
  }
  remember();
  let o;if(state.tool==='pen'||state.tool==='highlighter')o={id:uuid(),type:state.tool,points:[p],color:curColor(),width:curWidth()};else o={id:uuid(),type:state.tool,x1:p.x,y1:p.y,x2:p.x,y2:p.y,color:curColor(),width:curWidth()};
  state.pageObjects.push(o);state.pointer={id:o.id,last:p,kind:'draw'};els.overlayCanvas.setPointerCapture?.(evt.pointerId);
}
function pointerMove(evt){
  if(!TEACHER||!state.pointer)return;
  const p=norm(evt,els.overlayCanvas),o=state.pageObjects.find(x=>x.id===state.pointer.id);if(!o)return;
  if(state.pointer.kind==='move'){const dx=p.x-state.pointer.last.x,dy=p.y-state.pointer.last.y;translateObject(o,dx,dy);state.pointer.last=p;scheduleOverlayRedraw();return;}
  if(o.type==='pen'||o.type==='highlighter'){
    const last=o.points[o.points.length-1];if(Math.hypot(p.x-last.x,p.y-last.y)>.0012){o.points.push(p);drawLiveSegment(o,last,p);}return;
  }
  o.x2=p.x;o.y2=p.y;scheduleOverlayRedraw();
}
function pointerUp(){
  if(!TEACHER||!state.pointer)return;state.pointer=null;state.pageCache.set(state.pageNo,clone(state.pageObjects));scheduleOverlayRedraw();savePageSoon(10);
}
async function savePageNow(){
  if(!TEACHER||!state.doc)return;const pageNo=state.pageNo,objects=clone(state.pageObjects);setStatus('Saving…');
  const {error}=await supabase.from('snt_pdf_pages').upsert({document_id:state.doc.id,page_no:pageNo,objects,updated_at:new Date().toISOString()},{onConflict:'document_id,page_no'});
  if(error){setStatus('Save failed: '+error.message);return;}state.pageCache.set(pageNo,objects);setStatus('Saved');
}
function savePageSoon(delay=100){clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>savePageNow().catch(e=>setStatus(e.message)),delay);}
async function loadTeacherPageData(force=false){
  if(!force&&state.pageCache.has(state.pageNo)){state.pageObjects=clone(state.pageCache.get(state.pageNo));state.selectedId=null;drawOverlay();return;}
  const {data,error}=await supabase.from('snt_pdf_pages').select('objects').eq('document_id',state.doc.id).eq('page_no',state.pageNo).maybeSingle();if(error)throw error;
  state.pageObjects=Array.isArray(data?.objects)?data.objects:[];state.pageCache.set(state.pageNo,clone(state.pageObjects));state.selectedId=null;state.undo=[];state.redo=[];drawOverlay();
}
async function loadStudentPageData(){const p=await api('page',{page:state.pageNo});state.pageObjects=Array.isArray(p.objects)?p.objects:[];drawOverlay();}

function boardByNo(no=state.boardNo){return state.boards.find(b=>Number(b.board_no)===Number(no));}
function boardIsPermanent(b=boardByNo()){return !!b?.is_permanent;}
function boardAppliesToPage(b,page=state.pageNo){return !!b && (b.is_permanent===true || (b.board_scope==='page' && Number(b.page_no)===Number(page)));}
function firstPermanentBoard(){return state.boards.find(b=>b.is_permanent===true)||state.boards[0]||null;}
function ensureApplicableBoard(){
  if(boardAppliesToPage(boardByNo()))return;
  const permanent=firstPermanentBoard();state.boardNo=permanent?.board_no||state.boards[0]?.board_no||1;
}
async function ensurePermanentBoard(){
  if(!TEACHER||!state.doc)return;
  const {data,error}=await supabase.from('snt_pdf_boards').select('board_no,title,text_content,board_scope,page_no,is_permanent,updated_at').eq('document_id',state.doc.id).order('board_no');if(error)throw error;
  const existing=(data||[]).find(b=>b.is_permanent===true);
  if(existing)return;
  const next=Math.max(0,...(data||[]).map(x=>Number(x.board_no)))+1;
  const {error:e}=await supabase.from('snt_pdf_boards').insert({document_id:state.doc.id,board_no:next,title:'Permanent board',text_content:'',objects:[],board_scope:'global',page_no:1,is_permanent:true});if(e)throw e;
}
async function loadTeacherBoards(){
  await ensurePermanentBoard();
  const {data,error}=await supabase.from('snt_pdf_boards').select('board_no,title,text_content,board_scope,page_no,is_permanent,updated_at').eq('document_id',state.doc.id).order('board_no');if(error)throw error;
  state.boards=(data||[]).filter(b=>boardAppliesToPage(b,state.pageNo));
  ensureApplicableBoard();loadBoardText();await loadImages();
}
function renderStudentNotes(){
  if(TEACHER) return;
  const permanent=firstPermanentBoard();
  const pageBoards=state.boards.filter(b=>!b.is_permanent && b.board_scope==='page' && Number(b.page_no)===Number(state.pageNo));
  if(els.permanentTitle) els.permanentTitle.textContent=permanent?.title||'Permanent board';
  if(els.permanentText) els.permanentText.textContent=(permanent?.text_content||'').trim()||'No permanent notes yet.';
  if(els.pageNotesBadge) els.pageNotesBadge.textContent=`Page ${state.pageNo}`;
  if(els.pageNotesList){
    if(!pageBoards.length){
      els.pageNotesList.innerHTML='<div class="page-note-empty">No page notes for this page yet.</div>';
    }else{
      els.pageNotesList.innerHTML=pageBoards.map(b=>`<article class="page-note-entry"><strong>${escapeHtml(b.title||`Page ${state.pageNo} notes`)}</strong><div class="page-note-body">${escapeHtml((b.text_content||'').trim()||'No typed note on this board.')}</div></article>`).join('');
    }
  }
}
function chooseStudentImageBoard(preferred=state.liveBoardNo){
  if(TEACHER) return;
  // Preserve the student's current image-board choice whenever it still belongs
  // to the permanent board or the current PDF page.
  const current=state.boards.find(b=>Number(b.board_no)===Number(state.boardNo));
  const preferredBoard=state.boards.find(b=>Number(b.board_no)===Number(preferred));
  const permanent=firstPermanentBoard();
  const firstPageBoard=state.boards.find(b=>!b.is_permanent && b.board_scope==='page' && Number(b.page_no)===Number(state.pageNo));
  const chosen=current||preferredBoard||firstPageBoard||permanent||state.boards[0];
  if(chosen) state.boardNo=Number(chosen.board_no);
  if(els.studentImageTitle) els.studentImageTitle.textContent=`Teacher images${chosen?.title?' — '+chosen.title:''}`;
}
async function loadStudentBoards(){
  const r=await api('boards',{page:state.pageNo});state.boards=r.boards||[];
  if(!state.boards.length)state.boards=[{board_no:1,title:'Permanent board',text_content:'',board_scope:'global',page_no:1,is_permanent:true}];
  renderStudentNotes();chooseStudentImageBoard();await loadImages();
}
function loadBoardText(){
  const b=boardByNo()||firstPermanentBoard()||{board_no:state.boardNo,title:`Board ${state.boardNo}`,text_content:'',board_scope:'global',is_permanent:true};
  state.boardNo=Number(b.board_no||1);
  if(els.boardText)els.boardText.value=b.text_content||'';
  if(els.boardTitleInput)els.boardTitleInput.value=b.title||`Board ${state.boardNo}`;
  if(els.boardTitleDisplay)els.boardTitleDisplay.textContent=b.title||'Teacher Notepad';
  if(els.boardLabel)els.boardLabel.textContent=b.is_permanent?'All pages':`PDF page ${b.page_no||state.pageNo}`;
  if(els.boardScopeLabel){els.boardScopeLabel.textContent=b.is_permanent?'Permanent':`Page ${b.page_no||state.pageNo}`;els.boardScopeLabel.classList.toggle('page-scope',!b.is_permanent);}
  if(els.boardDelete){els.boardDelete.disabled=!!b.is_permanent;els.boardDelete.title=b.is_permanent?'The permanent board cannot be deleted.':'Delete this page board';}
  const arr=state.boards.map(x=>Number(x.board_no)),i=arr.indexOf(Number(state.boardNo));if(els.boardPrev)els.boardPrev.disabled=i<=0;if(els.boardNext)els.boardNext.disabled=i<0||i>=arr.length-1;
}
async function saveBoardNow(){
  if(!TEACHER||!state.doc)return;const b=boardByNo();if(!b)return;
  const title=(els.boardTitleInput?.value||b.title||`Board ${state.boardNo}`).trim().slice(0,80)||`Board ${state.boardNo}`,text=els.boardText?.value||'';
  const row={document_id:state.doc.id,board_no:state.boardNo,title,text_content:text,objects:[],board_scope:b.is_permanent?'global':'page',page_no:b.is_permanent?1:Number(b.page_no||state.pageNo),is_permanent:!!b.is_permanent,updated_at:new Date().toISOString()};
  const {error}=await supabase.from('snt_pdf_boards').upsert(row,{onConflict:'document_id,page_no,board_no'});if(error){setStatus('Notepad save failed: '+error.message);return;}
  b.title=title;b.text_content=text;setStatus('Notepad saved');
}
function saveBoardSoon(){clearTimeout(state.boardTextTimer);state.boardTextTimer=setTimeout(()=>saveBoardNow().catch(e=>setStatus(e.message)),180);}
async function addBoard(){
  if(!TEACHER||!state.doc)return;setStatus('Adding page board…');
  const {data:all,error:readError}=await supabase.from('snt_pdf_boards').select('board_no').eq('document_id',state.doc.id).order('board_no');if(readError)return setStatus(readError.message);
  const next=Math.max(0,...(all||[]).map(x=>Number(x.board_no)))+1,title=`Page ${state.pageNo} board`;
  const {data,error}=await supabase.from('snt_pdf_boards').insert({document_id:state.doc.id,board_no:next,title,text_content:'',objects:[],board_scope:'page',page_no:state.pageNo,is_permanent:false}).select('board_no').single();
  if(error)return setStatus('Could not add board: '+error.message);
  state.boardNo=Number(data.board_no);await loadTeacherBoards();state.boardNo=Number(data.board_no);loadBoardText();await loadImages();await pushLiveState();setStatus('Page board added');
}
async function deleteBoard(){
  if(!TEACHER||!state.doc)return;const b=boardByNo();if(!b)return;
  if(b.is_permanent)return setStatus('The permanent board cannot be deleted.');
  if(!confirm(`Delete “${b.title||'this page board'}” and its pasted images?`))return;
  setStatus('Deleting board…');
  const {data:imgs,error:imgRead}=await supabase.from('snt_pdf_board_images').select('id,storage_path').eq('document_id',state.doc.id).eq('board_no',b.board_no);if(imgRead)return setStatus(imgRead.message);
  for(const image of imgs||[]){const r=await fetch(apiUrl('delete-image',{image:image.id}),{method:'POST',headers:authHeaders()});if(!r.ok){const d=await r.json().catch(()=>({}));return setStatus(d.error||'Could not delete a board image.');}}
  const {error}=await supabase.from('snt_pdf_boards').delete().eq('document_id',state.doc.id).eq('board_no',b.board_no);if(error)return setStatus('Could not delete board: '+error.message);
  state.liveImageId=null;await loadTeacherBoards();const permanent=firstPermanentBoard();state.boardNo=permanent?.board_no||state.boards[0]?.board_no||1;loadBoardText();await loadImages();await pushLiveState();setStatus('Board deleted');
}
async function moveBoard(delta){
  const arr=state.boards.map(x=>Number(x.board_no)),i=arr.indexOf(Number(state.boardNo)),n=i+delta;if(n<0||n>=arr.length)return;
  state.boardNo=arr[n];state.imageZoom=1;loadBoardText();await loadImages();if(TEACHER)await pushLiveState();else persistStudentState();
}

async function loadImages(){
  try{
    if(TEACHER){const {data,error}=await supabase.from('snt_pdf_board_images').select('id,board_no,image_name,mime_type,file_size,sort_no,created_at').eq('document_id',state.doc.id).eq('board_no',state.boardNo).order('sort_no');if(error)throw error;state.images=data||[];}
    else{const r=await api('images',{board:state.boardNo});state.images=r.images||[];}
    if(state.liveImageId){const idx=state.images.findIndex(x=>x.id===state.liveImageId);if(idx>=0)state.imageIndex=idx;}
    state.imageIndex=Math.max(0,Math.min(state.imageIndex,Math.max(0,state.images.length-1)));await showCurrentImage();
  }catch(e){setStatus('Image load failed: '+e.message);}
}
async function fetchImageBlobUrl(image){
  if(!image)return null;if(state.imageBlobUrls.has(image.id))return state.imageBlobUrls.get(image.id);
  const r=await fetch(apiUrl('image',{image:image.id}),{headers:authHeaders()});if(!r.ok)throw new Error('Could not load image.');const blob=await r.blob(),url=URL.createObjectURL(blob);state.imageBlobUrls.set(image.id,url);return url;
}
async function showCurrentImage(){
  const count=state.images.length;if(els.imageCounter)els.imageCounter.textContent=count?`${state.imageIndex+1} / ${count}`:'0 / 0';if(els.imagePrev)els.imagePrev.disabled=!count||state.imageIndex<=0;if(els.imageNext)els.imageNext.disabled=!count||state.imageIndex>=count-1;if(els.deleteImageBtn)els.deleteImageBtn.disabled=!count;
  if(!count){els.boardImage?.classList.add('hidden');if(els.imageStage){const span=els.imageStage.querySelector('span');if(span)span.classList.remove('hidden');}state.liveImageId=null;applyImageZoom();return;}
  const image=state.images[state.imageIndex];try{const url=await fetchImageBlobUrl(image);els.boardImage.src=url;els.boardImage.alt=image.image_name||'Teacher pasted image';els.boardImage.classList.remove('hidden');const span=els.imageStage?.querySelector('span');if(span)span.classList.add('hidden');state.liveImageId=image.id;applyImageZoom();if(TEACHER)await pushLiveState();persistStudentState();}catch(e){setStatus(e.message);}
}
function applyImageZoom(){
  const z=Math.max(.25,Math.min(4,Number(state.imageZoom||1)));state.imageZoom=z;
  if(els.boardImage){
    if(TEACHER){els.boardImage.style.transform='none';els.boardImage.style.maxWidth='none';els.boardImage.style.maxHeight='none';els.boardImage.style.width=`${Math.round(z*100)}%`;els.boardImage.style.height='auto';}
    else{els.boardImage.style.transform='';els.boardImage.style.width='';els.boardImage.style.height='';els.boardImage.style.maxWidth='100%';els.boardImage.style.maxHeight='100%';}
  }
  if(els.imageZoomReset)els.imageZoomReset.textContent=`${Math.round(z*100)}%`;
}
function changeImageZoom(delta){state.imageZoom=Math.max(.25,Math.min(4,state.imageZoom+delta));applyImageZoom();}
function resetImageZoom(){state.imageZoom=1;applyImageZoom();}

async function moveImage(delta){if(!state.images.length)return;const n=state.imageIndex+delta;if(n<0||n>=state.images.length)return;state.imageIndex=n;state.imageZoom=1;await showCurrentImage();}
async function uploadImage(file){
  if(!TEACHER||!file)return;if(file.size>8*1024*1024)return setStatus('Image must be under 8 MB.');if(!/^image\//.test(file.type))return setStatus('Choose an image file.');setStatus('Uploading image…');
  const r=await fetch(apiUrl('upload-image',{board:state.boardNo}),{method:'POST',headers:authHeaders({'Content-Type':file.type,'x-file-name':encodeURIComponent(file.name||'Pasted image')}),body:file});const data=await r.json().catch(()=>({}));if(!r.ok)return setStatus(data.error||'Image upload failed.');await loadImages();state.imageIndex=Math.max(0,state.images.length-1);await showCurrentImage();setStatus('Image saved');
}
async function deleteCurrentImage(){
  if(!TEACHER||!state.images.length)return;const image=state.images[state.imageIndex];if(!confirm('Delete this pasted image?'))return;const r=await fetch(apiUrl('delete-image',{image:image.id}),{method:'POST',headers:authHeaders()});const data=await r.json().catch(()=>({}));if(!r.ok)return setStatus(data.error||'Delete failed.');const old=state.imageBlobUrls.get(image.id);if(old)URL.revokeObjectURL(old);state.imageBlobUrls.delete(image.id);state.imageIndex=Math.max(0,state.imageIndex-1);await loadImages();setStatus('Image deleted');
}
async function pushLiveState(){
  if(!TEACHER||!state.doc||!state.pdf)return;
  const maxX=Math.max(0,els.pdfScroller.scrollWidth-els.pdfScroller.clientWidth),maxY=Math.max(0,els.pdfScroller.scrollHeight-els.pdfScroller.clientHeight);
  const centerX=maxX>0?Math.max(0,Math.min(1,(els.pdfScroller.scrollLeft+els.pdfScroller.clientWidth/2)/Math.max(1,els.pdfScroller.scrollWidth))):0.5;
  const centerY=maxY>0?Math.max(0,Math.min(1,(els.pdfScroller.scrollTop+els.pdfScroller.clientHeight/2)/Math.max(1,els.pdfScroller.scrollHeight))):0.5;
  const scrollRatio=maxY>0?Math.max(0,Math.min(1,els.pdfScroller.scrollTop/maxY)):0;
  state.liveScrollRatio=scrollRatio;state.liveCenterX=centerX;state.liveCenterY=centerY;state.liveZoom=state.scale;
  const {error}=await supabase.from('snt_pdf_documents').update({live_page:state.pageNo,live_board_no:state.boardNo,live_image_id:state.liveImageId||null,live_scroll_ratio:scrollRatio,live_center_x:centerX,live_center_y:centerY,live_zoom:state.scale,student_hooked:state.studentHooked,teacher_present_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',state.doc.id);if(error)setStatus(error.message);
}
async function setStudentHooked(next){
  if(!TEACHER||!state.doc)return;
  state.studentHooked=!!next;updateHookButton();
  setStatus(state.studentHooked?'Students hooked — they follow your page and position':'Students unhooked — they can browse pages freely');
  await pushLiveState();
}
function applyTeacherCenter(){
  if(TEACHER||!studentFollowActive()||!state.pdf)return;
  const fullW=els.pdfScroller.scrollWidth,fullH=els.pdfScroller.scrollHeight;
  const left=Math.max(0,Math.min(Math.max(0,fullW-els.pdfScroller.clientWidth),state.liveCenterX*fullW-els.pdfScroller.clientWidth/2));
  const top=Math.max(0,Math.min(Math.max(0,fullH-els.pdfScroller.clientHeight),state.liveCenterY*fullH-els.pdfScroller.clientHeight/2));
  els.pdfScroller.scrollLeft=left;els.pdfScroller.scrollTop=top;
}
function teacherHeartbeat(){if(!TEACHER||!state.doc)return;pushLiveState().catch(()=>{});}
async function pollStudentSync(){
  if(TEACHER||!state.doc)return;
  try{
    const wasFollowing=studentFollowActive(),s=await api('sync'),previousLiveImage=state.liveImageId,previousLiveBoard=state.liveBoardNo,newRevision=Number(s.revision||0),revisionChanged=newRevision!==state.revision;
    state.teacherOnline=!!s.teacher_online;
    state.studentHooked=s.student_hooked!==false;
    state.liveBoardNo=Math.max(1,Number(s.live_board_no||1));
    state.liveImageId=s.live_image_id||null;
    state.liveScrollRatio=Math.max(0,Math.min(1,Number(s.live_scroll_ratio||0)));
    state.liveCenterX=Math.max(0,Math.min(1,Number(s.live_center_x??.5)));
    state.liveCenterY=Math.max(0,Math.min(1,Number(s.live_center_y??.5)));
    state.liveZoom=Math.max(.25,Math.min(5,Number(s.live_zoom||1)));

    const following=studentFollowActive();
    document.body.classList.toggle('student-following',following);
    if(els.liveText){
      els.liveText.textContent=following
        ? (state.teacherOnline?'🔗 Hooked to teacher':'🔗 Hooked • holding teacher view')
        : (state.teacherOnline?'Teacher online • free view':'Teacher offline • free view');
      els.liveText.classList.toggle('following',following);
    }
    if(els.prevPage)els.prevPage.disabled=following||state.pageNo<=1;
    if(els.nextPage)els.nextPage.disabled=following||state.pageNo>=state.pdf.numPages;
    if(els.pageInput)els.pageInput.disabled=following;

    if(following){
      const targetPage=Math.max(1,Number(s.live_page||1));
      if(targetPage!==state.pageNo){
        await renderPage(targetPage,true);
      }else if(revisionChanged){
        await loadStudentPageData();
        await loadStudentBoards();
      }

      // Hook controls only the PDF page + teacher position.
      // Notes visibility, note block sizes and image browsing stay under student control.
      if(revisionChanged){
        await loadStudentBoards();
      }
      requestAnimationFrame(()=>applyTeacherCenter());
    }else if(revisionChanged){
      await loadStudentPageData();
      await loadStudentBoards();
    }

    state.revision=newRevision;
    if(!wasFollowing&&following)setStatus('HOOKED: teacher controls PDF page + position. Your zoom, notes show/hide and resize bars remain yours.');
    else if(wasFollowing&&!following)setStatus(state.teacherOnline?'Unhooked: you can browse pages freely.':'Teacher disconnected: you can browse pages freely.');
  }catch{}
}

async function loadPdf(){
  showLoading('Loading Google Drive PDF…');
  const task=pdfjsLib.getDocument({url:apiUrl('pdf'),httpHeaders:authHeaders(),rangeChunkSize:524288,disableAutoFetch:true,disableStream:false,disableFontFace:false});
  state.pdf=await task.promise;await renderPage(state.pageNo,TEACHER);if(TEACHER)window.requestIdleCallback?.(()=>prefetchAdjacent().catch(()=>{}));
}
async function prefetchAdjacent(){
  if(!TEACHER||!state.pdf)return;for(const n of [state.pageNo-1,state.pageNo+1]){if(n<1||n>state.pdf.numPages||state.pageCache.has(n))continue;const {data}=await supabase.from('snt_pdf_pages').select('objects').eq('document_id',state.doc.id).eq('page_no',n).maybeSingle();state.pageCache.set(n,Array.isArray(data?.objects)?data.objects:[]);}
}
async function renderPage(n,forceData=false){
  if(!state.pdf)return;if(state.rendering){state.pendingPage=n;return;}state.rendering=true;
  try{
    n=Math.max(1,Math.min(state.pdf.numPages,Number(n)||1));const pageChanged=n!==state.pageNo;const page=await state.pdf.getPage(n);let scale=state.scale;
    if(state.fit){const base=page.getViewport({scale:1}),available=Math.max(260,els.pdfScroller.clientWidth-18);scale=Math.max(.42,Math.min(2.6,available/base.width));state.scale=scale;}
    const viewport=page.getViewport({scale}),dpr=Math.min(window.devicePixelRatio||1,1.6);
    for(const c of [els.pdfCanvas,els.overlayCanvas]){c.width=Math.floor(viewport.width*dpr);c.height=Math.floor(viewport.height*dpr);c.style.width=`${viewport.width}px`;c.style.height=`${viewport.height}px`;}
    els.canvasWrap.style.width=`${viewport.width}px`;els.canvasWrap.style.height=`${viewport.height}px`;
    const ctx=els.pdfCanvas.getContext('2d',{alpha:false});await page.render({canvasContext:ctx,viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;
    state.pageNo=n;if(pageChanged){els.pdfScroller.scrollTop=0;els.pdfScroller.scrollLeft=0;if(els.toolRail)els.toolRail.style.transform='translateY(0)';}els.pageInput.value=String(n);els.pageCount.textContent=`/ ${state.pdf.numPages}`;els.prevPage.disabled=studentFollowActive()||n<=1;els.nextPage.disabled=studentFollowActive()||n>=state.pdf.numPages;
    if(TEACHER){if(pageChanged)pushLiveState().catch(()=>{});await loadTeacherPageData(forceData);if(pageChanged||!state.boards.length)await loadTeacherBoards();await pushLiveState();window.requestIdleCallback?.(()=>prefetchAdjacent().catch(()=>{}));}
    else{await loadStudentPageData();if(pageChanged||!state.boards.length)await loadStudentBoards();persistStudentState();if(studentFollowActive())requestAnimationFrame(()=>applyTeacherCenter());}
  }finally{state.rendering=false;if(state.pendingPage!==null){const p=state.pendingPage;state.pendingPage=null;renderPage(p);}}
}

function setBoardOpen(open){
  state.boardOpen=!!open;
  if(TEACHER){
    els.workspace.classList.toggle('notes-hidden',!state.boardOpen);if(els.boardPanel)els.boardPanel.style.display=state.boardOpen?'':'none';if(els.noteSplit)els.noteSplit.style.display=state.boardOpen?'':'none';
    if(els.toggleBoard){els.toggleBoard.textContent=state.boardOpen?'Hide notepad':'Show notepad';els.toggleBoard.setAttribute('aria-expanded',String(state.boardOpen));}
    if(state.fit&&state.pdf)setTimeout(()=>renderPage(state.pageNo),50);
  }else{
    els.workspace.classList.toggle('notes-hidden',!state.boardOpen);
    if(els.toggleBoard){els.toggleBoard.textContent=state.boardOpen?'Hide notes':'Show notes';els.toggleBoard.setAttribute('aria-expanded',String(state.boardOpen));}
  }
  persistStudentState();
}

function bindResizer(handle,onMove,onEnd){
  if(!handle)return;handle.addEventListener('pointerdown',e=>{e.preventDefault();handle.classList.add('dragging');handle.setPointerCapture?.(e.pointerId);const move=ev=>onMove(ev);const up=()=>{handle.classList.remove('dragging');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',up);handle.removeEventListener('pointercancel',up);onEnd?.();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',up);handle.addEventListener('pointercancel',up);});
}
function saveLayout(){if(!TEACHER)return;const cs=getComputedStyle(document.documentElement);try{localStorage.setItem('sntpdf:teacher-layout',JSON.stringify({tools:cs.getPropertyValue('--tools-w').trim(),notes:cs.getPropertyValue('--notes-w').trim(),text:cs.getPropertyValue('--note-text-h').trim()}));}catch{}}
function restoreLayout(){if(!TEACHER)return;try{const v=JSON.parse(localStorage.getItem('sntpdf:teacher-layout')||'null');if(!v)return;if(v.tools)document.documentElement.style.setProperty('--tools-w',v.tools);if(v.notes)document.documentElement.style.setProperty('--notes-w',v.notes);if(v.text)document.documentElement.style.setProperty('--note-text-h',v.text);}catch{}}
function resetLayout(){document.documentElement.style.removeProperty('--tools-w');document.documentElement.style.removeProperty('--notes-w');document.documentElement.style.removeProperty('--note-text-h');document.documentElement.style.removeProperty('--student-note-h');document.documentElement.style.removeProperty('--student-permanent-h');document.documentElement.style.removeProperty('--student-page-h');try{localStorage.removeItem('sntpdf:teacher-layout');}catch{};state.fit=true;if(state.pdf)renderPage(state.pageNo);}
function bindLayout(){
  restoreLayout();
  bindResizer(els.toolSplit,e=>{const x=Math.max(58,Math.min(160,e.clientX));document.documentElement.style.setProperty('--tools-w',`${x}px`);},saveLayout);
  bindResizer(els.noteSplit,e=>{const rect=els.workspace.getBoundingClientRect(),w=Math.max(220,Math.min(rect.width*.62,rect.right-e.clientX));document.documentElement.style.setProperty('--notes-w',`${w}px`);if(state.fit&&state.pdf)renderPage(state.pageNo);},saveLayout);
  bindResizer(els.noteInnerSplit,e=>{const r=els.boardPanel.getBoundingClientRect(),pct=Math.max(18,Math.min(72,((e.clientY-r.top)/r.height)*100));document.documentElement.style.setProperty('--note-text-h',`${pct}%`);},saveLayout);

  // Student resizing is intentionally LOCAL and works both hooked and unhooked.
  bindResizer(els.studentSplit,e=>{
    const r=els.workspace.getBoundingClientRect(),h=Math.max(170,Math.min(r.height*.78,r.bottom-e.clientY));
    document.documentElement.style.setProperty('--student-note-h',`${h}px`);
    if(state.fit&&state.pdf)renderPage(state.pageNo);
  },()=>persistStudentState());

  bindResizer(els.studentPermanentSplit,e=>{
    if(TEACHER||!els.boardPanel||!els.permanentNotesSection)return;
    const panel=els.boardPanel.getBoundingClientRect();
    const top=els.permanentNotesSection.getBoundingClientRect().top;
    const max=Math.max(100,panel.height-250);
    const h=Math.max(80,Math.min(max,e.clientY-top));
    document.documentElement.style.setProperty('--student-permanent-h',`${h}px`);
  },()=>persistStudentState());

  bindResizer(els.studentPageSplit,e=>{
    if(TEACHER||!els.boardPanel||!els.pageNotesSection)return;
    const panel=els.boardPanel.getBoundingClientRect();
    const top=els.pageNotesSection.getBoundingClientRect().top;
    const max=Math.max(100,panel.bottom-top-130);
    const h=Math.max(80,Math.min(max,e.clientY-top));
    document.documentElement.style.setProperty('--student-page-h',`${h}px`);
  },()=>persistStudentState());
}
function bindStudentPinch(){
  if(TEACHER||!els.pdfScroller)return;
  let touches=new Map();
  const distance=()=>{const a=[...touches.values()];if(a.length<2)return 0;return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);};
  els.pdfScroller.addEventListener('pointerdown',e=>{
    if(!studentFollowActive()||e.pointerType!=='touch')return;touches.set(e.pointerId,{x:e.clientX,y:e.clientY});els.pdfScroller.setPointerCapture?.(e.pointerId);
    if(touches.size===2){state.pinch={startDist:distance(),baseScale:state.scale,visual:1};}
  });
  els.pdfScroller.addEventListener('pointermove',e=>{
    if(!studentFollowActive()||e.pointerType!=='touch'||!touches.has(e.pointerId))return;e.preventDefault();touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(touches.size===2&&state.pinch){const d=distance(),factor=Math.max(.6,Math.min(1.8,d/Math.max(1,state.pinch.startDist)));state.pinch.visual=factor;els.canvasWrap.style.transform=`scale(${factor})`;els.canvasWrap.style.transformOrigin=`${state.liveCenterX*100}% ${state.liveCenterY*100}%`;}
  },{passive:false});
  const finish=async e=>{
    if(e.pointerType!=='touch')return;touches.delete(e.pointerId);
    if(state.pinch&&touches.size<2){const factor=state.pinch.visual||1;state.scale=Math.max(.4,Math.min(3.5,state.pinch.baseScale*factor));state.fit=false;state.pinch=null;els.canvasWrap.style.transform='';await renderPage(state.pageNo);requestAnimationFrame(()=>applyTeacherCenter());}
  };
  els.pdfScroller.addEventListener('pointerup',finish);els.pdfScroller.addEventListener('pointercancel',finish);
}

function bindCommon(){
  els.prevPage?.addEventListener('click',()=>{if(studentFollowActive())return;renderPage(state.pageNo-1);});
  els.nextPage?.addEventListener('click',()=>{if(studentFollowActive())return;renderPage(state.pageNo+1);});
  els.pageInput?.addEventListener('change',()=>{if(studentFollowActive()){els.pageInput.value=state.pageNo;return;}renderPage(els.pageInput.value);});
  els.zoomOut?.addEventListener('click',async()=>{state.fit=false;state.scale=Math.max(.4,state.scale-.15);await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.zoomIn?.addEventListener('click',async()=>{state.fit=false;state.scale=Math.min(3.5,state.scale+.15);await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.fitPage?.addEventListener('click',async()=>{state.fit=true;await renderPage(state.pageNo);if(studentFollowActive())applyTeacherCenter();persistStudentState();});
  els.toggleBoard?.addEventListener('click',()=>setBoardOpen(!state.boardOpen));
  els.boardPrev?.addEventListener('click',()=>moveBoard(-1));els.boardNext?.addEventListener('click',()=>moveBoard(1));
  // Student note/image browsing is always local, whether hooked or unhooked.
  els.imagePrev?.addEventListener('click',()=>moveImage(-1));els.imageNext?.addEventListener('click',()=>moveImage(1));
  window.addEventListener('resize',()=>{clearTimeout(window.__sntResize);window.__sntResize=setTimeout(()=>state.fit&&state.pdf&&renderPage(state.pageNo),180);});
  bindLayout();
  bindStudentPinch();
}
function bindTeacher(){
  els.toolButtons.forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
  els.overlayCanvas.addEventListener('pointerdown',pointerDown);els.overlayCanvas.addEventListener('pointermove',pointerMove);els.overlayCanvas.addEventListener('pointerup',pointerUp);els.overlayCanvas.addEventListener('pointercancel',pointerUp);
  els.undoBtn?.addEventListener('click',()=>applyHistory(state.undo,state.redo));els.redoBtn?.addEventListener('click',()=>applyHistory(state.redo,state.undo));els.deleteSelected?.addEventListener('click',deleteSelectedObject);
  els.boardText?.addEventListener('input',saveBoardSoon);els.boardTitleInput?.addEventListener('input',saveBoardSoon);els.boardTitleInput?.addEventListener('change',()=>{const b=boardByNo();if(b)b.title=els.boardTitleInput.value.trim()||`Board ${state.boardNo}`;pushLiveState();});
  els.boardAdd?.addEventListener('click',addBoard);els.boardDelete?.addEventListener('click',deleteBoard);
  els.imageZoomOut?.addEventListener('click',()=>changeImageZoom(-.25));els.imageZoomReset?.addEventListener('click',resetImageZoom);els.imageZoomIn?.addEventListener('click',()=>changeImageZoom(.25));
  els.pasteImageBtn?.addEventListener('click',()=>els.imageFileInput?.click());els.imageFileInput?.addEventListener('change',()=>{const f=els.imageFileInput.files?.[0];if(f)uploadImage(f);els.imageFileInput.value='';});els.deleteImageBtn?.addEventListener('click',deleteCurrentImage);
  document.addEventListener('paste',e=>{if(!TEACHER)return;const item=[...(e.clipboardData?.items||[])].find(i=>i.type.startsWith('image/'));if(!item)return;const file=item.getAsFile();if(file){e.preventDefault();uploadImage(file);}});
  els.copyStudentLink?.addEventListener('click',async()=>{await copyText(studentUrl());setStatus('Student link copied');});els.hookStudentsBtn?.addEventListener('click',()=>setStudentHooked(!state.studentHooked).catch(e=>setStatus(e.message)));els.exportPdf?.addEventListener('click',exportAnnotatedPdf);els.libraryBtn?.addEventListener('click',openLibrary);els.signOutBtn?.addEventListener('click',async()=>{await supabase.auth.signOut();location.href='./teacher.html';});els.createDocBtn?.addEventListener('click',createDocumentFromForm);
  els.fullscreenBtn?.addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch{}});
  els.focusPdfBtn?.addEventListener('click',()=>{els.workspace.classList.toggle('pdf-focus');els.focusPdfBtn.textContent=els.workspace.classList.contains('pdf-focus')?'Show tools':'PDF focus';setTimeout(()=>state.fit&&state.pdf&&renderPage(state.pageNo),80);});
  els.resetLayoutBtn?.addEventListener('click',resetLayout);
  els.pdfScroller?.addEventListener('scroll',()=>{
    if(els.toolRail&&window.innerWidth>650)els.toolRail.style.transform=`translateY(${-els.pdfScroller.scrollTop}px)`;
    clearTimeout(state.scrollSyncTimer);state.scrollSyncTimer=setTimeout(()=>pushLiveState().catch(()=>{}),110);
  },{passive:true});
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?applyHistory(state.redo,state.undo):applyHistory(state.undo,state.redo);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();applyHistory(state.redo,state.undo);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){const o=state.pageObjects.find(x=>x.id===state.selectedId);if(o)state.clipboard=clone(o);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&state.clipboard){e.preventDefault();remember();const o=clone(state.clipboard);o.id=uuid();translateObject(o,.025,.025);state.pageObjects.push(o);state.selectedId=o.id;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);}
    if(e.key==='Delete'||e.key==='Backspace')deleteSelectedObject();
  });
}
function deleteSelectedObject(){if(!state.selectedId)return;remember();state.pageObjects=state.pageObjects.filter(x=>x.id!==state.selectedId);state.selectedId=null;state.pageCache.set(state.pageNo,clone(state.pageObjects));drawOverlay();savePageSoon(20);}

async function exportAnnotatedPdf(){
  if(!TEACHER||!window.PDFLib)return;
  try{
    setStatus('Preparing export…');const r=await fetch(apiUrl('pdf'),{headers:authHeaders()});if(!r.ok)throw new Error('Could not download source PDF.');const bytes=await r.arrayBuffer();const {PDFDocument,rgb,StandardFonts}=window.PDFLib;const pdf=await PDFDocument.load(bytes);const font=await pdf.embedFont(StandardFonts.Helvetica);
    const {data:rows,error}=await supabase.from('snt_pdf_pages').select('page_no,objects').eq('document_id',state.doc.id);if(error)throw error;
    const hex=h=>{const m=(h||'#1f2937').replace('#','');return rgb(parseInt(m.slice(0,2),16)/255,parseInt(m.slice(2,4),16)/255,parseInt(m.slice(4,6),16)/255);};
    for(const row of rows||[]){const page=pdf.getPage(row.page_no-1);if(!page)continue;const {width,height}=page.getSize(),X=x=>x*width,Y=y=>(1-y)*height;
      for(const o of row.objects||[]){const color=hex(o.color),th=Math.max(.6,(o.width||4)*.75),opacity=o.type==='highlighter'?.28:1;
        if(o.type==='pen'||o.type==='highlighter'){const pts=o.points||[];for(let i=1;i<pts.length;i++)page.drawLine({start:{x:X(pts[i-1].x),y:Y(pts[i-1].y)},end:{x:X(pts[i].x),y:Y(pts[i].y)},thickness:th,color,opacity});}
        else if(o.type==='text')page.drawText(o.text||'',{x:X(o.x),y:Y(o.y),size:Math.max(8,(o.fontSize||18)*.75),font,color});
        else if(o.type==='line'||o.type==='arrow'){page.drawLine({start:{x:X(o.x1),y:Y(o.y1)},end:{x:X(o.x2),y:Y(o.y2)},thickness:th,color});if(o.type==='arrow'){const x1=X(o.x1),y1=Y(o.y1),x2=X(o.x2),y2=Y(o.y2),ang=Math.atan2(y2-y1,x2-x1),len=10;for(const a of [ang+Math.PI*.82,ang-Math.PI*.82])page.drawLine({start:{x:x2,y:y2},end:{x:x2+len*Math.cos(a),y:y2+len*Math.sin(a)},thickness:th,color});}}
        else if(o.type==='rect')page.drawRectangle({x:X(Math.min(o.x1,o.x2)),y:Y(Math.max(o.y1,o.y2)),width:Math.abs(o.x2-o.x1)*width,height:Math.abs(o.y2-o.y1)*height,borderColor:color,borderWidth:th,opacity:0});
        else if(o.type==='ellipse')page.drawEllipse({x:X((o.x1+o.x2)/2),y:Y((o.y1+o.y2)/2),xScale:Math.abs(o.x2-o.x1)*width/2,yScale:Math.abs(o.y2-o.y1)*height/2,borderColor:color,borderWidth:th});
      }
    }
    const out=await pdf.save(),blob=new Blob([out],{type:'application/pdf'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${state.doc.title.replace(/[^A-Za-z0-9_-]+/g,'_')}_annotated.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2500);setStatus('Exported');
  }catch(e){setStatus('Export failed: '+e.message);}
}

async function refreshLibrary(){
  const {data,error}=await supabase.from('snt_pdf_documents').select('*').order('updated_at',{ascending:false});if(error)throw error;
  els.libraryList.innerHTML=(data||[]).map(d=>`<div class="lib-row"><div class="lib-main"><strong>${escapeHtml(d.title)}</strong><small>Drive file ${escapeHtml(d.drive_file_id)}</small></div><div class="lib-actions"><button class="btn compact" data-open="${d.id}">Open</button><button class="btn compact" data-copy="${d.id}">Copy link</button><button class="btn compact" data-revoke="${d.id}">${d.student_link_enabled?'Revoke':'Enable'}</button><button class="btn compact" data-rotate="${d.id}">New link</button><button class="btn compact danger-text" data-delete="${d.id}">Delete</button></div></div>`).join('')||'<p>No PDFs yet.</p>';
  els.libraryList.querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.open||b.dataset.copy||b.dataset.revoke||b.dataset.rotate||b.dataset.delete,d=(data||[]).find(x=>x.id===id);if(!d)return;
    if(b.dataset.open){els.libraryDialog.close();await openTeacherDocument(d);}
    if(b.dataset.copy){await copyText(studentUrl(d));setStatus('Student link copied');}
    if(b.dataset.revoke){await supabase.from('snt_pdf_documents').update({student_link_enabled:!d.student_link_enabled}).eq('id',d.id);await refreshLibrary();}
    if(b.dataset.rotate&&confirm('Create a new student link? The old link will stop working.')){await supabase.from('snt_pdf_documents').update({student_token:randomToken(),student_link_enabled:true}).eq('id',d.id);await refreshLibrary();}
    if(b.dataset.delete&&confirm(`Delete “${d.title}” and all its annotations/notepads/images?`)){await supabase.from('snt_pdf_documents').delete().eq('id',d.id);if(state.doc?.id===d.id)location.href='./teacher.html';else await refreshLibrary();}
  }));
}
async function openLibrary(){await refreshLibrary();els.libraryDialog.showModal();}
async function createDocumentFromForm(){
  const title=els.newTitle.value.trim(),url=els.newDriveUrl.value.trim(),fileId=extractDriveId(url);if(!title||!fileId)return setStatus('Enter a title and valid Google Drive PDF link.');const {data:{user}}=await supabase.auth.getUser();if(!user)return;
  const row={owner_id:user.id,title,drive_file_id:fileId,drive_share_url:url,student_token:randomToken(),student_link_enabled:true,student_hooked:true,live_board_no:1};const {data,error}=await supabase.from('snt_pdf_documents').insert(row).select('*').single();if(error){setStatus(error.message);return;}await supabase.from('snt_pdf_boards').insert({document_id:data.id,board_no:1,title:'Permanent board',text_content:'',objects:[],board_scope:'global',page_no:1,is_permanent:true});els.newTitle.value='';els.newDriveUrl.value='';els.libraryDialog.close();await openTeacherDocument(data);
}
async function openTeacherDocument(doc){
  state.doc=doc;state.pageNo=Math.max(1,Number(doc.live_page||1));state.boardNo=Math.max(1,Number(doc.live_board_no||1));state.liveBoardNo=state.boardNo;state.studentHooked=doc.student_hooked!==false;state.liveImageId=doc.live_image_id||null;state.liveCenterX=Math.max(0,Math.min(1,Number(doc.live_center_x??.5)));state.liveCenterY=Math.max(0,Math.min(1,Number(doc.live_center_y??.5)));state.liveZoom=Number(doc.live_zoom||1);state.revision=Number(doc.revision||0);els.docTitle.textContent=doc.title;els.contextText.textContent='Teacher • fast local drawing • autosave';updateHookButton();history.replaceState(null,'',`./teacher.html?id=${encodeURIComponent(doc.id)}`);await loadTeacherBoards();await loadPdf();els.loading.classList.add('hidden');els.workspace.classList.remove('hidden');setBoardOpen(true);teacherHeartbeat();clearInterval(state.heartbeatTimer);state.heartbeatTimer=setInterval(teacherHeartbeat,Number(CONFIG.TEACHER_HEARTBEAT_MS||5000));
}
async function handleDriveQuery(){const params=new URLSearchParams(location.search),drive=params.get('drive');if(!drive)return false;const fileId=extractDriveId(drive);if(!fileId)return false;const {data}=await supabase.from('snt_pdf_documents').select('*').eq('drive_file_id',fileId).limit(1).maybeSingle();if(data){await openTeacherDocument(data);return true;}els.newDriveUrl.value=params.get('source')||`https://drive.google.com/file/d/${fileId}/view`;els.newTitle.value=params.get('title')||'Drive PDF';await openLibrary();return true;}
async function bootTeacher(){
  bindCommon();bindTeacher();
  const {data:{session}}=await supabase.auth.getSession();state.session=session;
  if(!session){els.loading.classList.add('hidden');els.loginPanel.classList.remove('hidden');els.loginForm.addEventListener('submit',async e=>{e.preventDefault();const {data,error}=await supabase.auth.signInWithPassword({email:els.emailInput.value.trim(),password:els.passwordInput.value});if(error)return showError(error.message);state.session=data.session;els.loginPanel.classList.add('hidden');showLoading();await bootTeacherAfterLogin();});return;}
  await bootTeacherAfterLogin();
}
async function bootTeacherAfterLogin(){
  const p=new URLSearchParams(location.search),id=p.get('id');
  if(id){const {data,error}=await supabase.from('snt_pdf_documents').select('*').eq('id',id).maybeSingle();if(error||!data)return showError('Document not found.');await openTeacherDocument(data);return;}
  if(await handleDriveQuery())return;els.loading.classList.add('hidden');await openLibrary();
}
async function bootStudent(){
  bindCommon();state.token=new URLSearchParams(location.hash.replace(/^#/,'')).get('t');if(!state.token)return showError('This textbook link is missing or incomplete.');
  try{
    const init=await api('init');state.doc=init.document;state.revision=Number(init.document.revision||0);state.teacherOnline=!!init.teacher_online;state.studentHooked=init.document.student_hooked!==false;state.liveBoardNo=Math.max(1,Number(init.document.live_board_no||1));state.liveImageId=init.document.live_image_id||null;state.liveScrollRatio=Math.max(0,Math.min(1,Number(init.document.live_scroll_ratio||0)));state.liveCenterX=Math.max(0,Math.min(1,Number(init.document.live_center_x??.5)));state.liveCenterY=Math.max(0,Math.min(1,Number(init.document.live_center_y??.5)));state.liveZoom=Number(init.document.live_zoom||1);state.pageNo=Math.max(1,Number(init.document.live_page||1));state.boardNo=state.liveBoardNo;els.docTitle.textContent=init.document.title;els.contextText.textContent='Teacher annotations • view only';restoreStudentState();state.boardOpen=true;
    if(studentFollowActive()){state.pageNo=Math.max(1,Number(init.document.live_page||1));state.liveBoardNo=Math.max(1,Number(init.document.live_board_no||1));state.boardNo=state.liveBoardNo;}
    setBoardOpen(true);await loadPdf();els.loading.classList.add('hidden');els.workspace.classList.remove('hidden');
    state.pollTimer=setInterval(pollStudentSync,Number(CONFIG.STUDENT_POLL_MS||650));await pollStudentSync();
  }catch(e){showError(e.message);}
}

if('serviceWorker' in navigator){navigator.serviceWorker.register('./service-worker.js').catch(()=>{});}
if(TEACHER)bootTeacher().catch(e=>showError(e.message));else bootStudent().catch(e=>showError(e.message));
