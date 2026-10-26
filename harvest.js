(()=>{
const D=id=>document.getElementById(id); if(!D('harvestRows')) return;
function esc(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
let rows=[{variety:'',length:'60',magnets:0,extra:0}];
function total(r){return Math.max(0,Number(r.magnets)||0)*10+Math.max(0,Number(r.extra)||0)}
function render(){D('harvestRows').innerHTML=rows.map((r,i)=>`<tr><td><input data-i="${i}" data-k="variety" type="text" value="${esc(r.variety)}" placeholder="例：パルブラ"></td><td><select data-i="${i}" data-k="length"><option ${r.length==='70'?'selected':''}>70</option><option ${r.length==='60'?'selected':''}>60</option><option ${r.length==='50'?'selected':''}>50</option><option ${r.length==='40'?'selected':''}>40</option><option ${r.length==='35'?'selected':''}>35</option></select></td><td><input data-i="${i}" data-k="magnets" type="number" min="0" step="1" value="${r.magnets}"></td><td><input data-i="${i}" data-k="extra" type="number" min="0" max="9" step="1" value="${r.extra}"></td><td><b>${total(r)}本</b></td><td><button class="red harvestDel" data-i="${i}" type="button">削除</button></td></tr>`).join(''); summary();}
function summary(){const valid=rows.filter(r=>r.variety.trim()&&total(r)>0);const text=['Harvest Scan 集計',...valid.map(r=>`・${r.variety} ${r.length}cm：${total(r)}本（マグネット${r.magnets}個＋端数${r.extra}本）`),'','この在庫で、All-Seeing Eyeの予測も踏まえて箱組みを相談したいです。'].join('\n');D('harvestSummary').value=text;}
D('harvestRows').addEventListener('input',e=>{const i=Number(e.target.dataset.i),k=e.target.dataset.k;if(!Number.isInteger(i)||!k)return;rows[i][k]=['magnets','extra'].includes(k)?Math.max(0,Number(e.target.value)||0):e.target.value;if(k==='extra')rows[i][k]=Math.min(9,rows[i][k]);render()});
D('harvestRows').addEventListener('click',e=>{if(!e.target.classList.contains('harvestDel'))return;rows.splice(Number(e.target.dataset.i),1);if(!rows.length)rows.push({variety:'',length:'60',magnets:0,extra:0});render()});
D('addHarvestRow').addEventListener('click',()=>{rows.push({variety:'',length:'60',magnets:0,extra:0});render()});
D('harvestPhoto').addEventListener('change',e=>{const f=e.target.files?.[0];const im=D('harvestPreview');if(!f){im.style.display='none';return}im.src=URL.createObjectURL(f);im.style.display='block'});
D('harvestToShipping').addEventListener('click',()=>D('shippingTools')?.scrollIntoView({behavior:'smooth'}));
D('harvestToChat').addEventListener('click',async()=>{summary();const text=D('harvestSummary').value;const f=D('harvestPhoto').files?.[0];try{if(navigator.share){const payload={title:'AMITERU FLOW Harvest Scan',text};if(f&&navigator.canShare?.({files:[f]}))payload.files=[f];await navigator.share(payload)}else{await navigator.clipboard.writeText(text);alert('相談用テキストをコピーしました。ChatGPTに貼り付けてください。')}}catch(e){if(e?.name!=='AbortError'){try{await navigator.clipboard.writeText(text);alert('相談用テキストをコピーしました。')}catch(_){alert(text)}}}});
render();
})();
