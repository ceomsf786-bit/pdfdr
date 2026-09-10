import { CONFIG } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const TEACHER=document.body.dataset.mode==='teacher';
const supabase=createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_PUBLISHABLE_KEY);
const $=id=>document.getElementById(id);
const docId=()=>new URL(location.href).searchParams.get('id')||'';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));

function setStatus(t){if($('statusText'))$('statusText').textContent=t;}
function validWebUrl(raw){try{const u=new URL(String(raw||'').trim());return (u.protocol==='http:'||u.protocol==='https:')?u.href:null;}catch{return null;}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function setupLinks(){
  if(!TEACHER)return;
  const editor=$('boardText'),btn=$('boardLink');if(!editor||!btn)return;
  btn.addEventListener('mousedown',e=>e.preventDefault());
  btn.addEventListener('click',()=>{
    editor.focus();
    const entered=prompt('Web address (https://…):','https://');if(entered===null)return;
    const href=validWebUrl(entered);if(!href)return alert('Please use a valid http:// or https:// web address.');
    const sel=window.getSelection();
    if(sel&&!sel.isCollapsed)document.execCommand('createLink',false,href);
    else document.execCommand('insertHTML',false,`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
    editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
  });
  editor.addEventListener('paste',e=>{
    const plain=e.clipboardData?.getData('text/plain')?.trim()||'';
    const href=validWebUrl(plain);
    if(!href)return;
    e.preventDefault();
    document.execCommand('insertHTML',false,`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
    editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));
  });
}

function richToText(raw=''){
  const marker='<!--snt-rich-->';const s=String(raw||'');
  if(!s.startsWith(marker))return s;
  const box=document.createElement('div');box.innerHTML=s.slice(marker.length);
  for(const a of box.querySelectorAll('a[href]')){const href=validWebUrl(a.getAttribute('href'));if(href&&a.textContent?.trim()!==href)a.append(` (${href})`);}
  return box.innerText||box.textContent||'';
}
function safePdfText(s){return String(s||'').replace(/•/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/→/g,'->').replace(/←/g,'<-').replace(/–|—/g,'-').replace(/[^\u0009\u000A\u000D\u0020-\u00FF]/g,'?');}
function wrapText(text,font,size,maxWidth){
  const out=[];for(const paragraph of safePdfText(text).replace(/\r/g,'').split('\n')){if(!paragraph.trim()){out.push('');continue;}let line='';for(const word of paragraph.split(/\s+/)){const trial=line?line+' '+word:word;let w=0;try{w=font.widthOfTextAtSize(trial,size);}catch{w=trial.length*size*.52;}if(w<=maxWidth||!line)line=trial;else{out.push(line);line=word;}}if(line)out.push(line);}return out;
}
async function sessionHeaders(){const {data}=await supabase.auth.getSession();const token=data?.session?.access_token;if(!token)throw new Error('Teacher sign-in required.');return {Authorization:`Bearer ${token}`,apikey:CONFIG.SUPABASE_PUBLISHABLE_KEY};}
function imageUrl(id){const u=new URL(`${CONFIG.SUPABASE_URL}/functions/v1/${CONFIG.API_FUNCTION}`);u.searchParams.set('action','image');u.searchParams.set('doc',docId());u.searchParams.set('image',id);return u.toString();}
async function loadBitmap(imageId){const r=await fetch(imageUrl(imageId),{headers:await sessionHeaders()});if(!r.ok)throw new Error('Could not load an image-board image.');const blob=await r.blob();return await createImageBitmap(blob);}
function drawBoardObject(ctx,o,w,h){const X=x=>x*w,Y=y=>y*h;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=o.color||'#1f2937';ctx.fillStyle=o.color||'#1f2937';ctx.lineWidth=Math.max(1,(Number(o.width)||4));ctx.globalAlpha=o.type==='highlighter'?.28:1;
  if(o.type==='pen'||o.type==='highlighter'){const p=o.points||[];if(p.length){ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(X(q.x),Y(q.y)):ctx.moveTo(X(q.x),Y(q.y)));ctx.stroke();}}
  else if(o.type==='text'){ctx.globalAlpha=1;ctx.font=`${Math.max(14,Number(o.fontSize)||18)}px sans-serif`;ctx.fillText(o.text||'',X(o.x),Y(o.y));}
  else if(o.type==='line'||o.type==='arrow'){ctx.beginPath();ctx.moveTo(X(o.x1),Y(o.y1));ctx.lineTo(X(o.x2),Y(o.y2));ctx.stroke();if(o.type==='arrow'){const a=Math.atan2(Y(o.y2)-Y(o.y1),X(o.x2)-X(o.x1)),len=12;ctx.beginPath();ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(a-Math.PI/6),Y(o.y2)-len*Math.sin(a-Math.PI/6));ctx.moveTo(X(o.x2),Y(o.y2));ctx.lineTo(X(o.x2)-len*Math.cos(a+Math.PI/6),Y(o.y2)-len*Math.sin(a+Math.PI/6));ctx.stroke();}}
  else if(o.type==='rect'){const x=X(Math.min(o.x1,o.x2)),y=Y(Math.min(o.y1,o.y2)),rw=Math.abs(o.x2-o.x1)*w,rh=Math.abs(o.y2-o.y1)*h;if(o.fill){ctx.save();ctx.globalAlpha=clamp(o.fillOpacity??1,0,1);ctx.fillStyle=o.fillColor||o.color||'#1f2937';ctx.fillRect(x,y,rw,rh);ctx.restore();}ctx.strokeRect(x,y,rw,rh);}
  else if(o.type==='ellipse'){ctx.beginPath();ctx.ellipse(X((o.x1+o.x2)/2),Y((o.y1+o.y2)/2),Math.abs(o.x2-o.x1)*w/2,Math.abs(o.y2-o.y1)*h/2,0,0,Math.PI*2);if(o.fill){ctx.save();ctx.globalAlpha=clamp(o.fillOpacity??1,0,1);ctx.fillStyle=o.fillColor||o.color||'#1f2937';ctx.fill();ctx.restore();}ctx.stroke();}
  ctx.restore();
}
async function boardCanvas(board,images){const bw=Math.max(400,Number(board.canvas_width)||1600),bh=Math.max(300,Number(board.canvas_height)||1000),s=Math.min(1,1800/bw,1300/bh);const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bw*s));c.height=Math.max(1,Math.round(bh*s));const ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,c.width,c.height);ctx.save();ctx.scale(s,s);
  const placements=board.placements&&typeof board.placements==='object'?board.placements:{};
  for(let i=0;i<images.length;i++){const im=images[i],p=placements[im.id]||{x:40+(i%3)*360,y:40+Math.floor(i/3)*280,w:320,h:220};try{const bmp=await loadBitmap(im.id);ctx.fillStyle='#fff';ctx.fillRect(p.x,p.y,p.w,p.h);const scale=Math.min(p.w/bmp.width,p.h/bmp.height),dw=bmp.width*scale,dh=bmp.height*scale;ctx.drawImage(bmp,p.x+(p.w-dw)/2,p.y+(p.h-dh)/2,dw,dh);bmp.close?.();}catch{ctx.strokeStyle='#a00';ctx.strokeRect(p.x,p.y,p.w,p.h);}}
  for(const o of Array.isArray(board.objects)?board.objects:[])drawBoardObject(ctx,o,bw,bh);ctx.restore();return c;}
function canvasPngBytes(canvas){return new Promise((resolve,reject)=>canvas.toBlob(async b=>{if(!b)return reject(new Error('Could not render image board.'));resolve(new Uint8Array(await b.arrayBuffer()));},'image/png'));}

async function exportBoardsPdf(){
  const PDFLib=window.PDFLib;if(!PDFLib)throw new Error('PDF export library is not ready.');const id=docId();if(!id)throw new Error('Open a PDF first.');
  setStatus('Building notes + image boards PDF…');
  const [{data:doc,error:de},{data:notes,error:ne},{data:imageBoards,error:ibe},{data:images,error:ie}]=await Promise.all([
    supabase.from('snt_pdf_documents').select('title').eq('id',id).single(),
    supabase.from('snt_pdf_boards').select('page_no,board_no,title,text_content,board_scope,is_permanent').eq('document_id',id).order('page_no').order('board_no'),
    supabase.from('snt_pdf_image_boards').select('board_no,title,canvas_width,canvas_height,placements,objects').eq('document_id',id).order('board_no'),
    supabase.from('snt_pdf_board_images').select('id,board_no,image_name,sort_no').eq('document_id',id).order('board_no').order('sort_no')
  ]);if(de)throw de;if(ne)throw ne;if(ibe)throw ibe;if(ie)throw ie;
  const pdf=await PDFLib.PDFDocument.create(),regular=await pdf.embedFont(PDFLib.StandardFonts.Helvetica),bold=await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const A4=[595.28,841.89],margin=46,size=11,lineH=15;
  const addHeading=(page,title,subtitle='')=>{page.drawText(safePdfText(title),{x:margin,y:A4[1]-55,size:17,font:bold,color:PDFLib.rgb(.08,.16,.22)});if(subtitle)page.drawText(safePdfText(subtitle),{x:margin,y:A4[1]-75,size:9,font:regular,color:PDFLib.rgb(.35,.4,.45)});};
  for(const n of notes||[]){const text=richToText(n.text_content||'').trim();if(!text)continue;const label=n.is_permanent?'Permanent notes':`Page ${n.page_no} notes`;const title=n.title||`Board ${n.board_no}`;let lines=wrapText(text,regular,size,A4[0]-margin*2),idx=0,first=true;while(idx<lines.length||first){const page=pdf.addPage(A4);addHeading(page,title,first?label:`${label} (continued)`);let y=A4[1]-100;while(idx<lines.length&&y>margin){page.drawText(lines[idx]||' ',{x:margin,y,size,font:regular,color:PDFLib.rgb(.08,.1,.12),maxWidth:A4[0]-margin*2});idx++;y-=lineH;}first=false;}}
  const groups=new Map();for(const im of images||[]){const k=Number(im.board_no);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(im);}
  for(const b of imageBoards||[]){setStatus(`Rendering ${b.title||'image board'}…`);const canvas=await boardCanvas(b,groups.get(Number(b.board_no))||[]);const png=await pdf.embedPng(await canvasPngBytes(canvas));const page=pdf.addPage([841.89,595.28]);page.drawText(safePdfText(b.title||`Image Board ${b.board_no}`),{x:40,y:558,size:16,font:bold,color:PDFLib.rgb(.08,.16,.22)});const maxW=761,maxH=500,scale=Math.min(maxW/png.width,maxH/png.height);const w=png.width*scale,h=png.height*scale;page.drawImage(png,{x:(841.89-w)/2,y:28+(500-h)/2,width:w,height:h});}
  if(pdf.getPageCount()===0){const p=pdf.addPage(A4);addHeading(p,'No notes or image boards to export');}
  const bytes=await pdf.save(),blob=new Blob([bytes],{type:'application/pdf'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${String(doc?.title||'SNT').replace(/[^A-Za-z0-9_-]+/g,'_')}_notes_image_boards.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),3000);setStatus('Notes + image boards PDF exported');
}

function setupExport(){if(!TEACHER)return;$('exportBoardsPdf')?.addEventListener('click',()=>exportBoardsPdf().catch(e=>{setStatus('Export failed: '+e.message);alert('Export failed: '+e.message);}));}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setupLinks();setupExport();},{once:true});else{setupLinks();setupExport();}
