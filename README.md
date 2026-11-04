# 惜时岛 · dsh-focus-island

DeepSeek Harness（DSH）Web UI 插件：右上角一个**灵动岛形态**的计时与状态面板。

它解决的不是「怎么计时」，而是**「我又坐着看 AI 干活看了半小时」**：只有当你被动停留
（页面可见且有焦点、输入框空、没在打字、没在发送）时才计时；你一发送消息，计时立刻作废重来。
到点用暖色提醒告诉你「你已在这个没有对话的窗口里停留 N 分钟」。想干正事时，还可以开一个
**自定义任务倒计时**（任务名 + 时长），和被动计时并列显示；任务到点用另一套蓝色提醒。

没有构建框架、没有 npm 依赖、不改官方任何 DOM：Client 半是一个官方 `__ModuleLoader__` 动态
bundle，只往官方 `shell.overlay` 座位注册一个浮层。

---

## 功能

### 计时

| 能力 | 说明 |
|---|---|
| 被动停留计时 | 条件：页面可见 ∧ 窗口有焦点 ∧ composer 草稿为空 ∧ 未在输入 ∧ 未发送。模型是否在生成只影响文案，不影响计时 |
| 提醒间隔 | 10 分钟 – 4 小时（整数分钟，clamp），默认 25；设置里 stepper + 10/25/45/90/180 预设 |
| 到点提醒 | 展开显示「你已在这个没有对话的窗口里停留 N 分钟」+ 暖色警示 + 一次性脉冲 |
| 跳过 | **必须二次确认**：第一次点击进入确认态，文案明写「确认你知道这段时间仍被消耗」；确认后停表直到你下次发送消息 |
| 发送即重置 | composer 内 Enter（非 Shift）或主发送按钮点击 → 清零重计 |
| 输入即暂停 | 开始打字 / 草稿非空 → 冻结计时（不重置）；清空草稿后从冻结值继续 |
| 切窗口即暂停 | 页面隐藏或窗口失焦 → 暂停；这正是插件想鼓励的「去干别的」 |
| 自定义任务倒计时 | 任务名 + 1–240 分钟；与被动倒计时**并列两栏**显示；到点切蓝色「任务时间到」卡片（再来一次 / 知道了） |
| 持久化 | 计时进度、偏好、任务都写 `localStorage`，刷新/重开页面继续 |
| 桌面通知 + 提示音 | 到点/任务到点时发系统通知并响提示音；两者**默认开启**，可在设置里分别关闭 |

### 形态与外观

- **收缩态**：单胶囊 —— 状态色圆环（绿=计时中 / 琥珀=暂停 / 红=到点）+ 倒计时 + 系统当前时间，
  第二行是 CPU / GPU / 内存 / GPU 温度 的数值与彩色微条。
- **展开态**：卡片 —— 顶部状态点 + 「惜时岛」+ 右上角收起；居中大号倒计时（有任务时变两栏）；
  动作行（跳过 / 设置）；**本机资源**区；**设置**区（设置展开时资源区位置不动，只在它下面长出来）。
- 尺寸档位：收缩态「紧凑 / 标准 / 大」三档（默认标准 1.2×），设置里可调。
- 不透明度：卡片背景 60–100% 可调（默认 88%），叠加 `backdrop-filter` 模糊，和官方菜单观感一致。
- 语言：岛内中文 / English 可切换（不影响整个 DSH 的语言）。
- 主题：只用 `--dsw-alias-*` 语义令牌，明暗主题自动跟随；动效为 `cubic-bezier(.34,1.3,.64,1)`
  弹簧，`prefers-reduced-motion` 下自动降级。

### 资源监视（扩展）

- 数据来自 **Host 半**：CPU/内存用 `node:os` 差分，GPU 利用率 / GPU 温度用 `nvidia-smi`。
- 页面每 **2 秒**轮询同源路由 `/dsh-focus-island/resources`；Host 端 CPU/内存 1 秒、GPU 4 秒采样。
- 收缩态与展开态都显示；数值按阈值换色：占用 <60% 绿 / 60–85% 琥珀 / ≥85% 红；
  温度 <60 / 60–80 / ≥80；缺失显示 `--`。
- **口径是整机，不是本会话**（原因见下方限制）；温度是 **GPU 温度**，不是 CPU 温度。

---

## 安装

本插件按 DSH 官方 profile bundle 方式安装（不要手写 profile 的 `package.json` / `cordis.patch.yml`）：

```
plugin_manager { action: "install_bundle", target: "D:\\9_Code_Workspace\\dsh-focus-island" }
```

- Client 半：刷新页面生效。
- Host 半（资源路由）：随 bundle 挂到运行中的 Loader。若安装时未生效，把 bundle 关一次再开一次
  （`plugin_manager set_bundle enabled:false` → `true`）即可热加载，**不需要重启 dsh**。
- 卸载：`plugin_manager { action: "remove_bundle", target: "dsh-focus-island" }`。

---

## 开发

```
package.json            bundle 清单（dsh.bundle + dsh.client）
cordis.patch.yml        一行 insert：dsh-focus-island
build.mjs               把 lib/{core,widget,monitor-client,client-main}.js 拼成 lib/client.js
lib/core.js             专注状态机（纯逻辑、可注入时钟、可单测）
lib/widget.js           灵动岛视觉（React createElement，无 DSH 依赖）
lib/monitor-client.js   资源轮询（fetch + 退避 + 可见性暂停）
lib/client-main.js      DOM 观测（composer/焦点/布局/拖动）、任务计时、持久化、shell.overlay 注册
lib/host-monitor.js     可选：CPU/GPU/内存/温度采样 + 同源 HTTP 路由
lib/index.js            Host 半入口（惰性加载 host-monitor，失败不影响倒计时）
```

改任意 `lib/*.js` 源文件后必须重新生成 bundle：

```powershell
node build.mjs          # 生成 lib/client.js
node build.mjs --check  # 校验 lib/client.js 是否与源一致
```

验证（无浏览器、无依赖，全部 node 直跑）：

```powershell
node verify/core.test.mjs          # 计时状态机（41 项）
node verify/monitor.test.mjs       # 资源采样/轮询（17 项）
node verify/widget-smoke.mjs       # 视觉树 / CSS 令牌 / 布局结构（329 项）
node verify/notify-smoke.mjs       # 通知/提示音开关与触发（默认开、关掉就静默）
node verify/integration-smoke.mjs  # 伪浏览器 + 伪 Cordis：装配、右栏跟随、topInset、输入暂停、发送重置
```

`integration-smoke.mjs` 值得单独说：它把生成后的 `lib/client.js` 丢进伪造的 `window/document`，
按官方 `__ModuleLoader__` 协议取工厂、用伪 ctx 调 `apply`，再断言：

- `shell.overlay` 恰好一个占位（id `dsh-focus-island`）；
- 伪 `[data-rightbar-col]` 宽 420 → 组件收到 `rightInset = 420`；
- 伪官方 header 高 76 → 组件收到 `topInset = 86`（76 + 10 间距）；
- 往伪 composer 写字 → 快照变 `paused` 且 1.1 s 后 `elapsedMs` 不涨；派发非 Shift Enter → 回到 `counting` 且归零。

---

## 时间是怎么算的（以及为什么有时感觉忽长忽短）

- **用时间戳差分，不是每秒累加**：内部只记「当前计时片段的起点」，每次刷新用
  `now - 片段起点 + 已冻结时间` 求已计时。浏览器后台节流、掉帧都不会让时间漂移，也不会重复触发。
- **只有被动状态才走表**：打字、草稿非空、窗口失焦、页面隐藏都会**冻结**（不是清零）；
  恢复被动后从冻结值继续。所以「你实际坐着的 10 分钟」和「表走的分钟数」本来就可能不等——
  中间打字/切窗口的碎片时间被有意抹掉了。
- **发送 = 清零重来**（不是接着走）；跳过之后停表，直到下次发送。
- **显示的是剩余时间**；到点后卡片显示「已停留 N 分钟」。
- **刷新页面**：正在走的进度会保留并重新锚定（离线期间不计费）；
  但**到点提醒不会因为刷新而重复弹**（`finished` / `skipped` 快照不恢复，刷新即开始新一轮）。

---

## 通知与声音

到点（被动停留用完）和任务倒计时结束时，插件会同时尝试两个通道：

- **桌面通知**：用浏览器 `Notification` API 发一条系统通知（带页面图标，同一类提醒用 tag 合并，不会叠一屏）；
  首次开启时向系统申请通知权限，设置里的开关行会在未授权时提示「需要允许系统通知」。
- **提示音**：Web Audio 现场合成的两段短音（到点用上行「叮咚」，任务到点用短促提醒音），**不打包音频文件**；
  播放结束会挂起 AudioContext，不会让音频设备一直占着。

两个开关在 **设置 → 通知**里，**默认都开启**，可以只留一个；每行下面有「测试」按钮，可以当场试。
桌面端（Electron）里系统通知本身静音，声音由插件自己的提示音负责。

> 通知/声音的封装与音型参考了 [`@dingyi222666/dsh-session-notification`](https://github.com/dingyi222666/dsh-session-notification)
> （BSD-3-Clause）：同一套受控的 `Notification` 包装与 Web Audio 播放器，裁到本插件需要的两类提醒。

---
## 资源与隐私

- 只在浏览器 `localStorage` 里存三类数据：`dsh-focus-island:v1:prefs`（间隔/外观/语言/任务）、
  `dsh-focus-island:v1:state`（计时快照）。
- 不向任何远端上报；资源数据只在本机 Host 采样、同源返回给页面。
- 路由要求同源凭据（页面内 `fetch(..., { credentials: 'same-origin' })`），外部请求返回 401。

---

## 已知限制

1. **「本次会话单独的资源占用」做不到。** 模型推理发生在远端 API，浏览器与 Host 都只有整机视角，
   没有「本会话 CPU/GPU」这种可测量量。所以资源区显示**整机**并明确标注「本机资源」，不伪造占比。
2. **GPU 利用率与 GPU 温度依赖 `nvidia-smi`。** 没有 NVIDIA 卡或命令不在 PATH 时这两项显示 `--`。
   CPU 温度需要额外拉 WMI/驱动，本插件不做。
3. **模型「正在生成」是 DOM 启发式**（composer 里是否有「停止」按钮、会话区 1.5 s 内是否有文字变动）。
   官方客户端没有暴露流式状态事件；该状态只影响圆点颜色/动画，不参与计时。
4. **切到别的窗口不扣时间**，这是设计意图。若想「只要页面开着就算」，改
   `lib/client-main.js` 中 `createPresenceSeat().sync()` 的 `visible` 判定即可。
5. 计时精度：显示到秒，内部 tick 250 ms 用时间戳差分，后台标签节流也不会漂移。

## 许可

MIT
