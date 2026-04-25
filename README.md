# 中国移动 APP / 移动营业厅签到 Quantumult X 脚本

## ✅ 当前结论

老板给的这条抓包：

```text
POST /biz-orange/DN/refreshSession
Host: client.app.coc.10086.cn
Cookie: JSESSIONID=...; UID=...
x-token: ...
x-sign / x-nonce / x-time / xs: ...
```

**有用，但它更像“刷新/验证会话”的接口，不一定是真正签到接口。**

所以这个脚本做成两段式：

1. ✅ 先抓 `refreshSession`，保存 cookie、x-token、x-sign、xs 等会话头
2. ✅ 再自动保存你手动点击签到/领取时出现的真实接口
3. ⏰ 定时执行时：先刷新会话，再重放真实签到接口

如果只抓到了 `refreshSession`，脚本不会误报签到成功，会提示：

```text
⚠️ 尚未抓到真正签到/领取接口
```

## 文件

- 脚本：`cmcc-app-checkin-quanx.js`
- 导入配置：`quanx-import.conf`

## Quantumult X 使用方式

### 1. 添加重写

把 `quanx-import.conf` 里的 `[rewrite_local]` 和 `[task_local]` 导入 Quantumult X。

### 2. MITM hostname

需要 MITM：

```text
client.app.coc.10086.cn
*.10086.cn
```

### 3. 抓 refreshSession

打开 Quantumult X 重写和 MITM 后：

1. 打开中国移动 APP
2. 进入首页 / 我的 / 权益 / 签到相关页面
3. 等待出现 `client.app.coc.10086.cn/biz-orange/DN/refreshSession`
4. 脚本提示：

```text
✅ 中国移动APP
已保存 refreshSession 会话
```

### 4. 抓已验证的 `wx.10086.cn` 两个接口

你提供的这两个接口我已从服务器侧试过：

- ✅ `POST /qwhdhub/api/mark/mark31/markstatus`：返回 `code=SUCCESS`，能查到签到状态/累计任务信息
- ✅ `POST /qwhdhub/api/mark/info/businessPrizes`：返回 `code=SUCCESS`，能查奖品信息，目前响应 `data=[]`

脚本已单独保存这两个接口。定时运行时会先执行它们，用来确认页面状态。

⚠️ 但这两个更像“状态查询/奖品查询”，还不一定是“点击签到动作接口”。如果通知显示：

```text
⚠️ 已完成状态查询，缺少动作接口
```

说明还需要你在页面上真正点一次“签到/领取”，让脚本抓到动作接口。

### 5. 抓真正签到接口

继续在 APP 里手动点一次：

- 签到
- 领取
- 做任务
- 福利 / 权益相关领取按钮

脚本会自动保存路径里包含这些关键词的请求：

```text
sign / signin / checkin / draw / receive / reward / task / finish / complete / lottery / activity / coupon / point / score / rights / welfare / benefit / daily
```

看到提示：

```text
✅ 已保存疑似签到/领取接口
```

就说明后续定时可以重放。

## 定时

默认每天 08:30 执行：

```text
30 8 * * *
```

## 结果判断

通知状态：

- ✅ `refreshSession` 成功：只代表会话可用
- ✅ `markstatus` 成功：代表签到状态接口可查询
- ✅ `businessPrizes` 成功：代表奖品接口可查询
- ✅ 签到接口返回“成功/已签到”：任务完成
- ⚠️ 只抓到状态/奖品接口：可以查询，但还缺少真正点击签到/领取的动作接口
- ⚠️ 没抓到签到接口：需要手动点一次签到让脚本保存真实接口
- ❌ token/cookie 失效：重新抓包

## ⚠️ 注意

- `x-sign` / `x-time` / `x-nonce` 可能是动态签名。如果真实签到接口强校验动态签名，单纯重放可能失败。
- 这个脚本会明确显示失败原因，不会把 `refreshSession` 成功误报成签到成功。
- 老板给的 `refreshSession` 抓包里有 `x-token + Cookie`，目前足够做会话保存和刷新测试；真正能不能签到，要看后续抓到的签到接口是否允许重放。


## 直接导入链接

QuanX 配置：

```text
https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/quanx-import.conf
```

脚本 raw：

```text
https://raw.githubusercontent.com/eleven252412/cmcc-app-checkin-quanx/main/cmcc-app-checkin-quanx.js
```
