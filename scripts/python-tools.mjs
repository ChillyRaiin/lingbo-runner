import { execFileSync, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROJECT_ROOT, readRuntimeConfig } from '../server/config.mjs'
export function findPython() {
  const candidates = []
  if (process.env.XUNRUN_PYTHON) candidates.push(process.env.XUNRUN_PYTHON)
  else {
    candidates.push(join(PROJECT_ROOT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'))
    candidates.push(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'))
    if (process.platform === 'win32') { try { candidates.push(...execFileSync('where.exe', ['python'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(path => !path.toLowerCase().includes('windowsapps'))) } catch {} }
    else candidates.push('python3', 'python')
  }
  for (const executable of [...new Set(candidates)]) {
    const result = spawnSync(executable, ['-c', 'import sys;print("%s.%s.%s"%sys.version_info[:3])'], { encoding: 'utf8', timeout: 3000, windowsHide: true })
    if (result.status === 0 && /^3\./.test(result.stdout.trim()) && Number(result.stdout.trim().split('.')[1]) >= 10) return { executable, version: result.stdout.trim() }
  }
  throw new Error('未找到Python3.10+；请安装Python或设置XUNRUN_PYTHON为实际解释器路径')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const python = findPython(), action = process.argv[2]
    const converters = { 'apple-health': 'scripts/apple_health_to_json.py', tcx: 'scripts/tcx_to_json.py', 'knowledge-index': 'scripts/ingest_private_pdf.py' }
    const args = action === 'test' ? ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'] : action === 'package' ? ['scripts/package_project.py'] : action === 'backup' ? ['scripts/backup_database.py', '--source', readRuntimeConfig().databasePath] : Object.hasOwn(converters, action) ? [converters[action], ...process.argv.slice(3)] : null
    if (!args) throw new Error('用法：python-tools.mjs test|package|backup|apple-health|tcx|knowledge-index')
    const result = spawnSync(python.executable, args, { cwd: PROJECT_ROOT, stdio: 'inherit', windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' } })
    if (result.error) throw new Error('Python命令启动失败')
    process.exitCode = result.status ?? 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
