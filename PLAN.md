# dsh-focus-island — 想法与实现计划

> 目标：DeepSeek 官方 UI（DSH Web GUI）右上角的「灵动岛」插件。核心不是好看的倒计时，而是
> **把你从「坐着看 AI 干活」里捞出来**：只有你被动停留、既不打字也不发送时它才计时，你一发送就作废重来。

## 0. 我对需求的理解（逐条）

| 需求 | 我的实现 |
|---|---|
| 右上角悬浮 | 注册进官方 `shell.overlay`（frame 级浮层），`position: fixed`，`top: 56px`（标题栏下方）、右侧留 16px |
| 跟随右侧分界线 | 读右侧栏列 `[data-rightbar-col]` 的实际宽度，`right = inset + 16`，`ResizeObserver` + frame `data-rightbar-*` 属性观察，220ms 缓动跟随；全屏右栏时隐藏 |
| 与官方面板风格一致 | 只用 `--dsw-alias-*` 语义令牌；中性边框 0.5px；官方半径/阴影；配色跟随明暗主题 |
| 动效 | 宽度/高度/`transform` 的 spring 曲线（`cubic-bezier(.34,1.3,.64,1)`），内容交叉淡入，进度环 `stroke-dashoffset`；`prefers-reduced-motion` 降级 |
| 检测输入框 | 读 `[data-composer-input]`（官方 contenteditable）的文本：非空 = 正在组织语言 |
| 只在你「干看」时计时 | 计时条件：页面可见且窗口有焦点 ∧ 输入框空 ∧ 不在输入 ∧ 未发送。模型是否在生成只影响文案，不影响计时（两条需求读法都覆盖） |
| 时长 10 分钟–4 小时 | 整数分钟，clamp 到 [10, 240]，默认 25；设置面板滑杆 + 10/25/45/90/180 预设 |
| 到点提醒 | 展开显示「你已在这个没有对话的窗口里停留 N 分钟」，暖色警示 + 一次性脉冲 |
| 跳过要二次确认 | 第一次点击只是「待确认」，卡片内出现确认态，文案明写「确认你知道这段时间仍被消耗」；确认后停止计时直到你下次发送 |
| 发送即打断重置 | composer 内 Enter（非 shift）或主发送按钮点击 → `onUserSend()` 清零重计 |
| 展开/收缩灵动岛 | 收缩 = 148×34 胶囊（呼吸点 + mm:ss + 细进度条）；展开 = 300px 卡片；两者共用同一 spring 过渡 |
| 资源占用（扩展） | Host 半采样 CPU（`os.cpus()` 差分）/内存（`os`）+ GPU/温度（`nvidia-smi`，失败为 null），同源 HTTP 路由 3s 轮询；客户端四条 mini 仪表 |

## 1. 做不了 / 降级项（先说清楚）

1. **「本次会话单独的资源占用」拿不到真实数字。** 浏览器只有整机视角：Host 侧看到的是整个
   `dsh` 进程树的 CPU/内存，页面拿不到「这个会话」的精确分摊（模型推理在远端 API，本地只有网络与
   渲染开销）。实现为：显示**整机** CPU/GPU/内存/温度，并在 UI 上标注「本机」而不是伪造会话占比。
2. **GPU / 温度依赖 `nvidia-smi`。** 没有 NVIDIA 显卡或 PATH 里没有该命令时逐项显示 N/A，不影响其余功能。非 Windows 同理会降级。
3. **倒计时是「页面可见 + 窗口有焦点」才走。** 切到别的窗口工作不扣时间——这正是插件想鼓励的行为；如果你希望「留在前台就算」需要改一个判定。
4. 官方没有对外暴露「turns 正在流式生成」的客户端事件或服务（只有 connection/locale/slots/theme 四个事件），
   所以模型忙碌状态用 DOM 启发式判断（composer 里是否出现「停止」按钮 + 会话区是否有文字变动），
   可能有一两秒的判定延迟；计时逻辑不依赖它。

## 2. 分阶段（必须先完美基础功能，再做扩展）

- **P0 骨架**：新建 `D:\9_Code_Workspace\dsh-focus-island`；`package.json` / `cordis.patch.yml` /
  Host `apply` / Client `ModuleLoader` bundle；安装进 `desktop` profile，确认 `shell.overlay` 出现占用者。
- **P1 基础功能（完美交付）**：core 状态机（计时/暂停/到点/跳过双确认/发送重计）、岛 UI（收缩/展开/到点/确认/设置）、
  右侧分界线跟随、明暗主题、动效、localStorage 持久化、双语。
- **P2 扩展**：Host 资源采样 + 客户端轮询 + 卡片内四条仪表；失败降级 N/A。
- **P3 验收**：语法/单测、安装结果 `application: applied`、`cordis_inspect_query Slots` 看到占用者、
  页面刷新后肉眼验收（无浏览器自动化工具，最终观感需你确认）。

## 3. 技术决策记录

- **不分包、不构建框架**：Client 保持「一个 `lib/client.js` bundle」的官方动态插件形态；三个源文件
  （`core.js` / `widget.js` / `monitor-client.js`）由 `build.mjs` 拼接成 `lib/client.js`（去掉 `export` 关键字），
  这样多人并行写文件也不会互相踩，且 loader 侧零构建依赖。
- **计时用时间戳差分**，不用累加 delta：浏览器后台标签会节流 `setInterval`，差分不会漂移。
- **计时与 UI 解耦**：`core.js` 纯逻辑（可注入时钟、可单测），`widget.js` 纯展示（只吃 props + api），
  集成层只做 DOM 观测与持久化。
- **不注入宿主 React 树**：只注册 `shell.overlay`，绝不改官方节点；定位靠读外壳布局几何，不读其他插件的 DOM。

## 4. 进度（完成）

- [x] 调研：`shell.overlay`、主题令牌、布局 DOM（`data-rightbar-col` / `data-rightbar-fullscreen`）、composer DOM
- [x] 骨架与契约（core / widget / monitor），三人并行：`timer-core` / `widget-ui` / `sys-monitor`
- [x] P1 核心与 UI 合并（`lib/client-main.js` 集成 + `build.mjs` 拼接 + `verify/integration-smoke.mjs`）
- [x] P2 资源采样（`lib/host-monitor.js` + `lib/monitor-client.js`，本机 `nvidia-smi` 可用）
- [x] 安装与验收：`application: applied`，`shell.overlay` 出现 active 占位；四套验证 41 + 17 + 113 + 装配图全绿
- [x] 观感验证：用真实 React 18 + 官方 `ui-theme` 样式表渲染各状态截图检查（临时工具与截图属过程产物，验收后已删除）
- [ ] 需用户肉眼确认：刷新页面后的实际位置/手感/动效；重启 dsh 后资源仪表出数

详细证据见 [docs/VERIFY.md](docs/VERIFY.md)。

## 5. 本次踩到的真实约束（留给下次）

1. `ctx.webServer.register` 的真实签名是 `{ kind: 'exact', path, handler(req, res) }`，不是 `{ method: 'GET', path }`。
2. Host 半改动（新增 HTTP 路由）在桌面端必须重启 dsh 才加载；Client 半刷新页面即可。
3. `shell.overlay` 的直接子元素由官方样式 `pointer-events: auto` 兜底，但插件自己显式声明更稳。
4. 官方客户端**没有**对外暴露「正在流式生成」的事件（client Event 只有 `connection/reset`、`locale/change`、
   `slots/changed`、`theme/change`），所以忙碌状态只能启发式；`shell.overlay` 的 standard props 里有
   `useSessionStatus` 座椅可作为后续正式替换路径。
5. `--dsw-radius-xl` 并不存在（官方样式里没有 `--dsw-radius-*` 令牌），需要字面量兜底。


## 6. 第二轮（UI 反馈后）

- 官方会话 header 最小高度实测 76px（`ConversationRoot.module.css`），所以岛不能再写死 top:56；改为从
  `[data-conversation-header-leading]` 找到 `<header>`，取 `rect.bottom + 10` 作为 `topInset` 传进组件。
- 收缩态资源微条的坑：`<span>` 默认 inline，`height:100%` 解析为 0 → 微条看不见；`display:block` 修复。
- 数值语义：CPU/内存来自 `node:os` 差分，GPU 利用率与温度来自 `nvidia-smi`；没有 CPU 温度，所以标签写「GPU 温度」。
- 资源轮询 2s、CPU/内存采样 1s、GPU 4s；颜色分级阈值写在 widget 的 `resourceItems()` 里。
- 中文命名：惜时岛 / 提醒间隔（英文仍是 Focus Island）。
