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
	lastLoadWasFirstRun,
} from './index.js';
import { mergeCourses } from '../utils/importMatch.js';
import { isValidWeeksPattern, getWeekInfo } from '../utils/week.js';
import { getWeekday } from '../utils/time.js';
import { OFFICIAL_HOLIDAYS, getOfficialYears } from '../utils/officialHolidays.js';
import { intersectWeeksRange, subtractWeeksRange, isCourseOnWeek } from '../utils/weeksPattern.js';

/** 导入课程自动配色（与 courseEdit 的 COURSE_COLORS 保持一致的色系） */
const IMPORT_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#8e44ad', '#16a085', '#e84393', '#3498db', '#9c6b3c', '#909399'];

// 全局单例：应用启动后只加载一次，页面间共享
const data = reactive(loadData());
/** 本次启动是否处于「本地无有效数据」状态（首次使用 / 清缓存 / 数据损坏）——供启动时云端恢复检测用 */
export const isFirstRun = lastLoadWasFirstRun();

/* ==================== 课程 CRUD ==================== */

function save() {
	return saveData(data);
}

/**
 * 新增课程（courseData 不含 id 时自动生成）。
 *
 * 「仅本次修改」的替代课（一次性课 + overrideId）在同一日期只该有一条——同一门原课
 * 同一天出现两条替代课没有意义，却会在网格里并排渲染出两张一模一样的卡片（拖动的
 * 中间步骤很容易撞上）。故同 (date, overrideId) 已有替代课时改为就地更新，并把它返回。
 * 取消型记录（cancelled）是抑制标记而非内容，不参与这条规则。
 */
export function addCourse(courseData) {
	const course = { ...courseData };
	if (course.date && course.overrideId != null && !course.cancelled) {
		// 同一日期同一原课：已有的取消记录被这条替代课顶掉。取消记录只是抑制标记，
		// 而替代课本身就抑制原课当天显示；留着它会在日历当日弹窗多出一行「已取消」，
		// 点「恢复」还什么都恢复不出来（那天显示的已经是替代课）。
		for (let i = data.courses.length - 1; i >= 0; i--) {
			const c = data.courses[i];
			if (c.cancelled && c.date === course.date && c.overrideId === course.overrideId) {
				data.courses.splice(i, 1);
			}
		}
		const dup = data.courses.find(
			(c) => c.date === course.date && c.overrideId === course.overrideId && !c.cancelled
		);
		if (dup) {
			const { id: _ignored, ...patch } = course;
			updateCourse(dup.id, patch);
			return data.courses.find((c) => c.id === dup.id);
		}
	}
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

/**
 * 删除课程：连同指向它的「取消单天」记录一起清理。
 *
 * 取消记录（cancelled）只用于抑制原课当天显示，本身不是内容——原课没了它们就是
 * 悬空行：会挂在日历当日弹窗的「已取消」列表里，点「恢复」也恢复不出任何东西。
 * 「仅本次修改」的替代课（非 cancelled）是真实内容，保留为独立的一次性课。
 */
export function deleteCourse(id) {
	const idx = data.courses.findIndex(c => c.id === id);
	if (idx === -1) return false;
	data.courses.splice(idx, 1);
	for (let i = data.courses.length - 1; i >= 0; i--) {
		const c = data.courses[i];
		if (c.cancelled && c.overrideId === id) data.courses.splice(i, 1);
	}
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
 * 导入时自动补齐官方假期（去重追加，官方调休上班日不自动加）。
 * @param {Array} list 解析出的课程
 * @param {'replace'|'merge'} mode
 * @param {{ sections?: Array }} options 可选：同时应用解析出的节次时间表
 * @returns {{ ok: boolean, added: number, updated: number, holidaysAdded?: number, error?: string }}
 */
export function importCourses(list, mode, options = {}) {
	let nextCourses;
	let added = 0;
	let updated = 0;
	const applySections = Array.isArray(options.sections) && options.sections.length > 0;

	if (mode === 'replace') {
		nextCourses = list.map((c, i) => normalizeImported(c, i));
		added = list.length;
	} else {
		const m = mergeCourses(list, data.courses);
		added = m.add.length;
		updated = m.update.length;
		// 官方假期缺失时也继续执行（导入时自动补齐）
		const missingHolidays = getOfficialYears().reduce(
			(n, y) => n + (OFFICIAL_HOLIDAYS[y] || []).filter((h) => !data.holidays.some((x) => x.date === h.date)).length,
			0
		);
		if (added === 0 && updated === 0 && !applySections && missingHolidays === 0) {
			return { ok: true, added: 0, updated: 0, holidaysAdded: 0 }; // 无变更，不触碰存储
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
	if (applySections) {
		data.config.sections = options.sections;
	}
	// 自动补齐官方假期（日期为事实数据，去重后追加；调休上班日不自动加，补星期官方未定义）
	let holidaysAdded = 0;
	getOfficialYears().forEach((y) => {
		(OFFICIAL_HOLIDAYS[y] || []).forEach((h) => {
			if (!data.holidays.some((x) => x.date === h.date)) {
				data.holidays.push({ ...h });
				holidaysAdded++;
			}
		});
	});
	const ok = saveData(data); // 失败时 saveData 已提示；备份仍在，可撤销
	return { ok, added, updated, holidaysAdded, error: ok ? undefined : '写入存储失败' };
}

/**
 * 周段分段修改：把原课拆成「修改段 [start,end]（新信息）」+「剩余周（原信息）」
 * - 剩余周非空：原课周次收窄为剩余周，修改段作为新课程追加
 * - 剩余周为空：修改段覆盖全部周次 → 直接更新原课（保持 id）
 * 拆分前自动备份（设置页「撤销导入」可恢复）。
 * @param {string} originalId 原每周课 id
 * @param {object} patch 修改段课程字段（不含 id/weeks）
 * @param {number} start 修改段起始周
 * @param {number} end 修改段结束周
 * @returns {{ ok: boolean, remainder: boolean, error?: string }}
 */
export function splitCourseRange(originalId, patch, start, end) {
	const src = data.courses.find((c) => c.id === originalId);
	if (!src) return { ok: false, remainder: false, error: '原课程不存在' };

	const rangeWeeks = intersectWeeksRange(src.weeks || 'all', start, end);
	if (!rangeWeeks) {
		return { ok: false, remainder: false, error: `原课在第 ${start}-${end} 周没有课程，无法拆分` };
	}
	const remainderWeeks = subtractWeeksRange(src.weeks || 'all', start, end);

	if (!backupCurrent(data)) {
		return { ok: false, remainder: false, error: '自动备份失败，已中止拆分' };
	}

	if (remainderWeeks) {
		updateCourse(originalId, { weeks: remainderWeeks });
		const seg = addCourse({ ...patch, weeks: rangeWeeks });
		// 取消记录跟着日期走：日期落在新拆出的周段里的，改指新课程
		// （那天的那节课现在属于新段）。不改指的话取消会被无声撤销——那天又冒出课来，
		// 还多出一行点不动的「已取消」。段外的记录仍指向原课，继续正常抑制。
		data.courses
			.filter((c) => c.cancelled && c.overrideId === originalId)
			.forEach((ref) => {
				const w = getWeekInfo(ref.date, data.config).weekNum;
				if (isCourseOnWeek(seg, w)) updateCourse(ref.id, { overrideId: seg.id });
			});
		return { ok: true, remainder: true };
	}
	updateCourse(originalId, { ...patch, weeks: rangeWeeks });
	return { ok: true, remainder: false };
}

/* ==================== 分级删除 ==================== */

/**
 * 仅取消某一天这一节课（如老师临时停课、放假补课取消），其他日期不受影响。
 *
 * 实现：新增一条「取消型一次性课」（cancelled:true + overrideId 指向原课），
 * 复用既有「仅本次修改」的抑制机制——filter.js 会用 overrideId 抑制原课当天显示，
 * 而 cancelled 记录自身不参与渲染，只在当日弹窗列出供恢复。
 * 若当天已存在替代型一次性课（overrideId 命中且非 cancelled），直接把它标记为取消：
 * 用户意图是「这节课没有了」，原先的替代内容同时作废。
 *
 * @param {string} id 每周课 id
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {{ ok: boolean, existed?: boolean, replaced?: boolean, error?: string }}
 */
export function cancelCourseOnDate(id, dateStr) {
	const src = data.courses.find((c) => c.id === id);
	if (!src || src.date) return { ok: false, error: '仅每周课程支持取消单天' };
	if (!dateStr) return { ok: false, error: '缺少取消日期' };

	const sameDay = data.courses.filter((c) => c.date === dateStr && c.overrideId === id);
	if (sameDay.some((c) => c.cancelled)) return { ok: true, existed: true };

	const replaced = sameDay.find((c) => !c.cancelled);
	if (replaced) {
		updateCourse(replaced.id, { cancelled: true });
		return { ok: true, replaced: true };
	}

	addCourse({
		name: src.name,
		teacher: src.teacher,
		classroom: src.classroom,
		color: src.color,
		remark: src.remark,
		weekday: getWeekday(dateStr), // 当天实际星期（调休日按当天记）
		startSection: src.startSection,
		endSection: src.endSection,
		weeks: 'all',
		date: dateStr,
		overrideId: id,
		cancelled: true,
	});
	return { ok: true };
}

/**
 * 恢复某天被取消的课：删除对应的取消型一次性课，原每周课自动回归显示
 * @returns {{ ok: boolean, error?: string }}
 */
export function restoreCourseOnDate(overrideId, dateStr) {
	const idx = data.courses.findIndex(
		(c) => c.cancelled && c.date === dateStr && c.overrideId === overrideId
	);
	if (idx === -1) return { ok: false, error: '没有找到取消记录' };
	data.courses.splice(idx, 1);
	save();
	return { ok: true };
}

/**
 * 周段删除：删除某每周课在第 [start,end] 周的课程，其余周保留
 * - 剩余周非空：原课周次收窄为剩余周
 * - 剩余周为空：整门删除
 * 同时清理落在该周段内的「取消单天」记录（避免留下悬空的取消行）。
 * 删除前自动备份（设置页「撤销导入」可恢复）。
 * @returns {{ ok: boolean, remainder: boolean, deleted: boolean, error?: string }}
 */
export function deleteCourseRange(id, start, end) {
	const src = data.courses.find((c) => c.id === id);
	if (!src) return { ok: false, remainder: false, deleted: false, error: '课程不存在' };
	if (src.date) return { ok: false, remainder: false, deleted: false, error: '一次性课程请直接删除整门' };

	const rangeWeeks = intersectWeeksRange(src.weeks || 'all', start, end);
	if (!rangeWeeks) {
		return { ok: false, remainder: false, deleted: false, error: `该课程在第 ${start}-${end} 周没有课` };
	}
	const remainderWeeks = subtractWeeksRange(src.weeks || 'all', start, end);

	if (!backupCurrent(data)) {
		return { ok: false, remainder: false, deleted: false, error: '自动备份失败，已中止删除' };
	}

	// 取消记录：整门删除时全部清理，仅收窄周次时只清理落在删除周段内的
	const lo = Math.min(start, end);
	const hi = Math.max(start, end);
	const dropIds = data.courses
		.filter((c) => {
			if (!c.cancelled || c.overrideId !== id || !c.date) return false;
			if (!remainderWeeks) return true;
			// 用 autoWeek（日期所在的实际教学周）而非 weekNum：设置页开着「手动校准
			// 教学周」时 weekNum 对所有日期都返回同一个值，周段判断会退化成"全删"或"全留"。
			const w = getWeekInfo(c.date, data.config).autoWeek;
			return w >= lo && w <= hi;
		})
		.map((c) => c.id);
	dropIds.forEach((cid) => {
		const i = data.courses.findIndex((c) => c.id === cid);
		if (i !== -1) data.courses.splice(i, 1);
	});

	if (remainderWeeks) {
		updateCourse(id, { weeks: remainderWeeks });
		return { ok: true, remainder: true, deleted: false };
	}
	deleteCourse(id);
	return { ok: true, remainder: false, deleted: true };
}

/**
 * 节次段删除：删除某每周课的第 [dStart,dEnd] 节，其余节次保留
 * 中间截断（两侧都有保留段）时自动拆成两门课：原课保留左侧节次，右侧复制为新课程；
 * 右侧复制时，原课的「取消单天」记录同步复制一份指向新课程（当天整门取消对两段都成立）。
 * 删除前自动备份（设置页「撤销导入」可恢复）。
 * @returns {{ ok: boolean, split: boolean, deleted: boolean, newId?: string, error?: string }}
 */
export function deleteCourseSections(id, dStart, dEnd) {
	const src = data.courses.find((c) => c.id === id);
	if (!src) return { ok: false, split: false, deleted: false, error: '课程不存在' };
	if (src.date) return { ok: false, split: false, deleted: false, error: '一次性课程请直接删除整门' };

	const lo = Math.min(dStart, dEnd);
	const hi = Math.max(dStart, dEnd);
	const cs = Number(src.startSection);
	const ce = Number(src.endSection);
	if (lo < cs || hi > ce) {
		return { ok: false, split: false, deleted: false, error: `请选择第 ${cs}-${ce} 节范围内的节次` };
	}
	if (!backupCurrent(data)) {
		return { ok: false, split: false, deleted: false, error: '自动备份失败，已中止删除' };
	}

	const leftEnd = lo - 1;
	const rightStart = hi + 1;
	const hasLeft = leftEnd >= cs;
	const hasRight = rightStart <= ce;

	if (hasLeft && hasRight) {
		const refs = data.courses.filter((c) => c.cancelled && c.overrideId === id);
		updateCourse(id, { endSection: leftEnd });
		const { id: _omit, ...rest } = src;
		const created = addCourse({ ...rest, startSection: rightStart, endSection: ce });
		refs.forEach((ref) => {
			const { id: _refId, ...refRest } = ref;
			// 节次同步收窄到各自那一段：否则两条记录（都还带着原课的完整节次）在日历
			// 当日弹窗里显示得一模一样，用户分不清该点哪个「恢复」，点一个也恢复不齐。
			updateCourse(ref.id, { endSection: leftEnd });
			addCourse({ ...refRest, startSection: rightStart, endSection: ce, overrideId: created.id });
		});
		return { ok: true, split: true, deleted: false, newId: created.id };
	}
	if (hasLeft) {
		updateCourse(id, { endSection: leftEnd });
		return { ok: true, split: false, deleted: false };
	}
	if (hasRight) {
		updateCourse(id, { startSection: rightStart });
		return { ok: true, split: false, deleted: false };
	}
	deleteCourse(id);
	return { ok: true, split: false, deleted: true };
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
		splitCourseRange,
		cancelCourseOnDate,
		restoreCourseOnDate,
		deleteCourseRange,
		deleteCourseSections,
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
