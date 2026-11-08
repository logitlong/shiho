// 数据层：内容（字幕、笔记、导图、卡片、判例、○×、条文）和学习记录。
// - 电脑上本地版（npm start → localhost:4180）：内容走本地 /api；填了令牌就把学习记录同步到 GitHub。
// - 线上版（GitHub Pages）：内容用令牌从私有仓库读取（按文件 sha 缓存在本机），学习记录同步到 GitHub。
//   没有令牌时只能看视频。电脑上开着本地服务的话，搜索、答案练习（AI 批改）借本机服务。
export const ENV = { local: false, api: null }; // api：本地服务的地址（本地版 ""，线上版借本机 http://127.0.0.1:4180，没有 null）
const LOCAL = "http://127.0.0.1:4180";
export const DEFAULT_REPO = "logitlong/shiho-study";
const CONTENT_REF = "main", PROGRESS_REF = "progress", PROGRESS_FILE = "progress.json";
const K = { cfg: "shiho.gh", state: "shiho.state" };

// ---------- 设置 ----------
export function ghCfg() {
  try { const c = JSON.parse(localStorage.getItem(K.cfg)); return c?.token ? c : null; } catch { return null; }
}
export function setGhCfg(c) {
  try { c ? localStorage.setItem(K.cfg, JSON.stringify(c)) : localStorage.removeItem(K.cfg); } catch {}
  remoteSha = null; tree = null;
}

export async function detectEnv() {
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    try { const h = await fetch("/api/health").then((r) => r.json()); if (h.ok) { ENV.local = true; ENV.api = ""; } } catch {}
  }
  return ENV;
}
// 线上版：电脑上在后台试一下本机服务开没开（Chrome 第一次会问「允许访问本地网络」）
export async function probeLocal() {
  if (ENV.api != null) return true;
  const touchOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;
  if (touchOnly) return false;
  try {
    const h = await fetch(`${LOCAL}/api/health`, { signal: AbortSignal.timeout(60_000), cache: "no-store" }).then((r) => r.json());
    if (h.ok) ENV.api = LOCAL;
  } catch {}
  return ENV.api != null;
}
// 需要本地服务的接口（搜索、答案练习、AI）
export class NeedLocal extends Error {}
export function apiUrl(path) {
  if (ENV.api == null) throw new NeedLocal("这个功能要在电脑上开着本地服务（npm start）才能用");
  return ENV.api + path;
}

// ---------- GitHub API ----------
async function gh(path, opts = {}) {
  const c = ghCfg();
  if (!c) throw new Error("没有设置令牌");
  const r = await fetch(`https://api.github.com/repos/${c.repo || DEFAULT_REPO}${path ? `/${path}` : ""}`, {
    ...opts, cache: "no-store",
    headers: { Authorization: `Bearer ${c.token}`, "X-GitHub-Api-Version": "2022-11-28",
      Accept: opts.accept || "application/vnd.github+json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (r.status === 401) throw new Error("令牌无效或已过期（401）");
  if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") throw new Error("GitHub 请求太频繁，稍后再试");
  return r;
}
export async function testToken() {
  const r = await gh("");
  if (r.status === 404) throw new Error("找不到仓库（令牌没有 shiho-study 仓库的权限）");
  if (!r.ok) throw new Error(`GitHub 返回 ${r.status}`);
  const j = await r.json();
  if (!j.permissions?.push) throw new Error("令牌只有读取权限，需要 Contents: Read and write");
  return j.full_name;
}
const b64enc = (s) => { const b = new TextEncoder().encode(s); let out = ""; for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(out); };
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

// 仓库文件列表（一次请求拿到全部文件和 sha）：用来判断每讲有什么内容，也当缓存的版本号
let tree = null;
async function repoTree() {
  return (tree ||= (async () => {
    const r = await gh(`git/trees/${CONTENT_REF}?recursive=1`);
    if (!r.ok) throw new Error(`读取内容列表失败（${r.status}）`);
    const j = await r.json();
    return new Map(j.tree.filter((x) => x.type === "blob").map((x) => [x.path, x.sha]));
  })().catch((e) => { tree = null; throw e; }));
}
// 内容文件：按 sha 缓存在本机（Cache Storage），内容更新后 sha 变了会自动重新下载
const CACHE = "shiho-content-v1";
async function repoText(file) {
  const t = await repoTree();
  const sha = t.get(file);
  if (!sha) return null;
  const key = `https://shiho.cache/${sha}`;
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(key); if (hit) return hit.text(); } catch {}
  const r = await gh(`git/blobs/${sha}`, { accept: "application/vnd.github.raw+json" });
  if (!r.ok) throw new Error(`读取 ${file} 失败（${r.status}）`);
  const text = await r.text();
  try { await cache?.put(key, new Response(text)); } catch {}
  return text;
}
const repoJSON = async (file) => { const t = await repoText(file); return t ? JSON.parse(t) : null; };
export async function clearContentCache() { try { await caches.delete(CACHE); } catch {} tree = null; }

// ---------- 内容 ----------
const EMPTY_INV = { subs: [], notes: [], maps: [], cards: [], cases: [], quiz: [] };
export async function loadInventory() {
  if (ENV.local) return fetch("/api/inventory").then((r) => r.json()).catch(() => EMPTY_INV);
  if (!ghCfg()) return EMPTY_INV;
  try {
    const t = await repoTree();
    const has = (re) => [...t.keys()].map((p) => p.match(re)?.[1]).filter(Boolean);
    return { subs: has(/^data\/subs\/(.+)\.json$/), notes: has(/^data\/notes\/(.+)\.ja\.md$/), maps: has(/^data\/maps\/(.+)\.md$/),
      cards: has(/^data\/cards\/(.+)\.json$/), cases: has(/^data\/cases\/(.+)\.json$/), quiz: has(/^data\/quiz\/(.+)\.json$/) };
  } catch { return EMPTY_INV; }
}
export async function loadLecture(id) {
  if (ENV.local) return fetch(`/api/lecture/${id}`).then((r) => r.json());
  if (!ghCfg()) return { subs: [], notes: { ja: "", zh: "" }, map: "", cards: [], cases: null, quiz: null, locked: true };
  const [subs, ja, zh, map, cards, cases, quiz] = await Promise.all([
    repoJSON(`data/subs/${id}.json`), repoText(`data/notes/${id}.ja.md`), repoText(`data/notes/${id}.zh.md`), repoText(`data/maps/${id}.md`),
    repoJSON(`data/cards/${id}.json`), repoJSON(`data/cases/${id}.json`), repoJSON(`data/quiz/${id}.json`)]);
  return { subs: subs?.segments || [], notes: { ja: ja || "", zh: zh || "" }, map: map || "", cards: cards || [], cases, quiz };
}
export async function loadLawData(id) {
  if (ENV.local) { const r = await fetch(`/api/law/${id}`); if (!r.ok) throw new Error(r.status); return r.json(); }
  if (!ghCfg()) throw new Error("填写令牌后才能看条文");
  const d = await repoJSON(`data/laws/${id}.json`);
  if (!d) throw new Error("没有这部法");
  return d;
}
// 判例索引：本地版服务器现算；线上版读 data/index/cases.json（发布时生成）
export async function loadCasesIndex() {
  if (ENV.local) return fetch("/api/cases").then((r) => r.json());
  if (!ghCfg()) throw new Error("填写令牌后才能看判例");
  return (await repoJSON("data/index/cases.json")) || [];
}

// ---------- 学习记录 ----------
// S = { lectures:{讲id:{pos,dur,done,note,marks,at}}, cards:{"讲id#i":{…}}, quiz:{"讲id#i":{…}}, drafts:{题id:{…}},
//       lawStar:{"法令id:条":{on}}, chat:{讲id:{msgs:[{id,q,a,vt,at,fav}]}}, days:{日期:秒}, resetAt, resetSubj:{科目:时间} }
// 每条记录带修改时间 t，合并时各取较新的一份。
const COLLS = ["lectures", "cards", "quiz", "drafts", "lawStar", "chat"];
export function norm(s) {
  s ||= {};
  for (const c of COLLS) s[c] ||= {};
  s.days ||= {}; s.resetSubj ||= {};
  for (const [k, v] of Object.entries(s.lawStar)) if (typeof v === "number") s.lawStar[k] = { on: true, t: v };
  return s;
}
export async function loadLocalState() {
  let s = null;
  if (ENV.local) { try { s = await fetch("/api/state").then((r) => r.json()); } catch {} }
  else { try { s = JSON.parse(localStorage.getItem(K.state)); } catch {} }
  return norm(s);
}
export function writeLocalState(S) {
  if (ENV.local) { const body = JSON.stringify(S); return fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60000 }).catch(() => {}); }
  try { localStorage.setItem(K.state, JSON.stringify(S)); } catch {}
}

const snap = new Map();
const keyOf = (o) => { if (!o || typeof o !== "object") return JSON.stringify(o); const { t, ...rest } = o; return JSON.stringify(rest); };
export function stampBaseline(S) {
  snap.clear();
  for (const c of COLLS) for (const [k, v] of Object.entries(S[c] || {})) snap.set(`${c}:${k}`, keyOf(v));
}
export function stamp(S) {
  const now = Date.now();
  for (const c of COLLS) for (const [k, v] of Object.entries(S[c] || {})) {
    if (!v || typeof v !== "object") continue;
    const kk = `${c}:${k}`, j = keyOf(v);
    if (snap.get(kk) !== j) { v.t = Math.max(now, v.t || 0); snap.set(kk, j); }
  }
}
// 重置：resetAt（全部）/ resetSubj[科目]（某个部门法）之前的记录，合并时一律丢掉（不然别的设备会把旧记录同步回来）
const subjOf = (key) => key.match(/^([a-z]+)-\d/)?.[1];
function applyResets(x, R, RS) {
  const out = { ...x };
  for (const c of COLLS) {
    out[c] = Object.fromEntries(Object.entries(x[c]).filter(([k, v]) => {
      const t = v?.t || 0;
      if (R && t <= R) return false;
      const sj = subjOf(k);
      return !(sj && RS[sj] && t <= RS[sj]);
    }));
  }
  return out;
}
export function merge(a, b) {
  a = norm(a); b = norm(b);
  const R = Math.max(a.resetAt || 0, b.resetAt || 0);
  const RS = { ...a.resetSubj };
  for (const [k, v] of Object.entries(b.resetSubj)) RS[k] = Math.max(RS[k] || 0, v);
  a = applyResets(a, R, RS); b = applyResets(b, R, RS);
  const out = { ...a, ...b, days: { ...a.days }, resetSubj: RS };
  if (R) out.resetAt = R;
  for (const c of COLLS) {
    out[c] = {};
    for (const k of new Set([...Object.keys(a[c]), ...Object.keys(b[c])])) {
      const x = a[c][k], y = b[c][k];
      out[c][k] = !x ? y : !y ? x : (y.t || 0) > (x.t || 0) ? y : x;
    }
  }
  for (const [d, n] of Object.entries(b.days)) out.days[d] = Math.max(out.days[d] || 0, n);
  return out;
}
// 在本机执行重置。subj 为空 = 全部。keepNotes = 保留书签和自己写的笔记（保留的部分算作新记录）
export function resetState(S, subj, keepNotes) {
  const now = Date.now();
  if (subj) S.resetSubj[subj] = now; else S.resetAt = now;
  const hit = (k) => !subj || subjOf(k) === subj;
  for (const c of COLLS) {
    if (!subj && c === "lawStar") continue; // 条文标星不算学习进度
    if (c === "drafts" && subj) continue;
    for (const k of Object.keys(S[c])) if (hit(k)) delete S[c][k];
  }
  if (keepNotes) for (const [k, v] of Object.entries(KEEP)) if (hit(k)) S.lectures[k] = { ...v, pos: 0, dur: 0, done: false, t: now + 1 };
  if (keepNotes) for (const [k, v] of Object.entries(KEEP_CHAT)) if (hit(k)) S.chat[k] = { ...v, t: now + 1 };
  if (!subj) for (const [k, v] of Object.entries(KEEP_STAR)) S.lawStar[k] = { ...v, t: now + 1 };
  return S;
}
let KEEP = {}, KEEP_STAR = {}, KEEP_CHAT = {};
// resetState 之前先记下要保留的
export function prepareReset(S, keepNotes) {
  KEEP = {}; KEEP_STAR = { ...S.lawStar }; KEEP_CHAT = keepNotes ? JSON.parse(JSON.stringify(S.chat)) : {};
  if (keepNotes) for (const [k, v] of Object.entries(S.lectures)) if (v.note || v.marks?.length) KEEP[k] = { note: v.note || "", marks: v.marks || [] };
}

// ---------- 同步到 GitHub（progress 分支的 progress.json） ----------
let remoteSha = null;
export const sync = { state: "off", at: 0, error: "", onChange: () => {} };
function setSync(state, error = "") { sync.state = state; sync.error = error; if (state === "ok") sync.at = Date.now(); sync.onChange(); }

async function pullRemote() {
  const r = await gh(`contents/${PROGRESS_FILE}?ref=${PROGRESS_REF}`);
  if (r.status === 404) { remoteSha = null; return null; }
  if (!r.ok) throw new Error(`读取学习记录失败（${r.status}）`);
  const j = await r.json();
  remoteSha = j.sha;
  let text = j.content ? b64dec(j.content) : "";
  if (!text && j.size) { const b = await gh(`git/blobs/${j.sha}`).then((x) => x.json()); text = b64dec(b.content); }
  return text ? JSON.parse(text) : null;
}
async function pushRemote(S) {
  const body = { message: `学习记录 ${new Date().toLocaleString("zh-CN")}`, content: b64enc(JSON.stringify(S)), branch: PROGRESS_REF };
  if (remoteSha) body.sha = remoteSha;
  const r = await gh(`contents/${PROGRESS_FILE}`, { method: "PUT", body: JSON.stringify(body) });
  if (r.status === 409 || r.status === 422) return "conflict";
  if (r.status === 404) throw new Error("仓库里没有 progress 分支");
  if (!r.ok) throw new Error(`上传学习记录失败（${r.status}）`);
  remoteSha = (await r.json()).content.sha;
  return "ok";
}
// 拉取 → 合并 → 需要的话上传。返回本机记录是否被远端改动
let busy = null;
export function syncNow(getS, setS) {
  if (!ghCfg()) { setSync("off"); return Promise.resolve(false); }
  if (busy) return busy.then(() => syncNow(getS, setS));
  busy = (async () => {
    setSync("syncing");
    try {
      for (let i = 0; i < 3; i++) {
        const remote = await pullRemote();
        const local = getS();
        const merged = remote ? merge(local, remote) : local;
        const changedLocal = JSON.stringify(merged) !== JSON.stringify(local);
        if (changedLocal) setS(merged);
        const needPush = !remote || JSON.stringify(merged) !== JSON.stringify(norm(remote));
        if (!needPush) { setSync("ok"); return changedLocal; }
        if ((await pushRemote(merged)) === "ok") { setSync("ok"); return changedLocal; }
      }
      throw new Error("同步冲突，稍后会再试");
    } catch (e) { setSync("error", e.message); return false; }
    finally { busy = null; }
  })();
  return busy;
}
