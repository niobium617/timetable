/**
 * holiday.js —— 假期/调休辅助纯函数
 */

import { parseDate, diffDays, getWeekday } from './time.js';

/**
 * 调休补课建议：取 ±21 天内最近的假期日期，以其星期作为建议的补课星期。
 * 调休补班日通常补同一放假段中被覆盖的工作日，配对无法从数据唯一确定，仅作建议，用户可改选。
 * @param {string} dateStr 调休日期 'YYYY-MM-DD'
 * @param {Array} holidays [{ date, name }]
 * @returns {{ weekday: number, sourceDate: string } | null} weekday 1=周一…7=周日
 */
export function suggestAdjustWeekday(dateStr, holidays = []) {
	const base = parseDate(dateStr);
	let best = null;
	let bestDist = Infinity;

	(holidays || []).forEach((h) => {
		if (!h || !h.date) return;
		let dist;
		try {
			dist = Math.abs(diffDays(base, parseDate(h.date)));
		} catch (e) {
			return;
		}
		if (dist <= 21 && dist < bestDist) {
			bestDist = dist;
			best = h.date;
		}
	});

	if (!best) return null;
	return { weekday: getWeekday(best), sourceDate: best };
}
