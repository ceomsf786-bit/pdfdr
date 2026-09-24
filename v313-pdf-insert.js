// SNT PDF Annotator v3.26 — insert a Google Drive PDF anywhere into the current document.
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

async function fetchCurrentPdf(){
  const r=await fetch(apiUrl('pdf'),{headers:await headers()});
  if(!r.ok)throw new Error('Could not load the current PDF.');
  return new Uint8Array(await r.arrayBuffer());
}

async function fetchDrivePdf(fileId){
  setStatus('Loading PDF from Google Drive…');
  const r=await fetch(apiUrl('drive-pdf',{fileId}),{headers:await headers()});
  if(!r.ok){
    const d=await r.json().catch(()=>({}));
    throw new Error(d.error||`Could not load Google Drive PDF (${r.status}).`);
  }
  const type=(r.headers.get('content-type')||'').toLowerCase();
  if(!type.includes('pdf'))throw new Error('Google Drive did not return a PDF. Make sure sharing is Anyone with the link → Viewer.');
  return new Uint8Array(await r.arrayBuffer());
}

async function mergeAt(fileId,insertBefore){
  if(!window.PDFLib?.PDFDocument)throw new Error('PDF engine is not ready.');
  setStatus('Preparing PDF insertion…');
  const [currentBytes,incomingBytes]=await Promise.all([fetchCurrentPdf(),fetchDrivePdf(fileId)]);
  const {PDFDocument}=window.PDFLib;
  const current=await PDFDocument.load(currentBytes,{ignoreEncryption:false});
  const incoming=await PDFDocument.load(incomingBytes,{ignoreEncryption:false});
  const incomingCount=incoming.getPageCount();
  if(!incomingCount)throw new Error('The Google Drive PDF has no pages.');
  const currentCount=current.getPageCount();
  const before=Math.max(1,Math.min(currentCount+1,Number(insertBefore)||currentCount+1));

  const merged=await PDFDocument.create();
  const leftIndexes=Array.from({length:before-1},(_,i)=>i);
  const rightIndexes=Array.from({length:currentCount-(before-1)},(_,i)=>before-1+i);
  if(leftIndexes.length){const pages=await merged.copyPages(current,leftIndexes);pages.forEach(p=>merged.addPage(p));}
  const inserted=await merged.copyPages(incoming,incoming.getPageIndices());inserted.forEach(p=>merged.addPage(p));
  if(rightIndexes.length){const pages=await merged.copyPages(current,rightIndexes);pages.forEach(p=>merged.addPage(p));}
  const out=await merged.save();
  if(out.byteLength>80*1024*1024)throw new Error('The merged PDF is too large (maximum 80 MB).');

  setStatus(`Saving ${incomingCount} inserted page${incomingCount===1?'':'s'}…`);
  const r=await fetch(apiUrl('save-composed-pdf',{insertBefore:before,insertCount:incomingCount,newPageCount:merged.getPageCount()}),{
    method:'POST',headers:await headers({'Content-Type':'application/pdf','x-file-name':'inserted-from-drive.pdf'}),body:out
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||d.detail||`PDF insert failed (${r.status}).`);
  return {before,incomingCount,total:merged.getPageCount()};
}

async function chooseAndInsert(){
  if(!docId())throw new Error('Open a PDF from the library first.');

  const link=prompt('Paste the Google Drive link for the PDF you want to insert.\n\nSharing must be: Anyone with the link → Viewer.');
  if(link===null)return;
  const fileId=extractDriveId(link);
  if(!fileId)throw new Error('That does not look like a valid Google Drive PDF link.');

  const total=visiblePageCount(),suggested=Math.min(total+1,currentPage()+1);
  const raw=prompt(`Insert the whole Drive PDF BEFORE which page?\n\nEnter 1 to ${total+1}.\n${total+1} = add it at the end.`,String(suggested));
  if(raw===null)return;
  const before=Number(raw);
  if(!Number.isInteger(before)||before<1||before>total+1)throw new Error(`Enter a page number from 1 to ${total+1}.`);

  if(!confirm(`Insert the Google Drive PDF before page ${before}${before===total+1?' (at the end)':''}?\n\nExisting annotations will stay with their original pages.`))return;

  const done=await mergeAt(fileId,before);
  setStatus(`Inserted ${done.incomingCount} page${done.incomingCount===1?'':'s'} — reloading…`);
  setTimeout(()=>location.reload(),450);
}

function init(){
  const btn=$('insertPdfBtn');if(!btn)return;
  btn.textContent='+ Insert Drive PDF';
  btn.title='Insert all pages from a Google Drive PDF anywhere in this document';
  btn.addEventListener('click',()=>chooseAndInsert().catch(e=>{console.error(e);setStatus(e.message);alert(e.message);}));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
