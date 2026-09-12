import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

if(!document.querySelector('link[data-snt-links-css]')){
  const css=document.createElement('link');css.rel='stylesheet';css.href='./v320-links.css';css.dataset.sntLinksCss='1';document.head.appendChild(css);
}

const TEACHER = document.body.dataset.mode === 'teacher';
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);

function currentDocId(){return TEACHER?new URLSearchParams(location.search).get('id'):null;}
function currentStudentToken(){return TEACHER?null:new URLSearchParams(location.hash.replace(/^#/,'')).get('t');}
function safeHref(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}}

let panel,listEl,titleInput,urlInput,btn;

function buildUi(){
  const actions=document.querySelector('.top-actions');
  if(!actions)return;
  btn=document.createElement('button');
  btn.type='button';btn.className='btn compact snt-links-btn';btn.textContent='🔗 Links';btn.title=TEACHER?'Save useful links for this PDF':'Open teacher links';
  const anchor=$('toggleBoard');
  if(anchor?.parentNode===actions) actions.insertBefore(btn,anchor); else actions.appendChild(btn);

  panel=document.createElement('section');
  panel.className='snt-links-panel hidden';panel.setAttribute('aria-label','Saved links');
  panel.innerHTML=`<div class="snt-links-head"><strong>${TEACHER?'Saved links':'Teacher links'}</strong><button type="button" class="btn compact" data-close>Close</button></div><div class="snt-links-body">${TEACHER?`<form class="snt-links-form" data-form><input data-title maxlength="120" placeholder="Link name e.g. Video explanation"><input data-url type="url" inputmode="url" placeholder="https://..." required><button type="submit" class="btn primary compact">Save link</button><span class="snt-links-note">Saved only to this PDF. Students see the same list.</span></form>`:''}<div class="snt-links-list" data-list><div class="snt-link-empty">Loading links…</div></div></div>`;
  document.body.appendChild(panel);
  listEl=panel.querySelector('[data-list]');titleInput=panel.querySelector('[data-title]');urlInput=panel.querySelector('[data-url]');
  panel.querySelector('[data-close]').addEventListener('click',()=>panel.classList.add('hidden'));
  btn.addEventListener('click',async()=>{panel.classList.toggle('hidden');if(!panel.classList.contains('hidden'))await loadLinks();});
  panel.querySelector('[data-form]')?.addEventListener('submit',saveLink);
}

function renderLinks(links){
  listEl.replaceChildren();
  if(!links?.length){const e=document.createElement('div');e.className='snt-link-empty';e.textContent=TEACHER?'No saved links yet.':'No teacher links yet.';listEl.appendChild(e);return;}
  for(const item of links){
    const href=safeHref(item.url);if(!href)continue;
    const row=document.createElement('div');row.className='snt-link-row';
    const a=document.createElement('a');a.className='snt-link-open';a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=item.title||href;
    const small=document.createElement('span');small.className='snt-link-url';small.textContent=href;a.appendChild(small);row.appendChild(a);
    if(TEACHER){const del=document.createElement('button');del.type='button';del.className='snt-link-delete';del.textContent='×';del.title='Delete link';del.addEventListener('click',()=>deleteLink(item.id));row.appendChild(del);}
    listEl.appendChild(row);
  }
}

async function loadLinks(){
  try{
    const args=TEACHER?{p_document_id:currentDocId(),p_student_token:null}:{p_document_id:null,p_student_token:currentStudentToken()};
    const {data,error}=await supabase.rpc('snt_pdf_links_list',args);if(error)throw error;renderLinks(data||[]);
  }catch(e){listEl.innerHTML=`<div class="snt-link-empty">${String(e.message||e)}</div>`;}
}
async function saveLink(evt){
  evt.preventDefault();const href=safeHref(urlInput.value.trim());if(!href){urlInput.focus();return;}
  const {error}=await supabase.rpc('snt_pdf_links_create',{p_document_id:currentDocId(),p_title:titleInput.value.trim(),p_url:href});
  if(error){alert(error.message||'Could not save link');return;}titleInput.value='';urlInput.value='';await loadLinks();
}
async function deleteLink(id){
  const {error}=await supabase.rpc('snt_pdf_links_delete',{p_document_id:currentDocId(),p_link_id:id});
  if(error){alert(error.message||'Could not delete link');return;}await loadLinks();
}

buildUi();
