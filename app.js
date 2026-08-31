import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const pdfjsLib = window.pdfjsLib;
if (!pdfjsLib) throw new Error('PDF viewer library failed to load.');
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const supabaseAuth = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const els = {
  loadingPanel:$('loadingPanel'), loadingText:$('loadingText'), errorPanel:$('errorPanel'), workspace:$('workspace'),
  bookTitle:$('bookTitle'), contextLine:$('contextLine'), liveStatus:$('liveStatus'),
  studentNotesBtn:$('studentNotesBtn'), toggleBoardBtn:$('toggleBoardBtn'), closeBoardBtn:$('closeBoardBtn'),
  zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), fitBtn:$('fitBtn'), zoomLabel:$('zoomLabel'), exportBtn:$('exportBtn'),
  toolRail:$('toolRail'), toolButtons:[...document.querySelectorAll('.tool')], widthInput:$('widthInput'), colorInput:$('colorInput'), fingerDrawToggle:$('fingerDrawToggle'),
  layerSelect:$('layerSelect'), showShared:$('showShared'), showPrivate:$('showPrivate'), privateLabel:$('privateLabel'), showPrivateWrap:$('showPrivateWrap'), undoBtn:$('undoBtn'), clearBtn:$('clearBtn'),
  pageInput:$('pageInput'), pageCountLabel:$('pageCountLabel'), prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), saveStatus:$('saveStatus'),
  pdfCanvas:$('pdfCanvas'), annotationCanvas:$('annotationCanvas'), canvasStack:$('canvasStack'), canvasScroller:$('canvasScroller'),
  boardPanel:$('boardPanel'), boardSubtitle:$('boardSubtitle'), boardNoLabel:$('boardNoLabel'), prevBoardBtn:$('prevBoardBtn'), nextBoardBtn:$('nextBoardBtn'), newBoardBtn:$('newBoardBtn'),
  boardLayerSelect:$('boardLayerSelect'), boardText:$('boardText'), boardSaveStatus:$('boardSaveStatus')
};

const state = {
  token:null, meta:null, pdf:null, pageNo:1, scale:1.15, fitMode:true, rendering:false, pendingPage:null,
  tool:'pen', strokes:new Map(), loadedPages:new Set(), dirtyTimers:new Map(), pointer:null,
  boardNo:1, boardTexts:new Map(), boardDirtyTimers:new Map(), boardOpen:false,
  notesMode:false, sharedVersions:new Map(), liveTimer:null, liveBusy:false
};

function fail(message){
  els.loadingPanel.classList.add('hidden');
  els.workspace.classList.add('hidden');
  els.errorPanel.textContent=message;
  els.errorPanel.classList.remove('hidden');
}
function getTokenFromHash(){return new URLSearchParams(location.hash.replace(/^#/,'')).get('t');}
function functionUrl(name){return `${CONFIG.SUPABASE_URL.replace(/\/$/,'')}/functions/v1/${name}`;}
async function api(action,body=null){
  const method=body===null?'GET':'POST';
  const url=new URL(functionUrl(CONFIG.VIEWER_API_FUNCTION));
  url.searchParams.set('action',action);
  const headers={'Content-Type':'application/json','apikey':CONFIG.SUPABASE_PUBLISHABLE_KEY,'x-viewer-token':state.token};
  const {data:{session}}=await supabaseAuth.auth.getSession();
  if(session?.access_token) headers.Authorization=`Bearer ${session.access_token}`;
  const res=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}

function annotationKey(page,layer){return `${page}:${layer}`;}
function boardKey(page,board,layer){return `${page}:${board}:${layer}`;}
function getStrokes(page,layer){const k=annotationKey(page,layer);if(!state.strokes.has(k))state.strokes.set(k,[]);return state.strokes.get(k);}
function getBoardText(page,board,layer){return state.boardTexts.get(boardKey(page,board,layer))||'';}
function setBoardText(page,board,layer,text){state.boardTexts.set(boardKey(page,board,layer),String(text||''));}
function layerCanEdit(layer){return state.meta?.role==='teacher'?['class_shared','teacher_private'].includes(layer):layer==='personal';}
function visibleLayers(){
  const out=[];
  if(els.showShared.checked)out.push('class_shared');
  if(els.showPrivate.checked)out.push(state.meta?.role==='teacher'?'teacher_private':'personal');
  return out;
}
function addOption(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);}
function setupLayers(){
  els.layerSelect.innerHTML='';
  els.boardLayerSelect.innerHTML='';
  if(state.meta.role==='teacher'){
    addOption(els.layerSelect,'class_shared','Class notes');
    addOption(els.layerSelect,'teacher_private','Teacher private');
    addOption(els.boardLayerSelect,'class_shared','Class board');
    addOption(els.boardLayerSelect,'teacher_private','Teacher private board');
    els.privateLabel.textContent='Teacher private';
  }else{
    addOption(els.layerSelect,'personal','My notes');
    addOption(els.boardLayerSelect,'class_shared','Teacher board');
    addOption(els.boardLayerSelect,'personal','My board');
    els.privateLabel.textContent='My notes';
  }
}
function ingestInit(data){
  state.meta=data.viewer;
  state.pageNo=Math.max(1,Number(data.viewer.start_page||1));
  setupLayers();
  els.bookTitle.textContent=data.viewer.textbook_title;
  const person=data.viewer.student_name?` • ${data.viewer.student_name}`:'';
  els.contextLine.textContent=`${data.viewer.class_name}${person}`;
  if(state.meta.role==='student'){
    document.body.classList.add('student-view');
    els.studentNotesBtn.classList.remove('hidden');
    els.liveStatus.textContent='Live class notes';
    els.liveStatus.classList.add('on');
    state.notesMode=false;
  }else{
    document.body.classList.add('teacher-view');
    els.liveStatus.textContent='Teacher view';
    els.liveStatus.classList.add('on');
    state.notesMode=true;
  }
  applyEditingMode();
}

function clearSharedForPage(pageNo){
  state.strokes.set(annotationKey(pageNo,'class_shared'),[]);
  for(const k of [...state.boardTexts.keys()]){
    if(k.startsWith(`${pageNo}:`) && k.endsWith(':class_shared')) state.boardTexts.delete(k);
  }
}
function applyPageData(data,pageNo,{sharedOnly=false}={}){
  if(sharedOnly) clearSharedForPage(pageNo);
  for(const row of data.annotations||[]){
    if(sharedOnly && row.layer_type!=='class_shared')continue;
    if(!sharedOnly && state.meta.role==='student' && row.layer_type==='personal' && state.dirtyTimers.has(`a:${pageNo}:personal`))continue;
    state.strokes.set(annotationKey(row.page_no,row.layer_type),Array.isArray(row.payload?.strokes)?row.payload.strokes:[]);
  }
  for(const row of data.boards||[]){
    if(sharedOnly && row.layer_type!=='class_shared')continue;
    const k=boardKey(row.page_no,row.board_no,row.layer_type);
    if(!sharedOnly && state.meta.role==='student' && row.layer_type==='personal' && state.boardDirtyTimers.has(k))continue;
    setBoardText(row.page_no,row.board_no,row.layer_type,typeof row.payload?.text==='string'?row.payload.text:'');
  }
  if(typeof data.shared_version==='string')state.sharedVersions.set(pageNo,data.shared_version);
  drawAnnotations();
  updateBoardEditor();
}
async function loadPageData(pageNo,{force=false,sharedOnly=false}={}){
  if(!force && state.loadedPages.has(pageNo))return;
  const data=await api('page',{page_no:pageNo});
  applyPageData(data,pageNo,{sharedOnly});
  if(!sharedOnly)state.loadedPages.add(pageNo);
}

async function loadPdf(){
  els.loadingText.textContent='Loading textbook…';
  const pdfAccess=await api('pdf-url');
  if(!pdfAccess?.url)throw new Error('The textbook PDF is unavailable.');
  const task=pdfjsLib.getDocument({url:pdfAccess.url,rangeChunkSize:262144,disableAutoFetch:true,disableStream:false});
  state.pdf=await task.promise;
  els.pageCountLabel.textContent=`/ ${state.pdf.numPages}`;
  els.pageInput.max=String(state.pdf.numPages);
  state.pageNo=Math.min(state.pageNo,state.pdf.numPages);
  els.pageInput.value=String(state.pageNo);
  await renderPage(state.pageNo);
}
function updateZoomLabel(){els.zoomLabel.textContent=state.fitMode?'Fit':`${Math.round(state.scale*100)}%`;}
async function renderPage(pageNo){
  if(!state.pdf)return;
  if(state.rendering){state.pendingPage=pageNo;return;}
  state.rendering=true;
  try{
    const page=await state.pdf.getPage(pageNo);
    let viewport=page.getViewport({scale:state.scale});
    if(state.fitMode){
      const available=Math.max(250,els.canvasScroller.clientWidth-16);
      const base=page.getViewport({scale:1});
      state.scale=Math.min(2.6,Math.max(.45,available/base.width));
      viewport=page.getViewport({scale:state.scale});
    }
    updateZoomLabel();
    const dpr=Math.min(window.devicePixelRatio||1,2);
    els.pdfCanvas.width=Math.floor(viewport.width*dpr);
    els.pdfCanvas.height=Math.floor(viewport.height*dpr);
    els.pdfCanvas.style.width=`${viewport.width}px`;
    els.pdfCanvas.style.height=`${viewport.height}px`;
    els.annotationCanvas.width=Math.floor(viewport.width*dpr);
    els.annotationCanvas.height=Math.floor(viewport.height*dpr);
    els.annotationCanvas.style.width=`${viewport.width}px`;
    els.annotationCanvas.style.height=`${viewport.height}px`;
    els.canvasStack.style.width=`${viewport.width}px`;
    els.canvasStack.style.height=`${viewport.height}px`;
    const ctx=els.pdfCanvas.getContext('2d',{alpha:false});
    await page.render({canvasContext:ctx,viewport,transform:dpr===1?null:[dpr,0,0,dpr,0,0]}).promise;
    state.pageNo=pageNo;
    els.pageInput.value=String(pageNo);
    els.prevBtn.disabled=pageNo<=1;
    els.nextBtn.disabled=pageNo>=state.pdf.numPages;
    els.boardSubtitle.textContent=`Textbook page ${pageNo}`;
    state.boardNo=1;
    updateBoardLabel();
    await loadPageData(pageNo);
    drawAnnotations();
    updateBoardEditor();
  }finally{
    state.rendering=false;
    if(state.pendingPage!==null){const p=state.pendingPage;state.pendingPage=null;renderPage(p);}
  }
}

function normPoint(evt,canvas){const r=canvas.getBoundingClientRect();return{x:Math.min(1,Math.max(0,(evt.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(evt.clientY-r.top)/r.height))};}
function strokeStyle(ctx,stroke,canvas){
  ctx.lineCap='round';ctx.lineJoin='round';
  const rect=canvas.getBoundingClientRect();const ratio=rect.width?canvas.width/rect.width:1;
  ctx.lineWidth=Math.max(1,(stroke.width||4)*ratio);
  ctx.strokeStyle=stroke.color||'#1f2937';ctx.globalAlpha=stroke.tool==='highlighter'?.28:1;
}
function renderStroke(ctx,stroke,canvas){
  const w=canvas.width,h=canvas.height;
  if(stroke.tool==='text'){
    ctx.save();ctx.globalAlpha=1;ctx.fillStyle=stroke.color||'#1f2937';
    const rect=canvas.getBoundingClientRect();const ratio=rect.width?canvas.width/rect.width:1;
    const size=Math.max(12*ratio,(stroke.width||4)*5*ratio);ctx.font=`${size}px system-ui, sans-serif`;
    ctx.fillText(stroke.text||'',stroke.x*w,stroke.y*h);ctx.restore();return;
  }
  if(!stroke.points?.length)return;
  ctx.save();strokeStyle(ctx,stroke,canvas);ctx.beginPath();
  stroke.points.forEach((p,i)=>{const x=p.x*w,y=p.y*h;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});
  ctx.stroke();ctx.restore();
}
function drawAnnotations(){
  const ctx=els.annotationCanvas.getContext('2d');ctx.clearRect(0,0,els.annotationCanvas.width,els.annotationCanvas.height);
  for(const layer of visibleLayers())for(const s of getStrokes(state.pageNo,layer))renderStroke(ctx,s,els.annotationCanvas);
}
function activeLayer(){return els.layerSelect.value;}
function setSaveStatus(text){els.saveStatus.textContent=text;}
function scheduleAnnotationSave(page,layer){
  const k=`a:${page}:${layer}`;clearTimeout(state.dirtyTimers.get(k));setSaveStatus('Saving…');
  state.dirtyTimers.set(k,setTimeout(async()=>{
    try{await api('save',{kind:'annotation',page_no:page,layer_type:layer,payload:{strokes:getStrokes(page,layer)}});setSaveStatus('Saved');}
    catch(e){setSaveStatus(`Save failed: ${e.message}`);}
    finally{state.dirtyTimers.delete(k);}
  },500));
}
function eraseNearest(strokes,p,radius=.035){
  let best=-1,bestD=Infinity;
  strokes.forEach((s,i)=>{const pts=s.tool==='text'?[{x:s.x,y:s.y}]:(s.points||[]);for(const q of pts){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<bestD){bestD=d;best=i;}}});
  if(best>=0&&bestD<=radius){strokes.splice(best,1);return true;}return false;
}
function beginDraw(evt){
  if(state.meta.role==='student'&&!state.notesMode)return;
  if(evt.pointerType==='touch'&&!els.fingerDrawToggle.checked)return;
  const layer=activeLayer();if(!layerCanEdit(layer))return;
  const p=normPoint(evt,els.annotationCanvas);const list=getStrokes(state.pageNo,layer);
  if(state.tool==='eraser'){if(eraseNearest(list,p)){drawAnnotations();scheduleAnnotationSave(state.pageNo,layer);}return;}
  if(state.tool==='text'){
    const text=prompt('Text to add:');if(!text)return;
    list.push({tool:'text',x:p.x,y:p.y,text:text.slice(0,300),color:els.colorInput.value,width:Number(els.widthInput.value)});
    drawAnnotations();scheduleAnnotationSave(state.pageNo,layer);return;
  }
  const stroke={tool:state.tool,color:els.colorInput.value,width:Number(els.widthInput.value),points:[p]};list.push(stroke);
  state.pointer={pointerId:evt.pointerId,layer,stroke,page:state.pageNo};els.annotationCanvas.setPointerCapture?.(evt.pointerId);
}
function moveDraw(evt){
  const ps=state.pointer;if(!ps||ps.pointerId!==evt.pointerId)return;
  const p=normPoint(evt,els.annotationCanvas);const pts=ps.stroke.points;const last=pts&&pts.length?pts[pts.length-1]:null;
  if(!last||Math.hypot(p.x-last.x,p.y-last.y)>.002)ps.stroke.points.push(p);drawAnnotations();
}
function endDraw(evt){const ps=state.pointer;if(!ps||ps.pointerId!==evt.pointerId)return;scheduleAnnotationSave(ps.page,ps.layer);state.pointer=null;}
function applyEditingMode(){
  const canEdit=state.meta?.role==='teacher'||state.notesMode;
  els.annotationCanvas.classList.toggle('view-only',!canEdit);
  els.annotationCanvas.classList.toggle('editing',canEdit&&els.fingerDrawToggle.checked);
  if(state.meta?.role==='student'){
    document.body.classList.toggle('notes-mode',state.notesMode);
    els.studentNotesBtn.textContent=state.notesMode?'Close notes':'My notes';
  }
}

function boardLayer(){return els.boardLayerSelect.value;}
function boardLayerCanEdit(layer){return state.meta.role==='teacher'?['class_shared','teacher_private'].includes(layer):layer==='personal';}
function updateBoardLabel(){els.boardNoLabel.textContent=`Board ${state.boardNo}`;els.prevBoardBtn.disabled=state.boardNo<=1;}
function updateBoardEditor(){
  if(!state.meta)return;
  const layer=boardLayer()||'class_shared';const editable=boardLayerCanEdit(layer);
  els.boardText.readOnly=!editable;
  els.boardText.value=getBoardText(state.pageNo,state.boardNo,layer);
  els.boardText.placeholder=editable?'Type or paste lesson notes here…':'Teacher board — view only';
  els.boardSaveStatus.textContent=editable?'Type or paste — autosaves':'View only';
}
function scheduleBoardSave(){
  const layer=boardLayer();if(!boardLayerCanEdit(layer))return;
  const page=state.pageNo,board=state.boardNo,k=boardKey(page,board,layer);
  setBoardText(page,board,layer,els.boardText.value);
  clearTimeout(state.boardDirtyTimers.get(k));els.boardSaveStatus.textContent='Saving…';
  state.boardDirtyTimers.set(k,setTimeout(async()=>{
    try{await api('save',{kind:'board',page_no:page,board_no:board,layer_type:layer,payload:{text:getBoardText(page,board,layer)}});els.boardSaveStatus.textContent='Saved';}
    catch(e){els.boardSaveStatus.textContent=`Save failed: ${e.message}`;}
    finally{state.boardDirtyTimers.delete(k);}
  },450));
}
function openBoard(open){
  state.boardOpen=open;els.boardPanel.classList.toggle('open',open);els.toggleBoardBtn.textContent=open?'Hide board':'Noteboard';
  if(state.fitMode&&state.pdf)setTimeout(()=>renderPage(state.pageNo),80);
}

async function pollLive(){
  if(state.meta?.role!=='student'||state.liveBusy||document.hidden||!state.pdf)return;
  state.liveBusy=true;
  try{
    const data=await api('page-version',{page_no:state.pageNo});
    const previous=state.sharedVersions.get(state.pageNo)||'';
    if(data.shared_version!==previous){
      await loadPageData(state.pageNo,{force:true,sharedOnly:true});
      els.liveStatus.textContent='Updated just now';
      setTimeout(()=>{if(state.meta?.role==='student')els.liveStatus.textContent='Live class notes';},1200);
    }
  }catch(e){els.liveStatus.textContent='Live retrying…';els.liveStatus.classList.remove('on');}
  finally{state.liveBusy=false;}
}
function startLive(){if(state.meta.role!=='student')return;clearInterval(state.liveTimer);state.liveTimer=setInterval(pollLive,2500);}

function clampScale(v){return Math.min(3.5,Math.max(.45,v));}
function zoomBy(delta){state.fitMode=false;state.scale=clampScale(state.scale+delta);renderPage(state.pageNo);}
function sanitizeFileName(name){return String(name||'textbook').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,100)||'textbook';}
function hexRgb(hex){
  const s=String(hex||'#1f2937').replace('#','');
  const v=s.length===3?s.split('').map(c=>c+c).join(''):s.padEnd(6,'0').slice(0,6);
  return [parseInt(v.slice(0,2),16)/255,parseInt(v.slice(2,4),16)/255,parseInt(v.slice(4,6),16)/255];
}
async function exportPdf(){
  const PDFLib=window.PDFLib;if(!PDFLib)return alert('Export library did not load. Please refresh and try again.');
  const old=els.exportBtn.textContent;els.exportBtn.disabled=true;els.exportBtn.textContent='Exporting…';
  try{
    const [{annotations=[]},pdfAccess]=await Promise.all([api('all-annotations',{}),api('pdf-url')]);
    const source=await fetch(pdfAccess.url);if(!source.ok)throw new Error('Could not download the textbook for export.');
    const bytes=await source.arrayBuffer();const doc=await PDFLib.PDFDocument.load(bytes);const pages=doc.getPages();
    for(const row of annotations){
      const page=pages[Number(row.page_no)-1];if(!page)continue;
      const size=page.getSize();
      for(const stroke of row.payload?.strokes||[]){
        const [r,g,b]=hexRgb(stroke.color);const color=PDFLib.rgb(r,g,b);
        if(stroke.tool==='text'){
          try{page.drawText(String(stroke.text||'').slice(0,300),{x:Number(stroke.x||0)*size.width,y:size.height-Number(stroke.y||0)*size.height,size:Math.max(8,Number(stroke.width||4)*3.2),color,opacity:1});}catch{/* skip unsupported text glyphs */}
          continue;
        }
        const pts=stroke.points||[];if(pts.length<2)continue;
        for(let i=1;i<pts.length;i++){
          page.drawLine({start:{x:pts[i-1].x*size.width,y:size.height-pts[i-1].y*size.height},end:{x:pts[i].x*size.width,y:size.height-pts[i].y*size.height},thickness:Math.max(.7,Number(stroke.width||4)*.75),color,opacity:stroke.tool==='highlighter'?.28:1});
        }
      }
    }
    const out=await doc.save();const blob=new Blob([out],{type:'application/pdf'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${sanitizeFileName(state.meta.textbook_title)}_annotated.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }catch(e){alert(e.message||'Export failed.');}
  finally{els.exportBtn.disabled=false;els.exportBtn.textContent=old;}
}

function bindEvents(){
  els.toolButtons.forEach(btn=>btn.addEventListener('click',()=>{state.tool=btn.dataset.tool;els.toolButtons.forEach(b=>b.classList.toggle('active',b===btn));}));
  els.prevBtn.addEventListener('click',()=>state.pageNo>1&&renderPage(state.pageNo-1));
  els.nextBtn.addEventListener('click',()=>state.pdf&&state.pageNo<state.pdf.numPages&&renderPage(state.pageNo+1));
  els.pageInput.addEventListener('change',()=>{const n=Math.min(state.pdf.numPages,Math.max(1,Number(els.pageInput.value)||1));renderPage(n);});
  els.showShared.addEventListener('change',drawAnnotations);els.showPrivate.addEventListener('change',drawAnnotations);
  els.fingerDrawToggle.addEventListener('change',applyEditingMode);
  els.undoBtn.addEventListener('click',()=>{const layer=activeLayer();if(!layerCanEdit(layer))return;const list=getStrokes(state.pageNo,layer);if(list.length){list.pop();drawAnnotations();scheduleAnnotationSave(state.pageNo,layer);}});
  els.clearBtn.addEventListener('click',()=>{const layer=activeLayer();if(!layerCanEdit(layer))return;if(!confirm('Clear the current PDF page on this layer?'))return;state.strokes.set(annotationKey(state.pageNo,layer),[]);drawAnnotations();scheduleAnnotationSave(state.pageNo,layer);});
  els.annotationCanvas.addEventListener('pointerdown',beginDraw);els.annotationCanvas.addEventListener('pointermove',moveDraw);els.annotationCanvas.addEventListener('pointerup',endDraw);els.annotationCanvas.addEventListener('pointercancel',endDraw);

  els.studentNotesBtn.addEventListener('click',()=>{state.notesMode=!state.notesMode;applyEditingMode();if(state.fitMode)setTimeout(()=>renderPage(state.pageNo),80);});
  els.toggleBoardBtn.addEventListener('click',()=>openBoard(!state.boardOpen));els.closeBoardBtn.addEventListener('click',()=>openBoard(false));
  els.boardLayerSelect.addEventListener('change',updateBoardEditor);els.boardText.addEventListener('input',scheduleBoardSave);
  els.prevBoardBtn.addEventListener('click',()=>{if(state.boardNo>1){state.boardNo--;updateBoardLabel();updateBoardEditor();}});
  els.nextBoardBtn.addEventListener('click',()=>{state.boardNo++;updateBoardLabel();updateBoardEditor();});
  els.newBoardBtn.addEventListener('click',()=>{state.boardNo++;updateBoardLabel();updateBoardEditor();if(!els.boardText.readOnly)els.boardText.focus();});

  els.fitBtn.addEventListener('click',()=>{state.fitMode=true;renderPage(state.pageNo);});
  els.zoomOutBtn.addEventListener('click',()=>zoomBy(-.15));els.zoomInBtn.addEventListener('click',()=>zoomBy(.15));
  els.exportBtn.addEventListener('click',exportPdf);
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>state.fitMode&&state.pdf&&renderPage(state.pageNo),200);});
}

async function boot(){
  document.title=CONFIG.APP_NAME||'SNT PDF Board';state.token=getTokenFromHash();
  if(!state.token)return fail('This textbook link is missing or incomplete. Please open it from your class system.');
  if(CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')||CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME'))return fail('App setup is incomplete. Add your Supabase URL and publishable key to config.js.');
  try{
    const data=await api('init');ingestInit(data);bindEvents();openBoard(false);await loadPdf();startLive();
    els.loadingPanel.classList.add('hidden');els.workspace.classList.remove('hidden');
    if(state.fitMode)setTimeout(()=>renderPage(state.pageNo),60);
  }catch(e){fail(e.message||'Unable to open this textbook.');}
}

boot();
