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
import { getWeekday } from './time.js';

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
 * @returns {Array} 按 startSection 升序的课程数组
 */
export function getCoursesOfDate(dateStr, data = {}) {
	const { courses = [], holidays = [], adjustments = [], config = {} } = data;
	const { isHoliday, adjustment, weekNum, weekday } = getDateStatus(dateStr, { holidays, adjustments, config });

	// 1. 假期优先：完全不显示课程
	if (isHoliday) return [];

	// 2/3. 确定生效的星期（调休覆盖原生星期），周号一律用当天教学周号
	const effectiveWeekday = adjustment ? adjustment.targetWeekday : weekday;

	const list = courses.filter(c =>
		c.weekday === effectiveWeekday && isCourseOnWeek(c, weekNum)
	);
	// 同日同节次多课按 startSection 排序（并排渲染由 weekGrid 的布局算法处理）
	return list.sort((a, b) => a.startSection - b.startSection || a.endSection - b.endSection);
}

/**
 * 计算某日期的课程数量（月历圆点用，同样走过滤链）
 */
export function countCoursesOfDate(dateStr, data) {
	return getCoursesOfDate(dateStr, data).length;
}
