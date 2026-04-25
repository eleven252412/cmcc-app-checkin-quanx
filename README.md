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

1. 抓包模式：打开中国移动 APP 的签到/心愿金页面，脚本从 `wx.10086.cn/qwhdhub` 请求里保存：
   - `QWHD_SESSION_TOKEN`
   - `yx`
   - `Referer` 里的活动 token
   - 必要请求头
2. 定时模式：每天自动执行：
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
https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js
```

真正一键导入：

```text
quantumult-x:///add-resource?remote-resource=https%3A%2F%2Fraw.githubusercontent.com%2Feleven252412%2Fcmcc-app-checkin-quanx%2Fmain%2Fquanx-import.conf&tag=%E7%A7%BB%E5%8A%A8%E8%90%A5%E4%B8%9A%E5%8E%85%E7%AD%BE%E5%88%B0&img-url=https%3A%2F%2Fraw.githubusercontent.com%2Fgithub%2Fexplore%2Fmain%2Ftopics%2Fquantumult-x%2Fquantumult-x.png
```

## QuanX 配置

```ini
[rewrite_local]
^https?:\/\/wx\.10086\.cn\/qwhdhub\/(qwhdmark\/.*|api\/mark\/.*) url script-request-header https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js

[task_local]
30 8 * * * https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js, tag=移动营业厅签到, enabled=true

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

- ✅ `user/info`：登录态有效
- ✅ `domark`：签到成功或今日已签
- ✅ `markstatus`：复查签到状态成功
- ❌ 登录态失效：重新打开 APP 签到页抓会话
- ⚠️ 结果需确认：接口返回未知状态，需查看通知详情

## 注意

- 公开版不包含任何 Cookie / token。
- 这个脚本只做移动营业厅 `wx.10086.cn/qwhdhub` 的日历签到，不处理云盘云朵脚本。
- `QWHD_SESSION_TOKEN` 可能会过期；过期时重新打开中国移动 APP 签到页即可刷新。
