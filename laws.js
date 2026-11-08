import { loadLawData } from "./store.js?v=179618f98f";
// 条文弹窗：笔记、卡片、判例里的「憲法20条3項」「民訴法247条」「94条2項」点一下看原文
// 原文来自 e-Gov 法令 API（tools/laws.py → data/laws/<法令ID>.json），是取得当时的现行法
const LAW_ID = {
  日本国憲法: "321CONSTITUTION", 憲法: "321CONSTITUTION",
  民法: "129AC0000000089",
  刑法: "140AC0000000045",
  民事訴訟法: "408AC0000000109", 民訴法: "408AC0000000109", 民訴: "408AC0000000109",
  刑事訴訟法: "323AC0000000131", 刑訴法: "323AC0000000131", 刑訴: "323AC0000000131",
};
// 没写法令名时，按科目默认
export const SUBJECT_LAW = {
  kenpo: "321CONSTITUTION", minpo: "129AC0000000089", kazoku: "129AC0000000089",
  keiho: "140AC0000000045", minso: "408AC0000000109", keiso: "323AC0000000131",
};
// 长的名字放前面
const NAMES = Object.keys(LAW_ID).sort((a, b) => b.length - a.length).join("|");
const z2h = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
const NUM = "[0-9０-９]+";
const LAW_RE = new RegExp(`(?:(${NAMES})\\s*)?(?:第)?(${NUM})\\s*条(?:の\\s*(${NUM}))?(?:\\s*第?\\s*(${NUM})\\s*項)?`, "g");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cache = {};
export const LAWS = [
  { id: "321CONSTITUTION", name: "憲法" }, { id: "129AC0000000089", name: "民法" }, { id: "140AC0000000045", name: "刑法" },
  { id: "408AC0000000109", name: "民事訴訟法" }, { id: "323AC0000000131", name: "刑事訴訟法" },
];
// 条号排序：JS 对象里 "709" 这种整数键会排在 "465_2" 前面，所以要自己按条号排
// 「38:84」这种是一段被删除的条文
const artNo = (k) => [parseInt(k, 10) || 0, +(/_(\d+)/.exec(k)?.[1] || 0)];
export const artKeys = (d) => Object.keys(d.articles).sort((a, b) => {
  const [a1, a2] = artNo(a), [b1, b2] = artNo(b);
  return a1 - b1 || a2 - b2;
});
export const loadLaw = (id) => (cache[id] ||= loadLawData(id)
  .catch((e) => { delete cache[id]; throw e; }));

function linkText(text, st) {
  let out = "", last = 0;
  for (const m of text.matchAll(LAW_RE)) {
    if (m[1]) st.law = LAW_ID[m[1]];
    if (!st.law) continue;
    out += esc(text.slice(last, m.index));
    const art = m[3] ? `${z2h(m[2])}_${z2h(m[3])}` : z2h(m[2]);
    out += `<a class="lawref" href="javascript:void 0" data-law="${st.law}" data-art="${art}" data-para="${m[4] ? z2h(m[4]) : ""}">${esc(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}
// 在已渲染好的区域里找条文号（跳过链接、代码、输入框）
export function linkLaws(root, defaultLaw) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement.closest("a, code, pre, textarea, input, button, .lawref") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (!/[0-9０-９]\s*条/.test(n.data)) continue;
    // 每个文字块里先用默认法令；出现法令名后，同一块里后面的条文都用它
    const html = linkText(n.data, { law: defaultLaw || null });
    if (!html.includes("lawref")) continue;
    const span = document.createElement("span"); span.innerHTML = html; n.replaceWith(span);
  }
}

let closeOpen = null;
// 换页面时关掉
window.addEventListener("hashchange", () => closeOpen?.());
async function openLaw(id, art, para) {
  closeOpen?.();
  const bg = document.createElement("div");
  bg.className = "law-modal";
  bg.innerHTML = `<div class="law-box"><div class="empty">读取条文…</div></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener("keydown", onKey, true); closeOpen = null; };
  closeOpen = close;
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  bg.onclick = (e) => { if (e.target === bg || e.target.closest("[data-close]")) close(); };
  let d;
  try { d = await loadLaw(id); } catch (e) { bg.querySelector(".law-box").innerHTML = `<p>条文读取失败（${esc(e.message)}）</p>`; return; }
  const keys = artKeys(d);
  const show = (k, p) => {
    const a = d.articles[k];
    const i = keys.indexOf(k);
    const body = a ? a.x.split("\n").map((ln) => {
      const hit = p && (p === "1" ? !/^\d+　/.test(ln) && !/^　/.test(ln) : ln.startsWith(`${p}　`));
      return `<div class="law-ln ${hit ? "hit" : ""} ${/^　/.test(ln) ? "item" : ""}">${esc(ln)}</div>`;
    }).join("") : `<p class="muted">${esc(d.title)}里没有第 ${esc(k.replace("_", "条の"))} 条（可能已删除，或条文号写法不同）。</p>`;
    bg.querySelector(".law-box").innerHTML = `
      <div class="law-head"><b>${esc(d.title)}　${esc(a?.t || "")}</b><span class="muted small">${esc(a?.c || "")}</span>
        <button class="law-x" data-close>关闭</button></div>
      <div class="law-body">${body}</div>
      <div class="law-foot">
        <button data-nav="${keys[i - 1] || ""}" ${i > 0 ? "" : "disabled"}>← 前一条</button>
        <button data-nav="${keys[i + 1] || ""}" ${i >= 0 && i < keys.length - 1 ? "" : "disabled"}>后一条 →</button>
        <a class="link" href="#/laws/${id}/${a ? k : ""}" style="margin-left:auto">在条文页打开</a>
        <span class="muted small">e-Gov 现行法（${esc(d.fetched)} 取得）</span></div>`;
    bg.querySelectorAll("[data-nav]").forEach((b) => (b.onclick = () => b.dataset.nav && show(b.dataset.nav, "")));
  };
  show(art, para);
}
// 顶栏的「查条文」：输入「民法94」「憲法21条1項」「刑訴 197」
export function lookupLaw(str, defaultLaw) {
  const s = z2h(String(str).trim()).replace(/^(\D+?)\s*(\d)/, "$1$2");
  const m = new RegExp(`^(${NAMES})?\\s*(?:第)?(\\d+)(?:\\s*条)?(?:の\\s*(\\d+))?(?:\\s*第?\\s*(\\d+)\\s*項?)?`).exec(s);
  if (!m) return false;
  const law = m[1] ? LAW_ID[m[1]] : defaultLaw;
  if (!law) return false;
  openLaw(law, m[3] ? `${m[2]}_${m[3]}` : m[2], m[4] || "");
  return true;
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a.lawref"); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  openLaw(a.dataset.law, a.dataset.art, a.dataset.para);
});
