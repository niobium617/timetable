/**
 * week.js —— 教学周计算（纯函数）
 *
 * 规则（方案优化版 第五节）：
 * - 周号 = 与学期起始日（必须为周一）的纯日期差每 7 天 +1；假期不跳号。
 * - isOddWeek = (weekNum % 2 === 1) === (firstWeekType === 'odd')
 *   即 firstWeekType='odd' 时周号奇数为单周；'even' 时周号偶数为单周。
 * - manualWeek 非 null 时：weekNum 取 manualWeek，单双周随之计算。
 * - weekStartDay 只影响 UI 列顺序，不影响周号计算。
 */

import { parseDate, addDays, formatDate, diffDays } from './time.js';

/**
 * 获取某日期的教学周信息
 * @param {string} dateStr 'YYYY-MM-DD'
 * @param {object} config { termStartDate, firstWeekType, manualWeek }
 * @returns {{ weekNum: number, isOddWeek: boolean, autoWeek: number, isManual: boolean }}
 */
export function getWeekInfo(dateStr, config) {
	const { termStartDate, firstWeekType = 'odd', manualWeek = null } = config || {};
	if (!termStartDate) {
		return { weekNum: 1, isOddWeek: true, autoWeek: 1, isManual: false };
	}

	const start = parseDate(termStartDate);
	const date = parseDate(dateStr);
	// 纯日期差（含负数：学期开始前的日期周号为 0 或负，调用方一般不会展示）
	const autoWeek = Math.floor(diffDays(start, date) / 7) + 1;

	const isManual = manualWeek != null && manualWeek !== '' && !isNaN(Number(manualWeek));
	const weekNum = isManual ? Number(manualWeek) : autoWeek;

	// 单双周：firstWeekType='odd' 时奇数周为单周；'even' 时偶数周为单周
	const isOddWeek = (weekNum % 2 === 1) === (firstWeekType === 'odd');

	return { weekNum, isOddWeek, autoWeek, isManual };
}

/**
 * 某教学周对应的 7 个日期（按周一~周日绝对顺序，不随 weekStartDay 变化）
 * @param {number} weekNum 教学周号
 * @param {string} termStartDate 学期起始日（周一）
 * @returns {string[]} 7 个 'YYYY-MM-DD'
 */
export function getWeekDates(weekNum, termStartDate) {
	const monday = addDays(parseDate(termStartDate), (weekNum - 1) * 7);
	return Array.from({ length: 7 }, (_, i) => formatDate(addDays(monday, i)));
}

/**
 * 展示用周信息：学期开始前（周号 ≤ 0）按第 1 周展示，单双周按钳制后的周号计算。
 * 仅用于界面展示；过滤链仍用 getWeekInfo 的原始周号（不改变渲染规则）。
 */
export function getDisplayWeekInfo(dateStr, config) {
	const info = getWeekInfo(dateStr, config);
	const weekNum = Math.max(1, info.weekNum);
	const firstWeekType = (config && config.firstWeekType) || 'odd';
	const isOddWeek = (weekNum % 2 === 1) === (firstWeekType === 'odd');
	return { ...info, weekNum, isOddWeek };
}

/** 判断某字符串是否为合法的周规则（用于表单校验提示） */
export function isValidWeeksPattern(pattern) {
	const p = String(pattern == null ? '' : pattern).trim();
	if (!p) return false;
	if (['all', 'odd', 'even', '每周', '单周', '双周'].includes(p)) return true;
	// 区间：逗号分隔的 "a-b" 或 "a"
	return p.split(/[,，]/).every(seg => {
		const s = seg.trim();
		return /^\d+(\s*[-~—]\s*\d+)?$/.test(s);
	});
}
