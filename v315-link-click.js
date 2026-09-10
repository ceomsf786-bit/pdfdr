// Teacher board links should behave like real web links even inside contenteditable.
const editor=document.getElementById('boardText');
if(editor){
  editor.addEventListener('click',e=>{
    const a=e.target?.closest?.('a[href]');
    if(!a||!editor.contains(a))return;
    try{
      const u=new URL(a.href,location.href);
      if(u.protocol!=='http:'&&u.protocol!=='https:')return;
      e.preventDefault();
      window.open(u.href,'_blank','noopener,noreferrer');
    }catch{}
  });
}
