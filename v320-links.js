import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

if(!document.querySelector('link[data-snt-links-css]')){
  const css=document.createElement('link');
  css.rel='stylesheet';
  css.href='./v320-links.css';
  css.dataset.sntLinksCss='1';
  document.head.appendChild(css);
}

const TEACHER = document.body.dataset.mode === 'teacher';
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

function currentDocId(){return TEACHER?new URLSearchParams(location.search).get('id'):null;}
function currentStudentToken(){return TEACHER?null:new URLSearchParams(location.hash.replace(/^#/,'')).get('t');}
function safeHref(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}

function embedHref(raw){
  const href=safeHref(raw);
  if(!href)return null;
  try{
    const u=new URL(href);
    const host=u.hostname.replace(/^www\./,'').toLowerCase();
    if(host==='youtu.be'){
      const id=u.pathname.split('/').filter(Boolean)[0];
      if(id)return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if(host==='youtube.com' || host==='m.youtube.com'){
      const id=u.searchParams.get('v');
      if(id)return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if(host==='drive.google.com'){
      const m=u.pathname.match(/\/file\/d\/([^/]+)/);
      if(m?.[1])return `https://drive.google.com/file/d/${encodeURIComponent(m[1])}/preview`;
    }
    if(host==='docs.google.com'){
      const m=u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if(m?.[1]&&m?.[2])return `https://docs.google.com/${m[1]}/d/${encodeURIComponent(m[2])}/preview`;
    }
  }catch{}
  return href;
}

let panel,listEl,titleInput,urlInput,btn;
let studentViewer=null,studentFrame=null,studentViewerTitle=null,studentExternal=null,studentMaxBtn=null;

function buildUi(){
  if(document.querySelector('.snt-links-btn'))return;
  const actions=document.querySelector('.top-actions');
  if(!actions)return;

  btn=document.createElement('button');
  btn.type='button';
  btn.className='btn compact snt-links-btn';
  btn.textContent='🔗 Links';
  btn.title=TEACHER?'Save useful links for this PDF':'Open teacher links';
  const anchor=$('toggleBoard');
  if(anchor?.parentNode===actions) actions.insertBefore(btn,anchor); else actions.appendChild(btn);

  panel=document.createElement('section');
  panel.className='snt-links-panel hidden';
  panel.setAttribute('aria-label','Saved links');
  panel.innerHTML=`<div class="snt-links-head"><strong>${TEACHER?'Saved links':'Teacher links'}</strong><button type="button" class="btn compact" data-close>Close</button></div><div class="snt-links-body">${TEACHER?`<form class="snt-links-form" data-form><input data-title maxlength="120" placeholder="Link name e.g. Video explanation"><input data-url type="url" inputmode="url" placeholder="https://..." required><button type="submit" class="btn primary compact">Save link</button><span class="snt-links-note">Saved only to this PDF. Students see the same list.</span></form>`:''}<div class="snt-links-list" data-list><div class="snt-link-empty">Loading links…</div></div></div>`;
  document.body.appendChild(panel);

  listEl=panel.querySelector('[data-list]');
  titleInput=panel.querySelector('[data-title]');
  urlInput=panel.querySelector('[data-url]');
  panel.querySelector('[data-close]').addEventListener('click',()=>panel.classList.add('hidden'));
  btn.addEventListener('click',async()=>{
    panel.classList.toggle('hidden');
    if(!panel.classList.contains('hidden'))await loadLinks();
  });
  panel.querySelector('[data-form]')?.addEventListener('submit',saveLink);
}

function ensureStudentViewer(){
  if(TEACHER)return null;
  if(studentViewer?.isConnected)return studentViewer;
  const pdfArea=document.querySelector('.pdf-area');
  if(!pdfArea)return null;

  studentViewer=document.createElement('section');
  studentViewer.className='snt-student-link-viewer hidden';
  studentViewer.innerHTML=`
    <div class="snt-student-link-head">
      <div class="snt-student-link-title"><strong data-view-title>Website</strong><small>Opened inside SNT</small></div>
      <div class="snt-student-link-actions">
        <button type="button" class="btn compact" data-max-link>Maximise</button>
        <a class="btn compact" data-open-external target="_blank" rel="noopener noreferrer">Open externally</a>
        <button type="button" class="btn compact" data-back-pdf>← Back to PDF</button>
      </div>
    </div>
    <div class="snt-student-link-fallback">If this site refuses to display here because of its own security settings, use <strong>Open externally</strong>.</div>
    <iframe class="snt-student-link-frame" title="Teacher link" loading="eager" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-downloads"></iframe>`;

  pdfArea.appendChild(studentViewer);
  studentFrame=studentViewer.querySelector('iframe');
  studentViewerTitle=studentViewer.querySelector('[data-view-title]');
  studentExternal=studentViewer.querySelector('[data-open-external]');
  studentMaxBtn=studentViewer.querySelector('[data-max-link]');

  studentViewer.querySelector('[data-back-pdf]').addEventListener('click',closeStudentResource);
  studentMaxBtn.addEventListener('click',()=>{
    const workspace=$('workspace');
    if(!workspace)return;
    const max=workspace.classList.toggle('snt-link-maximised');
    studentMaxBtn.textContent=max?'↕ Split view':'Maximise';
  });
  return studentViewer;
}

function openStudentResource(href,title){
  const viewer=ensureStudentViewer();
  if(!viewer)return;
  const pdfArea=document.querySelector('.pdf-area');
  const external=safeHref(href);
  const embedded=embedHref(href);
  if(!external||!embedded)return;

  panel?.classList.add('hidden');
  pdfArea?.classList.add('snt-link-opened');
  viewer.classList.remove('hidden');
  studentViewerTitle.textContent=title||external;
  studentExternal.href=external;
  studentFrame.src=embedded;
  $('statusText') && ($('statusText').textContent='Viewing teacher link inside SNT');
}

function closeStudentResource(){
  const pdfArea=document.querySelector('.pdf-area');
  const workspace=$('workspace');
  pdfArea?.classList.remove('snt-link-opened');
  workspace?.classList.remove('snt-link-maximised');
  if(studentMaxBtn)studentMaxBtn.textContent='Maximise';
  if(studentFrame)studentFrame.src='about:blank';
  studentViewer?.classList.add('hidden');
  $('statusText') && ($('statusText').textContent='View only');
}

function renderLinks(links){
  listEl.replaceChildren();
  if(!links?.length){
    const e=document.createElement('div');
    e.className='snt-link-empty';
    e.textContent=TEACHER?'No saved links yet.':'No teacher links yet.';
    listEl.appendChild(e);
    return;
  }

  for(const item of links){
    const href=safeHref(item.url);
    if(!href)continue;
    const row=document.createElement('div');
    row.className='snt-link-row';

    const a=document.createElement('a');
    a.className='snt-link-open';
    a.href=href;
    a.rel='noopener noreferrer';
    a.textContent=item.title||href;
    if(TEACHER){
      a.target='_blank';
    }else{
      a.removeAttribute('target');
      a.addEventListener('click',evt=>{
        evt.preventDefault();
        evt.stopPropagation();
        openStudentResource(href,item.title||href);
      });
    }

    const small=document.createElement('span');
    small.className='snt-link-url';
    small.textContent=href;
    a.appendChild(small);
    row.appendChild(a);

    if(TEACHER){
      const del=document.createElement('button');
      del.type='button';
      del.className='snt-link-delete';
      del.textContent='×';
      del.title='Delete link';
      del.addEventListener('click',()=>deleteLink(item.id));
      row.appendChild(del);
    }
    listEl.appendChild(row);
  }
}

async function loadLinks(){
  try{
    const args=TEACHER?{p_document_id:currentDocId(),p_student_token:null}:{p_document_id:null,p_student_token:currentStudentToken()};
    const {data,error}=await supabase.rpc('snt_pdf_links_list',args);
    if(error)throw error;
    renderLinks(data||[]);
  }catch(e){
    listEl.innerHTML=`<div class="snt-link-empty">${String(e.message||e)}</div>`;
  }
}

async function saveLink(evt){
  evt.preventDefault();
  const href=safeHref(urlInput.value.trim());
  if(!href){urlInput.focus();return;}
  const {error}=await supabase.rpc('snt_pdf_links_create',{p_document_id:currentDocId(),p_title:titleInput.value.trim(),p_url:href});
  if(error){alert(error.message||'Could not save link');return;}
  titleInput.value='';
  urlInput.value='';
  await loadLinks();
}

async function deleteLink(id){
  const {error}=await supabase.rpc('snt_pdf_links_delete',{p_document_id:currentDocId(),p_link_id:id});
  if(error){alert(error.message||'Could not delete link');return;}
  await loadLinks();
}

buildUi();
