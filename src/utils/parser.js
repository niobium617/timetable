/**
 * parser.js —— 模式B解析器（多模态 AI 识别路径）
 *
 * 输入：多模态 AI（ChatGPT/Claude 等）按应用内置提示词返回的 JSON（可含 ```json 围栏）。
 * 输出：统一课程结构 { courses, sections, warnings, format }。
 *
 * 纯函数：不依赖 uni/DOM，mp-weixin 与 H5 共用，可直接用 Node 单测。
 * 任何异常不抛出——失败与可疑项全部进 warnings。
 * 统一接口 Parser.parse(source)（规格文档要求），未来新增输入格式在此扩展。
 */

import { isValidWeeksPattern } from './week.js';
import { intersectWeeksRange } from './weeksPattern.js';

/** 规格要求的统一解析接口 */
export const Parser = { parse: parseTimetable };

/**
 * 解析 AI 返回的 JSON 课表
 * @param {string} source 粘贴的 JSON 文本（可含 ```json 代码块围栏，围栏外允许有解释文字）
 * @returns {{ courses: Array, sections: Array, warnings: Array, format: string }}
 *   解析出的课程不含 id/color（提交时由 store 统一生成）；任何异常不抛出
 */
export function parseTimetable(source) {
	const result = { courses: [], sections: [], warnings: [], format: 'json' };

	let text = source == null ? '' : String(source).trim();
	if (!text) {
		result.warnings.push('内容为空，请粘贴 AI 返回的 JSON');
		return result;
	}

	// 剥离 ```json ... ``` 围栏（容忍围栏外夹带的解释文字）
	const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fence) text = fence[1].trim();

	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch (e) {
		result.warnings.push('不是有效的 JSON，请粘贴 AI 返回的 JSON 内容（可包含 ```json 代码块）');
		return result;
	}

	// 兼容两种形状：{courses:[...]} 或直接 [...]
	const isWrapped = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
	const list = isWrapped && Array.isArray(parsed.courses) ? parsed.courses : Array.isArray(parsed) ? parsed : null;
	if (!list) {
		result.warnings.push('JSON 中未找到 courses 数组，请确认 AI 按提示词格式输出');
		return result;
	}

	// 节次时间表（可选）：AI 识别课表标注的时间输出 sections
	if (isWrapped && parsed.sections != null) {
		result.sections = normalizeSections(parsed.sections, result.warnings);
	}

	list.forEach((item, i) => {
		if (!item || typeof item !== 'object') {
			result.warnings.push(`第 ${i + 1} 项不是对象，已跳过`);
			return;
		}
		const name = String(item.name || '').trim();
		if (!name) {
			result.warnings.push(`第 ${i + 1} 项缺少课程名称，已跳过`);
			return;
		}
		const weekday = Math.round(Number(item.weekday));
		const startSection = Math.round(Number(item.startSection));
		const endSection = Math.round(Number(item.endSection));
		if (!(weekday >= 1 && weekday <= 7)) {
			result.warnings.push(`「${name}」weekday 非法（${item.weekday}），已跳过`);
			return;
		}
		if (!(startSection >= 1) || !(endSection >= startSection)) {
			result.warnings.push(`「${name}」节次非法（${item.startSection}-${item.endSection}），已跳过`);
			return;
		}
		const weeks = normalizeWeeks(item.weeks, name, result.warnings);
		result.courses.push({
			name,
			teacher: String(item.teacher || '').trim(),
			classroom: String(item.classroom || '').trim(),
			weekday,
			startSection,
			endSection,
			weeks,
			remark: '',
			sourceKey: null,
		});
	});

	if (result.courses.length === 0 && result.warnings.length === 0) {
		result.warnings.push('未解析到课程');
	}
	// 课程解析成功但缺节次时间：提示用户确认截图是否包含时间表区域
	if (result.courses.length > 0 && result.sections.length === 0) {
		result.warnings.push('未识别到节次时间：请确认截图包含左侧时间列，或按提示词让 AI 提问确认节次时长后重试');
	}
	return result;
}

/**
 * 节次时间表归一化：校验 {section, startTime, endTime}，去重按节次排序
 * @returns {Array<{section:number, startTime:string, endTime:string}>}
 */
function normalizeSections(raw, warnings) {
	const out = [];
	const seen = new Set();
	if (!Array.isArray(raw)) return out;
	raw.forEach((s, i) => {
		if (!s || typeof s !== 'object') {
			warnings.push(`sections 第 ${i + 1} 项不是对象，已跳过`);
			return;
		}
		const section = Math.round(Number(s.section));
		const startTime = String(s.startTime || '').trim();
		const endTime = String(s.endTime || '').trim();
		if (
			!(section >= 1 && section <= 30) ||
			!/^\d{1,2}:\d{2}$/.test(startTime) ||
			!/^\d{1,2}:\d{2}$/.test(endTime)
		) {
			warnings.push(`sections 第 ${i + 1} 项格式非法，已跳过`);
			return;
		}
		if (seen.has(section)) return; // 重复节次取第一条
		seen.add(section);
		out.push({ section, startTime, endTime });
	});
	out.sort((a, b) => a.section - b.section);
	return out;
}

/**
 * 周次规则归一化：容忍 "1-16周"、"1~16周"、"1-16双周" 等写法；非法规则回退 'all' 并警告
 * @returns {string} 'all' | 'odd' | 'even' | '1-16' | '2,4,6,8' | '2-8,10-14'
 */
function normalizeWeeks(weeks, courseName, warnings) {
	let w = String(weeks == null || weeks === '' ? 'all' : weeks).trim();
	// "1-16双周"/"1-16单周" → 物化为显式周次列表（如 "2,4,6,...,16"）
	const pr = w.match(/^(\d+)\s*[-~—]\s*(\d+)\s*(单周|双周)$/);
	if (pr) {
		w = intersectWeeksRange(pr[3] === '单周' ? 'odd' : 'even', Number(pr[1]), Number(pr[2]));
	} else if (/周$/.test(w) && !['单周', '双周', '每周'].includes(w)) {
		// 剥离尾随"周"字（仅对区间/列表形式，关键词"单周/双周/每周"不动）
		w = w.replace(/周/g, '').trim();
	}
	if (isValidWeeksPattern(w)) return w;
	warnings.push(`「${courseName}」周次规则无法识别（${weeks}），已按每周处理`);
	return 'all';
}
