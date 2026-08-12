// 规划报告解读引擎（v2 开学季版）
// 内容：① 本地确定性工具（休息安排→时间资源模型、年级分支要点）② Prompt 模板 ③ JSON 解析容错
// 底座与试卷分析系统共用（豆包流式、续写兜底、停滞检测），本文件只承载「规划」专属逻辑。

// ============ 1) 本地确定性：休息安排 → 时间资源模型 ============
// 不交给 AI 猜，本地算好直接注入 prompt 作为硬约束（v2 第 4 节）
const REST_MODEL = {
  "走读":   { time: "平日晚 1.5–2h × 5 + 周末", parent: "每天",     granularity: "日计划",   battlefield: "平日晚间固定时段" },
  "周休":   { time: "周末 1–1.5 天",            parent: "每周",     granularity: "周计划",   battlefield: "周末整块时间" },
  "双周休": { time: "每两周 1–2 天",            parent: "两周一次", granularity: "双周循环", battlefield: "校内自习为主，休期复盘" },
  "月休":   { time: "每月 2–3 天",              parent: "每月",     granularity: "月度节点", battlefield: "自习课任务清单 + 月假集中攻坚" }
};
function buildRestraint(rest) {
  const m = REST_MODEL[rest];
  if (!m) return "";
  return `【休息安排 → 时间资源模型（本地计算，必须严格执行）】
该生休息安排为「${rest}」：
- 可支配时间：${m.time}
- 家长介入频率：${m.parent}
- 规划颗粒度：${m.granularity}
- 补弱主战场：${m.battlefield}
硬约束：每一条学习建议必须明确「谁执行 / 在哪执行 / 多久检查一次」，且必须与该生的休息安排匹配。
反例改写示范：
  月休 → 禁止"每天晚上刷 30 分钟题"，应写"校内自习课任务清单 + 月假两天的集中安排"；
  双周休 → 禁止"每周末陪孩子复盘一次"，应写"每两周休假日一次复盘，平日靠校内晚自习完成"；
  走读 → 禁止"假期集中突破"，应写"平日晚间固定 40 分钟，家长每晚确认完成情况"。`;
}

// ============ 2) 年级分支要点（注入 prompt，v2 第 5 节） ============
const GRADE_BRIEF = {
  "高一": `核心矛盾：初中经验失效 / 节奏突变 / 选科窗口开启。
分析三件事：① 下滑信号识别（讲位次落差 + 该科高中能力要求变化，不讲知识点断崖；语气"提前规避"而非"否定孩子"）；② 选科倾向初判（给 2–3 个组合方向 + 各自专业覆盖面；必须说明"现在不做定论，看两次大考再定"）；③ 学习习惯建设（时间管理/错题整理/预复习各一条，与休息安排匹配）。
时间锚点：9–10 适应期 → 11 期中首次分层 → 1 期末 → 3 选科预演 → 6 定档。
额外：在"学年规划"模块内附「适应期观察清单」（≤5 条，每条≤30 字，句式"看什么 → 出现什么信号就要动手"），高二高三不出现。`,
  "高二": `核心矛盾：新课量最重 / 两极分化定型 / 进度普遍被低估。
分析三件事：① 选科组合 × 目标专业匹配度（该组合能报专业面 + 赋分风险，不合适要敢说）；② 资源分配取舍（优势科拔高 or 弱科止损，给明确投入比例建议，不和稀泥）；③ 一轮倒计时提醒（明确"高二下学期末即进入一轮复习"，摆出真实时间压力）。
时间锚点：上学期新课最难段 → 学考/合格考 → 下学期最后补弱窗口 → 学期末转入一轮。`,
  "高三": `核心矛盾：时间稀缺 / 提分边际递减 / 心态与志愿并行。
分析三件事：① 用位次而非分数说话（结合本省分数线与一分一段，把分数换算成位次再谈目标）；② 提分优先级排序（哪科投入产出最高、哪科"只保不冲"，给取舍理由）；③ 志愿方向预埋（专业方向 + 城市 + 选科限制；附家长"该做/不该做"清单）。
时间锚点：9–11 一轮 → 12–次年3 二轮 → 4–5 模考 → 6 高考与志愿。`
};

// ============ 3) 系统 Prompt ============
const REPORT_SYSTEM = `你是一位严谨、专业、有温度的高中阶段学业规划师（服务于「有道领世」课程规划场景）。
你的产出是一份给家长看的《学业规划报告解读》，目标是把家长的注意力从"孩子哪里不行"转到"接下来这一年怎么走"。

【写作红线（贯穿全文）】
1. 先扬后抑：开头必须从具体成绩找到真实亮点真诚肯定，再过渡到问题。
2. 锚定分数，拒绝空话：一切结论挂靠具体数据，禁止"孩子很努力"这类虚话。
3. 降抵触、不制造焦虑：指出风险语气是"帮孩子提前规避"，不是"否定孩子"。
4. 禁止学校梯队拉踩：可在大层面客观呈现年级共性差异，禁止代入该生所在学校做比较。
5. 规划优先于诊断：本文的价值主张是"接下来怎么走"，不是"你有多少毛病"。

【分数门控】
- 若用户提供了各科成绩：可据此分析，结论必须锚定具体分数/位次。
- 若未提供成绩但上传了材料：严禁引用/假设/捏造任何分数，仅以材料内容为据。
- 若既无成绩也无材料：禁止编造，仅给年级通用规划建议。

【输出结构（5 模块，全文 1200–1800 字）】
1. 画像解读（≤200 字）：3–5 个精准标签；先扬后抑，必须锚定具体分数。
2. 各科定位（主体）：一张表（科目 / 当前分 / 位次落差 / 能力要求变化）+ 每科一句点评；有匹配案例自然融入。
3. 学年规划（主体）：按该年级时间锚点排节奏；高一在此附适应期观察清单。
4. 老师建议（≤300 字）：仅当用户选择了推荐讲师时输出 2–3 条针对性建议。
5. 致家长的话（≤250 字）：肯定具体成绩 → 说明该年级客观差异 → 自然引导系统化课程 / 名师点拨。

【选填模块：目标院校前瞻】仅当用户填写目标院校时出现，未填则全程不出现（信息行与分析指令双重判断）。

【合规红线】
- 允许出现：有道领世老师姓名、教龄/职称、教学主张；自有真实提分案例（匿名：姓+某+末字）。
- 禁止出现：除有道领世外的任何机构/平台/老师；手机号、微信号、班级群等联系方式；学员全名或"学校+姓名"可定位组合。
- 案例匹配：|案例起分 - 学生分数| ≤ 10，同省优先，其次外省，无匹配则不强行代入。

仅输出一个 JSON 对象（紧凑、无缩进、无 markdown 包裹）：
{"portrait":"画像解读文本(≤200字)","subjects":[{"subject":"科目","score":数字或null,"gap":"位次落差描述","requirement":"能力要求变化","comment":"一句点评"}],"plan":"学年规划文本(主体,含高一适应期观察清单)","adapt_checklist":["清单条1",...],"teacher_advice":["建议1","建议2","建议3"],"target_outlook":"目标院校前瞻(仅填目标时出现)","parent_words":"致家长的话(≤250字)"}`;

// ============ 4) 用户 Prompt 组装 ============
function reportUser(ctx) {
  let s = `【学生背景】
年级：${ctx.grade}｜省份：${ctx.prov}｜高考模式：${ctx.mode}｜休息安排：${ctx.rest}
选科组合：${ctx.comb || "（未填）"}${ctx.grade === "高一" ? "（高一可留空，做倾向初判）" : "（高二/高三必填）"}
目标院校：${ctx.target || "（未填，不出现『目标院校前瞻』模块）"}
推荐讲师：${ctx.teachers || "（未填，不出现『老师建议』模块）"}

【各科成绩】${ctx.scoresEntered ? "" : "（用户未填写成绩）"}
${ctx.scoreText || "（无）"}

【上传材料】${ctx.material ? "" : "（无）"}
${ctx.material || ""}

【年级分支要点】
${GRADE_BRIEF[ctx.grade] || ""}

【休息安排硬约束】
${buildRestraint(ctx.rest)}

【本地数据参考（省份高考大数据）】
${ctx.provHint || ""}

请按以上信息生成《学业规划报告解读》JSON，严格遵守写作红线、分数门控与输出结构（5 模块，全文 1200–1800 字）。`;

  // 分数门控二次强调（信息行 + 分析指令双重判断）
  if (!ctx.scoresEntered && !ctx.material) {
    s += `\n注意：本次既无成绩也无上传材料，禁止编造任何分数，仅给${ctx.grade}通用规划建议。`;
  } else if (!ctx.scoresEntered && ctx.material) {
    s += `\n注意：未提供成绩，严禁引用/假设/捏造任何分数，仅以【上传材料】内容为据。`;
  }
  if (ctx.extraInfo) {
    s += `\n\n【附加要求 / 特殊备注】\n${ctx.extraInfo}\n请严格参考以上附加要求调整语气、侧重和输出细节。`;
  }
  return s;
}

// ============ 5) JSON 解析容错（复用试卷分析底座，多级兜底） ============
function extractJSON(text) {
  if (!text || !text.trim()) return { ok: false, data: null, reason: "空响应" };
  try { return { ok: true, data: JSON.parse(text) }; } catch (e) {}
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{");
  if (s < 0) return { ok: false, data: null, reason: "未找到 JSON 起始 {" };
  const closePos = findMatchingBrace(t, s);
  if (closePos > s) {
    const slice = t.slice(s, closePos + 1);
    try { return { ok: true, data: JSON.parse(slice) }; } catch (e2) {}
    const repaired = tryRepairTruncatedJSON(slice);
    if (repaired) {
      try { return { ok: true, data: JSON.parse(repaired), reason: "已自动补全截断尾部" }; } catch (e3) {}
    }
  }
  const slice2 = t.slice(s);
  const repaired2 = tryRepairTruncatedJSON(slice2);
  if (repaired2) {
    try { return { ok: true, data: JSON.parse(repaired2), reason: "已自动补全截断尾部" }; } catch (e4) {}
    return { ok: false, data: null, reason: "JSON 不闭合（疑似被截断）" };
  }
  return { ok: false, data: null, reason: "JSON 格式异常" };
}
function findMatchingBrace(text, startPos) {
  let depth = 0, inStr = false, esc = false;
  for (let i = startPos; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = false; }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { depth++; continue; }
    if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function tryRepairTruncatedJSON(s) {
  if (!s) return null;
  let out = "", i = 0, n = s.length, inStr = false, esc = false;
  const stack = [];
  while (i < n) {
    const c = s[i];
    out += c;
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === "\\") { esc = true; }
      else if (c === "\"") { inStr = false; }
    } else {
      if (c === "\"") inStr = true;
      else if (c === "[") stack.push("]");
      else if (c === "{") stack.push("}");
      else if (c === "]" || c === "}") stack.pop();
    }
    i++;
  }
  if (inStr) out = out.replace(/\\$/, "") + "\"";
  while (stack.length) out += stack.pop();
  return out;
}

// ============ 6) 案例匹配（v2 第 7.3，沿用 cases.js 的 window.CASE_LIB） ============
// 返回与某科/某分数最贴近的 1–2 条匿名案例（|起分-分数|≤10，同省优先）
function matchCases(subject, score, province) {
  const lib = (typeof window !== "undefined" && window.CASE_LIB) || [];
  if (!lib.length || score == null) return [];
  const near = lib.filter(c =>
    (!c.subject || c.subject === subject) &&
    (c.from != null) && Math.abs(Number(c.from) - Number(score)) <= 10
  );
  near.sort((a, b) => {
    const da = Math.abs(Number(a.from) - Number(score));
    const db = Math.abs(Number(b.from) - Number(score));
    if (da !== db) return da - db;
    if (a.province === province && b.province !== province) return -1;
    if (b.province === province && a.province !== province) return 1;
    return 0;
  });
  return near.slice(0, 2);
}
