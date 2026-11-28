// Audit the widget stylesheet for design-literal drift.
//
// Two facts it establishes, and one it refuses to fake:
//   1. every font size in the rules comes from the type-scale tokens
//   2. every duration comes from the motion tokens
//   3. radii: whatever is not a plugin token must be an official --dsw-radius-*
//      value, so the island rounds like the rest of the app.
//
// Run: node audit-tokens.mjs [<widget.js>]

import { readFile } from 'node:fs/promises'

const target = process.argv[2] || 'lib/widget.js'
const src = await readFile(target, 'utf8')

const start = src.indexOf('const CSS = `')
const end = src.indexOf('`;', start)
if (start < 0 || end < 0) {
  console.error('cannot locate the CSS template literal')
  process.exit(2)
}
const css = src.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, ' ')

function count(re) {
  return (css.match(re) || []).length
}

// A font size is a "literal" when the value is not read from the type scale.
// `var(--dfi-fs-sm)` and `calc(var(--dfi-fs-2xl) * var(--dfi-scale))` both
// qualify; `12px` does not.
function fontLiteralCount() {
  const decls = css.match(/font-size:\s*[^;]+;/g) || []
  return decls.filter((decl) => !/var\(--dfi-fs-/.test(decl)).length
}

const rows = [
  ['font-size literals', fontLiteralCount()],
  ['radius px literals', count(/border-radius:\s*[\d.]+px/g)],
  ['animation/transition ms literals', count(/(transition|animation)[^;}]*?\d+ms/g)],
  ['--dfi-fs-* reads', count(/var\(--dfi-fs-/g)],
  ['--dfi-dur-* reads', count(/var\(--dfi-dur-/g)],
  ['--dfi-radius-* reads', count(/var\(--dfi-radius-/g)],
  ['--dsw-radius-* reads (platform scale)', count(/var\(--dsw-radius-/g)],
]

let failures = 0
for (const [label, n] of rows) {
  const mustBeZero = /literals/.test(label)
  if (mustBeZero && n !== 0) failures += 1
  const mark = mustBeZero ? (n === 0 ? 'ok  ' : 'FAIL') : '    '
  console.log(`${mark}  ${String(n).padStart(3)}  ${label}`)
}

if (failures > 0) {
  console.error(`\n${failures} literal class(es) still present`)
  process.exit(1)
}
console.log('\nno design literals outside the token layer')
