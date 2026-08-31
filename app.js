import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const pdfjsLib = window.pdfjsLib;

if (!pdfjsLib) {
  throw new Error('PDF viewer library failed to load.');
}

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

const supabaseAuth = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'), loadingPanel: $('loadingPanel'), loadingText: $('loadingText'), errorPanel: $('errorPanel'), workspace: $('workspace'),
  bookTitle: $('bookTitle'), contextLine: $('contextLine'), pageInput: $('pageInput'), pageCountLabel: $('pageCountLabel'), prevBtn: $('prevBtn'), nextBtn: $('nextBtn'),
  pdfCanvas: $('pdfCanvas'), annotationCanvas: $('annotationCanvas'), canvasStack: $('canvasStack'), canvasScroller: $('canvasScroller'),
  toolButtons: [...document.querySelectorAll('.tool')], widthInput: $('widthInput'), colorInput: $('colorInput'), fingerDrawToggle: $('fingerDrawToggle'), layerSelect: $('layerSelect'),
  showShared: $('showShared'), showPrivate: $('showPrivate'), privateLabel: $('privateLabel'), showPrivateWrap: $('showPrivateWrap'), undoBtn: $('undoBtn'), clearBtn: $('clearBtn'),
  fitBtn: $('fitBtn'), toggleBoardBtn: $('toggleBoardBtn'), boardPanel: $('boardPanel'), boardCanvas: $('boardCanvas'), boardSubtitle: $('boardSubtitle'), boardNoLabel: $('boardNoLabel'),
  prevBoardBtn: $('prevBoardBtn'), nextBoardBtn: $('nextBoardBtn'), newBoardBtn: $('newBoardBtn'), saveStatus: $('saveStatus'), roleStatus: $('roleStatus')
};

const state = {
  token: null,
  meta: null,
  pdf: null,
  pageNo: 1,
  scale: 1.25,
  fitMode: true,
  rendering: false,
  pendingPage: null,
  tool: 'pen',
  strokes: new Map(), // key = `${page}:${layer}` -> array
  history: [],
  boardNo: 1,
  boardStrokes: new Map(), // key `${page}:${board}:${layer}`
  dirtyTimers: new Map(),
  loadedPages: new Set(),
  pointer: null,
  boardPointer: null,
  boardOpen: true
};

function fail(message) {
  els.loadingPanel.classList.add('hidden');
  els.workspace.classList.add('hidden');
  els.errorPanel.textContent = message;
  els.errorPanel.classList.remove('hidden');
}

function getTokenFromHash() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return hash.get('t');
}

function functionUrl(name) {
  return `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`;
}

async function api(action, body = null) {
  const method = body === null ? 'GET' : 'POST';
  const url = new URL(functionUrl(CONFIG.VIEWER_API_FUNCTION));
  url.searchParams.set('action', action);
  const headers = {
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_PUBLISHABLE_KEY,
    'x-viewer-token': state.token
  };
  const { data: { session } } = await supabaseAuth.auth.getSession();
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function annotationKey(page, layer) { return `${page}:${layer}`; }
function boardKey(page, board, layer) { return `${page}:${board}:${layer}`; }
function getStrokes(page, layer) {
  const key = annotationKey(page, layer);
  if (!state.strokes.has(key)) state.strokes.set(key, []);
  return state.strokes.get(key);
}
function getBoardStrokes(page, board, layer) {
  const key = boardKey(page, board, layer);
  if (!state.boardStrokes.has(key)) state.boardStrokes.set(key, []);
  return state.boardStrokes.get(key);
}

function layerCanEdit(layer) {
  if (!state.meta) return false;
  if (state.meta.role === 'teacher') return ['class_shared', 'teacher_private'].includes(layer);
  return layer === 'personal';
}

function visibleLayers() {
  const out = [];
  if (els.showShared.checked) out.push('class_shared');
  if (els.showPrivate.checked) out.push(state.meta.role === 'teacher' ? 'teacher_private' : 'personal');
  return out;
}

function setupLayers() {
  els.layerSelect.innerHTML = '';
  if (state.meta.role === 'teacher') {
    addLayerOption('class_shared', 'Class notes');
    addLayerOption('teacher_private', 'Teacher private');
    els.privateLabel.textContent = 'Teacher private';
  } else {
    addLayerOption('personal', 'My notes');
    els.privateLabel.textContent = 'My notes';
  }
}
function addLayerOption(value, label) {
  const opt = document.createElement('option');
  opt.value = value; opt.textContent = label; els.layerSelect.appendChild(opt);
}

function ingestInit(data) {
  state.meta = data.viewer;
  state.pageNo = Math.max(1, Number(data.viewer.start_page || 1));
  for (const row of data.annotations || []) {
    state.strokes.set(annotationKey(row.page_no, row.layer_type), Array.isArray(row.payload?.strokes) ? row.payload.strokes : []);
  }
  for (const row of data.boards || []) {
    state.boardStrokes.set(boardKey(row.page_no, row.board_no, row.layer_type), Array.isArray(row.payload?.strokes) ? row.payload.strokes : []);
  }
  setupLayers();
  els.bookTitle.textContent = data.viewer.textbook_title;
  const person = data.viewer.student_name ? ` • ${data.viewer.student_name}` : '';
  els.contextLine.textContent = `${data.viewer.class_name}${person}`;
  els.roleStatus.textContent = data.viewer.role === 'teacher' ? 'Teacher view' : 'Student view';
  if (state.meta.role !== 'teacher') els.clearBtn.textContent = 'Clear my notes';
}

async function loadPageData(pageNo) {
  if (state.loadedPages.has(pageNo)) return;
  const data = await api('page', { page_no: pageNo });
  for (const row of data.annotations || []) {
    state.strokes.set(annotationKey(row.page_no, row.layer_type), Array.isArray(row.payload?.strokes) ? row.payload.strokes : []);
  }
  for (const row of data.boards || []) {
    state.boardStrokes.set(boardKey(row.page_no, row.board_no, row.layer_type), Array.isArray(row.payload?.strokes) ? row.payload.strokes : []);
  }
  state.loadedPages.add(pageNo);
}

async function loadPdf() {
  els.loadingText.textContent = 'Loading textbook…';
  const pdfAccess = await api('pdf-url');
  if (!pdfAccess?.url) throw new Error('The textbook PDF is unavailable.');
  const task = pdfjsLib.getDocument({
    url: pdfAccess.url,
    rangeChunkSize: 262144,
    disableAutoFetch: true,
    disableStream: false
  });
  state.pdf = await task.promise;
  els.pageCountLabel.textContent = `/ ${state.pdf.numPages}`;
  els.pageInput.max = String(state.pdf.numPages);
  state.pageNo = Math.min(state.pageNo, state.pdf.numPages);
  els.pageInput.value = String(state.pageNo);
  await renderPage(state.pageNo);
}

async function renderPage(pageNo) {
  if (state.rendering) { state.pendingPage = pageNo; return; }
  state.rendering = true;
  try {
    const page = await state.pdf.getPage(pageNo);
    let viewport = page.getViewport({ scale: state.scale });
    if (state.fitMode) {
      const available = Math.max(280, els.canvasScroller.clientWidth - 36);
      const base = page.getViewport({ scale: 1 });
      state.scale = Math.min(2.3, Math.max(.55, available / base.width));
      viewport = page.getViewport({ scale: state.scale });
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    els.pdfCanvas.width = Math.floor(viewport.width * dpr);
    els.pdfCanvas.height = Math.floor(viewport.height * dpr);
    els.pdfCanvas.style.width = `${viewport.width}px`;
    els.pdfCanvas.style.height = `${viewport.height}px`;
    els.annotationCanvas.width = Math.floor(viewport.width * dpr);
    els.annotationCanvas.height = Math.floor(viewport.height * dpr);
    els.annotationCanvas.style.width = `${viewport.width}px`;
    els.annotationCanvas.style.height = `${viewport.height}px`;
    els.canvasStack.style.width = `${viewport.width}px`;
    els.canvasStack.style.height = `${viewport.height}px`;
    const ctx = els.pdfCanvas.getContext('2d', { alpha: false });
    await page.render({ canvasContext: ctx, viewport, transform: dpr === 1 ? null : [dpr,0,0,dpr,0,0] }).promise;
    state.pageNo = pageNo;
    els.pageInput.value = String(pageNo);
    els.prevBtn.disabled = pageNo <= 1;
    els.nextBtn.disabled = pageNo >= state.pdf.numPages;
    els.boardSubtitle.textContent = `Textbook page ${pageNo}`;
    state.boardNo = 1;
    updateBoardLabel();
    await loadPageData(pageNo);
    drawAnnotations();
    drawBoard();
  } finally {
    state.rendering = false;
    if (state.pendingPage !== null) {
      const p = state.pendingPage; state.pendingPage = null; renderPage(p);
    }
  }
}

function normPoint(evt, canvas) {
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (evt.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (evt.clientY - r.top) / r.height))
  };
}

function strokeStyle(ctx, stroke, canvas) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const rect = canvas.getBoundingClientRect();
  const intrinsicPerCss = rect.width ? canvas.width / rect.width : 1;
  ctx.lineWidth = Math.max(1, (stroke.width || 4) * intrinsicPerCss);
  ctx.strokeStyle = stroke.color || '#1f2937';
  ctx.globalAlpha = stroke.tool === 'highlighter' ? .28 : 1;
}

function renderStroke(ctx, stroke, canvas) {
  const w = canvas.width, h = canvas.height;
  if (stroke.tool === 'text') {
    ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = stroke.color || '#1f2937';
    const rect = canvas.getBoundingClientRect(); const intrinsicPerCss = rect.width ? canvas.width / rect.width : 1;
    const size = Math.max(12 * intrinsicPerCss, (stroke.width || 4) * 5 * intrinsicPerCss);
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.fillText(stroke.text || '', stroke.x * w, stroke.y * h); ctx.restore(); return;
  }
  if (!stroke.points?.length) return;
  ctx.save(); strokeStyle(ctx, stroke, canvas); ctx.beginPath();
  stroke.points.forEach((p, i) => { const x = p.x * w, y = p.y * h; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke(); ctx.restore();
}

function drawAnnotations() {
  const ctx = els.annotationCanvas.getContext('2d');
  ctx.clearRect(0, 0, els.annotationCanvas.width, els.annotationCanvas.height);
  for (const layer of visibleLayers()) for (const s of getStrokes(state.pageNo, layer)) renderStroke(ctx, s, els.annotationCanvas);
}

function drawBoard() {
  const ctx = els.boardCanvas.getContext('2d');
  ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,els.boardCanvas.width,els.boardCanvas.height); ctx.restore();
  // light ruled board
  ctx.save(); ctx.strokeStyle = '#e7ebef'; ctx.lineWidth = 1;
  for (let y=80; y<els.boardCanvas.height; y+=55) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(els.boardCanvas.width,y); ctx.stroke(); }
  ctx.restore();
  for (const layer of visibleLayers()) for (const s of getBoardStrokes(state.pageNo, state.boardNo, layer)) renderStroke(ctx, s, els.boardCanvas);
}

function activeLayer() { return els.layerSelect.value; }
function setSaveStatus(text) { els.saveStatus.textContent = text; }

function scheduleSave(kind, page, boardNo, layer) {
  const k = `${kind}:${page}:${boardNo || 0}:${layer}`;
  clearTimeout(state.dirtyTimers.get(k));
  setSaveStatus('Saving…');
  state.dirtyTimers.set(k, setTimeout(async () => {
    try {
      const strokes = kind === 'annotation' ? getStrokes(page, layer) : getBoardStrokes(page, boardNo, layer);
      await api('save', { kind, page_no: page, board_no: boardNo || 1, layer_type: layer, payload: { strokes } });
      setSaveStatus('Saved');
    } catch (e) { setSaveStatus(`Save failed: ${e.message}`); }
  }, 650));
}

function eraseNearest(strokes, p, radius=.035) {
  let best = -1, bestD = Infinity;
  strokes.forEach((s, i) => {
    const pts = s.tool === 'text' ? [{x:s.x,y:s.y}] : (s.points || []);
    for (const q of pts) {
      const d = Math.hypot(q.x-p.x, q.y-p.y);
      if (d < bestD) { bestD=d; best=i; }
    }
  });
  if (best >= 0 && bestD <= radius) { strokes.splice(best,1); return true; }
  return false;
}

function cloneValue(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function beginDraw(evt, kind) {
  if (kind === 'annotation' && evt.pointerType === 'touch' && !els.fingerDrawToggle.checked) return;
  const layer = activeLayer();
  if (!layerCanEdit(layer)) return;
  const canvas = kind === 'annotation' ? els.annotationCanvas : els.boardCanvas;
  const p = normPoint(evt, canvas);
  const list = kind === 'annotation' ? getStrokes(state.pageNo, layer) : getBoardStrokes(state.pageNo, state.boardNo, layer);
  if (state.tool === 'eraser') {
    if (eraseNearest(list, p)) {
      state.history.push({kind, page:state.pageNo, board:state.boardNo, layer, snapshot: cloneValue(list)});
      kind === 'annotation' ? drawAnnotations() : drawBoard();
      scheduleSave(kind, state.pageNo, state.boardNo, layer);
    }
    return;
  }
  if (state.tool === 'text') {
    const text = prompt('Text to add:');
    if (!text) return;
    list.push({ tool:'text', x:p.x, y:p.y, text:text.slice(0,300), color:els.colorInput.value, width:Number(els.widthInput.value) });
    kind === 'annotation' ? drawAnnotations() : drawBoard();
    scheduleSave(kind, state.pageNo, state.boardNo, layer);
    return;
  }
  const stroke = { tool:state.tool, color:els.colorInput.value, width:Number(els.widthInput.value), points:[p] };
  list.push(stroke);
  const pointerState = { pointerId:evt.pointerId, layer, stroke, kind, page:state.pageNo, board:state.boardNo };
  if (kind === 'annotation') state.pointer = pointerState; else state.boardPointer = pointerState;
  canvas.setPointerCapture?.(evt.pointerId);
}

function moveDraw(evt, kind) {
  const ps = kind === 'annotation' ? state.pointer : state.boardPointer;
  if (!ps || ps.pointerId !== evt.pointerId) return;
  const canvas = kind === 'annotation' ? els.annotationCanvas : els.boardCanvas;
  const p = normPoint(evt, canvas);
  const points = ps.stroke.points;
  const last = points && points.length ? points[points.length - 1] : null;
  if (!last || Math.hypot(p.x-last.x,p.y-last.y) > .002) ps.stroke.points.push(p);
  kind === 'annotation' ? drawAnnotations() : drawBoard();
}

function endDraw(evt, kind) {
  const ps = kind === 'annotation' ? state.pointer : state.boardPointer;
  if (!ps || ps.pointerId !== evt.pointerId) return;
  scheduleSave(kind, ps.page, ps.board, ps.layer);
  if (kind === 'annotation') state.pointer = null; else state.boardPointer = null;
}

function updateBoardLabel() {
  els.boardNoLabel.textContent = `Board ${state.boardNo}`;
  els.prevBoardBtn.disabled = state.boardNo <= 1;
}

function bindEvents() {
  state.boardOpen = window.innerWidth > 900;
  els.boardPanel.classList.toggle('open', state.boardOpen);
  els.toolButtons.forEach(btn => btn.addEventListener('click', () => {
    state.tool = btn.dataset.tool;
    els.toolButtons.forEach(b => b.classList.toggle('active', b === btn));
  }));
  els.prevBtn.addEventListener('click', () => state.pageNo > 1 && renderPage(state.pageNo - 1));
  els.nextBtn.addEventListener('click', () => state.pageNo < state.pdf.numPages && renderPage(state.pageNo + 1));
  els.pageInput.addEventListener('change', () => {
    const n = Math.min(state.pdf.numPages, Math.max(1, Number(els.pageInput.value)||1)); renderPage(n);
  });
  els.showShared.addEventListener('change', () => { drawAnnotations(); drawBoard(); });
  els.showPrivate.addEventListener('change', () => { drawAnnotations(); drawBoard(); });
  els.layerSelect.addEventListener('change', () => setSaveStatus(layerCanEdit(activeLayer()) ? 'Editable layer' : 'Read-only layer'));
  els.fingerDrawToggle.addEventListener('change', () => els.annotationCanvas.classList.toggle('finger-draw', els.fingerDrawToggle.checked));
  els.fitBtn.addEventListener('click', () => { state.fitMode = !state.fitMode; els.fitBtn.textContent = state.fitMode ? 'Fit' : '100%'; if (!state.fitMode) state.scale = 1; renderPage(state.pageNo); });
  els.toggleBoardBtn.addEventListener('click', () => { state.boardOpen = !state.boardOpen; els.boardPanel.classList.toggle('open', state.boardOpen); if (innerWidth > 900) els.boardPanel.style.display = state.boardOpen ? '' : 'none'; });
  els.prevBoardBtn.addEventListener('click', () => { if (state.boardNo>1){state.boardNo--;updateBoardLabel();drawBoard();} });
  els.nextBoardBtn.addEventListener('click', () => { state.boardNo++;updateBoardLabel();drawBoard(); });
  els.newBoardBtn.addEventListener('click', () => { state.boardNo++;updateBoardLabel();drawBoard(); });
  els.undoBtn.addEventListener('click', () => {
    const layer = activeLayer(); if (!layerCanEdit(layer)) return;
    const list = getStrokes(state.pageNo, layer); if (list.length) { list.pop(); drawAnnotations(); scheduleSave('annotation', state.pageNo, state.boardNo, layer); }
  });
  els.clearBtn.addEventListener('click', () => {
    const layer = activeLayer(); if (!layerCanEdit(layer)) return;
    if (!confirm('Clear the current page on this layer?')) return;
    state.strokes.set(annotationKey(state.pageNo, layer), []); drawAnnotations(); scheduleSave('annotation', state.pageNo, state.boardNo, layer);
  });
  ['pointerdown','pointermove','pointerup','pointercancel'].forEach(type => {
    els.annotationCanvas.addEventListener(type, e => ({pointerdown:beginDraw,pointermove:moveDraw,pointerup:endDraw,pointercancel:endDraw}[type])(e,'annotation'));
    els.boardCanvas.addEventListener(type, e => ({pointerdown:beginDraw,pointermove:moveDraw,pointerup:endDraw,pointercancel:endDraw}[type])(e,'board'));
  });
  let resizeTimer; window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer=setTimeout(()=>state.fitMode&&state.pdf&&renderPage(state.pageNo),250); });
}

async function boot() {
  document.title = CONFIG.APP_NAME || 'SNT PDF Board';
  state.token = getTokenFromHash();
  if (!state.token) return fail('This textbook link is missing or incomplete. Please open it from your class system.');
  if (CONFIG.SUPABASE_URL.includes('YOUR_PROJECT') || CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME')) return fail('App setup is incomplete. Add your Supabase URL and publishable key to config.js.');
  try {
    const data = await api('init');
    ingestInit(data);
    bindEvents();
    await loadPdf();
    els.loadingPanel.classList.add('hidden');
    els.workspace.classList.remove('hidden');
  } catch (e) { fail(e.message || 'Unable to open this textbook.'); }
}

boot();
