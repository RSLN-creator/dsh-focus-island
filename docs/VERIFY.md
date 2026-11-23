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
- 伪 composer 写入文字 → 快照 `paused`，等 1.1 s 再 tick `elapsedMs` 不变；
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
