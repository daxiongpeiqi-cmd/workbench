// 逐题渲染辅助：精简错题列表（只列 wrong/partial/empty/need_review）
// 兼容新精简判分（q.kp 字符串 / q.brief）和旧版（q.knowledge_points / q.comment / q.student_summary / q.correct_answer）
// kind: "screen" | "export"
function renderQuestion(q, kind) {
  const st = q.status || "wrong";
  const isEx = kind === "export";
  const p = isEx ? "ex-" : "";

  // 知识点：兼容新旧格式
  const kpArr = q.knowledge_points && q.knowledge_points.length
    ? q.knowledge_points
    : (q.kp ? String(q.kp).split(/[、,，]/).map(s => s.trim()).filter(Boolean) : []);
  const kpList = kpArr.map(k => `<span class="${p}q-kp">${esc(k)}</span>`).join("");

  // 点评：兼容旧 comment / 新 brief
  const brief = q.comment || q.brief || "";
  const stu = q.student_summary || "";
  const ref = q.correct_answer || "";
  const isReview = q.need_review || st === "need_review";

  return `
    <div class="${p}q ${p}q-detail ${p}q-${st}">
      <div class="${p}q-head">
        <span class="${p}q-id">第 ${esc(q.qid)} 题 · ${esc(q.type || "题")} · ${esc(q.section || "")}</span>
        <span class="${p}q-badge ${st === 'wrong' || st === 'empty' ? p + 'qb-bad' : (st === 'partial' ? p + 'qb-mid' : p + 'qb-rev')}">${esc(q.score)}/${esc(q.full_score)}</span>
      </div>
      ${isReview ? `<div class="${p}q-review">⚠ 模型存疑，建议人工复核</div>` : ""}
      ${stu ? `<div class="${p}q-blk"><b>学生作答：</b>${esc(stu)}</div>` : ""}
      ${ref ? `<div class="${p}q-blk"><b>参考答案：</b>${esc(ref)}</div>` : ""}
      ${brief ? `<div class="${p}q-blk"><b>${st === 'partial' ? '问题与改进：' : (st === 'wrong' || st === 'empty' ? '失分诊断：' : (st === 'need_review' ? '复核要点：' : '失分诊断：'))}</b>${esc(brief)}</div>` : ""}
      ${kpList ? `<div class="${p}q-kps">${kpList}</div>` : ""}
    </div>`;
}

// 报告渲染：把模型返回的 JSON 渲染成 HTML 字符串
// mode="screen" → 屏幕深色主题（保留原视觉）
// mode="export" → 导出暖白主题（截图专用，含诊断标签总览卡）

function esc(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 把标签数组保留原文（最多 ~60 字防止极端值），避免硬截断丢失信息
// 用户截图反馈标签被截到 18 字后看不清，现在让 pill 自动换行放全文
function shortLabel(s, max = 60) {
  if (!s) return "";
  const t = String(s).trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// 清洗模型可能透出的来源标签（〔上传〕/〔公开〕/〔推断〕/（上传）…）
// prompt 已禁止，但渲染层兜底，保证页面永远不出现这种低级字样
function cleanSourceTag(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/〔(上传|公开|推断|网络|检索)〕/g, "")
    .replace(/[\[【\(（]\s*(上传|公开|推断|网络|检索)\s*[\]】\)）〕]/g, "")
    .replace(/[\(（]\s*(来源[：:][^\)）]+)\s*[\)）]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const STATUS_LABEL = {
  correct: "正确", partial: "部分得分", wrong: "错误",
  empty: "未作答", need_review: "建议复核"
};

// 导出顶部「诊断标签」总览：从现有 JSON 推导三类药丸
function buildTags(d) {
  const diag = (d && d.diagnosis) || {};
  const rct = diag.root_cause_tree || [];
  const rx = d && d.remediation_plan || [];

  // 优势：直接用 diagnosis.strengths
  const strong = (diag.strengths || [])
    .map(s => String(s).trim().replace(/\s+/g, " "))
    .filter(Boolean);

  // 问题：从根因树取前 5 条 root_cause（按严重度高→中→低）
  const sevRank = { "高": 3, "中": 2, "低": 1 };
  const sortedWeak = rct.slice().sort((a, b) =>
    (sevRank[b.severity] || 0) - (sevRank[a.severity] || 0)
  );
  const weak = sortedWeak.slice(0, 5).map(r =>
    String((r.root_cause || (r.board + "·" + (r.type || ""))).toString().trim().replace(/\s+/g, " ")).slice(0, 80)
  ).filter(Boolean);

  // 建议：从补救处方取 target_kp（去重取前 4）
  const seen = new Set();
  const suggest = [];
  for (const p of rx) {
    const k = p.target_kp;
    if (k && !seen.has(k)) {
      seen.add(k);
      suggest.push(String(k).trim().replace(/\s+/g, " "));
      if (suggest.length >= 4) break;
    }
  }

  return { strong, weak, suggest };
}

// 通用渲染：prefix = "ex-"（导出）或 ""（屏幕）
// 即便数据为空也保留卡片可见，明确标注"该类暂未生成"，便于用户发现问题
function renderTagsCard(tags, prefix = "ex-") {
  const p = prefix;
  const rows = [
    { cls: `${p}pill-strong`,  icon: "✓",  label: "优势", items: tags.strong },
    { cls: `${p}pill-weak`,    icon: "⚠", label: "短板", items: tags.weak },
    { cls: `${p}pill-suggest`, icon: "💡", label: "建议", items: tags.suggest }
  ];
  const total = tags.strong.length + tags.weak.length + tags.suggest.length;
  let h = `<div class="${p}tags-card"><h3 class="${p}tags-title">学情诊断标签 <span class="${p}tags-count">共 ${total} 条</span></h3>`;
  rows.forEach(r => {
    h += `<div class="${p}tags-row"><span class="${p}tags-row-label">${r.label}</span><div class="${p}tags-items">`;
    if (r.items.length) {
      r.items.forEach(t => {
        h += `<div class="pill ${r.cls}" title="${esc(t)}"><span class="ic">${r.icon}</span><span class="t">${esc(t)}</span></div>`;
      });
    } else {
      // 明确占位，让用户能看到"该项为空"
      h += `<span class="${p}tags-empty-slot">（本次未生成 ${r.label} 类标签）</span>`;
    }
    h += `</div></div>`;
  });
  h += `</div>`;
  return h;
}

// 主渲染函数：mode = "screen" | "export"
function renderReport(d, teacher, mode) {
  mode = mode || "screen";
  const isEx = mode === "export";
  const prefix = isEx ? "ex-" : "";
  d = d || {};
  const score = d.score || {};
  const totalScore = score.total_score || 0;
  const totalFull = score.total_full || 0;
  const rate = totalFull ? ((totalScore / totalFull) * 100).toFixed(1) : "0.0";
  const id = d.identity || {};
  const diag = d.diagnosis || {};
  const questions = d.questions || [];
  const kp = d.kp_mastery || [];
  const rct = diag.root_cause_tree || [];
  const rx = d.remediation_plan || [];
  const fmp = d.first_month_plan || [];

  let html = "";

  if (isEx) {
    // 暖白导出版 — 全部使用 .ex-* 类
    html += `<div class="ex-hdr"><h1>学情诊断报告</h1>`;
    html += `<div class="t">${esc(id.exam_name || d.exam_name || "开学摸底考")} · ${esc(id.subject || d.subject || "语文")}</div></div>`;

    html += `<div class="ex-idcard">`;
    html += `<div><b>姓名</b>${esc(id.student_name || d.student_name || "—")}</div>`;
    html += `<div><b>年级</b>${esc(id.grade || d.grade || "—")}</div>`;
    html += `<div><b>学科</b>${esc(id.subject || d.subject || "—")}</div>`;
    if (id.background || d.background) {
      html += `<div class="bg"><b>背景</b>${esc(id.background || d.background)}</div>`;
    }
    html += `</div>`;

    // ★ 诊断标签总览卡（导出专属，顶部醒目）
    html += renderTagsCard(buildTags(d), "ex-");

    // 一、总评
    html += `<div class="ex-sec">一、总体评价</div><div class="ex-card">`;
    html += `<div class="ex-scorebar"><span class="big">${totalScore}</span>`;
    html += `<span class="of">/ ${totalFull} 分</span>`;
    html += `<span class="of">（得分率 ${rate}%）</span></div>`;
    html += `<div class="ex-bbar"><i style="width:${rate}%"></i></div>`;
    (score.sections || []).forEach(s => {
      html += `<div class="ex-secrow"><span>${esc(s.name)}</span><span>${esc(s.score)} / ${esc(s.full)}</span></div>`;
    });
    html += `<div class="ex-overview">${esc(diag.overview || "—")}</div></div>`;

    // 二、逐题（只展示失分题 — 精简判分后正确题不再展开）
    html += `<div class="ex-sec">二、逐题批改与点评</div><div class="ex-card ex-qlist">`;
    const partN  = questions.filter(q => q.status === "partial").length;
    const badN   = questions.filter(q => ["wrong","empty"].includes(q.status)).length;
    const revN   = questions.filter(q => q.status === "need_review").length;
    html += `<div class="ex-qsummary">聚焦 ${questions.length} 道失分题：◐部分对 <b>${partN}</b> · ✕错误/未答 <b>${badN}</b> · ⚠存疑 <b>${revN}</b></div>`;
    questions.forEach(q => { html += renderQuestion(q, "export"); });
    html += `</div>`;

    // 三、知识点图谱
    if (kp.length) {
      html += `<div class="ex-sec">三、知识点掌握图谱</div><div class="ex-card">`;
      kp.forEach(k => {
        const lvl = k.level || "未触及";
        const cls = lvl === "掌握" ? "master" : (lvl === "薄弱" ? "weak" : "none");
        const denom = (k.hit || 0) + (k.wrong || 0);
        const w = denom ? Math.round((k.hit / denom) * 100) : 30;
        const col = lvl === "掌握" ? "ex-lv-master" : (lvl === "薄弱" ? "ex-lv-weak" : "ex-lv-none");
        html += `<div class="ex-kpr"><span class="n">${esc(k.kp)}</span>`;
        html += `<span class="bar"><i class="ex-bar-${cls}" style="width:${w}%"></i></span>`;
        html += `<span class="lv ${col}">${esc(lvl)} (${k.hit||0}/${k.wrong||0})</span></div>`;
      });
      html += `</div>`;
    }

    // 四、根因
    if (rct.length) {
      html += `<div class="ex-sec">四、短板根因分析</div><div class="ex-card"><table>`;
      html += `<tr><th>板块</th><th>题型</th><th>失分动作</th><th>根因</th><th>严重度</th></tr>`;
      rct.forEach(r => {
        const sv = r.severity || "中";
        const sc = sv === "高" ? "h" : (sv === "中" ? "m" : "l");
        html += `<tr><td>${esc(r.board)}</td><td>${esc(r.type)}</td><td>${esc(r.action)}</td>`;
        html += `<td>${esc(r.root_cause)}</td><td class="ex-sev-${sc}">${esc(sv)}</td></tr>`;
      });
      html += `</table></div>`;
    }

    // 五、处方
    if (rx.length) {
      html += `<div class="ex-sec">五、个性化补救处方</div><div class="ex-card">`;
      rx.forEach(p => {
        html += `<div class="ex-rx"><h4>▶ 针对：${esc(p.target_kp)}</h4>`;
        html += `<div class="g"><b>目标：</b>${esc(p.goal)}</div>`;
        html += `<div class="g"><b>每日动作：</b></div><ul>`;
        (p.actions || []).forEach(a => { html += `<li>${esc(a)}</li>`; });
        html += `</ul>`;
        html += `<div class="meta"><span>周期：${esc(p.cycle)}</span><span>检测：${esc(p.check)}</span></div>`;
        if (p.resources && p.resources.length) {
          html += `<div class="meta"><span>资源：${esc((p.resources||[]).join("、"))}</span></div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }

    // 六、首月计划
    if (fmp.length) {
      html += `<div class="ex-sec">六、入学前首月周计划</div><div class="ex-card">`;
      fmp.forEach(w => {
        html += `<div class="ex-rx"><h4>${esc(w.week)} · ${esc(w.focus)}</h4><ul>`;
        (w.tasks || []).forEach(t => { html += `<li>${esc(t)}</li>`; });
        html += `</ul></div>`;
      });
      html += `</div>`;
    }

    // 七、师资（可选，仅当上传了老师资料）
    if (teacher && teacher.enabled && teacher.teacher) {
      const t = teacher.teacher;
      html += `<div class="ex-sec">七、适配师资参考</div><div class="ex-tea">`;
      html += `<h3>${esc(t.name)}　<span style="font-size:13px;color:#7a6a52;font-weight:400;">${esc(t.title)}</span></h3>`;
      if (t.credentials && t.credentials.length) {
        html += `<div class="pos">资质背景：</div><ul>`;
        t.credentials.forEach(c => { html += `<li>${esc(cleanSourceTag(c))}</li>`; });
        html += `</ul>`;
      }
      if (t.methods && t.methods.length) {
        html += `<div class="pos">核心方法：</div><ul>`;
        t.methods.forEach(m => { html += `<li>${esc(cleanSourceTag(m))}</li>`; });
        html += `</ul>`;
      }
      if (t.match && t.match.length) {
        html += `<div class="pos">与本份诊断的匹配：</div>`;
        t.match.forEach(mc => { html += `<div class="match">· <b>${esc(cleanSourceTag(mc.problem))}</b> → ${esc(cleanSourceTag(mc.fix))}</div>`; });
      }
      if (t.match_weak && t.match_weak.length) {
        html += `<div class="pos">结合孩子薄弱点的针对性匹配：</div>`;
        t.match_weak.forEach((mw, i) => {
          html += `<div class="match-card">`;
          html += `<div class="match-weak-head"><span class="weak-badge">薄弱 ${i+1}</span><span class="weak-text">${esc(cleanSourceTag(mw.weak))}</span></div>`;
          html += `<div class="match-how-head"><span class="how-badge">针对对策</span></div>`;
          html += `<div class="match-how-text">${esc(cleanSourceTag(mw.how))}</div>`;
          html += `</div>`;
        });
      }
      if (t.course && t.course.desc) {
        html += `<div class="course"><b>课程参考：</b>${esc(t.course.desc)}<br><span style="color:#a89878;">${esc(t.course.note || "")}</span></div>`;
      }
      html += `</div>`;
    }

    // 八、致家长（无师资时顺位为七）
    html += `<div class="ex-sec">${teacher && teacher.enabled && teacher.teacher ? "八" : "七"}、致家长的话</div><div class="ex-card">`;
    const _pm = (d.parent_message || "").trim();
    if (_pm) {
      html += `<div class="ex-parent">${esc(_pm)}</div>`;
    } else {
      html += `<div class="ex-parent"><span class="ex-missing">（本次未生成家长话术，通常因诊断阶段被截断。点击右上角「✏️ 修正/补充」可重新生成，或检查上游模型是否返回完整。）</span></div>`;
    }
    html += `</div>`;

    return html;
  }

  // -------- 屏幕深色版（保留原有视觉，原样输出） --------
  html += `<div class="hdr"><h1>学情诊断报告</h1>`;
  html += `<div class="t">${esc(id.exam_name || d.exam_name || "开学摸底考")} · ${esc(id.subject || d.subject || "语文")}</div></div>`;

  // 身份卡
  html += `<div class="card"><div class="idcard">`;
  html += `<div><b>姓名</b> ${esc(id.student_name || d.student_name || "—")}</div>`;
  html += `<div><b>年级</b> ${esc(id.grade || d.grade || "—")}</div>`;
  html += `<div><b>学科</b> ${esc(id.subject || d.subject || "—")}</div>`;
  if (id.background || d.background) {
    html += `<div class="bg"><b>背景</b> ${esc(id.background || d.background)}</div>`;
  }
  html += `</div></div>`;

  // ★ 诊断标签总览卡（屏幕深色配色版，紧跟身份卡，与导出版一致）
  html += renderTagsCard(buildTags(d), "");

  // 一、总评
  html += `<div class="sec-t">一、总体评价</div><div class="card">`;
  html += `<div class="scorebar"><span class="big">${totalScore}</span>`;
  html += `<span class="of">/ ${totalFull} 分</span>`;
  html += `<span class="of">（得分率 ${rate}%）</span></div>`;
  html += `<div class="bbar"><i style="width:${rate}%"></i></div>`;
  (score.sections || []).forEach(s => {
    html += `<div class="secrow"><span>${esc(s.name)}</span><span>${esc(s.score)} / ${esc(s.full)}</span></div>`;
  });
  html += `<div class="overview" style="margin-top:10px;">${esc(diag.overview || "—")}</div></div>`;

  // 二、逐题（只展示失分题 — 精简判分后正确题不再展开）
  html += `<div class="sec-t">二、逐题批改与点评</div><div class="card">`;
  const _part  = questions.filter(q => q.status === "partial").length;
  const _bad   = questions.filter(q => ["wrong","empty"].includes(q.status)).length;
  const _rev   = questions.filter(q => q.status === "need_review").length;
  html += `<div class="qsummary">聚焦 ${questions.length} 道失分题：◐部分对 <b>${_part}</b> · ✕错误/未答 <b>${_bad}</b> · ⚠存疑 <b>${_rev}</b></div>`;
  questions.forEach(q => { html += renderQuestion(q, "screen"); });
  html += `</div>`;

  // 三、知识点图谱
  if (kp.length) {
    html += `<div class="sec-t">三、知识点掌握图谱</div><div class="card">`;
    kp.forEach(k => {
      const lvl = k.level || "未触及";
      const cls = lvl === "掌握" ? "master" : (lvl === "薄弱" ? "weak" : "none");
      const denom = (k.hit || 0) + (k.wrong || 0);
      const w = denom ? Math.round((k.hit / denom) * 100) : 30;
      const col = lvl === "掌握" ? "#2e8b57" : (lvl === "薄弱" ? "#c0392b" : "#888");
      html += `<div class="kpr"><span class="n">${esc(k.kp)}</span>`;
      html += `<span class="bar"><i class="lv-${cls}" style="width:${w}%"></i></span>`;
      html += `<span class="lv" style="color:${col}">${esc(lvl)} (${k.hit||0}/${k.wrong||0})</span></div>`;
    });
    html += `</div>`;
  }

  // 四、根因
  if (rct.length) {
    html += `<div class="sec-t">四、短板根因分析</div><div class="card"><table>`;
    html += `<tr><th>板块</th><th>题型</th><th>失分动作</th><th>根因</th><th>严重度</th></tr>`;
    rct.forEach(r => {
      const sv = r.severity || "中";
      const sc = sv === "高" ? "h" : (sv === "中" ? "m" : "l");
      html += `<tr><td>${esc(r.board)}</td><td>${esc(r.type)}</td><td>${esc(r.action)}</td>`;
      html += `<td>${esc(r.root_cause)}</td><td class="sev-${sc}">${esc(sv)}</td></tr>`;
    });
    html += `</table></div>`;
  }

  // 五、处方
  if (rx.length) {
    html += `<div class="sec-t">五、个性化补救处方</div><div class="card">`;
    rx.forEach(p => {
      html += `<div class="rx"><h4>▶ 针对：${esc(p.target_kp)}</h4>`;
      html += `<div class="g"><b>目标：</b>${esc(p.goal)}</div>`;
      html += `<div class="g"><b>每日动作：</b></div><ul>`;
      (p.actions || []).forEach(a => { html += `<li>${esc(a)}</li>`; });
      html += `</ul>`;
      html += `<div class="meta"><span>周期：${esc(p.cycle)}</span><span>检测：${esc(p.check)}</span></div>`;
      if (p.resources && p.resources.length) {
        html += `<div class="meta"><span>资源：${esc((p.resources||[]).join("、"))}</span></div>`;
      }
      html += `</div>`;
    });
    html += `</div>`;
  }

  // 六、首月计划
  if (fmp.length) {
    html += `<div class="sec-t">六、入学前首月周计划</div><div class="card">`;
    fmp.forEach(w => {
      html += `<div class="rx"><h4>${esc(w.week)} · ${esc(w.focus)}</h4><ul>`;
      (w.tasks || []).forEach(t => { html += `<li>${esc(t)}</li>`; });
      html += `</ul></div>`;
    });
    html += `</div>`;
  }

  // 七、师资（可选，仅当上传了老师资料）
  if (teacher && teacher.enabled && teacher.teacher) {
    const t = teacher.teacher;
    html += `<div class="sec-t">七、适配师资参考</div><div class="tea">`;
    html += `<h3>${esc(t.name)}　<span style="font-size:13px;color:#777;">${esc(t.title)}</span></h3>`;
    if (t.credentials && t.credentials.length) {
      html += `<div class="pos">资质背景：</div><ul>`;
      t.credentials.forEach(c => { html += `<li>${esc(cleanSourceTag(c))}</li>`; });
      html += `</ul>`;
    }
    if (t.methods && t.methods.length) {
      html += `<div class="pos">核心方法：</div><ul>`;
      t.methods.forEach(m => { html += `<li>${esc(cleanSourceTag(m))}</li>`; });
      html += `</ul>`;
    }
    if (t.match && t.match.length) {
      html += `<div class="pos">与本份诊断的匹配：</div>`;
      t.match.forEach(mc => { html += `<div class="match">· <b>${esc(cleanSourceTag(mc.problem))}</b> → ${esc(cleanSourceTag(mc.fix))}</div>`; });
    }
    if (t.match_weak && t.match_weak.length) {
      html += `<div class="pos">结合孩子薄弱点的针对性匹配：</div>`;
      t.match_weak.forEach((mw, i) => {
        html += `<div class="match-card">`;
        html += `<div class="match-weak-head"><span class="weak-badge">薄弱 ${i+1}</span><span class="weak-text">${esc(cleanSourceTag(mw.weak))}</span></div>`;
        html += `<div class="match-how-head"><span class="how-badge">针对对策</span></div>`;
        html += `<div class="match-how-text">${esc(cleanSourceTag(mw.how))}</div>`;
        html += `</div>`;
      });
    }
    if (t.course && t.course.desc) {
      html += `<div class="course"><b>课程参考：</b>${esc(t.course.desc)}<br><span style="color:#999;">${esc(t.course.note || "")}</span></div>`;
    }
    html += `</div>`;
  }

  // 八、致家长（无师资时顺位为七）
  html += `<div class="sec-t">${teacher && teacher.enabled && teacher.teacher ? "八" : "七"}、致家长的话</div><div class="card">`;
  const _pmScr = (d.parent_message || "").trim();
  if (_pmScr) {
    html += `<div class="parent">${esc(_pmScr)}</div>`;
  } else {
    html += `<div class="parent"><span style="color:#a89878;font-style:italic;">（本次未生成家长话术，通常因诊断阶段被截断。点击右上角「✏️ 修正/补充」可重新生成，或检查上游模型是否返回完整。）</span></div>`;
  }
  html += `</div>`;

  return html;
}

// 保存为图片：截取 #export-area（暖白主题）
function saveImg() {
  const el = document.getElementById("export-area");
  if (!el || !el.innerHTML.trim()) {
    alert("暂无报告可导出，请先生成诊断报告");
    return;
  }
  // 用元素真实宽高，避免被截断
  const w = Math.max(el.scrollWidth, 1100);
  const h = el.scrollHeight;
  html2canvas(el, {
    scale: 2,
    backgroundColor: "#faf6ee",
    width: w,
    height: h,
    windowWidth: w,
    windowHeight: h
  }).then(c => {
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = "学情诊断报告.png";
    a.click();
  }).catch(e => {
    alert("导出失败：" + e.message);
  });
}

function backToSetup() {
  document.getElementById("reportPage").style.display = "none";
  document.getElementById("setup").style.display = "block";
  window.scrollTo(0, 0);
}