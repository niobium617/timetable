<template>
	<view class="calendar-page">
		<!-- 月份导航 + 当前周次 -->
		<view class="cal-header">
			<view class="month-nav">
				<view class="nav-btn" @click="changeMonth(-1)">
					<u-icon name="arrow-left" size="18" color="#606266"></u-icon>
				</view>
				<text class="month-title">{{ viewYear }}年{{ viewMonth }}月</text>
				<view class="nav-btn" @click="changeMonth(1)">
					<u-icon name="arrow-right" size="18" color="#606266"></u-icon>
				</view>
			</view>
			<text class="week-info">
				今天：第 {{ todayWeek.weekNum }} 周 · {{ todayWeek.isOddWeek ? '单周' : '双周' }}
				<text v-if="todayWeek.isManual" class="manual-mark">（手动）</text>
			</text>
		</view>

		<!-- 月历 -->
		<view class="tt-card cal-card">
			<month-cal :year="viewYear" :month="viewMonth" @select="onSelectDate" />
		</view>

		<!-- 底部提示 -->
		<view class="cal-legend">
			<view class="legend-item"><view class="dot dot-course"></view><text>有课</text></view>
			<view class="legend-item"><text class="legend-tag tag-holiday">假</text><text>假期</text></view>
			<view class="legend-item"><text class="legend-tag tag-adjust">补</text><text>调休补课</text></view>
		</view>

		<!-- 回到今天 -->
		<view v-if="!isViewingThisMonth" class="back-today" @click="backToToday">
			<u-icon name="calendar" size="18" color="#ffffff"></u-icon>
			<text>今天</text>
		</view>

		<!-- 当日课程弹窗 -->
		<day-sheet
			:show="sheetShow"
			:date="sheetDate"
			@close="sheetShow = false"
			@course-click="openEdit"
			@add="onDaySheetAdd"
		/>

		<!-- 课程编辑弹窗 -->
		<course-edit
			:show="editShow"
			:course="editCourse"
			:prefill="editPrefill"
			:date-context="editDateContext"
			:sections-count="data.config.sections.length"
			:max-week="maxWeek"
			@close="editShow = false"
			@save="onCourseSave"
			@remove="onCourseRemove"
			@copy="onCourseCopy"
		/>
	</view>
</template>

<script setup>
/**
 * calendar —— 月日历页（日历 Tab）
 * - 自封装月历：课程彩色圆点、假期置灰、调休「补」角标
 * - 点击日期 → 当日课程底部弹窗（与周课表同一过滤链）
 * - 切换月份、回到今天；顶部显示当前教学周次与单双周
 */
import { ref, computed } from 'vue';
import { useData } from '../../store/useData.js';
import { getDisplayWeekInfo } from '../../utils/week.js';
import { todayStr, parseDate, getWeekday } from '../../utils/time.js';
import { parseWeeksPattern } from '../../utils/weeksPattern.js';
import monthCal from '../../components/monthCal/monthCal.vue';
import daySheet from '../../components/daySheet/daySheet.vue';
import courseEdit from '../../components/courseEdit/courseEdit.vue';

const {
	data,
	addCourse,
	updateCourse,
	deleteCourse,
	copyCourse,
	splitCourseRange,
} = useData();

/** 课程覆盖的最大周号（周段拆分选择器上限，默认 20） */
const maxWeek = computed(() => {
	let max = 20;
	data.courses.forEach((c) => {
		const { type, weeks } = parseWeeksPattern(c.weeks);
		if (type === 'range' && weeks.size) {
			max = Math.max(max, ...weeks);
		}
	});
	return max;
});

/* ==================== 月份视图 ==================== */

const today = parseDate(todayStr());
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth() + 1);

const isViewingThisMonth = computed(
	() => viewYear.value === today.getFullYear() && viewMonth.value === today.getMonth() + 1
);

function changeMonth(delta) {
	let m = viewMonth.value + delta;
	let y = viewYear.value;
	if (m < 1) { m = 12; y -= 1; }
	if (m > 12) { m = 1; y += 1; }
	viewMonth.value = m;
	viewYear.value = y;
}

function backToToday() {
	viewYear.value = today.getFullYear();
	viewMonth.value = today.getMonth() + 1;
}

/** 顶部：今天的教学周信息（跟随 config 实时变化；展示时周号下限为 1） */
const todayWeek = computed(() => getDisplayWeekInfo(todayStr(), data.config));

/* ==================== 当日弹窗 ==================== */

const sheetShow = ref(false);
const sheetDate = ref('');

function onSelectDate(date) {
	sheetDate.value = date;
	sheetShow.value = true;
}

/* ==================== 课程编辑（与周课表一致） ==================== */

const editShow = ref(false);
const editCourse = ref(null);
const editPrefill = ref(null);
/** 打开弹窗时所在日期（当日弹窗的日期），作为「单次」模式默认生效日期 */
const editDateContext = ref('');

function openEdit(course) {
	sheetShow.value = false; // 先收起当日弹窗
	editCourse.value = course;
	editPrefill.value = null;
	editDateContext.value = sheetDate.value;
	editShow.value = true;
}

/** 当日弹窗「添加课程」：按所选日期新增（单次模式日期预填） */
function onDaySheetAdd() {
	sheetShow.value = false;
	editCourse.value = null;
	editPrefill.value = { weekday: getWeekday(sheetDate.value), date: sheetDate.value };
	editDateContext.value = sheetDate.value;
	editShow.value = true;
}

function onCourseSave(payload) {
	// 周段拆分：拆成「修改段 + 剩余周」，失败不关闭弹窗
	if (payload.splitRange) {
		const { splitRange, originalId, rangeStart, rangeEnd, ...patch } = payload;
		const r = splitCourseRange(originalId, patch, rangeStart, rangeEnd);
		if (!r.ok) {
			uni.showToast({ title: r.error || '拆分失败', icon: 'none', duration: 2500 });
			return;
		}
		uni.showToast({ title: r.remainder ? '已拆分保存：所选周段使用新信息' : '已保存（覆盖全部周次）', icon: 'success' });
		editShow.value = false;
		sheetShow.value = true;
		return;
	}
	if (payload.id) {
		const { id, ...patch } = payload;
		updateCourse(id, patch);
		uni.showToast({ title: '已保存', icon: 'success' });
	} else {
		const { id, ...rest } = payload;
		addCourse(rest);
		uni.showToast({ title: '已添加', icon: 'success' });
	}
	editShow.value = false;
	sheetShow.value = true; // 回到当日弹窗，便于继续查看
}

function onCourseRemove(id) {
	deleteCourse(id);
	uni.showToast({ title: '已删除', icon: 'success' });
	editShow.value = false;
	sheetShow.value = true;
}

function onCourseCopy(id) {
	const copy = copyCourse(id);
	uni.showToast({ title: '已复制，可修改后保存', icon: 'none' });
	openEdit(copy);
}
</script>

<style lang="scss" scoped>
.calendar-page {
	min-height: 100vh;
	background: #f6f7f9;
	padding-bottom: 40rpx;
}

/* ---------- 顶部 ---------- */
.cal-header {
	background: #ffffff;
	padding: 20rpx 32rpx 24rpx;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12rpx;

	.month-nav {
		display: flex;
		align-items: center;
		gap: 32rpx;

		.nav-btn {
			width: 60rpx;
			height: 60rpx;
			border-radius: 50%;
			background: #f5f7fa;
			display: flex;
			align-items: center;
			justify-content: center;

			&:active {
				background: #ecf5ff;
			}
		}

		.month-title {
			font-size: 34rpx;
			font-weight: 700;
			color: #303133;
			min-width: 260rpx;
			text-align: center;
		}
	}

	.week-info {
		font-size: 24rpx;
		color: #909399;

		.manual-mark {
			color: #f56c6c;
		}
	}
}

.cal-card {
	padding: 16rpx;
}

/* ---------- 图例 ---------- */
.cal-legend {
	display: flex;
	justify-content: center;
	gap: 40rpx;
	padding: 12rpx 0;

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8rpx;
		font-size: 22rpx;
		color: #909399;

		.dot {
			width: 12rpx;
			height: 12rpx;
			border-radius: 50%;
		}

		.dot-course {
			background: #409eff;
		}

		.legend-tag {
			font-size: 16rpx;
			padding: 0 8rpx;
			border-radius: 6rpx;
			color: #ffffff;
			line-height: 1.6;
		}

		.tag-holiday {
			background: #c0c4cc;
		}

		.tag-adjust {
			background: #e6a23c;
		}
	}
}

/* ---------- 回到今天 ---------- */
.back-today {
	position: fixed;
	right: 32rpx;
	bottom: 60rpx;
	display: flex;
	align-items: center;
	gap: 8rpx;
	background: #409eff;
	color: #ffffff;
	font-size: 26rpx;
	padding: 18rpx 30rpx;
	border-radius: 40rpx;
	box-shadow: 0 6rpx 20rpx rgba(64, 158, 255, 0.4);
	z-index: 10;

	&:active {
		opacity: 0.85;
	}
}
</style>
