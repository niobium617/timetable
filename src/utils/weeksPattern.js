/**
 * weeksPattern.js —— 周规则解析与判定（纯函数）
 *
 * course.weeks 统一字段取值：
 *   "all"            每周上课
 *   "odd"            仅单周（教学周号为奇数）
 *   "even"           仅双周（教学周号为偶数）
 *   "1-16"           第 1~16 周
 *   "2-8,10-14"      多段不连续周（逗号分隔，每段为 "a-b" 或单个数字 "5"）
 *
 * 解析结果按 pattern 字符串缓存，重复调用零开销。
 */

const cache = new Map();

/**
 * 解析周规则字符串
 * @param {string} pattern
 * @returns {{ type: 'all'|'odd'|'even'|'range', weeks: Set<number>|null }}
 */
export function parseWeeksPattern(pattern) {
	const key = String(pattern == null ? '' : pattern).trim() || 'all';
	if (cache.has(key)) {
		return cache.get(key);
	}

	let result;
	if (key === 'all' || key === '每周' || key === '') {
		result = { type: 'all', weeks: null };
	} else if (key === 'odd' || key === '单周') {
		result = { type: 'odd', weeks: null };
	} else if (key === 'even' || key === '双周') {
		result = { type: 'even', weeks: null };
	} else {
		// 区间解析："2-8,10-14" / "1-16" / "3"
		const weeks = new Set();
		const segments = key.split(/[,，]/);
		for (const seg of segments) {
			const s = seg.trim();
			if (!s) continue;
			const m = s.match(/^(\d+)(?:\s*[-~—]\s*(\d+))?$/);
			if (!m) continue; // 非法片段忽略
			const a = parseInt(m[1], 10);
			const b = m[2] != null ? parseInt(m[2], 10) : a;
			for (let w = Math.min(a, b); w <= Math.max(a, b); w++) {
				weeks.add(w);
			}
		}
		// 解析后没有任何合法周段 → 视为 all，避免课程"永远不上"造成困惑
		if (weeks.size === 0) {
			result = { type: 'all', weeks: null };
		} else {
			result = { type: 'range', weeks };
		}
	}

	cache.set(key, result);
	return result;
}

/**
 * 判断课程在第 weekNum 教学周是否上课
 * @param {{ weeks: string }} course
 * @param {number} weekNum 教学周号（已含手动周次覆盖）
 */
export function isCourseOnWeek(course, weekNum) {
	const { type, weeks } = parseWeeksPattern(course.weeks);
	if (type === 'all') return true;
	if (type === 'odd') return weekNum % 2 === 1;
	if (type === 'even') return weekNum % 2 === 0;
	return weeks.has(weekNum);
}

/** 周规则的人类可读摘要（用于编辑弹窗预览），如 "第1-16周 · 共16周" */
export function describeWeeks(pattern) {
	const { type, weeks } = parseWeeksPattern(pattern);
	if (type === 'all') return '每周上课';
	if (type === 'odd') return '仅单周';
	if (type === 'even') return '仅双周';
	const list = [...weeks].sort((a, b) => a - b);
	// 压缩为区间展示："2-8,10-14"
	const ranges = [];
	let start = list[0], prev = list[0];
	for (let i = 1; i < list.length; i++) {
		if (list[i] === prev + 1) { prev = list[i]; continue; }
		ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
		start = prev = list[i];
	}
	ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
	return `第 ${ranges.join('、')} 周 · 共${list.length}周`;
}
