# 验收记录（dsh-focus-island 0.1.0）

环境：Windows，DSH desktop profile（`C:\Users\rsyhn\.dsh\profiles\desktop`），GUI `http://127.0.0.1:12872`。
原则：能自动验的都自动验；**没验过的写「未验证」**，不把推测写成结论。

## 1. 静态与单元验证

| 检查 | 命令 | 结果 |
|---|---|---|
| 生成物与源一致 | `node build.mjs --check` | `lib/client.js is up to date` |
| 计时状态机 | `node verify/core.test.mjs` | **PASS 41 tests** |
| 资源采样与轮询 | `node verify/monitor.test.mjs` | **17 checks passed** |
| 视觉树 / 布局结构 / 令牌 | `node verify/widget-smoke.mjs` | **329 checks passed** |
| 整体装配 | 
ode verify/integration-smoke.mjs | `integration smoke: OK` |
| 通知/提示音 | `node verify/notify-smoke.mjs` | `notify smoke: OK`（默认开 → 1 条通知 + 和弦；两个都关 → 全静默） |

`integration-smoke.mjs` 断言（伪浏览器 + 伪 Cordis 驱动生成后的 `lib/client.js`）：

- `shell.overlay` 恰好一个占位，id `dsh-focus-island`；
- 伪 `[data-rightbar-col]` 宽 420 → 组件收到 `rightInset === 420`；
- 伪官方会话 header 高 76 → 组件收到 `topInset === 86`；
- 伪 composer 写入文字并按键 → 快照仍是 `counting`，等 1.1 s 再 tick `elapsedMs` 上涨（打字不停表）；
- 派发非 Shift Enter → 快照回到 `counting` 且 `elapsedMs <= 150`；
- 卸载无异常。

## 2. 安装与运行时验证

`plugin_manager install_bundle` → `application: applied`，`warnings: []`，profile 依赖为链接安装
（`dsh-focus-island 0.1.0 <- D:\9_Code_Workspace\dsh-focus-island`）。

活页面证据（`cordis_inspect_query` → Client `Slots.listSubTree { root: "shell.overlay" }`）：

```json
{ "registrant": "Gb", "id": "dsh-focus-island", "order": 950, "priority": 0, "active": true }
```

说明 bundle 解析、`apply`、座位注册都成功。

Host 半（资源路由）验证：bundle 关/开一次后，
`GET /dsh-focus-island/resources` 由 **404 → 401**。401 表示路由已注册、要求同源凭据；
页面内 `fetch(..., { credentials: 'same-origin' })` 与已经正常工作的 code-explainer 插件同一模式。
**未验证**：页面里四条资源仪表是否真的出数（需要刷新后肉眼确认；若仍为 `--`，说明同源鉴权未带上，需要换取数方式）。

## 3. 观感验证方式

没有浏览器自动化控制权，观感通过「同一份 `lib/widget.js` + 真实 React 18 + 官方 `ui-theme` 的
`design-platform.css` / `gradient-shadow-text.css` / `base.css` / `corner-shape.css`」在 headless Edge
里渲染各状态截图检查（收缩 / 展开 / 两栏任务 / 设置 / 到点 / 任务到点 / 明暗主题 / inset=420），
确认无裁切、无遮挡、顺序正确、数值与颜色分级正确。按用户要求，**仓库里不保留这些过程截图**。

## 4. 未验证项（需要用户肉眼确认）

1. 真实页面上的最终位置、鼠标手感、动效顺滑度。
2. 资源数字是否真的出数、采样是否跟手。
3. 拖动右侧分栏时的跟手程度（已做：`data-dragging` 时禁用 `right/top` 过渡 + `style` 属性观察 + rAF 合帧）。

## 5. 第三轮改动摘要

- 自定义任务倒计时（名称 + 1–240 分钟），与被动计时**两栏并列**，任务到点用蓝色独立卡片；
- 设置重整为三个框：提醒间隔 / 自定义任务 / 外观与其他（资源开关、不透明度、收缩大小、语言），
  **本机资源区位置固定**，设置只在它下面展开；
- 收缩态尺寸三档（默认 1.2×），收起按钮与展开态同一 34×34 右上角命中区；
- 岛内中英文切换；
- 拖动右栏时位置逐帧跟随（拖动中禁用过渡）；
- 计时 tick 250 ms。

## 6. 第四轮改动摘要

- 通知 + 提示音：`lib/notify.js`（受控 `Notification` 包装 + Web Audio 合成音型，参考 `@dingyi222666/dsh-session-notification`，BSD-3-Clause）；
  在「被动到点」「任务到点」两个状态边沿各触发一次，两个开关默认开启，设置 → 通知里可分别关闭并各自带「测试」按钮。
- 收缩态缝隙：去掉 `.dfi-card` 上的 `--dsw-elevation-panel/prominent`（里面那圈 `0 0 0 0.5px` 发丝描边在半透明底上形成灰框+白边），改为纯投影；hover 只加深投影。
## 7. 第五轮改动摘要

- 设置里「测试」按钮移到开关左侧同一行；设置区控件字号/高度整体收紧（chips 11.5px/24px、输入 12.5px/28px、分段按钮 11.5px/24px、行高 34px、框内边距 0 10px）。
- 按下胶囊时左右露白：移除 `.dfi-pill:active` 的 `transform: scale(.985)`（按压只换背景），内容交叉淡入也不再缩放。
- 不透明度 100% 仍透：底色从半透明的 `--dsw-specific-menu`（alpha 0.5–0.58）改为不透明的 `--dsw-alias-bg-overlay` + `color-mix` 百分比，100% 完全不透明。
- 验证：widget-smoke 352 项、core 41、monitor 17、integration、notify-smoke 全绿。
## 8. 第六轮改动摘要

- 「自动再来」：被动到点提醒弹出后，若 N 分钟（默认 2，1–60 可调，设置 → 提醒间隔 → 自动再来）内没有任何操作，集成层自动 `core.reset()` 清零再计时一轮，到点再次提醒；提醒期间点击岛上任意按钮视为已处理，本轮不再自动重复。
- 验证：新增 `verify/auto-repeat-smoke.mjs`（可控时钟：到点 → 1 分钟仍在等待 → 超过 2 分钟自动进入 counting → 下一轮再次 finished → 点击后不再自动重复），widget-smoke 379 项（新设置行/范围/clamp/文案）。

## 9. 第七轮改动摘要（收缩态去数字）

- 收缩态第二行改为**四条裸彩条**：删掉 `CPU / GPU / MEM / GPU℃` 标签与 `43% / 97%` 数值，只留轨道 + 填充；
  条高 4px → 5px，左右内边距对齐胶囊首行（左与圆环齐、右给 chevron 让位 40px），底部留白 9px。
- 读数不丢：条带 `title` 与胶囊 `aria-label` 都带完整「CPU 43% · GPU 97% · 内存 66% · GPU 温度 77°C」；
  展开卡片里的仪表（带名称 + 数字）不变。
- 未知值不再印 `--`：收缩态里该段只显示变淡（45% 不透明度）的空轨道，避免看起来像 0%。
- 文案表去掉不再使用的 `resources.cpuShort / gpuShort / memShort / tempShort` 四个键（zh/en 同步删除）。
- 验证：`node build.mjs --check` 通过；core 41、monitor 17、widget-smoke **374**、integration、notify、auto-repeat 全绿。
- 观感：headless Edge 按真实 CSS 渲染三档尺寸（1.0 / 1.2 / 1.4）明暗两主题截图逐张确认——条不裁切、左右与首行对齐、明暗都读得出长度与颜色。

## 10. 第八轮改动摘要（胶囊内边距收进一套网格）

- 问题：圆环只在胶囊顶边下 2px（首行原本是写死 34px 高、30px 圆环在里头居中，那 2px 是居中剩下的余量），而上/左/下别处都已经是 12px，所以「上边距没设好」。
- 改法：删掉首行的固定 34px 高，首行高度改由内容（圆环）决定、上内边距 12px×scale，左内边距由 7px 收到 12px×scale；`CAPSULE_PAD = 12` 单一常量供首行与彩条共用。
- 圆环↔彩条间距**保持不变**（7px×scale，实测 1.2 档仍是 8.4px，与上一版逐像素相同）；彩条左右/下方维持 12px（你确认过「刚刚好」的那处）。
- chevron 命中区不再贴 `top: 0`，改为按 `CAPSULE_PAD + RING_SIZE/2 − HIT/2` 落在圆环轴上（实测 chevron 中心与圆环中心差 0.0px）。
- 实测（headless Edge 计算值 + 3× 截图，1.2 档）：圆环上 14.4 / 左 14.4、彩条左 14.4 / 右 14.4 / 下 14.4、圆环→彩条 8.4、胶囊高 79.2（上一版 67.2）。
- 验证：`node build.mjs --check` 通过；core 41、monitor 17、widget-smoke **377**、integration、notify、auto-repeat 全绿；展开卡片未受影响（同参数重渲染比对一致）。

## 11. 第九轮改动摘要（渲染卡顿：去玻璃、去常驻动画、降脉冲）

用户反馈「渲染卡顿」，并授权若纯白/纯黑可行就整块去掉透明玻璃、按 DSH 的黑白体系来。

**定位到的三条开销（都读在源码上，不是猜的）：**

| # | 位置 | 开销 |
|---|---|---|
| 1 | `.dfi-card` 的 `backdrop-filter: blur(20px) saturate(1.2)` | 岛浮在会滚动的对话之上，模糊必须**每帧重读并重算身后内容**——对话一滚动就是每帧一次全区域模糊 |
| 2 | `.dfi-ringWrap::after` / `.dfi-ringArc` / `.dfi-liveDot::after` 三处 `animation: … infinite` | 页面**永远进不了空闲态**，第 1 条的每帧代价变成常驻；即使计时暂停也在跑 |
| 3 | 根与卡片的常驻 `will-change: top, right, opacity` / `width, height` | 整只浮层被永久钉在独立合成层，白占显存与重绘调度，而它只在拖动右栏的瞬间才动 |

**附带找到的两处每脉冲开销：**

| # | 位置 | 开销 |
|---|---|---|
| 4 | `window.setInterval(…, 250)` 的 tick | `core.publish` 把订阅合并到**整秒**、界面也显示整秒，250 ms 等于每个可见变化跑四次；每次还带 `getState()`、composer 文本读、composer 按钮全扫、两次 `getBoundingClientRect`（强制样式/布局刷新） |
| 5 | `layout.refresh()` 每脉冲无条件重测 | 同上，强制布局读；真正需要的只是「会话切换后 header 被换掉」这一种情况 |

**改法：**

- 底色改为**不透明官方表面** `--dsw-alias-bg-layer-1`（浅色 `#fff`、深色 `#232324`，取自 UI-theme 包的 `--dsw-static-neutral-bluish-00 / 875`）；删掉 `backdrop-filter`、`color-mix` 透明度混合与整套不透明度设置（滑杆、`OPACITY_*`、`clampOpacity`、`dfi-slider` 样式、`settings.opacity*` 文案 zh/en）。
- 删掉三处 `infinite` 动画与对应 `@keyframes`（`dfi-breathe` / `dfi-ringPulse` / `dfi-halo`），状态改由**颜色与弧长**表达；`prefers-reduced-motion` 块同步删掉失效选择器。
- 删掉两处常驻 `will-change`（宽度/高度与 top/right 的过渡仍是短动画，动画期间浏览器自己会提升）。
- tick 250 ms → **1000 ms**；`layout.refresh` 改为 `refreshIfStale()`：只读 `isConnected`（零布局成本），节点真被换掉时才 `requestAnimationFrame` 里重测；新增 `layout.remeasure()` 留给确实需要强测的路径。
- composer 节点加了带 `isConnected` 失效检查的缓存，`sync()` 不再每脉冲两次全树 `querySelector`。

**验证（可复跑）：**

- `verify/integration-smoke.mjs` 新增三条断言，并**做过反向变异**确认它们真的会红：
  - 脉冲间隔必须是 `[1000, 5000]`；
  - 空闲脉冲 `columnRect / headerRect` 读取次数必须都是 **0**（把 `refresh: refreshIfStale` 改回 `refresh: schedule` ⇒ 立刻报 `an idle pulse must not read the column rect`）；
  - header 被替换（`isConnected=false`）时必须触发一次重测。
- `verify/widget-smoke.mjs` 新增四条样式断言：卡片必须用 `bg-layer-1`、全表无 `backdrop-filter`、无 `infinite`、无 `will-change`（把 `backdrop-filter` 注回去 ⇒ 立刻报 `no backdrop-filter`）。断言改为在**去掉注释后的规则文本**上匹配，避免注释里的词句造成假红/假绿。
- 六套验证全绿：core 41、monitor 17、widget-smoke **371**、integration、notify、auto-repeat；`build.mjs --check` 通过。
- 观感：3× 与 2× 截图确认收缩态（明暗两主题）与展开态在纯白/纯黑下可读，展开卡片设置区少了「不透明度」一行，其余顺序不变。

**未验证 / 已知边界：**

- 帧时间**没能实测**：本机 headless Edge 的 CDP 通道在沙箱里一直挂起（`--virtual-time-budget` 又会把渲染开销抹平），所以没有「改前 32 ms / 改后 16 ms」这种读数。上面给的是**可复跑的代码级断言**（脉冲频率、布局读次数、样式禁用），不是帧率数字。
- 「动画期间自动提升合成层」是浏览器行为，未逐帧取证；若日后发现展开/收起瞬间掉帧，可在过渡开始/结束时手动加/撤 `will-change`。

## 12. 第十轮改动摘要（提醒界面的跳过失效 + 视图规范 + 字阶统一）

用户报了四点，其中第 1 点是**真缺陷**，第 3 点是**规范没落地**，第 2、4 点是观感与字号。

**① 提醒界面的「跳过」是死按钮（真缺陷）**

- 根因：`core.skipArm()` 只在 `counting / paused / idle` 时置 arm，`finished` 直接 `return getState()` 什么都不做。提醒卡在 `finished`，所以点「跳过」既不 arm 也不报错——界面毫无反应，只有「重新计时」有用。
- 改法：`skipArm()` 允许从 `finished` 进入 arm；`skipConfirm()` 从 `finished` 走 `enterSkipped()`，把这一轮钉死为终态（不会被「自动再来」重新拉起来）。`skipCancel()` 回到 `finished`，仍是提醒卡。
- 文案分离：计时中的跳过问「跳过本次提醒？」，提醒卡上的跳过问「结束本轮提醒？」——同一套两步机制，但用户读得懂自己在结束什么。
- 新增两个 core 单测（共 **43** 项）。**反向变异**：把 `finished` 那段 arm 删掉 ⇒ `the reminder can arm a skip` 立刻红。

**② 「跳过」图标换成同族描边**

- 旧图标是实心三角形 + 竖条（媒体播放「下一曲」），岛内其余图标都是 1.5px 描边，实心块显得突兀。
- 新图标为描边 skip-forward，且 `makeIcon` 不再对 skip 单独走 `fill: currentColor`——所有图标统一 `fill: none; stroke: currentColor`。

**③ 视图规范：所有界面共用同一条 header 基线**

- 根因：`finished / confirm / taskDone` 三个包装层各自写了 `padding: 0 16px`，而它们内部的 `.dfi-expHdr` **也**自带 16px 左内边距 ⇒ 提醒界面的「惜时岛」实际缩进 32px，正常界面 16px，切换时标题会横向跳动。
- 改法：包装层水平内边距归零，正文/副文/按钮行改为各自 `margin: … 16px …`；`.dfi-main` 从 18px 收到 16px，全岛只用一条 16px 竖线。
- 顺带统一：`dfi-btnPrimary` 由官方 `button-primary-fill`（深色下≈纯白实心块）改为 `button-info-fill`（DeepSeek 蓝），与「任务时间到」的蓝色卡同族，两张提醒卡不再一个白一个蓝。
- 观感核对：五个视图（normal / finished / confirm / taskDone / settings）逐一 2× 截图并排比对，「惜时岛」左缘落在同一竖线、同色、同字号。

**④ 字阶统一（点名 8 处降一档）**

- 原字阶有 10 个值（11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 27 / 38），收为 **5 档 + 2 个大号**：`FS_XS 11 / FS_SM 12 / FS_MD 12.5 / FS_LG 13 / FS_XL 14`，另加两个倒计时 27 / 38。11.5 与 13.5 这两个散值全部吸附到相邻档。
- 点名的四处（写周报输入、紧凑/标准/大、中文/English、两个「测试」）统一落到 **xs 11**（原先 12.5 / 11.5 / 11.5 / 11.5）。
- 顺手修掉全盘检查发现的两处：「语言 / Language」这种双写标签换行显示（改为单写「语言」/「Language」，与其他行一致）；`dfi-main` 的 18px 与 16px 基准不符。
- 断言：widget-smoke **389** 项，新增「每个 font-size 都必须落在字阶上」的遍历断言（把任一 `11px` 改成 `11.5px` ⇒ 立刻报 stray），以及「三个提醒包装层不得有水平 padding」「`.dfi-expHdr` 单一内边距」两条几何断言。

**验证**：core 43、monitor 17、widget-smoke 389、integration、notify、auto-repeat 全绿；`build.mjs --check` 通过。
## 13. 第十一轮改动摘要（移除自定义任务 + 胶囊底部留白）

- 移除设置里的「自定义任务」分区及其全部下游：任务名/时长表单、两栏倒计时、蓝色「任务时间到」卡、`createTaskSeat`、`api.getTask/startTask/cancelTask/clearTask`、`taskDone` 通知与短促提示音。`lib/widget.js`、`lib/client-main.js`、`lib/notify.js` 共删除约 280 行，未遗留任何 `task*` 符号（生成物 `lib/client.js` 同步重建）。
- 设置区从四个框收为三个：提醒间隔 / 外观与其他 / 通知。
- 修复收缩态底部留白：12px 下内边距从资源条 `.dfi-pillRes` 移到胶囊 `.dfi-pill` 上。隐藏「显示资源占用」时资源条整行消失，圆环不再贴住胶囊底边；资源条显示时总高度不变（仍是「圆环 12px 上 + 7px 条距 + 12px 底」）。
- headless Chromium 实测（真实 widget CSS）：三档尺寸 × 资源开/关，圆环或彩条到胶囊底边均为 `12 × scale`（1.0 / 1.2 / 1.4 分别为 12 / 14.6 / 17.2 px）；资源关闭时胶囊高度 54 / 65 / 76 px，资源开启时 66 / 79 / 92 px，无裁切。
- 静态断言更新：`.dfi-pill` 必须带底部 12px，`.dfi-pillRes` 底部为 0；「自定义任务」相关文案与节点断言全部移除。
- 验证：core 43、monitor 17、widget-smoke 316、notify、auto-repeat、integration 全绿；`build.mjs --check` 通过。

## 14. 第十二轮改动摘要（动效/内存、颜色与字阶统一、可输入区间）

- **动效与内存**：卡片投影从 16px 大范围阴影降为单一的 `0 1px 4px`（morph 时不再每帧重栅格化整圈阴影）；hover 只换底色，不再移动/加深阴影；`width/height` 形变 420ms→240ms 并去掉 `border-radius` 过渡；`.dfi-card` 加 `contain: layout paint style`、`.dfi-content` 加 `contain: layout paint`，把每帧布局/绘制隔离在岛内部；墙钟只在 HH:MM 变化时有意义，tick 1s→30s（倒计时仍走 core 的每秒发布）。
- **跳过按钮**：去掉图标后的「跳过」二字，跳过与设置统一为 28×28 图标按钮，`title`/`aria-label` 保留完整语义。
- **颜色统一**：计时中的圆环、展开态进度条、两个开关统一为 `--dsw-alias-state-business-primary`（DeepSeek 蓝）；进度条去掉二次渐变；暂停琥珀 / 到点红仅保留为状态色。
- **间隔区间**：core `DURATION_MIN/MAX` 改 **5 / 180**；设置里数字框可直接键入任意整数，± 仍按 5 分钟步进，预设 5/15/30/45/60/180。自动再来改 **0–10**（0 = 关闭，提示文案切换）；Host 侧 clamp 与自动重启条件同步（0 不再自动再来）。
- **字阶**：新增最底档 **10**，用于「紧凑/标准/大」「中文/English」「测试」与预设 chips；普通按钮文字 12.5→12；步进数字框 12。
- 验证：core 43、monitor 17、widget-smoke 325、notify、auto-repeat、integration 全绿；`build.mjs --check` 通过。新增断言：三处强调色必须是同一个 business token、hover 不得重绘阴影、卡片必须 `contain`、跳过按钮必须为纯图标、两个数字框的 min/max 必须为 `[5,180]` 与 `[0,10]`。

## 15. 第十三轮改动摘要（减少重渲染与零分配热路径）

- **消除双重渲染**：`IslandHost` 原先同时订阅 core／locale／resources，而 widget 内部也各自订阅同一批数据；结果是每次倒计时 tick 都先渲染 host、再渲染 widget 两遍。现在 host 只订阅布局（右栏宽度/header/拖动），数据订阅全部由 widget 自己持有，一次 tick 只渲染一个组件。
- **静态子树记忆化**：设置面板与四条资源仪表改用 `React.useMemo`，只在各自输入变化时重建；倒计时每秒更新不再重建设置树。资源项与摘要也从每次渲染算两遍改为一次计算、两处复用。
- **core 热路径零签名分配**：删掉每秒构造的两个数组 + 两个 `join('~')` 字符串 + `Array.from(listeners)` 快照，改为与上一份 state 逐字段比较、直接遍历 Set。每秒少 3 次分配、2 次字符串拼接和 1 次数组拷贝，判断结果完全等价（无哈希碰撞风险）。
- **Host CPU 采样零重复归一化**：CPU 时间基线改为入库时归一化一次，`normalizeCpuTimes` 对已归一化条目原样返回；每次采样少 16 个临时对象（16 逻辑核），差分公式未变。
- 验证：core 43、monitor 17、widget-smoke 325、notify、auto-repeat、integration 全绿；`build.mjs --check` 通过；生成物 141,310 字节。

## 16. 第十四轮改动摘要（动效改为合成层入场 + 计时不再被输入打断）

- **实测**：旧版 `width/height` 形变在真机上由内置 rAF 探针量到 `69ms max · 2/78 帧 >25ms`，肉眼可见顿挫；把动效整段关掉（瞬时切换）时同样操作 0 掉帧、主观完全顺。结论：卡顿来自逐帧改变卡片宽高（每帧重新栅格化被裁剪的文字），不是挂载成本、也不是资源轮询。
- **动效重构**：卡片宽高**不再做过渡**（一次布局落到最终尺寸），改为在 `data-mode` 切换时播放入场动画 `dfi-open`——`transform: scale(0.94) → 1` + `opacity 0.55 → 1`，180ms（展开）/140ms（收起），`transform-origin: top right`。整段只动合成层属性，布局与文字栅格化在动画期间一次都不发生；换态瞬间用 `data-swapping`（DOM 属性，非 React state）关掉就地高度过渡，避免高度过渡与缩放入场同时改布局。稳态仍无 `will-change`、无常驻合成层。
- **内容锚点**：`.dfi-content` 由 `left: 0` 改 `right: 0`。卡片右缘固定在屏幕右侧，文字布局一次成型，窗口在它周围张开；换态时文字既不滑动也不重新折行。
- **计时语义修正**：暂停条件收窄为**仅「页面隐藏 / 窗口失焦」**。打字、草稿非空、模型在生成都不再冻结计时；发送仍然清零重来。此前「明明没输入却变琥珀暂停」的两个可疑来源同时被切断：composer 的 `MutationObserver` 不再把程序化改动（发送后清空、占位符刷新）当作打字；草稿与打字标志只进状态，不再参与 `blockReason()`。
- **临时诊断（已移除）**：卡片下方曾有一行 10px 探针（`xxms max · n/m >25ms · k render` + `phase/reason v/t/d/s`）。真机签核读数 `54ms max · 4/64 >25ms · 2 render`，用户判定「速度满意、可以收工」，于是连同 `MORPH_PROBE`、`.dfi-probe` 一起删除；`widget-smoke` 增加断言，防止探针常量或样式回流。
- 验证：core 43（打字/草稿/发送三组断言改写为「不停表」「发送即新轮」）、monitor 17、widget-smoke 325、notify、auto-repeat、integration 全绿；`build.mjs --check` 通过。

## 17. 第十五轮改动摘要（令牌层落地 + 跳过状态独立并持久化）

前十四轮都是「调观感」，这一轮第一次动结构：把散落在规则里的设计常量收成三层令牌，并修掉两处状态语义错误。

- **实测的漂移量**（`audit-tokens.mjs` 对改前代码）：**24 处字面量字号、5 处字面量圆角、24 处字面量动效时长**。字阶当时声称 6 档，实际生效 8 个值（10/11/12/12.5/13/14/15/38），15 和 38 是两处硬编码；圆角 1.5/2/6/7/10px 五个值无令牌；时长 90–1100ms 共 13 个不同值。
- **令牌层**：`.dfi-root` 上声明 `--dfi-fs-*`（八档）、`--dfi-dur-*`（fast/base/slow/sweep/deco 五档，覆盖原 13 个值）、`--dfi-radius-track`。圆角凡是官方已有的直接改用 `--dsw-radius-sm/md/xl`（chip 7px→8px、settings box 10px→12px、switch→50%），只剩资源条另立一个。改后审计：**0 / 0 / 0**。
- **reduced-motion 从 19 条 `!important` 改为零化令牌**：旧规则列了 19 个选择器加 `transition-duration: 0ms !important; animation: none !important`，但 `.dfi-card` / `.dfi-content` 的入场用的是 `animation:` 简写，**不在这份列表里**——所以开了「减少动态效果」后，被列出的全部冻住，两条最长（420/480ms）的入场反而照常播。现在一条规则把五个时长令牌设为 `0ms`，入场一起归零；`animation: none` 只留给两个纯装饰层。
- **跳过状态独立成视图**：`viewKey()` 过去把 `skipped` 折进 `finished`，于是点了「跳过」的人马上被告知「你已在这个没有对话的窗口里停留 31 分钟」。现在 `skipped` 有自己的视图、自己的文案（「本轮已跳过」）、报**实际计入**的分钟数（`elapsedMs`，不是 `watchedMs`），并且不再给一个无可跳的跳过按钮。
- **跳过可以跨刷新存活**：`client-main.js` 恢复存档时排除了 `finished` / `skipped`，等于刷新即丢弃「这一轮已经结束」。而 `expanded`、`skipArmed` 却从偏好里恢复——活下来的恰好是用户刚清掉的那部分。现在两种终态都按原样恢复，直到下次发送才开新轮。
- 验证：core **44**（新增「skipped 快照恢复后仍是 skipped」）、monitor 17、widget-smoke **336**（新增 8 项跳过视图断言 + 1 项「任何规则不得带字面量字号」）、notify、auto-repeat、integration（新增 1 项刷新后仍是 skipped）全绿；`build.mjs --check` 通过；`audit-tokens.mjs` 0 漂移。

## 18. 第十六轮（严格模式 + 官方像素鲸遮罩）

需求原话：「在实时界面加一个『严格模式』开关按钮，按钮文字就是『严格模式』四个字，配一个开关控件……
倒计时结束进入界面时必须全屏遮罩，只保留官方那个像素鲸……下面保留当前正在进行的绘画名称，以及绘画已进行多少分钟……
开启严格模式后，不能自动跳过计时，那些跳过按钮和计时按钮都要跳过。那怎么让这个遮罩消失呢？
在右下角放一个合适大小的按钮，按钮文字是『跳过严格模式』。点击之后就相当于重新打开这个界面，然后从五分钟重新开始计时。」
（「绘画」按 DSH 语境还原为「会话」。）

- **官方像素鲸是复用，不是重画**：图源是 `@deepseek-ai/dsh-client-ui-brand-official` 的 `breach-atlas.webp`
  （2304×1296，137 帧 @ 192×108，12 列）。逐字节复制到 `lib/assets/breach-atlas.webp`
  （189208 字节，SHA256 `6AB7C778…EAF63`），由 `build-atlas.mjs` 转成 base64 data URL 写进 `lib/whale-atlas.js`。
  `verify/whale.test.mjs` 断言「内嵌 data URL 解码后与 vendored 文件逐字节相同」，所以不存在「看起来像」的中间态。
- **通道语义从官方源码读出来、并用合成图集验证**：红通道＝点半径，绿通道＝覆盖度（alpha 在这张图集里恒为 255）。
  官方第一次播放是**点阵**、第二次是**代码字**；用户要求「都要」，所以遮罩按轮交替两种官方填充，第一轮固定是点阵像素鲸。
- **共 12 处改动**：新增 `lib/whale.js`（渲染器）、`lib/whale-atlas.js`（生成物）、`build-atlas.mjs`（生成脚本）、
  `lib/assets/breach-atlas.webp`（官方图集）；`lib/widget.js` 加严格模式开关行、全屏遮罩、按严格模式隐藏提醒卡与跳过/重计按钮；
  `lib/client-main.js` 加 `getSessionTitle`／`getStrictMode`／`setStrictMode` 并把渲染器注入 widget、严格模式下跳过自动再来；
  `build.mjs` 纳入两个新模块并剥离模块间 `import`。
- **为什么渲染器由 api 注入而不是 import**：`widget.js` 既被 unit 测试单独加载，又被 `build.mjs` 拼进一个函数体；
  相对 import 在第二种场合会变成悬空名字。改成 `api.attachWhale` + `api.whaleAtlasUrl` 后，两种场合都成立。
- **三条硬约束各有独立判据**：`widget-smoke` 断言遮罩里**只有一个按钮**且没有「重新计时」文案、Escape 不关遮罩；
  `strict-smoke` 用同一场景对照证明「strict 开＝到点 30 分钟仍 finished，strict 关＝2 分钟后自动再来」；
  `render-smoke` 在真实 Chromium 里量「遮罩 = 1280×800 @ (0,0)」「卡片 display:none」「退出按钮在右下 24px」。
- **反向变异（`verify/mutation.mjs`，10 项）**：首次运行时它自己抓出**三处无效断言**——
  ①变异只改源文件不重建 bundle，读 bundle 的测试看不到改动；②「通道读错」用像素数判别无效（红通道本来就限定在剪影内，
  换通道照样出形状）；③会话名解析只断言了源码里的正则字符串。修正后 10 项全部能被对应断言抓住。
- **验证**：core 44、monitor 17、widget-smoke **382**、whale **20**、notify、auto-repeat、strict-smoke、
  integration-smoke、**render-smoke（真实 Chromium，明暗两套：pass1=11700 px / pass2=28697 px）**、
  audit-tokens 0 漂移、`build.mjs --check` 与 `build-atlas.mjs --check` 均通过、mutation 10/10。
- **未验证**：真机（用户桌面里的 DSH 窗口）观感与手感未由用户确认；本轮只做到「真实 Chromium 里的几何与像素」。

## 19. 第十七轮（严格模式第二轮反馈：会话列表 / 两个出口 / 开关位置）

用户三条反馈：①「有时同事会有多个会话，但界面只列出一个会话，需要把多个会话都列出来」；
②「退出严格模式可能不准确，需要再加一个按钮，让我选择是退出本轮还是退出所有严格模式」；
③「严格模式设置应该放在设置里面……不应该在我缩小为弹窗、展开的时候就看到严格模式的按钮」。
随后补充：每行的用时必须是**该会话自己的**「深度求索中，用时 19分25秒 ···」，并去掉中间那句停留分钟。

- **开关移入设置**：严格模式行从卡片正面移到「设置 → 外观与其他」，并且整行仍是 `role="switch"`。
  切换后自动收起设置面板（它的效果正好发生在被面板盖住的表面上）。
  `widget-smoke` 断言：卡片正面与收缩胶囊都**不得**出现「严格模式」字样（用 `uiText()` 读，排除
  in-tree `<style>` 里的注释，避免假阳性）。
- **列表只列运行中的会话**：数据来自 `shell.overlay` 注入的 `useSessions` + `useSessionStatus`，
  与侧边栏自己那套判定一致（`status.running ?? session.running`）。当前会话按
  `retainedBy.mainView > 0` 判定并排在最前；空白会话列出来但显示「未命名会话」；已停下的会话不列。
- **每行是它自己的用时**：官方的「深度求索中，用时 {duration} ···」读的是该会话的 turn 时间轴
  （`turn.start.time`），overlay 座位拿不到；官方 `useSessionStatus` 只给
  `running / pendingInteraction / completionUnread`。所以插件在 `running` 的上升沿记起点、写进偏好，
  刷新不把还在干活的会话打回 1 秒。格式与文案对齐官方的 `duration.compactMinutes` / `compactSeconds`。
- **两个出口**：「跳过本轮」（重计 5 分钟，**保留**严格模式）与「退出所有严格模式」
  （重计 5 分钟，**关掉**严格模式）。后者是次级样式，不是最容易被点到的那个。
- **中间那句消失了**：`strict.line` / `.dfi-maskLine` / `.dfi-maskMins` 全部删除，
  `render-smoke` 断言遮罩里不存在 `.dfi-maskTitle` 与 `.dfi-maskLine` 节点。
- **顺手修掉的真 bug**：`runningSessionsFrom` 在没有注入 hooks 时调用 `syncRunStarts([])`，
  会把所有已测到的起点清空 —— 于是任何一次没有 props 的渲染都会让在线会话的用时回到 1 秒。
  现在无 hooks 时只返回空列表，不动已记录的状态。
- **验证**：core 44、monitor 17、widget-smoke **400**、whale 20、notify、auto-repeat、strict-smoke、
  integration-smoke、**render-smoke（真实 Chromium，明暗两套，三行分别读出 19分25秒 / 3分12秒 / 25秒）**、
  audit-tokens 0 漂移、两个 `--check` 通过、**mutation 14/14**（新增两个出口、每行用时、开关位置、
  已停下会话、起点记录）。
- **仍未验证**：真机观感；以及「多会话同时运行」在真实 DSH 里是否真能一次看到多行 —— 判据用的是
  官方会话存储的合成状态，真实多会话场景需用户真机确认。

## 20. 第十八轮（无会话状态 / 活计时 / 提问必须让位）

用户三条反馈：①遮罩里没有会话时不能显示「未命名会话 · 深度求索中，用时 1秒」，要一个官方口径的
「空闲中」状态；②遮罩上的计时不能停，也要覆盖没有会话的情形；③有提问时（`ask_user_question`、审批）
用户完全看不到，要求「跳过严格模式，让提问显示出来」。

- **删掉凭空造的那一行**：`runningSessionsFrom` 现在只收 `running` 或 `pendingInteraction` 的会话。
  之前空列表会兜底塞一行 `untitled`，读起来像有个会话正在生成。空白且没在跑的会话一律不列。
- **空闲行**：没有活跃会话时，遮罩渲染一行「空闲中」+「已停留 3分02秒」，从遮罩出现那一刻起计时。
  文案对齐官方「深度求索中，用时 …」的句式；`data-idle` 标记让状态点用中性色而不是业务蓝。
- **活计时**：遮罩自带 1 秒脉冲（`maskClock` 状态）。到点后状态机不再 publish，墙钟又只有 30 秒一跳，
  所以以前计时看着是冻住的。现在每会话行与空闲行都每秒重算；等待中的会话从 `pendingSince` 计时，
  不从已经停下的 `running` 起点计时。
- **提问让位**：判断用官方 `SessionStatus.pendingInteraction`（侧栏红点、composer 提问卡读的同一个事实）。
  遮罩期间出现 → 走「跳过本轮」同一条出口（关遮罩、重计 5 分钟、严格模式保持开启），**不替你回答、不跳过问题**。
  非遮罩期间 → 一次系统通知 + 提示音（受通知/提示音开关控制），卡片加一行「有提问待回答」，
  收缩胶囊把系统时间换成「待回答」，状态点转琥珀。
- **顺带修掉的隐患**：`useSessions` / `useSessionStatus` 以前是在遮罩渲染函数里调用的，等于 hook 数量
  随「遮罩是否出现」变化；现在每次渲染固定位置读一次。
- **验证**：core 44、monitor 17、widget-smoke **422**（新增空闲行、空闲秒表每秒+3 秒、行用时 25秒→30秒、
  待回答让位 + `reset` + 通知、胶囊「待回答」、英文 Idle）、whale 20、notify、auto-repeat、strict-smoke、
  integration-smoke（新增：空白空闲会话不出行、运行与会话各一行且文案不同、`pendingStarts` 落盘）、
  **render-smoke（真实 Chromium，明暗两套）**、audit-tokens、两个 `--check`、**mutation 17/17**
  （新增「空闲时凭空造行」「有提问时遮罩不让位」两处变异）。
- **仍未验证**：真机观感；真实 DSH 里提问的 `pendingInteraction` 与遮罩的先手顺序（1 秒脉冲内让位），
  以及通知权限已授时是否真的弹系统通知 —— 需用户真机确认。

## 21. 第十九轮（文档准确性 + 英文 README）

外部只读审计（另一 AI，参考 `main@985ab01`，无写权限）提出的六处文档缺陷逐条对着源码复核，**六处全部属实**，全部修正：

| 文件 | 原描述 | 实际 |
|---|---|---|
| `lib/core.js` | `clampDurationMinutes` JSDoc 写 `[10, 240]`、clamp 到 10/240 | 常量与实现都是 `[5, 180]` |
| `lib/whale.js` | 头部说每轮第一遍是 code 填充 | `fill = 'dots'` 起步，下一轮才切 code |
| `lib/monitor-client.js` | `@param intervalMs` 默认 2000、正文说 Host 缓存 2000 ms | 默认 5000；Host CPU/内存最多每 1000 ms 刷新、GPU 15 s |
| `lib/widget.js` | 资源订阅注释写 ~3 s | 客户端 5 s |
| `build.mjs` | 「four authored parts」；生成 banner 说「composer empty, not typing」「10 min .. 4 h」 | `PARTS` 七个；计时含打字/草稿，区间 5 min–3 h |
| `README.md` | 资源区写「页面每 2 秒轮询、GPU 4 秒采样」 | 5 s 轮询、GPU 15 s（4 s 实测烧掉一个核心 2.5%） |

- **新增 `README.en.md`**（审计提供的英文版，逐条核对后补上 `dsh plugin add` 安装路径），两份 README 顶部互加语言导航，`package.json` 的 `files` 收录 `README.en.md`。
- 审计关于「矩阵/数学依赖」的结论保留为不采纳：仓库里没有矩阵求解器，唯一的密集像素负载是严格模式的 Canvas 鲸（192×108 × 137 帧、≤24 FPS），加数学库不会改善它；注释也不做批量删除（widget 的注释大多是生命周期与无障碍理由）。
- **验证**：`node build.mjs` 重建后 `--check` 与 `build-atlas.mjs --check` 一致；11 个 verify 脚本全通过（core 44 / monitor 17 / widget 422 / whale 20 / notify / auto-repeat / strict / integration / render-smoke 真实 Chromium / mutation 17/17）；`audit-tokens` 0 漂移；七个独立模块 `node --check` 通过；三个 JSON 解析通过；`git diff --check` 干净。
- **说明**：`lib/client-main.js` 是拼接片段（顶层 `return createIslandPlugin()`），单独 `node --check` 必然报 `Illegal return statement`，它的语法由 `node --check lib/client.js` 与 integration-smoke 覆盖。`render-smoke` 本机有 Chromium 与借用的 `playwright-core`，实际执行而非跳过。

## 22. 第二十轮（冷启动从零 / 1 分钟下限 / 跳过图标 / 遮罩期间少做 DOM）

用户四条：①继续优化；②开机后刚开软件会直接进「已跳过」界面，应该从零计时；③提醒间隔要能填 1–180 任意整数（预设 5 倍数不动）；④跳过图标只要三角形、去掉右侧竖杠，且与齿轮矢量同样大。

- **冷启动从零**：每 5 秒写快照时附带心跳 `pulseAt`；开机读快照，`now - pulseAt > 120 s`（或没有心跳）判定为冷启动 → `core.reset()` 从零开始，不再把上一轮的 `finished/skipped` 卡重摆出来。同一进程内刷新心跳只有几秒，仍照旧恢复（保留住当初「刷新别丢掉已结束那一轮」的修复）。测试：`integration-smoke` 三次启动同一份存储，分别用 1 秒心跳（保持 skipped）、10 分钟心跳（变 counting 且 elapsed < 2 s）、无心跳（按冷启动）。
- **1–180 分钟**：`core.DURATION_MIN_MINUTES` 与 widget 的 `DUR_MIN` 同步从 5 降到 1；± 仍按 5 分钟步进、六个预设不动。widget 测试新增：输入 1/37/12 被接受并作用到 core，输入 0 夹到 1（不再是 5），181 夹到 180，`step` 仍为 5。
- **跳过图标**：`skip` 改用与齿轮同一个 24 格 viewBox、同样 14px 渲染、同样 2px 描边，路径只剩一个闭合三角形（`M7.6 3.4L21.5 12 7.6 20.6z`），右侧竖杠删除。用真实 Chromium 渲 14px 与 4× 对照图确认两者视觉尺寸一致。测试：skip 与 gear 的 viewBox/宽高/描边相等、skip 只有一条子路径且无竖杠。
- **优化（①）**：严格遮罩期间（`strictMode && phase === 'finished'`）跳过每秒一次的存在探测（composer 文本读取 + 按钮扫描），那块屏幕被遮住、输入框不可达，探测纯属在主线程上是白工；遮罩让位或退出会 reset，下一个脉冲立刻重新同步，状态最多滞后 1 秒。
- 版本 0.3.1 → **0.3.2**。
- **验证**：core 44、widget-smoke **442**、integration（新增冷启动/热刷新/无心跳三例）、strict、notify、auto-repeat、monitor 17、whale 20、render-smoke（真实 Chromium，连跑两次通过）、mutation 17/17、audit-tokens 0 漂移、`build --check` 与 `build-atlas --check` 一致。
- **一次抖动如实记下**：改动初期 render-smoke 有一轮报 15 项失败，重跑同一份代码连续两次全绿，未能复现；判据未放宽，后续再遇到会按真实缺陷查。
