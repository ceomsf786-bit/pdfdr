import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = id => document.getElementById(id);
const FORMAT = 'SNT_PDF_ANNOTATOR_BACKUP';
const VERSION = 1;

function setStatus(message){ const el=$('statusText'); if(el) el.textContent=message; }
function safeName(v='SNT_PDF'){ return String(v||'SNT_PDF').trim().replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,100)||'SNT_PDF'; }
function stamp(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`; }
function imageExt(m=''){ return m==='image/jpeg'?'jpg':m==='image/webp'?'webp':m==='image/gif'?'gif':'png'; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function clone(v){ return JSON.parse(JSON.stringify(v)); }
function downloadBlob(blob,name){ const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000); }
function docId(){ return new URL(location.href).searchParams.get('id')||''; }
function currentPageCount(){ const t=$('pageCount')?.textContent||''; const m=t.match(/\/\s*(\d+)/); return m?Number(m[1]):0; }

async function sessionToken(){
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  const token=data?.session?.access_token;
  if(!token) throw new Error('Teacher sign-in is required.');
  return token;
}
function apiUrl(action, params={}){
  const u=new URL(`${CONFIG.SUPABASE_URL}/functions/v1/${CONFIG.API_FUNCTION}`);
  u.searchParams.set('action',action);
  u.searchParams.set('doc',docId());
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null)u.searchParams.set(k,String(v));
  return u.toString();
}
async function headers(extra={}){
  const token=await sessionToken();
  return {Authorization:`Bearer ${token}`,apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY,...extra};
}
async function api(action,params={}){
  const r=await fetch(apiUrl(action,params),{headers:await headers()});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||`Request failed (${r.status})`);
  return d;
}
async function currentDocument(){
  const id=docId(); if(!id) throw new Error('Open a PDF first.');
  const {data,error}=await supabase.from('snt_pdf_documents').select('id,title,drive_file_id,drive_share_url').eq('id',id).single();
  if(error) throw error; return data;
}

async function collectBackup(){
  const doc=await currentDocument();
  const [{data:pages,error:pe},{data:boards,error:be},{data:images,error:ie},galleryData]=await Promise.all([
    supabase.from('snt_pdf_pages').select('page_no,objects,updated_at').eq('document_id',doc.id).order('page_no'),
    supabase.from('snt_pdf_boards').select('board_no,title,text_content,objects,board_scope,page_no,is_permanent,updated_at').eq('document_id',doc.id).order('board_no'),
    supabase.from('snt_pdf_board_images').select('id,board_no,image_name,mime_type,file_size,sort_no,created_at').eq('document_id',doc.id).order('sort_no'),
    api('gallery-state')
  ]);
  if(pe)throw pe;if(be)throw be;if(ie)throw ie;
  const manifest={
    format:FORMAT,version:VERSION,app_version:'3.10',exported_at:new Date().toISOString(),
    document:{title:doc.title||'',drive_file_id:doc.drive_file_id||'',drive_share_url:doc.drive_share_url||'',source_document_id:doc.id,page_count:currentPageCount()},
    pages:(pages||[]).map(x=>({page_no:Number(x.page_no),objects:Array.isArray(x.objects)?x.objects:[],updated_at:x.updated_at||null})),
    boards:(boards||[]).map(x=>({board_no:Number(x.board_no),title:x.title||'',text_content:x.text_content||'',objects:Array.isArray(x.objects)?x.objects:[],board_scope:x.board_scope||'page',page_no:Number(x.page_no||1),is_permanent:!!x.is_permanent,updated_at:x.updated_at||null})),
    gallery:clone(galleryData?.gallery||galleryData||{version:2,width:2400,height:1800,objects:[],placements:{},legacy_migrated:true}),
    images:[]
  };
  for(let i=0;i<(images||[]).length;i++){
    const img=images[i]; setStatus(`Backup: collecting image ${i+1}/${images.length}…`);
    const ir=await fetch(apiUrl('image',{image:img.id}),{headers:await headers()});
    if(!ir.ok) throw new Error(`Could not back up image ${i+1}.`);
    const blob=await ir.blob(); let legacy=[];
    try{ const a=await api('image-annotations',{image:img.id}); legacy=Array.isArray(a.objects)?a.objects:[]; }catch{}
    manifest.images.push({old_id:img.id,board_no:Number(img.board_no||0),image_name:img.image_name||`Gallery image ${i+1}`,mime_type:img.mime_type||blob.type||'image/png',file_size:Number(img.file_size||blob.size||0),sort_no:Number(img.sort_no||i+1),created_at:img.created_at||null,backup_path:`images/${String(i+1).padStart(4,'0')}_${img.id}.${imageExt(img.mime_type||blob.type)}`,legacy_annotations:legacy,_blob:blob});
  }
  return manifest;
}

async function exportBackup(){
  if(!window.JSZip) return setStatus('Backup library did not load. Refresh once and try again.');
  try{
    setStatus('Preparing complete SNT backup…');
    await sleep(500); // allow normal annotation/notepad/gallery autosaves to finish
    const manifest=await collectBackup(),zip=new window.JSZip();
    const files=manifest.images.map(x=>({path:x.backup_path,blob:x._blob}));
    for(const x of manifest.images)delete x._blob;
    zip.file('manifest.json',JSON.stringify(manifest,null,2));
    for(const f of files)zip.file(f.path,f.blob,{binary:true,compression:'STORE'});
    setStatus('Packing backup into one file…');
    const blob=await zip.generateAsync({type:'blob',compression:'STORE'});
    downloadBlob(blob,`${safeName(manifest.document.title)}_${stamp()}.sntbackup`);
    setStatus(`Backup exported: ${manifest.pages.length} pages, ${manifest.boards.length} boards, ${manifest.images.length} gallery images`);
  }catch(e){ setStatus('Backup failed: '+(e?.message||e)); alert('Backup failed.\n\n'+(e?.message||e)); }
}

function validate(m){
  if(!m||m.format!==FORMAT) throw new Error('This is not an SNT PDF Annotator backup.');
  if(Number(m.version||0)>VERSION) throw new Error('This backup was made by a newer SNT version.');
  if(!Array.isArray(m.pages)||!Array.isArray(m.boards)||!Array.isArray(m.images)) throw new Error('Backup file is incomplete.');
  const permanents=m.boards.filter(b=>b.is_permanent===true);
  if(m.boards.length&&permanents.length!==1) throw new Error('Backup must contain exactly one permanent board.');
}
async function clearCurrent(doc){
  const {data:imgs,error}=await supabase.from('snt_pdf_board_images').select('id').eq('document_id',doc.id); if(error)throw error;
  for(let i=0;i<(imgs||[]).length;i++){
    setStatus(`Restore: clearing old gallery image ${i+1}/${imgs.length}…`);
    const r=await fetch(apiUrl('delete-image',{image:imgs[i].id}),{method:'POST',headers:await headers()});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error||'Could not clear an old gallery image.');}
  }
  let q=await supabase.from('snt_pdf_pages').delete().eq('document_id',doc.id); if(q.error)throw q.error;
  q=await supabase.from('snt_pdf_boards').delete().eq('document_id',doc.id); if(q.error)throw q.error;
}
function normaliseGallery(g={}){
  return {version:2,width:Math.max(1000,Number(g.width||2400)),height:Math.max(800,Number(g.height||1800)),objects:Array.isArray(g.objects)?g.objects:[],placements:g.placements&&typeof g.placements==='object'?g.placements:{},legacy_migrated:g.legacy_migrated!==false,updated_at:new Date().toISOString()};
}
async function restoreBackup(file){
  if(!window.JSZip) return setStatus('Backup library did not load. Refresh once and try again.');
  try{
    setStatus('Reading backup…');
    const zip=await window.JSZip.loadAsync(file),mf=zip.file('manifest.json'); if(!mf)throw new Error('Backup manifest is missing.');
    const m=JSON.parse(await mf.async('text')); validate(m); const doc=await currentDocument();
    const bd=String(m.document?.drive_file_id||''),cd=String(doc.drive_file_id||'');
    if(bd&&cd&&bd!==cd) throw new Error(`This backup belongs to a different Google Drive PDF (${m.document?.title||'unknown title'}). Open the matching PDF first.`);
    const bp=Number(m.document?.page_count||0),cp=currentPageCount();
    if(bp&&cp&&bp!==cp&&!confirm(`Warning: this backup was made for a ${bp}-page PDF, but the current PDF has ${cp} pages. Restore anyway?`)) return setStatus('Restore cancelled.');
    if(!confirm(`Restore backup for “${m.document?.title||doc.title}”?\n\nThis REPLACES the current PDF annotations, boards, gallery layout, gallery drawings and gallery images.\n\nThe Google Drive PDF itself and the student link are NOT changed.`)) return setStatus('Restore cancelled.');
    await clearCurrent(doc);
    const boards=m.boards.map(b=>({document_id:doc.id,board_no:Math.max(1,Number(b.board_no||1)),title:String(b.title||''),text_content:String(b.text_content||''),objects:Array.isArray(b.objects)?b.objects:[],board_scope:b.is_permanent?'global':'page',page_no:Math.max(1,Number(b.page_no||1)),is_permanent:!!b.is_permanent,updated_at:new Date().toISOString()}));
    if(!boards.length)boards.push({document_id:doc.id,board_no:1,title:'Permanent board',text_content:'',objects:[],board_scope:'global',page_no:1,is_permanent:true,updated_at:new Date().toISOString()});
    let q=await supabase.from('snt_pdf_boards').insert(boards); if(q.error)throw q.error;
    const pages=m.pages.filter(x=>Number(x.page_no)>0).map(x=>({document_id:doc.id,page_no:Number(x.page_no),objects:Array.isArray(x.objects)?x.objects:[],updated_at:new Date().toISOString()}));
    if(pages.length){q=await supabase.from('snt_pdf_pages').insert(pages);if(q.error)throw q.error;}
    const idMap={},sorted=[...m.images].sort((a,b)=>Number(a.sort_no||0)-Number(b.sort_no||0));
    for(let i=0;i<sorted.length;i++){
      const meta=sorted[i],zf=zip.file(meta.backup_path);if(!zf)throw new Error(`Image file missing from backup: ${meta.image_name||i+1}`);
      setStatus(`Restore: uploading gallery image ${i+1}/${sorted.length}…`);
      const blob=await zf.async('blob'),mime=meta.mime_type||blob.type||'image/png';
      const r=await fetch(apiUrl('upload-image',{gallery:1}),{method:'POST',headers:await headers({'Content-Type':mime,'x-file-name':encodeURIComponent(meta.image_name||`Restored image ${i+1}`)}),body:blob});
      const d=await r.json().catch(()=>({}));if(!r.ok||!d.image?.id)throw new Error(d.error||`Could not restore image ${i+1}.`);
      idMap[meta.old_id]=d.image.id;
      if(Array.isArray(meta.legacy_annotations)&&meta.legacy_annotations.length){
        const ar=await fetch(apiUrl('save-image-annotations',{image:d.image.id}),{method:'POST',headers:await headers({'Content-Type':'application/json'}),body:JSON.stringify({objects:meta.legacy_annotations})});
        if(!ar.ok)throw new Error(`Could not restore legacy annotations for image ${i+1}.`);
      }
    }
    const gallery=normaliseGallery(m.gallery||{}),placements={};
    for(const [oldId,p] of Object.entries(gallery.placements||{})){const newId=idMap[oldId];if(newId)placements[newId]=p;}
    gallery.placements=placements;gallery.legacy_migrated=true;
    const gr=await fetch(apiUrl('save-gallery-state'),{method:'POST',headers:await headers({'Content-Type':'application/json'}),body:JSON.stringify({gallery})});
    const gd=await gr.json().catch(()=>({}));if(!gr.ok)throw new Error(gd.error||'Could not restore gallery layout.');
    const permanent=boards.find(b=>b.is_permanent)||boards[0];
    q=await supabase.from('snt_pdf_documents').update({live_board_no:Number(permanent.board_no||1),live_image_id:null,updated_at:new Date().toISOString()}).eq('id',doc.id);if(q.error)throw q.error;
    setStatus(`Restore complete: ${m.pages.length} pages, ${m.boards.length} boards, ${m.images.length} gallery images`);
    alert('Restore complete. The app will reload now.');
    location.reload();
  }catch(e){ setStatus('Restore failed: '+(e?.message||e)); alert('Restore failed.\n\n'+(e?.message||e)); }
  finally{ const input=$('backupFileInput'); if(input)input.value=''; }
}

function bind(){
  const backup=$('backupPdfBtn'),imp=$('importBackupBtn'),input=$('backupFileInput');
  if(backup&&!backup.dataset.v310){backup.dataset.v310='1';backup.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();exportBackup();},{capture:true});}
  if(imp&&!imp.dataset.v310){imp.dataset.v310='1';imp.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();input?.click();},{capture:true});}
  if(input&&!input.dataset.v310){input.dataset.v310='1';input.addEventListener('change',e=>{e.stopImmediatePropagation();const f=input.files?.[0];if(f)restoreBackup(f);},{capture:true});}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
