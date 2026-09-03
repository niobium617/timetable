/**
 * verify-import.mjs —— P3 模式B 纯函数验证（Node 直接运行，无框架）
 *
 * 运行：node --input-type=module -e "import('./scripts/verify-import.mjs')"
 * （package.json 未设 "type":"module"，src/utils/*.js 为 ESM；本机 Node 24 无
 *   --experimental-default-type 选项，用 --input-type 入口导入；
 *   本脚本同时证明纯函数不依赖 uni/DOM——Node 无 DOMParser 全局。）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTimetable, Parser } from '../src/utils/parser.js';
import { matchIncremental, mergeCourses, findConflicts } from '../src/utils/importMatch.js';
import { suggestAdjustWeekday } from '../src/utils/holiday.js';
import { OFFICIAL_HOLIDAYS_2026, OFFICIAL_ADJUSTMENTS_2026 } from '../src/utils/officialHolidays.js';
import { getWeekday } from '../src/utils/time.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;

function assert(cond, label) {
	if (cond) {
		passed++;
	} else {
		failed++;
		console.error(`  ✗ ${label}`);
	}
}

console.log('== parseTimetable（AI JSON 路径）==');

const fixture = readFileSync(join(__dirname, 'fixtures/ai-import.json'), 'utf8');
const r = parseTimetable(fixture);

assert(r.format === 'json', 'format=json');
assert(r.courses.length === 8, `解析出 8 门课程（实际 ${r.courses.length}）`);
assert(r.warnings.length >= 3, `warnings ≥ 3（实际 ${r.warnings.length}）`);

const gs = r.courses.find((c) => c.name === '高等数学');
assert(gs && gs.weeks === '1-16' && gs.weekday === 1 && gs.startSection === 1 && gs.endSection === 2, '高等数学 字段正确');
assert(r.courses.find((c) => c.name === '大学英语')?.weeks === 'odd', '单周 → odd');
assert(r.courses.find((c) => c.name === '体育·羽毛球')?.weeks === '5-8', '区间周次 5-8');
const osList = r.courses.filter((c) => c.name === '操作系统');
assert(osList.length === 2 && osList[0].weeks === '1,3,5,7' && osList[1].weeks === '2,4,6,8', '隔周轮换拆两条：周次列表正确');
assert(r.courses.find((c) => c.name === '形势与政策')?.weeks === '13-16', '尾随"周"字剥离 → 13-16');
const bad = r.courses.find((c) => c.name === '问题课程');
assert(bad && bad.weeks === 'all', '非法周次回退 all 且课程保留');
assert(!r.courses.some((c) => c.name === '非法星期'), 'weekday 非法 → 跳过');
assert(!r.courses.some((c) => c.teacher === 'x'), '缺课程名 → 跳过');
assert(r.courses.find((c) => c.name === '空周次')?.weeks === 'all', '空周次 → all');
assert(r.warnings.some((w) => w.includes('问题课程')), '非法周次有警告');
assert(r.warnings.some((w) => w.includes('非法星期')), '非法 weekday 有警告');

console.log('== sections（节次时间表）==');
assert(r.sections.length === 10, `解析出 10 节时间（实际 ${r.sections.length}）`);
assert(r.sections[0].startTime === '08:30' && r.sections[0].endTime === '09:15', '第 1 节时间正确');
assert(r.sections[9].section === 10 && r.sections[9].endTime === '20:30', '第 10 节时间正确（大节对半拆）');
assert(r.sections.every((s, i) => i === 0 || s.section > r.sections[i - 1].section), '按节次排序且无重复');
assert(r.warnings.some((w) => w.includes('sections')), '非法 section 项有警告');
assert(parseTimetable('{"courses":[]}').sections.length === 0, '无 sections 字段 → 空数组');

console.log('== parseTimetable 边界 ==');
assert(parseTimetable('').courses.length === 0 && parseTimetable('').warnings.length > 0, '空输入 → 空结果+警告');
assert(parseTimetable('你好世界').warnings.length > 0, '非 JSON → 警告不抛异常');
assert(parseTimetable('[1,2,3]').courses.length === 0, '无 courses 数组 → 空结果');
assert(Parser.parse === parseTimetable, 'Parser.parse 即 parseTimetable（规格接口）');

console.log('== matchIncremental / mergeCourses ==');
const existing = [
	{ id: 'e1', name: '高等数学', teacher: '张老师', classroom: '教1-101', weekday: 1, startSection: 1, endSection: 2, weeks: '1-16', color: '#ff0000', remark: '带教材', sourceKey: null },
	{ id: 'e2', name: '旧名字', teacher: 'x', classroom: 'x', weekday: 2, startSection: 1, endSection: 2, weeks: 'odd', color: '#00ff00', remark: '', sourceKey: 'sk1' },
	{ id: 'e3', name: '有源键课程', teacher: 'a', classroom: 'b', weekday: 3, startSection: 5, endSection: 6, weeks: 'all', color: '#0000ff', remark: 'r', sourceKey: 'sk2' },
	{ id: 'e4', name: '不变课程', teacher: 't', classroom: 'c', weekday: 4, startSection: 1, endSection: 2, weeks: 'all', color: '#123456', remark: '', sourceKey: null },
];
const parsed = [
	{ name: '高等数学', teacher: '张老师', classroom: '教2-999', weekday: 1, startSection: 1, endSection: 2, weeks: '1-16', remark: '', sourceKey: null }, // 教室变化 → update
	{ name: '全新课程', teacher: '', classroom: '', weekday: 5, startSection: 3, endSection: 4, weeks: 'all', remark: '', sourceKey: null }, // → add
	{ name: '改过名字', teacher: 'y', classroom: 'z', weekday: 2, startSection: 1, endSection: 2, weeks: 'even', remark: '', sourceKey: 'sk1' }, // sourceKey 匹配 e2（名字不同）→ update
	{ name: '有源键课程', teacher: 'a', classroom: 'b', weekday: 3, startSection: 5, endSection: 6, weeks: 'all', remark: '', sourceKey: null }, // 单侧无 sourceKey → 兜底键匹配 e3 → unchanged
	{ name: '不变课程', teacher: 't', classroom: 'c', weekday: 4, startSection: 1, endSection: 2, weeks: 'all', remark: '', sourceKey: null }, // → unchanged
];

const m = matchIncremental(parsed, existing);
assert(m.add.length === 1 && m.add[0].name === '全新课程', '新增 1 门');
assert(m.update.length === 2, `更新 2 门（实际 ${m.update.length}）`);
assert(m.update.some((u) => u.existing.id === 'e1'), '兜底键命中 e1');
assert(m.update.some((u) => u.existing.id === 'e2'), 'sourceKey 优先命中 e2（名字不同）');
assert(m.unchanged.length === 2, `不变 2 门（实际 ${m.unchanged.length}）`);
assert(m.unchanged.some((u) => u.existing.id === 'e3'), '单侧 sourceKey 走兜底键 → 不变');
assert(m.unchanged.some((u) => u.existing.id === 'e4'), 'e4 完全一致 → 不变');

const merged = mergeCourses(parsed, existing);
assert(merged.courses.length === 5, `合并后 5 门（实际 ${merged.courses.length}）`);
const e1After = merged.courses.find((c) => c.id === 'e1');
assert(e1After && e1After.classroom === '教2-999' && e1After.color === '#ff0000' && e1After.remark === '带教材' && e1After.id === 'e1', '更新保留 id/color/remark');
assert(merged.courses.some((c) => c.name === '全新课程' && !c.id), '新增课程无 id（提交时生成）');

console.log('== findConflicts ==');
assert(findConflicts([
	{ name: 'a', weekday: 1, startSection: 1, endSection: 2 },
	{ name: 'b', weekday: 1, startSection: 3, endSection: 4 },
]).length === 0, '相邻节次不冲突');
const same = findConflicts([
	{ name: 'a', weekday: 1, startSection: 5, endSection: 6 },
	{ name: 'b', weekday: 1, startSection: 5, endSection: 6 },
]);
assert(same.length === 1 && same[0].length === 2, '同节次重叠 → 1 组 2 门');
const bridge = findConflicts([
	{ name: 'a', weekday: 2, startSection: 1, endSection: 2 },
	{ name: 'b', weekday: 2, startSection: 1, endSection: 4 },
	{ name: 'c', weekday: 2, startSection: 3, endSection: 4 },
]);
assert(bridge.length === 1 && bridge[0].length === 3, '桥接重叠 → 1 组 3 门');
assert(findConflicts([
	{ name: 'a', weekday: 1, startSection: 1, endSection: 2 },
	{ name: 'b', weekday: 2, startSection: 1, endSection: 2 },
]).length === 0, '不同星期不冲突');
// 隔周轮换（同星期同节次、周次不相交）不算冲突
const alt = findConflicts([
	{ name: '操作系统', weekday: 5, startSection: 3, endSection: 4, weeks: '1,3,5,7' },
	{ name: '操作系统', weekday: 5, startSection: 3, endSection: 4, weeks: '2,4,6,8' },
]);
assert(alt.length === 0, '隔周轮换（周次不相交）不冲突');
assert(findConflicts([
	{ name: 'a', weekday: 1, startSection: 5, endSection: 6, weeks: 'odd' },
	{ name: 'b', weekday: 1, startSection: 5, endSection: 6, weeks: 'even' },
]).length === 0, '单双周互斥不冲突');
assert(findConflicts([
	{ name: 'a', weekday: 1, startSection: 5, endSection: 6, weeks: 'odd' },
	{ name: 'b', weekday: 1, startSection: 5, endSection: 6, weeks: 'all' },
]).length === 1, 'odd 与 all 相交 → 冲突');
assert(findConflicts([
	{ name: 'a', weekday: 1, startSection: 5, endSection: 6, weeks: '1-8' },
	{ name: 'b', weekday: 1, startSection: 5, endSection: 6, weeks: '8-16' },
]).length === 1, '区间在第 8 周相交 → 冲突');

console.log('== 官方节假日数据（2026）==');
assert(OFFICIAL_HOLIDAYS_2026.length === 33, `官方假期 33 天（实际 ${OFFICIAL_HOLIDAYS_2026.length}）`);
assert(new Set(OFFICIAL_HOLIDAYS_2026.map((h) => h.date)).size === 33, '假期日期无重复');
assert(OFFICIAL_HOLIDAYS_2026.every((h) => h.name), '每个假期都有节日名');
assert(OFFICIAL_HOLIDAYS_2026.some((h) => h.date === '2026-10-01' && h.name === '国庆节'), '国庆节 10/1 在内');
assert(OFFICIAL_HOLIDAYS_2026.some((h) => h.date === '2026-10-07' && h.name === '国庆节'), '国庆节 10/7（共 7 天）在内');
assert(OFFICIAL_HOLIDAYS_2026.some((h) => h.date === '2026-09-25' && h.name === '中秋节'), '中秋节 9/25 在内');
assert(OFFICIAL_HOLIDAYS_2026.some((h) => h.date === '2026-02-15' && h.name === '春节'), '春节 2/15 在内');
assert(OFFICIAL_ADJUSTMENTS_2026.length === 6, `官方调休上班日 6 个（实际 ${OFFICIAL_ADJUSTMENTS_2026.length}）`);
assert(OFFICIAL_ADJUSTMENTS_2026.every((a) => getWeekday(a.date) >= 6), '调休上班日均为周六/周日');
assert(OFFICIAL_ADJUSTMENTS_2026.every((a) => suggestAdjustWeekday(a.date, OFFICIAL_HOLIDAYS_2026) != null), '每个调休日都能推算补课星期');

console.log('== suggestAdjustWeekday ==');
const holidays = [{ date: '2026-10-01' }, { date: '2026-10-02' }, { date: '2026-10-03' }];
const s1 = suggestAdjustWeekday('2026-10-10', holidays);
assert(s1 && s1.sourceDate === '2026-10-03' && s1.weekday === 6, `最近假期 10-03（周六）（实际 ${JSON.stringify(s1)}）`);
const s2 = suggestAdjustWeekday('2026-09-10', holidays);
assert(s2 && s2.sourceDate === '2026-10-01' && s2.weekday === 4, `21 天边界命中 10-01（周四）（实际 ${JSON.stringify(s2)}）`);
const s3 = suggestAdjustWeekday('2026-09-10', [{ date: '2026-01-01' }]);
assert(s3 === null, '超 21 天 → null');
assert(suggestAdjustWeekday('2026-10-10', []) === null, '无假期 → null');
assert(suggestAdjustWeekday('2026-10-10', [{ date: '非法日期' }]) === null, '非法假期日期不抛异常');

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
