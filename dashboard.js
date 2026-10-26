(()=>{
const D=id=>document.getElementById(id);
const yen=n=>new Intl.NumberFormat('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0}).format(Number(n)||0);
const fmtDate=s=>s&&s.length>=8?`${s.slice(0,4)}/${Number(s.slice(4,6))}/${Number(s.slice(6,8))}`:(s||'');
const today8=()=>{const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`};
const nrm=s=>(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();
function itemGroup(item,variety=''){
 const x=nrm(item),v=nrm(variety);
 if(x.includes('ユーカリ')||x.includes('ﾕｰｶﾘ')) return 'ユーカリ';
 if(x.includes('ワタ')||x.includes('ﾜﾀ')||v.includes('コットン')) return 'コットン';
 if(x.includes('トウモロコシ')||x.includes('ﾄｳﾓﾛｺｼ')||v.includes('グラスジェム')) return 'グラスジェムコーン';
 if(x.includes('スモーク')||x.includes('ｽﾓｰｸ')) return 'スモークツリー';
 if(v.includes('カナリヤ')||v.includes('かなりや')) return 'カナリヤナス';
 return 'その他';
}
const COLORS={'ユーカリ':'#567a61','コットン':'#c8a56a','グラスジェムコーン':'#8b6d9c','スモークツリー':'#a36f76','カナリヤナス':'#7a8e55','その他':'#9aa19a'};
let sdb=null, allSales=[], customerMeta=new Map(), latestImport=null;
const openReq=indexedDB.open('amiteru_sales_v1',1);
openReq.onupgradeneeded=e=>{
 const db=e.target.result;
 if(!db.objectStoreNames.contains('sales')){const st=db.createObjectStore('sales',{keyPath:'id'});st.createIndex('date','date');st.createIndex('buyer','buyer');}
 if(!db.objectStoreNames.contains('customerMeta')) db.createObjectStore('customerMeta',{keyPath:'buyer'});
};
openReq.onerror=()=>{const el=D('salesImportStatus'); if(el)el.textContent='販売DBを開けませんでした。Safariのプライベートブラウズではなく通常画面でお試しください。'};
openReq.onsuccess=async e=>{sdb=e.target.result; await seedSales(); await refreshSalesUI(); bindSalesUI();};
function tx(store,mode='readonly'){return sdb.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function putOne(store,obj){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(obj);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function seedSales(){
 if(!Array.isArray(window.AMITERU_INITIAL_SALES)&&typeof AMITERU_INITIAL_SALES==='undefined') return;
 const seed=typeof AMITERU_INITIAL_SALES!=='undefined'?AMITERU_INITIAL_SALES:window.AMITERU_INITIAL_SALES;
 const transaction=sdb.transaction('sales','readwrite'), st=transaction.objectStore('sales');
 for(const r of seed) st.put(r);
 await new Promise((res,rej)=>{transaction.oncomplete=res;transaction.onerror=()=>rej(transaction.error)});
}
function bindSalesUI(){
 D('importSalesCsv').addEventListener('click',importSelectedSales);
 D('salesYear').addEventListener('change',renderChart);
 D('customerFilter').addEventListener('change',renderCustomers);
 D('customerSearch').addEventListener('input',renderCustomers);
}
function salesParseCSV(t){
 const rows=[];let row=[],cell='',q=false;
 for(let i=0;i<t.length;i++){const ch=t[i],nx=t[i+1];if(ch==='"'){if(q&&nx==='"'){cell+='"';i++}else q=!q}else if(ch===','&&!q){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!q){if(ch==='\r'&&nx==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=ch}
 if(cell.length||row.length){row.push(cell);rows.push(row)} return rows.filter(r=>r.some(c=>String(c).trim()));
}
function idx(h,names){for(const n of names){const i=h.findIndex(x=>nrm(x)===nrm(n));if(i>=0)return i}return -1}
function num(v){return Number(String(v||'').replace(/[^0-9.-]/g,''))||0}
function recordsFromText(text,source){
 const mat=salesParseCSV(text); if(mat.length<2) return [];
 const h=mat[0].map(x=>String(x).trim());
 const c={date:idx(h,['売立日','販売日']),saleType:idx(h,['販売種別']),item:idx(h,['品目']),variety:idx(h,['品種']),length:idx(h,['長さ / 高さ','長さ']),qty:idx(h,['合計本数','本数']),unit:idx(h,['販売金額','単価']),amount:idx(h,['合計金額','金額']),buyer:idx(h,['買参番号'])};
 if(c.date<0||c.item<0||c.amount<0) throw new Error('売立明細CSVの列が見つかりません。');
 const occ=new Map(), out=[];
 for(const r of mat.slice(1)){
   const date=String(r[c.date]||'').replace(/\D/g,'').slice(0,8); if(date.length!==8)continue;
   const saleType=c.saleType>=0?String(r[c.saleType]||'').trim():'';
   const item=c.item>=0?String(r[c.item]||'').trim():'';
   const variety=c.variety>=0?String(r[c.variety]||'').trim():'';
   const length=c.length>=0?String(r[c.length]||'').trim():'';
   const qty=c.qty>=0?num(r[c.qty]):0, unitPrice=c.unit>=0?num(r[c.unit]):0, amount=num(r[c.amount]);
   const buyer=(c.buyer>=0?String(r[c.buyer]||'').trim():'').split('-')[0];
   const base=[date,saleType,item,variety,length,qty,unitPrice,buyer].join('|'); const count=(occ.get(base)||0)+1; occ.set(base,count);
   out.push({id:base+'|'+count,date,saleType,item,variety,length,qty,unitPrice,amount,buyer,source});
 }
 return out;
}
async function importSelectedSales(){
 const files=[...(D('salesCsvFile').files||[])]; if(!files.length){alert('売立CSVを選んでください。');return}
 const before=await getAll('sales'), oldBuyers=new Set(before.map(r=>r.buyer).filter(Boolean));
 let parsed=[], bad=[];
 for(const f of files){try{parsed.push(...recordsFromText(await f.text(),f.name))}catch(e){bad.push(`${f.name}: ${e.message}`)}}
 const known=new Set(before.map(r=>r.id)); const fresh=parsed.filter(r=>!known.has(r.id));
 if(fresh.length){const tr=sdb.transaction('sales','readwrite'),st=tr.objectStore('sales');fresh.forEach(r=>st.put(r));await new Promise((res,rej)=>{tr.oncomplete=res;tr.onerror=()=>rej(tr.error)})}
 const buyers=[...new Set(fresh.map(r=>r.buyer).filter(Boolean))]; const repeats=buyers.filter(b=>oldBuyers.has(b)).length;
 latestImport={rows:fresh.length,files:files.length,buyers:buyers.length,repeats,newBuyers:buyers.length-repeats,amount:fresh.reduce((a,r)=>a+r.amount,0),bad};
 D('salesCsvFile').value=''; await refreshSalesUI();
 D('salesImportStatus').textContent=`${files.length}ファイル確認：新規 ${fresh.length}明細を追加（重複 ${parsed.length-fresh.length}明細は除外）`;
}
async function refreshSalesUI(){
 allSales=await getAll('sales'); const metas=await getAll('customerMeta'); customerMeta=new Map(metas.map(x=>[x.buyer,x]));
 const years=[...new Set(allSales.map(r=>r.date.slice(0,4)))].sort((a,b)=>b-a); const sel=D('salesYear'), prev=sel.value; sel.innerHTML=years.map(y=>`<option value="${y}">${y}年</option>`).join('');
 const nowY=String(new Date().getFullYear()); sel.value=years.includes(prev)?prev:(years.includes(nowY)?nowY:(years[0]||''));
 renderKpis();renderChart();renderLatest();renderCustomers();renderHistory();
}
function monthTotal(y,m){const ym=`${y}${String(m).padStart(2,'0')}`;return allSales.filter(r=>r.date.startsWith(ym)).reduce((a,r)=>a+r.amount,0)}
function customerStats(){
 const m=new Map();
 for(const r of allSales){if(!r.buyer)continue; if(!m.has(r.buyer))m.set(r.buyer,{buyer:r.buyer,dates:new Set(),amount:0,items:new Set(),last:'',rows:0}); const c=m.get(r.buyer);c.dates.add(r.date);c.amount+=r.amount;c.items.add(itemGroup(r.item,r.variety));c.last=c.last>r.date?c.last:r.date;c.rows++;}
 return [...m.values()].map(c=>({...c,purchases:c.dates.size,itemsArr:[...c.items],repeat:c.dates.size>=2}));
}
function renderKpis(){
 const d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,cur=monthTotal(y,m); let py=y,pm=m-1;if(pm===0){pm=12;py--}const prev=monthTotal(py,pm);
 D('kpiMonth').textContent=yen(cur);D('kpiMonthSub').textContent=`${y}年${m}月`;
 if(prev>0){const pct=(cur-prev)/prev*100;D('kpiMoM').textContent=`${pct>=0?'+':''}${pct.toFixed(1)}%`}else D('kpiMoM').textContent=cur?'—':'0%';D('kpiPrev').textContent=`前月 ${yen(prev)}`;
 const yoy=monthTotal(y-1,m);if(yoy>0){const pct=(cur-yoy)/yoy*100;D('kpiYoY').textContent=`${pct>=0?'+':''}${pct.toFixed(1)}%`}else D('kpiYoY').textContent='—';D('kpiYoYSub').textContent=`前年同月 ${yen(yoy)}`;
 const cs=customerStats(),reps=cs.filter(x=>x.repeat).length,rate=cs.length?reps/cs.length*100:0;D('kpiRepeat').textContent=`${rate.toFixed(1)}%`;D('kpiRepeatSub').textContent=`${reps}/${cs.length}人が2回以上`;
}
function renderChart(){
 const y=D('salesYear').value;if(!y)return; const groups=['ユーカリ','コットン','グラスジェムコーン','スモークツリー','カナリヤナス','その他']; const data=[];
 for(let m=1;m<=12;m++){const obj={month:m,total:0};groups.forEach(g=>obj[g]=0);for(const r of allSales.filter(x=>x.date.startsWith(`${y}${String(m).padStart(2,'0')}`))){const g=itemGroup(r.item,r.variety);obj[g]+=r.amount;obj.total+=r.amount}data.push(obj)}
 const max=Math.max(...data.map(x=>x.total),1);D('salesChart').innerHTML=data.map(o=>`<div class="monthcol" title="${o.month}月 ${yen(o.total)}"><div class="barwrap">${groups.map(g=>o[g]?`<div class="seg" style="height:${o[g]/max*100}%;background:${COLORS[g]}" title="${g} ${yen(o[g])}"></div>`:'').join('')}</div><div class="mlabel">${o.month}月</div></div>`).join('');
 const active=groups.filter(g=>data.some(o=>o[g]>0));D('salesLegend').innerHTML=active.map(g=>`<span><i style="background:${COLORS[g]}"></i>${g}</span>`).join('');
}
function renderLatest(){
 const el=D('latestSaleSummary'); if(!latestImport){const latest=allSales.reduce((a,r)=>!a||r.date>a?r.date:a,'');const amt=allSales.filter(r=>r.date===latest).reduce((a,r)=>a+r.amount,0);el.innerHTML=latest?`直近データ：<b>${fmtDate(latest)}</b><br>売上 ${yen(amt)}<br><span class="mini">次の売立CSV取込時に新規・リピーターを判定します。</span>`:'データなし';return}
 el.innerHTML=`追加売上 <b>${yen(latestImport.amount)}</b> / ${latestImport.rows}明細<br>購入者 ${latestImport.buyers}人：<span class="tag good">リピーター ${latestImport.repeats}</span> <span class="tag new">新規 ${latestImport.newBuyers}</span>${latestImport.bad.length?`<br><span class="warn">読込エラー ${latestImport.bad.length}件</span>`:''}`;
}
function sampleCandidate(c){const meta=customerMeta.get(c.buyer)||{}; if(c.purchases<3&&c.amount<20000)return false;if(!meta.sampleAt)return true;return c.last>meta.sampleAt && daysBetween(meta.sampleAt,c.last)>=90}
function daysBetween(a,b){if(!a||!b)return 999;const f=s=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));return Math.round((f(b)-f(a))/86400000)}
function renderHighlights(){
 const cs=customerStats().sort((a,b)=>b.purchases-a.purchases||b.amount-a.amount); const hot=cs.filter(sampleCandidate).slice(0,3),multi=cs.filter(c=>c.itemsArr.length>=2).slice(0,2); const list=[...new Map([...hot,...multi].map(x=>[x.buyer,x])).values()].slice(0,5);
 D('customerHighlights').innerHTML=list.length?list.map(c=>`<div><b>${c.buyer}</b> ${c.purchases}回 / ${yen(c.amount)} ${sampleCandidate(c)?'<span class="tag hot">サンプル候補</span>':''}${c.itemsArr.length>=2?'<span class="tag good">複数品目</span>':''}</div>`).join(''):'該当なし';
}
function renderCustomers(){
 renderHighlights(); let cs=customerStats(); const f=D('customerFilter').value,q=D('customerSearch').value.trim(); if(q)cs=cs.filter(c=>c.buyer.includes(q)); if(f==='repeat')cs=cs.filter(c=>c.repeat);if(f==='sample')cs=cs.filter(sampleCandidate);if(f==='multi')cs=cs.filter(c=>c.itemsArr.length>=2);cs.sort((a,b)=>b.purchases-a.purchases||b.amount-a.amount);
 D('customerTable').innerHTML=cs.map(c=>{const meta=customerMeta.get(c.buyer)||{};return `<tr><td><b>${c.buyer}</b><div>${c.repeat?'<span class="tag good">リピーター</span>':'<span class="tag new">1回購入</span>'}${sampleCandidate(c)?'<span class="tag hot">サンプル候補</span>':''}</div></td><td>${c.purchases}回</td><td>${yen(c.amount)}</td><td>${c.itemsArr.map(x=>`<span class="tag">${x}</span>`).join('')}</td><td>${fmtDate(c.last)}</td><td><div class="cust-actions"><button class="light" data-act="sample" data-buyer="${c.buyer}">${meta.sampleAt?'サンプル '+fmtDate(meta.sampleAt):'サンプル済みにする'}</button><button class="light" data-act="message" data-buyer="${c.buyer}">${meta.messageAt?'メッセージ '+fmtDate(meta.messageAt):'メッセージ済みにする'}</button><button class="gray" data-act="memo" data-buyer="${c.buyer}">メモ</button></div>${meta.note?`<div class="mini">${escapeHtml(meta.note)}</div>`:''}</td></tr>`}).join('');
 D('customerTable').querySelectorAll('button[data-act]').forEach(b=>b.addEventListener('click',()=>customerAction(b.dataset.buyer,b.dataset.act)));
}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function customerAction(buyer,act){const old=customerMeta.get(buyer)||{buyer}; const now=today8(); if(act==='sample')old.sampleAt=now; if(act==='message')old.messageAt=now;if(act==='memo'){const v=prompt(`${buyer} のメモ`,old.note||'');if(v===null)return;old.note=v.trim()}await putOne('customerMeta',old);customerMeta.set(buyer,old);renderCustomers()}
function renderHistory(){
 const rows=[...allSales].sort((a,b)=>b.date.localeCompare(a.date)||b.amount-a.amount);D('salesHistory').innerHTML=rows.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${escapeHtml(r.saleType)}</td><td>${itemGroup(r.item,r.variety)}</td><td>${escapeHtml(r.variety)}</td><td>${escapeHtml(r.length)}</td><td>${r.qty}</td><td>${yen(r.unitPrice)}</td><td>${yen(r.amount)}</td><td>${escapeHtml(r.buyer)}</td></tr>`).join('');
}
})();
