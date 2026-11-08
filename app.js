import { SUBJECTS, LECTURE_BY_ID, SUBJECT_BY_ID } from "./toc.js?v=30f4a3e87e";
import { linkLaws, lookupLaw, SUBJECT_LAW } from "./laws.js?v=30f4a3e87e";
import { ENV, apiUrl, detectEnv, probeLocal, ghCfg, setGhCfg, testToken, clearContentCache, loadInventory as fetchInventory, loadLecture,
  loadLocalState, writeLocalState, stamp, stampBaseline, sync, syncNow, prepareReset, resetState, norm as normState } from "./store.js?v=30f4a3e87e";
import { initPages, viewPractice, viewProblem, viewAnswer, viewSearch, viewCases, viewGuide, viewLaws, viewFav } from "./pages.js?v=30f4a3e87e";

const $ = (s, el = document) => el.querySelector(s);
const app = $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => new Date().toLocaleDateString("sv-SE");
const fmt = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(s).padStart(2, "0")}`;
};
const parseTs = (t) => t.split(":").reduce((a, x) => a * 60 + +x, 0);
const pref = {
  get(k, d) { try { const v = localStorage.getItem("shiho." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("shiho." + k, JSON.stringify(v)); } catch {} },
};

let toastTimer;
function toast(msg) {
  let el = $(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
  el.textContent = msg; el.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.opacity = 0), 1400);
}

// ---------- 学习记录 ----------
let S = normState({});
let saveTimer = null, syncTimer = null;
function L(id) {
  const r = (S.lectures[id] ||= { pos: 0, dur: 0, done: false, note: "" });
  r.marks ||= [];
  return r;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { stamp(S); writeLocalState(S); }, 800);
  // 同步到 GitHub：学习中最多一分钟一次（看视频时每 5 秒记一次进度，不能每次都上传）
  if (ghCfg() && !syncTimer) syncTimer = setTimeout(() => { syncTimer = null; doSync(); }, 60_000);
}
async function loadState() {
  S = await loadLocalState();
  stampBaseline(S);
}
const getS = () => { stamp(S); return S; };
const setS = (x) => { S = normState(x); stampBaseline(S); writeLocalState(S); };
async function doSync() {
  clearTimeout(syncTimer); syncTimer = null;
  const changed = await syncNow(getS, setS);
  // 别的设备有新记录：在首页 / 目录页时刷新一下（讲次页正在看视频，不打断）
  if (changed && !cur) route();
  return changed;
}
let INV = { subs: [], notes: [], maps: [], cards: [], cases: [], quiz: [] };
async function loadInventory() { INV = await fetchInventory(); }

// ---------- 顶栏 ----------
function isDark() {
  return (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
}
const ICON = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  moon: ICON('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  sun: ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  expand: ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  shrink: ICON('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
};
function renderThemeBtn() { const b = $("#themeBtn"); b.innerHTML = isDark() ? ICONS.sun : ICONS.moon; b.title = isDark() ? "切换到日间" : "切换到夜间"; }
$("#themeBtn").onclick = () => {
  const next = isDark() ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("shiho.theme", next); } catch {}
  renderThemeBtn();
};
renderThemeBtn();
// 字号：整页一起缩放（文字、间距、视频一起变），每台设备单独记住
const FZ = [85, 90, 100, 110, 120, 135, 150];
function applyFz(v) {
  v = FZ.includes(v) ? v : 100;
  document.documentElement.style.zoom = v === 100 ? "" : v / 100;
  pref.set("fz", v);
  const p = $(".fz-pop"); if (p) p.querySelector("b").textContent = v + "%";
  return v;
}
let fz = applyFz(pref.get("fz", 100));
$("#fzBtn").onclick = (e) => {
  e.stopPropagation();
  let p = $(".fz-pop");
  if (p) return p.remove();
  p = document.createElement("div"); p.className = "fz-pop";
  p.innerHTML = `<div class="muted small">字号</div>
    <div class="fz-row"><button data-d="-1" title="小一点">A−</button><b>${fz}%</b><button data-d="1" title="大一点">A+</button></div>
    <button class="link" data-reset>恢复默认</button>`;
  p.onclick = (ev) => {
    ev.stopPropagation();
    const b = ev.target.closest("button"); if (!b) return;
    fz = applyFz(b.dataset.reset != null ? 100 : FZ[Math.max(0, Math.min(FZ.length - 1, FZ.indexOf(fz) + +b.dataset.d))]);
  };
  $(".fz-wrap").appendChild(p);
};
document.addEventListener("click", () => $(".fz-pop")?.remove());
// 筑波法科大学院 既修者 笔试，大约 2027 年 9 月（正式日期以招生简章为准）
// 设置（右上角齿轮）：考试日期、每日目标（0 = 按剩余视频自动算）、最后留给复习的天数
const cfg = () => ({ exam: pref.get("exam", "2027-09-01"), daily: +pref.get("daily", 0) || 0, reserve: Math.max(0, +pref.get("reserve", 60) || 0) });
let days;
function updateDays() {
  days = Math.ceil((new Date(cfg().exam + "T00:00") - new Date()) / 864e5);
  $("#goal").textContent = days > 0 ? `距入试 ${days} 天` : days === 0 ? "今天考试" : "";
}
updateDays();
$("#setBtn").onclick = (e) => {
  e.stopPropagation();
  let p = $(".set-pop");
  if (p) return p.remove();
  $(".fz-pop")?.remove();
  const c = cfg();
  p = document.createElement("div"); p.className = "fz-pop set-pop";
  p.innerHTML = `<div class="set-t">设置</div>
    <label>考试日期<input type="date" name="exam" value="${c.exam}"></label>
    <label>每天学习目标<span class="set-in"><input type="number" name="daily" min="0" step="10" value="${c.daily || ""}" placeholder="自动">分钟</span></label>
    <div class="muted small">留空 = 自动：剩余视频时长 ÷ 剩下的天数</div>
    <label>最后留给复习<span class="set-in"><input type="number" name="reserve" min="0" step="10" value="${c.reserve}">天</span></label>
    <div class="muted small">这段时间不排新视频，只做题和复习</div>
    <div class="set-act"><button class="act" data-save>保存</button><button class="link" data-close>取消</button></div>
    <div class="muted small">只保存在这台设备上</div>`;
  p.onclick = (ev) => {
    ev.stopPropagation();
    if (ev.target.closest("[data-close]")) return p.remove();
    if (!ev.target.closest("[data-save]")) return;
    const v = (n) => p.querySelector(`[name=${n}]`).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v("exam"))) pref.set("exam", v("exam"));
    pref.set("daily", Math.max(0, Math.round(+v("daily") || 0)));
    pref.set("reserve", Math.max(0, Math.round(+v("reserve") || 0)));
    p.remove(); updateDays(); route(); toast("设置已保存");
  };
  $("#setBtn").parentElement.appendChild(p);
};
document.addEventListener("click", (e) => { if (!e.target.closest(".set-pop")) $(".set-pop")?.remove(); });

// ---------- 快捷键说明 ----------
const KEYS = [
  ["播放", [
    ["Space / K", "播放 / 暂停"],
    ["← / →", "后退 / 前进 5 秒"],
    ["J / L", "后退 / 前进 10 秒"],
    ["↑ / ↓", "上一句 / 下一句"],
    ["R", "重听这一句"],
    ["A", "单句循环 开 / 关"],
    ["[ / ]", "减速 / 加速 0.25"],
    ["\\", "恢复 1 倍速"],
  ]],
  ["记录", [
    ["B", "在这里加书签"],
    ["H", "标记为难点"],
    ["N", "写笔记（自动插入时间）"],
    ["Esc", "离开输入框，继续播放"],
  ]],
  ["页面", [
    ["F", "全屏 开 / 关"],
    ["1 – 8", "切换右侧标签"],
    ["O / X", "○×题：答 ○ / 答 ×（在 ○× 标签里）"],
    ["0", "导图一键归位（也可以双击空白处）"],
    ["/", "搜索字幕"],
    ["G", "字幕跟随 开 / 关"],
    ["T", "专注模式（隐藏右侧）"],
    ["M", "随身听模式（只听声音 + 字幕）"],
    ["Shift + ← / →", "上一讲 / 下一讲"],
    ["?", "显示 / 隐藏本说明"],
  ]],
];
const help = $("#help");
help.innerHTML = KEYS.map(([t, rows]) => `<h3>${t}</h3><dl>${rows.map(([k, d]) =>
  `<dt>${k.split(" ").map((x) => (/^[\/–+]$/.test(x) ? ` ${x} ` : `<kbd>${esc(x)}</kbd>`)).join("")}</dt><dd>${d}</dd>`).join("")}</dl>`).join("");
const toggleHelp = () => (help.hidden = !help.hidden);
$("#helpBtn").onclick = toggleHelp;

// ---------- 全屏（整个学习页面，不只是视频） ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => toast("浏览器不允许全屏"));
}
$("#fsBtn").onclick = toggleFullscreen;
$("#fsBtn").innerHTML = ICONS.expand;
document.addEventListener("fullscreenchange", () => {
  const on = !!document.fullscreenElement;
  document.documentElement.classList.toggle("fs", on);
  $("#fsBtn").innerHTML = on ? ICONS.shrink : ICONS.expand; $("#fsBtn").title = on ? "退出全屏（F）" : "全屏（F）";
});

// ---------- 首页 ----------
const subjStat = (s) => {
  const done = s.lectures.filter((l) => S.lectures[l.id]?.done);
  const left = s.dur - done.reduce((a, l) => a + l.dur, 0);
  return { done: done.length, total: s.lectures.length, left };
};
const hrs = (sec) => (sec / 3600).toFixed(sec < 36000 ? 1 : 0);

function viewHome() {
  const last = Object.entries(S.lectures).filter(([id, v]) => v.at && LECTURE_BY_ID[id]).sort((a, b) => b[1].at - a[1].at)[0];
  const ll = last && LECTURE_BY_ID[last[0]];
  // 上次那一讲看完了的话，推荐同一科目的下一讲
  const nextLec = ll && S.lectures[ll.id]?.done ? SUBJECT_BY_ID[ll.subject].lectures.find((l) => l.n > ll.n && !S.lectures[l.id]?.done) : null;
  const due = dueCards().length;
  const wrong = Object.values(S.quiz || {}).filter((v) => v.last === false).length;
  // 今日计划：剩余视频时长 ÷ 天数（最后 60 天留给做题复习）
  const left = SUBJECTS.reduce((a, s) => a + subjStat(s).left, 0);
  const c = cfg();
  const studyDays = Math.max(1, days - c.reserve);
  const auto = Math.max(1, Math.round(left / studyDays / 60));
  const goal = c.daily || auto;
  const todayMin = Math.round((S.days[today()] || 0) / 60);
  const pct = Math.min(100, (todayMin / goal) * 100);
  const total = SUBJECTS.reduce((a, s) => a + s.dur, 0);
  const doneAll = SUBJECTS.reduce((a, s) => a + subjStat(s).done, 0), lecAll = SUBJECTS.reduce((a, s) => a + s.lectures.length, 0);
  const todo = [
    ll && !S.lectures[ll.id]?.done ? { href: `#/l/${ll.id}`, k: "接着看", t: `${SUBJECT_BY_ID[ll.subject].title}　第${ll.n}講　${ll.title}`, m: `看到 ${fmt(last[1].pos)}` } : null,
    nextLec ? { href: `#/l/${nextLec.id}`, k: "下一讲", t: `${SUBJECT_BY_ID[nextLec.subject].title}　第${nextLec.n}講　${nextLec.title}`, m: `${Math.round(nextLec.dur / 60)} 分钟` } : null,
    !ll ? { href: `#/l/${SUBJECTS[0].lectures[0].id}`, k: "开始", t: `${SUBJECTS[0].title}　第1講　${SUBJECTS[0].lectures[0].title}`, m: "从憲法开始" } : null,
    due ? { href: "#/review", k: "复习", t: `${due} 张论证卡片到期`, m: "先清掉再看新的" } : null,
    wrong ? { href: "#/review", k: "错题", t: `${wrong} 道 ○× 上次答错`, m: "" } : null,
  ].filter(Boolean);
  app.innerHTML = `
    ${!pref.get("guideSeen", false) ? `<div class="resume"><span>第一次用？先花 5 分钟看看每个功能怎么用、一天怎么学。</span><a class="act" href="#/guide">打开学习指引</a></div>` : ""}
    <section class="today">
      <div class="today-goal">
        <div class="section-t">今天</div>
        <div class="tg-num"><b>${todayMin}</b><span>/ ${goal} 分钟</span></div>
        <div class="tg-bar"><i style="width:${pct}%"></i></div>
        <div class="tg-sub">${todayMin >= goal ? "今天的目标完成了" : `还差 ${goal - todayMin} 分钟（1.5 倍速约 ${Math.round((goal - todayMin) / 1.5)} 分钟）`}　·　连续学习 ${streakDays()} 天</div>
        <div class="tg-note">${c.daily ? `自己设定的目标。按剩余视频平均要每天 ${auto} 分钟` : `每天 ${goal} 分钟 = 剩余视频 ${hrs(left)} 小时 ÷ ${studyDays} 天`}（离入试 ${days} 天，最后 ${c.reserve} 天留给做题和复习）　<a class="link" href="javascript:void 0" onclick="event.stopPropagation();document.getElementById('setBtn').click()">修改</a></div>
      </div>
      <div class="today-todo">
        <div class="section-t">接下来</div>
        ${todo.map((x) => `<a class="todo" href="${x.href}"><span class="k">${x.k}</span><span class="t">${esc(x.t)}</span><span class="m">${esc(x.m)}</span><span class="go">→</span></a>`).join("")}
      </div>
    </section>

    ${heatHtml()}

    <div class="section-t">入试科目<span class="muted small" style="font-weight:400;letter-spacing:0;margin-left:12px">学完 ${doneAll} / ${lecAll} 講 · 全部按原速约 ${hrs(total)} 小时（1.5 倍速约 ${hrs(total / 1.5)} 小时）</span></div>
    <div class="subj-list">
      ${SUBJECTS.map((s) => {
        const st = subjStat(s);
        const p = st.total ? (st.done / st.total) * 100 : 0;
        return `<a class="subj-row" href="#/s/${s.id}">
          <span class="nm">${s.title}</span>
          <span class="meter"><i style="width:${p}%"></i></span>
          <span class="num">${st.done} / ${st.total} 講</span>
          <span class="num">剩 ${hrs(st.left)} 小时</span>
          <span class="go">→</span></a>`;
      }).join("")}
    </div>`;
}
function streakDays() {
  const dk = (d) => d.toLocaleDateString("sv-SE");
  let n = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (!(S.days[dk(d)] > 0)) d.setDate(d.getDate() - 1);
  while (S.days[dk(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// 学习记录：从第一次学习那天开始，一直排到考试那天（未来的格子是空的，慢慢填满）
function heatHtml() {
  const dkey = (d) => d.toLocaleDateString("sv-SE");
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const studied = Object.keys(S.days).filter((k) => S.days[k] > 0).sort();
  const first = studied.length ? new Date(studied[0] + "T00:00") : new Date(today0);
  const exam = new Date(cfg().exam + "T00:00");
  const end = exam > today0 ? exam : today0;
  const start = new Date(first); start.setDate(start.getDate() - start.getDay());
  const out = [];
  let total = 0, active = 0, wk = 0, lastM = -1, week = 0;
  const wkStart = new Date(today0); wkStart.setDate(today0.getDate() - today0.getDay());
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 && d > start) wk++;
    if (d.getMonth() !== lastM && (dow === 0 || +d === +start)) {
      const yr = lastM === -1 || d.getMonth() === 0 ? `${d.getFullYear()}年` : "";
      out.push(`<span class="hm-m" style="grid-column:${wk + 2}">${yr}${d.getMonth() + 1}月</span>`); lastM = d.getMonth();
    }
    const k = dkey(d), v = S.days[k] || 0;
    const before = d < first, fut = d > today0;
    total += v; if (v > 0) active++;
    if (d >= wkStart && !fut) week += v;
    const lv = v <= 0 ? 0 : v < 900 ? 1 : v < 2700 ? 2 : v < 5400 ? 3 : 4;
    const cls = before ? "pre" : fut ? "fut" : "l" + lv;
    const tip = +d === +exam ? `${k}　考试` : fut ? k : `${k}　${Math.round(v / 60)} 分钟`;
    out.push(`<i class="${cls}${+d === +today0 ? " now" : ""}${+d === +exam ? " exam" : ""}" style="grid-area:${dow + 2}/${wk + 2}" title="${tip}"></i>`);
  }
  const since = Math.round((today0 - first) / 864e5) + 1;
  return `<section class="hm-sec">
    <div class="hm-head"><div class="section-t">学习记录<span class="muted small" style="font-weight:400;letter-spacing:0;margin-left:12px">${first.toLocaleDateString("sv-SE")} 开始 → ${exam > today0 ? `${cfg().exam} 考试` : "今天"}</span></div>
      <div class="hm-stat"><span><b>${Math.round(week / 60)}</b> 分钟<small>本周</small></span><span><b>${active}</b> / ${since} 天<small>开始以来学过的天数</small></span><span><b>${hrs(total)}</b> 小时<small>累计</small></span>${days > 0 ? `<span><b>${days}</b> 天<small>离考试</small></span>` : ""}</div></div>
    <div class="hm" style="grid-template-columns:18px repeat(${wk + 1}, minmax(0, 1fr))">
      <span class="hm-w" style="grid-area:3/1">一</span><span class="hm-w" style="grid-area:5/1">三</span><span class="hm-w" style="grid-area:7/1">五</span>
      ${out.join("")}
    </div>
    <div class="heat-legend"><span class="hm-key"><i class="fut"></i> 还没到</span><span class="hm-key"><i class="exam"></i> 考试</span><span style="margin-left:14px">少</span> <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> 多</div>
  </section>`;
}

// ---------- 讲次目录 ----------
function viewSubject(id) {
  const s = SUBJECT_BY_ID[id];
  if (!s) return viewHome();
  const st = subjStat(s);
  const has = (k, lid) => INV[k].includes(lid);
  app.innerHTML = `
    <div class="toc-head"><a class="link" href="#/">← 科目</a><h1>${s.title}</h1>
      <span class="muted small">学完 ${st.done} / ${st.total}　·　剩 ${hrs(st.left)} 小时　·　有字幕 ${s.lectures.filter((l) => has("subs", l.id)).length}</span></div>
    <ul class="toc">
      ${s.lectures.map((l) => {
        const r = S.lectures[l.id];
        const st = r?.done ? `<span class="st done">●</span>` : r?.pos > 5 ? `<span class="st part" title="看到 ${fmt(r.pos)}">◐</span>` : `<span class="st">○</span>`;
        const h = (k, c) => (has(k, l.id) ? `<b>${c}</b>` : c);
        return `<li><a href="#/l/${l.id}">${st}<span class="n">第${l.n}講</span><span class="tt">${esc(l.title)}</span>
          <span class="len">${Math.round(l.dur / 60)}分</span>
          <span class="has">${h("subs", "字")}${h("notes", "记")}${h("maps", "图")}${h("cards", "卡")}</span></a></li>`;
      }).join("")}
    </ul>`;
}

// ---------- YouTube ----------
let ytReady = null;
function loadYT() {
  return (ytReady ||= new Promise((resolve) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  }));
}
// 点了视频以后焦点会进 iframe，键盘事件就到不了页面。点完马上把焦点拿回来（点击本身照常生效）。
window.addEventListener("blur", () => setTimeout(() => {
  if (document.activeElement?.tagName === "IFRAME") { document.activeElement.blur(); window.focus(); }
}, 0));

let cur = null;
let leaveFns = [];
function cleanup() {
  leaveFns.forEach((f) => { try { f(); } catch {} });
  leaveFns = [];
  if (!cur) return;
  try { cur.mm?.destroy?.(); } catch {}
  clearInterval(cur.tick);
  try { cur.player?.destroy(); } catch {}
  cur = null;
}
// 中日文里「**「…」**の」这种加粗，标准 Markdown 认不出来（星号挨着全角标点），会露出星号。
// 先自己把 **…** / *…* 换成 <strong> / <em>，代码块和行内代码不动。
function cjkEmphasis(md) {
  let fence = false;
  return md.split("\n").map((ln) => {
    if (/^\s*(```|~~~)/.test(ln)) { fence = !fence; return ln; }
    if (fence) return ln;
    return ln.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part
      .replace(/\*\*(?=\S)([^\n]*?\S)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\\])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, "$1<em>$2</em>"))).join("");
  }).join("\n");
}
// 还没生成的内容：说明是 AI 自动做的，不用自己写
const notYet = (what) => `<div class="empty">${cur?.data?.locked ? `<a class="link" href="#/sync">填写令牌</a>后显示。` : cur?.data?.subs?.length ? `此节${what}生成中，稍后自动出现。` : "此节还没有字幕。"}</div>`;
function mdHtml(text) {
  const withTs = cjkEmphasis(String(text || "")).replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (_, t) => `<button class="tlink" data-t="${parseTs(t)}">${t}</button>`);
  return DOMPurify.sanitize(marked.parse(withTs));
}

const TABS = [["ja", "日文笔记"], ["zh", "中文笔记"], ["map", "导图"], ["cards", "论证"], ["quiz", "○×"], ["cases", "判例"], ["mine", "书签与笔记"], ["ask", "AI 问答"]];

async function viewLecture(id, startT, startTab) {
  const lec = LECTURE_BY_ID[id];
  if (!lec) return viewHome();
  const s = SUBJECT_BY_ID[lec.subject];
  const prev = s.lectures[lec.n - 2], next = s.lectures[lec.n];
  const r = L(id);
  r.at = Date.now(); save();

  app.innerHTML = `
    <div class="lec-head">
      <a class="link" href="#/s/${s.id}">← ${s.title}</a>
      <span class="no">第${lec.n}講</span>
      <h1>${esc(lec.title)}</h1>
      ${prev ? `<a class="link" href="#/l/${prev.id}">上一讲</a>` : ""}
      ${next ? `<a class="link" href="#/l/${next.id}">下一讲</a>` : ""}
    </div>
    <div class="study ${pref.get("focus", false) ? "focus" : ""} ${pref.get("audio", false) ? "audio" : ""}" id="study">
      <div class="left">
        <div class="player-area">
          <div class="video"><div id="player"></div>
            <button class="cover" data-k="toggle" title="播放 / 暂停">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>
              <span id="coverState">随身听</span>
            </button>
          </div>
          <div class="pa-side">
            <div class="pa-title">第${lec.n}講　${esc(lec.title)}</div>
            <div class="rail" id="rail"><div class="played"></div></div>
            <div class="ctl">
              <button data-k="back10">−10</button><button data-k="fwd10">+10</button>
              <span><button data-k="slower">−</button> <span class="rate" id="rate"></span> <button data-k="faster">+</button></span>
              <button data-k="loop" id="loopBtn">单句循环</button>
              <button data-k="mark">书签</button>
              <button data-k="audio" id="audioBtn">随身听</button>
              <button data-k="focus">专注</button>
              <button id="doneBtn"></button>
              <span class="time" id="time">0:00</span>
            </div>
          </div>
        </div>
        <div class="subs-head">
          <input type="search" id="subQ" placeholder="搜索字幕（/）">
          <button class="small muted" data-k="follow" id="followBtn"></button>
        </div>
        <div class="subs" id="subs"><div class="empty">读取中…</div></div>
      </div>
      <div class="right">
        <div class="tabs" id="tabs">${TABS.map(([k, t]) => `<button data-tab="${k}">${t}</button>`).join("")}</div>
        <div class="tab-body" id="tabBody"></div>
      </div>
    </div>`;

  cur = { id, lec, prev, next, data: null, idx: -1, loop: -1, tab: TABS.some(([k]) => k === startTab) ? startTab : pref.get("tab", "ja"),
    rate: pref.get("rate", 1), follow: pref.get("follow", true), pausedByNote: false };
  const me = cur;
  renderDone(); renderRate(); renderFollow(); renderAudioBtn(); renderMarks();

  const data = await loadLecture(id).catch(() => null);
  if (cur !== me) return;
  cur.data = data || { subs: [], notes: {}, cards: [], cases: [] };
  renderSubs(); renderTab();
  if (startT != null) setTimeout(() => highlight(startT, true), 50);

  await loadYT();
  if (cur !== me) return;
  cur.player = new YT.Player("player", {
    videoId: lec.video,
    playerVars: { start: Math.floor(startT != null ? startT : r.done ? 0 : r.pos || 0), rel: 0, playsinline: 1, cc_load_policy: 0 },
    events: {
      onReady: () => { setRate(cur.rate, true); },
      onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) setDone(true); },
    },
  });
  let lastSave = 0;
  cur.tick = setInterval(() => {
    const p = cur?.player;
    if (!p?.getCurrentTime) return;
    const t = p.getCurrentTime(), d = p.getDuration?.() || 0;
    if (d && d !== cur.dur) { cur.dur = d; renderMarks(); }
    $("#time").textContent = `${fmt(t)} / ${fmt(d)}`;
    $("#coverState").textContent = playing() ? "播放中" : "已暂停";
    if (d) $("#rail .played").style.width = `${(t / d) * 100}%`;
    highlight(t);
    // 单句循环
    const segs = cur.data.subs;
    if (cur.loop >= 0 && segs[cur.loop] && (t >= segs[cur.loop].end - 0.05 || t < segs[cur.loop].start - 1)) p.seekTo(segs[cur.loop].start, true);
    if (p.getPlayerState?.() === YT.PlayerState.PLAYING && Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      r.pos = t; r.dur = d; r.at = Date.now();
      S.days[today()] = (S.days[today()] || 0) + 5;
      if (d && t / d > 0.95 && !r.done) setDone(true);
      save();
    }
  }, 200);

  app.querySelectorAll(".ctl [data-k], .subs-head [data-k], .cover[data-k]").forEach((b) => (b.onclick = () => ACTIONS[b.dataset.k]()));
  $("#doneBtn").onclick = () => setDone(!r.done);
  $("#subQ").oninput = renderSubs;
  $("#subQ").onkeydown = (e) => { if (e.key === "Enter") { const first = $("#subs .seg"); if (first) seek(+first.dataset.t); } };
  $("#tabs").onclick = (e) => { const t = e.target.closest("[data-tab]")?.dataset.tab; if (t) setTab(t); };
  $("#rail").onclick = (e) => {
    if (e.target.classList.contains("bm")) return seek(+e.target.dataset.t);
    const rect = e.currentTarget.getBoundingClientRect();
    if (cur.dur) seek(((e.clientX - rect.left) / rect.width) * cur.dur);
  };
}

// ---------- 播放操作 ----------
// 刚跳转后播放器要过一会儿才报告新时间；连按 ↓ / → 时以刚跳到的位置为准
const now = () => {
  if (cur?.lastSeek && Date.now() - cur.lastSeek.at < 800) return cur.lastSeek.t;
  return cur?.player?.getCurrentTime?.() || 0;
};
const playing = () => !!window.YT && cur?.player?.getPlayerState?.() === YT.PlayerState.PLAYING;
function seek(t, play = true) {
  const p = cur?.player;
  if (!p?.seekTo) return;
  t = Math.max(0, t);
  cur.lastSeek = { t, at: Date.now() };
  p.seekTo(t, true);
  if (play && !playing()) p.playVideo();
}
function setRate(v, quiet) {
  v = Math.round(Math.min(2.5, Math.max(0.5, v)) * 100) / 100;
  cur.rate = v; pref.set("rate", v);
  try { cur.player?.setPlaybackRate?.(v); } catch {}
  renderRate();
  if (!quiet) toast(`${v}×`);
}
function renderRate() { $("#rate").textContent = `${cur.rate}×`; }
function segAt(t) {
  const segs = cur?.data?.subs || [];
  let lo = 0, hi = segs.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (segs[m].start <= t + 0.15) { i = m; lo = m + 1; } else hi = m - 1; }
  return i;
}
function needSubs() {
  if (cur?.data?.subs?.length) return true;
  toast("这一讲还没有字幕");
  return false;
}
function setTab(t) { cur.tab = t; pref.set("tab", t); renderTab(); }
function setDone(v) {
  const r = L(cur.id);
  r.done = v; if (v) r.doneAt = today();
  save(); renderDone();
}
function renderDone() {
  const r = L(cur.id);
  const b = $("#doneBtn");
  b.textContent = r.done ? "已学完 ✓" : "标记学完";
  b.className = r.done ? "done" : "";
}
function renderAudioBtn() { $("#audioBtn").classList.toggle("on", pref.get("audio", false)); }
function renderFollow() { $("#followBtn").textContent = cur.follow ? "跟随：开" : "跟随：关"; }
function addMark(kind) {
  const r = L(cur.id), t = Math.floor(now());
  r.marks.push({ t, kind, label: "" });
  r.marks.sort((a, b) => a.t - b.t);
  save(); renderMarks();
  if (cur.tab === "mine") renderTab();
  toast(`${kind === "hard" ? "难点" : "书签"} ${fmt(t)}`);
}

const ACTIONS = {
  toggle: () => (playing() ? cur.player.pauseVideo() : cur.player.playVideo()),
  back5: () => seek(now() - 5), fwd5: () => seek(now() + 5),
  back10: () => seek(now() - 10), fwd10: () => seek(now() + 10),
  prevSeg: () => {
    if (!needSubs()) return;
    const segs = cur.data.subs, i = segAt(now());
    // 刚开始这一句时按 ↑，去上一句；否则先回到这一句开头
    const j = i < 0 ? 0 : now() - segs[i].start < 1.2 ? Math.max(0, i - 1) : i;
    if (cur.loop >= 0) cur.loop = j;
    seek(segs[j].start);
  },
  nextSeg: () => {
    if (!needSubs()) return;
    const segs = cur.data.subs, j = Math.min(segs.length - 1, segAt(now()) + 1);
    if (cur.loop >= 0) cur.loop = j;
    seek(segs[j].start);
  },
  replay: () => { if (!needSubs()) return; const i = Math.max(0, segAt(now())); seek(cur.data.subs[i].start); },
  loop: () => {
    if (!needSubs()) return;
    cur.loop = cur.loop >= 0 ? -1 : Math.max(0, segAt(now()));
    $("#loopBtn").classList.toggle("on", cur.loop >= 0);
    $("#subs .seg.loop")?.classList.remove("loop");
    if (cur.loop >= 0) $(`#subs .seg[data-i="${cur.loop}"]`)?.classList.add("loop");
    toast(cur.loop >= 0 ? "单句循环：开" : "单句循环：关");
  },
  slower: () => setRate(cur.rate - 0.25), faster: () => setRate(cur.rate + 0.25), resetRate: () => setRate(1),
  mark: () => addMark("mark"), hard: () => addMark("hard"),
  note: () => {
    setTab("mine");
    const ta = $("#myNote");
    if (!ta) return;
    if (pref.get("notePause", true) && playing()) { cur.player.pauseVideo(); cur.pausedByNote = true; }
    const pre = ta.value && !ta.value.endsWith("\n") ? "\n" : "";
    insertAtEnd(ta, `${pre}[${fmt(now())}] `);
  },
  follow: () => { cur.follow = !cur.follow; pref.set("follow", cur.follow); renderFollow(); },
  focus: () => { const on = !pref.get("focus", false); pref.set("focus", on); $("#study").classList.toggle("focus", on); },
  // 随身听：画面盖住、播放器缩成一条，字幕占大部分空间。声音照常（播放器还在，只是被盖住）
  audio: () => {
    const on = !pref.get("audio", false); pref.set("audio", on);
    $("#study").classList.toggle("audio", on);
    renderAudioBtn();
    setTimeout(() => highlight(now(), true), 50);
  },
  search: () => $("#subQ").focus(),
  fullscreen: () => toggleFullscreen(),
  prevLec: () => cur.prev && (location.hash = `#/l/${cur.prev.id}`),
  nextLec: () => cur.next && (location.hash = `#/l/${cur.next.id}`),
};
function insertAtEnd(ta, s) {
  ta.focus();
  ta.value += s;
  ta.selectionStart = ta.selectionEnd = ta.value.length;
  ta.scrollTop = ta.scrollHeight;
  ta.dispatchEvent(new Event("input"));
}

// ---------- 键盘 ----------
const KEYMAP = {
  " ": "toggle", k: "toggle", ArrowLeft: "back5", ArrowRight: "fwd5", j: "back10", l: "fwd10",
  ArrowUp: "prevSeg", ArrowDown: "nextSeg", r: "replay", a: "loop", "[": "slower", "]": "faster", "\\": "resetRate",
  b: "mark", h: "hard", n: "note", g: "follow", f: "fullscreen", t: "focus", m: "audio", "/": "search",
};
document.addEventListener("keydown", (e) => {
  const typing = e.target.closest?.("input, textarea, [contenteditable]");
  if (e.key === "Escape") {
    if (!help.hidden) return toggleHelp();
    if (cur?.closeMap?.()) return;
    if (typing) {
      e.target.blur();
      if (cur?.pausedByNote) { cur.pausedByNote = false; cur.player?.playVideo(); }
    }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "?") { e.preventDefault(); return toggleHelp(); }
  if (e.key === "f" || e.key === "F") { e.preventDefault(); return toggleFullscreen(); }
  if (!cur?.player) return;
  if (e.shiftKey && e.key === "ArrowLeft") { e.preventDefault(); return ACTIONS.prevLec(); }
  if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); return ACTIONS.nextLec(); }
  if (/^[1-8]$/.test(e.key)) return setTab(TABS[+e.key - 1][0]);
  if (cur.tab === "quiz" && /^[oOxX]$/.test(e.key)) { e.preventDefault(); return cur.quizAnswer?.(/^[oO]$/.test(e.key)); }
  if (e.key === "0" && cur.tab === "map") return cur.mapHome?.();
  const act = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!act) return;
  e.preventDefault();
  ACTIONS[act]();
});

// ---------- 字幕 ----------
function renderSubs() {
  const box = $("#subs");
  const segs = cur.data?.subs || [];
  if (!segs.length) {
    box.innerHTML = cur.data?.locked ? `<div class="empty">字幕和笔记要<a class="link" href="#/sync">填写令牌</a>后才显示。视频可以直接看。</div>` : `<div class="empty">此节还没有字幕。</div>`;
    return;
  }
  const q = $("#subQ").value.trim();
  const hit = (t) => (q ? esc(t).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(t));
  box.innerHTML = segs.map((s, i) => (!q || s.text.includes(q))
    ? `<div class="seg${i === cur.loop ? " loop" : ""}" data-i="${i}" data-t="${s.start}"><span class="ts">${fmt(s.start)}</span><span class="tx">${hit(s.text)}</span></div>` : "").join("")
    || `<div class="empty">没有「${esc(q)}」</div>`;
  cur.idx = -1;
}
function highlight(t, force) {
  if (!cur.data?.subs?.length) return;
  const i = segAt(t);
  if (i === cur.idx && !force) return;
  cur.idx = i;
  $("#subs .seg.cur")?.classList.remove("cur");
  const el = $(`#subs .seg[data-i="${i}"]`);
  if (!el) return;
  el.classList.add("cur");
  if (cur.follow && !$("#subQ").value) {
    const box = $("#subs");
    box.scrollTo({ top: el.offsetTop - box.offsetTop - box.clientHeight / 3, behavior: "smooth" });
  }
}

// ---------- 书签 ----------
function renderMarks() {
  const rail = $("#rail");
  if (!rail) return;
  rail.querySelectorAll(".bm").forEach((x) => x.remove());
  if (!cur.dur) return;
  for (const m of L(cur.id).marks) {
    const b = document.createElement("span");
    b.className = `bm ${m.kind === "hard" ? "hard" : ""}`;
    b.style.left = `${(m.t / cur.dur) * 100}%`;
    b.dataset.t = m.t;
    b.title = `${fmt(m.t)} ${m.label || (m.kind === "hard" ? "难点" : "书签")}`;
    rail.appendChild(b);
  }
}

// ---------- 右侧 ----------
function renderTab() {
  // 切换标签前把旧导图销毁，免得它的动画还在已经移除的画布上跑
  try { cur.mm?.destroy?.(); } catch {}
  cur.mm = null; cur.mapHome = null; cur.closeMap = null;
  $("#study")?.classList.remove("map-open");
  app.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === cur.tab));
  const body = $("#tabBody");
  const d = cur.data || {};
  const t = cur.tab;
  if (t === "ja" || t === "zh") {
    const md = d.notes?.[t];
    body.innerHTML = md ? `<div class="md ${t}">${mdHtml(md)}</div>`
      : notYet(t === "ja" ? "日文笔记" : "中文讲义");
  } else if (t === "map") renderMap(body);
  else if (t === "cards") renderCardsTab(body);
  else if (t === "cases") {
    const cs = d.cases || [];
    const none = d.cases ? `<div class="empty">此节视频中没有判例。</div>` : notYet("判例");
    body.innerHTML = cs.length
      ? cs.map((c) => `<div class="card"><div class="q">${esc(c.name)}</div>
          <div class="meta">${esc(c.court || "")}${c.hyakusen ? `<span>百選 ${esc(c.hyakusen)}</span>` : ""}${c.t != null ? `<button class="tlink" data-t="${c.t}">${fmt(c.t)}</button>` : ""}</div>
          ${c.point ? `<div class="md">${mdHtml(c.point)}</div>` : ""}</div>`).join("")
      : none;
  } else if (t === "quiz") renderQuiz(body);
  else if (t === "mine") renderMine(body);
  else if (t === "ask") renderAsk(body);
  if (t !== "map" && t !== "mine") linkLaws(body, SUBJECT_LAW[cur.lec.subject]);
}

// ---------- 思维导图（markmap，Markdown 大纲 → 可折叠导图） ----------
let markmapReady = null;
function loadScript(src) {
  return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
}
function loadMarkmap() {
  return (markmapReady ||= (async () => {
    await loadScript("https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js");
    await loadScript("https://cdn.jsdelivr.net/npm/markmap-view@0.18.12/dist/browser/index.js");
    await loadScript("https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12/dist/browser/index.iife.js");
  })());
}
async function renderMap(body) {
  const md = cur.data?.map;
  if (!md) { body.innerHTML = notYet("导图"); return; }
  body.innerHTML = `<div class="row"><span>点圆点展开 / 折叠，滚轮缩放，拖动平移，点时间跳到视频</span>
    <button id="mapBig" style="margin-left:auto">放大</button></div>
    <div class="mapbox" id="mapBox"><button class="map-close" id="mapClose">关闭（Esc）</button><svg id="mapSvg"></svg>
      <div class="map-tools">
        <button id="mapHome" title="一键归位：整张图回到画面中间（按 0）">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>归位</button>
        <button id="mapReset" title="恢复成最初的展开层级">收起</button>
      </div></div>`;
  const me = cur, svg = $("#mapSvg");
  try { await loadMarkmap(); } catch { body.querySelector(".mapbox").innerHTML = `<div class="empty">导图组件加载失败（需要联网）</div>`; return; }
  // 等加载期间如果切换过标签，这块画布已经不在页面上了，就不画
  if (cur !== me || cur.tab !== "map" || !svg.isConnected) return;
  // [12:34] → 可点击跳转
  const src = md.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\](?!\()/g, (_, t) => `[${t}](#t=${parseTs(t)})`);
  const { root } = new markmap.Transformer().transform(src);
  // 颜色：和页面一致的沉稳色，按第一层分支区分
  const PAL = ["#b0392b", "#8a6d3b", "#4d6b3c", "#3d5a80", "#7a5c8a", "#a0522d", "#5b7065"];
  const opts = markmap.deriveOptions
    ? markmap.deriveOptions({ color: PAL, colorFreezeLevel: 2, initialExpandLevel: 2, maxWidth: 260, spacingVertical: 8, duration: 300 })
    : { initialExpandLevel: 2, maxWidth: 260, spacingVertical: 8, duration: 300 };
  const mm = markmap.Markmap.create(svg, { ...opts, autoFit: true }, root);
  cur.mm = mm;
  const box = $("#mapBox");
  const setBig = (on) => { box.classList.toggle("big", on); $("#study")?.classList.toggle("map-open", on); setTimeout(() => mm.fit(), 50); };
  cur.mapHome = () => mm.fit();
  $("#mapHome").onclick = () => mm.fit();
  // 双击空白处也归位（关掉 d3 默认的双击放大）
  try { mm.svg.on("dblclick.zoom", null); } catch {}
  svg.addEventListener("dblclick", (e) => { if (!e.target.closest?.(".markmap-node")) mm.fit(); });
  // 收起：重新按初始层级展开（只留两层），再归位
  $("#mapReset").onclick = () => {
    const big = box.classList.contains("big");
    try { mm.destroy(); } catch {}
    cur.mm = null;
    renderMap(body).then(() => { if (big) $("#mapBig")?.click(); });
  };
  $("#mapBig").onclick = () => setBig(true);
  $("#mapClose").onclick = () => setBig(false);
  cur.closeMap = () => { if (box.classList.contains("big")) { setBig(false); return true; } return false; };
  svg.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href^='#t=']");
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    seek(+a.getAttribute("href").slice(3));
  }, true);
}

function renderMine(body) {
  const r = L(cur.id);
  body.innerHTML = `
    ${r.marks.length ? `<ul class="marks">${r.marks.map((m, i) => `<li>
        <button class="tlink" data-t="${m.t}">${fmt(m.t)}</button>
        <span class="k ${m.kind === "hard" ? "hard" : ""}">${m.kind === "hard" ? "难点" : "书签"}</span>
        <input class="lb" data-mi="${i}" value="${esc(m.label)}" placeholder="写个备注…" style="border:0;background:none;color:inherit;font:inherit;outline:none;min-width:0">
        <button class="x" data-del="${i}" title="删除">删除</button></li>`).join("")}</ul>`
      : `<div class="empty">按 <kbd>B</kbd> 加书签，按 <kbd>H</kbd> 标难点。</div>`}
    <div class="row"><span>笔记</span><span>按 <kbd>N</kbd> 插入当前时间</span>
      <label style="margin-left:auto"><input type="checkbox" id="notePause" ${pref.get("notePause", true) ? "checked" : ""}> 写笔记时暂停</label></div>
    <textarea class="note" id="myNote" placeholder="支持 Markdown：## 标题、- 列表、**加粗**、> 引用、| 表格 |。[12:34] 这样的时间可以点击跳转">${esc(r.note || "")}</textarea>
    <div class="md" id="notePrev"></div>`;
  const ta = $("#myNote");
  const prev = () => { $("#notePrev").innerHTML = r.note?.trim() ? `<div class="prev-t">预览</div>${mdHtml(r.note)}` : ""; };
  prev();
  ta.oninput = () => { r.note = ta.value; save(); prev(); };
  ta.onfocus = () => { if (pref.get("notePause", true) && playing()) { cur.player.pauseVideo(); cur.pausedByNote = true; } };
  $("#notePause").onchange = (e) => pref.set("notePause", e.target.checked);
  body.querySelectorAll("[data-mi]").forEach((inp) => (inp.oninput = () => { r.marks[+inp.dataset.mi].label = inp.value; save(); }));
  body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { r.marks.splice(+b.dataset.del, 1); save(); renderMarks(); renderTab(); }));
}

// ---------- AI 问答 ----------
// S.chat[讲id].msgs = [{id, q, a, vt: 提问时视频位置, at, fav}]
const asking = new Set(); // 正在等回答的 id（只在这次打开页面期间有效）
function qaHtml(m, i) {
  const a = m.a ? mdHtml(m.a)
    : asking.has(m.id) ? `<span class="muted">思考中…（Codex，通常 20〜60 秒）</span>`
    : `<span class="muted">${m.err ? `失败：${esc(m.err)}` : "没有收到回答"}</span> <button class="act" data-retry="${i}">重试</button>`;
  return `<div class="qa" data-mi="${i}">
    <div class="qa-q"><span class="who">问</span><div class="qtext">${esc(m.q)}</div>
      <span class="qa-tools">${m.vt != null ? `<button class="tlink" data-t="${m.vt}">${fmt(m.vt)}</button>` : ""}
      <button class="star ${m.fav ? "on" : ""}" data-fav="${i}" title="收藏（集中在顶栏「收藏」）">${m.fav ? "★" : "☆"}</button>
      <button class="x" data-delq="${i}" title="删除">删除</button></span></div>
    <div class="qa-a md">${a}</div></div>`;
}
function renderAsk(body) {
  const ch = (S.chat[cur.id] ||= { msgs: [] });
  const can = ENV.api != null;
  body.innerHTML = `<div class="chat" id="chat">${ch.msgs.length ? ch.msgs.map(qaHtml).join("")
      : `<div class="empty">看视频时哪里不懂就问。提问时视频前后的字幕和这一讲的笔记会一起交给 AI，回答用中文。<br>点 ☆ 收藏，收藏的问答集中在顶栏「收藏」。</div>`}</div>
    ${can ? `<div class="ask-box"><textarea id="askQ" placeholder="输入问题。Enter 发送，Shift + Enter 换行"></textarea>
      <div class="row"><span>会参考 <b id="askT"></b> 附近的字幕</span><button class="act" id="askGo" style="margin-left:auto">提问</button></div></div>`
      : `<div class="empty">AI 问答要在电脑上开着本地服务（<code>npm start</code>）才能用；以前的问答可以照常看。</div>`}`;
  linkLaws($("#chat"), SUBJECT_LAW[cur.lec.subject]);
  const box = $("#chat"); box.scrollTop = box.scrollHeight;
  body.onclick = (e) => {
    const f = e.target.closest("[data-fav]"), d = e.target.closest("[data-delq]"), r = e.target.closest("[data-retry]");
    if (f) { const m = ch.msgs[+f.dataset.fav]; m.fav = !m.fav; save(); toast(m.fav ? "已收藏" : "已取消收藏"); renderTab(); }
    if (d && confirm("删除这条问答？")) { ch.msgs.splice(+d.dataset.delq, 1); save(); renderTab(); }
    if (r) sendAsk(ch.msgs[+r.dataset.retry]);
  };
  if (!can) return;
  const ta = $("#askQ");
  const showT = () => { const el = $("#askT"); if (el) el.textContent = fmt(now()); };
  showT(); ta.onfocus = () => { showT(); if (pref.get("notePause", true) && playing()) { cur.player.pauseVideo(); cur.pausedByNote = true; } };
  const go = () => {
    const q = ta.value.trim(); if (!q) return;
    const m = { id: Date.now(), q, vt: Math.floor(now()), at: Date.now(), a: "" };
    ch.msgs.push(m); ta.value = ""; save();
    sendAsk(m);
  };
  $("#askGo").onclick = go;
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); go(); } };
}
async function sendAsk(m) {
  const lec = cur.id, ch = S.chat[lec];
  m = ch.msgs.find((x) => x.id === m.id) || m;
  delete m.err; asking.add(m.id);
  const refresh = () => { if (cur?.id === lec && cur.tab === "ask") renderTab(); };
  refresh();
  try {
    const history = ch.msgs.filter((x) => x !== m && x.a).slice(-4).map((x) => ({ q: x.q, a: x.a }));
    const r = await fetch(apiUrl("/api/ask"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecture: lec, t: m.vt, q: m.q, history }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.a) throw new Error(d.error || r.status);
    // 等回答的时候同步可能换掉了 S，按 id 找回这一条再写
    (S.chat[lec]?.msgs.find((x) => x.id === m.id) || m).a = d.a;
  } catch (e) { (S.chat[lec]?.msgs.find((x) => x.id === m.id) || m).err = String(e.message || e); }
  asking.delete(m.id); save(); refresh();
}

// ---------- 论证卡片：打字默写 + 间隔复习 ----------
const cardKey = (lecId, i) => `${lecId}#${i}`;
function C(k) { return (S.cards[k] ||= { due: "", ivl: 0, reps: 0, best: 0 }); }
function dueCards() {
  const t = today();
  return Object.entries(S.cards).filter(([, c]) => c.due && c.due <= t).map(([k]) => k);
}
function grade(k, g, score) {
  const c = C(k);
  c.reps++; c.best = Math.max(c.best || 0, score || 0);
  c.ivl = g === 0 ? 0 : g === 1 ? Math.max(1, Math.round(c.ivl * 1.2)) : c.ivl ? Math.round(c.ivl * 2.5) : 2;
  const d = new Date(); d.setDate(d.getDate() + c.ivl);
  c.due = d.toLocaleDateString("sv-SE");
  save();
}
function renderCardsTab(body) {
  const cards = cur.data?.cards || [];
  if (!cards.length) {
    body.innerHTML = notYet("论证卡片");
    return;
  }
  body.innerHTML = cards.map((c, i) => {
    const st = S.cards[cardKey(cur.id, i)];
    return `<div class="card" data-ci="${i}">
      <div class="q">${c.kind ? `<span class="kind">${esc(c.kind)}</span>` : ""}${esc(c.q)}</div>
      <div class="meta">${c.t != null ? `<button class="tlink" data-t="${c.t}">${fmt(c.t)}</button>` : ""}
        <span>${st?.reps ? `练过 ${st.reps} 次　最高 ${st.best}%　下次 ${st.due.slice(5)}` : "没练过"}</span>
        <span class="sp"></span>
        <button data-recall="${i}">默写</button><button data-show="${i}">看原文</button></div>
      <div class="slot"></div></div>`;
  }).join("");
  body.onclick = (e) => {
    const r = e.target.closest("[data-recall]"), sh = e.target.closest("[data-show]");
    if (r) openRecall(+r.dataset.recall);
    if (sh) {
      const slot = body.querySelector(`[data-ci="${sh.dataset.show}"] .slot`);
      slot.innerHTML = slot.innerHTML ? "" : `<div class="diff">${esc(cards[+sh.dataset.show].a)}</div>`;
      linkLaws(slot, SUBJECT_LAW[cur.lec.subject]);
    }
  };
}
function openRecall(i) {
  const c = cur.data.cards[i];
  const slot = $(`#tabBody [data-ci="${i}"] .slot`);
  slot.innerHTML = `<div class="recall"><textarea placeholder="不看原文，把论证打出来。⌘ + Enter 对照"></textarea>
    <div class="grade"><button data-check>对照原文</button></div></div>`;
  const ta = slot.querySelector("textarea");
  ta.focus();
  const check = () => {
    const { html, score } = diff(c.a, ta.value);
    slot.innerHTML = `<div class="row"><span>还原度 <b style="color:var(--ink)">${score}%</b></span>
      <span><span style="background:var(--miss)">　</span> 漏掉</span><span><span style="background:var(--extra)">　</span> 多写</span></div>
      <div class="diff">${html}</div>
      <div class="grade"><button data-g="0">没记住，今天再来</button><button data-g="1">模糊</button><button data-g="2">记住了</button></div>`;
    slot.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => { grade(cardKey(cur.id, i), +b.dataset.g, score); renderTab(); }));
  };
  slot.querySelector("[data-check]").onclick = check;
  ta.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); check(); } };
}
// 字符级对比（忽略空白和标点）
const norm = (s) => String(s).replace(/[\s、。，．,.・「」『』（）()：:；;]/g, "");
function diff(answer, typed) {
  const a = [...norm(answer)].slice(0, 2000), b = [...norm(typed)].slice(0, 2000);
  const n = a.length, m = b.length, W = m + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  let i = 0, j = 0, out = "", run = "", type = "";
  const flush = () => { if (run) out += type ? `<span class="${type}">${esc(run)}</span>` : esc(run); run = ""; };
  const push = (t, ch) => { if (t !== type) { flush(); type = t; } run += ch; };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { push("", a[i]); i++; j++; }
    else if (j < m && (i >= n || dp[i * W + j + 1] >= dp[(i + 1) * W + j])) { push("extra", b[j]); j++; }
    else { push("miss", a[i]); i++; }
  }
  flush();
  return { html: out, score: n ? Math.round((dp[0] / n) * 100) : 0 };
}

// ---------- ○×题 ----------
// S.quiz["kenpo-013#2"] = { n: 做过次数, ok: 答对次数, last: 最近一次是否答对, at }
const quizKey = (lecId, i) => `${lecId}#${i}`;
function renderQuiz(body) {
  const qs = cur.data?.quiz || [];
  if (!qs.length) { body.innerHTML = cur.data?.quiz ? `<div class="empty">此节没有 ○× 题。</div>` : notYet("○× 题"); cur.quizAnswer = null; return; }
  S.quiz ||= {};
  const onlyWrong = pref.get("quizWrong", false);
  const shown = qs.map((q, i) => i).filter((i) => !onlyWrong || S.quiz[quizKey(cur.id, i)]?.last === false);
  const done = new Set(); // 这次已经答过的
  const ok = () => [...done].filter((i) => cur.quizRes[i]).length;
  cur.quizRes = {};
  body.innerHTML = `<div class="row"><span id="qScore">按 <kbd>O</kbd> / <kbd>X</kbd> 回答当前题</span>
      <label style="margin-left:auto"><input type="checkbox" id="qWrong" ${onlyWrong ? "checked" : ""}> 只看错过的</label>
      <button id="qAgain">重做</button></div>` +
    (shown.length ? shown.map((i) => {
      const q = qs[i], st = S.quiz[quizKey(cur.id, i)];
      return `<div class="card quiz" data-qi="${i}">
        <div class="qq"><span class="qn">${i + 1}</span>${esc(q.q)}</div>
        <div class="meta">${q.t != null ? `<button class="tlink" data-t="${q.t}">${fmt(q.t)}</button>` : ""}
          <span>${st ? `做过 ${st.n} 次，对 ${st.ok} 次${st.last === false ? "，上次错" : ""}` : ""}</span><span class="sp"></span>
          <span class="ox"><button data-ox="1">○</button><button data-ox="0">×</button></span></div>
        <div class="slot"></div></div>`;
    }).join("") : `<div class="empty">没有错过的题。</div>`);
  const answer = (i, v) => {
    if (done.has(i)) return;
    const q = qs[i], right = q.a === v;
    done.add(i); cur.quizRes[i] = right;
    const k = quizKey(cur.id, i), st = (S.quiz[k] ||= { n: 0, ok: 0 });
    st.n++; if (right) st.ok++; st.last = right; st.at = Date.now();
    S.days[today()] = (S.days[today()] || 0) + 20;
    save();
    const el = body.querySelector(`[data-qi="${i}"]`);
    el.classList.add(right ? "right" : "wrong");
    el.querySelector(`[data-ox="${v ? 1 : 0}"]`).classList.add("picked");
    el.querySelector(".slot").innerHTML = `<div class="why"><b>${right ? "正解" : "不正解"}</b>　答案是 ${q.a ? "○" : "×"}。${esc(q.why)}</div>`;
    linkLaws(el.querySelector(".slot"), SUBJECT_LAW[cur.lec.subject]);
    $("#qScore").textContent = `这次 ${ok()} / ${done.size}　（共 ${shown.length} 题）`;
    // 滚到下一题
    const nx = shown.find((j) => !done.has(j));
    if (nx != null) body.querySelector(`[data-qi="${nx}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  cur.quizAnswer = (v) => { const i = shown.find((j) => !done.has(j)); if (i != null) answer(i, v); };
  body.onclick = (e) => {
    const b = e.target.closest("[data-ox]"); if (!b) return;
    answer(+b.closest("[data-qi]").dataset.qi, b.dataset.ox === "1");
  };
  $("#qWrong").onchange = (e) => { pref.set("quizWrong", e.target.checked); renderTab(); };
  $("#qAgain").onclick = () => renderTab();
}

// ---------- 复习页 ----------
function viewReview() {
  const keys = dueCards();
  // ○×题：上次答错的，按讲次汇总
  const wrong = {};
  for (const [k, v] of Object.entries(S.quiz || {})) if (v.last === false) { const id = k.split("#")[0]; wrong[id] = (wrong[id] || 0) + 1; }
  const wrongIds = Object.keys(wrong).filter((id) => LECTURE_BY_ID[id]).sort();
  const wrongHtml = `<div class="section-t">○× 上次答错的</div>` + (wrongIds.length
    ? `<ul class="toc">${wrongIds.map((id) => { const l = LECTURE_BY_ID[id];
        return `<li><a href="#/l/${id}//quiz" data-wrong><span class="n">第${l.n}講</span><span class="tt">${esc(SUBJECT_BY_ID[l.subject].title)}・${esc(l.title)}</span><span class="has">错 ${wrong[id]}</span></a></li>`; }).join("")}</ul>`
    : `<div class="empty">没有。</div>`);
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>复习</h1></div><div class="section-t">今天到期的论证</div>` + (keys.length
    ? `<ul class="toc">${keys.map((k) => {
        const [lid, i] = k.split("#"); const l = LECTURE_BY_ID[lid];
        return l ? `<li><a href="#/l/${lid}"><span class="n">第${l.n}講</span><span class="tt">${esc(SUBJECT_BY_ID[l.subject].title)}・${esc(l.title)}</span><span class="has">卡 ${+i + 1}</span></a></li>` : "";
      }).join("")}</ul>`
    : `<div class="empty">今天没有。</div>`) + wrongHtml;
  app.querySelectorAll("[data-wrong]").forEach((a) => (a.onclick = () => pref.set("quizWrong", true)));
}

// ---------- 同步与设置 ----------
function syncTip() {
  if (!ghCfg()) return "还没有填写令牌，学习记录只保存在这台设备";
  if (sync.state === "syncing") return "同步中…";
  if (sync.state === "error") return `同步失败：${sync.error}`;
  if (sync.state === "ok") return `已同步 ${new Date(sync.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  return "已填写令牌";
}
function viewSync() {
  const c = ghCfg();
  const lec = Object.values(S.lectures), done = lec.filter((l) => l.done).length;
  const cards = Object.values(S.cards).filter((x) => x.reps).length, quiz = Object.values(S.quiz).length;
  const bySubj = (sid) => {
    const p = `${sid}-`;
    const n = (o) => Object.keys(o).filter((k) => k.startsWith(p)).length;
    return { lec: n(S.lectures), done: Object.entries(S.lectures).filter(([k, v]) => k.startsWith(p) && v.done).length, cards: n(S.cards), quiz: n(S.quiz) };
  };
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>同步与设置</h1></div>
    <table class="kv">
      <tr><th>这台设备</th><td>${ENV.local ? "电脑 · 本地版（AI 批改、搜索可用）" : ENV.api != null ? "线上版 · 借本机服务（AI 批改、搜索可用）" : "线上版（看视频、笔记、复习；AI 批改和搜索要在电脑上开本地服务）"}</td></tr>
      <tr><th>同步</th><td>${esc(syncTip())} ${c ? `<button class="act" id="syncNow">立即同步</button>` : ""}</td></tr>
      <tr><th>学习记录</th><td>看过 ${lec.length} 讲（学完 ${done}）· 论证练过 ${cards} 张 · ○× 做过 ${quiz} 题 · 学习 ${Object.keys(S.days).length} 天</td></tr>
    </table>
    <div class="section-t">GitHub 令牌</div>
    <p class="small muted">填一次，这台设备就能读取字幕和笔记（私有仓库 logitlong/shiho-study），学习记录在所有设备之间自动同步。<br>
      令牌在 GitHub → Settings → Developer settings → Fine-grained tokens 生成：Repository access 选 <b>shiho-study</b>，Permissions → Contents 选 <b>Read and write</b>。宅建用的令牌也可以编辑一下，把这个仓库加进去。</p>
    <div class="row"><input id="ghToken" class="tok" type="password" autocomplete="off" placeholder="${c ? "令牌已保存，要换就重新填" : "github_pat_…"}">
      <button class="act" id="ghSave">${c ? "更换" : "连接"}</button>${c ? `<button class="link" id="ghOut">从这台设备删除令牌</button>` : ""}</div>
    <div class="small" id="ghMsg"></div>
    ${ENV.local ? "" : `<p class="small"><button class="link" id="clearCache">清除本机内容缓存</button></p>`}

    <div class="section-t">重置学习进度（重学）</div>
    <p class="small muted">清空看到哪里、学完标记、论证卡片的复习计划、○× 做题记录${c ? "，所有设备一起清空" : ""}。笔记、导图等内容不受影响；学习热力图保留；答案练习的作答记录保留。</p>
    <label class="small"><input type="checkbox" id="keepNotes" checked> 保留我的书签、自己写的笔记和 AI 问答</label>
    <table class="list-table reset-t">${SUBJECTS.map((s) => { const b = bySubj(s.id); return `<tr><td class="nm2">${s.title}</td>
      <td class="num">看过 ${b.lec} 讲 · 学完 ${b.done} · 论证 ${b.cards} · ○× ${b.quiz}</td>
      <td class="num"><button class="danger" data-reset="${s.id}">重置${s.title}</button></td></tr>`; }).join("")}
      <tr><td class="nm2"><b>全部</b></td><td></td><td class="num"><button class="danger" data-reset="">全部重置</button></td></tr></table>`;
  $("#ghSave").onclick = async () => {
    const token = $("#ghToken").value.trim();
    if (!token) return ($("#ghMsg").textContent = "请先填写令牌");
    const old = c;
    setGhCfg({ token });
    $("#ghMsg").textContent = "连接中…";
    try {
      await testToken();
      $("#ghMsg").textContent = "已连接，正在同步…";
      await doSync(); await loadInventory(); renderSyncBtn();
      viewSync();
    } catch (e) { setGhCfg(old); $("#ghMsg").textContent = e.message; }
  };
  if ($("#ghOut")) $("#ghOut").onclick = () => { if (confirm("从这台设备删除令牌？（仓库里的记录不受影响）")) { setGhCfg(null); renderSyncBtn(); viewSync(); } };
  if ($("#syncNow")) $("#syncNow").onclick = async () => { await doSync(); viewSync(); };
  if ($("#clearCache")) $("#clearCache").onclick = async () => { await clearContentCache(); toast("已清除"); };
  app.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = async () => {
    const sid = b.dataset.reset, name = sid ? SUBJECT_BY_ID[sid].title : "全部科目";
    if (!confirm(`确定重置「${name}」的学习进度，从头开始？`)) return;
    if (prompt(`这一步不能撤销。请输入「重置」确认：`) !== "重置") return;
    stamp(S);
    prepareReset(S, $("#keepNotes").checked);
    resetState(S, sid, $("#keepNotes").checked);
    stampBaseline(S); stamp(S);
    writeLocalState(S);
    if (ghCfg()) await doSync();
    toast(`已重置：${name}`);
    viewSync();
  }));
}
function viewNeedLocal(what) {
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>${what}</h1></div>
    <div class="empty">${what}要用到电脑上的本地服务（AI 批改用的是电脑上的 Codex）。<br>
    在电脑上运行 <code>npm start</code> 后，打开 <a class="link" href="http://localhost:4180/">http://localhost:4180</a>；
    或者在这台电脑上开着本地服务时刷新这个页面（浏览器问「允许访问本地网络」时点允许）。</div>`;
}

// ---------- 路由 ----------
function route() {
  cleanup();
  const [, r, id, a2, a3] = location.hash.split("/");
  window.scrollTo(0, 0);
  document.querySelectorAll(".top nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#/${r || ""}`));
  if (r === "s") return viewSubject(id);
  if (r === "l") return viewLecture(id, a2 ? +a2 : null, a3);
  if (r === "review") return viewReview();
  if (r === "practice") return viewPractice();
  if (r === "p") return viewProblem(id);
  if (r === "a") return viewAnswer(id);
  if (r === "search") return viewSearch(decodeURIComponent(id || ""), a2 || "");
  if (r === "cases") return viewCases();
  if (r === "guide") return viewGuide();
  if (r === "laws") return viewLaws(id, a2);
  if (r === "sync") return viewSync();
  if (r === "fav") return viewFav(id || "qa");
  if (["practice", "p", "a", "search"].includes(r) && ENV.api == null) return viewNeedLocal(r === "search" ? "搜索" : "答案练习");
  return viewHome();
}
window.addEventListener("hashchange", async () => { await loadInventory(); route(); });
// 讲次页里任何时间戳（字幕行、笔记、书签、卡片、判例）点一下就跳转
app.addEventListener("click", (e) => {
  if (e.target.closest("#rail")) return;
  const b = e.target.closest("[data-t]");
  if (b && cur) seek(+b.dataset.t);
});
initPages({ app, $, esc, fmt, mdHtml, toast, pref, save, today, state: () => S, inv: () => INV, onLeave: (f) => leaveFns.push(f) });
// 同步按钮
function renderSyncBtn() {
  const b = $("#syncBtn"); if (!b) return;
  const st = !ghCfg() ? "" : { syncing: "ing", ok: "ok", error: "err" }[sync.state] || "";
  b.className = `tool sync-btn ${st}`;
  b.title = syncTip();
}
sync.onChange = () => { renderSyncBtn(); if (location.hash === "#/sync" && sync.state !== "syncing") viewSync(); };
// 顶栏：查条文
$("#lawQ").onkeydown = (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim(); if (!v) return;
  const def = cur ? SUBJECT_LAW[cur.lec.subject] : "321CONSTITUTION";
  // 「民法94」「21条1項」这种 → 条文弹窗；其他 → 全文搜索
  if (/\d/.test(v) && lookupLaw(v, def)) { e.target.blur(); return; }
  e.target.blur();
  location.hash = `#/search/${encodeURIComponent(v)}/`;
};
await detectEnv();
if (!ENV.local) probeLocal();
await Promise.all([loadState(), loadInventory()]);
renderSyncBtn();
route();
if (ghCfg()) doSync();
setInterval(() => { if (ghCfg() && document.visibilityState === "visible") doSync(); }, 180_000);
// 离开 / 切到后台时马上同步一次
document.addEventListener("visibilitychange", () => { if (ghCfg() && document.visibilityState === "hidden") { stamp(S); writeLocalState(S); doSync(); } });
