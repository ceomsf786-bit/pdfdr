import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const els = {
  loginCard:$('loginCard'), dashboard:$('dashboard'), loginForm:$('loginForm'), emailInput:$('emailInput'), passwordInput:$('passwordInput'), signOutBtn:$('signOutBtn'), message:$('adminMessage'),
  classForm:$('classForm'), classNameInput:$('classNameInput'), classList:$('classList'),
  bookForm:$('bookForm'), bookTitleInput:$('bookTitleInput'), bookFileInput:$('bookFileInput'), bookUploadBtn:$('bookUploadBtn'), bookUploadStatus:$('bookUploadStatus'), storageSummary:$('storageSummary'), bookList:$('bookList'),
  studentForm:$('studentForm'), studentNameInput:$('studentNameInput'), studentClassSelect:$('studentClassSelect'), studentList:$('studentList'),
  assignForm:$('assignForm'), assignBookSelect:$('assignBookSelect'), assignClassSelect:$('assignClassSelect'), assignmentList:$('assignmentList'),
  studentLinkForm:$('studentLinkForm'), linkStudentSelect:$('linkStudentSelect'), linkBookSelect:$('linkBookSelect'), linkExpirySelect:$('linkExpirySelect'),
  teacherLinkForm:$('teacherLinkForm'), teacherClassSelect:$('teacherClassSelect'), teacherBookSelect:$('teacherBookSelect'),
  generatedLinkPanel:$('generatedLinkPanel'), generatedLinkInput:$('generatedLinkInput'), copyLinkBtn:$('copyLinkBtn'), openLinkBtn:$('openLinkBtn'), linksList:$('linksList')
};

const bucket = CONFIG.TEXTBOOK_BUCKET || 'snt-textbooks';
const maxUploadBytes = Number(CONFIG.MAX_UPLOAD_MB || 50) * 1024 * 1024;
let data = { classes:[], books:[], students:[], assignments:[], links:[] };

function showMessage(text,isError=false){
  els.message.textContent=text;els.message.classList.remove('hidden');els.message.style.background=isError?'#fff4f4':'#eef6ff';
  setTimeout(()=>els.message.classList.add('hidden'),4500);
}
function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function randomToken(){const a=new Uint8Array(32);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function sha256Hex(s){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function viewerBaseUrl(){const u=new URL('./index.html',location.href);u.hash='';return u.href;}
function linkFromToken(token){return `${viewerBaseUrl()}#t=${token}`;}
function setOptions(select,items,labelFn){select.innerHTML='';if(!items.length){select.add(new Option('— none yet —',''));return;}for(const x of items)select.add(new Option(labelFn(x),x.id));}
function className(id){return data.classes.find(x=>x.id===id)?.name||'Unknown class';}
function bookName(id){return data.books.find(x=>x.id===id)?.title||'Unknown textbook';}
function studentName(id){return data.students.find(x=>x.id===id)?.name||'Unknown student';}
function formatBytes(n){const v=Number(n||0);if(!v)return'0 B';const units=['B','KB','MB','GB'];let x=v,i=0;while(x>=1024&&i<units.length-1){x/=1024;i++;}return`${x>=10||i===0?x.toFixed(0):x.toFixed(1)} ${units[i]}`;}
function safeFileName(name){const clean=String(name||'textbook.pdf').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(-120)||'textbook.pdf';return/\.pdf$/i.test(clean)?clean:`${clean}.pdf`;}
function makeUuid(){if(crypto.randomUUID)return crypto.randomUUID();const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();}
}
function setUploadBusy(busy,text=''){
  els.bookUploadBtn.disabled=busy;els.bookFileInput.disabled=busy;els.bookTitleInput.disabled=busy;els.bookUploadBtn.textContent=busy?'Uploading…':'Upload textbook';
  els.bookUploadStatus.textContent=text||`Maximum configured upload: ${CONFIG.MAX_UPLOAD_MB||50} MB.`;els.bookUploadStatus.classList.toggle('busy',busy);
}

async function assertTeacher(){
  const {data:{user}}=await supabase.auth.getUser();if(!user)return false;
  const {data:profile,error}=await supabase.from('profiles').select('role,display_name').eq('id',user.id).single();
  if(error||profile?.role!=='teacher'){await supabase.auth.signOut();throw new Error('This account is not configured as a teacher.');}
  return true;
}
async function refresh(){
  const [classes,books,students,assignments,links]=await Promise.all([
    supabase.from('classes').select('*').order('name'),
    supabase.from('textbooks').select('*').order('title'),
    supabase.from('students').select('*').order('name'),
    supabase.from('textbook_classes').select('*').order('created_at',{ascending:false}),
    supabase.from('access_links').select('id,textbook_id,class_id,student_id,role,expires_at,revoked,created_at,token_plain').order('created_at',{ascending:false}).limit(200)
  ]);
  for(const r of [classes,books,students,assignments,links])if(r.error)throw r.error;
  data={classes:classes.data||[],books:books.data||[],students:students.data||[],assignments:assignments.data||[],links:links.data||[]};render();
}
function render(){
  els.classList.innerHTML=data.classes.map(x=>`<div class="item"><div class="item-main"><strong>${escapeHtml(x.name)}</strong></div><div class="item-actions"><button class="btn compact danger" data-del-class="${x.id}">Delete</button></div></div>`).join('')||'<small>No classes yet.</small>';
  els.bookList.innerHTML=data.books.map(x=>{const stored=x.storage_path?`${formatBytes(x.file_size)} • private Supabase PDF`:'PDF not uploaded';return`<div class="item"><div class="item-main"><strong>${escapeHtml(x.title)}</strong><span>${escapeHtml(stored)}</span></div><div class="item-actions"><button class="btn compact danger" data-del-book="${x.id}">Delete</button></div></div>`;}).join('')||'<small>No textbooks yet.</small>';
  const total=data.books.reduce((sum,x)=>sum+Number(x.file_size||0),0);els.storageSummary.textContent=`${data.books.filter(x=>x.storage_path).length} PDF(s) registered • about ${formatBytes(total)} total`;
  els.studentList.innerHTML=data.students.map(x=>`<div class="item"><div class="item-main"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(className(x.class_id))}</span></div><div class="item-actions"><button class="btn compact danger" data-del-student="${x.id}">Delete</button></div></div>`).join('')||'<small>No students yet.</small>';
  els.assignmentList.innerHTML=data.assignments.map(x=>`<div class="item"><div class="item-main"><strong>${escapeHtml(bookName(x.textbook_id))}</strong><span>${escapeHtml(className(x.class_id))}</span></div><button class="btn compact danger" data-del-assignment="${x.id}">Remove</button></div>`).join('')||'<small>No assignments yet.</small>';

  els.linksList.innerHTML=data.links.map(x=>{
    const copy=x.token_plain?`<button class="btn compact" data-copy-link="${x.id}">Copy link</button>`:`<button class="btn compact" disabled title="Old link: recreate once to enable copying">Copy unavailable</button>`;
    const revoke=`<button class="btn compact danger" data-revoke-link="${x.id}" ${x.revoked?'disabled':''}>${x.revoked?'Revoked':'Revoke'}</button>`;
    const del=`<button class="btn compact danger" data-delete-link="${x.id}">Delete</button>`;
    return`<div class="item"><div class="item-main"><strong>${x.role==='teacher'?'Teacher':'Student'} • ${escapeHtml(bookName(x.textbook_id))}</strong><span>${escapeHtml(className(x.class_id))}${x.student_id?' • '+escapeHtml(studentName(x.student_id)):''}${x.expires_at?' • expires '+new Date(x.expires_at).toLocaleDateString():''}${x.revoked?' • REVOKED':''}</span></div><div class="item-actions">${copy}${revoke}${del}</div></div>`;
  }).join('')||'<small>No links yet.</small>';

  [els.studentClassSelect,els.assignClassSelect,els.teacherClassSelect].forEach(s=>setOptions(s,data.classes,x=>x.name));
  [els.assignBookSelect,els.linkBookSelect,els.teacherBookSelect].forEach(s=>setOptions(s,data.books.filter(x=>x.storage_path),x=>x.title));
  setOptions(els.linkStudentSelect,data.students,x=>`${x.name} — ${className(x.class_id)}`);
}
async function doInsert(table,row){const {error}=await supabase.from(table).insert(row);if(error)throw error;await refresh();}

els.loginForm.addEventListener('submit',async e=>{e.preventDefault();try{const {error}=await supabase.auth.signInWithPassword({email:els.emailInput.value.trim(),password:els.passwordInput.value});if(error)throw error;await enterDashboard();}catch(err){showMessage(err.message,true);}});
els.signOutBtn.addEventListener('click',async()=>{await supabase.auth.signOut();location.reload();});
els.classForm.addEventListener('submit',async e=>{e.preventDefault();try{await doInsert('classes',{name:els.classNameInput.value.trim()});els.classNameInput.value='';}catch(err){showMessage(err.message,true);}});
els.bookForm.addEventListener('submit',async e=>{
  e.preventDefault();let uploadedPath='';
  try{
    const title=els.bookTitleInput.value.trim(),file=els.bookFileInput.files?.[0];
    if(!file)throw new Error('Choose a PDF textbook first.');
    if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf')throw new Error('Please choose a PDF file.');
    if(file.size>maxUploadBytes)throw new Error(`This PDF is ${formatBytes(file.size)}. The configured maximum is ${CONFIG.MAX_UPLOAD_MB||50} MB.`);
    if(!title)throw new Error('Enter a textbook title.');
    const id=makeUuid();uploadedPath=`books/${id}/${safeFileName(file.name)}`;setUploadBusy(true,`Uploading ${file.name} (${formatBytes(file.size)})…`);
    const {error:uploadError}=await supabase.storage.from(bucket).upload(uploadedPath,file,{contentType:'application/pdf',cacheControl:'3600',upsert:false});if(uploadError)throw uploadError;
    const {error:insertError}=await supabase.from('textbooks').insert({id,title,storage_bucket:bucket,storage_path:uploadedPath,original_filename:file.name,file_size:file.size,mime_type:'application/pdf'});
    if(insertError){await supabase.storage.from(bucket).remove([uploadedPath]);uploadedPath='';throw insertError;}
    els.bookTitleInput.value='';els.bookFileInput.value='';setUploadBusy(false,'Upload complete. The PDF is private in Supabase Storage.');showMessage('Textbook uploaded successfully.');await refresh();
  }catch(err){setUploadBusy(false);showMessage(err.message||'Upload failed.',true);}
});
els.studentForm.addEventListener('submit',async e=>{e.preventDefault();try{await doInsert('students',{name:els.studentNameInput.value.trim(),class_id:els.studentClassSelect.value});els.studentNameInput.value='';}catch(err){showMessage(err.message,true);}});
els.assignForm.addEventListener('submit',async e=>{e.preventDefault();try{await doInsert('textbook_classes',{textbook_id:els.assignBookSelect.value,class_id:els.assignClassSelect.value});}catch(err){showMessage(err.message,true);}});

async function createLink({role,studentId=null,classId,bookId,days=0}){
  const book=data.books.find(b=>b.id===bookId);if(!book?.storage_path)throw new Error('That textbook does not have a Supabase PDF uploaded yet.');
  const assigned=data.assignments.some(a=>a.class_id===classId&&a.textbook_id===bookId);if(!assigned)throw new Error('Assign this textbook to that class first.');
  const token=randomToken(),token_hash=await sha256Hex(token),expires_at=days?new Date(Date.now()+days*86400000).toISOString():null;
  const {error}=await supabase.from('access_links').insert({token_hash,token_plain:token,textbook_id:bookId,class_id:classId,student_id:studentId,role,expires_at});if(error)throw error;
  const link=linkFromToken(token);els.generatedLinkInput.value=link;els.openLinkBtn.href=link;els.generatedLinkPanel.classList.remove('hidden');await refresh();return link;
}
els.studentLinkForm.addEventListener('submit',async e=>{e.preventDefault();try{const s=data.students.find(x=>x.id===els.linkStudentSelect.value);if(!s)throw new Error('Choose a student.');await createLink({role:'student',studentId:s.id,classId:s.class_id,bookId:els.linkBookSelect.value,days:Number(els.linkExpirySelect.value)});showMessage('Student link created.');}catch(err){showMessage(err.message,true);}});
els.teacherLinkForm.addEventListener('submit',async e=>{e.preventDefault();try{await createLink({role:'teacher',classId:els.teacherClassSelect.value,bookId:els.teacherBookSelect.value});showMessage('Teacher annotation link created. Keep this link private.');}catch(err){showMessage(err.message,true);}});
els.copyLinkBtn.addEventListener('click',async()=>{await copyText(els.generatedLinkInput.value);showMessage('Link copied.');});

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  try{
    if(b.dataset.delClass&&confirm('Delete this class? Related students, links and class notes will also be removed.')){const {error}=await supabase.from('classes').delete().eq('id',b.dataset.delClass);if(error)throw error;await refresh();}
    if(b.dataset.delBook){const book=data.books.find(x=>x.id===b.dataset.delBook);if(book&&confirm(`Delete “${book.title}”? This also deletes its stored PDF, class links and annotations.`)){if(book.storage_path){const {error:storageError}=await supabase.storage.from(book.storage_bucket||bucket).remove([book.storage_path]);if(storageError)throw storageError;}const {error}=await supabase.from('textbooks').delete().eq('id',book.id);if(error)throw error;await refresh();}}
    if(b.dataset.delStudent&&confirm('Delete this student record and their personal notes/links?')){const {error}=await supabase.from('students').delete().eq('id',b.dataset.delStudent);if(error)throw error;await refresh();}
    if(b.dataset.delAssignment){const {error}=await supabase.from('textbook_classes').delete().eq('id',b.dataset.delAssignment);if(error)throw error;await refresh();}
    if(b.dataset.copyLink){const link=data.links.find(x=>x.id===b.dataset.copyLink);if(!link?.token_plain)throw new Error('This is an older link. Recreate it once, then it can be copied here.');await copyText(linkFromToken(link.token_plain));showMessage('Link copied.');}
    if(b.dataset.revokeLink){const {error}=await supabase.from('access_links').update({revoked:true}).eq('id',b.dataset.revokeLink);if(error)throw error;await refresh();showMessage('Link revoked.');}
    if(b.dataset.deleteLink&&confirm('Permanently delete this link record?')){const {error}=await supabase.from('access_links').delete().eq('id',b.dataset.deleteLink);if(error)throw error;await refresh();showMessage('Link deleted.');}
  }catch(err){showMessage(err.message,true);}
});

async function enterDashboard(){try{await assertTeacher();els.loginCard.classList.add('hidden');els.dashboard.classList.remove('hidden');els.signOutBtn.classList.remove('hidden');await refresh();}catch(err){showMessage(err.message,true);}}
(async()=>{if(CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')||CONFIG.SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME'))return showMessage('First add your Supabase URL and publishable key to config.js.',true);const {data:{session}}=await supabase.auth.getSession();if(session)await enterDashboard();})();
