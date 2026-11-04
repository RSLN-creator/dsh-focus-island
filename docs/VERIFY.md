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