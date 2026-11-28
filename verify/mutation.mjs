// 反向变异：把实现故意改坏，确认新增断言真的会失败（而不是永远绿）。
// 每一项都改 source 里的**行为**，重建 bundle，跑测试，然后恢复。
//
// 这个文件存在的原因：本轮首跑时它自己暴露了三处**无效断言**——只有真正改坏
// 代码才能发现「测试全绿但根本没测到」，读源码字符串的断言就是典型。
//
// Run: node verify/mutation.mjs   （必须在仓库根执行，内部会调用 build.mjs）

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const files = ['lib/widget.js', 'lib/whale.js', 'lib/client-main.js']
const originals = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]))

function restore() {
  for (const [f, text] of originals) writeFileSync(f, text)
  /* Put the bundle back too, or the next case (and the repo) would keep a
   * mutation nobody asked for. */
  execFileSync(process.execPath, ['build.mjs'], { stdio: 'pipe' })
}

function mutate(file, from, to) {
  const text = originals.get(file)
  /* The working tree is CRLF (git autocrlf); the anchors below are written with
   * LF for readability, so normalise before matching and put the original line
   * endings back afterwards. */
  const lf = text.replace(/\r\n/g, '\n')
  if (!lf.includes(from)) throw new Error(`mutation anchor not found in ${file}: ${from.slice(0, 60)}`)
  writeFileSync(file, lf.replace(from, to).replace(/\n/g, '\r\n'))
  /* The integration/strict/widget-render tests load the GENERATED bundle, not
   * the sources. Without this step a source mutation is invisible to them and
   * the harness would report every assertion as unable to catch the regression —
   * which is exactly the false conclusion it exists to prevent. */
  execFileSync(process.execPath, ['build.mjs'], { stdio: 'pipe' })
}

function run(script) {
  try {
    execFileSync(process.execPath, [script], { stdio: 'pipe', encoding: 'utf8' })
    return { ok: true, out: '' }
  } catch (error) {
    return { ok: false, out: String(error.stderr || error.stdout || error.message).split('\n').filter(Boolean).slice(-3).join('\n') }
  }
}

const cases = [
  {
    name: '遮罩不再整屏（inset 0 -> inset 40px）',
    file: 'lib/widget.js',
    from: `.dfi-mask {
  position: fixed;
  inset: 0;`,
    to: `.dfi-mask {
  position: fixed;
  inset: 40px;`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '严格模式下仍然渲染提醒卡（露出跳过/重新计时）',
    file: 'lib/widget.js',
    from: `          ? (strictMask ? null : renderRoundOver())`,
    to: `          ? renderRoundOver()`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '严格模式下不隐藏岛卡片',
    file: 'lib/widget.js',
    from: `.dfi-root[data-strict='true'] .dfi-card { display: none; }`,
    to: `.dfi-root[data-strict='true'] .dfi-card { display: block; }`,
    script: 'verify/render-smoke.mjs',
  },
  {
    name: '退出按钮不在右下角',
    file: 'lib/widget.js',
    from: `.dfi-maskFoot {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: flex;`,
    to: `.dfi-maskFoot {
  position: absolute;
  right: 24px;
  top: 24px;
  display: flex;`,
    script: 'verify/render-smoke.mjs',
  },
  {
    name: '两个退出按钮合成一个（无法区分本轮/全部）',
    file: 'lib/widget.js',
    from: `          h('button', {
            key: 'skipStrictAll',
            type: 'button',
            className: 'dfi-maskSkip dfi-maskSkipAll',
            onClick: onStrictSkipAll,
            title: t('strict.skipAllHint'),
          }, t('strict.skipAll'))`,
    to: `          null`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '每行不再显示会话自己的用时（所有行退化成 1 秒）',
    file: 'lib/widget.js',
    from: `        const elapsed = since === null || since === undefined ? 0 : Math.max(1000, now - since)`,
    to: `        const elapsed = 1000`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '会话运行起点记错，用时永远从零算',
    file: 'lib/client-main.js',
    from: `          if (!map.has(id)) {
            map.set(id, now)
            dirty = true
          }`,
    to: `          map.set(id, now)
          dirty = true`,
    script: 'verify/strict-smoke.mjs',
  },
  {
    name: '空闲时凭空造一行会话',
    file: 'lib/widget.js',
    from: `      if (sessions.length === 0) {`,
    to: `      if (false) {`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '有提问时遮罩不让位',
    file: 'lib/widget.js',
    from: `      if (!strictMask || !hasPending) return;`,
    to: `      return;`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '严格模式开关回到卡片正面',
    file: 'lib/widget.js',
    from: `      if (settingsTreeMemo !== null) children.push(settingsTreeMemo);`,
    to: `      if (settingsTreeMemo !== null) children.push(settingsTreeMemo);
      children.push(renderStrictRow());`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '已停下的会话也被列进遮罩',
    file: 'lib/client-main.js',
    from: `          if (!running && !pending) continue`,
    to: `          if (false) continue`,
    script: 'verify/integration-smoke.mjs',
  },
  {
    name: '「跳过严格模式」不再从 5 分钟重启',
    file: 'lib/widget.js',
    from: `      if (core && typeof core.setDurationMinutes === 'function') safe(function () { core.setDurationMinutes(STRICT_RESTART_MINUTES); }, null);
      persistPref('durationMinutes', STRICT_RESTART_MINUTES);`,
    to: `      // mutated: no rearm`,
    script: 'verify/widget-smoke.mjs',
  },
  {
    name: '严格模式不再抑制自动再来',
    file: 'lib/client-main.js',
    from: `          const strict = prefs.strictMode === true
          if (!strict && repeatMinutes > 0 && Number.isFinite(finishedAt) && nowMs() - finishedAt >= repeatMinutes * 60000) {`,
    to: `          const strict = false
          if (!strict && repeatMinutes > 0 && Number.isFinite(finishedAt) && nowMs() - finishedAt >= repeatMinutes * 60000) {`,
    script: 'verify/strict-smoke.mjs',
  },
  {
    name: '鲸只画代码字，丢掉了点阵那一轮',
    file: 'lib/whale.js',
    from: `  let fill = 'dots'`,
    to: `  let fill = 'code'`,
    script: 'verify/whale.test.mjs',
  },
  {
    name: '鲸不再交替（永远停在第一轮）',
    file: 'lib/whale.js',
    from: `      fill = fill === 'dots' ? 'code' : 'dots'`,
    to: `      // mutated: no alternation`,
    script: 'verify/whale.test.mjs',
  },
  {
    name: '覆盖度读成 alpha 通道',
    file: 'lib/whale.js',
    from: `      const coverage = pixels[offset + 1] / 255`,
    to: `      const coverage = pixels[offset + 3] / 255`,
    script: 'verify/whale.test.mjs',
  },
]

let failures = 0
for (const testCase of cases) {
  mutate(testCase.file, testCase.from, testCase.to)
  const result = run(testCase.script)
  restore()
  if (result.ok) {
    failures += 1
    console.error(`FAIL  ${testCase.name} —— 改坏后测试仍然通过（断言无效）`)
  } else {
    console.log(`ok    ${testCase.name} -> ${testCase.script} 失败`)
    console.log(`      ${result.out.split('\n').slice(0, 2).join(' | ')}`)
  }
}

restore()
if (failures > 0) {
  console.error(`\n${failures} 处断言无法抓住对应回归`)
  process.exit(1)
}
console.log('\n每一处故意改坏都被对应断言抓住')
