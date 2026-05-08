# 中国移动 APP / 移动营业厅签到 Quantumult X 脚本

## 当前结论

已从移动营业厅 `qwhdmark` 前端确认真实日历签到接口：

```http
POST https://wx.10086.cn/qwhdhub/api/mark/mark31/domark
Content-Type: application/json;charset=UTF-8

{"date":"YYYYMMDD"}
```

已实测：

```json
{"date":"20260426"}
```

返回：

```json
{"status":"HAVE_MARKED","msg":"今日已签到过，无法再次签到"}
```

说明接口正确，只是当天已经签过。

## 文件

- 脚本：`cmcc-app-checkin-quanx.js`
- 导入配置：`quanx-import.conf`

## 工作方式

1. 抓包模式：打开中国移动 APP 的签到/心愿金页面，脚本从 `wx.10086.cn/qwhdhub` 请求与响应里保存：
   - `QWHD_SESSION_TOKEN`
   - `yx`
   - `jsessionid-cmcc` / `JSESSIONID` 等同域会话辅助 Cookie
   - `Referer` 里的活动 token
   - 必要请求头
   - 最近 10 次 Cookie 快照摘要（只存名称、长度、短 hash，不存明文到通知里），方便对比今天/昨天变化
   - 响应头里的 `Set-Cookie`，用于保存服务端轮换后的最新 `QWHD_SESSION_TOKEN`
   - 不再保存 `gdp/gio` 埋点 Cookie；它们每次打开 APP 都会轮换，保存反而会制造无效变化提示
2. 定时模式：每天自动执行：
   - 先访问已保存的 `qwhdmark` 页面，尝试用页面 token 刷新 `QWHD_SESSION_TOKEN`
   - `user/info` 验证登录态
   - `mark31/domark` 执行签到
   - `mark31/markstatus` 复查今日状态

## 一键导入

原始配置文件：

```text
https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/quanx-import.conf
```

脚本 raw：

```text
https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js?v=20260508-no-volatile-x-headers
```

真正一键导入（新版，避开旧缓存）：

```text
quantumult-x:///add-resource?remote-resource=https%3A%2F%2Fraw.githubusercontent.com%2Feleven252412%2Fcmcc-app-checkin-quanx%2Fmain%2Fquanx-import-v20260429.conf&tag=%E7%A7%BB%E5%8A%A8%E8%90%A5%E4%B8%9A%E5%8E%85%E7%AD%BE%E5%88%B0&img-url=https%3A%2F%2Fraw.githubusercontent.com%2Fgithub%2Fexplore%2Fmain%2Ftopics%2Fquantumult-x%2Fquantumult-x.png
```

## QuanX 配置

```ini
[rewrite_local]
^https?:\/\/wx\.10086\.cn\/qwhdhub\/(qwhdmark\/.*|api\/mark\/.*) url script-request-header https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js?v=20260508-no-volatile-x-headers
^https?:\/\/wx\.10086\.cn\/qwhdhub\/(qwhdmark\/.*|api\/mark\/.*) url script-response-header https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js?v=20260508-no-volatile-x-headers

[task_local]
30 8 * * * https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js?v=20260508-no-volatile-x-headers, tag=移动营业厅签到, enabled=true

[mitm]
hostname = wx.10086.cn
```

## 首次使用

1. 导入配置。
2. 打开 QuanX 重写和 MITM。
3. 打开中国移动 APP。
4. 进入签到 / 心愿金 / 任务页面。
5. 看到通知：

```text
✅ 移动营业厅签到 / 已保存 QWHD 会话
```

之后定时任务即可自动执行。

## 通知说明

- 成功/已签：`移动营业厅签到 / 签到成功 / 签到成功 | 当月签到次数X`
- 移动营业厅当前 `markstatus.userinfo.accumulateTimes` 实际表示当月累计签到次数，不是积分
- 脚本链接已追加版本参数，用于避开 QuanX/Raw 缓存；如果仍显示旧文案，请删除旧资源后重新导入
- 抓包保存时会显示 `Cookie对比：变化/新增/消失`，用于看今天和昨天具体哪些 Cookie 变了；若看到 `已刷新 QWHD 响应会话`，表示已保存响应 `Set-Cookie` 里的新会话
- 2026-05-08 起不再复用 APP 动态生成的 `x-sign` / `x-time` / `x-nonce` / `x-token` 等临时签名头，避免隔天定时继续带旧签名导致“会话过期/鉴权失败”
- 如果响应头里出现新的 `Location: /qwhdmark/...?...token=QWHDSSOD...`，脚本会同步保存成新的活动页 token URL，后续定时优先用新 token 刷会话
- ⚠️ 结果需确认：接口返回未知状态，需查看通知详情
- 签到失败、登录失效、接口异常时才保留详细诊断信息

## 注意

- 公开版不包含任何 Cookie / token。
- 这个脚本只做移动营业厅 `wx.10086.cn/qwhdhub` 的日历签到，不处理云盘云朵脚本。
- 已保留 `jsessionid-cmcc` / `JSESSIONID` 等同域辅助 Cookie，并在定时前先刷新活动页会话，尽量避免 `QWHD_SESSION_TOKEN` 每天轮换导致定时直接失效。
- 已过滤 `gdp/gio` 埋点 Cookie；这些 Cookie 每次打开 APP 都可能变化，不代表登录态变化。
- 2026-05-08 起定时请求不再复用 APP 临时生成的 `x-sign` / `x-time` / `x-nonce` / `x-token` 等签名头，避免把昨天的动态签名带到今天导致误判成会话过期。
- 如果响应里返回新的 token 页面跳转 `Location`，脚本会自动保存新的 `qwhdmark` token URL，减少旧页面 token 失效后的手动刷新频率。
- 如果页面 token 本身也被服务端吊销，仍需重新打开中国移动 APP 签到页刷新一次。

## 更新记录

### 2026-05-08 18:03:24 CST
- 修复移动营业厅定时请求会复用 APP 动态签名头的问题；现在不再带昨天抓到的 `x-sign` / `x-time` / `x-nonce` / `x-token` 去跑今天的签到，降低“会话过期”误报概率。
- 响应抓包新增保存 `Location` 里的最新 `qwhdmark?...token=QWHDSSOD...` 页面 URL，后续定时优先用新 token 刷会话。
- 更新 `quanx-import.conf` / `quanx-import-v20260429.conf` 脚本版本参数，避免 QuanX/Raw 缓存继续拉旧脚本。
