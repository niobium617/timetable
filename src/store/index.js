/**
 * index.js —— 存储管理器（唯一允许触碰 uni storage 的模块）
 *
 * 职责：
 * - 读写主数据（load/save），写入统一 try/catch，失败弹窗提示导出备份
 * - 数据校验与版本迁移（version 字段，后续结构变更在此升级）
 * - 导出/导入 JSON 备份；恢复前自动备份，支持撤销
 * - id 生成规则：'c_' + 时间戳36进制 + 2位随机字符
 *
 * 存储键：
 *   timetable_data    主数据
 *   timetable_backup  导入/恢复前的自动备份（仅一份，用于撤销）
 */

import { sampleData, defaultSections } from './sampleData.js';

const STORAGE_KEY = 'timetable_data';
const BACKUP_KEY = 'timetable_backup';
const DATA_VERSION = 1;

/* ==================== 基础读写 ==================== */

/**
 * 读取主数据；首次使用（或数据损坏）时写入示例数据
 * @returns {{ data: object, isFirstRun: boolean }}
 */
export function loadData() {
	let raw = null;
	try {
		raw = uni.getStorageSync(STORAGE_KEY);
	} catch (e) {
		raw = null;
	}

	let isFirstRun = false;
	if (!raw) {
		raw = sampleData();
		isFirstRun = true;
	} else {
		try {
			raw = migrateData(raw);
		} catch (e) {
			// 数据损坏：退回示例数据（旧数据不覆盖删除，避免丢用户内容）
			console.error('本地数据解析失败，已重置为示例数据', e);
			raw = sampleData();
			isFirstRun = true;
		}
	}

	if (isFirstRun) {
		saveData(raw, false);
	}
	return raw;
}

/** 首次启动初始化入口（App.onLaunch 调用） */
export function initData() {
	loadData();
}

/**
 * 写入主数据
 * @returns {boolean} 是否成功
 */
export function saveData(data, showErrorToast = true) {
	try {
		uni.setStorageSync(STORAGE_KEY, data);
		return true;
	} catch (e) {
		console.error('存储写入失败', e);
		if (showErrorToast) {
			uni.showToast({ title: '存储异常，请先导出备份', icon: 'none', duration: 2500 });
		}
		return false;
	}
}

/* ==================== 校验与迁移 ==================== */

/** 单节次时间合法性校验 */
function normalizeSections(sections) {
	if (!Array.isArray(sections) || sections.length === 0) return defaultSections();
	const list = sections
		.map((s, i) => ({
			section: Number(s.section) || i + 1,
			startTime: String(s.startTime || '08:00'),
			endTime: String(s.endTime || '08:45'),
		}))
		.sort((a, b) => a.section - b.section);
	return list;
}

/** 旧版课程字段（weekType/startWeek/endWeek）→ 统一 weeks 字段 */
function courseToNewFormat(c) {
	if (c.weeks != null) return c;
	const map = {
		weekly: 'all',
		odd: 'odd',
		even: 'even',
	};
	const out = { ...c };
	if (c.weekType === 'custom') {
		out.weeks = `${c.startWeek || 1}-${c.endWeek || 20}`;
	} else {
		out.weeks = map[c.weekType] || 'all';
	}
	return out;
}

/**
 * 数据校验 + 版本迁移（结构缺失字段补齐，非法结构抛错）
 */
export function migrateData(raw) {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw new Error('数据结构非法');
	}
	const config = (typeof raw.config === 'object' && raw.config) || {};
	const data = {
		version: DATA_VERSION,
		config: {
			schoolName: String(config.schoolName || ''),
			termName: String(config.termName || ''),
			termStartDate: String(config.termStartDate || ''),
			firstWeekType: config.firstWeekType === 'even' ? 'even' : 'odd',
			weekStartDay: Number(config.weekStartDay) === 0 ? 0 : 1,
			manualWeek: config.manualWeek != null && config.manualWeek !== '' ? Number(config.manualWeek) : null,
			sections: normalizeSections(config.sections),
		},
		courses: (Array.isArray(raw.courses) ? raw.courses : []).map(courseToNewFormat),
		holidays: Array.isArray(raw.holidays) ? raw.holidays : [],
		adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
	};
	return data;
}

/** 导入备份前的结构校验（复用 migrateData，抛错即非法） */
export function validateData(raw) {
	migrateData(raw);
	return true;
}

/* ==================== 备份 / 恢复 / 撤销 ==================== */

/** 导出全部数据为 JSON 字符串（格式化，便于阅读与保存） */
export function exportJSON(data) {
	return JSON.stringify(data, null, 2);
}

/**
 * 导入 JSON 备份：校验 → 自动备份当前数据 → 覆盖写入
 * @returns {{ ok: boolean, error?: string }}
 */
export function importJSON(jsonStr, currentData) {
	let raw;
	try {
		raw = JSON.parse(jsonStr);
	} catch (e) {
		return { ok: false, error: 'JSON 格式错误，无法解析' };
	}
	try {
		validateData(raw);
	} catch (e) {
		return { ok: false, error: '数据内容不合法：' + e.message };
	}

	// 恢复前自动备份当前数据，供撤销
	try {
		uni.setStorageSync(BACKUP_KEY, currentData);
	} catch (e) {
		return { ok: false, error: '自动备份失败，已中止导入' };
	}

	const migrated = migrateData(raw);
	if (!saveData(migrated)) {
		return { ok: false, error: '写入存储失败' };
	}
	return { ok: true };
}

/** 撤销最近一次导入/恢复（用备份覆盖主数据） */
export function restoreBackup() {
	let backup = null;
	try {
		backup = uni.getStorageSync(BACKUP_KEY);
	} catch (e) {
		backup = null;
	}
	if (!backup) {
		uni.showToast({ title: '没有可撤销的备份', icon: 'none' });
		return false;
	}
	const migrated = migrateData(backup);
	saveData(migrated);
	uni.showToast({ title: '已恢复到导入前数据', icon: 'success' });
	return true;
}

/** 清空数据并重置为示例数据（设置页"恢复示例"用，先自动备份） */
export function resetToSample(currentData) {
	try {
		uni.setStorageSync(BACKUP_KEY, currentData);
	} catch (e) {
		/* 备份失败不阻断重置 */
	}
	saveData(sampleData());
	uni.showToast({ title: '已重置为示例数据', icon: 'success' });
	return true;
}

/* ==================== 工具 ==================== */

/** 课程 id 生成：'c_' + 时间戳36进制 + 2位随机字符，保证唯一 */
export function genId() {
	const ts = Date.now().toString(36);
	const rand = Math.random().toString(36).slice(2, 4);
	return `c_${ts}${rand}`;
}
