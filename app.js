const $=id=>document.getElementById(id);
let db, products=[], unresolved=[];

function norm(s){return (s||"").normalize("NFKC").replace(/[ 　\t\r\n]/g,"").toLowerCase()}
function esc(s){return (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function b64(s){return btoa(unescape(encodeURIComponent(s))).replace(/=/g,"")}

const req=indexedDB.open("amiteru_shipping_v1",2);
req.onupgradeneeded=e=>{
  const d=e.target.result;
  // 初期版からの互換性を優先。varieties は keyPath:"name" をそのまま使う。
  if(!d.objectStoreNames.contains("varieties")) d.createObjectStore("varieties",{keyPath:"name"});
};
req.onsuccess=e=>{db=e.target.result;renderLibrary()};
function store(mode="readonly"){return db.transaction("varieties",mode).objectStore("varieties")}
function allV(){return new Promise((res,rej)=>{let r=store().getAll();r.onsuccess=()=>res(r.result);r.onerror=rej})}
function putV(v){return new Promise((res,rej)=>{let r=store("readwrite").put(v);r.onsuccess=()=>res(r.result);r.onerror=rej})}
function delV(name){return new Promise((res,rej)=>{let r=store("readwrite").delete(name);r.onsuccess=()=>res();r.onerror=rej})}

function fileToJpeg(file,max=1200,q=.82){
 return new Promise((res,rej)=>{
  let fr=new FileReader();
  fr.onload=()=>{let im=new Image();im.onload=()=>{
   let sc=Math.min(1,max/Math.max(im.width,im.height));
   let c=document.createElement("canvas");c.width=Math.round(im.width*sc);c.height=Math.round(im.height*sc);
   c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",q))
  };im.onerror=rej;im.src=fr.result};fr.onerror=rej;fr.readAsDataURL(file)
 })
}

$("saveVariety").onclick=async()=>{
 const name=$("vname").value.trim(), f=$("vfile").files[0];
 if(!name||!f)return alert("正式名と写真を入れてください。");
 const aliases=$("valiases").value.split(/[,，]/).map(x=>x.trim()).filter(Boolean);
 await putV({name,aliases,url:await fileToJpeg(f)});
 $("vname").value="";$("valiases").value="";$("vfile").value="";
 renderLibrary();
};
async function renderLibrary(){
 const vs=await allV();
 $("library").innerHTML=vs.map(v=>`<div class="v"><img src="${v.url}"><b>${esc(v.name)}</b><div>${(v.aliases||[]).map(a=>`<span class="chip">${esc(a)}</span>`).join("")}</div><button class="red" onclick='removeV(${JSON.stringify(v.name)})'>削除</button></div>`).join("");
}
window.removeV=async name=>{await delV(name);renderLibrary()};

function parseCSV(t){
 let rows=[],row=[],cell="",q=false;
 for(let i=0;i<t.length;i++){let ch=t[i],nx=t[i+1];
  if(ch=='"'){if(q&&nx=='"'){cell+='"';i++}else q=!q}
  else if(ch==","&&!q){row.push(cell);cell=""}
  else if((ch=="\n"||ch=="\r")&&!q){if(ch=="\r"&&nx=="\n")i++;row.push(cell);rows.push(row);row=[];cell=""}
  else cell+=ch
 }
 if(cell.length||row.length){row.push(cell);rows.push(row)}
 return rows.filter(r=>r.some(c=>String(c).trim()!=""));
}
function hidx(h,names){for(const n of names){let i=h.findIndex(x=>norm(x)==norm(n));if(i>=0)return i}return -1}
function toks(s){
  let text=(s||"").normalize("NFKC");
  // 送り状の「、」区切りを最優先で商品内訳ごとに分割
  let parts=text.split(/[、,，/／＋+]/).map(x=>x.trim()).filter(Boolean);

  // 各パーツから長さ・本数・束数などを除き、品種名だけを残す
  let cleaned=parts.map(x=>{
    let y=x;
    // 例: 70cm / 60・70cm / 40-50cm / 60〜70cm
    y=y.replace(/\d+(?:[・･\-－〜~～]\d+)?\s*(?:cm|センチ)/gi," ");
    // 例: 10本 / 20束 / 1箱
    y=y.replace(/\d+\s*(?:本|束|箱)/g," ");
    // 残った単独数字や記号を除去
    y=y.replace(/^[\s・･,，、/／＋+\-－〜~～]+|[\s・･,，、/／＋+\-－〜~～]+$/g,"");
    y=y.replace(/\s+/g," ").trim();
    return y;
  }).filter(Boolean);

  return [...new Set(cleaned)];
}
function lookup(vs){let m=new Map();for(const v of vs){m.set(norm(v.name),v);for(const a of(v.aliases||[]))m.set(norm(a),v)}return m}

$("parseCsv").onclick=async()=>{
 const f=$("csvFile").files[0]; if(!f)return alert("CSVを選んでください。");
 const mat=parseCSV(await f.text()), h=mat[0].map(x=>String(x).trim());
 const ci=hidx(h,["品目"]), cd=hidx(h,["詳細","内訳","備考"]), cv=hidx(h,["品種"]), cl=hidx(h,["長さ・等級","長さ"]), cb=hidx(h,["箱"]);
 if(ci<0)return alert("『品目』列が見つかりません。");
 const vs=await allV(), map=lookup(vs); products=[]; unresolved=[];
 let seq=1;
 for(const r of mat.slice(1)){
  if(norm(r[ci])!=norm("ユーカリ"))continue;
  let text=(cd>=0?r[cd]:"")||(cv>=0?r[cv]:""), ts=toks(text), matches=[], miss=[];
  for(const t of ts){let v=map.get(norm(t)); if(v){if(!matches.some(x=>norm(x.name)==norm(v.name)))matches.push(v)}else{miss.push(t);if(!unresolved.includes(t))unresolved.push(t)}}
  products.push({seq:seq++,text,length:cl>=0?r[cl]:"",box:cb>=0?r[cb]:"",matches,miss,url:""});
 }
 $("csvStatus").textContent=`ユーカリ ${products.length}商品 / 未一致 ${unresolved.length}件`;
 renderUnmatched();renderProducts();
};

async function renderUnmatched(){
 if(!unresolved.length){$("unmatchedArea").style.display="none";return}
 const vs=await allV(), opts='<option value="">画像を選択</option>'+vs.map(v=>`<option value="${encodeURIComponent(v.name)}">${esc(v.name)}</option>`).join("");
 $("unmatchedArea").style.display="block";
 $("unmatchedList").innerHTML=unresolved.map(t=>`<div class="product"><b>${esc(t)}</b><div class="row" style="margin-top:7px"><select id="map_${b64(t)}" style="flex:1">${opts}</select><label class="small"><input id="save_${b64(t)}" type="checkbox"> 別名として保存</label></div></div>`).join("");
}
$("applyUnmatched").onclick=async()=>{
 const vs=await allV(), by=new Map(vs.map(v=>[norm(v.name),v])), mp=new Map();
 for(const t of unresolved){
   let k=b64(t), val=$("map_"+k).value;
   if(val){
     let selectedName=decodeURIComponent(val);
     let v=by.get(norm(selectedName));
     if(v){
       mp.set(t,v);
       if($("save_"+k).checked){
         v.aliases=[...new Set([...(v.aliases||[]),t])];
         await putV(v);
       }
     }
   }
 }
 for(const p of products){let left=[];for(const t of p.miss){let v=mp.get(t);if(v){if(!p.matches.some(x=>norm(x.name)==norm(v.name)))p.matches.push(v)}else left.push(t)}p.miss=left}
 unresolved=[...new Set(products.flatMap(p=>p.miss))];
 $("csvStatus").textContent=`ユーカリ ${products.length}商品 / 未一致 ${unresolved.length}件`;
 renderLibrary();renderUnmatched();renderProducts();
};
function renderProducts(){
 if(!products.length){$("productsArea").style.display="none";return}
 $("productsArea").style.display="block";
 $("productsList").innerHTML=products.map(p=>`<div class="product"><div><b>${String(p.seq).padStart(2,"0")}</b> ${p.length?`<span class="chip">${esc(p.length)}</span>`:""} ${p.miss.length?`<span class="warn">未一致 ${p.miss.length}</span>`:(p.matches.length>=3&&p.matches.length<=5?`<span class="chip">照合OK</span>`:`<span class="warn">画像不足 ${p.matches.length}枚</span>`)}</div><div class="small">${esc(p.text)}</div><div>${p.matches.map(v=>`<span class="chip">${esc(v.name)}</span>`).join("")}${p.miss.map(t=>`<span class="warn">${esc(t)}</span>`).join("")}</div><div class="small">${String(p.seq).padStart(2,"0")}_mix.jpg</div>${p.url?`<img class="preview" src="${p.url}"><div><a class="btn" download="${String(p.seq).padStart(2,"0")}_mix.jpg" href="${p.url}">画像を保存</a></div>`:""}</div>`).join("");
}
function roundPath(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function cover(ctx,img,x,y,w,h){let sc=Math.max(w/img.width,h/img.height),nw=img.width*sc,nh=img.height*sc;ctx.drawImage(img,x+(w-nw)/2,y+(h-nh)/2,nw,nh)}
function card(ctx,img,c){ctx.save();roundPath(ctx,c.x,c.y,c.w,c.h,26);ctx.clip();cover(ctx,img,c.x,c.y,c.w,c.h);ctx.restore()}
function layout(n){const W=1250,H=1532,p=18,g=18;if(n==3){let h=(H-p*2-g*2)/3;return[0,1,2].map(i=>({x:p,y:p+i*(h+g),w:W-p*2,h}))}if(n==4){let w=(W-p*2-g)/2,h=(H-p*2-g)/2;return[0,1,2,3].map(i=>({x:p+(i%2)*(w+g),y:p+Math.floor(i/2)*(h+g),w,h}))}let tw=(W-p*2-g*2)/3,th=560,bw=(W-p*2-g)/2,by=p+th+g,bh=H-p-by;return[{x:p,y:p,w:tw,h:th},{x:p+tw+g,y:p,w:tw,h:th},{x:p+2*(tw+g),y:p,w:tw,h:th},{x:p,y:by,w:bw,h:bh},{x:p+bw+g,y:by,w:bw,h:bh}]}
function li(src){return new Promise((res,rej)=>{let i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
$("generateAllMix").onclick=async()=>{
 for(const p of products){if(p.miss.length||p.matches.length<3||p.matches.length>5){p.url="";continue}
  let imgs=await Promise.all(p.matches.map(v=>li(v.url))),c=$("cv"),ctx=c.getContext("2d");c.width=1250;c.height=1532;ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);let cells=layout(imgs.length);imgs.forEach((im,i)=>card(ctx,im,cells[i]));p.url=c.toDataURL("image/jpeg",.86)
 }
 renderProducts();
};

async function dataUrlToFile(dataUrl,name){
  const res=await fetch(dataUrl);
  const blob=await res.blob();
  return new File([blob],name,{type:"image/jpeg"});
}

$("shareAllMix").onclick=async()=>{
  const made=products.filter(p=>p.url);
  if(!made.length){
    alert("先にミックス画像を一括生成してください。");
    return;
  }
  const files=[];
  for(const p of made){
    files.push(await dataUrlToFile(p.url,`${String(p.seq).padStart(2,"0")}_mix.jpg`));
  }
  try{
    if(navigator.canShare && navigator.canShare({files})){
      await navigator.share({
        title:"あみてる ミックス画像",
        text:`ミックス画像 ${files.length}枚`,
        files
      });
    }else{
      alert("このブラウザでは複数画像の共有に対応していません。Safariで開いてください。");
    }
  }catch(e){
    if(e && e.name!=="AbortError"){
      alert("一括共有できませんでした。画像枚数を減らすかSafariで試してください。");
    }
  }
};

const MAILKEY="amiteru_mail_template_v44";
function todayJP(){let d=new Date(),parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);let o={};for(const p of parts)o[p.type]=p.value;return `${o.year}-${o.month}-${o.day}`}
function displayDate(v){if(!v)return "";let [y,m,d]=v.split("-");return `${Number(m)}月${Number(d)}日`}
function applyMail(){
 let date=displayDate($("saleDate").value),sub=$("mailSubjectTpl").value||"",body=$("mailBodyTpl").value||"";
 sub=sub.replaceAll("{{セリ日}}",date).replaceAll("{{納品日}}",date);
 body=body.replaceAll("{{セリ日}}",date).replaceAll("{{納品日}}",date);
 $("mailSubject").value=sub;$("mailBody").value=body;$("mailToPreview").value=$("mailTo").value;
}
function saveMail(){
 localStorage.setItem(MAILKEY,JSON.stringify({name:$("mailName").value,to:$("mailTo").value,subject:$("mailSubjectTpl").value,body:$("mailBodyTpl").value}));
}
function loadMail(){
 try{let x=JSON.parse(localStorage.getItem(MAILKEY)||"null");if(!x)return;$("mailName").value=x.name||"";$("mailTo").value=x.to||"";$("mailSubjectTpl").value=x.subject||"";$("mailBodyTpl").value=x.body||"";applyMail()}catch(e){}
}
$("saveMailTemplate").onclick=()=>{saveMail();applyMail();alert("定型文を保存しました。次回も残ります。")};
$("loadMailTemplate").onclick=loadMail;
$("refreshMail").onclick=applyMail;
$("saleDate").onchange=applyMail;
$("mailSubjectTpl").oninput=applyMail;$("mailBodyTpl").oninput=applyMail;$("mailTo").oninput=applyMail;
$("copyTo").onclick=async()=>{await navigator.clipboard.writeText($("mailToPreview").value||"");alert("宛先をコピーしました。")};
$("shareMail").onclick=async()=>{
 const f=$("pdfFile").files[0];
 if(!f)return alert("PDFを選んでください。");
 applyMail();

 const subject=$("mailSubject").value||"";
 const body=$("mailBody").value||"";
 const to=$("mailToPreview").value||"";

 // 宛先だけコピー。本文には宛先・件名を混ぜない
 try{ if(to) await navigator.clipboard.writeText(to); }catch(e){}

 try{
  if(navigator.canShare&&navigator.canShare({files:[f]})){
    await navigator.share({
      title:subject,
      text:body,
      files:[f]
    });
  }else{
    await navigator.clipboard.writeText(body);
    alert("本文をコピーしました。PDFはOutlookで添付してください。");
  }
 }catch(e){
   if(e && e.name!=="AbortError") alert("Outlookへの共有に失敗しました。");
 }
};
$("saleDate").value=todayJP();loadMail();applyMail();

if("serviceWorker" in navigator){navigator.serviceWorker.register("./sw.js?v=6910").catch(()=>{})}
