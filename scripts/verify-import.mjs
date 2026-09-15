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
import { getCoursesOfDate, countCoursesOfDate } from '../src/utils/filter.js';
import { intersectWeeksRange, subtractWeeksRange, matchParityRange } from '../src/utils/weeksPattern.js';
import { OFFICIAL_HOLIDAYS, OFFICIAL_ADJUSTMENTS, getOfficialYears } from '../src/utils/officialHolidays.js';
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
const noSec = parseTimetable('{"courses":[{"name":"测试课","weekday":1,"startSection":1,"endSection":2,"weeks":"all"}]}');
assert(noSec.courses.length === 1 && noSec.warnings.some((w) => w.includes('未识别到节次时间')), '缺 sections → 有明确提示');

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

console.log('== 官方节假日数据（按年份组织）==');
assert(getOfficialYears().length === 1 && getOfficialYears()[0] === '2026', `年份列表 = [2026]（实际 ${JSON.stringify(getOfficialYears())}）`);
const H26 = OFFICIAL_HOLIDAYS['2026'];
const A26 = OFFICIAL_ADJUSTMENTS['2026'];
assert(H26.length === 33, `2026 官方假期 33 天（实际 ${H26.length}）`);
assert(new Set(H26.map((h) => h.date)).size === 33, '假期日期无重复');
assert(H26.every((h) => h.name), '每个假期都有节日名');
assert(H26.some((h) => h.date === '2026-10-01' && h.name === '国庆节'), '国庆节 10/1 在内');
assert(H26.some((h) => h.date === '2026-10-07' && h.name === '国庆节'), '国庆节 10/7（共 7 天）在内');
assert(H26.some((h) => h.date === '2026-09-25' && h.name === '中秋节'), '中秋节 9/25 在内');
assert(H26.some((h) => h.date === '2026-02-15' && h.name === '春节'), '春节 2/15 在内');
assert(A26.length === 6, `2026 官方调休上班日 6 个（实际 ${A26.length}）`);
assert(A26.every((a) => getWeekday(a.date) >= 6), '调休上班日均为周六/周日');
assert(A26.every((a) => suggestAdjustWeekday(a.date, H26) != null), '每个调休日都能推算补课星期');

console.log('== 过滤链：一次性课（date/overrideId/冲突标记）==');
const baseData = {
	config: { termStartDate: '2026-08-31', firstWeekType: 'odd', manualWeek: null },
	holidays: [],
	adjustments: [],
};
const weeklyMath = { id: 'w1', name: '高等数学', weekday: 1, startSection: 1, endSection: 2, weeks: 'all', sourceKey: null };
const weeklyPE = { id: 'w2', name: '体育', weekday: 1, startSection: 5, endSection: 6, weeks: 'all', sourceKey: null };

// 一次性课在其日期显示（weekday 与当天星期不同也显示——日期即意图）
let r1 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, { id: 'o1', name: '讲座', weekday: 3, startSection: 9, endSection: 10, weeks: 'all', date: '2026-09-07', sourceKey: null }] });
assert(r1.length === 2 && r1.some((c) => c.name === '讲座'), '一次性课命中其日期（不依赖星期）');

// 非命中日期不显示（同为周一，仅每周课）
let r2 = getCoursesOfDate('2026-09-14', { ...baseData, courses: [weeklyMath, { id: 'o1', name: '讲座', weekday: 1, startSection: 9, endSection: 10, weeks: 'all', date: '2026-09-07', sourceKey: null }] });
assert(r2.length === 1 && r2[0].id === 'w1', '一次性课仅在其日期显示');

// overrideId 抑制：拆分课替换原每周课，无冲突标记
let r3 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, { id: 'o1', name: '高等数学（换教室）', weekday: 1, startSection: 1, endSection: 2, weeks: 'all', date: '2026-09-07', overrideId: 'w1', sourceKey: null }] });
assert(r3.length === 1 && r3[0].id === 'o1' && !r3[0].conflict, 'overrideId 抑制原课且不标冲突');

// 冲突：一次性课与每周课同节次重叠（无 overrideId）→ 双方标红
let r4 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, { id: 'o2', name: '临时补课', weekday: 1, startSection: 1, endSection: 2, weeks: 'all', date: '2026-09-07', sourceKey: null }] });
assert(r4.length === 2 && r4.every((c) => c.conflict === true), '一次性课与每周课重叠 → 双方标冲突');

// 每周课之间重叠不标冲突（维持并排）
let r5 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, { ...weeklyPE, id: 'w3', startSection: 1, endSection: 2 }] });
assert(r5.length === 2 && r5.every((c) => !c.conflict), '每周课之间重叠不标冲突');

// 假期压制一次性课
let r6 = getCoursesOfDate('2026-09-25', { ...baseData, holidays: [{ date: '2026-09-25' }], courses: [{ id: 'o3', name: '补课', weekday: 5, startSection: 1, endSection: 2, weeks: 'all', date: '2026-09-25', sourceKey: null }] });
assert(r6.length === 0, '假期当天一次性课同样不显示');

// 调休日：每周课按 targetWeekday 重映射，一次性课独立显示
let r7 = getCoursesOfDate('2026-09-12', { ...baseData, adjustments: [{ date: '2026-09-12', targetWeekday: 1 }], courses: [weeklyMath, { id: 'o4', name: '周六活动', weekday: 3, startSection: 7, endSection: 8, weeks: 'all', date: '2026-09-12', sourceKey: null }] });
assert(r7.some((c) => c.id === 'w1') && r7.some((c) => c.id === 'o4'), '调休日每周课重映射 + 一次性课独立显示');

console.log('== 分级删除：取消型一次性课（cancelled）==');
// 取消当天：抑制原每周课，自身不渲染
const cancelRec = { id: 'x1', name: '高等数学', weekday: 1, startSection: 1, endSection: 2, weeks: 'all', date: '2026-09-07', overrideId: 'w1', cancelled: true, sourceKey: null };
let c1 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, cancelRec] });
assert(c1.length === 0, '取消型一次性课：当天原课被抑制且自身不显示');

// 只影响当天：同周其它日期照常上课
let c2 = getCoursesOfDate('2026-09-14', { ...baseData, courses: [weeklyMath, cancelRec] });
assert(c2.length === 1 && c2[0].id === 'w1', '取消只作用于当天，下一周照常显示');

// 月历圆点计数同样不含取消课
assert(countCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, cancelRec] }) === 0, '取消当天不计入课程数（月历圆点）');

// 恢复（删除取消记录）= 原课回归
let c3 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath] });
assert(c3.length === 1 && c3[0].id === 'w1' && !c3[0].conflict, '删除取消记录后原课回归且无冲突标记');

// 取消记录不影响其他课程（同日另一门课照常显示）
let c4 = getCoursesOfDate('2026-09-07', { ...baseData, courses: [weeklyMath, weeklyPE, cancelRec] });
assert(c4.length === 1 && c4[0].id === 'w2', '取消只抑制被取消的那门课');

// 调休日取消：按当天日期匹配，重映射显示的每周课同样被抑制
let c5 = getCoursesOfDate('2026-09-12', {
	...baseData,
	adjustments: [{ date: '2026-09-12', targetWeekday: 1 }],
	courses: [weeklyMath, { ...cancelRec, date: '2026-09-12' }],
});
assert(c5.length === 0, '调休日（补周一课）取消当天同样生效');

console.log('== 周次集合运算（周段拆分）==');
assert(intersectWeeksRange('all', 1, 4) === '1-4', 'all ∩ [1,4] = 1-4');
assert(intersectWeeksRange('1-16', 1, 4) === '1-4', '1-16 ∩ [1,4] = 1-4');
assert(intersectWeeksRange('odd', 1, 4) === '1,3', 'odd ∩ [1,4] = 1,3');
assert(intersectWeeksRange('2-8,10-14', 5, 11) === '5-8,10-11', '多段 ∩ [5,11] = 5-8,10-11');
assert(intersectWeeksRange('5-8', 1, 4) === null, '无交集 → null');
assert(subtractWeeksRange('1-16', 1, 4) === '5-16', '1-16 − [1,4] = 5-16');
assert(subtractWeeksRange('all', 1, 4, 16) === '5-16', 'all − [1,4]（maxWeek=16）= 5-16');
assert(subtractWeeksRange('odd', 1, 4, 10) === '5,7,9', 'odd − [1,4]（maxWeek=10）= 5,7,9');
assert(subtractWeeksRange('even', 1, 4, 8) === '6,8', 'even − [1,4]（maxWeek=8）= 6,8');
assert(subtractWeeksRange('1-4', 1, 4) === null, '减完为空 → null');

console.log('== 单双周限定范围（如「1-16 双周」）==');
const pParity = parseTimetable('{"courses":[{"name":"思政课","weekday":3,"startSection":7,"endSection":8,"weeks":"1-16双周"}]}');
assert(pParity.courses[0]?.weeks === '2,4,6,8,10,12,14,16', `1-16双周 物化（实际 ${pParity.courses[0]?.weeks}）`);
const pParity2 = parseTimetable('{"courses":[{"name":"体育课","weekday":5,"startSection":5,"endSection":6,"weeks":"5-8单周"}]}');
assert(pParity2.courses[0]?.weeks === '5,7', `5-8单周 物化（实际 ${pParity2.courses[0]?.weeks}）`);
const mpr1 = matchParityRange('2,4,6,8');
assert(mpr1 && mpr1.parity === 'even' && mpr1.start === 2 && mpr1.end === 8, '逆向映射：2,4,6,8 → even 2-8');
const mpr2 = matchParityRange('1,3,5');
assert(mpr2 && mpr2.parity === 'odd' && mpr2.start === 1 && mpr2.end === 5, '逆向映射：1,3,5 → odd 1-5');
assert(matchParityRange('1,3,6') === null, '非连续奇偶 → null');
assert(matchParityRange('odd') === null, 'odd 关键字 → null');
assert(matchParityRange('2-8,10-14') === null, '多段 → null');

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
