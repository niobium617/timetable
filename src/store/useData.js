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
} from './index.js';

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
