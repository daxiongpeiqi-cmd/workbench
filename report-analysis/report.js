// 规划报告解读 · 渲染层（v2）
// 屏幕版：浅色液态玻璃（对齐工作台 DESIGN.md）；导出版：金榜捷报风（墨绿+米白+金线+朱砂）
// 渲染两份：#capture-area（屏幕）/ #export-area（导出），类名以 ex- 前缀区分导出版

function renderReport(data, mode) {
  const isEx = mode === "export";
  const P = isEx ? "ex-" : "";
  const meta = data.meta || {};
  const prov = meta.prov;

  // 1) 画像解读
  let h = `<div class="${P}rp-block">
    <div class="${P}rp-h">① 画像解读</div>
    <div class="${P}rp-p">${esc(data.portrait || "")}</div>
  </div>`;

  // 2) 各科定位（表 + 每科点评 + 案例融入）
  if (data.subjects && data.subjects.length) {
    const rows = data.subjects.map(s => {
      const cases = (typeof matchCases === "function") ? matchCases(s.subject, s.score, prov) : [];
      let caseHtml = "";
      if (cases.length) {
        const items = cases.map(c => {
          const who = c.student ? esc(c.student) : "某同学";
          const gain = c.gain ? "（" + esc(c.gain) + "）" : "";
          const tag = (c.province && prov && c.province !== prov) ? " · " + esc(c.province) : "";
          return who + gain + tag;
        }).join("；");
        caseHtml = `<div class="${P}rp-case">📌 参考案例：${items}</div>`;
      }
      return `<tr>
        <td class="${P}rp-sub">${esc(s.subject)}</td>
        <td class="${P}rp-score">${s.score != null ? esc(s.score) : "—"}</td>
        <td>${esc(s.gap || "")}</td>
        <td>${esc(s.requirement || "")}</td>
      </tr>
      <tr class="${P}rp-comment-row"><td colspan="4">${esc(s.comment || "")}${caseHtml}</td></tr>`;
    }).join("");
    h += `<div class="${P}rp-block">
      <div class="${P}rp-h">② 各科定位</div>
      <table class="${P}rp-tbl">
        <thead><tr><th>科目</th><th>当前分</th><th>位次落差</th><th>能力要求变化</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // 3) 学年规划（分层：总览 + 阶段表 + 关键动作 + 高一适应期清单）
  const plan = data.plan;
  if (plan) {
    let planHtml = "";
    if (typeof plan === "string") {
      planHtml = `<div class="${P}rp-p">${esc(plan)}</div>`;
    } else {
      if (plan.overview) planHtml += `<div class="${P}rp-plan-overview">${esc(plan.overview)}</div>`;
      if (plan.stages && plan.stages.length) {
        const srows = plan.stages.map(st => `<tr>
          <td class="${P}rp-phase">${esc(st.phase || "")}</td>
          <td>${esc(st.anchor || "")}</td>
          <td>${esc(st.focus || "")}</td>
          <td>${esc(st.output || "")}</td>
        </tr>`).join("");
        planHtml += `<table class="${P}rp-tbl rp-plan-tbl">
          <thead><tr><th>阶段</th><th>时间锚点</th><th>重点任务</th><th>里程碑 / 产出</th></tr></thead>
          <tbody>${srows}</tbody>
        </table>`;
      }
      if (plan.actions && plan.actions.length) {
        planHtml += `<div class="${P}rp-sub">关键动作</div>
        <ul class="${P}rp-list">${plan.actions.map(a => `<li>${esc(a)}</li>`).join("")}</ul>`;
      }
    }
    h += `<div class="${P}rp-block">
      <div class="${P}rp-h">③ 学年规划</div>
      ${planHtml}`;
    if (data.adapt_checklist && data.adapt_checklist.length) {
      h += `<div class="${P}rp-check">
        <div class="${P}rp-sub">适应期观察清单</div>
        <ul>${data.adapt_checklist.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      </div>`;
    }
    h += `</div>`;
  }

  // 4) 老师建议（仅选了老师）
  if (data.teacher_advice && data.teacher_advice.length) {
    h += `<div class="${P}rp-block">
      <div class="${P}rp-h">④ 老师建议</div>
      <ul class="${P}rp-list">${data.teacher_advice.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
    </div>`;
  }

  // 选填：目标院校前瞻
  if (data.target_outlook && data.target_outlook.trim()) {
    h += `<div class="${P}rp-block">
      <div class="${P}rp-h">目标院校前瞻</div>
      <div class="${P}rp-p">${esc(data.target_outlook)}</div>
    </div>`;
  }

  // 5) 致家长的话
  h += `<div class="${P}rp-block ${P}rp-parent">
    <div class="${P}rp-h">${data.target_outlook ? "⑥" : "⑤"} 致家长的话</div>
    <div class="${P}rp-p">${esc(data.parent_words || "")}</div>
  </div>`;

  return h;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
