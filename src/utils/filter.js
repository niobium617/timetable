/**
 * filter.js —— 课程过滤链（唯一入口，周课表 / 日历 / 当日弹窗全部走这里，保证渲染一致）
 *
 * 渲染优先级（方案优化版，必须严格执行）：
 *   1. 该日期属于假期     → 不显示任何课程（即使同时是调休，假期优先）
 *   2. 该日期属于调休     → 取目标星期的课程，用【调休当天】的教学周号过滤单双周/起止周
 *   3. 否则               → 用当天原生星期课程，用当天教学周号过滤
 */

import { getWeekInfo } from './week.js';
import { isCourseOnWeek } from './weeksPattern.js';
import { getWeekday, sectionsOverlap } from './time.js';

/** 查找命中某日期的假期（返回对象或 null） */
export function getHolidayOfDate(dateStr, holidays = []) {
	return holidays.find(h => h.date === dateStr) || null;
}

/** 查找命中某日期的调休（返回对象或 null） */
export function getAdjustmentOfDate(dateStr, adjustments = []) {
	return adjustments.find(a => a.date === dateStr) || null;
}

/**
 * 获取某日期的完整状态（假期/调休/教学周）
 * @returns {{ holiday, adjustment, weekNum, isOddWeek, weekday, isHoliday, isAdjustment }}
 */
export function getDateStatus(dateStr, { holidays = [], adjustments = [], config = {} } = {}) {
	const holiday = getHolidayOfDate(dateStr, holidays);
	const adjustment = getAdjustmentOfDate(dateStr, adjustments);
	const { weekNum, isOddWeek } = getWeekInfo(dateStr, config);
	return {
		holiday,
		adjustment,
		weekNum,
		isOddWeek,
		weekday: getWeekday(dateStr),
		isHoliday: !!holiday,
		isAdjustment: !!adjustment,
	};
}

/**
 * 过滤链核心：某日期当天应显示的课程列表
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {object} data { courses, holidays, adjustments, config }
 * @returns {Array} 按 startSection 升序的课程数组；一次性课参与的节次重叠项带 conflict:true 副本
 *   注意：取消型一次性课（course.cancelled）不返回，仅用于抑制原每周课在该日期的显示
 */
export function getCoursesOfDate(dateStr, data = {}) {
	const { courses = [], holidays = [], adjustments = [], config = {} } = data;
	const { isHoliday, adjustment, weekNum, weekday } = getDateStatus(dateStr, { holidays, adjustments, config });

	// 1. 假期优先：完全不显示课程（一次性课同样被压制）
	if (isHoliday) return [];

	// 2/3. 每周课：调休覆盖原生星期，周号一律用当天教学周号；
	// 一次性课（course.date 命中当天）独立于调休星期重映射——日期即用户意图
	const effectiveWeekday = adjustment ? adjustment.targetWeekday : weekday;

	const weekly = courses.filter((c) => !c.date && c.weekday === effectiveWeekday && isCourseOnWeek(c, weekNum));
	const oneoffs = courses.filter((c) => c.date === dateStr);

	// 「仅本次修改」的一次性课（overrideId）在该日期替换原每周课的显示；
	// 「取消型」一次性课（cancelled）只起抑制作用，自身不渲染（daySheet 单独列出可恢复）
	const overridden = new Set(oneoffs.map((o) => o.overrideId).filter((id) => id != null));
	const list = [
		...weekly.filter((c) => !overridden.has(c.id)),
		...oneoffs.filter((o) => !o.cancelled),
	];

	// 同日同节次多课按 startSection 排序（并排渲染由 weekGrid 的布局算法处理）
	list.sort((a, b) => a.startSection - b.startSection || a.endSection - b.endSection);
	return markOnceConflicts(list);
}

/**
 * 冲突标记：节次区间重叠且至少一方为一次性课 → 相关课程全部返回 conflict:true 副本
 * （每周课之间重叠维持并排渲染，不标冲突；渲染层标红，由用户编辑解决）
 */
function markOnceConflicts(list) {
	const n = list.length;
	const adj = Array.from({ length: n }, () => []);
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const a = list[i];
			const b = list[j];
			if (!a.date && !b.date) continue;
			if (sectionsOverlap(a.startSection, a.endSection, b.startSection, b.endSection)) {
				adj[i].push(j);
				adj[j].push(i);
			}
		}
	}
	const inGroup = new Array(n).fill(false);
	const visited = new Array(n).fill(false);
	for (let i = 0; i < n; i++) {
		if (visited[i]) continue;
		const comp = [];
		const stack = [i];
		visited[i] = true;
		while (stack.length) {
			const cur = stack.pop();
			comp.push(cur);
			adj[cur].forEach((nb) => {
				if (!visited[nb]) {
					visited[nb] = true;
					stack.push(nb);
				}
			});
		}
		if (comp.length >= 2) comp.forEach((idx) => (inGroup[idx] = true));
	}
	return list.map((c, i) => (inGroup[i] ? { ...c, conflict: true } : c));
}

/**
 * 计算某日期的课程数量（月历圆点用，同样走过滤链）
 */
export function countCoursesOfDate(dateStr, data) {
	return getCoursesOfDate(dateStr, data).length;
}
