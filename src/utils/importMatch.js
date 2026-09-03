/**
 * importMatch.js —— 导入匹配与冲突检测（纯函数，可 Node 单测）
 *
 * 规格（方案1-优化版.md）：
 * - 增量导入匹配键：优先 sourceKey，无则按 名称+星期+开始节次 匹配
 * - 命中则更新（保留本地 id/color/remark/sourceKey，仅覆盖语义字段）、未命中则新增
 * - 冲突检测：同星期同节次重叠（闭区间）的课程标红提示，由用户决定保留哪门（不自动删）
 */

import { sectionsOverlap } from './time.js';
import { parseWeeksPattern } from './weeksPattern.js';

/**
 * 课程匹配键
 * @param {object} course
 * @param {boolean} forceFallback 双方 sourceKey 缺一即用兜底键（按 parsed 侧调用）
 * @returns {string}
 */
export function courseKey(course, forceFallback = false) {
	if (!forceFallback && course.sourceKey != null && course.sourceKey !== '') {
		return 's:' + course.sourceKey;
	}
	return `n:${course.name}|${course.weekday}|${course.startSection}`;
}

/** 语义字段（更新时被覆盖的字段） */
const SEMANTIC_FIELDS = ['name', 'teacher', 'classroom', 'weekday', 'startSection', 'endSection', 'weeks'];

/**
 * 增量匹配：parsed（解析出的课程）与 existing（当前课程）比对
 * @returns {{ add: Array, update: Array<{parsed, existing}>, unchanged: Array<{parsed, existing}> }}
 */
export function matchIncremental(parsed, existing) {
	const used = new Set();
	const add = [];
	const update = [];
	const unchanged = [];

	parsed.forEach((p) => {
		const useSource = p.sourceKey != null && p.sourceKey !== '';
		const pk = courseKey(p);
		const idx = existing.findIndex((e) => !used.has(e.id) && courseKey(e, !useSource) === pk);
		if (idx === -1) {
			add.push(p);
			return;
		}
		const e = existing[idx];
		used.add(e.id);
		const differs = SEMANTIC_FIELDS.some((f) => String(p[f] ?? '') !== String(e[f] ?? ''));
		(differs ? update : unchanged).push({ parsed: p, existing: e });
	});

	return { add, update, unchanged };
}

/**
 * 增量合并：返回合并后的最终课程数组（更新就地替换语义字段，新增追加，未命中保留原样）
 * @returns {{ courses: Array, add, update, unchanged }}
 */
export function mergeCourses(parsed, existing) {
	const { add, update, unchanged } = matchIncremental(parsed, existing);
	const byId = new Map(update.map((u) => [u.existing.id, u]));
	const courses = existing.map((e) => {
		const hit = byId.get(e.id);
		if (!hit) return e;
		const p = hit.parsed;
		return {
			...e,
			name: p.name,
			teacher: p.teacher,
			classroom: p.classroom,
			weekday: p.weekday,
			startSection: p.startSection,
			endSection: p.endSection,
			weeks: p.weeks,
		};
	});
	courses.push(...add);
	return { courses, add, update, unchanged };
}

/**
 * 两个周次规则是否在同一教学周同时上课（隔周轮换的课周次不相交，不算冲突）
 * @returns {boolean}
 */
export function weeksOverlap(weeksA, weeksB) {
	const a = parseWeeksPattern(weeksA || 'all');
	const b = parseWeeksPattern(weeksB || 'all');
	const includes = (p, n) =>
		p.type === 'all' || (p.type === 'odd' ? n % 2 === 1 : p.type === 'even' ? n % 2 === 0 : p.weeks.has(n));
	// 任一侧为显式周次集合时逐周检测
	if (a.type === 'range') {
		for (const n of a.weeks) if (includes(b, n)) return true;
		return false;
	}
	if (b.type === 'range') {
		for (const n of b.weeks) if (includes(a, n)) return true;
		return false;
	}
	// 双方都是 all/odd/even：仅 odd vs even 不相交
	return !((a.type === 'odd' && b.type === 'even') || (a.type === 'even' && b.type === 'odd'));
}

/**
 * 冲突检测：同星期、节次区间重叠且周次相交的课程连通组（组内 ≥2 门才算冲突）
 * @param {Array} courses
 * @returns {Array<Array>} 冲突连通组列表
 */
export function findConflicts(courses) {
	const n = courses.length;
	const adj = Array.from({ length: n }, () => []);
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const a = courses[i];
			const b = courses[j];
			if (
				a.weekday === b.weekday &&
				sectionsOverlap(a.startSection, a.endSection, b.startSection, b.endSection) &&
				weeksOverlap(a.weeks, b.weeks)
			) {
				adj[i].push(j);
				adj[j].push(i);
			}
		}
	}
	const visited = new Array(n).fill(false);
	const groups = [];
	for (let i = 0; i < n; i++) {
		if (visited[i]) continue;
		const comp = [];
		const stack = [i];
		visited[i] = true;
		while (stack.length) {
			const cur = stack.pop();
			comp.push(courses[cur]);
			adj[cur].forEach((nb) => {
				if (!visited[nb]) {
					visited[nb] = true;
					stack.push(nb);
				}
			});
		}
		if (comp.length >= 2) groups.push(comp);
	}
	return groups;
}
