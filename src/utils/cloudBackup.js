/**
 * cloudBackup.js —— 微信云开发备份（仅微信小程序端）
 *
 * 方案：云数据库直连，无需云函数。
 * 集合：timetable_backups（需在云开发控制台手动创建，
 * 权限设为「仅创建者可读写」，即 doc._openid == auth.openid）。
 * 每个用户最多一条记录（按 _openid 隔离），字段 { payload, updatedAt }。
 * payload 就是 settings 页「导出备份」的同一份 JSON 文本，
 * 恢复时复用 store 的 importData（校验 + 自动备份 + 可撤销）。
 *
 * H5 等非微信端 wx.cloud 不存在，运行时返回明确错误提示。
 */
import { cloudEnv } from '../api/config.js';

const COLLECTION = 'timetable_backups';
/** 云数据库单条记录上限内留足余量（payload 为纯文本 JSON） */
const MAX_PAYLOAD = 400 * 1024;

let inited = false;

/** 懒初始化 wx.cloud（幂等，仅微信小程序端生效） */
function ensureInit() {
	if (inited) return true;
	inited = true;
	if (typeof wx !== 'undefined' && wx.cloud) {
		wx.cloud.init({ env: cloudEnv || undefined, traceUser: true });
		return true;
	}
	return false;
}

/** 能力检查：非微信端 / 未配置环境 ID 时给出可读提示 */
function checkAvailable() {
	if (typeof wx === 'undefined' || !wx.cloud) {
		return { ok: false, error: '云备份仅微信小程序端可用' };
	}
	if (!cloudEnv) {
		return { ok: false, error: '未配置云环境 ID（src/api/config.js 的 cloudEnv）' };
	}
	return { ok: true };
}

/** 查询当前用户自己的备份记录（安全规则保证只返回自己的） */
async function fetchOwnDoc() {
	const db = wx.cloud.database();
	const res = await db.collection(COLLECTION).limit(1).get();
	return res.data && res.data.length ? res.data[0] : null;
}

/**
 * 云备份：把自己的课表 JSON 写入云端（已有记录则更新）
 * @param {string} payload 导出 JSON 文本
 * @returns {Promise<{ok: boolean, error?: string, updatedAt?: number}>}
 */
export async function cloudBackup(payload) {
	const chk = checkAvailable();
	if (!chk.ok) return chk;
	if (!payload || payload.length > MAX_PAYLOAD) {
		return { ok: false, error: '数据过大，无法云备份' };
	}
	try {
		if (!ensureInit()) return { ok: false, error: '云开发初始化失败，请确认已开通云开发' };
		const db = wx.cloud.database();
		const doc = await fetchOwnDoc();
		const now = Date.now();
		if (doc) {
			await db.collection(COLLECTION).doc(doc._id).update({ data: { payload, updatedAt: now } });
		} else {
			await db.collection(COLLECTION).add({ data: { payload, updatedAt: now } });
		}
		return { ok: true, updatedAt: now };
	} catch (e) {
		return { ok: false, error: '云备份失败：' + (e.errMsg || e.message || String(e)) };
	}
}

/**
 * 云恢复：取回云端备份 JSON 文本（写入交由调用方走 importData）
 * @returns {Promise<{ok: boolean, error?: string, payload?: string, updatedAt?: number}>}
 */
export async function cloudFetch() {
	const chk = checkAvailable();
	if (!chk.ok) return chk;
	try {
		if (!ensureInit()) return { ok: false, error: '云开发初始化失败，请确认已开通云开发' };
		const doc = await fetchOwnDoc();
		if (!doc || !doc.payload) {
			return { ok: false, error: '云端暂无备份，请先云备份' };
		}
		return { ok: true, payload: doc.payload, updatedAt: doc.updatedAt };
	} catch (e) {
		return { ok: false, error: '云恢复失败：' + (e.errMsg || e.message || String(e)) };
	}
}
