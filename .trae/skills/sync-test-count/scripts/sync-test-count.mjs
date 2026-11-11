import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 仓库根目录：scripts -> skill 目录 -> skills -> .trae -> 根
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const reportPath = path.join(tmpdir(), `vitest-report-${process.pid}.json`)
const readmePath = path.join(root, 'README.md')

function fail(message) {
  console.error(message)
  cleanup()
  process.exit(1)
}

function cleanup() {
  rmSync(reportPath, { force: true })
}

const vitestCli = path.join(root, 'node_modules/vitest/vitest.mjs')
if (!existsSync(vitestCli)) fail('找不到 node_modules/vitest，请先执行 pnpm install。')

const result = spawnSync(
  process.execPath,
  [vitestCli, 'run', '--reporter=json', '--outputFile', reportPath],
  { cwd: root, stdio: 'inherit' },
)

if (result.error) fail(`无法启动 vitest：${result.error.message}`)

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (error) {
  fail(`未取得 vitest 的 JSON 报告（${error.message}），请检查上面的测试输出。`)
} finally {
  cleanup()
}

const passed = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0
const total = report.numTotalTests ?? 0

if (result.status !== 0 || failed > 0 || passed === 0) {
  fail(`测试未全部通过：通过 ${passed}，失败 ${failed}，共 ${total}。README 未修改。`)
}

if (!existsSync(readmePath)) fail(`找不到 README.md：${readmePath}`)

const unitDir = path.join(root, 'tests/unit')
const fileCount = readdirSync(unitDir).filter((name) => name.endsWith('.spec.js')).length

const before = readFileSync(readmePath, 'utf8')
const after = before
  .replace(/badge\/Vitest-\d+%20passed/g, `badge/Vitest-${passed}%20passed`)
  .replace(/共 \d+ 个用例/g, `共 ${passed} 个用例`)
  .replace(/\d+ 个测试文件/g, `${fileCount} 个测试文件`)

if (after === before) {
  console.log(`README 已是最新：${fileCount} 个测试文件，${passed} 个用例通过。`)
} else {
  writeFileSync(readmePath, after)
  console.log(`README 已更新：${fileCount} 个测试文件，${passed} 个用例通过。`)
}
