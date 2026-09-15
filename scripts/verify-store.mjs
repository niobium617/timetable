/**
 * verify-store.mjs —— store 层分级删除 action 断言（Node 直接运行，无框架）
 *
 * 运行：node --input-type=module -e "import('./scripts/verify-store.mjs')"
 *
 * useData.js 在模块加载时就会读 storage，因此这里先给 globalThis.uni 打桩
 * （内存版 getStorageSync/setStorageSync），再动态 import —— 断言的是
 * cancelCourseOnDate / restoreCourseOnDate / deleteCourseRange /
 * deleteCourseSections 对数据的真实改写结果。
 */
import { sampleData } from '../src/store/sampleData.js';

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

/* ---------- uni 打桩（内存存储 + 静默提示） ---------- */
const mem = new Map();
globalThis.uni = {
	getStorageSync: (k) => (mem.has(k) ? mem.get(k) : ''),
	setStorageSync: (k, v) => mem.set(k, JSON.parse(JSON.stringify(v))),
	removeStorageSync: (k) => mem.delete(k),
	showToast: () => {},
	showModal: () => {},
};

const { useData } = await import('../src/store/useData.js');
const api = useData();
const { data } = api;

/** 重置为一份干净的固定数据（不依赖示例数据的偶然内容） */
function reset() {
	const fresh = {
		version: 1,
		config: {
			schoolName: '测试',
			termName: '2026 秋',
			termStartDate: '2026-08-31', // 周一
			firstWeekType: 'odd',
			weekStartDay: 1,
			manualWeek: null,
			sections: sampleData().config.sections,
		},
		courses: [
			{ id: 'w1', name: '高等数学', teacher: '张老师', classroom: 'A101', color: '#409eff', weekday: 1, startSection: 1, endSection: 4, weeks: 'all', remark: '' },
			{ id: 'w2', name: '体育', teacher: '', classroom: '操场', color: '#67c23a', weekday: 3, startSection: 5, endSection: 6, weeks: '2-8', remark: '' },
		],
		holidays: [],
		adjustments: [],
	};
	Object.keys(data).forEach((k) => delete data[k]);
	Object.assign(data, fresh);
	mem.clear();
}

const find = (id) => data.courses.find((c) => c.id === id);

/** 第 n 教学周的周一（termStartDate = 2026-08-31 为第 1 周周一） */
function weekMonday(n) {
	const d = new Date(2026, 7, 31);
	d.setDate(d.getDate() + (n - 1) * 7);
	const p = (x) => String(x).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

console.log('== cancelCourseOnDate / restoreCourseOnDate ==');
reset();
let d1 = weekMonday(2);
let r = api.cancelCourseOnDate('w1', d1);
assert(r.ok === true, '取消当天返回 ok');
let rec = data.courses.find((c) => c.cancelled && c.date === d1);
assert(!!rec && rec.overrideId === 'w1', '生成取消型一次性课并指向原课');
assert(rec.weekday === 1 && rec.startSection === 1 && rec.endSection === 4, '取消记录沿用原课星期与节次');
assert(find('w1') && !find('w1').cancelled, '原每周课本身未被改动');

r = api.cancelCourseOnDate('w1', d1);
assert(r.ok === true && r.existed === true, '重复取消同一天 → existed，不重复写入');
assert(data.courses.filter((c) => c.cancelled && c.date === d1).length === 1, '取消记录不重复');

// 当天已有替代型一次性课（拆分课）→ 直接标记为取消
reset();
api.addCourse({ id: 'o1', name: '高数（换教室）', weekday: 1, startSection: 1, endSection: 4, weeks: 'all', date: d1, overrideId: 'w1' });
r = api.cancelCourseOnDate('w1', d1);
assert(r.ok && r.replaced === true, '当天已有替代课 → 标记为取消（replaced）');
assert(find('o1').cancelled === true, '替代课被标记 cancelled（原替代内容作废）');
assert(data.courses.filter((c) => c.cancelled).length === 1, '不额外新增取消记录');

// 一次性课不允许作为取消目标
r = api.cancelCourseOnDate('o1', d1);
assert(r.ok === false, '一次性课不支持取消单天');

// 恢复
reset();
api.cancelCourseOnDate('w1', d1);
r = api.restoreCourseOnDate('w1', d1);
assert(r.ok === true && !data.courses.some((c) => c.cancelled), '恢复：取消记录被删除');
r = api.restoreCourseOnDate('w1', d1);
assert(r.ok === false, '无取消记录时恢复返回失败');

console.log('== deleteCourseSections（节次段删除）==');
// 两端都保留 → 拆分为两门课
reset();
r = api.deleteCourseSections('w1', 2, 3);
assert(r.ok && r.split === true, '中间截断 → 拆分为两门课');
assert(find('w1').startSection === 1 && find('w1').endSection === 1, '原课收窄为左侧节次');
const right = data.courses.find((c) => c.id !== 'w1' && c.name === '高等数学');
assert(right && right.startSection === 4 && right.endSection === 4 && right.weeks === 'all', '右侧复制为新课程（节次/周次正确）');
assert(right.classroom === 'A101' && right.color === '#409eff' && right.id !== 'w1', '复制课保留教室与配色且 id 独立');

// 拆分时取消记录同步复制
reset();
api.cancelCourseOnDate('w1', d1);
api.deleteCourseSections('w1', 2, 3);
const splitRight = data.courses.find((c) => c.name === '高等数学' && c.id !== 'w1' && !c.cancelled);
const cancels = data.courses.filter((c) => c.cancelled);
assert(cancels.length === 2, '取消记录同步复制到拆出的新课');
assert(cancels.some((c) => c.overrideId === 'w1') && cancels.some((c) => c.overrideId === splitRight.id), '两条取消记录分别指向两门课');

// 只保留右侧
reset();
r = api.deleteCourseSections('w1', 1, 2);
assert(r.ok && !r.split && !r.deleted, '删除头部 → 未拆分');
assert(find('w1').startSection === 3 && find('w1').endSection === 4, '原课收窄为右侧节次');
assert(data.courses.length === 2, '未新增课程');

// 只保留左侧
reset();
r = api.deleteCourseSections('w1', 4, 4);
assert(find('w1').endSection === 3, '删除尾部 → 原课收窄为左侧节次');

// 全删 → 整门删除
reset();
r = api.deleteCourseSections('w1', 1, 4);
assert(r.ok && r.deleted === true, '删满全部节次 → 整门删除');
assert(!find('w1'), '课程已从列表移除');

// 越界拒绝
reset();
r = api.deleteCourseSections('w1', 3, 6);
assert(r.ok === false && !!r.error, '超出课程节次范围 → 拒绝');
assert(find('w1').startSection === 1 && find('w1').endSection === 4, '拒绝时数据未被改动');

console.log('== deleteCourseRange（周段删除）==');
// 收窄周次
reset();
r = api.deleteCourseRange('w2', 3, 4);
assert(r.ok && r.remainder === true && r.deleted === false, '部分周段删除 → 保留剩余周');
assert(find('w2').weeks === '2,5-8', `周次收窄为剩余周（实际 ${find('w2') && find('w2').weeks}）`);

// 覆盖全部周次 → 整门删除
reset();
r = api.deleteCourseRange('w2', 2, 8);
assert(r.ok && r.deleted === true, '删满全部周次 → 整门删除');
assert(!find('w2'), '课程已从列表移除');

// 该课程在所选周段没有课 → 拒绝
reset();
r = api.deleteCourseRange('w2', 9, 10);
assert(r.ok === false && !!r.error, '周段内没有课 → 拒绝且不备份');
assert(find('w2').weeks === '2-8', '拒绝时周次未被改动');

// 删除周段同时清理落在该周段内的取消记录
reset();
api.cancelCourseOnDate('w1', weekMonday(2));
api.cancelCourseOnDate('w1', weekMonday(9));
r = api.deleteCourseRange('w1', 1, 4);
assert(r.ok && r.remainder === true, '删除第 1-4 周（其余保留）');
assert(data.courses.filter((c) => c.cancelled).length === 1, '删除周段内的取消记录被清理，段外保留');
assert(data.courses.find((c) => c.cancelled).date === weekMonday(9), '保留的是段外那条取消记录');

// 整门删除时清理全部取消记录
reset();
api.cancelCourseOnDate('w1', weekMonday(2));
api.cancelCourseOnDate('w1', weekMonday(9));
r = api.deleteCourseRange('w1', 1, 20);
assert(r.ok && r.deleted === true, '全周段删除 → 整门删除');
assert(data.courses.filter((c) => c.cancelled).length === 0, '整门删除时全部取消记录被清理');

// 一次性课不允许按周段删除
reset();
api.cancelCourseOnDate('w1', d1);
r = api.deleteCourseRange(data.courses.find((c) => c.cancelled).id, 1, 4);
assert(r.ok === false, '一次性课不支持按周段删除');

console.log('== deleteCourse（整门删除，清理指向它的取消记录）==');
// 直接整门删除（课程编辑弹窗的「删除整门课程」）
reset();
api.cancelCourseOnDate('w1', d1);
api.deleteCourse('w1');
assert(!find('w1'), '课程已从列表移除');
assert(data.courses.filter((c) => c.cancelled).length === 0, '整门删除后无悬空取消记录');

// 删除部分节次导致整门删除：取消记录同样一并清理
reset();
api.cancelCourseOnDate('w1', d1);
api.deleteCourseSections('w1', 1, 4);
assert(data.courses.filter((c) => c.cancelled).length === 0, '节次全删 → 整门删除，取消记录一并清理');

// 「仅本次修改」的替代课是真实内容：整门删除后保留为独立一次性课
reset();
api.addCourse({ id: 'o1', name: '高数（换教室）', weekday: 1, startSection: 1, endSection: 4, weeks: 'all', date: d1, overrideId: 'w1' });
api.deleteCourse('w1');
assert(!!find('o1'), '替代型一次性课保留（不是取消记录，属真实内容）');
// 删除不存在的课：返回 false，不动任何数据
reset();
assert(api.deleteCourse('nope') === false, '删除不存在的课程返回 false');

// 删除操作写入自动备份（设置页可撤销）
reset();
api.deleteCourseSections('w1', 2, 3);
assert(!!mem.get('timetable_backup'), '复合删除前写入自动备份（可撤销）');

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exitCode = 1;
