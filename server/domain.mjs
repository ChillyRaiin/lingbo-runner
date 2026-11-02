import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
export const engine = require('../miniprogram/domain/engine.js')
export const knowledge = require('../miniprogram/data/knowledge.js')
export const imports = require('../miniprogram/domain/imports.js')
export const demo = require('../miniprogram/data/demo.js')
