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

/* ==================== 周次集合运算（周段分段修改用） ==================== */

/** 周次集合压缩为规范 weeks 字符串："1,3,5" / "1-4" / "2-8,10-14"；空集返回 null */
function compressWeeks(set) {
	if (!set || set.size === 0) return null;
	const list = [...set].sort((a, b) => a - b);
	const parts = [];
	let start = list[0], prev = list[0];
	for (let i = 1; i < list.length; i++) {
		if (list[i] === prev + 1) { prev = list[i]; continue; }
		parts.push(start === prev ? `${start}` : `${start}-${prev}`);
		start = prev = list[i];
	}
	parts.push(start === prev ? `${start}` : `${start}-${prev}`);
	return parts.join(',');
}

/** 展开周规则为周号集合（all/odd/even 按 maxWeek 截断展开） */
function expandWeeks(pattern, maxWeek = 20) {
	const { type, weeks } = parseWeeksPattern(pattern);
	const set = new Set();
	if (type === 'all') {
		for (let w = 1; w <= maxWeek; w++) set.add(w);
	} else if (type === 'odd') {
		for (let w = 1; w <= maxWeek; w += 2) set.add(w);
	} else if (type === 'even') {
		for (let w = 2; w <= maxWeek; w += 2) set.add(w);
	} else {
		weeks.forEach((w) => set.add(w));
	}
	return set;
}

/**
 * 周规则与 [a,b] 周段的交集（分段修改的"修改段"周次）
 * @returns {string|null} 规范 weeks 字符串；交集为空返回 null
 */
export function intersectWeeksRange(pattern, a, b) {
	const lo = Math.min(a, b), hi = Math.max(a, b);
	const set = expandWeeks(pattern, hi);
	for (let w = 1; w < lo; w++) set.delete(w);
	for (let w = hi + 1; w <= Math.max(hi, 20); w++) set.delete(w);
	return compressWeeks(set);
}

/**
 * 周规则减去 [a,b] 周段（分段修改的"剩余周"）
 * all/odd/even 为无界规则，按 maxWeek（默认 20）截断后再减
 * @returns {string|null} 规范 weeks 字符串；减完为空返回 null
 */
export function subtractWeeksRange(pattern, a, b, maxWeek = 20) {
	const lo = Math.min(a, b), hi = Math.max(a, b);
	const set = expandWeeks(pattern, maxWeek);
	for (let w = lo; w <= hi; w++) set.delete(w);
	return compressWeeks(set);
}

/**
 * 显式连续奇偶列表 → 单双周 + 范围（编辑弹窗逆向映射，如 "2,4,6,8" → even ∩ [2,8]）
 * 不满足"同奇偶、步长 2、无间断"则返回 null
 * @returns {{ parity: 'odd'|'even', start: number, end: number } | null}
 */
export function matchParityRange(pattern) {
	const { type, weeks } = parseWeeksPattern(pattern);
	if (type !== 'range') return null;
	const list = [...weeks].sort((a, b) => a - b);
	if (list.length === 0) return null;
	const parity = list[0] % 2;
	for (let i = 0; i < list.length; i++) {
		if (list[i] % 2 !== parity || list[i] !== list[0] + i * 2) return null;
	}
	return { parity: parity === 1 ? 'odd' : 'even', start: list[0], end: list[list.length - 1] };
}
