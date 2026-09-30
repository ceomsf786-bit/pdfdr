// SNT PDF Annotator v3.29 — Drive-backed insert: store source order only, never upload a merged PDF.
import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase=createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $=id=>document.getElementById(id);
const docId=()=>new URL(location.href).searchParams.get('id')||'';

async function headers(extra={}){
  const {data}=await supabase.auth.getSession();
  const token=data?.session?.access_token;
  if(!token)throw new Error('Teacher sign-in required.');
  return {Authorization:`Bearer ${token}`,apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,...extra};
}
function apiUrl(action,params={}){
  const u=new URL(`${CONFIG.SUPABASE_URL}/functions/v1/${CONFIG.API_FUNCTION}`);
  u.searchParams.set('action',action);u.searchParams.set('doc',docId());
  for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));
  return u.toString();
}
function setStatus(text){if($('statusText'))$('statusText').textContent=text;}
function currentPage(){return Math.max(1,Number($('pageInput')?.value||1));}
function visiblePageCount(){const m=String($('pageCount')?.textContent||'').match(/(\d+)/);return Math.max(1,Number(m?.[1]||1));}
function extractDriveId(value=''){
  const s=String(value||'').trim();
  if(/^[A-Za-z0-9_-]{20,}$/.test(s))return s;
  const patterns=[/\/file\/d\/([A-Za-z0-9_-]+)/,/\bid=([A-Za-z0-9_-]+)/,/\/d\/([A-Za-z0-9_-]+)/];
  for(const p of patterns){const m=s.match(p);if(m?.[1])return m[1];}
  return '';
}
async function incomingPageCount(fileId){
  setStatus('Checking Google Drive PDF…');
  const r=await fetch(apiUrl('drive-pdf',{fileId}),{headers:await headers(),cache:'no-store'});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||`Could not load Google Drive PDF (${r.status}).`);}
  const type=(r.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('pdf'))throw new Error('Google Drive did not return a PDF. Set sharing to Anyone with the link → Viewer.');
  if(!window.PDFLib?.PDFDocument)throw new Error('PDF engine is not ready.');
  const pdf=await window.PDFLib.PDFDocument.load(await r.arrayBuffer(),{ignoreEncryption:false});
  const count=pdf.getPageCount();
  if(!count)throw new Error('The Google Drive PDF has no pages.');
  return count;
}
async function insertDriveSource(fileId,insertBefore,total){
  const count=await incomingPageCount(fileId);
  setStatus(`Adding ${count} Drive page${count===1?'':'s'} to page order…`);
  const r=await fetch(apiUrl('insert-drive-source',{
    fileId,
    insertBefore,
    insertCount:count,
    basePageCount:total
  }),{method:'POST',headers:await headers({'Content-Type':'application/json'}),body:'{}'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){
    if((d.error||'').includes('LEGACY_COMPOSED_PDF'))throw new Error('This older PDF already contains a Supabase-merged insert. It stays readable, but new Drive-only inserts require a fresh Drive-backed PDF document.');
    throw new Error(d.error||d.detail||`Drive insert failed (${r.status}).`);
  }
  return d;
}
async function chooseAndInsert(){
  if(!docId())throw new Error('Open a PDF from the library first.');
  const link=prompt('Paste the Google Drive link for the PDF you want to insert.\n\nThe PDF stays on Google Drive. Sharing must be: Anyone with the link → Viewer.');
  if(link===null)return;
  const fileId=extractDriveId(link);
  if(!fileId)throw new Error('That does not look like a valid Google Drive PDF link.');

  const total=visiblePageCount(),suggested=Math.min(total+1,currentPage()+1);
  const raw=prompt(`Insert the whole Drive PDF BEFORE which page?\n\nEnter 1 to ${total+1}.\n${total+1} = add it at the end.`,String(suggested));
  if(raw===null)return;
  const before=Number(raw);
  if(!Number.isInteger(before)||before<1||before>total+1)throw new Error(`Enter a page number from 1 to ${total+1}.`);

  if(!confirm(`Insert the Google Drive PDF before page ${before}${before===total+1?' (at the end)':''}?\n\nNo combined PDF will be uploaded. SNT stores only the Drive source order. Existing annotations stay with their original pages.`))return;

  const done=await insertDriveSource(fileId,before,total);
  setStatus(`Added ${done.inserted_pages} Drive page${done.inserted_pages===1?'':'s'} — reloading…`);
  setTimeout(()=>location.reload(),350);
}
function init(){
  const btn=$('insertPdfBtn');if(!btn)return;
  btn.textContent='+ Insert Drive PDF';
  btn.title='Insert a Google Drive PDF by reference only — no merged PDF is uploaded';
  btn.addEventListener('click',()=>chooseAndInsert().catch(e=>{console.error(e);setStatus(e.message);alert(e.message);}));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
