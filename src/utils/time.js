/**
 * time.js —— 纯日期/时间工具函数（无任何业务依赖）
 *
 * 约定：
 * - 所有"日期"均为 'YYYY-MM-DD' 字符串，解析为本地时区零点，避免 UTC 偏移导致日期错一天。
 * - weekday 恒为绝对星期：1=周一 … 7=周日（与课程 weekday 字段一致）。
 */

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 补零 */
export function pad2(n) {
	return n < 10 ? '0' + n : '' + n;
}

/**
 * 'YYYY-MM-DD' → 本地时区零点 Date
 * 不使用 new Date(str)（会被当作 UTC 解析，东八区可能偏移一天）
 */
export function parseDate(dateStr) {
	const parts = String(dateStr).split('-').map(Number);
	if (parts.length !== 3 || parts.some(isNaN)) {
		throw new Error('日期格式错误: ' + dateStr);
	}
	return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

/** Date → 'YYYY-MM-DD'（本地时区） */
export function formatDate(date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 今天的 'YYYY-MM-DD' */
export function todayStr() {
	return formatDate(new Date());
}

/** 日期加 n 天（返回新的 Date，原值不变） */
export function addDays(date, n) {
	const d = new Date(date);
	d.setDate(d.getDate() + n);
	return d;
}

/** b - a 相差天数（按本地零点取整，忽略时分秒） */
export function diffDays(a, b) {
	const MS_PER_DAY = 86400000;
	const da = parseDate(typeof a === 'string' ? a : formatDate(a));
	const db = parseDate(typeof b === 'string' ? b : formatDate(b));
	return Math.round((db - da) / MS_PER_DAY);
}

/** 绝对星期：1=周一 … 7=周日 */
export function getWeekday(date) {
	const d = typeof date === 'string' ? parseDate(date) : date;
	const jsDay = d.getDay(); // 0=周日
	return jsDay === 0 ? 7 : jsDay;
}

/** 'M月D日'（如 10月5日），用于周课表头部日期范围 */
export function formatMD(dateStr) {
	const d = parseDate(dateStr);
	return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 'M/D'（如 10/5），用于网格列头 */
export function formatMDShort(dateStr) {
	const d = parseDate(dateStr);
	return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 'HH:mm' → 当天分钟数（0-1439），用于节次时间换算 */
export function timeToMinutes(timeStr) {
	const [h, m] = String(timeStr).split(':').map(Number);
	return h * 60 + (m || 0);
}

/** 判断两个节次区间是否重叠（闭区间） */
export function sectionsOverlap(aStart, aEnd, bStart, bEnd) {
	return aStart <= bEnd && bStart <= aEnd;
}
