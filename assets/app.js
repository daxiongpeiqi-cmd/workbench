/* ============================================================
   个人工作台 · 交互逻辑 app.js (v2)
   - 三栏可拖拽分割 + 持久化宽度
   - 主页默认视图 + 六个模块入口
   - iframe 内置工具自动隐藏右面板 / CPA 缩放
   - 分割线收起按钮 + 小圆主题按钮弹出面板
   - 5 套主题 + 设置 + SOP + 备忘录提醒
   ============================================================ */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const LS = localStorage;

  const DEFAULT_LEFT = 92;
  const DEFAULT_RIGHT = 158;
  const MIN_LEFT = 72, MAX_LEFT = 180;
  const MIN_RIGHT = 130, MAX_RIGHT = 300;

  function dayKey(d = new Date()) {
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }
  function weekStart(d) {
    const x = new Date(d);
    const day = (x.getDay() + 6) % 7;
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - day);
    return x;
  }
  function fmtTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------- 设置读写 ---------------- */
  const DEFAULT_SETTINGS = { apiKey: '', model: 'doubao-pro', feishu: '', weeklyClear: true, sideScale: 1 };
  function getSettings() {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(LS.getItem('wb_settings') || '{}')); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function setSettings(s) { LS.setItem('wb_settings', JSON.stringify(s)); }

  /* ---------------- IndexedDB（图片 Blob） ---------------- */
  const DB_NAME = 'workbench', STORE = 'images';
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(key, blob) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }
  async function idbClear() {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
    });
  }
  async function idbCount() {
    const db = await openDB();
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).count();
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(0);
    });
  }
  function idbDel(key) { openDB().then((db) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); }); }

  /* ---------------- 弹窗辅助 ---------------- */
  function showMask(id) { $(id).classList.add('show'); }
  function hideMask(id) { $(id).classList.remove('show'); }

  /* ---------------- 提醒弹窗 ---------------- */
  let currentReminder = null;
  function showReminder(opts) {
    currentReminder = opts;
    $('#reminderTitle').textContent = opts.title || '提醒';
    const body = $('#reminderBody');
    body.textContent = opts.text || '';
    const old = body.querySelector('img'); if (old) old.remove();
    if (opts.imgId) {
      idbGet(opts.imgId).then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const img = document.createElement('img');
          img.src = url; img.onload = () => URL.revokeObjectURL(url);
          body.appendChild(img);
        }
      }).catch(() => {});
    }
    showMask('#reminderMask');
    const s = getSettings();
    if (s.feishu) {
      try {
        fetch(s.feishu, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ msg_type: 'text', content: { text: `[${opts.title}] ${opts.text}` } })
        }).catch(() => {});
      } catch (e) {}
    }
    // 路线A：浏览器桌面通知（需用户已在设置中授权）
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(opts.title || '提醒', { body: opts.text || '', tag: 'wb-reminder' });
        n.onclick = () => { try { window.focus(); } catch (e) {} n.close(); };
      }
    } catch (e) {}
  }
  $('#reminderDone').addEventListener('click', () => {
    if (currentReminder && currentReminder.memoId) markMemoDone(currentReminder.memoId);
    hideMask('#reminderMask');
  });
  $('#reminderLater').addEventListener('click', () => {
    if (currentReminder && currentReminder.memoId) {
      LS.setItem('memoSnooze_' + currentReminder.memoId, String(Date.now() + 5 * 60000));
    }
    hideMask('#reminderMask');
  });

  /* ---------------- 主题 ---------------- */
  const THEMES = ['green', 'dark', 'morandi', 'pink', 'blue'];
  function applyTheme(t) {
    if (!THEMES.includes(t)) t = 'green';
    document.documentElement.setAttribute('data-theme', t);
    LS.setItem('wb_theme', t);
    $$('.tp-option').forEach((d) => d.classList.toggle('active', d.dataset.theme === t));
    const f = $('#toolFrame');
    if (f && f.contentWindow) { try { f.contentWindow.postMessage({ type: 'theme', theme: t }, '*'); } catch (e) {} }
  }
  $('#themeBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#themePopover').classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (!$('#themePopover').contains(e.target) && e.target !== $('#themeBtn')) $('#themePopover').classList.remove('show');
  });
  $$('.tp-option').forEach((d) => d.addEventListener('click', () => { applyTheme(d.dataset.theme); $('#themePopover').classList.remove('show'); }));

  /* ---------------- 三栏宽度 / 拖拽 / 收起 ---------------- */
  function setSidebarWidth(w) {
    w = Math.max(MIN_LEFT, Math.min(MAX_LEFT, w));
    document.documentElement.style.setProperty('--sidebar-width', w + 'px');
    LS.setItem('wb_sidebar_width', String(w));
  }
  function setRightWidth(w) {
    w = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, w));
    document.documentElement.style.setProperty('--right-width', w + 'px');
    LS.setItem('wb_right_width', String(w));
  }
  function loadWidths() {
    const lw = Number(LS.getItem('wb_sidebar_width') || DEFAULT_LEFT);
    const rw = Number(LS.getItem('wb_right_width') || DEFAULT_RIGHT);
    setSidebarWidth(lw); setRightWidth(rw);
  }

  function setupResize(handle, side) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('divider-btn')) return;
      e.preventDefault();
      handle.classList.add('dragging');
      const startX = e.clientX;
      const sidebar = $('#sidebar');
      const right = $('#rightpanel');
      const startW = side === 'left' ? sidebar.getBoundingClientRect().width : right.getBoundingClientRect().width;
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (side === 'left') setSidebarWidth(startW + dx);
        else setRightWidth(startW - dx);
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
  setupResize($('#dividerLeft'), 'left');
  setupResize($('#dividerRight'), 'right');

  function updateDividerArrows() {
    $('#collapseLeft').textContent = $('#sidebar').classList.contains('collapsed') ? '›' : '‹';
    $('#collapseRight').textContent = $('#rightpanel').classList.contains('collapsed') ? '‹' : '›';
  }
  $('#collapseLeft').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#sidebar').classList.toggle('collapsed');
    updateDividerArrows();
  });
  $('#collapseRight').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#rightpanel').classList.toggle('collapsed');
    updateDividerArrows();
  });

  /* ---------------- 导航 / 模块切换 ---------------- */
  const IFRAME_MODULES = {
    report: { src: 'report-analysis/index.html', ext: false },
    exam:   { src: 'exam-analysis/index.html', ext: true },
    // CPA 学校数据：直链独立仓库 cpa-school-system（单一数据源，用户在独立仓库更新即自动同步，无需再手动拷贝）
    cpa:    { src: 'https://daxiongpeiqi-cmd.github.io/cpa-school-system/', ext: true }
  };
  let currentModule = 'home';

  function autoRightPanel() {
    // iframe 工具自动收起右面板；其余模块展开
    const isTool = !!IFRAME_MODULES[currentModule];
    $('#rightpanel').classList.toggle('collapsed', isTool);
    updateDividerArrows();
  }

  function switchModule(mod) {
    currentModule = mod;
    $('#search').value = '';
    $$('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.module === mod));
    const frame = $('#toolFrame');
    const content = $('#centerContent');
    const center = $('#center');
    const ext = $('#openExt');
    const tool = IFRAME_MODULES[mod];
    center.classList.toggle('cpa-mode', mod === 'cpa');
    if (tool) {
      if (frame.getAttribute('src') !== tool.src) frame.setAttribute('src', tool.src);
      frame.style.display = 'block';
      content.style.display = 'none';
      ext.style.display = 'block';
      ext.onclick = () => window.open(tool.src, '_blank', 'noopener');
    } else {
      frame.style.display = 'none';
      content.style.display = 'block';
      ext.style.display = 'none';
      if (mod === 'links' || mod === 'materials') renderLinks(mod);
      else if (mod === 'sop') renderSopCenter();
      else if (mod === 'home') renderHome();
    }
    autoRightPanel();
  }
  $$('.nav-item').forEach((n) => n.addEventListener('click', () => switchModule(n.dataset.module)));
  $('#brandHome').addEventListener('click', () => switchModule('home'));

  /* ---------------- 主页 ---------------- */
  function renderHome() {
    const content = $('#centerContent');
    content.innerHTML = `
      <div class="home-wrap">
        <div class="home-title">工作台</div>
        <div class="home-sub">快捷入口 · 点击卡片进入对应模块</div>
        <div class="home-grid">
          <div class="home-card" data-go="links"><span class="hc-emoji">🔗</span><span class="hc-title">工作系统 / 链接</span><span class="hc-desc">日常教学、CRM、排课、政策查询等内网系统快速跳转。</span></div>
          <div class="home-card" data-go="materials"><span class="hc-emoji">🎒</span><span class="hc-title">销售素材库</span><span class="hc-desc">话术库、案例长图、家长沟通模板、转化弹药包。</span></div>
          <div class="home-card" data-go="report"><span class="hc-emoji">📋</span><span class="hc-title">规划报告解读</span><span class="hc-desc">基于系统导出的原始报告做 AI 再分析，生成学业诊断与规划。</span></div>
          <div class="home-card" data-go="exam"><span class="hc-emoji">📝</span><span class="hc-title">试卷分析</span><span class="hc-desc">上传试卷、答案解析、学生答题，生成学情诊断报告。</span></div>
          <div class="home-card" data-go="cpa"><span class="hc-emoji">🏫</span><span class="hc-title">CPA 学校数据</span><span class="hc-desc">按省 / 市 / 县检索学校数据，支持本科率、分班等信息查询。</span></div>
          <div class="home-card" data-go="sop"><span class="hc-emoji">⏰</span><span class="hc-title">SOP 与备忘录</span><span class="hc-desc">每周重复的 SOP 时间节点、临时备忘录与页面弹窗提醒。</span></div>
        </div>
      </div>`;
    $$('.home-card', content).forEach((c) => c.addEventListener('click', () => switchModule(c.dataset.go)));
  }

  /* ---------------- 链接 / 素材渲染 ---------------- */
  const FALLBACK_LINKS = {
    systems: [
      { title: '哥伦布系统', desc: '咨询 / 客户工作系统', emoji: '🧭', url: 'https://keosms.youdao.com/modeselect?returnurl=https://consultan-center-prod.inner.youdao.com/?biz=1' },
      { title: '北京基地看板', desc: '北京基地数据看板', emoji: '📈', url: 'https://shimo.youdao.com/sheets/3aP4gd2llX2KTEbE/MODOC' }
    ],
    materials: [
      { title: '话术库', desc: '低转正沟通话术', emoji: '💬', url: 'https://www.youdao.com/' },
      { title: '案例长图', desc: '成功学员案例', emoji: '🖼️', url: 'https://www.youdao.com/' },
      { title: '家长沟通模板', desc: '各场景沟通范本', emoji: '✉️', url: 'https://www.youdao.com/' },
      { title: '转化弹药包', desc: '促销/活动素材', emoji: '🎯', url: 'https://www.youdao.com/' }
    ]
  };
  let BASE_LINKS = FALLBACK_LINKS;
  function getCustomLinks() {
    try { return JSON.parse(LS.getItem('wb_custom_links') || 'null') || { systems: [], materials: [] }; } catch (e) { return { systems: [], materials: [] }; }
  }
  function setCustomLinks(o) { LS.setItem('wb_custom_links', JSON.stringify(o)); }
  let CUSTOM_LINKS = getCustomLinks();
  function mergeLinks() {
    return {
      systems: [...(BASE_LINKS.systems || []), ...(CUSTOM_LINKS.systems || [])],
      materials: [...(BASE_LINKS.materials || []), ...(CUSTOM_LINKS.materials || [])]
    };
  }
  let LINKS = mergeLinks();
  let currentLinkAddModule = 'links';
  fetch('links.json').then((r) => r.json()).then((j) => { BASE_LINKS = j; LINKS = mergeLinks(); if (currentModule === 'links' || currentModule === 'materials') renderLinks(currentModule); }).catch(() => {});

  function renderLinks(mod) {
    const key = mod === 'links' ? 'systems' : mod;
    const baseList = (BASE_LINKS[key] || []);
    const customList = (CUSTOM_LINKS[key] || []);
    const q = ($('#search').value || '').trim().toLowerCase();
    const content = $('#centerContent');
    const filteredBase = q ? baseList.filter((x) => (x.title + (x.desc || '')).toLowerCase().includes(q)) : baseList;
    const filteredCustom = q ? customList.filter((x) => (x.title + (x.desc || '')).toLowerCase().includes(q)) : customList;
    const titleMap = { links: '工作系统 / 链接', materials: '销售素材库' };
    let html = `<div style="padding:18px 20px;"><div style="font-size:18px;font-weight:700;margin-bottom:4px;">${titleMap[mod]}</div><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">点击卡片在新窗口打开（内网系统仅支持跳转）</div></div>`;
    html += '<div class="link-grid">';
    if (filteredBase.length + filteredCustom.length === 0) html += '<div style="color:var(--muted);padding:20px;">无匹配项</div>';
    filteredBase.forEach((x) => {
      html += `<a class="link-card" href="${x.url}" target="_blank" rel="noopener"><span class="lc-emoji">${x.emoji || '🔗'}</span><span class="lc-title">${x.title}</span><span class="lc-desc">${x.desc || ''}</span></a>`;
    });
    filteredCustom.forEach((x, i) => {
      html += `<a class="link-card" href="${x.url}" target="_blank" rel="noopener"><button class="link-del" data-idx="${i}" title="删除">×</button><span class="lc-emoji">${x.emoji || '🔗'}</span><span class="lc-title">${x.title}</span><span class="lc-desc">${x.desc || ''}</span></a>`;
    });
    html += `<a class="link-card link-add" data-add="${mod}" title="添加自定义链接"><span class="lc-emoji">+</span><span class="lc-title">添加链接</span><span class="lc-desc">名称和网址自定义</span></a>`;
    html += '</div>';
    content.innerHTML = html;

    $$('.link-del', content).forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const idx = Number(e.target.dataset.idx);
      if (Number.isNaN(idx)) return;
      CUSTOM_LINKS[key].splice(idx, 1);
      setCustomLinks(CUSTOM_LINKS);
      LINKS = mergeLinks();
      renderLinks(mod);
    }));
    $$('.link-add', content).forEach((c) => c.addEventListener('click', (e) => {
      e.preventDefault();
      currentLinkAddModule = mod;
      $('#linkAddTitle').value = '';
      $('#linkAddUrl').value = '';
      $('#linkAddDesc').value = '';
      showMask('#linkAddMask');
    }));
  }

  /* ---------------- SOP ---------------- */
  const WD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 0 };
  function pad(n) { return String(n).padStart(2, '0'); }
  // 提取时间：支持 HH:MM / H:MM / H点M分 / H点 / 上午9点 / 9-10点 / 14:00-15:00
  function findTime(s) {
    let m = s.match(/(\d{1,2}):(\d{2})\s*[-~到至]\s*(\d{1,2}):(\d{2})/);
    if (m) return { h: +m[1], mi: +m[2], raw: m[0] };
    m = s.match(/(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*点/);
    if (m) return { h: +m[1], mi: 0, raw: m[0] };
    m = s.match(/(上午|下午|早上|早晨|中午|傍晚|晚上|凌晨)?\s*(\d{1,2})\s*点\s*(\d{1,2})?\s*分?/);
    if (m && m[2]) {
      let h = +m[2]; const mi = m[3] ? +m[3] : 0; const ap = m[1];
      if (ap === '下午' || ap === '傍晚' || ap === '晚上') { if (h < 12) h += 12; }
      else if (ap === '中午') h = 12;
      return { h, mi, raw: m[0] };
    }
    m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return { h: +m[1], mi: +m[2], raw: m[0] };
    return null;
  }
  function findWeekday(s) {
    let m = s.match(/周([一二三四五六日天])/) || s.match(/星期([一二三四五六日天])/);
    if (m) return WD[m[1]];
    m = s.match(/星期([1-7])/) || s.match(/周([1-7])/);
    if (m) return WD[m[1]];
    return null; // 每天/每日/无星期 -> 每日
  }
  const WD_STRIP = /(周[一二三四五六日天]|星期[一二三四五六日天1-7]|每天|每日|全周|工作日|周一到周日|周一至周日|周一~周日)/g;
  const AMPM_STRIP = /(上午|下午|早上|早晨|中午|傍晚|晚上|凌晨)/g;
  // PDF worker 配置（避免主线程 fake worker 警告/失败）
  if (window.pdfjsLib) {
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"; } catch (e) {}
  }
  // SOP 文件 → 文本：PDF 走 pdf.js 抽取文本，其余按文本读取
  async function extractSopText(file) {
    const name = (file.name || '').toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
      if (!window.pdfjsLib) { alert('PDF 解析库未加载，请刷新页面或检查网络后重试'); return null; }
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let txt = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const c = await page.getTextContent();
          if (c && c.items) txt += c.items.map(it => it.str || '').join(' ') + '\n\n';
        }
        const t = txt.trim();
        if (t.length < 20) {
          alert('该 PDF 文本提取过少（可能为扫描件/图片型 PDF）。请转成可复制文字的 PDF，或导出为 .txt/.md 后上传。');
          return null;
        }
        return t;
      } catch (err) {
        alert('PDF 解析失败：' + (err && err.message ? err.message : err) + '；请确认文件未损坏，或改用 .txt/.md 上传。');
        return null;
      }
    }
    // 文本类（.md / .txt / .json）
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => res(null);
      r.readAsText(file);
    });
  }
  function parseSop(text) {
    const items = [];
    const lines = text.split(/\r?\n/);
    let cur = null;
    let curWeekday = null; // 星期上下文：纯「周三」类标题行只更新上下文，供后续时间条目归属当天
    const commit = () => {
      if (cur && (cur.time || cur.text)) {
        if (!cur.text) cur.text = 'SOP 事项';
        items.push(cur);
      }
      cur = null;
    };
    for (const raw of lines) {
      const isList = /^\s*[-*•]\s+/.test(raw) || /^\s*\d+[.)]\s+/.test(raw) || /^\s*#+\s+/.test(raw);
      const clean = raw.replace(/^\s*#+\s*/, '').replace(/^\s*[-*•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim();
      if (!clean) continue; // 空行：保持当前条目打开
      const t = findTime(clean);
      const wd = findWeekday(clean);
      // 纯星期标题行（无时间）→ 仅更新星期上下文，供后续带时间的条目归属到当天
      if (!t && wd != null) { curWeekday = wd; continue; }
      if (t) {
        commit();
        const txt = clean
          .replace(t.raw, '')
          .replace(AMPM_STRIP, '')
          .replace(WD_STRIP, '')
          .replace(/^[\s、,，.。:：\-*•]+/, '')
          .replace(/\s+/g, ' ').trim();
        cur = { weekday: (wd != null ? wd : curWeekday), time: pad(t.h) + ':' + pad(t.mi), text: txt };
      } else if (cur && (isList || /^\s+/.test(raw))) {
        // 续行（子项 / 缩进说明）并入当前条目
        if (clean) cur.text = (cur.text ? cur.text + '；' : '') + clean.replace(AMPM_STRIP, '').replace(WD_STRIP, '').replace(/\s+/g, ' ').trim();
      }
      // 其余独立行（非星期标题的纯标题）忽略，避免误建节点
    }
    commit();
    return items;
  }
  // 轻量 markdown -> HTML（标题/列表/表格/引用/粗斜体/行内代码/链接）
  function renderMarkdown(md) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = (s) => {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
      s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
      s = s.replace(/_([^_]+)_/g, '<em>$1</em>');
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return s;
    };
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    let html = '', i = 0, listType = null;
    const closeList = () => { if (listType) { html += '</' + listType + '>'; listType = null; } };
    while (i < lines.length) {
      const line = lines[i];
      if (/^```/.test(line)) { closeList(); let code = ''; i++; while (i < lines.length && !/^```/.test(lines[i])) { code += lines[i] + '\n'; i++; } i++; html += '<pre class="md-pre"><code>' + esc(code) + '</code></pre>'; continue; }
      if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
        closeList();
        const splitRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
        const headers = splitRow(line); i += 2; const rows = [];
        while (i < lines.length && /\|/.test(lines[i])) { rows.push(splitRow(lines[i])); i++; }
        html += '<table class="md-table"><thead><tr>' + headers.map((h) => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
        continue;
      }
      const hm = line.match(/^(#{1,6})\s+(.*)$/);
      if (hm) { closeList(); const l = hm[1].length; html += '<h' + l + ' class="md-h' + l + '">' + inline(hm[2]) + '</h' + l + '>'; i++; continue; }
      if (/^(\*\*\*|---|___)\s*$/.test(line)) { closeList(); html += '<hr class="md-hr">'; i++; continue; }
      if (/^>\s?/.test(line)) { closeList(); let q = ''; while (i < lines.length && /^>\s?/.test(lines[i])) { q += lines[i].replace(/^>\s?/, '') + ' '; i++; } html += '<blockquote class="md-quote">' + inline(q) + '</blockquote>'; continue; }
      const lm = line.match(/^\s*([-*•])\s+(.*)$/) || line.match(/^\s*(\d+)[.)]\s+(.*)$/);
      if (lm) { const want = /\d/.test(lm[1]) ? 'ol' : 'ul'; if (listType !== want) { closeList(); html += '<' + want + ' class="md-' + want + '">'; listType = want; } html += '<li>' + inline(lm[2]) + '</li>'; i++; continue; }
      if (!line.trim()) { closeList(); i++; continue; }
      closeList(); let p = line; i++;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>\s?|\s*[-*•]\s|\s*\d+[.)]\s|```)/.test(lines[i]) && !/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i])) { p += '<br>' + lines[i]; i++; }
      html += '<p class="md-p">' + inline(p) + '</p>';
    }
    closeList();
    return html;
  }
  function getSop() {
    try { return JSON.parse(LS.getItem('wb_sop') || 'null'); } catch (e) { return null; }
  }
  function setSop(s) { LS.setItem('wb_sop', JSON.stringify(s)); }

  function renderSopTimeline() {
    const sop = getSop();
    const box = $('#sopTimeline');
    if (!sop || !sop.items || sop.items.length === 0) {
      box.innerHTML = '<div style="font-size:12px;color:var(--muted);">未上传 SOP，点击上方「上传 SOP 文件」。</div>';
      return;
    }
    const dk = dayKey();
    const wdNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let html = '';
    sop.items.forEach((it, i) => {
      const done = LS.getItem('sopDone_' + dk + '_' + i) === '1';
      const tag = it.weekday != null ? `<span class="memo-tag">${wdNames[it.weekday]}</span>` : '<span class="memo-tag">每日</span>';
      html += `<div class="tl-item ${done ? 'done' : ''}"><input type="checkbox" class="tl-check" data-i="${i}" ${done ? 'checked' : ''}><div class="tl-text"><span class="tl-time">${it.time}</span>${tag} ${it.text}</div></div>`;
    });
    box.innerHTML = html;
    $$('.tl-check', box).forEach((c) => c.addEventListener('change', (e) => {
      const i = e.target.dataset.i;
      if (e.target.checked) LS.setItem('sopDone_' + dk + '_' + i, '1'); else LS.removeItem('sopDone_' + dk + '_' + i);
      e.target.closest('.tl-item').classList.toggle('done', e.target.checked);
    }));
  }

  function renderSopCenter() {
    const sop = getSop();
    const content = $('#centerContent');
    let html = '<div style="padding:20px;max-width:760px;margin:0 auto;">';
    html += '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">我的 SOP</div>';
    html += '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">左侧时间轴为自动提取的定时节点（用于弹窗提醒）；下方为完整文档渲染。通用版每周重复执行；右侧可上传更新，具体内容每周手动替换。</div>';
    if (!sop || !sop.raw) {
      html += '<div class="card" style="color:var(--muted);">尚未上传 SOP 文件。点击右侧「上传 SOP 文件」选择 .md / .txt / .json / .pdf。</div>';
    } else {
      html += `<div class="card md-card">${renderMarkdown(sop.raw)}</div>`;
    }
    html += '</div>';
    content.innerHTML = html;
  }

  $('#uploadSopBtn').addEventListener('click', () => $('#sopFile').click());
  $('#sopFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const text = await extractSopText(file);
    if (text == null) return; // 提取失败（已在函数内提示）
    const items = parseSop(text);
    setSop({ name: file.name, raw: text, items, updated: new Date().toISOString() });
    renderSopTimeline();
    if (currentModule === 'sop') renderSopCenter();
    alert('SOP 已解析并保存（' + items.length + ' 个时间节点）。');
  });
  $('#clearSopBtn').addEventListener('click', () => {
    const sop = getSop();
    if (!sop || !sop.raw) { alert('当前没有 SOP 内容可清除。'); return; }
    if (!confirm('确定清空全部 SOP 内容吗？此操作不可撤销，方便你重新上传或粘贴新版。')) return;
    LS.removeItem('wb_sop');
    // 同时清除勾选完成标记，避免重传后残留旧状态
    for (let i = LS.length - 1; i >= 0; i--) {
      const k = LS.key(i);
      if (k && k.indexOf('sopDone_') === 0) LS.removeItem(k);
    }
    renderSopTimeline();
    if (currentModule === 'sop') renderSopCenter();
    alert('SOP 已清空，你可以重新上传或粘贴新版。');
  });

  /* ---------------- 备忘录 ---------------- */
  function getMemos() {
    try { return JSON.parse(LS.getItem('wb_memos') || '[]'); } catch (e) { return []; }
  }
  function setMemos(a) { LS.setItem('wb_memos', JSON.stringify(a)); }

  function renderMemos() {
    const list = getMemos().slice().sort((a, b) => new Date(a.time) - new Date(b.time));
    const box = $('#memoList');
    if (list.length === 0) { box.innerHTML = '<div style="font-size:12px;color:var(--muted);">暂无备忘录，点击「+ 添加事项」。</div>'; return; }
    const q = ($('#search').value || '').trim().toLowerCase();
    let html = '';
    list.forEach((m) => {
      if (q && !(m.text || '').toLowerCase().includes(q)) return;
      const done = m.done;
      html += `<div class="memo-item ${done ? 'done' : ''}" style="${done ? 'opacity:.55;' : ''}">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <div class="memo-time">${fmtTime(m.time)} 前 5 分钟提醒</div>
          <button class="memo-del" data-id="${m.id}" title="删除">×</button>
        </div>
        <div style="font-size:13px;margin-top:4px;${done ? 'text-decoration:line-through;' : ''}">${m.text}</div>
        <div class="memo-img-slot" data-img="${m.imgId || ''}"></div>
      </div>`;
    });
    box.innerHTML = html || '<div style="font-size:12px;color:var(--muted);">无匹配项</div>';
    $$('.memo-img-slot', box).forEach((slot) => {
      const id = slot.dataset.img; if (!id) return;
      idbGet(id).then((blob) => { if (blob) { const u = URL.createObjectURL(blob); const im = document.createElement('img'); im.src = u; im.className = 'tl-img'; im.onload = () => URL.revokeObjectURL(u); slot.appendChild(im); } }).catch(() => {});
    });
    $$('.memo-del', box).forEach((b) => b.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      setMemos(getMemos().filter((x) => x.id !== id));
      if (id) idbDel('img_' + id);
      renderMemos();
    }));
  }

  function markMemoDone(id) {
    const a = getMemos(); const m = a.find((x) => x.id === id);
    if (m) { m.done = true; setMemos(a); }
    renderMemos();
  }

  $('#addMemoBtn').addEventListener('click', () => {
    $('#memoText').value = ''; $('#memoTime').value = ''; $('#memoImg').value = '';
    showMask('#memoMask');
  });
  $('#memoCancel').addEventListener('click', () => hideMask('#memoMask'));
  $('#memoSave').addEventListener('click', () => {
    const text = $('#memoText').value.trim();
    const time = $('#memoTime').value;
    if (!text || !time) { alert('请填写事项内容并选择提醒时间。'); return; }
    const id = 'm_' + Date.now();
    const fileInput = $('#memoImg');
    const finish = (imgId) => {
      const memos = getMemos();
      memos.push({ id, text, time: new Date(time).toISOString(), imgId: imgId || null, done: false });
      setMemos(memos);
      renderMemos();
      hideMask('#memoMask');
    };
    if (fileInput.files && fileInput.files[0]) {
      idbPut('img_' + id, fileInput.files[0]).then(() => finish('img_' + id)).catch(() => finish(null));
    } else { finish(null); }
  });

  /* ---------------- 自定义链接弹窗 ---------------- */
  $('#linkAddCancel').addEventListener('click', () => hideMask('#linkAddMask'));
  $('#linkAddSave').addEventListener('click', () => {
    const title = $('#linkAddTitle').value.trim();
    let url = $('#linkAddUrl').value.trim();
    const desc = $('#linkAddDesc').value.trim();
    if (!title || !url) { alert('请填写名称和网址。'); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const item = { title, url, desc: desc || title, emoji: '🔗' };
    const key = currentLinkAddModule === 'links' ? 'systems' : currentLinkAddModule;
    CUSTOM_LINKS[key] = CUSTOM_LINKS[key] || [];
    CUSTOM_LINKS[key].push(item);
    setCustomLinks(CUSTOM_LINKS);
    LINKS = mergeLinks();
    hideMask('#linkAddMask');
    if (currentModule === 'links' || currentModule === 'materials') renderLinks(currentModule);
  });

  /* ---------------- 提醒调度 ---------------- */
  function checkReminders() {
    const now = new Date();
    const sop = getSop();
    if (sop && sop.items && sop.items.length) {
      const dow = now.getDay();
      const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      sop.items.forEach((it, i) => {
        if ((it.weekday == null || it.weekday === dow) && it.time === cur) {
          const key = 'sopFired_' + dayKey() + '_' + i;
          if (!LS.getItem(key)) { LS.setItem(key, '1'); showReminder({ title: 'SOP 提醒', text: (it.weekday != null ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][it.weekday] + ' ' : '') + it.time + ' · ' + it.text }); }
        }
      });
    }
    getMemos().forEach((m) => {
      if (m.done) return;
      const fire = new Date(new Date(m.time).getTime() - 5 * 60000);
      const snooze = Number(LS.getItem('memoSnooze_' + m.id) || 0);
      if (now >= fire) {
        const key = 'memoFired_' + m.id;
        if (!LS.getItem(key) || now >= snooze) {
          LS.setItem(key, '1');
          showReminder({ title: '备忘录提醒', text: m.text, imgId: m.imgId, memoId: m.id });
        }
      }
    });
  }

  /* ---------------- 侧栏字号缩放 ---------------- */
  function applySideScale(v) {
    const scale = (typeof v === 'number' && v > 0) ? v : 1;
    document.documentElement.style.setProperty('--side-scale', String(scale));
    const sp = document.getElementById('setSideScale');
    const sv = document.getElementById('sideScaleVal');
    if (sp && document.activeElement !== sp) sp.value = String(Math.round(scale * 100));
    if (sv) sv.textContent = Math.round(scale * 100) + '%';
  }

  /* ---------------- 浏览器桌面通知授权 ---------------- */
  function refreshNotifyBtn() {
    const btn = document.getElementById('setNotifyBtn');
    if (!btn) return;
    if (!('Notification' in window)) { btn.textContent = '浏览器不支持'; btn.disabled = true; return; }
    const p = Notification.permission;
    if (p === 'granted') { btn.textContent = '已开启 ✓'; btn.disabled = true; }
    else if (p === 'denied') { btn.textContent = '已被拦截，去地址栏允许'; btn.disabled = true; }
    else { btn.textContent = '开启浏览器通知'; btn.disabled = false; }
  }
  (function bindNotifyBtn() {
    const nb = document.getElementById('setNotifyBtn');
    if (!nb) return;
    nb.addEventListener('click', () => {
      if (!('Notification' in window)) { alert('当前浏览器不支持桌面通知。'); return; }
      Notification.requestPermission().then(() => refreshNotifyBtn()).catch(() => {});
    });
  })();

  /* ---------------- 设置弹窗 ---------------- */
  $('#openSettings').addEventListener('click', () => {
    const s = getSettings();
    $('#setApiKey').value = s.apiKey;
    $('#setModel').value = s.model;
    $('#setFeishu').value = s.feishu;
    $('#setWeeklyClear').checked = s.weeklyClear;
    applySideScale(s.sideScale);
    const sp = document.getElementById('setSideScale');
    if (sp) sp.addEventListener('input', () => applySideScale((parseInt(sp.value, 10) || 100) / 100));
    refreshNotifyBtn();
    updateStorageInfo();
    showMask('#settingsMask');
  });
  $('#settingsCancel').addEventListener('click', () => { applySideScale(getSettings().sideScale); hideMask('#settingsMask'); });
  $('#settingsSave').addEventListener('click', () => {
    const s = getSettings();
    s.apiKey = $('#setApiKey').value.trim();
    s.model = $('#setModel').value;
    s.feishu = $('#setFeishu').value.trim();
    s.weeklyClear = $('#setWeeklyClear').checked;
    const sp = document.getElementById('setSideScale');
    s.sideScale = (sp ? (parseInt(sp.value, 10) || 100) / 100 : 1);
    setSettings(s);
    applySideScale(s.sideScale);
    hideMask('#settingsMask');
    alert('设置已保存到本机。');
  });

  async function updateStorageInfo() {
    let bytes = 0;
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); bytes += (k.length + (LS.getItem(k) || '').length) * 2; }
    const imgs = await idbCount().catch(() => 0);
    const kb = (bytes / 1024).toFixed(1);
    $('#storageInfo').innerHTML = `本地配置约 ${kb} KB · 图片 ${imgs} 张存于本地数据库<br>API Key 仅存本机，不会进入任何仓库。<br><button id="manualClear" class="btn ghost" style="margin-top:8px;">立即清空备忘录与图片</button>`;
    const mc = $('#manualClear');
    if (mc) mc.addEventListener('click', async () => {
      if (confirm('确认清空所有备忘录及本地图片？此操作不可撤销。')) {
        LS.removeItem('wb_memos');
        await idbClear().catch(() => {});
        renderMemos(); updateStorageInfo();
      }
    });
  }

  function checkWeeklyClear() {
    const s = getSettings();
    if (!s.weeklyClear) return;
    const last = Number(LS.getItem('lastWeeklyClear') || 0);
    const ws = weekStart(new Date()).getTime();
    if (ws > last) { LS.setItem('lastWeeklyClear', String(ws)); LS.removeItem('wb_memos'); idbClear().catch(() => {}); }
  }

  /* ---------------- 全站搜索 ---------------- */
  function renderGlobalSearch(q) {
    const content = $('#centerContent');
    const terms = q.toLowerCase();
    const sys = (LINKS.systems || []).filter((x) => (x.title + (x.desc || '')).toLowerCase().includes(terms));
    const mat = (LINKS.materials || []).filter((x) => (x.title + (x.desc || '')).toLowerCase().includes(terms));
    const memos = getMemos().filter((m) => (m.text || '').toLowerCase().includes(terms));
    const sop = getSop();
    const sopItems = (sop && sop.items) ? sop.items.filter((it) => (it.text || '').toLowerCase().includes(terms)) : [];
    const total = sys.length + mat.length + memos.length + sopItems.length;
    let html = `<div style="padding:18px 20px;"><div style="font-size:18px;font-weight:700;margin-bottom:4px;">全站搜索：${q}</div><div style="font-size:12px;color:var(--muted);margin-bottom:6px;">跨「工作系统 / 链接」「销售素材库」「备忘录」「SOP」共 ${total} 条匹配</div></div>`;
    if (total === 0) { html += '<div style="color:var(--muted);padding:20px;">无匹配项</div>'; content.innerHTML = html; return; }
    const section = (title) => `<div style="padding:4px 20px;font-size:13px;font-weight:700;color:var(--muted);">${title}</div>`;
    const card = (x) => `<a class="link-card link-search" href="${x.url}" target="_blank" rel="noopener"><span class="lc-emoji">${x.emoji || '🔗'}</span><span class="lc-title">${x.title}</span><span class="lc-desc">${x.desc || ''}</span></a>`;
    if (sys.length) { html += section('工作系统 / 链接') + '<div class="link-grid">' + sys.map(card).join('') + '</div>'; }
    if (mat.length) { html += section('销售素材库') + '<div class="link-grid">' + mat.map(card).join('') + '</div>'; }
    if (memos.length) { html += section('备忘录') + '<div style="padding:0 20px;">' + memos.map((m) => `<div class="memo-item memo-search" style="margin-bottom:8px;cursor:pointer;"><div style="font-size:13px;">${m.text}</div></div>`).join('') + '</div>'; }
    if (sopItems.length) { html += section('SOP') + '<div style="padding:0 20px;">' + sopItems.map((it) => `<div class="memo-item memo-search" style="margin-bottom:8px;cursor:pointer;"><div style="font-size:13px;">${it.text}</div></div>`).join('') + '</div>'; }
    content.innerHTML = html;
    $$('.link-search', content).forEach((c) => c.addEventListener('click', () => { $('#search').value = ''; }));
    $$('.memo-search', content).forEach((el) => el.addEventListener('click', () => { $('#search').value = ''; switchModule('sop'); }));
  }

  $('#search').addEventListener('input', () => {
    const q = $('#search').value.trim();
    if (q) {
      const frame = $('#toolFrame'); const content = $('#centerContent'); const ext = $('#openExt');
      frame.style.display = 'none'; content.style.display = 'block'; ext.style.display = 'none';
      renderGlobalSearch(q);
    } else {
      switchModule(currentModule);
    }
  });

  /* ---------------- 初始化 ---------------- */
  function init() {
    loadWidths();
    applyTheme(LS.getItem('wb_theme') || 'green');
    applySideScale(getSettings().sideScale);
    checkWeeklyClear();
    renderSopTimeline();
    renderMemos();
    switchModule('home');
    setInterval(checkReminders, 20000);
    checkReminders();
    setInterval(() => { renderSopTimeline(); }, 60 * 60 * 1000);
  }
  init();
})();
