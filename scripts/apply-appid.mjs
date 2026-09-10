#!/usr/bin/env node
/**
 * apply-appid.mjs —— 把本地 AppID 写入构建产物
 *
 * 公开仓库里的 src/manifest.json 不含真实 AppID：既避免 fork 者继承作者身份，
 * 也避免每次本地构建把 manifest.json 改脏、误提交。
 *
 * uni-app 编译时会把 manifest.json 的 mp-weixin.appid 写进产物的 project.config.json，
 * 微信开发者工具认的是后者——所以只要构建后覆盖那一个文件，效果等价。
 *
 * 本地配置：仓库根目录 .env.local（已 gitignore，与 VITE_CLOUD_ENV 同一个文件）
 *   MP_WEIXIN_APPID=wx1234567890abcdef
 * 未配置时静默跳过，产物保持游客模式（touristappid），微信开发者工具仍可打开调试。
 *
 * 注意变量名不带 VITE_ 前缀：Vite 只把 VITE_ 开头的变量注入客户端代码，
 * 不带前缀的只在本构建脚本里读取，AppID 不会进入 JS 产物。
 *
 * 用法：
 *   npm run build:mp-weixin        # 构建后自动执行
 *   node scripts/apply-appid.mjs   # 手动补写（如 dev 模式跑起来之后）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_LOCAL = join(root, '.env.local')
const MANIFEST = join(root, 'src', 'manifest.json')

/** 解析 .env.local 的 KEY=VALUE（只支持这种简单形式，够用且无依赖） */
function readEnvLocal() {
	const env = {}
	for (const line of readFileSync(ENV_LOCAL, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const eq = trimmed.indexOf('=')
		if (eq === -1) continue
		let value = trimmed.slice(eq + 1).trim()
		if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
			value = value.slice(1, -1)
		}
		env[trimmed.slice(0, eq).trim()] = value
	}
	return env
}

/** 递归收集 dist 下所有 mp-weixin 产物的 project.config.json */
function findProjectConfigs(dir) {
	if (!existsSync(dir)) return []
	const found = []
	for (const name of readdirSync(dir)) {
		const full = join(dir, name)
		if (!statSync(full).isDirectory()) continue
		if (name === 'mp-weixin') {
			const config = join(full, 'project.config.json')
			if (existsSync(config)) found.push(config)
		} else {
			found.push(...findProjectConfigs(full))
		}
	}
	return found
}

// 兜底检查：万一 manifest.json 又被填回真实 AppID，这里提醒一句（不阻断构建）
try {
	const manifestAppId = String(JSON.parse(readFileSync(MANIFEST, 'utf8'))['mp-weixin']?.appid || '').trim()
	if (manifestAppId) {
		console.warn(`[appid] 警告：src/manifest.json 的 mp-weixin.appid 非空（${manifestAppId}），公开仓库不应提交真实 AppID`)
	}
} catch {
	// manifest.json 缺失或格式异常不归本脚本管，交给 uni 编译报错
}

if (!existsSync(ENV_LOCAL)) {
	console.log('[appid] 未找到 .env.local，跳过（产物为游客模式，可正常调试）')
	process.exit(0)
}

let appid
try {
	appid = String(readEnvLocal().MP_WEIXIN_APPID || '').trim()
} catch (e) {
	console.warn(`[appid] .env.local 读取失败，跳过：${e.message}`)
	process.exit(0)
}

if (!appid) {
	console.log('[appid] .env.local 未配置 MP_WEIXIN_APPID，跳过')
	process.exit(0)
}

const targets = findProjectConfigs(join(root, 'dist'))
if (!targets.length) {
	console.log('[appid] dist 下没有 mp-weixin 产物，请先执行一次构建')
	process.exit(0)
}

let patched = 0
for (const file of targets) {
	const config = JSON.parse(readFileSync(file, 'utf8'))
	if (config.appid === appid) continue
	config.appid = appid
	writeFileSync(file, JSON.stringify(config, null, 2) + '\n', 'utf8')
	console.log(`[appid] 已写入 ${relative(root, file).split('\\').join('/')}`)
	patched++
}
if (!patched) console.log('[appid] 产物 AppID 已是最新，无需修改')
