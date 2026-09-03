/**
 * sampleData.js —— 首次启动的内置示例数据
 *
 * 用于演示各渲染效果：
 * - 单/双周、单段与多段周区间课程
 * - 同节次多课并排（周三第5-6节两门课）
 * - 2026 年官方假期（国务院 2025-11-04 通知，33 天，见 utils/officialHolidays.js）
 * - 官方调休上班日（6 天，补课星期按附近假期推算，可核对改选）
 *
 * 学期起始日 2026-08-31 为周一（2026-09-01 即开学第1周周二）。
 */
import { OFFICIAL_HOLIDAYS_2026, OFFICIAL_ADJUSTMENTS_2026 } from '../utils/officialHolidays.js';
import { suggestAdjustWeekday } from '../utils/holiday.js';

/** 默认节次时间表：12 节，覆盖常见大学作息 */
export function defaultSections() {
	return [
		{ section: 1, startTime: '08:00', endTime: '08:45' },
		{ section: 2, startTime: '08:55', endTime: '09:40' },
		{ section: 3, startTime: '10:00', endTime: '10:45' },
		{ section: 4, startTime: '10:55', endTime: '11:40' },
		{ section: 5, startTime: '14:00', endTime: '14:45' },
		{ section: 6, startTime: '14:55', endTime: '15:40' },
		{ section: 7, startTime: '16:00', endTime: '16:45' },
		{ section: 8, startTime: '16:55', endTime: '17:40' },
		{ section: 9, startTime: '19:00', endTime: '19:45' },
		{ section: 10, startTime: '19:55', endTime: '20:40' },
		{ section: 11, startTime: '20:50', endTime: '21:35' },
		{ section: 12, startTime: '21:45', endTime: '22:30' },
	];
}

/** 内置示例数据（与存储结构一致，见方案第四节） */
export function sampleData() {
	return {
		version: 1,
		config: {
			schoolName: '示例大学',
			termName: '2026-2027学年第一学期',
			termStartDate: '2026-08-31', // 必须为周一
			firstWeekType: 'odd', // 第1周为单周
			weekStartDay: 1, // 1=周一（仅影响UI列顺序）
			manualWeek: null, // null=自动计算周次
			sections: defaultSections(),
		},
		courses: [
			{ id: 'c_demo_01', name: '高等数学', teacher: '张老师', classroom: '教1-101', color: '#409eff', remark: '带教材上册', weekday: 1, startSection: 1, endSection: 2, weeks: '1-16', sourceKey: null },
			{ id: 'c_demo_02', name: '大学英语', teacher: '李老师', classroom: '教2-305', color: '#67c23a', remark: '', weekday: 1, startSection: 3, endSection: 4, weeks: '1-16', sourceKey: null },
			{ id: 'c_demo_03', name: '职业规划', teacher: '王老师', classroom: '教3-202', color: '#16a085', remark: '前8周结课', weekday: 1, startSection: 9, endSection: 10, weeks: '2-8', sourceKey: null },
			{ id: 'c_demo_04', name: '线性代数', teacher: '张老师', classroom: '教1-203', color: '#9c6b3c', remark: '后半学期开课', weekday: 2, startSection: 1, endSection: 2, weeks: '9-16', sourceKey: null },
			{ id: 'c_demo_05', name: '体育·羽毛球', teacher: '陈老师', classroom: '体育馆', color: '#e6a23c', remark: '穿运动鞋', weekday: 2, startSection: 5, endSection: 6, weeks: '2-8,10-14', sourceKey: null },
			{ id: 'c_demo_06', name: '程序设计基础', teacher: '刘老师', classroom: '实验楼B-401', color: '#f56c6c', remark: '', weekday: 3, startSection: 1, endSection: 2, weeks: 'odd', sourceKey: null },
			{ id: 'c_demo_07', name: '程序设计实验', teacher: '刘老师', classroom: '实验楼B-401', color: '#f56c6c', remark: '和理论课同周', weekday: 3, startSection: 3, endSection: 4, weeks: 'odd', sourceKey: null },
			{ id: 'c_demo_08', name: '心理学与生活', teacher: '赵老师', classroom: '教4-106', color: '#8e44ad', remark: '选修课', weekday: 3, startSection: 5, endSection: 6, weeks: 'all', sourceKey: null },
			{ id: 'c_demo_09', name: '摄影基础', teacher: '孙老师', classroom: '教4-108', color: '#e84393', remark: '选修课', weekday: 3, startSection: 5, endSection: 6, weeks: 'all', sourceKey: null },
			{ id: 'c_demo_10', name: '思想政治', teacher: '周老师', classroom: '教1-阶梯2', color: '#3498db', remark: '', weekday: 4, startSection: 3, endSection: 4, weeks: 'all', sourceKey: null },
			{ id: 'c_demo_11', name: '大学物理', teacher: '吴老师', classroom: '教2-101', color: '#8e44ad', remark: '', weekday: 5, startSection: 1, endSection: 2, weeks: 'even', sourceKey: null },
			{ id: 'c_demo_12', name: '物理实验', teacher: '吴老师', classroom: '实验楼A-203', color: '#8e44ad', remark: '', weekday: 5, startSection: 5, endSection: 6, weeks: 'even', sourceKey: null },
			{ id: 'c_demo_13', name: '高等数学答疑', teacher: '张老师', classroom: '教1-101', color: '#409eff', remark: '答疑课', weekday: 5, startSection: 7, endSection: 8, weeks: '1-16', sourceKey: null },
		],
		holidays: OFFICIAL_HOLIDAYS_2026.map((h) => ({ ...h })),
		adjustments: OFFICIAL_ADJUSTMENTS_2026.map((a) => ({
			date: a.date,
			targetWeekday: suggestAdjustWeekday(a.date, OFFICIAL_HOLIDAYS_2026)?.weekday || 1,
			remark: a.remark,
		})),
	};
}
