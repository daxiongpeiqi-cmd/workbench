// 规划报告解读 · 前端主流程（v2 开学季版）
// 底座复用试卷分析：豆包流式调用 / 续写兜底 / 停滞检测 / 本机 Key 存储（全免费原则）

const CFG_STORE = "report_plan_cfg_v1";
const DEFAULTS = {
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-seed-2-1-turbo-260628",
  vision: "doubao-seed-2-1-turbo-260628",
  speed: true
};
let ARK = { key: "", baseUrl: "", model: "", vision: "" };
const uploads = { material: [] };
let CURRENT_REPORT = null;

// ---------- 配置 ----------
function loadCfg() {
  try { const raw = localStorage.getItem(CFG_STORE); if (!raw) return null; const c = JSON.parse(raw); return c && c.key ? c : null; }
  catch (e) { return null; }
}
function saveCfg(c) { try { localStorage.setItem(CFG_STORE, JSON.stringify(c)); return true; } catch (e) { return false; } }
function showGate(prefill) {
  document.getElementById("gate").style.display = "block";
  document.getElementById("setup").style.display = "none";
  document.getElementById("reportPage").style.display = "none";
  if (prefill) {
    document.getElementById("cfgKey").value = prefill.key || "";
    document.getElementById("cfgBase").value = prefill.baseUrl || DEFAULTS.baseUrl;
    document.getElementById("cfgModel").value = prefill.model || DEFAULTS.model;
    document.getElementById("cfgVision").value = prefill.vision || DEFAULTS.vision;
    document.getElementById("cfgSpeed").checked = !!prefill.speed;
  }
  window.scrollTo(0, 0);
}
function showSetup() {
  document.getElementById("gate").style.display = "none";
  document.getElementById("setup").style.display = "block";
  window.scrollTo(0, 0);
}

// ---------- 初始化 ----------
window.addEventListener("DOMContentLoaded", () => {
  const cfg = loadCfg();
  if (cfg) { ARK = Object.assign({}, DEFAULTS, cfg); showSetup(); }
  else { showGate(DEFAULTS); }

  // 省份 → 高考模式联动
  const provSel = document.getElementById("province");
  const modeSel = document.getElementById("mode");
  function syncMode() {
    const p = provSel.value;
    modeSel.value = (typeof GAOKAO_MODE !== "undefined" && GAOKAO_MODE[p]) || "3+1+2";
  }
  provSel.addEventListener("change", syncMode); syncMode();

  // 年级 → 选科提示
  const gradeSel = document.getElementById("grade");
  const combWrap = document.getElementById("comboWrap");
  function syncComboHint() {
    const g = gradeSel.value;
    combWrap.querySelector(".hint").textContent =
      (g === "高一") ? "（高一可留空，做倾向初判）" : "（高二/高三必填）";
  }
  gradeSel.addEventListener("change", syncComboHint); syncComboHint();

  // 上传交互（可选材料）
  document.querySelectorAll(".up").forEach(el => {
    const kind = el.dataset.kind;
    const input = el.querySelector("input[type=file]");
    el.addEventListener("click", () => input.click());
    input.addEventListener("change", e => { addFiles(kind, e.target.files); input.value = ""; });
    el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragenter", e => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag"));
    el.addEventListener("drop", e => { e.preventDefault(); el.classList.remove("drag"); addFiles(kind, e.dataTransfer.files); });
  });
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => e.preventDefault());

  document.getElementById("genBtn").addEventListener("click", onGenerate);
  document.getElementById("cfgBtn").addEventListener("click", onSaveConfig);
  document.getElementById("editCfg").addEventListener("click", () => showGate(loadCfg() || DEFAULTS));
  document.getElementById("backBtn").addEventListener("click", () => {
    document.getElementById("reportPage").style.display = "none";
    document.getElementById("setup").style.display = "block";
    window.scrollTo(0, 0);
  });
  // 再做一份：清空已填信息并跳回表单（方便连续给多个学生出报告）
  document.getElementById("redoBtn").addEventListener("click", resetForNewReport);

  // 修正弹窗
  document.getElementById("correctBtn").addEventListener("click", openCorrect);
  document.getElementById("correctClose").addEventListener("click", closeCorrect);
  document.getElementById("correctSubmit").addEventListener("click", submitCorrect);
});

// ---------- 保存并验证配置 ----------
async function onSaveConfig() {
  const btn = document.getElementById("cfgBtn");
  const msg = document.getElementById("cfgMsg");
  const c = {
    key: document.getElementById("cfgKey").value.trim(),
    baseUrl: document.getElementById("cfgBase").value.trim() || DEFAULTS.baseUrl,
    model: document.getElementById("cfgModel").value.trim() || DEFAULTS.model,
    vision: document.getElementById("cfgVision").value.trim() || DEFAULTS.vision,
    speed: document.getElementById("cfgSpeed").checked
  };
  if (!c.key) { msg.textContent = "请填写 API Key"; return; }
  btn.disabled = true; msg.style.color = "#22d3ee"; msg.textContent = "正在验证 API 配置…";
  try {
    const r = await fetch(c.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({ model: c.model, messages: [{ role: "user", content: "hi" }], max_tokens: 8 })
    });
    if (!r.ok) { const t = await r.text(); throw new Error("HTTP " + r.status + "：" + t.slice(0, 180)); }
    saveCfg(c); ARK = Object.assign({}, c);
    msg.style.color = "#2dd4bf"; msg.textContent = "✓ 验证通过，正在进入…";
    setTimeout(showSetup, 500);
  } catch (e) {
    msg.style.color = ""; msg.textContent = "验证失败：" + e.message + "（可检查 Key / 模型名 / 网络）";
  } finally { btn.disabled = false; }
}

// ---------- 文件处理（可选上传材料：成绩单/报告 图片或 PDF） ----------
function addFiles(kind, fileList) {
  const ok = Array.from(fileList).filter(f => f.type.startsWith("image/") || f.type === "application/pdf");
  if (!ok.length) { setProgress("⚠️ 仅支持 PDF 或图片"); return; }
  uploads[kind].push(...ok); renderFileList();
}
function renderFileList() {
  const box = document.getElementById("fileList");
  let html = "";
  uploads.material.forEach((f, i) => {
    html += `<div class="file-row" data-i="${i}"><span class="file-name">${esc(f.name)} <span class="file-size">(${(f.size/1024).toFixed(0)}KB)</span></span><button class="file-del" type="button">×</button></div>`;
  });
  box.innerHTML = html;
  box.querySelectorAll(".file-del").forEach(b => b.addEventListener("click", () => {
    const i = parseInt(b.closest(".file-row").dataset.i, 10); uploads.material.splice(i, 1); renderFileList();
  }));
}
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}
async function pdfToImages(file, maxPages = 14) {
  if (!window.pdfjsLib) throw new Error("PDF 解析库未加载，请检查网络后刷新");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out = []; const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const vp = await page.getViewport({ scale: 1.4 });
    const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.8));
  }
  return out;
}
async function pdfToText(file) {
  if (!window.pdfjsLib) return "";
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let txt = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    if (c && c.items) txt += c.items.map(it => it.str || "").join(" ") + "\n\n";
  }
  return txt.trim();
}
async function filesToText(files, kind) {
  const textParts = [], imgParts = [];
  for (const f of files) {
    if (f.type === "application/pdf") {
      try { const t = await pdfToText(f); if (t && t.length > 50) { textParts.push("# 文件：" + f.name + "\n" + t); continue; } } catch (e) {}
      try { imgParts.push(...await pdfToImages(f)); } catch (e) { setProgress("⚠️ PDF 处理失败：" + e.message); }
    } else { imgParts.push(await fileToBase64(f)); }
  }
  let res = textParts.join("\n\n");
  if (imgParts.length) {
    const tr = await transcribeImages(imgParts);
    if (tr) res += (res ? "\n\n" : "") + tr;
  }
  return res;
}
async function transcribeImages(imgs) {
  const out = [];
  for (let i = 0; i < imgs.length; i += 4) {
    const batch = imgs.slice(i, i + 4);
    const content = [{ type: "text", text: "请如实转录下面图片中的学生成绩/报告文字内容（含科目与分数）。" }];
    batch.forEach(b => content.push({ type: "image_url", image_url: { url: b } }));
    try {
      const text = await chatStream(ARK.vision || ARK.model, [
        { role: "system", content: "你是成绩转录员，如实抄录图片文字，不解释。" },
        { role: "user", content }
      ], null, 0.1, 3500);
      if (text) out.push(text);
    } catch (e) { setProgress("⚠️ 图片转录出错：" + e.message); }
  }
  return out.join("\n\n");
}

// ---------- 实时打字预览 ----------
function startLiveStream() {
  const box = document.getElementById("live-stream"), body = document.getElementById("live-body"), stats = document.getElementById("live-stats");
  if (!box || !body) return;
  body.textContent = ""; stats.textContent = "0 字"; box.style.display = "block"; body.scrollTop = 0;
}
function appendLiveStream(text) {
  const body = document.getElementById("live-body"), stats = document.getElementById("live-stats");
  if (!body) return; body.textContent = text; stats.textContent = text.length + " 字"; body.scrollTop = body.scrollHeight;
}
function endLiveStream() { const box = document.getElementById("live-stream"); if (box) box.style.display = "none"; }

// ---------- 大模型流式调用 ----------
async function chatStream(model, messages, onText, temp = 0.4, maxTokens = 8000, extra = null, jsonMode = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9 * 60 * 1000);
  let full = "";
  try {
    const body = { model, messages, temperature: temp, max_tokens: maxTokens, stream: true };
    if (jsonMode) body.response_format = { type: "json_object" };
    if (extra && typeof extra === "object") Object.assign(body, extra);
    const resp = await fetch(ARK.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ARK.key },
      body: JSON.stringify(body), signal: ctrl.signal
    });
    if (!resp.ok) { const e = await resp.text(); throw new Error("HTTP " + resp.status + "：" + e.slice(0, 300)); }
    const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
        if (line.startsWith("data:")) {
          const d = line.slice(5).trim(); if (d === "[DONE]") continue;
          try { const j = JSON.parse(d); const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (t) { full += t; if (onText) onText(full); } } catch (e2) {}
        }
      }
    }
  } finally { clearTimeout(timer); }
  return full;
}

// ---------- 收集表单 ----------
function collectScores() {
  const rows = [...document.querySelectorAll(".score-row")];
  const parts = []; let any = false;
  rows.forEach(r => {
    const subj = r.querySelector(".sc-subj").value.trim();
    const val = r.querySelector(".sc-val").value.trim();
    if (subj && val !== "") { parts.push(subj + " " + val); any = true; }
  });
  return { text: parts.join(" ／ "), entered: any };
}
function buildProvHint(prov, mode) {
  const d = (typeof PROV_DATA !== "undefined") && PROV_DATA[prov];
  if (!d) return "";
  let s = `省份：${prov}（模式 ${mode}），2026 统考约 ${d.cand} 万人。`;
  if (d.line) {
    const segs = [];
    if (mode === "3+3") {
      if (d.line.本科 != null) segs.push(`本科线 ${d.line.本科}` + (d.rank && d.rank.本科 ? `（位次≈${d.rank.本科}）` : ""));
      if (d.line.特控 != null) segs.push(`特控线 ${d.line.特控}`);
    } else if (mode === "传统文理") {
      if (d.line.文科一批 != null) segs.push(`文科一批 ${d.line.文科一批}`);
      if (d.line.理科一批 != null) segs.push(`理科一批 ${d.line.理科一批}`);
    } else {
      if (d.line.历史 != null) segs.push(`历史类本科 ${d.line.历史}`);
      if (d.line.物理 != null) segs.push(`物理类本科 ${d.line.物理}`);
      if (d.line.特控历史 != null) segs.push(`历史特控 ${d.line.特控历史}`);
      if (d.line.特控物理 != null) segs.push(`物理特控 ${d.line.特控物理}`);
    }
    if (segs.length) s += " " + segs.join("；") + "。";
  }
  s += " 做位次换算时以此为准。";
  return s;
}

// ---------- 主流程：生成报告 ----------
async function onGenerate() {
  const cfg = loadCfg();
  if (!cfg) { showGate(DEFAULTS); return; }
  ARK = Object.assign({}, DEFAULTS, cfg);

  const grade = document.getElementById("grade").value;
  const prov = document.getElementById("province").value;
  const mode = document.getElementById("mode").value;
  const rest = document.getElementById("rest").value;
  const comb = document.getElementById("combo").value.trim();
  const target = document.getElementById("target").value.trim();
  const teachers = document.getElementById("teachers").value.trim();
  const extraInfo = document.getElementById("extraInfo").value.trim();
  const { text: scoreText, entered: scoresEntered } = collectScores();

  // 分数门控提示（仍允许生成通用建议）
  if (!scoresEntered && !uploads.material.length) {
    if (!confirm("未填写成绩且未上传材料，将仅生成年级通用规划建议（不编造分数）。继续？")) return;
  }

  const btn = document.getElementById("genBtn"); btn.disabled = true;
  try {
    setProgress("① 读取上传材料中（若有）…");
    let material = "";
    if (uploads.material.length) { material = await filesToText(uploads.material, "material"); }

    const ctx = {
      grade, prov, mode, rest, comb, target, teachers, extraInfo,
      scoresEntered, scoreText,
      material,
      provHint: buildProvHint(prov, mode)
    };

    const extra = {};
    if (ARK.speed && /seed/i.test(ARK.model)) extra.thinking = { type: "disabled" };

    setProgress("② 调用豆包生成《学业规划报告解读》中…\n已生成 0 字");
    startLiveStream();
    const raw = await chatStream(ARK.model, [
      { role: "system", content: REPORT_SYSTEM },
      { role: "user", content: reportUser(ctx) }
    ], t => { setProgress("② 生成中… 已生成 " + t.length + " 字"); appendLiveStream(t); }, 0.5, 16000, extra, true);

    const res = await completeJSONIfTruncated(raw, ctx, extra);
    if (!res.ok || !res.data || !res.data.portrait)
      throw new Error("未返回可解析的报告 JSON（" + (res.reason || "未知") + "，已生成 " + (res.raw||"").length + " 字）。建议：①关闭速度优先；②切更大 pro 模型；③重试。");

    const data = res.data;
    data.meta = { grade, prov, mode, rest, comb, target, teachers, scoresEntered };
    CURRENT_REPORT = data;
    endLiveStream();
    renderBoth(data);

    document.getElementById("setup").style.display = "none";
    document.getElementById("reportPage").style.display = "block";
    window.scrollTo(0, 0);
    setProgress("");
  } catch (e) {
    endLiveStream();
    setProgress("❌ 出错：" + e.message);
  } finally { btn.disabled = false; }
}

// 同时渲染屏幕版与导出版
function renderBoth(data) {
  document.getElementById("capture-area").innerHTML = renderReport(data, "screen");
  document.getElementById("export-area").innerHTML = renderReport(data, "export");
}

// ---------- 修正 / 补充 ----------
const REPORT_CORRECT_SYSTEM = "你是严谨的学业规划报告编辑助手。用户给出已有报告 JSON 与若干修正意见，请据此修订对应字段，其他字段原样保留，输出完整 JSON（结构同原报告：portrait/subjects/plan/adapt_checklist/teacher_advice/target_outlook/parent_words）。注意 plan 是对象{overview:字符串, stages:数组(阶段/时间锚点/重点任务/里程碑), actions:数组(关键动作)}，修订时保持该结构不可拍平为字符串。严禁编造分数、严禁出现其他机构名、严禁硬广。仅输出 JSON 本身。";
function openCorrect() {
  if (!CURRENT_REPORT) return alert("请先生成报告");
  document.getElementById("correctModal").style.display = "flex";
  document.getElementById("correctInput").value = "";
  document.getElementById("correctMsg").textContent = "";
  setTimeout(() => document.getElementById("correctInput").focus(), 50);
}
function closeCorrect() { document.getElementById("correctModal").style.display = "none"; }
async function submitCorrect() {
  const input = document.getElementById("correctInput").value.trim();
  const msg = document.getElementById("correctMsg");
  if (!input) { msg.textContent = "请输入要修正的内容"; return; }
  if (!CURRENT_REPORT) { msg.textContent = "暂无报告可修正"; return; }
  const btn = document.getElementById("correctSubmit"); btn.disabled = true;
  msg.style.color = "#22d3ee"; msg.textContent = "正在根据修正重新生成（1–2 分钟）…";
  try {
    const cur = JSON.stringify(CURRENT_REPORT, null, 0);
    const extra = {}; if (ARK.speed && /seed/i.test(ARK.model)) extra.thinking = { type: "disabled" };
    const raw = await chatStream(ARK.model, [
      { role: "system", content: REPORT_CORRECT_SYSTEM },
      { role: "user", content: "【修正意见】\n" + input + "\n\n【当前报告 JSON】\n" + cur + "\n\n请修订并输出完整 JSON：" }
    ], t => { msg.textContent = "重新生成中… 已生成 " + t.length + " 字"; }, 0.5, 16000, extra, true);
    const res = extractJSON(raw);
    if (!res.ok || !res.data || !res.data.portrait) {
      // 修正结果也可能截断，尝试一次简单续写
      const fixed = await completeJSONIfTruncated(raw, CURRENT_REPORT.meta || {}, extra);
      if (fixed.ok && fixed.data && fixed.data.portrait) {
        fixed.data.meta = CURRENT_REPORT.meta;
        CURRENT_REPORT = fixed.data;
        renderBoth(fixed.data);
        closeCorrect(); setProgress("");
        return;
      }
      throw new Error("未解析到修正结果（" + (res.reason || "未知") + "）");
    }
    res.data.meta = CURRENT_REPORT.meta;
    CURRENT_REPORT = res.data;
    renderBoth(res.data);
    closeCorrect(); setProgress("");
  } catch (e) {
    msg.style.color = ""; msg.textContent = "❌ 修正失败：" + e.message;
  } finally { btn.disabled = false; }
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function setProgress(t) { const el = document.getElementById("progress"); if (el) el.textContent = t; }

// 再做一份：清空上一份填写（成绩/文本输入/上传材料），回到表单页（年级省份等下拉保留，便于连续出报告）
function resetForNewReport() {
  document.querySelectorAll(".score-row").forEach(r => { const v = r.querySelector(".sc-val"); if (v) v.value = ""; });
  ["combo", "target", "teachers", "extraInfo"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  uploads.material = [];
  renderFileList();
  endLiveStream();
  setProgress("");
  document.getElementById("reportPage").style.display = "none";
  document.getElementById("setup").style.display = "block";
  window.scrollTo(0, 0);
}

// 如果 JSON 被截断，用「续写」方式让模型接着输出
async function completeJSONIfTruncated(raw, ctx, extra) {
  if (!raw || raw.length < 2) return { ok: false, raw };
  let res = extractJSON(raw);
  if (res.ok && res.data && res.data.portrait) return { ok: true, data: res.data, raw };

  // 还没好：尝试续写（最多 2 次）
  let current = raw;
  for (let i = 1; i <= 2; i++) {
    const tail = current.slice(-120);
    const isInStr = /(?<!\\)"[^"]*$/.test(tail) || /\\$/.test(tail);
    const prompt = isInStr
      ? `上面 JSON 在字符串中被截断，请先安全闭合当前字符串（补 \"），然后继续输出后续字段，不要重复已输出内容，仅输出截断处之后的文本。`
      : `上面 JSON 未闭合（被截断），请从当前截断处继续输出剩余部分，不要重复已输出内容，仅输出后续文本，最终整体必须是一个合法 JSON 对象。`;

    setProgress(`② 检测到 JSON 截断，正在第 ${i} 次续写…`);
    const cont = await chatStream(ARK.model, [
      { role: "system", content: REPORT_SYSTEM },
      { role: "user", content: reportUser(ctx) },
      { role: "assistant", content: current },
      { role: "user", content: prompt }
    ], null, 0.4, 12000, extra, false); // 续写关闭 json_object，让模型自由补全

    current += cont;
    res = extractJSON(current);
    if (res.ok && res.data && res.data.portrait) return { ok: true, data: res.data, raw: current };
  }
  return { ok: false, raw: current, reason: res.reason || "JSON 不闭合（疑似被截断）" };
}
