/*
 * 中国移动 APP / 移动营业厅每日签到 Quantumult X 脚本
 *
 * 已验证主签到接口：
 * POST https://wx.10086.cn/qwhdhub/api/mark/mark31/domark
 * body: {"date":"YYYYMMDD"}
 *
 * 工作方式：
 * 1) 抓包模式：在移动营业厅签到页/接口请求中保存 wx.10086.cn 的 QWHD 会话。
 * 2) 定时模式：读取本地会话，自动调用 domark 签到，再查询 markstatus 确认。
 *
 * 公开版不包含任何 Cookie / token。
 */

const CONFIG = {
  name: '移动营业厅签到',
  sessionKey: 'cmcc_qwhd_mark_session_v2',
  resultKey: 'cmcc_qwhd_mark_last_result_v2',
  notifyCooldownKey: 'cmcc_qwhd_mark_capture_notify_ts_v2',
  sessionHistoryKey: 'cmcc_qwhd_mark_session_history_v2',
  notifyCooldownMs: 15000,
  timeout: 20000,
  host: 'wx.10086.cn',
  base: 'https://wx.10086.cn/qwhdhub/api/mark',
  pagePathPrefix: '/qwhdhub/qwhdmark/',
  apiPathPrefix: '/qwhdhub/api/mark/',
  userInfoPath: '/user/info',
  isMark31Path: '/mark31/isMark31',
  domarkPath: '/mark31/domark',
  markStatusPath: '/mark31/markstatus',
  taskListPath: '/task/taskList',
  defaultUA: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148/wkwebview leadeon/12.0.9/CMCCIT'
};

function safeJsonParse(s, fallback = null) { try { return JSON.parse(s); } catch (_) { return fallback; } }
function readJSON(key, fallback = null) { return safeJsonParse($prefs.valueForKey(key) || '', fallback); }
function writeJSON(key, obj) { return $prefs.setValueForKey(JSON.stringify(obj), key); }
function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(headers)) if (String(k).toLowerCase() === lower) return headers[k];
  return undefined;
}
function setHeader(headers, name, value) {
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === lower) { headers[k] = value; return; }
  }
  headers[name] = value;
}
function deleteHeader(headers, name) {
  const lower = String(name).toLowerCase();
  for (const k of Object.keys(headers)) if (String(k).toLowerCase() === lower) delete headers[k];
}
function notify(title, subtitle, message) { $notify(title, subtitle || '', message || ''); }
function done(value = {}) { $done(value); }
function shouldNotifyCapture() {
  const now = Date.now();
  const last = Number($prefs.valueForKey(CONFIG.notifyCooldownKey) || '0');
  if (now - last < CONFIG.notifyCooldownMs) return false;
  $prefs.setValueForKey(String(now), CONFIG.notifyCooldownKey);
  return true;
}
function cleanText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function normalizeSetCookie(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw).split(/\n|,(?=[^;]+?=)/).map(x => x.trim()).filter(Boolean);
}
function parseCookie(cookie) {
  const map = new Map();
  String(cookie || '').split(';').map(x => x.trim()).filter(Boolean).forEach(part => {
    const idx = part.indexOf('=');
    if (idx > 0) map.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
  });
  return map;
}
function stringifyCookie(map) { return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; '); }
function mergeSetCookie(cookie, setCookie) {
  const jar = parseCookie(cookie);
  for (const line of normalizeSetCookie(setCookie)) {
    const first = String(line || '').split(';')[0].trim();
    const idx = first.indexOf('=');
    if (idx <= 0) continue;
    const k = first.slice(0, idx).trim();
    const v = first.slice(idx + 1).trim();
    if (!v || /^(deleted|null|undefined)$/i.test(v)) jar.delete(k); else jar.set(k, v);
  }
  return stringifyCookie(jar);
}
const STABLE_COOKIE_KEYS = ['QWHD_SESSION_TOKEN', 'yx', 'jsessionid-cmcc', 'JSESSIONID', 'CMCCSSO', 'CMCCSSOD'];
function keepUsefulCookie(cookie) {
  const jar = parseCookie(cookie);
  const keep = new Map();
  for (const key of STABLE_COOKIE_KEYS) {
    if (jar.has(key)) keep.set(key, jar.get(key));
  }
  // gdp/gio 属于埋点 cookie，移动 APP 每次打开都会轮换；不再保存，避免覆盖有效会话并反复弹“变化/消失”。
  return stringifyCookie(keep);
}
function mergeRequestCookie(prevCookie, incomingCookie) {
  const base = parseCookie(prevCookie);
  const incoming = parseCookie(incomingCookie);
  for (const key of STABLE_COOKIE_KEYS) {
    if (incoming.has(key)) base.set(key, incoming.get(key));
  }
  return keepUsefulCookie(stringifyCookie(base));
}
function hasUsefulToken(cookie, referer) {
  return String(cookie || '').includes('QWHD_SESSION_TOKEN=') || /token=QWHDSSOD/i.test(String(referer || ''));
}
function sanitizeHeaders(headers) {
  const out = {};
  const keep = ['accept', 'accept-language', 'content-type', 'user-agent', 'referer', 'origin', 'login-check', 'x-requested-with'];
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase();
    if (keep.includes(lk) || lk.startsWith('x-')) out[k] = v;
  }
  deleteHeader(out, 'host');
  deleteHeader(out, 'content-length');
  deleteHeader(out, 'accept-encoding');
  if (!getHeader(out, 'User-Agent')) out['User-Agent'] = CONFIG.defaultUA;
  if (!getHeader(out, 'Accept')) out['Accept'] = '*/*';
  if (!getHeader(out, 'Content-Type')) out['Content-Type'] = 'application/json;charset=UTF-8';
  if (!getHeader(out, 'Origin')) out['Origin'] = 'https://wx.10086.cn';
  if (!getHeader(out, 'login-check')) out['login-check'] = '1';
  if (!getHeader(out, 'x-requested-with')) out['x-requested-with'] = 'XMLHttpRequest';
  return out;
}
function todayYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function buildUrl(path) { return CONFIG.base + path; }
function extractShort(body) {
  const raw = String(body || '');
  const obj = safeJsonParse(raw, null);
  if (obj) {
    const parts = [];
    for (const f of ['code', 'status', 'msg', 'success']) if (obj[f] !== undefined) parts.push(`${f}=${obj[f]}`);
    return parts.join('；') || JSON.stringify(obj).slice(0, 300);
  }
  return cleanText(raw).slice(0, 300) || '(空响应)';
}
function classify(body) {
  const text = String(body || '');
  if (/^\s*<!DOCTYPE html|^\s*<html/i.test(text)) return 'html';
  const obj = safeJsonParse(text, null);
  if (obj) {
    const code = String(obj.code ?? obj.retCode ?? obj.resultCode ?? '').toUpperCase();
    const status = String(obj.status ?? '').toUpperCase();
    const msg = String(obj.msg ?? obj.message ?? obj.retMsg ?? '');
    if (status === 'HAVE_MARKED' || /已签到|已签|今日已签到|无法再次签到/.test(msg)) return 'already';
    if (code === 'SUCCESS' || code === '0' || code === '0000') return 'success';
    if (/登录|失效|过期|鉴权|认证|token/i.test(msg + status + code)) return 'invalid';
    if (code || status || msg) return 'failed';
  }
  if (/已签到|已签|无法再次签到/.test(text)) return 'already';
  if (/SUCCESS|签到成功|领取成功|成功/.test(text)) return 'success';
  if (/登录|失效|过期|鉴权|认证|token/i.test(text)) return 'invalid';
  return 'unknown';
}
function iconForStatus(status) {
  if (status === 'success' || status === 'already') return '✅';
  if (status === 'invalid' || status === 'failed') return '❌';
  return '⚠️';
}

function hashString(s) {
  let h = 2166136261;
  const text = String(s || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function cookieSnapshot(cookie) {
  const jar = parseCookie(cookie);
  const out = {};
  for (const [k, v] of jar.entries()) out[k] = { len: String(v || '').length, hash: hashString(v).slice(0, 8) };
  return out;
}
function cookieDiffSummary(prevCookie, nextCookie) {
  const prev = parseCookie(prevCookie);
  const next = parseCookie(nextCookie);
  const prevNames = Array.from(prev.keys());
  const nextNames = Array.from(next.keys());
  const added = nextNames.filter(k => !prev.has(k));
  const removed = prevNames.filter(k => !next.has(k));
  const changed = nextNames.filter(k => prev.has(k) && hashString(prev.get(k)) !== hashString(next.get(k)));
  const unchanged = nextNames.filter(k => prev.has(k) && hashString(prev.get(k)) === hashString(next.get(k)));
  const parts = [];
  if (changed.length) parts.push(`变化：${changed.join(', ')}`);
  if (added.length) parts.push(`新增：${added.join(', ')}`);
  if (removed.length) parts.push(`消失：${removed.join(', ')}`);
  if (!parts.length && unchanged.length) parts.push(`未变：${unchanged.join(', ')}`);
  return parts.join('；') || '无可比 cookie';
}
function saveSession(session, prevSession) {
  const now = new Date().toISOString();
  session.savedAt = now;
  session.cookieSnapshot = cookieSnapshot(session.cookie || '');
  session.cookieDiff = prevSession && prevSession.cookie ? cookieDiffSummary(prevSession.cookie, session.cookie || '') : '首次保存，无昨日对比';
  writeJSON(CONFIG.sessionKey, session);
  const history = readJSON(CONFIG.sessionHistoryKey, []);
  history.unshift({ at: now, sourcePath: session.sourcePath, diff: session.cookieDiff, snapshot: session.cookieSnapshot });
  writeJSON(CONFIG.sessionHistoryKey, history.slice(0, 10));
  return session.cookieDiff;
}
function pickRefreshPageUrl(session) {
  const candidates = [session && session.referer, session && session.url].filter(Boolean);
  for (const item of candidates) {
    try {
      const u = new URL(item);
      if (u.host === CONFIG.host && u.pathname.startsWith(CONFIG.pagePathPrefix) && /token=QWHDSSOD/i.test(u.search)) return u.toString();
    } catch (_) {}
  }
  return '';
}
async function refreshPageSession(session) {
  const url = pickRefreshPageUrl(session);
  if (!url) return { ok: false, reason: '无可用 qwhdmark token 页面' };
  const headers = Object.assign({}, session.headers || {});
  const cookie = session.cookie || getHeader(headers, 'Cookie') || '';
  if (cookie) setHeader(headers, 'Cookie', cookie);
  deleteHeader(headers, 'content-length');
  deleteHeader(headers, 'accept-encoding');
  const resp = await $task.fetch({ url, method: 'GET', headers, timeout: CONFIG.timeout });
  const nextCookie = mergeSetCookie(cookie, getHeader(resp.headers || {}, 'set-cookie'));
  if (nextCookie) {
    const prevCookie = session.cookie || '';
    session.cookie = keepUsefulCookie(nextCookie);
    setHeader(session.headers, 'Cookie', session.cookie);
    saveSession(session, { cookie: prevCookie });
  }
  return { ok: true, statusCode: resp.statusCode, body: resp.body || '' };
}

function handleCapture() {
  const req = $request;
  const url = new URL(req.url || '');
  if (url.host !== CONFIG.host) return done({});
  const isQwhdPage = url.pathname.startsWith(CONFIG.pagePathPrefix);
  const isMarkApi = url.pathname.startsWith(CONFIG.apiPathPrefix);
  if (!isQwhdPage && !isMarkApi) return done({});

  const rawCookie = getHeader(req.headers || {}, 'Cookie') || '';
  const referer = getHeader(req.headers || {}, 'Referer') || req.url || '';
  const prevSession = readJSON(CONFIG.sessionKey, null);
  const usefulCookie = mergeRequestCookie(prevSession && prevSession.cookie || '', rawCookie);
  const hasToken = hasUsefulToken(usefulCookie, referer);
  if (!hasToken) return done({});

  const session = {
    sourcePath: url.pathname,
    url: req.url,
    method: req.method || 'GET',
    headers: sanitizeHeaders(req.headers || {}),
    cookie: usefulCookie || keepUsefulCookie(rawCookie),
    referer
  };
  if (session.cookie) setHeader(session.headers, 'Cookie', session.cookie);
  const diff = saveSession(session, prevSession);

  if (shouldNotifyCapture()) {
    notify('✅ 移动营业厅签到', '已保存 QWHD 会话', `Path: ${url.pathname}\nCookie对比：${diff}\n后续定时会先刷新页面会话，再调用 mark31/domark 签到`);
  }
  return done({});

}

function handleResponseCapture() {
  const req = $request;
  const resp = $response;
  const url = new URL(req.url || '');
  if (url.host !== CONFIG.host) return done({});
  const isQwhdPage = url.pathname.startsWith(CONFIG.pagePathPrefix);
  const isMarkApi = url.pathname.startsWith(CONFIG.apiPathPrefix);
  if (!isQwhdPage && !isMarkApi) return done({});

  const setCookie = getHeader(resp.headers || {}, 'set-cookie');
  if (!setCookie) return done({});
  const reqCookie = keepUsefulCookie(getHeader(req.headers || {}, 'Cookie') || '');
  const referer = getHeader(req.headers || {}, 'Referer') || req.url || '';
  const prevSession = readJSON(CONFIG.sessionKey, null);
  const baseCookie = prevSession && prevSession.cookie || reqCookie;
  const mergedCookie = keepUsefulCookie(mergeSetCookie(baseCookie, setCookie));
  if (!hasUsefulToken(mergedCookie, referer)) return done({});

  const session = prevSession || {
    sourcePath: url.pathname,
    url: req.url,
    method: req.method || 'GET',
    headers: sanitizeHeaders(req.headers || {}),
    referer
  };
  session.sourcePath = url.pathname;
  session.url = req.url;
  session.method = req.method || session.method || 'GET';
  session.headers = sanitizeHeaders(Object.assign({}, session.headers || {}, req.headers || {}));
  session.cookie = mergedCookie;
  session.referer = referer || session.referer || req.url;
  setHeader(session.headers, 'Cookie', session.cookie);
  const diff = saveSession(session, { cookie: baseCookie || '' });

  if (shouldNotifyCapture()) {
    notify('✅ 移动营业厅签到', '已刷新 QWHD 响应会话', `Path: ${url.pathname}\nCookie对比：${diff}\n后续定时会使用响应 Set-Cookie 后的新会话签到`);
  }
  return done({});
}

async function fetchWithSession(session, path, bodyObj = {}) {
  const headers = Object.assign({}, session.headers || {});
  const cookie = session.cookie || getHeader(headers, 'Cookie') || '';
  if (cookie) setHeader(headers, 'Cookie', cookie);
  if (session.referer && !getHeader(headers, 'Referer')) setHeader(headers, 'Referer', session.referer);
  deleteHeader(headers, 'content-length');
  deleteHeader(headers, 'accept-encoding');
  const resp = await $task.fetch({
    url: buildUrl(path),
    method: 'POST',
    headers,
    body: JSON.stringify(bodyObj || {}),
    timeout: CONFIG.timeout
  });
  const nextCookie = mergeSetCookie(cookie, getHeader(resp.headers || {}, 'set-cookie'));
  if (nextCookie) {
    session.cookie = keepUsefulCookie(nextCookie);
    setHeader(session.headers, 'Cookie', session.cookie);
    saveSession(session, { cookie });
  }
  return { statusCode: resp.statusCode, headers: resp.headers || {}, body: resp.body || '' };
}

function parseUserLine(body) {
  const obj = safeJsonParse(body, null);
  const data = obj && obj.data || {};
  if (!data.nickName && !data.activityId) return '';
  return `账号：${data.nickName || '未知'}｜activityId：${data.activityId || '未知'}`;
}
function parseMarkLine(body) {
  const obj = safeJsonParse(body, null);
  const data = obj && obj.data || {};
  const user = data.userinfo || {};
  const today = todayYYYYMMDD();
  const hit = Array.isArray(data.markstatus) ? data.markstatus.find(x => x.date === today) : null;
  const parts = [];
  if (hit) parts.push(`今日状态=${hit.status}`);
  if (user.accumulateTimes !== undefined) parts.push(`累计=${user.accumulateTimes}`);
  return parts.length ? parts.join('｜') : extractShort(body);
}

function buildMinimalSuccessText() {
  return '签到成功 | 今日获取未知积分 | 总积分未知';
}

async function runTask() {
  const session = readJSON(CONFIG.sessionKey, null);
  if (!session || !session.cookie || !hasUsefulToken(session.cookie, session.referer || session.url || '')) {
    notify('❌ 移动营业厅签到', '未抓到有效 QWHD 会话', '先在中国移动 APP 打开签到页，让 QuanX 抓到 wx.10086.cn/qwhdhub 的请求。');
    return done();
  }

  const lines = [];
  try {
    const refresh = await refreshPageSession(session);
    if (refresh.ok) lines.push(`✅ page-refresh：HTTP ${refresh.statusCode}｜已尝试刷新 QWHD 会话`);
  } catch (e) {
    lines.push(`⚠️ page-refresh 失败：${e.message || e}`);
  }

  try {
    const userResp = await fetchWithSession(session, CONFIG.userInfoPath, {});
    const userCls = classify(userResp.body);
    lines.push(`${iconForStatus(userCls)} user/info：HTTP ${userResp.statusCode}｜${parseUserLine(userResp.body) || extractShort(userResp.body)}`);
    if (userCls === 'invalid' || userCls === 'html') {
      notify('❌ 移动营业厅签到', '登录态失效', lines.join('\n'));
      return done();
    }
  } catch (e) {
    lines.push(`❌ user/info 失败：${e.message || e}`);
  }

  const date = todayYYYYMMDD();
  try {
    const signResp = await fetchWithSession(session, CONFIG.domarkPath, { date });
    const cls = classify(signResp.body);
    lines.push(`${iconForStatus(cls)} domark：${date}｜HTTP ${signResp.statusCode}｜${extractShort(signResp.body)}`);
  } catch (e) {
    lines.push(`❌ domark 失败：${e.message || e}`);
  }

  try {
    const statusResp = await fetchWithSession(session, CONFIG.markStatusPath, {});
    const statusCls = classify(statusResp.body);
    lines.push(`${iconForStatus(statusCls)} markstatus：HTTP ${statusResp.statusCode}｜${parseMarkLine(statusResp.body)}`);
  } catch (e) {
    lines.push(`⚠️ markstatus 失败：${e.message || e}`);
  }

  const body = lines.join('\n');
  writeJSON(CONFIG.resultKey, { at: new Date().toISOString(), lines });
  const ok = lines.some(x => x.includes('domark') && (x.includes('code=SUCCESS') || x.includes('HAVE_MARKED') || x.includes('已签到') || x.includes('无法再次签到')));
  notify(ok ? '✅ 移动营业厅签到' : '⚠️ 移动营业厅签到', ok ? '签到成功' : '结果需确认', ok ? buildMinimalSuccessText() : body);
  return done();
}

if (typeof $request !== 'undefined' && typeof $response !== 'undefined') {
  handleResponseCapture();
} else if (typeof $request !== 'undefined') {
  handleCapture();
} else {
  runTask().catch(e => {
    notify('❌ 移动营业厅签到', '脚本异常', String(e && e.stack || e));
    done();
  });
}
