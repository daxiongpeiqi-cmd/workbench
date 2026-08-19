// 云端固定网址版：API 配置由使用者自填，仅存本浏览器 localStorage，直连大模型
// 换设备 / 换浏览器 → 重新填写一次即可

// ---------- 师资介绍：仅在用户上传老师资料后，才结合资料+模型知识+薄弱点生成（见 buildTeacherIntro） ----------

// ---------- 配置存储 ----------
const CFG_STORE = "exam_diag_ark_cfg_v1";
const DEFAULTS = {
  baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  model: "doubao-seed-evolving",
  vision: "doubao-seed-evolving",
  speed: true
};

let ARK = { key: "", baseUrl: "", model: "", vision: "" };
const uploads = { exam: [], answer: [], student: [], teacher: [] };

function loadCfg() {
  try {
    const raw = localStorage.getItem(CFG_STORE);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return c && c.key ? c : null;
  } catch (e) { return null; }
}
function saveCfg(c) {
  try { localStorage.setItem(CFG_STORE, JSON.stringify(c)); return true; }
  catch (e) { return false; }
}

function showGate(prefill) {
  document.getElementById("gate").style.display = "block";
  document.getElementById("setup").style.display = "none";
  document.getElementById("reportPage").style.display = "none";
  if (prefill) {
    document.getElementById("cfgKey").value = prefill.key || "";
    document.getElementById("cfgBase").value = prefill.baseUrl || DEFAULTS.baseUrl;
    document.getElementById("cfgModel").value = prefill.model || DEFAULTS.model;
    document.getElementById("cfgVision").value = prefill.vision || DEFAULTS.vision;
    document.getElementById("cfgSpeed").checked = !!(prefill.speed);
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
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const cfg = loadCfg();
  if (cfg) { ARK = Object.assign({}, DEFAULTS, cfg); showSetup(); }
  else { showGate(DEFAULTS); }

  // 上传交互（点击 + 拖拽）
  document.querySelectorAll(".up").forEach(el => {
    const kind = el.dataset.kind;
    const input = el.querySelector("input[type=file]");
    el.addEventListener("click", () => input.click());
    input.addEventListener("change", e => { addFiles(kind, e.target.files); input.value = ""; });
    el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragenter", e => { e.preventDefault(); el.classList.add("drag"); });
    el.addEventListener("dragleave", () => el.classList.remove("drag"));
    el.addEventListener("drop", e => {
      e.preventDefault(); el.classList.remove("drag");
      addFiles(kind, e.dataTransfer.files);
    });
  });
  window.addEventListener("dragover", e => e.preventDefault());
  window.addEventListener("drop", e => e.preventDefault());

  document.getElementById("genBtn").addEventListener("click", onGenerate);
  document.getElementById("cfgBtn").addEventListener("click", onSaveConfig);
  document.getElementById("editCfg").addEventListener("click", () => showGate(loadCfg() || DEFAULTS));

  // 文件列表删除按钮（事件委托）
  document.getElementById("fileList").addEventListener("click", e => {
    const btn = e.target.closest(".file-del");
    if (!btn) return;
    const row = btn.closest(".file-row");
    if (!row) return;
    const k = row.dataset.kind;
    const i = parseInt(row.dataset.i, 10);
    if (!isNaN(i)) removeFile(k, i);
  });
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

  btn.disabled = true;
  msg.style.color = "#22d3ee";
  msg.textContent = "正在验证 API 配置…";
  try {
    const r = await fetch(c.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + c.key },
      body: JSON.stringify({ model: c.model, messages: [{ role: "user", content: "hi" }], max_tokens: 8 })
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error("HTTP " + r.status + "：" + t.slice(0, 180));
    }
    saveCfg(c);
    ARK = Object.assign({}, c);
    msg.style.color = "#2dd4bf";
    msg.textContent = "✓ 验证通过，正在进入…";
    setTimeout(showSetup, 500);
  } catch (e) {
    msg.style.color = "";
    msg.textContent = "验证失败：" + e.message + "（可检查 Key / 模型名 / 网络）";
  } finally {
    btn.disabled = false;
  }
}

// ---------- 文件处理 ----------
function addFiles(kind, fileList) {
  const accept = (kind === "teacher")
    ? [".json", ".txt", "image/", "application/pdf"]
    : ["image/", "application/pdf"];
  const ok = Array.from(fileList).filter(f => {
    const n = f.name.toLowerCase();
    return accept.some(a => a.startsWith(".") ? n.endsWith(a) : f.type.startsWith(a) || f.type === "application/pdf");
  });
  if (!ok.length) { setProgress("⚠️ 文件类型不支持，请上传 PDF 或图片"); return; }
  uploads[kind].push(...ok);
  renderFileList();
}

function renderFileList() {
  const box = document.getElementById("fileList");
  const labels = { exam: "试卷", answer: "答案解析", student: "孩子答题", teacher: "老师资料" };
  let html = "";
  for (const k in uploads) {
    uploads[k].forEach((f, i) => {
      html += `<div class="file-row" data-kind="${k}" data-i="${i}">
        <span class="file-name" title="${esc(f.name)}"><b>${labels[k]}</b>：${esc(f.name)} <span class="file-size">(${(f.size / 1024).toFixed(0)}KB)</span></span>
        <button class="file-del" type="button" title="删除此文件" aria-label="删除">×</button>
      </div>`;
    });
  }
  box.innerHTML = html;
  // 同步每个上传区 .has 状态（删到 0 时取消绿框 + 对勾）
  for (const k in uploads) {
    const zone = document.querySelector(`.up[data-kind="${k}"]`);
    if (zone) zone.classList.toggle("has", uploads[k].length > 0);
  }
}

function removeFile(kind, i) {
  if (!uploads[kind] || i < 0 || i >= uploads[kind].length) return;
  uploads[kind].splice(i, 1);
  renderFileList();
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function pdfToImages(file, maxPages = 14) {
  if (!window.pdfjsLib) throw new Error("PDF 解析库未加载，请检查网络后刷新");
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const out = [];
  const n = Math.min(pdf.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await pdf.getPage(i);
    const vp = await page.getViewport({ scale: 1.4 });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
    out.push(canvas.toDataURL("image/jpeg", 0.8));
  }
  return out;
}

// 直接抽取 PDF 文本层（电子 PDF 用，毫秒级，远快于转图 + 视觉转录）
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
  const textParts = [];   // 已从文本层抽出的文字（PDF 电子版）
  const imgParts = [];    // 需视觉模型转录的图片（扫描件 / 照片）
  for (const f of files) {
    if (f.type === "application/pdf") {
      try {
        const t = await pdfToText(f);
        // 文本层有效（够长、非空白）则直接采用，跳过转图与视觉转录
        if (t && t.length > 50) {
          textParts.push("# 文件：" + f.name + "\n" + t);
          continue;
        }
      } catch (e) { /* 抽取失败则回退转图 */ }
      // 扫描件 / 无文本层 → 转图后视觉转录
      try { imgParts.push(...await pdfToImages(f)); }
      catch (e) { setProgress("⚠️ PDF 处理失败：" + e.message + "（" + f.name + "）"); }
    } else {
      imgParts.push(await fileToBase64(f));
    }
  }
  let res = textParts.join("\n\n");
  if (imgParts.length) {
    const tr = await transcribeImages(imgParts, kind);
    if (tr) res += (res ? "\n\n" : "") + tr;
  }
  return res;
}

async function transcribeImages(imgs, kind) {
  const ctx = kind === "student" ? "（这是学生的作答，请逐题抄录其作答内容）" : "";
  const out = [];
  for (let i = 0; i < imgs.length; i += 4) {
    const batch = imgs.slice(i, i + 4);
    const content = [{ type: "text", text: visionTranscribeUser(ctx) }];
    batch.forEach(b => content.push({ type: "image_url", image_url: { url: b } }));
    try {
      const text = await chatStream(ARK.vision || ARK.model, [
        { role: "system", content: VISION_TRANSCRIBE_SYSTEM },
        { role: "user", content }
      ], null, 0.1, 3500);
      if (text) out.push(text);
    } catch (e) {
      setProgress("⚠️ 图片转录出错：" + e.message);
    }
  }
  return out.join("\n\n");
}

// ---------- 实时打字预览 ----------
function startLiveStream() {
  const box = document.getElementById("live-stream");
  const body = document.getElementById("live-body");
  const stats = document.getElementById("live-stats");
  if (!box || !body) return;
  body.textContent = "";
  stats.textContent = "0 字";
  box.style.display = "block";
  body.scrollTop = 0;
}
function appendLiveStream(text) {
  const body = document.getElementById("live-body");
  const stats = document.getElementById("live-stats");
  if (!body) return;
  // 仅显示模型主要输出；过滤常见的 markdown fence（视觉干净）
  body.textContent = text;
  stats.textContent = text.length + " 字";
  // 自动滚到底
  body.scrollTop = body.scrollHeight;
}
function endLiveStream() {
  const box = document.getElementById("live-stream");
  if (box) box.style.display = "none";
}

// ---------- 大模型调用（流式） ----------
async function chatStream(model, messages, onText, temp = 0.4, maxTokens = 8000, extra = null, jsonMode = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9 * 60 * 1000);
  let full = "";
  try {
    const body = { model, messages, temperature: temp, max_tokens: maxTokens, stream: true };
    if (jsonMode) body.response_format = { type: "json_object" };  // 豆包支持 OpenAI 兼容：模型只输出合法 JSON
    if (extra && typeof extra === "object") Object.assign(body, extra);
    const resp = await fetch(ARK.baseUrl.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + ARK.key },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!resp.ok) {
      const e = await resp.text();
      throw new Error("HTTP " + resp.status + "：" + e.slice(0, 300));
    }
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith("data:")) {
          const d = line.slice(5).trim();
          if (d === "[DONE]") continue;
          try {
            const j = JSON.parse(d);
            const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (t) { full += t; if (onText) onText(full); }
          } catch (e2) {}
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return full;
}

// ---------- 主流程 ----------
let CURRENT_REPORT = null;  // 当前报告 JSON（矫正时复用）
let CURRENT_TEACHER = null;

async function onGenerate() {
  const cfg = loadCfg();
  if (!cfg) { showGate(DEFAULTS); return; }
  ARK = Object.assign({}, DEFAULTS, cfg);

  if (!uploads.exam.length || !uploads.answer.length || !uploads.student.length)
    return alert("请至少上传：试卷、答案解析、孩子答题情况");

  const btn = document.getElementById("genBtn");
  btn.disabled = true;

  const speed = !!ARK.speed;

  try {
    setProgress("① 读取并转录材料中（电子 PDF 直接抽文字，扫描件/图片才转图发送模型）…");
    const [examText, answerText, studentText] = await Promise.all([
      filesToText(uploads.exam, "exam"),
      filesToText(uploads.answer, "answer"),
      filesToText(uploads.student, "student")
    ]);

    if (!examText || !answerText || !studentText)
      throw new Error("有一类材料未能成功读取文字，请确认文件清晰或非纯图片扫描件");

    // 老师资料：仅当上传了才提取文字，稍后结合诊断结果生成介绍
    let teacherRaw = null;
    if (uploads.teacher.length) {
      setProgress("④ 提取【老师资料】文字中…");
      teacherRaw = await readTeacherMaterial(uploads.teacher);
    }

    const profile = {
      name: document.getElementById("stuName").value.trim() || "同学",
      grade: document.getElementById("stuGrade").value.trim() || "—",
      subject: document.getElementById("stuSubject").value.trim() || "语文",
      exam_name: document.getElementById("examName").value.trim() || "开学摸底考",
      background: document.getElementById("stuBg").value.trim() || "暂无"
    };

    // 速度优先：seed 系列关闭深度思考，大幅提速（复杂推理略弱）
    const extra = {};
    if (speed && /seed/i.test(ARK.model)) extra.thinking = { type: "disabled" };

    // 两步生成：① 精简判分（score/questions[kp+brief]/kp_mastery/weak_signals）② 诊断方案
    // 目的：物理/理综类试卷题量大，若 questions 数组每题展开 student_summary/correct_answer/comment（占 80% 体积），
    //        无论中英文 JSON 都会远超 32k token 输出上限。改为精简判分包，每条错题 ≤ 80 字符，
    //        且只列错题（正确题不展示），整套判分包控制在 1000-2000 token 之内，远低于上限。

    // —— 第一步：精简判分 ——
    setProgress("⑤ 第 1/2 步 调用大模型判分中（" + (speed ? "速度优先模式" : "深度思考模式") + "，请保持页面打开）…\n已生成 0 字");
    startLiveStream();
    const raw1 = await chatStream(ARK.model, [
      { role: "system", content: GRADE_SYSTEM },
      { role: "user", content: gradeUser({
        name: profile.name, grade: profile.grade, subject: profile.subject,
        exam_name: profile.exam_name, background: profile.background,
        exam_text: examText, answer_text: answerText, student_answers: studentText
      }) }
    ], t => {
      setProgress("⑤ 第 1/2 步 判分生成中… 已生成 " + t.length + " 字");
      appendLiveStream(t);
    }, 0.4, 12000, extra, true);  // jsonMode=true：豆包 response_format=json_object，强制只输出合法 JSON

    const extractRes = extractJSON(raw1);
    if (!extractRes.ok || !extractRes.data || !extractRes.data.score || !extractRes.data.kp_mastery) {
      const reason = extractRes.reason || "未知";
      const last = (raw1 || "").slice(-120).replace(/\s+/g, " ");
      throw new Error("第 1 步（判分）未返回可解析结果（" + reason + "，已生成 " + (raw1||"").length + " 字，末尾：…" + last + "）。建议：①缩短材料/减少题量；②「速度优先」关闭深度思考；③切到更大的 pro 模型。");
    }
    const data1 = extractRes.data;

    // —— 第二步：诊断与方案（自带读卷能力定位具体错题）——
    setProgress("⑥ 第 2/2 步 调用大模型生成诊断与方案（家长话术/补救处方）中…\n已生成 0 字");
    startLiveStream();
    const score_kp_json = JSON.stringify({
      score: data1.score,
      questions: data1.questions,  // 精简版只含错题，体积小
      kp_mastery: data1.kp_mastery,
      weak_signals: data1.weak_signals
    });
    const diagCtx = {
      name: profile.name, grade: profile.grade, subject: profile.subject,
      exam_name: profile.exam_name, background: profile.background,
      exam_text: examText, answer_text: answerText, student_answers: studentText,
      score_kp_json
    };
    const raw2 = await chatStream(ARK.model, [
      { role: "system", content: DIAG_SYSTEM },
      { role: "user", content: diagUser(diagCtx) }
    ], t => {
      setProgress("⑥ 第 2/2 步 诊断生成中… 已生成 " + t.length + " 字");
      appendLiveStream(t);
    }, 0.4, 16000, extra, true);  // jsonMode=true：同上，强制合法 JSON 输出；token 上限扩到 16k，降低截断概率

    const res2 = await completeJSONIfTruncated(raw2, diagCtx, extra);
    if (!res2.ok || !res2.data || !res2.data.diagnosis) {
      const reason = res2.reason || "未知";
      const last = (res2.raw || "").slice(-120).replace(/\s+/g, " ");
      throw new Error("第 2 步（诊断方案）未返回可解析结果（" + reason + "，已生成 " + (res2.raw||"").length + " 字，末尾：…" + last + "）。请重试。");
    }
    const data2 = res2.data;

    // 如果第二步 JSON 完整但漏掉/截断了 parent_message，用一次轻量补全兜底
    if (!data2.parent_message || !String(data2.parent_message).trim()) {
      try {
        setProgress("⑥ 家长话术缺失，正在单独补全…");
        const diagSummary = summarizeDiagnosisForParent(data2);
        const planSummary = (data2.remediation_plan || []).map(r => (r.target_kp || "") + ":" + ((r.goal || "").slice(0, 40))).join("；");
        const pmRaw = await chatStream(ARK.model, [
          { role: "system", content: PARENT_MESSAGE_SYSTEM },
          { role: "user", content: parentMessageUser({
            name: profile.name, grade: profile.grade, subject: profile.subject, exam_name: profile.exam_name,
            summary: diagSummary, planSummary
          }) }
        ], t => { setProgress("⑥ 家长话术补全中… 已生成 " + t.length + " 字"); appendLiveStream(t); }, 0.4, 1200, extra, false);
        const pmRes = extractJSON(pmRaw);
        if (pmRes.ok && pmRes.data && pmRes.data.parent_message) {
          data2.parent_message = pmRes.data.parent_message;
        }
      } catch (e) {
        // 补全失败不阻断，仍用原 data2 继续
      }
    }

    // 合并两步结果 → 完整报告（只取第二步的 4 个聚合字段，避免覆盖第一步的判分数据）
    const data = Object.assign({}, data1, {
      diagnosis: data2.diagnosis,
      remediation_plan: data2.remediation_plan,
      first_month_plan: data2.first_month_plan,
      parent_message: data2.parent_message
    });

    data.student_name = profile.name;
    data.grade = profile.grade;
    data.subject = profile.subject;
    data.exam_name = profile.exam_name;
    data.background = profile.background;

    // 师资介绍：仅当上传了老师资料，结合上传资料 + 模型知识(网络检索) + 孩子薄弱点
    let teacher = null;
    if (teacherRaw && teacherRaw.length > 5) {
      setProgress("⑦ 结合孩子薄弱点生成【师资匹配介绍】（上传资料 + 网络检索）中…");
      startLiveStream();
      teacher = await buildTeacherIntro(teacherRaw, data);
    }
    endLiveStream();

    CURRENT_REPORT = data;
    CURRENT_TEACHER = teacher;
    renderBoth(data, teacher);

    document.getElementById("setup").style.display = "none";
    document.getElementById("reportPage").style.display = "block";
    window.scrollTo(0, 0);
    setProgress("");
  } catch (e) {
    setProgress("❌ 出错：" + e.message);
  } finally {
    btn.disabled = false;
  }
}

// 同时渲染屏幕版（深色）和导出版（暖白）
function renderBoth(data, teacher) {
  document.getElementById("capture-area").innerHTML = renderReport(data, teacher, "screen");
  document.getElementById("export-area").innerHTML = renderReport(data, teacher, "export");
}

// ---------- 修正 / 补充 ----------
function openCorrect() {
  if (!CURRENT_REPORT) return alert("请先生成报告");
  document.getElementById("correctModal").style.display = "flex";
  document.getElementById("correctInput").value = "";
  document.getElementById("correctMsg").textContent = "";
  setTimeout(() => document.getElementById("correctInput").focus(), 50);
}
function closeCorrect() {
  document.getElementById("correctModal").style.display = "none";
}

async function submitCorrect() {
  const input = document.getElementById("correctInput").value.trim();
  const msg = document.getElementById("correctMsg");
  if (!input) { msg.textContent = "请输入要修正的内容"; return; }
  if (!CURRENT_REPORT) { msg.textContent = "暂无报告可修正"; return; }

  const btn = document.querySelector("#correctModal .gen");
  btn.disabled = true;
  msg.style.color = "#22d3ee";
  msg.textContent = "正在根据你的修正重新生成报告（1–3 分钟）…";

  try {
    // 把当前报告（作为参考文本）和修正意见一并提交
    const cur = JSON.stringify(CURRENT_REPORT, null, 0);
    const extra = {};
    if (ARK.speed && /seed/i.test(ARK.model)) extra.thinking = { type: "disabled" };
    const raw = await chatStream(ARK.model, [
      { role: "system", content: CORRECT_SYSTEM },
      { role: "user", content: correctUser({ corrections: input, current_report: cur }) }
    ], t => { msg.textContent = "正在根据你的修正重新生成报告… 已生成 " + t.length + " 字"; }, 0.4, 32000, extra);

    const extractRes2 = extractJSON(raw);
    if (!extractRes2.ok || !extractRes2.data || !(extractRes2.data.score || extractRes2.data.diagnosis))
      throw new Error("模型未返回可解析的修正结果（" + (extractRes2.reason || "未知") + "）");
    const data = extractRes2.data;

    // 保留身份信息（用户修正不应改这些字段，除非修正中明确要求）
    data.student_name = CURRENT_REPORT.student_name;
    data.grade = CURRENT_REPORT.grade;
    data.subject = CURRENT_REPORT.subject;
    data.exam_name = CURRENT_REPORT.exam_name;
    data.background = CURRENT_REPORT.background;

    CURRENT_REPORT = data;
    renderBoth(data, CURRENT_TEACHER);
    closeCorrect();
    setProgress("");

    // 矫正后字段自检：聚合字段缺失则提示用户（不阻塞）
    const _d = data.diagnosis || {};
    const _missing = [];
    if (!(data.parent_message || "").trim()) _missing.push("致家长的话");
    if (!(_d.strengths || []).length) _missing.push("优势标签");
    if (!(_d.weakness_summary || "").trim()) _missing.push("薄弱总评");
    if (_missing.length) {
      const note = document.createElement("div");
      note.style.cssText = "position:fixed;top:14px;right:14px;z-index:200;max-width:360px;"
        + "background:rgba(251,191,36,.95);color:#3a2c00;padding:12px 16px;border-radius:10px;"
        + "box-shadow:0 8px 24px rgba(0,0,0,.4);font-size:13px;line-height:1.6;";
      note.innerHTML = "<b>⚠️ 修正后仍有部分字段未生成：</b><br>"
        + esc(_missing.join("、"))
        + "<br><span style='font-size:12px;color:#5a4400;'>可能原因：1) 模型输出被截断（罕见，因已扩到 32k tokens）"
        + "<br>2) 修正意见触发模型结构性重写但未联动聚合字段<br>"
        + "可点击「✏️ 修正/补充」再补一句『请把标签/家长的话重算一遍』即可补齐。</span>";
      document.body.appendChild(note);
      setTimeout(() => { note.style.opacity = "0"; note.style.transition = "opacity .4s"; }, 8000);
      setTimeout(() => { try { note.remove(); } catch (e) {} }, 8500);
    }
    window.scrollTo(0, 0);
  } catch (e) {
    msg.style.color = "";
    msg.textContent = "❌ 修正失败：" + e.message;
  } finally {
    btn.disabled = false;
  }
}

// 提取老师资料文字（JSON / TXT 直接读，PDF / 图片转图后转录）
async function readTeacherMaterial(files) {
  const parts = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith(".json")) {
      try { parts.push("# 老师资料(JSON)：\n" + JSON.stringify(JSON.parse(await f.text()), null, 2)); continue; }
      catch (e) {}
    }
    if (f.type === "application/pdf") {
      try {
        const imgs = await pdfToImages(f);
        const t = await transcribeImages(imgs, "teacher");
        if (t) parts.push("# 老师资料(PDF)：" + f.name + "\n" + t);
        continue;
      } catch (e) {}
    }
    if (f.type.startsWith("image/")) {
      try {
        const t = await transcribeImages([await fileToBase64(f)], "teacher");
        if (t) parts.push("# 老师资料(图片)：" + f.name + "\n" + t);
        continue;
      } catch (e) {}
    }
    try { const t = await f.text(); if (t) parts.push("# 老师资料(文本)：" + f.name + "\n" + t); }
    catch (e) {}
  }
  return parts.join("\n\n").trim();
}

// 生成师资介绍：结合上传资料 + 模型知识(网络检索替代) + 孩子薄弱点
async function buildTeacherIntro(material, data) {
  const extra = {};
  if (ARK.speed && /seed/i.test(ARK.model)) extra.thinking = { type: "disabled" };
  try {
    const raw = await chatStream(ARK.model, [
      { role: "system", content: TEACHER_SYSTEM },
      { role: "user", content: teacherUser({ material, diag: summarizeDiagnosis(data) }) }
    ], t => {
      setProgress("⑥ 师资匹配介绍生成中… 已生成 " + t.length + " 字");
      appendLiveStream(t);
    }, 0.4, 2200, extra);
    const tr = extractJSON(raw);
    if (!tr.ok || !tr.data || !tr.data.teacher) throw new Error("未解析到师资介绍 JSON（" + (tr.reason || "未知") + "）");
    tr.data.enabled = true;
    return tr.data;
  } catch (e) {
    setProgress("⚠️ 师资智能匹配生成失败，已用上传资料作简版：" + e.message);
    return {
      enabled: true,
      title: "老师资料（简版）",
      teacher: {
        name: "（见上传资料）",
        title: "老师/机构",
        credentials: [
          "已收到您上传的老师资料，但本次未完成智能匹配介绍。",
          "原始资料摘录：" + (material.slice(0, 280).replace(/\s+/g, " ").trim() + "…")
        ],
        methods: [],
        match_weak: [],
        course: { desc: "请稍后重试一次以生成完整师资匹配介绍。", note: "" }
      }
    };
  }
}

// 把诊断 JSON 压缩成一段给师资匹配用的摘要
function summarizeDiagnosis(d) {
  const diag = d.diagnosis || {};
  let s = "";
  if (d.subject || d.exam_name) s += "学科/考试：" + (d.subject || "") + " " + (d.exam_name || "") + "\n";
  const sc = d.score || {};
  if (sc.total_score != null) {
    const rate = sc.total_full ? Math.round(sc.total_score / sc.total_full * 100) : 0;
    s += "总分：" + sc.total_score + "/" + sc.total_full + "（得分率 " + rate + "%）\n";
  }
  if (diag.overview) s += "总评：" + diag.overview + "\n";
  if (diag.weakness_summary) s += "薄弱点概括：" + diag.weakness_summary + "\n";
  const rct = diag.root_cause_tree || [];
  if (rct.length) {
    s += "根因树（前5）：\n";
    rct.slice(0, 5).forEach(r => {
      s += "· " + (r.board || "") + "/" + (r.type || "") + "：" + (r.action || "") + " → " + (r.root_cause || "") + "（" + (r.severity || "") + "）\n";
    });
  }
  const kp = (d.kp_mastery || []).filter(k => k.level === "薄弱" || k.level === "未触及");
  if (kp.length) s += "薄弱知识点：" + kp.map(k => k.kp).join("、") + "\n";
  return s;
}

// 把诊断方案压缩成一段给"补全家长话术"用的轻量摘要（控制 token）
function summarizeDiagnosisForParent(d) {
  const diag = d.diagnosis || {};
  let s = "";
  if (diag.overview) s += "总评：" + String(diag.overview).slice(0, 120) + "\n";
  if (diag.weakness_summary) s += "薄弱点：" + String(diag.weakness_summary).slice(0, 120) + "\n";
  const rct = (diag.root_cause_tree || []).slice(0, 3);
  if (rct.length) s += "主要根因：" + rct.map(r => (r.root_cause || "").slice(0, 40)).filter(Boolean).join("、") + "\n";
  const kp = (d.kp_mastery || []).filter(k => k.level === "薄弱" || k.level === "未触及").slice(0, 5);
  if (kp.length) s += "薄弱知识点：" + kp.map(k => k.kp).join("、") + "\n";
  return s.trim();
}

// 如果 JSON 被截断，用「续写」方式让模型接着输出（最多 2 次）
// 复用 DIAG_SYSTEM + diagUser(ctx)，关闭 json_object 让模型自由补全截断处
async function completeJSONIfTruncated(raw, ctx, extra) {
  if (!raw || raw.length < 2) return { ok: false, raw };
  let res = extractJSON(raw);
  if (res.ok && res.data && res.data.diagnosis) return { ok: true, data: res.data, raw };

  let current = raw;
  for (let i = 1; i <= 2; i++) {
    const tail = current.slice(-120);
    const isInStr = /(?<!\\)"[^"]*$/.test(tail) || /\\$/.test(tail);
    const prompt = isInStr
      ? `上面 JSON 在字符串中被截断，请先安全闭合当前字符串（补 \"），然后继续输出后续字段，不要重复已输出内容，仅输出截断处之后的文本。`
      : `上面 JSON 未闭合（被截断），请从当前截断处继续输出剩余部分，不要重复已输出内容，仅输出后续文本，最终整体必须是一个合法 JSON 对象。`;

    setProgress(`⑥ 检测到 JSON 截断，正在第 ${i} 次续写…`);
    const cont = await chatStream(ARK.model, [
      { role: "system", content: DIAG_SYSTEM },
      { role: "user", content: diagUser(ctx) },
      { role: "assistant", content: current },
      { role: "user", content: prompt }
    ], t => { setProgress("⑥ 续写中… 已生成 " + t.length + " 字"); appendLiveStream(t); }, 0.4, 12000, extra, false);

    current += cont;
    res = extractJSON(current);
    if (res.ok && res.data && res.data.diagnosis) return { ok: true, data: res.data, raw: current };
  }
  return { ok: false, data: null, raw: current, reason: res.reason || "续写后仍无法解析" };
}

function setProgress(t) {
  document.getElementById("progress").textContent = t;
}
