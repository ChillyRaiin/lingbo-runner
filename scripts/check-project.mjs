import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).filter(e => {
  const parts = relative(root, resolve(dir, e.name)).split(sep)
  return !['data', '.private', 'node_modules', '.git', '.venv', '.pytest_cache', 'DerivedData'].includes(parts[0]) && !parts.some(part => ['__pycache__', 'node_modules', '.venv', 'DerivedData'].includes(part))
}).flatMap(e => e.isDirectory() ? walk(resolve(dir, e.name)) : [resolve(dir, e.name)]) }
const files = walk(root)
for (const file of files) {
  if (file.endsWith('.json')) JSON.parse(readFileSync(file, 'utf8'))
  if (/\.(js|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
}
const app = JSON.parse(readFileSync(resolve(root, 'miniprogram/app.json')))
if (app.tabBar.list.length > 5) throw new Error('微信 tabBar 最多 5 项')
for (const page of app.pages) {
  for (const extension of ['js', 'wxml', 'json']) if (!existsSync(resolve(root, 'miniprogram', page + '.' + extension))) throw new Error('缺少页面文件 ' + page + '.' + extension)
  const js = readFileSync(resolve(root, 'miniprogram', page + '.js'), 'utf8')
  const wxml = readFileSync(resolve(root, 'miniprogram', page + '.wxml'), 'utf8')
  for (const [, handler] of wxml.matchAll(/(?:bind\w+|catch\w+)="([a-zA-Z_]\w*)"/g)) if (!new RegExp('\\b' + handler + '\\s*\\(').test(js)) throw new Error('缺少处理函数 ' + page + ':' + handler)
}
console.log('通过：JSON、JS 语法（含 miniprogram/data）、' + app.pages.length + ' 个页面注册和事件处理函数检查。WXML 仍需微信开发者工具编译。')
