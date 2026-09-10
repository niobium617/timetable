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
 * 本地配置：仓库根目录 local.config.json（已 gitignore）
 *   { "mpWeixinAppId": "wx1234567890abcdef" }
 * 未配置时静默跳过，产物保持游客模式（touristappid），微信开发者工具仍可打开调试。
 *
 * 用法：
 *   npm run build:mp-weixin   # 构建后自动执行
 *   node scripts/apply-appid.mjs   # 手动补写（如 dev 模式跑起来之后）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL_CONFIG = join(root, 'local.config.json')
const MANIFEST = join(root, 'src', 'manifest.json')

/** 读取本地配置里的 AppID，未配置或解析失败返回空串 */
function readLocalAppId() {
	const raw = JSON.parse(readFileSync(LOCAL_CONFIG, 'utf8'))
	return String(raw.mpWeixinAppId || '').trim()
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

if (!existsSync(LOCAL_CONFIG)) {
	console.log('[appid] 未找到 local.config.json，跳过（产物为游客模式，可正常调试）')
	process.exit(0)
}

let appid
try {
	appid = readLocalAppId()
} catch (e) {
	console.warn(`[appid] local.config.json 解析失败，跳过：${e.message}`)
	process.exit(0)
}

if (!appid) {
	console.log('[appid] local.config.json 未配置 mpWeixinAppId，跳过')
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
