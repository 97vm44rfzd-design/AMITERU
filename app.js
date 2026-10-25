let db;
let csvRows = [];
let eucalyptusProducts = [];
let unresolvedTokens = [];

const $ = id => document.getElementById(id);

const openReq = indexedDB.open("amiteru_v43", 1);
openReq.onupgradeneeded = e => {
  e.target.result.createObjectStore("varieties", { keyPath: "id", autoIncrement: true });
};
openReq.onsuccess = e => {
  db = e.target.result;
  renderLibrary();
};
openReq.onerror = () => alert("データ保存を開けませんでした。Safariの通常タブで開いてください。");

function store(mode="readonly"){return db.transaction("varieties", mode).objectStore("varieties")}
function getAllVarieties(){
  return new Promise((resolve,reject)=>{
    const req=store().getAll();
    req.onsuccess=()=>resolve(req.result);
    req.onerror=reject;
  });
}
function putVariety(obj){
  return new Promise((resolve,reject)=>{
    const req=store("readwrite").put(obj);
    req.onsuccess=()=>resolve(req.result);
    req.onerror=reject;
  });
}
function deleteVariety(id){
  return new Promise((resolve,reject)=>{
    const req=store("readwrite").delete(id);
    req.onsuccess=()=>resolve();
    req.onerror=reject;
  });
}

function normalize(str){
  return (str || "")
    .normalize("NFKC")
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/[\u30FB･・]/g, "・")
    .toLowerCase();
}
function aliasesFromText(text){
  return (text || "")
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function fileToDataURL(file, maxSize=1200, quality=0.82){
  return new Promise((resolve,reject)=>{
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

$("saveVariety").onclick = async () => {
  const name = $("vname").value.trim();
  const aliasText = $("valiases").value.trim();
  const file = $("vfile").files[0];
  if(!name || !file){
    alert("正式名と写真を入れてください。");
    return;
  }
  const url = await fileToDataURL(file);
  await putVariety({
    name,
    aliases: aliasesFromText(aliasText),
    url
  });
  $("vname").value = "";
  $("valiases").value = "";
  $("vfile").value = "";
  renderLibrary();
};

async function renderLibrary(){
  const varieties = await getAllVarieties();
  $("library").innerHTML = varieties.map(v => `
    <div class="v">
      <img src="${v.url}">
      <b>${escapeHtml(v.name)}</b>
      <div>${(v.aliases || []).map(a => `<span class="chip">${escapeHtml(a)}</span>`).join("")}</div>
      <div class="row" style="margin-top:8px">
        <button class="red" onclick="window.removeVarietyById(${v.id})">削除</button>
      </div>
    </div>
  `).join("");
}
window.removeVarietyById = async (id) => {
  await deleteVariety(id);
  renderLibrary();
};

function escapeHtml(str){
  return (str || "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[s]));
}

function parseCSV(text){
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];
    if(ch === '"'){
      if(inQuotes && next === '"'){
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if(ch === ',' && !inQuotes){
      row.push(cell);
      cell = "";
    } else if((ch === '\n' || ch === '\r') && !inQuotes){
      if(ch === '\r' && next === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if(cell.length || row.length){
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

function headerIndex(headers, candidates){
  for(const c of candidates){
    const idx = headers.findIndex(h => normalize(h) === normalize(c));
    if(idx >= 0) return idx;
  }
  return -1;
}

function tokeniseVarieties(detailText){
  let s = (detailText || "").trim();
  if(!s) return [];
  // 区切りをある程度吸収
  let parts = s.split(/[・,，/／＋+]/).map(x => x.trim()).filter(Boolean);
  // それでも1個しか取れない場合は全角スペースも試す
  if(parts.length <= 1){
    parts = s.split(/[ 　]/).map(x => x.trim()).filter(Boolean);
  }
  // 数量っぽいものを除外
  parts = parts.filter(p => !/^\d+(本|束|箱)?$/.test(p));
  return [...new Set(parts)];
}

function varietyLookupMap(varieties){
  const map = new Map();
  for(const v of varieties){
    map.set(normalize(v.name), v);
    for(const a of (v.aliases || [])){
      map.set(normalize(a), v);
    }
  }
  return map;
}

async function parseCurrentCSV(){
  const file = $("csvFile").files[0];
  if(!file){
    alert("CSVを選んでください。");
    return;
  }
  const text = await file.text();
  const matrix = parseCSV(text);
  if(matrix.length < 2){
    alert("CSVの行数が足りません。");
    return;
  }
  const headers = matrix[0].map(h => String(h).trim());
  const colItem = headerIndex(headers, ["品目"]);
  const colDetail = headerIndex(headers, ["詳細", "内訳", "備考"]);
  const colVariety = headerIndex(headers, ["品種"]);
  const colLength = headerIndex(headers, ["長さ・等級","長さ", "等級"]);
  const colBox = headerIndex(headers, ["箱"]);
  if(colItem < 0){
    alert("CSVに『品目』列が見つかりません。");
    return;
  }

  csvRows = matrix.slice(1).map((r, i) => ({
    rowNo: i + 2,
    item: r[colItem] || "",
    detail: colDetail >= 0 ? (r[colDetail] || "") : "",
    variety: colVariety >= 0 ? (r[colVariety] || "") : "",
    length: colLength >= 0 ? (r[colLength] || "") : "",
    box: colBox >= 0 ? (r[colBox] || "") : ""
  }));

  const varieties = await getAllVarieties();
  const lookup = varietyLookupMap(varieties);

  eucalyptusProducts = [];
  unresolvedTokens = [];

  let seq = 1;
  for(const row of csvRows){
    if(normalize(row.item) !== normalize("ユーカリ")) continue;
    const tokens = tokeniseVarieties(row.detail || row.variety);
    const matches = [];
    const unresolved = [];
    for(const token of tokens){
      const hit = lookup.get(normalize(token));
      if(hit){
        // 重複防止
        if(!matches.some(m => m.id === hit.id)) matches.push(hit);
      } else {
        unresolved.push(token);
        if(!unresolvedTokens.includes(token)) unresolvedTokens.push(token);
      }
    }
    eucalyptusProducts.push({
      seq,
      rowNo: row.rowNo,
      box: row.box,
      length: row.length,
      sourceText: row.detail || row.variety,
      tokens,
      matches,
      unresolved,
      generatedUrl: ""
    });
    seq++;
  }

  $("csvStatus").textContent = `CSVを読み込みました。ユーカリ ${eucalyptusProducts.length}商品を検出。未一致 ${unresolvedTokens.length}件。`;
  renderCsvSummary();
  renderUnmatched();
  renderProducts();
}

$("parseCsv").onclick = parseCurrentCSV;

function renderCsvSummary(){
  $("csvSummary").innerHTML = `
    <div class="note small">
      ユーカリ商品数：<b>${eucalyptusProducts.length}</b><br>
      未一致品種数：<b>${unresolvedTokens.length}</b>
    </div>
  `;
}

async function renderUnmatched(){
  const varieties = await getAllVarieties();
  const options = ['<option value="">画像を選択</option>']
    .concat(varieties.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`))
    .join("");
  if(unresolvedTokens.length === 0){
    $("unmatchedArea").style.display = "none";
    return;
  }
  $("unmatchedArea").style.display = "block";
  $("unmatchedList").innerHTML = unresolvedTokens.map(token => `
    <div class="product">
      <div><span class="warn">未一致</span> <b>${escapeHtml(token)}</b></div>
      <div class="row" style="margin-top:8px">
        <select id="map_${escapeAttr(token)}" style="flex:1;min-width:220px">${options}</select>
        <label class="small"><input type="checkbox" id="save_${escapeAttr(token)}"> 別名として保存</label>
      </div>
    </div>
  `).join("");
}

function escapeAttr(str){
  return btoa(unescape(encodeURIComponent(str))).replace(/=/g,'');
}

$("applyUnmatched").onclick = async () => {
  const varieties = await getAllVarieties();
  const varietyById = new Map(varieties.map(v => [String(v.id), v]));
  const mapping = new Map();

  for(const token of unresolvedTokens){
    const key = escapeAttr(token);
    const val = document.getElementById(`map_${key}`).value;
    const save = document.getElementById(`save_${key}`).checked;
    if(val){
      const v = varietyById.get(String(val));
      if(v){
        mapping.set(token, v);
        if(save){
          const existingAliases = new Set(v.aliases || []);
          existingAliases.add(token);
          v.aliases = [...existingAliases];
          await putVariety(v);
        }
      }
    }
  }

  // 商品に反映
  for(const p of eucalyptusProducts){
    const still = [];
    for(const token of p.unresolved){
      const v = mapping.get(token);
      if(v){
        if(!p.matches.some(m => m.id === v.id)) p.matches.push(v);
      } else {
        still.push(token);
      }
    }
    p.unresolved = still;
  }

  // unresolvedTokens再計算
  unresolvedTokens = [...new Set(eucalyptusProducts.flatMap(p => p.unresolved))];
  $("csvStatus").textContent = `未一致反映後：ユーカリ ${eucalyptusProducts.length}商品 / 未一致 ${unresolvedTokens.length}件`;
  renderLibrary();
  renderUnmatched();
  renderProducts();
};

function renderProducts(){
  if(eucalyptusProducts.length === 0){
    $("productsArea").style.display = "none";
    return;
  }
  $("productsArea").style.display = "block";
  $("productsList").innerHTML = eucalyptusProducts.map(p => `
    <div class="product">
      <div class="row">
        <div><b>${String(p.seq).padStart(2,'0')}</b></div>
        ${p.length ? `<span class="chip">${escapeHtml(p.length)}</span>` : ""}
        ${p.box ? `<span class="chip">箱 ${escapeHtml(p.box)}</span>` : ""}
        ${p.unresolved.length ? `<span class="warn">未一致 ${p.unresolved.length}</span>` : `<span class="chip">照合OK</span>`}
      </div>
      <div class="small" style="margin-top:6px">CSV内容：${escapeHtml(p.sourceText)}</div>
      <div style="margin-top:6px">
        ${p.matches.map(v => `<span class="chip">${escapeHtml(v.name)}</span>`).join("")}
        ${p.unresolved.map(t => `<span class="warn">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="small mono" style="margin-top:6px">出力名：${String(p.seq).padStart(2,'0')}_mix.jpg</div>
      <div id="preview_${p.seq}" style="margin-top:8px">${p.generatedUrl ? `<img class="preview" src="${p.generatedUrl}">` : ""}</div>
      <div id="download_${p.seq}" style="margin-top:8px">${p.generatedUrl ? `<a class="btn" download="${String(p.seq).padStart(2,'0')}_mix.jpg" href="${p.generatedUrl}">画像を保存</a>` : ""}</div>
    </div>
  `).join("");
}

function roundedPath(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h){
  const ratio = Math.max(w / img.width, h / img.height);
  const nw = img.width * ratio;
  const nh = img.height * ratio;
  ctx.drawImage(img, x + (w - nw) / 2, y + (h - nh) / 2, nw, nh);
}
function drawCard(ctx, img, x, y, w, h, r = 26){
  ctx.save();
  roundedPath(ctx, x, y, w, h, r);
  ctx.clip();
  drawCover(ctx, img, x, y, w, h);
  ctx.restore();
}
function layoutFor(n){
  const CW = 1250, CH = 1532, pad = 18, gap = 18;
  if(n === 3){
    const h = (CH - pad*2 - gap*2) / 3;
    return [0,1,2].map(i => ({x:pad,y:pad+i*(h+gap),w:CW-pad*2,h}));
  }
  if(n === 4){
    const w = (CW - pad*2 - gap) / 2;
    const h = (CH - pad*2 - gap) / 2;
    return [0,1,2,3].map(i => ({x:pad + (i%2)*(w+gap), y:pad + Math.floor(i/2)*(h+gap), w, h}));
  }
  const topW = (CW - pad*2 - gap*2) / 3;
  const topH = 560;
  const bottomW = (CW - pad*2 - gap) / 2;
  const bottomY = pad + topH + gap;
  const bottomH = CH - pad - bottomY;
  return [
    {x:pad,y:pad,w:topW,h:topH},
    {x:pad+topW+gap,y:pad,w:topW,h:topH},
    {x:pad+2*(topW+gap),y:pad,w:topW,h:topH},
    {x:pad,y:bottomY,w:bottomW,h:bottomH},
    {x:pad+bottomW+gap,y:bottomY,w:bottomW,h:bottomH},
  ];
}
function loadImage(src){
  return new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function generateMixForProduct(p){
  const count = p.matches.length;
  if(count < 3 || count > 5 || p.unresolved.length > 0){
    return "";
  }
  const imgs = await Promise.all(p.matches.map(v => loadImage(v.url)));
  const c = $("cv");
  const ctx = c.getContext("2d");
  c.width = 1250;
  c.height = 1532;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0,0,c.width,c.height);
  const cells = layoutFor(count);
  imgs.forEach((img, i) => {
    const cell = cells[i];
    drawCard(ctx, img, cell.x, cell.y, cell.w, cell.h);
  });
  return c.toDataURL("image/jpeg", 0.86);
}

$("generateAllMix").onclick = async () => {
  for(const p of eucalyptusProducts){
    p.generatedUrl = await generateMixForProduct(p);
  }
  renderProducts();
  $("csvStatus").textContent = `ミックス画像を生成しました。生成済み ${eucalyptusProducts.filter(p => p.generatedUrl).length}件`;
};
