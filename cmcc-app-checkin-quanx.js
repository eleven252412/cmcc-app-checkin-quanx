/*
 * 中国移动 APP / 移动营业厅签到 Quantumult X 脚本
 *
 * 设计原则：
 * 1. refreshSession 只用于刷新/验证会话，不假装它就是签到。
 * 2. 真正签到接口以抓到的“签到/领取/任务完成”请求为准，脚本每日重放该请求。
 * 3. 如果只抓到 refreshSession，定时任务会提示“还未抓到签到接口”，避免误报成功。
 *
 * 环境：Quantumult X
 */

const CONFIG = {
  name: '中国移动APP签到',
  authKey: 'cmcc_app_checkin_auth_v1',
  signKey: 'cmcc_app_checkin_sign_req_v1',
  markStatusKey: 'cmcc_app_checkin_markstatus_req_v1',
  businessPrizesKey: 'cmcc_app_checkin_business_prizes_req_v1',
  resultKey: 'cmcc_app_checkin_last_result_v1',
  notifyCooldownKey: 'cmcc_app_checkin_notify_ts_v1',
  notifyCooldownMs: 15000,
  timeout: 20000,
  refreshPath: '/biz-orange/DN/refreshSession',
  markStatusPath: '/qwhdhub/api/mark/mark31/markstatus',
  businessPrizesPath: '/qwhdhub/api/mark/info/businessPrizes',
  // 仅用于自动识别并保存“可能是真正签到/领取”的请求。
  // 如果后续发现真实路径，可把正则再收窄。
  signPathRegex: /(sign|signin|checkin|mark|qwhd|businessPrizes|draw|receive|reward|task|finish|complete|lottery|activity|coupon|point|score|rights|welfare|benefit|daily)/i,
  requiredHostRegex: /(^|\.)10086\.cn$/i,
  defaultUA: 'ChinaMobile/12.0.9 (iPhone; iOS 15.5; Scale/3.00)'
};

function now() { return Date.now(); }
function safeJsonParse(s, fallback = null) { try { return JSON.parse(s); } catch (_) { return fallback; } }
function readJSON(key, fallback = null) { return safeJsonParse($prefs.valueForKey(key) || '', fallback); }
function writeJSON(key, obj) { return $prefs.setValueForKey(JSON.stringify(obj), key); }
function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (String(k).toLowerCase() === lower) return headers[k];
  return undefined;
}
function setHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (String(k).toLowerCase() === lower) {
      headers[k] = value;
      return;
    }
  }
  headers[name] = value;
}
function deleteHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (String(k).toLowerCase() === lower) delete headers[k];
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
function stringifyCookie(map) {
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}
function mergeSetCookie(cookie, setCookie) {
  const jar = parseCookie(cookie);
  for (const line of normalizeSetCookie(setCookie)) {
    const first = line.split(';')[0].trim();
    const idx = first.indexOf('=');
    if (idx <= 0) continue;
    const k = first.slice(0, idx).trim();
    const v = first.slice(idx + 1).trim();
    if (!v || /^(deleted|null|undefined)$/i.test(v)) jar.delete(k); else jar.set(k, v);
  }
  return stringifyCookie(jar);
}
function sanitizeHeaders(headers) {
  const out = {};
  const keep = [
    'accept', 'accept-language', 'content-type', 'user-agent',
    'x-qen', 'xs', 'x-sign', 'x-nonce', 'x-token', 'x-time',
    'x-request-id', 'x-timestamp', 'x-client-id', 'x-app-version',
    'channel', 'authorization', 'referer', 'origin'
  ];
  for (const [k, v] of Object.entries(headers || {})) {
    const lk = k.toLowerCase();
    if (keep.includes(lk) || lk.startsWith('x-')) out[k] = v;
  }
  deleteHeader(out, 'host');
  deleteHeader(out, 'content-length');
  deleteHeader(out, 'accept-encoding');
  if (!getHeader(out, 'user-agent')) out['User-Agent'] = CONFIG.defaultUA;
  return out;
}
function requestInfo(req) {
  const u = new URL(req.url);
  return {
    url: req.url,
    method: req.method || 'GET',
    host: u.host,
    path: u.pathname,
    headers: sanitizeHeaders(req.headers || {}),
    cookie: getHeader(req.headers || {}, 'Cookie') || '',
    body: req.body || '',
    savedAt: new Date().toISOString()
  };
}
function shouldNotify() {
  const last = Number($prefs.valueForKey(CONFIG.notifyCooldownKey) || 0);
  if (now() - last < CONFIG.notifyCooldownMs) return false;
  $prefs.setValueForKey(String(now()), CONFIG.notifyCooldownKey);
  return true;
}
function notify(title, subtitle, message) { $notify(title, subtitle || '', message || ''); }
function done(value = {}) { $done(value); }

function handleCapture() {
  const req = $request;
  const info = requestInfo(req);
  const hostOK = CONFIG.requiredHostRegex.test(info.host);
  if (!hostOK) return done({});

  const isRefresh = info.host === 'client.app.coc.10086.cn' && info.path === CONFIG.refreshPath;
  const isMarkStatus = info.host === 'wx.10086.cn' && info.path === CONFIG.markStatusPath;
  const isBusinessPrizes = info.host === 'wx.10086.cn' && info.path === CONFIG.businessPrizesPath;
  const maybeSign = !isRefresh && !isMarkStatus && !isBusinessPrizes && CONFIG.signPathRegex.test(info.path + '?' + (new URL(info.url).search || ''));

  if (isRefresh) {
    writeJSON(CONFIG.authKey, info);
    if (shouldNotify()) notify('✅ 中国移动APP', '已保存 refreshSession 会话', `Host: ${info.host}\nPath: ${info.path}`);
  } else if (isMarkStatus) {
    writeJSON(CONFIG.markStatusKey, info);
    if (shouldNotify()) notify('✅ 中国移动APP', '已保存签到状态接口 markstatus', `${info.method} ${info.path}`);
  } else if (isBusinessPrizes) {
    writeJSON(CONFIG.businessPrizesKey, info);
    if (shouldNotify()) notify('✅ 中国移动APP', '已保存奖品查询接口 businessPrizes', `${info.method} ${info.path}`);
  } else if (maybeSign) {
    writeJSON(CONFIG.signKey, info);
    if (shouldNotify()) notify('✅ 中国移动APP', '已保存疑似签到/领取接口', `${info.method} ${info.path}`);
  }
  return done({});
}

async function fetchWithState(saved, override = {}) {
  const headers = Object.assign({}, saved.headers || {}, override.headers || {});
  const cookie = override.cookie || saved.cookie || getHeader(headers, 'Cookie') || '';
  if (cookie) setHeader(headers, 'Cookie', cookie);
  deleteHeader(headers, 'content-length');
  deleteHeader(headers, 'accept-encoding');
  const opts = {
    url: override.url || saved.url,
    method: override.method || saved.method || 'GET',
    headers,
    body: Object.prototype.hasOwnProperty.call(override, 'body') ? override.body : (saved.body || ''),
    timeout: CONFIG.timeout
  };
  const resp = await $task.fetch(opts);
  const nextCookie = mergeSetCookie(cookie, getHeader(resp.headers || {}, 'set-cookie'));
  return {
    statusCode: resp.statusCode,
    headers: resp.headers || {},
    body: resp.body || '',
    cookie: nextCookie
  };
}
function extractShort(text) {
  const raw = String(text || '');
  const cleaned = raw.replace(/\s+/g, ' ').slice(0, 500);
  const obj = safeJsonParse(raw, null);
  if (obj) {
    const fields = ['msg', 'message', 'desc', 'resultDesc', 'retMsg', 'returnMsg', 'rspDesc', 'code', 'retCode', 'resultCode'];
    const parts = [];
    for (const f of fields) if (obj[f] !== undefined) parts.push(`${f}=${obj[f]}`);
    if (parts.length) return parts.join('；');
  }
  return cleaned || '(空响应)';
}
function classify(body) {
  const text = String(body || '');
  const obj = safeJsonParse(text, null);
  if (/^\s*<!DOCTYPE html|^\s*<html/i.test(text)) return 'html';
  if (obj) {
    const code = obj.retCode ?? obj.code ?? obj.resultCode ?? obj.status;
    const msg = String(obj.retMsg ?? obj.msg ?? obj.message ?? obj.resultDesc ?? '');
    if (/已签到|已经签到|重复|今日.*完成|already/i.test(msg)) return 'already';
    if (code !== undefined) {
      const c = String(code).toUpperCase();
      if (['0', '0000', 'SUCCESS', 'OK'].includes(c)) return 'success';
      if (c !== '200') return 'failed';
    }
    if (/成功|领取成功|签到成功|success/i.test(msg)) return 'success';
    if (/失败|异常|错误|未登录|登录|失效|过期|token|鉴权|认证/i.test(msg)) return 'failed';
  }
  if (/已签到|已经签到|重复|今日.*完成|already/i.test(text)) return 'already';
  if (/成功|领取成功|签到成功|success|SUCCESS|0000|\"code\"\s*:\s*0/.test(text)) return 'success';
  if (/未登录|登录|失效|过期|token|鉴权|认证|401|403/i.test(text)) return 'invalid';
  return 'unknown';
}

function iconForStatus(status) {
  if (status === 'success' || status === 'already') return '✅';
  if (status === 'invalid' || status === 'failed') return '❌';
  return '⚠️';
}

async function runTask() {
  const auth = readJSON(CONFIG.authKey, null);
  const sign = readJSON(CONFIG.signKey, null);
  const markStatus = readJSON(CONFIG.markStatusKey, null);
  const businessPrizes = readJSON(CONFIG.businessPrizesKey, null);
  const lines = [];
  let latestCookie = '';

  if (!auth) {
    notify('❌ 中国移动APP签到', '未抓到 refreshSession', '先打开中国移动APP，并触发 client.app.coc.10086.cn/biz-orange/DN/refreshSession');
    return done();
  }

  try {
    const refreshResp = await fetchWithState(auth);
    latestCookie = refreshResp.cookie || auth.cookie || '';
    auth.cookie = latestCookie;
    const newToken = getHeader(refreshResp.headers, 'x-token') || getHeader(refreshResp.headers, 'X-Token');
    if (newToken) setHeader(auth.headers, 'x-token', newToken);
    writeJSON(CONFIG.authKey, auth);
    lines.push(`✅ refreshSession：HTTP ${refreshResp.statusCode}｜${extractShort(refreshResp.body)}`);
  } catch (e) {
    lines.push(`❌ refreshSession 失败：${e.message || e}`);
    notify('❌ 中国移动APP签到', '会话刷新失败', lines.join('\n'));
    return done();
  }

  if (markStatus) {
    try {
      // wx.10086.cn 的 QWHD_SESSION_TOKEN/jsessionid-cmcc 和 refreshSession 不同域，必须用当时保存的 wx cookie。
      const resp = await fetchWithState(markStatus, { cookie: markStatus.cookie });
      const cls = classify(resp.body);
      lines.push(`${iconForStatus(cls)} markstatus：HTTP ${resp.statusCode}｜${extractShort(resp.body)}`);
    } catch (e) {
      lines.push(`❌ markstatus 失败：${e.message || e}`);
    }
  }

  if (businessPrizes) {
    try {
      // 同上，保持 wx.10086.cn 原始 Cookie，避免被 refreshSession 的跨域 Cookie 覆盖后返回 HTML 等待页。
      const resp = await fetchWithState(businessPrizes, { cookie: businessPrizes.cookie });
      const cls = classify(resp.body);
      lines.push(`${iconForStatus(cls)} businessPrizes：HTTP ${resp.statusCode}｜${extractShort(resp.body)}`);
    } catch (e) {
      lines.push(`❌ businessPrizes 失败：${e.message || e}`);
    }
  }

  if (!sign) {
    if (markStatus || businessPrizes) {
      lines.push('⚠️ 已能查询签到状态/奖品接口，但还没抓到真正“点击签到/领取”的动作接口。');
      lines.push('👉 如果页面显示可签到，请再手动点一次签到按钮，让脚本保存动作接口。');
      writeJSON(CONFIG.resultKey, { at: new Date().toISOString(), ok: false, status: 'query_only', lines });
      notify('⚠️ 中国移动APP签到', '已完成状态查询，缺少动作接口', lines.join('\n'));
      return done();
    }
    lines.push('⚠️ 尚未抓到真正签到/领取接口；refreshSession 只证明会话可用，不等于签到成功。');
    lines.push('👉 请手动进中国移动APP签到页点一次签到/领取，让脚本保存真实接口。');
    writeJSON(CONFIG.resultKey, { at: new Date().toISOString(), ok: false, lines });
    notify('⚠️ 中国移动APP签到', '缺少签到接口', lines.join('\n'));
    return done();
  }

  try {
    const signHeaders = Object.assign({}, sign.headers || {});
    const token = getHeader(auth.headers, 'x-token');
    if (token && new URL(sign.url).host === new URL(auth.url).host) setHeader(signHeaders, 'x-token', token);
    // 动作接口也优先用自己抓到的同域 Cookie，避免 refreshSession 跨域 Cookie 覆盖 wx.10086.cn 会话。
    const signResp = await fetchWithState(sign, { headers: signHeaders, cookie: sign.cookie });
    const cls = classify(signResp.body);
    const icon = iconForStatus(cls);
    lines.push(`${icon} 签到接口：HTTP ${signResp.statusCode}｜${extractShort(signResp.body)}`);
    writeJSON(CONFIG.resultKey, { at: new Date().toISOString(), ok: cls === 'success' || cls === 'already', status: cls, lines });
    notify(`${icon} 中国移动APP签到`, cls === 'success' ? '签到/领取成功' : cls === 'already' ? '今日已完成' : cls === 'invalid' ? '登录失效' : '结果需确认', lines.join('\n'));
  } catch (e) {
    lines.push(`❌ 签到接口失败：${e.message || e}`);
    writeJSON(CONFIG.resultKey, { at: new Date().toISOString(), ok: false, lines });
    notify('❌ 中国移动APP签到', '执行失败', lines.join('\n'));
  }
  return done();
}

if (typeof $request !== 'undefined') {
  handleCapture();
} else {
  runTask().catch(e => {
    notify('❌ 中国移动APP签到', '脚本异常', String(e && e.stack || e));
    done();
  });
}
