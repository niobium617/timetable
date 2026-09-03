/**
 * useData.js —— 组合式 API 数据封装（页面订阅数据的唯一入口）
 *
 * 全局单例 reactive 状态，所有页面/组件共享同一份数据；
 * 所有增删改统一收敛到这里的 action，修改后立即持久化。
 */

import { reactive } from 'vue';
import {
	loadData,
	saveData,
	genId,
	exportJSON,
	importJSON,
	restoreBackup,
	resetToSample,
	backupCurrent,
} from './index.js';
import { mergeCourses } from '../utils/importMatch.js';
import { isValidWeeksPattern } from '../utils/week.js';

/** 导入课程自动配色（与 courseEdit 的 COURSE_COLORS 保持一致的色系） */
const IMPORT_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#8e44ad', '#16a085', '#e84393', '#3498db', '#9c6b3c', '#909399'];

// 全局单例：应用启动后只加载一次，页面间共享
const data = reactive(loadData());

/* ==================== 课程 CRUD ==================== */

function save() {
	return saveData(data);
}

/** 新增课程（courseData 不含 id 时自动生成） */
export function addCourse(courseData) {
	const course = { ...courseData };
	if (!course.id) course.id = genId();
	data.courses.push(course);
	save();
	return course;
}

/** 更新课程（按 id 匹配） */
export function updateCourse(id, patch) {
	const idx = data.courses.findIndex(c => c.id === id);
	if (idx === -1) return false;
	data.courses[idx] = { ...data.courses[idx], ...patch };
	save();
	return true;
}

/** 删除课程 */
export function deleteCourse(id) {
	const idx = data.courses.findIndex(c => c.id === id);
	if (idx === -1) return false;
	data.courses.splice(idx, 1);
	save();
	return true;
}

/** 复制课程：生成新 id，其余字段一致 */
export function copyCourse(id) {
	const src = data.courses.find(c => c.id === id);
	if (!src) return null;
	const copy = { ...src, id: genId() };
	data.courses.push(copy);
	save();
	return copy;
}

/* ==================== 课表导入（P3 模式B：多模态 AI 识别） ==================== */

/**
 * 解析出的课程归一化为存储格式：生成 id、自动配色、周次规则兜底
 * @param {object} c 解析出的课程（无 id/color，见 utils/parser.js）
 */
function normalizeImported(c, index) {
	const name = String(c.name || '未命名课程').trim();
	let weeks = String(c.weeks || 'all').trim();
	if (!isValidWeeksPattern(weeks)) weeks = 'all';
	return {
		id: genId(),
		name,
		teacher: String(c.teacher || '').trim(),
		classroom: String(c.classroom || '').trim(),
		color: c.color || IMPORT_COLORS[index % IMPORT_COLORS.length],
		remark: String(c.remark || '').trim(),
		weekday: Math.min(Math.max(Math.round(Number(c.weekday)) || 1, 1), 7),
		startSection: Math.max(Math.round(Number(c.startSection)) || 1, 1),
		endSection: Math.max(Math.round(Number(c.endSection)) || 0, 1),
		weeks,
		sourceKey: c.sourceKey != null ? String(c.sourceKey) : null,
	};
}

/**
 * 批量导入课程（导入页提交入口）
 * - replace：以解析结果替换全部课程（config/假期/调休保留）
 * - merge：按 sourceKey / 名称+星期+开始节次 增量匹配（更新保留本地 id/color/remark）
 * 导入前自动备份当前数据（设置页「撤销导入」可恢复），单次持久化。
 * @param {Array} list 解析出的课程
 * @param {'replace'|'merge'} mode
 * @returns {{ ok: boolean, added: number, updated: number, error?: string }}
 */
export function importCourses(list, mode) {
	let nextCourses;
	let added = 0;
	let updated = 0;

	if (mode === 'replace') {
		nextCourses = list.map((c, i) => normalizeImported(c, i));
		added = list.length;
	} else {
		const m = mergeCourses(list, data.courses);
		added = m.add.length;
		updated = m.update.length;
		if (added === 0 && updated === 0) {
			return { ok: true, added: 0, updated: 0 }; // 无变更，不触碰存储
		}
		// 仅归一化新增课程（无 id）；已存在课程保持原对象（更新已由 mergeCourses 合并语义字段）
		let colorIdx = 0;
		nextCourses = m.courses.map((c) => (c.id ? c : normalizeImported(c, colorIdx++)));
	}

	// 导入前自动备份当前数据，供撤销（失败中止，不修改任何状态）
	if (!backupCurrent(data)) {
		return { ok: false, added: 0, updated: 0, error: '自动备份失败，已中止导入' };
	}

	data.courses.splice(0, data.courses.length, ...nextCourses);
	const ok = saveData(data); // 失败时 saveData 已提示；备份仍在，可撤销
	return { ok, added, updated, error: ok ? undefined : '写入存储失败' };
}

/* ==================== 假期 / 调休 ==================== */

/** 添加假期（支持批量日期数组） */
export function addHolidays(dates, name) {
	const list = (Array.isArray(dates) ? dates : [dates]).filter(Boolean);
	let added = 0;
	list.forEach(date => {
		if (!data.holidays.some(h => h.date === date)) {
			data.holidays.push({ date, name: name || '假期' });
			added++;
		}
	});
	if (added > 0) save();
	return added;
}

export function deleteHoliday(date) {
	const idx = data.holidays.findIndex(h => h.date === date);
	if (idx === -1) return false;
	data.holidays.splice(idx, 1);
	save();
	return true;
}

export function addAdjustment(adj) {
	// 同一日期只保留一条调休
	const idx = data.adjustments.findIndex(a => a.date === adj.date);
	if (idx !== -1) {
		data.adjustments[idx] = { ...data.adjustments[idx], ...adj };
	} else {
		data.adjustments.push(adj);
	}
	save();
}

export function deleteAdjustment(date) {
	const idx = data.adjustments.findIndex(a => a.date === date);
	if (idx === -1) return false;
	data.adjustments.splice(idx, 1);
	save();
	return true;
}

/* ==================== 配置 / 节次 ==================== */

export function updateConfig(patch) {
	Object.assign(data.config, patch);
	save();
}

/** 节次表整体替换（设置页编辑后提交） */
export function updateSections(sections) {
	data.config.sections = sections;
	save();
}

/* ==================== 备份 / 恢复 / 重置 ==================== */

export function exportData() {
	return exportJSON(data);
}

/**
 * 导入备份：校验 → 自动备份当前数据 → 覆盖；成功后整体替换响应式状态
 */
export function importData(jsonStr) {
	const result = importJSON(jsonStr, data);
	if (result.ok) {
		// 重新加载并整体替换（清空后填充，保持响应式引用不变）
		const fresh = loadData();
		Object.keys(data).forEach(k => delete data[k]);
		Object.assign(data, fresh);
	}
	return result;
}

export function undoImport() {
	if (restoreBackup()) {
		const fresh = loadData();
		Object.keys(data).forEach(k => delete data[k]);
		Object.assign(data, fresh);
		return true;
	}
	return false;
}

export function resetDemo() {
	if (resetToSample(data)) {
		const fresh = loadData();
		Object.keys(data).forEach(k => delete data[k]);
		Object.assign(data, fresh);
		return true;
	}
	return false;
}

/* ==================== 导出使用 ==================== */

/** 页面/组件用法：const { data, addCourse, ... } = useData(); */
export function useData() {
	return {
		data,
		addCourse,
		updateCourse,
		deleteCourse,
		copyCourse,
		importCourses,
		addHolidays,
		deleteHoliday,
		addAdjustment,
		deleteAdjustment,
		updateConfig,
		updateSections,
		exportData,
		importData,
		undoImport,
		resetDemo,
	};
}
