// 讲次页以外的页面：答案练习（题目 / 作答 / 批改）、全文搜索、判例索引
import { SUBJECTS, LECTURE_BY_ID, SUBJECT_BY_ID } from "./toc.js?v=4830679264";
import { linkLaws, SUBJECT_LAW, LAWS, loadLaw, artKeys } from "./laws.js?v=4830679264";
import { ENV, apiUrl, loadCasesIndex } from "./store.js?v=4830679264";

let X; // app.js 传进来的共用工具：app, $, esc, fmt, mdHtml, toast, pref, save, state(), inv(), onLeave
export const initPages = (ctx) => (X = ctx);

const api = async (url, opt = {}) => {
  const r = await fetch(apiUrl(url), { ...opt, headers: { "Content-Type": "application/json" }, body: opt.body && JSON.stringify(opt.body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || r.status);
  return d;
};
const dt = (ms) => new Date(ms).toLocaleString("sv-SE").slice(0, 16);
const subjSelect = (name, val = "") => `<select name="${name}">${SUBJECTS.map((s) => `<option value="${s.id}" ${s.id === val ? "selected" : ""}>${s.title}</option>`).join("")}</select>`;
const subjTitle = (id) => SUBJECT_BY_ID[id]?.title || "";
const mins = (sec) => `${Math.floor((sec || 0) / 60)} 分`;

// 答案用紙换算：1 行 30 字（半角算半个），1 页 23 行
export const PER_LINE = 30, PER_PAGE = 23;
const cw = (ch) => (/[\x20-\x7e｡-ﾟ]/.test(ch) ? 0.5 : 1);
export function countLines(text) {
  let lines = 0;
  for (const para of String(text).split("\n")) {
    let w = 0, l = 1;
    for (const ch of para) { const c = cw(ch); if (w + c > PER_LINE) { l++; w = c; } else w += c; }
    lines += l;
  }
  return text ? lines : 0;
}
const charCount = (t) => [...String(t).replace(/\s/g, "")].length;

// 定时刷新（离开页面自动停）
function every(ms, fn) { const h = setInterval(fn, ms); X.onLeave(() => clearInterval(h)); return h; }

// =====================================================================
// 答案练习首页
// =====================================================================
export async function viewPractice() {
  const { app, esc } = X;
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>答案练习</h1>
    <span class="muted small">CBT 打字（答案用紙换算 23 行 × 30 字）或 手写拍照，交给 Codex 批改</span></div>
    <div class="row"><button class="act" id="newP">粘贴题目</button><button class="act" id="genP">AI 出题（按讲次范围）</button></div>
    <div id="formBox"></div>
    <div id="jobBox"></div>
    <div class="section-t">题目</div><div id="pList"><div class="empty">读取中…</div></div>
    <div class="section-t">作答记录</div><div id="aList"></div>`;
  let problems = [], answers = [];
  const load = async () => {
    [problems, answers] = await Promise.all([api("/api/problems"), api("/api/answers")]);
    const best = {}, cnt = {};
    for (const a of answers) { cnt[a.problem] = (cnt[a.problem] || 0) + 1; if (a.score != null) best[a.problem] = Math.max(best[a.problem] ?? 0, a.score); }
    X.$("#pList").innerHTML = problems.length ? `<table class="list-table">${problems.map((p) => `<tr>
        <td class="sj">${esc(subjTitle(p.subject))}</td>
        <td><a href="#/p/${p.id}">${esc(p.title)}</a> ${p.source === "ai" ? `<span class="tag">AI</span>` : ""}</td>
        <td class="num">${p.minutes} 分</td><td class="num">${cnt[p.id] ? `写过 ${cnt[p.id]} 次` : ""}</td>
        <td class="num">${best[p.id] != null ? `最高 ${best[p.id]}` : ""}</td></tr>`).join("")}</table>`
      : `<div class="empty">还没有题目。可以粘贴过去问（筑波的入试题、予備試験の論文过去问），或者让 AI 按学过的讲次出题。</div>`;
    const P = Object.fromEntries(problems.map((p) => [p.id, p]));
    X.$("#aList").innerHTML = answers.length ? `<table class="list-table">${answers.map((a) => `<tr>
        <td class="num" style="text-align:left">${dt(a.created)}</td>
        <td><a href="#/a/${a.id}">${esc(P[a.problem]?.title || "（题目已删）")}</a></td>
        <td class="num">${a.mode === "hand" ? `手写 ${a.pages} 张` : `打字 ${a.chars} 字`}</td>
        <td class="num">${mins(a.sec)}</td>
        <td class="num">${a.grading ? "批改中…" : a.score != null ? `<b>${a.score}</b> 分 ${esc(a.gradeL)}` : "未批改"}</td></tr>`).join("")}</table>`
      : `<div class="empty">还没有。</div>`;
  };
  const loadJobs = async () => {
    const js = await api("/api/jobs").catch(() => []);
    const box = X.$("#jobBox"); if (!box) return;
    box.innerHTML = js.filter((j) => j.kind === "problem").map((j) => `<div class="resume small">
      <span>${esc(j.label)}</span>
      <span class="muted">${j.status === "running" ? `生成中… ${Math.round((Date.now() - j.started) / 60000)} 分（通常 2–5 分钟）` : j.status === "done" ? "完成" : `失败：${esc(j.error)}`}</span>
      ${j.status === "done" ? `<a class="act" href="#/p/${j.result.problem}">去做</a>` : ""}</div>`).join("");
    if (js.some((j) => j.kind === "problem" && j.status === "done" && !problems.find((p) => p.id === j.result.problem))) load();
  };
  await load(); loadJobs();
  every(5000, loadJobs);

  X.$("#newP").onclick = () => {
    X.$("#formBox").innerHTML = `<form class="pform" id="pf">
      <div class="row">${subjSelect("subject")}<input name="title" placeholder="题名（例：筑波 2024 憲法）" style="flex:1">
        <label>时间 <input name="minutes" type="number" value="60" min="5" style="width:60px"> 分</label>
        <label>上限 <input name="pages" type="number" value="4" min="1" style="width:46px"> 页</label></div>
      <textarea name="text" placeholder="问题文（事案 + 〔設問〕）" style="min-height:220px"></textarea>
      <textarea name="key" placeholder="（可选）出题趣旨 / 采点实感 / 参考答案。作答前不显示，批改时 AI 会参考。" style="min-height:90px;margin-top:8px"></textarea>
      <div class="row" style="margin-top:8px"><button class="act">保存</button><button type="button" class="link" id="cancel">取消</button></div></form>`;
    X.$("#cancel").onclick = () => (X.$("#formBox").innerHTML = "");
    X.$("#pf").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      try { const p = await api("/api/problems", { method: "POST", body: f }); location.hash = `#/p/${p.id}`; } catch (err) { X.toast(err.message); }
    };
  };
  X.$("#genP").onclick = () => {
    const notes = new Set(X.inv().notes);
    const opts = (sid) => SUBJECT_BY_ID[sid].lectures.filter((l) => notes.has(l.id));
    X.$("#formBox").innerHTML = `<form class="pform" id="gf">
      <div class="row">${subjSelect("subject", SUBJECTS.find((s) => opts(s.id).length)?.id)}
        <label>从 <select name="from"></select></label><label>到 <select name="to"></select></label>
        <label>时间 <input name="minutes" type="number" value="60" min="10" style="width:60px"> 分</label>
        <button class="act">开始出题</button><button type="button" class="link" id="cancel">取消</button></div>
      <p class="muted small">用这些讲的日文笔记和论证卡片，让 Codex 出一道事例问题（附出题趣旨，作答后才显示）。只能选已经生成笔记的讲。</p></form>`;
    const f = X.$("#gf");
    const fill = () => {
      const ls = opts(f.subject.value);
      const o = ls.map((l) => `<option value="${l.n}">第${l.n}講 ${esc(l.title).slice(0, 18)}</option>`).join("") || `<option value="">（这个科目还没有笔记）</option>`;
      f.from.innerHTML = o; f.to.innerHTML = o;
      if (ls.length) f.to.value = ls[Math.min(ls.length - 1, 4)].n;
    };
    fill(); f.subject.onchange = fill;
    X.$("#cancel").onclick = () => (X.$("#formBox").innerHTML = "");
    f.onsubmit = async (e) => {
      e.preventDefault();
      const a = +f.from.value, b = +f.to.value;
      const lectures = opts(f.subject.value).filter((l) => l.n >= Math.min(a, b) && l.n <= Math.max(a, b)).map((l) => l.id);
      if (lectures.length > 12) return X.toast("一次最多 12 讲");
      try { await api("/api/problems/gen", { method: "POST", body: { subject: f.subject.value, lectures, minutes: +f.minutes.value } });
        X.$("#formBox").innerHTML = ""; loadJobs(); } catch (err) { X.toast(err.message); }
    };
  };
}

// =====================================================================
// 作答页：CBT 打字 / 手写拍照
// =====================================================================
export async function viewProblem(pid) {
  const { app, esc, $ } = X;
  let p;
  try { p = await api(`/api/problems/${pid}`); } catch { app.innerHTML = `<div class="empty">没有这道题。<a class="link" href="#/practice">返回</a></div>`; return; }
  const S = X.state();
  const dr = ((S.drafts ||= {})[pid] ||= { text: "", memo: "", sec: 0, mode: "cbt" });
  let images = []; // 手写照片 dataURL（不存草稿，太大）
  let running = false, t0 = 0;
  app.innerHTML = `
    <div class="lec-head"><a class="link" href="#/practice">← 答案练习</a><span class="no">${esc(subjTitle(p.subject))}</span><h1>${esc(p.title)}</h1>
      <button class="link" id="delP">删除这题</button></div>
    <div class="practice">
      <div class="pr-left">
        <div class="tabs" id="ptabs"><button data-pt="q" class="on">问题</button><button data-pt="memo">答案構成メモ</button></div>
        <div class="pr-q" id="pq">${esc(p.text)}</div>
        <textarea class="pr-memo" id="memo" hidden placeholder="先在这里写构成：論点 → 規範 → あてはめ → 結論。不计入答案，批改时作参考。">${esc(dr.memo)}</textarea>
      </div>
      <div class="pr-right">
        <div class="pr-bar">
          <span class="seg2" id="modeSw"><button data-mode="cbt">打字（CBT）</button><button data-mode="hand">手写拍照</button></span>
          <span class="timer" id="timer">0:00</span><span class="muted small">/ ${p.minutes}:00</span>
          <button id="tBtn">开始计时</button><button class="muted small" id="tReset">归零</button>
          <span class="sp"></span>
          <button class="act" id="submit">交卷并批改</button>
        </div>
        <div id="ansArea"></div>
      </div>
    </div>
    <div class="section-t">这题的作答记录</div><div id="hist"></div>`;
  linkLaws($("#pq"), SUBJECT_LAW[p.subject]);

  // 问题 / 构成切换
  $("#ptabs").onclick = (e) => {
    const t = e.target.closest("[data-pt]")?.dataset.pt; if (!t) return;
    $("#ptabs").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.pt === t));
    $("#pq").hidden = t !== "q"; $("#memo").hidden = t !== "memo";
    if (t === "memo") $("#memo").focus();
  };
  $("#memo").oninput = (e) => { dr.memo = e.target.value; X.save(); };

  // 计时
  const elapsed = () => dr.sec + (running ? (Date.now() - t0) / 1000 : 0);
  const showT = () => { const el = $("#timer"); if (!el) return; const s = elapsed(); el.textContent = X.fmt(s); el.classList.toggle("over", s > p.minutes * 60); };
  const start = () => { if (running) return; running = true; t0 = Date.now(); $("#tBtn").textContent = "暂停"; };
  const pause = () => { if (!running) return; dr.sec = elapsed(); running = false; $("#tBtn").textContent = "继续"; X.save(); };
  $("#tBtn").onclick = () => (running ? pause() : start());
  $("#tReset").onclick = () => { if (confirm("计时归零？")) { running = false; dr.sec = 0; $("#tBtn").textContent = "开始计时"; X.save(); showT(); } };
  if (dr.sec) $("#tBtn").textContent = "继续";
  every(500, showT); showT();
  X.onLeave(() => { if (running) { dr.sec = elapsed(); X.save(); } });

  // 两种作答方式
  const renderMode = () => {
    $("#modeSw").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === dr.mode));
    if (dr.mode === "cbt") {
      $("#ansArea").innerHTML = `<div class="cbt-stat" id="stat"></div>
        <div class="cbt-wrap"><textarea class="cbt" id="ans" spellcheck="false" placeholder="在这里打答案。Tab = 全角空格（段首缩进）。开始打字会自动计时。">${esc(dr.text)}</textarea></div>`;
      const ta = $("#ans");
      const grow = () => { ta.style.height = "auto"; ta.style.height = `${Math.max(ta.scrollHeight, 520)}px`; };
      const stat = () => {
        const lines = countLines(ta.value), pages = lines / PER_PAGE;
        $("#stat").innerHTML = `<span>${charCount(ta.value).toLocaleString()} 字</span><span>${lines} 行</span>
          <span class="${pages > p.pages ? "over" : ""}">约 ${pages.toFixed(1)} / ${p.pages} 页</span>
          <span class="muted">（1 行 30 字、1 页 23 行；红线是换页）</span>`;
      };
      ta.oninput = () => { dr.text = ta.value; X.save(); stat(); grow(); if (!running && ta.value) start(); };
      ta.onkeydown = (e) => {
        if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); document.execCommand("insertText", false, "　"); }
      };
      stat(); setTimeout(grow, 0); ta.focus();
    } else {
      $("#ansArea").innerHTML = `<div class="hand">
        <p class="muted small">在答案用纸（或 A4 横线纸）上手写，按顺序拍照上传。字迹越清楚，转写越准。照片会缩到 2000px 以内再保存。</p>
        <label class="act" style="cursor:pointer">选择 / 拍摄照片<input type="file" id="imgIn" accept="image/*" multiple hidden></label>
        <div class="thumbs" id="thumbs"></div></div>`;
      $("#imgIn").onchange = async (e) => {
        for (const f of e.target.files) images.push(await shrink(f));
        e.target.value = ""; thumbs();
      };
      thumbs();
    }
  };
  const thumbs = () => {
    const box = $("#thumbs"); if (!box) return;
    box.innerHTML = images.map((src, i) => `<figure><img src="${src}"><figcaption>第 ${i + 1} 页
      <button data-mv="${i}" data-d="-1" ${i ? "" : "disabled"}>←</button><button data-mv="${i}" data-d="1" ${i < images.length - 1 ? "" : "disabled"}>→</button>
      <button data-rm="${i}">删除</button></figcaption></figure>`).join("");
    box.onclick = (e) => {
      const mv = e.target.closest("[data-mv]"), rm = e.target.closest("[data-rm]");
      if (mv) { const i = +mv.dataset.mv, j = i + +mv.dataset.d; [images[i], images[j]] = [images[j], images[i]]; thumbs(); }
      if (rm) { images.splice(+rm.dataset.rm, 1); thumbs(); }
    };
  };
  $("#modeSw").onclick = (e) => { const m = e.target.closest("[data-mode]")?.dataset.mode; if (m && m !== dr.mode) { dr.mode = m; X.save(); renderMode(); } };
  renderMode();

  $("#submit").onclick = async () => {
    if (dr.mode === "cbt" && !dr.text.trim()) return X.toast("答案是空的");
    if (dr.mode === "hand" && !images.length) return X.toast("还没有照片");
    if (!confirm("交卷？交卷后会马上开始 AI 批改（2–5 分钟）。")) return;
    pause();
    $("#submit").disabled = true; $("#submit").textContent = "上传中…";
    try {
      const a = await api("/api/answers", { method: "POST", body: { problem: pid, mode: dr.mode, text: dr.mode === "cbt" ? dr.text : "", memo: dr.memo, sec: Math.round(dr.sec), images: dr.mode === "hand" ? images : [] } });
      await api(`/api/answers/${a.id}/grade`, { method: "POST" });
      const S2 = X.state(); S2.days[X.today()] = (S2.days[X.today()] || 0) + Math.round(dr.sec);
      S2.drafts[pid] = { text: "", memo: "", sec: 0, mode: dr.mode }; X.save(); // 不删除，清空：删除的话别的设备同步时会把草稿带回来
      location.hash = `#/a/${a.id}`;
    } catch (err) { X.toast(err.message); $("#submit").disabled = false; $("#submit").textContent = "交卷并批改"; }
  };
  $("#delP").onclick = async () => { if (confirm("删除这道题？（作答记录保留）")) { await api(`/api/problems/${pid}`, { method: "DELETE" }); location.hash = "#/practice"; } };

  const hist = (await api("/api/answers")).filter((a) => a.problem === pid);
  $("#hist").innerHTML = hist.length ? `<table class="list-table">${hist.map((a) => `<tr><td class="num" style="text-align:left">${dt(a.created)}</td>
      <td><a href="#/a/${a.id}">${a.mode === "hand" ? "手写" : "打字"}</a></td><td class="num">${mins(a.sec)}</td>
      <td class="num">${a.score != null ? `${a.score} 分 ${esc(a.gradeL)}` : a.grading ? "批改中…" : "未批改"}</td></tr>`).join("")}</table>` : `<div class="empty">第一次做。</div>`;
}

// 照片缩小成 JPEG
function shrink(file, max = 2000) {
  return new Promise((ok, bad) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = bad;
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================================
// 批改结果
// =====================================================================
export async function viewAnswer(aid) {
  const { app, esc, $, mdHtml } = X;
  let a;
  try { a = await api(`/api/answers/${aid}`); } catch { app.innerHTML = `<div class="empty">没有这份答案。<a class="link" href="#/practice">返回</a></div>`; return; }
  const p = await api(`/api/problems/${a.problem}`).catch(() => ({ title: "（题目已删）", text: "", key: "" }));
  const g = a.grade;
  // 我的答案里，被点评的句子标出来
  let mine = esc(a.mode === "hand" ? g?.transcript || "" : a.text);
  (g?.comments || []).forEach((c, i) => {
    const q = esc(String(c.quote || "").trim());
    if (q.length >= 4 && mine.includes(q)) mine = mine.replace(q, `<mark data-ci="${i}" title="${esc(c.comment)}">${q}</mark><sup>${i + 1}</sup>`);
  });
  const bar = (s) => `<span class="bar5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= s ? "on" : ""}"></i>`).join("")}</span>`;
  const list = (t, arr) => arr?.length ? `<h3>${t}</h3><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  app.innerHTML = `
    <div class="lec-head"><a class="link" href="#/practice">← 答案练习</a><span class="no">${esc(subjTitle(p.subject))}</span>
      <h1>${esc(p.title)}</h1><span class="muted small">${dt(a.created)}　${a.mode === "hand" ? "手写" : "打字"}　用时 ${mins(a.sec)}</span>
      <a class="link" href="#/p/${a.problem}">再写一次</a><button class="link" id="delA">删除</button></div>
    <details class="pr-detail"><summary>问题文</summary><div class="pr-q" id="aq">${esc(p.text)}</div></details>
    <div class="ans-grid">
      <div>
        <div class="section-t">我的答案${a.mode === "hand" ? "（照片 + AI 转写）" : `　${charCount(a.text)} 字 · 约 ${(countLines(a.text) / PER_PAGE).toFixed(1)} 页`}</div>
        ${a.mode === "hand" ? `<div class="thumbs big">${a.images.map((f, i) => `<figure><a href="${ENV.api}/api/answer-img/${f}" target="_blank"><img src="${ENV.api}/api/answer-img/${f}"></a><figcaption>第 ${i + 1} 页</figcaption></figure>`).join("")}</div>` : ""}
        ${mine ? `<div class="my-ans">${mine}</div>` : ""}
        ${a.memo ? `<details><summary class="muted small">答案構成メモ</summary><div class="my-ans">${esc(a.memo)}</div></details>` : ""}
        <div class="section-t">复盘（自己写）</div>
        <textarea id="review" placeholder="这次哪里没想到？下次怎么写？" style="min-height:120px">${esc(a.review || "")}</textarea>
      </div>
      <div id="gradeBox">${g ? `
        <div class="score"><b>${g.score ?? "-"}</b><span>/ 100</span><em>${esc(g.grade || "")}</em></div>
        <table class="rubric">${(g.rubric || []).map((r) => `<tr><th>${esc(r.k)}</th><td>${bar(+r.s || 0)}</td><td>${esc(r.c || "")}</td></tr>`).join("")}</table>
        ${g.zh ? `<div class="zh-sum">${esc(g.zh)}</div>` : ""}
        <div class="md g-lists">${list("好的地方", g.good)}${list("问题", g.bad)}${list("漏掉的论点", g.missed)}</div>
        ${g.comments?.length ? `<h3 class="gh">逐句点评</h3><ol class="g-comments">${g.comments.map((c) => `<li><q>${esc(c.quote)}</q><div>${esc(c.comment)}</div></li>`).join("")}</ol>` : ""}
        ${g.outline ? `<h3 class="gh">参考构成</h3><div class="md ja">${mdHtml(g.outline)}</div>` : ""}
        ${g.sample ? `<details class="pr-detail"><summary>参考答案</summary><div class="my-ans">${esc(g.sample)}</div></details>` : ""}
        ${p.key ? `<details class="pr-detail"><summary>出题趣旨 / 采点要点</summary><div class="md ja">${mdHtml(p.key)}</div></details>` : ""}
        <p class="muted small">AI 批改只作参考：规范和判例要和教科书、百選核对。<button class="link" id="regrade">重新批改</button></p>`
      : a.grading ? `<div class="empty">批改中…（Codex 通常 2–5 分钟，可以先去做别的，回来再看）</div>`
      : a.gradeError ? `<div class="empty">批改失败：${esc(a.gradeError)}<br><button class="act" id="regrade">再试一次</button></div>`
      : `<div class="empty">还没批改。<button class="act" id="regrade">AI 批改</button></div>`}
      </div>
    </div>`;
  linkLaws($("#aq"), SUBJECT_LAW[p.subject]);
  linkLaws($("#gradeBox"), SUBJECT_LAW[p.subject]);
  let rt;
  $("#review").oninput = (e) => { clearTimeout(rt); rt = setTimeout(() => api(`/api/answers/${aid}`, { method: "PUT", body: { review: e.target.value } }), 600); };
  X.onLeave(() => clearTimeout(rt));
  const rg = $("#regrade");
  if (rg) rg.onclick = async () => {
    if (g && !confirm("重新批改会覆盖这次结果。继续？")) return;
    try { await api(`/api/answers/${aid}/grade`, { method: "POST" }); viewAnswer(aid); } catch (e) { X.toast(e.message); }
  };
  $("#delA").onclick = async () => { if (confirm("删除这份答案（含照片）？")) { await api(`/api/answers/${aid}`, { method: "DELETE" }); location.hash = "#/practice"; } };
  if (a.grading) {
    const started = Date.now();
    const h = every(5000, async () => {
      const b = await api(`/api/answers/${aid}`).catch(() => null);
      if (b && !b.grading) { clearInterval(h); if (location.hash === `#/a/${aid}`) viewAnswer(aid); }
      else if (Date.now() - started > 20 * 60e3) clearInterval(h);
    });
  }
}

// =====================================================================
// 全文搜索
// =====================================================================
const KIND = { subs: ["字幕", ""], ja: ["日文笔记", "ja"], zh: ["中文笔记", "zh"], cards: ["论证", "cards"], cases: ["判例", "cases"], quiz: ["○×", "quiz"] };
export async function viewSearch(q = "", subj = "") {
  const { app, esc, $ } = X;
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>搜索</h1></div>
    <form class="row search-f" id="sf"><input name="q" value="${esc(q)}" placeholder="字幕、笔记、论证、判例、○×题里搜（例：目的効果基準、表見代理）" autofocus>
      <select name="subj"><option value="">全部科目</option>${SUBJECTS.map((s) => `<option value="${s.id}" ${s.id === subj ? "selected" : ""}>${s.title}</option>`).join("")}</select>
      <button class="act">搜索</button></form><div id="sres"></div>`;
  $("#sf").onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    location.hash = `#/search/${encodeURIComponent(f.get("q").trim())}/${f.get("subj")}`;
  };
  if (!q) return;
  $("#sres").innerHTML = `<div class="empty">搜索中…</div>`;
  const r = await api(`/api/search?q=${encodeURIComponent(q)}&subj=${subj}`);
  const by = {};
  for (const h of r.hits) (by[h.id] ||= []).push(h);
  const hl = (s) => esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`);
  $("#sres").innerHTML = r.hits.length ? `<p class="muted small">${r.hits.length}${r.more ? "+" : ""} 处，${Object.keys(by).length} 讲</p>` +
    Object.entries(by).map(([id, hs]) => {
      const l = LECTURE_BY_ID[id];
      return `<div class="s-lec"><div class="s-h"><a href="#/l/${id}">${esc(subjTitle(l.subject))}　第${l.n}講　${esc(l.title)}</a><span class="muted small">${hs.length}</span></div>
        ${hs.slice(0, 12).map((h) => `<a class="s-hit" href="#/l/${id}/${h.t ?? ""}/${KIND[h.kind][1]}"><span class="k">${KIND[h.kind][0]}</span><span class="t">${h.t != null ? X.fmt(h.t) : ""}</span><span>${hl(h.text)}</span></a>`).join("")}
        ${hs.length > 12 ? `<div class="muted small">…还有 ${hs.length - 12} 处</div>` : ""}</div>`;
    }).join("") : `<div class="empty">没有「${esc(q)}」。</div>`;
}

// =====================================================================
// 判例索引
// =====================================================================
export async function viewCases(q0 = "") {
  const { app, esc, $, mdHtml } = X;
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>判例索引</h1><span class="muted small" id="cn"></span></div>
    <div class="row search-f"><input id="cq" value="${esc(q0)}" placeholder="筛选（事件名、裁判所、内容）"></div><div id="clist"><div class="empty">读取中…</div></div>`;
  let all;
  try { all = await loadCasesIndex(); } catch (e) { $("#clist").innerHTML = `<div class="empty">${esc(e.message)}　<a class="link" href="#/sync">去填写令牌</a></div>`; return; }
  // 同名判例合并，列出讲到它的所有讲次
  const by = new Map();
  for (const c of all) {
    const k = c.name.replace(/\s/g, "");
    if (!by.has(k)) by.set(k, { ...c, refs: [] });
    by.get(k).refs.push({ id: c.id, t: c.t });
  }
  const items = [...by.values()];
  const draw = () => {
    const q = $("#cq").value.trim();
    const hit = items.filter((c) => !q || `${c.name}${c.court}${c.point}`.includes(q));
    $("#cn").textContent = `${hit.length} 件`;
    $("#clist").innerHTML = SUBJECTS.map((s) => {
      const cs = hit.filter((c) => LECTURE_BY_ID[c.refs[0].id].subject === s.id);
      if (!cs.length) return "";
      return `<div class="section-t">${s.title}（${cs.length}）</div>` + cs.map((c) => `<details class="case-i"><summary><b>${esc(c.name)}</b>
          <span class="muted small">${esc(c.court)}</span>
          <span class="refs">${c.refs.map((r) => { const l = LECTURE_BY_ID[r.id]; return `<a class="link" href="#/l/${r.id}/${r.t ?? ""}/cases">第${l.n}講${r.t != null ? " " + X.fmt(r.t) : ""}</a>`; }).join("")}</span></summary>
          <div class="md ja" data-subj="${s.id}">${mdHtml(c.point)}</div></details>`).join("");
    }).join("") || `<div class="empty">没有。</div>`;
    $("#clist").querySelectorAll(".md[data-subj]").forEach((el) => linkLaws(el, SUBJECT_LAW[el.dataset.subj]));
  };
  $("#cq").oninput = draw;
  draw();
}

// =====================================================================
// 学习指引
// =====================================================================
const GUIDE = [
  ["先看这里：一天怎么学", `
<ol class="steps">
  <li><b>打开首页</b>，看「每日计划」：今天该看多少分钟（按剩余视频 ÷ 离入试的天数算，最后 60 天留给做题）。点「接着看」回到上次的位置。</li>
  <li><b>看一讲视频</b>（一个科目从第 1 講按顺序来）。边看边按 <kbd>B</kbd> 加书签、<kbd>H</kbd> 标难点、<kbd>N</kbd> 记笔记。</li>
  <li><b>看完马上做 ○×</b>（右侧「○×」标签，按 <kbd>O</kbd> / <kbd>X</kbd> 回答），5 分钟检查听懂没有。</li>
  <li><b>读笔记</b>：先读中文讲义弄懂，再读日文笔记（考试用的说法）。导图用来看整体结构。</li>
  <li><b>默写论证</b>：「论证」标签里点「默写」，不看原文打出来，系统对比漏写的地方，按记住程度安排下次复习。</li>
  <li><b>第二天先复习</b>：点顶栏「复习」，把到期的论证卡片和上次做错的 ○× 清掉，再看新的一讲。</li>
  <li><b>每学完一个单元（约 5〜10 讲）</b>：去「答案练习」，让 AI 按这几讲出一道事例题，限时写答案，交给 AI 批改。</li>
</ol>`],
  ["讲次页面（看视频的地方）", `
<dl class="gd">
  <dt>视频 + 字幕</dt><dd>字幕跟着视频高亮；点任何一句跳到那里。<kbd>↑</kbd><kbd>↓</kbd> 按句跳，<kbd>R</kbd> 重听这句，<kbd>A</kbd> 单句循环（听不清的句子反复听）。<kbd>/</kbd> 在本讲字幕里搜索。</dd>
  <dt>速度</dt><dd><kbd>[</kbd> <kbd>]</kbd> 调速，<kbd>\\</kbd> 回到 1 倍。熟悉的内容 1.5〜1.75 倍，难的地方放慢。</dd>
  <dt>随身听（<kbd>M</kbd>）</dt><dd>不看画面只听声音 + 大字字幕。通勤、做家务时用。</dd>
  <dt>全屏（<kbd>F</kbd>）/ 专注（<kbd>T</kbd>）</dt><dd>全屏是整个学习页面铺满屏幕；专注是隐藏右侧，只留视频和字幕。</dd>
  <dt>时间轴</dt><dd>视频下的细线。红色竖线是书签、黄色是难点，点一下跳过去。</dd>
  <dt>进度</dt><dd>自动记住看到哪里；看到 95% 自动算学完（也可以手动点「标记学完」）。</dd>
</dl>`],
  ["右侧 8 个标签（按 1〜8 切换）", `
<dl class="gd">
  <dt>1 日文笔记</dt><dd>按讲义顺序整理的日文笔记，是论文考试要用的表达。标题后的时间点一下跳到视频那里。</dd>
  <dt>2 中文笔记</dt><dd>用中文从「为什么」讲起，术语保留日文并注音。第一次学一个主题时先读这个。</dd>
  <dt>3 导图</dt><dd>整讲的结构图。点圆点展开/折叠，滚轮缩放，拖动平移；找不到图了按 <kbd>0</kbd> 或双击空白处「归位」；「放大」看大图。</dd>
  <dt>4 论证</dt><dd>论文要背的论证和定义。「默写」→ 打出来 → <kbd>⌘</kbd>+<kbd>Enter</kbd> 对照，红色是漏掉的，蓝色是多写的；然后选「没记住 / 模糊 / 记住了」，系统决定下次什么时候再出。</dd>
  <dt>5 ○×</dt><dd>短答式的正误题，按 <kbd>O</kbd> / <kbd>X</kbd> 回答，答完看解说。勾「只看错过的」专门刷错题。</dd>
  <dt>6 判例</dt><dd>本讲讲到的判例：事案、判旨、考点。所有判例汇总在顶栏「判例」。</dd>
  <dt>7 书签与笔记</dt><dd>自己的书签列表（可以写备注）和自由笔记（支持 Markdown）；笔记里写 <code>[12:34]</code> 会变成可点击的时间。</dd>
  <dt>8 AI 问答</dt><dd>看视频时哪里不懂就问（Enter 发送）。AI 会参考你提问时视频前后的字幕和这一讲的笔记，用中文回答。好的问答点 ☆ 收藏。需要电脑上开着本地服务；回答通常 20〜60 秒。</dd>
</dl>
<p class="muted small">笔记、卡片、判例里出现的「憲法21条」「民法94条2項」这样的条文都有虚线，点一下弹出条文原文（e-Gov 现行法）。只写「94条」时按当前科目的法律。</p>`],
  ["顶栏的功能", `
<dl class="gd">
  <dt>复习</dt><dd>今天到期的论证卡片 + 上次做错的 ○× 题。每天学新内容前先清掉。</dd>
  <dt>答案练习</dt><dd>
    <b>题目来源</b>：①「粘贴题目」：把筑波的入试过去问、予備試験の論文过去问贴进来（出题趣旨可以贴在第二个框，作答前不显示）；②「AI 出题」：选科目和讲次范围，AI 按这些讲的笔记出一道事例题。<br>
    <b>作答</b>：「打字（CBT）」模拟司法考试的机考，编辑框正好一行 30 字，红线是换页（23 行一页），上面显示字数和页数；Tab 键输入全角空格；草稿自动保存。「手写拍照」用于筑波入试这样的手写考试：在纸上限时写完，拍照按页上传。<br>
    <b>批改</b>：交卷后 AI 按 6 项（論点抽出・規範・あてはめ・結論・構成・日本語）打分，给 A〜F 评价、逐句点评、参考构成和参考答案、中文总评。看完在「复盘」里写下次要改的地方。<br>
    <b>建议</b>：先写「答案構成メモ」（10〜15 分钟）再动笔；严格计时，超时也写完，记录真实用时。</dd>
  <dt>判例</dt><dd>所有讲里出现过的判例，可以筛选；同一个判例在几讲出现过都列出来，点讲次跳到视频那个时间。</dd>
  <dt>搜索框</dt><dd>顶栏右边的框。输入词语回车（例：「表見代理」「目的効果基準」）= 在全部字幕、笔记、论证、判例、○× 里搜，点结果直接跳到视频那个时间；输入「民法94」「憲法21条1項」「刑訴197」回车 = 直接弹出条文。</dd>
  <dt>右上角图标</dt><dd>从左到右：同步与设置（小圆点：绿 = 已同步，黄 = 同步中，红 = 失败）、学习指引、快捷键、夜间 / 日间、全屏。</dd>
  <dt>快捷键 <kbd>?</kbd></dt><dd>随时按 <kbd>?</kbd> 看全部快捷键。</dd>
</dl>`],
  ["科目顺序建议（目标：2027 年 9 月 筑波 既修者）", `
<ol class="steps">
  <li><b>憲法</b>（55 講，最短）先过一遍，熟悉网站和论文的写法。</li>
  <li><b>民法</b>（334 講 + 親族・相続 83 講）分量最大，尽早开始，每天固定时间。</li>
  <li><b>刑法</b>（161 講）和民法交替进行，换换脑子。</li>
  <li><b>民訴・刑訴</b>（各约 150 講）在民法、刑法过半后开始。</li>
  <li>每个科目学完一轮后，用「答案练习」做过去问；最后 60 天以做题、复习论证和错题为主。</li>
</ol>`],
  ["关于 AI 生成的内容", `
<p>笔记、导图、论证、判例、○× 题和答案批改都是 Codex（ChatGPT）根据讲座字幕生成的，讲座以外补充的内容标了【補足】。<b>判例的日期、百選编号、细节规范请和教科书、判例百選核对后再背。</b>还没生成的讲会显示「还没有」。ChatGPT 额度用完时生成和批改会暂停，几个小时后恢复。</p>
<p class="muted small">这个网站只给自己学习用，不要公开发布。</p>`],
];
export function viewGuide() {
  const { app } = X;
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>学习指引</h1></div>
    <div class="guide">
      <nav class="g-toc">${GUIDE.map(([t], i) => `<a href="javascript:void 0" data-g="${i}">${t}</a>`).join("")}</nav>
      <div class="g-body">${GUIDE.map(([t, h], i) => `<section id="g${i}"><h2>${t}</h2>${h}</section>`).join("")}</div>
    </div>`;
  app.querySelector(".g-toc").onclick = (e) => { const i = e.target.closest("[data-g]")?.dataset.g; if (i) document.getElementById(`g${i}`).scrollIntoView({ behavior: "smooth" }); };
  X.pref.set("guideSeen", true);
}

// =====================================================================
// 条文：目录 + 连续阅读 + 全文检索 + 标星
// =====================================================================
const artLabel = (k) => k.includes(":") ? k.split(":")[0] + "条" : k.replace("_", "条の") + (k.includes("_") ? "" : "条");
export async function viewLaws(lawId, art = "") {
  const { app, esc, $ } = X;
  const law = LAWS.find((l) => l.id === lawId) || LAWS[0];
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>条文</h1>
      <span class="law-tabs">${LAWS.map((l) => `<a href="#/laws/${l.id}" class="${l.id === law.id ? "on" : ""}">${l.name}</a>`).join("")}</span></div>
    <div class="row search-f"><input id="lq" placeholder="在${law.name}里搜（条文内容或见出し，例：善意の第三者）。输入数字直接跳到那一条">
      <button id="starBtn">★ 标星的条文</button></div>
    <div class="lawpage"><nav class="law-toc" id="ltoc"><div class="empty">读取中…</div></nav><div class="law-read" id="lread"></div></div>`;
  let d;
  try { d = await loadLaw(law.id); } catch (e) { $("#lread").innerHTML = `<div class="empty">读取失败：${esc(e.message)}</div>`; return; }
  const S = X.state(); S.lawStar ||= {};
  const keys = artKeys(d), idx = Object.fromEntries(keys.map((k, i) => [k, i]));
  const toc = (d.toc || []).filter((t) => idx[t.a] != null);
  const range = (i) => {
    const t = toc[i], s = idx[t.a];
    const j = toc.findIndex((u, k) => k > i && u.lv <= t.lv);
    return [s, j < 0 ? keys.length : idx[toc[j].a]];
  };
  const starKey = (k) => `${law.id}:${k}`;
  const artHtml = (k, q) => {
    const a = d.articles[k];
    const hl = (s) => (q ? esc(s).split(esc(q)).join(`<mark>${esc(q)}</mark>`) : esc(s));
    const on = !!S.lawStar[starKey(k)]?.on;
    return `<div class="art" id="art-${k}">
      <div class="art-h"><b>${esc(a.t)}</b><span class="muted">${hl(a.c)}</span>
        <button class="star ${on ? "on" : ""}" data-star="${k}" title="标星">${on ? "★" : "☆"}</button>
        <a class="link" href="#/search/${encodeURIComponent(`${law.name}${artLabel(k)}`)}/">讲义里</a></div>
      ${a.x.split("\n").map((ln) => `<div class="law-ln ${/^　/.test(ln) ? "item" : ""}">${hl(ln)}</div>`).join("")}</div>`;
  };
  // 有法令名的引用（例：民法90条）在条文里也能点
  const link = () => linkLaws($("#lread"), law.id);
  let curNode = -1;
  // 面包屑：编 › 章 › 节
  const pathOf = (i) => { const out = [toc[i].t]; let lv = toc[i].lv; for (let k = i - 1; k >= 0 && lv > 1; k--) if (toc[k].lv < lv) { out.unshift(toc[k].t); lv = toc[k].lv; } return out; };
  const showNode = (i, focus) => {
    curNode = i;
    $("#ltoc").querySelectorAll("[data-n]").forEach((a) => a.classList.toggle("on", +a.dataset.n === i));
    const [s, e] = toc.length ? range(i) : [0, keys.length];
    const t = toc[i];
    $("#lread").innerHTML = (t ? `<div class="law-path">${esc(pathOf(i).join("　›　"))}</div>` : "")
      + keys.slice(s, e).map((k) => artHtml(k)).join("");
    link();
    if (focus) { const el = document.getElementById(`art-${focus}`); if (el) { el.classList.add("focus"); el.scrollIntoView({ block: "start" }); } }
    else $("#lread").scrollTop = 0;
  };
  // 目录
  $("#ltoc").innerHTML = toc.length ? toc.map((t, i) => `<a href="javascript:void 0" data-n="${i}" class="lv${t.lv}">${esc(t.t)}</a>`).join("")
    : `<div class="muted small">（没有章节）</div>`;
  $("#ltoc").onclick = (e) => { const n = e.target.closest("[data-n]")?.dataset.n; if (n != null) { $("#lq").value = ""; showNode(+n); } };
  // 找包含某条的最深一层目录
  const nodeOf = (k) => {
    let best = 0, bestLv = -1;
    toc.forEach((t, i) => { const [s, e] = range(i); if (idx[k] >= s && idx[k] < e && t.lv >= bestLv) { best = i; bestLv = t.lv; } });
    return best;
  };
  const goArt = (k) => { if (d.articles[k]) { showNode(toc.length ? nodeOf(k) : 0, k); $("#ltoc [data-n].on")?.scrollIntoView({ block: "center" }); return true; } return false; };
  if (!(art && goArt(art))) showNode(0);

  $("#lread").onclick = (e) => {
    const b = e.target.closest("[data-star]"); if (!b) return;
    const k = starKey(b.dataset.star);
    S.lawStar[k] = { on: !S.lawStar[k]?.on }; // 取消也留一条记录，别的设备同步时才知道取消了
    X.save();
    b.classList.toggle("on", S.lawStar[k].on); b.textContent = S.lawStar[k].on ? "★" : "☆";
  };
  let st;
  $("#lq").oninput = (e) => {
    clearTimeout(st);
    st = setTimeout(() => {
      const q = e.target.value.trim();
      if (!q) return showNode(curNode < 0 ? 0 : curNode);
      const n = q.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/^第?(\d+)(?:条)?(?:の(\d+))?$/, (m, a, b) => (b ? `${a}_${b}` : a));
      if (/^\d+(_\d+)?$/.test(n) && goArt(n)) return;
      const hits = keys.filter((k) => d.articles[k].x.includes(q) || d.articles[k].c.includes(q));
      $("#ltoc [data-n].on")?.classList.remove("on");
      $("#lread").innerHTML = `<div class="law-path">「${esc(q)}」　${hits.length} 条${hits.length > 150 ? "（只显示前 150 条）" : ""}</div>` + hits.slice(0, 150).map((k) => artHtml(k, q)).join("");
      link();
    }, 250);
  };
  $("#starBtn").onclick = () => {
    const ks = keys.filter((k) => S.lawStar[starKey(k)]?.on);
    $("#ltoc [data-n].on")?.classList.remove("on");
    $("#lread").innerHTML = `<div class="law-path">${law.name}　标星 ${ks.length} 条</div>` + (ks.map((k) => artHtml(k)).join("") || `<div class="empty">还没有。条文旁边点 ☆ 标星。</div>`);
    link();
  };
}

// =====================================================================
// 收藏：AI 问答收藏 + 所有书签 + 所有笔记
// =====================================================================
export function viewFav(tab = "qa") {
  const { app, esc, $, mdHtml, fmt } = X;
  const S = X.state();
  const lecName = (id) => { const l = LECTURE_BY_ID[id]; return l ? `${subjTitle(l.subject)}　第${l.n}講　${l.title}` : id; };
  const qa = [], marks = [], notes = [];
  for (const [id, c] of Object.entries(S.chat || {})) for (const m of c.msgs || []) if (m.fav && LECTURE_BY_ID[id]) qa.push({ ...m, lec: id });
  for (const [id, l] of Object.entries(S.lectures || {})) {
    if (!LECTURE_BY_ID[id]) continue;
    for (const m of l.marks || []) marks.push({ id, ...m });
    if (l.note?.trim()) notes.push({ id, note: l.note, at: l.t || l.at || 0 });
  }
  qa.sort((a, b) => b.at - a.at);
  marks.sort((a, b) => a.id.localeCompare(b.id) || a.t - b.t);
  notes.sort((a, b) => a.id.localeCompare(b.id));
  const TABS = [["qa", `收藏的问答（${qa.length}）`], ["marks", `书签（${marks.length}）`], ["notes", `我的笔记（${notes.length}）`]];
  app.innerHTML = `<div class="toc-head"><a class="link" href="#/">← 科目</a><h1>收藏</h1></div>
    <div class="tabs fav-tabs">${TABS.map(([k, t]) => `<a href="#/fav/${k}" class="${k === tab ? "on" : ""}">${t}</a>`).join("")}</div>
    <div class="row search-f"><select id="fs"><option value="">全部科目</option>${SUBJECTS.map((s) => `<option value="${s.id}">${s.title}</option>`).join("")}</select>
      <input id="fq" placeholder="筛选"></div>
    <div id="flist"></div>`;
  const draw = () => {
    const sj = $("#fs").value, q = $("#fq").value.trim();
    const ok = (id, text) => (!sj || LECTURE_BY_ID[id].subject === sj) && (!q || text.includes(q));
    let html = "";
    if (tab === "qa") {
      const xs = qa.filter((m) => ok(m.lec, m.q + (m.a || "")));
      html = xs.map((m) => `<details class="fav-qa" open><summary><span class="who">问</span><b>${esc(m.q)}</b></summary>
          <div class="fav-src"><a class="link" href="#/l/${m.lec}/${m.vt ?? ""}/ask">${esc(lecName(m.lec))}${m.vt != null ? "　" + fmt(m.vt) : ""}</a>
            <span class="muted small">${new Date(m.at).toLocaleDateString("sv-SE")}</span>
            <button class="link" data-unfav="${m.lec}|${m.at}">取消收藏</button></div>
          <div class="md" data-subj="${LECTURE_BY_ID[m.lec].subject}">${mdHtml(m.a || "（没有回答）")}</div></details>`).join("")
        || `<div class="empty">还没有。在讲次页「AI 问答」里点 ☆ 收藏。</div>`;
    } else if (tab === "marks") {
      const xs = marks.filter((m) => ok(m.id, m.label || ""));
      let last = "";
      html = xs.map((m) => { const h = m.id !== last ? `<div class="fav-lec">${esc(lecName(m.id))}</div>` : ""; last = m.id;
        return `${h}<a class="fav-mark" href="#/l/${m.id}/${Math.floor(m.t)}"><span class="tlink">${fmt(m.t)}</span>
          <span class="k ${m.kind === "hard" ? "hard" : ""}">${m.kind === "hard" ? "难点" : "书签"}</span><span>${esc(m.label || "")}</span></a>`; }).join("")
        || `<div class="empty">还没有。看视频时按 <kbd>B</kbd> 加书签、<kbd>H</kbd> 标难点。</div>`;
    } else {
      const xs = notes.filter((n) => ok(n.id, n.note));
      html = xs.map((n) => `<div class="fav-note"><div class="fav-lec"><a class="link" href="#/l/${n.id}//mine">${esc(lecName(n.id))}</a></div>
          <div class="md" data-subj="${LECTURE_BY_ID[n.id].subject}" data-lec="${n.id}">${mdHtml(n.note)}</div></div>`).join("")
        || `<div class="empty">还没有。在讲次页「书签与笔记」里写，按 <kbd>N</kbd> 插入当前时间。</div>`;
    }
    $("#flist").innerHTML = html;
    $("#flist").querySelectorAll(".md[data-subj]").forEach((el) => linkLaws(el, SUBJECT_LAW[el.dataset.subj]));
    // 笔记里的 [12:34] 时间：跳到那一讲的那个时间
    $("#flist").querySelectorAll(".md[data-lec] .tlink").forEach((b) => b.replaceWith(Object.assign(document.createElement("a"),
      { className: "tlink", href: `#/l/${b.closest("[data-lec]").dataset.lec}/${b.dataset.t}`, textContent: b.textContent })));
  };
  $("#fs").onchange = draw; $("#fq").oninput = draw;
  $("#flist").onclick = (e) => {
    const u = e.target.closest("[data-unfav]"); if (!u) return;
    e.preventDefault();
    const [id, at] = u.dataset.unfav.split("|");
    const m = S.chat[id]?.msgs.find((x) => String(x.at) === at);
    if (m) { m.fav = false; X.save(); viewFav(tab); }
  };
  draw();
}
