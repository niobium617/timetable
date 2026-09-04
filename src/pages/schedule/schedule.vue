<template>
	<view class="schedule-page">
		<!-- 学期/周次信息头 -->
		<view class="week-header">
			<view class="term-row">
				<text class="term-name">{{ data.config.schoolName || '我的课程表' }}</text>
				<text class="term-sub">{{ data.config.termName }}</text>
			</view>
			<view class="week-row">
				<text class="week-num">第 {{ headerInfo.weekNum }} 周</text>
				<view class="week-badge" :class="headerInfo.isOddWeek ? 'badge-odd' : 'badge-even'">
					{{ headerInfo.isOddWeek ? '单周' : '双周' }}
				</view>
				<view v-if="headerInfo.isManual" class="manual-badge">手动</view>
			</view>
			<text class="date-range">{{ headerInfo.rangeLabel }}</text>
		</view>

		<!-- 未配置学期起始日时的引导 -->
		<view v-if="!hasTerm" class="guide">
			<text class="guide-icon">📅</text>
			<text class="guide-text">还没有配置学期信息</text>
			<view class="guide-btn" @click="goSettings">去设置学期起始日期</view>
		</view>

		<!-- 周课表：每个教学周一个真实页面，原生滑动无瞬移复位 -->
		<swiper
			v-else
			class="week-swiper"
			:current="swiperCurrent"
			:duration="400"
			:circular="false"
			:skip-hidden-item-layout="true"
			@change="onSwiperChange"
		>
			<!-- key 按周号固定：页面列表只增删不重排，实例稳定复用 -->
			<swiper-item v-for="page in pages" :key="'w' + page.weekNum">
				<week-grid
					:week-dates="page.dates"
					@cell-click="onCellClick"
					@course-click="openEdit"
				/>
			</swiper-item>
		</swiper>

		<!-- 回到本周 -->
		<view v-if="swiperCurrent + 1 !== currentWeekNum" class="back-week" @click="backToThisWeek">
			<u-icon name="arrow-leftward" size="18" color="#ffffff"></u-icon>
			<text>本周</text>
		</view>

		<!-- 课程编辑弹窗 -->
		<course-edit
			:show="editShow"
			:course="editCourse"
			:prefill="editPrefill"
			:date-context="editDateContext"
			:max-week="maxWeek"
			:sections-count="data.config.sections.length"
			@close="editShow = false"
			@save="onCourseSave"
			@remove="onCourseRemove"
			@copy="onCourseCopy"
		/>
	</view>
</template>

<script setup>
/**
 * schedule —— 周课表页（课表 Tab）
 * - 左右滑动切换周次：swiper 预渲染 3 页（上/当前/下）
 * - 顶部展示当前教学周号、单双周标识与日期范围
 * - 点击课程块编辑、点击空白格快速新增、回到本周按钮
 */
import { ref, computed, watch } from 'vue';
import { useData } from '../../store/useData.js';
import { getWeekInfo, getWeekDates } from '../../utils/week.js';
import { parseWeeksPattern } from '../../utils/weeksPattern.js';
import { todayStr, formatMDShort } from '../../utils/time.js';
import weekGrid from '../../components/weekGrid/weekGrid.vue';
import courseEdit from '../../components/courseEdit/courseEdit.vue';

const {
	data,
	addCourse,
	updateCourse,
	deleteCourse,
	copyCourse,
	splitCourseRange,
} = useData();

const hasTerm = computed(() => !!data.config.termStartDate);

/* ==================== 周次与 swiper 三页 ==================== */

/** 当前教学周号（跟随 config 变化，如设置页改了起始日/手动周次） */
const currentWeekNum = computed(() =>
	getWeekInfo(todayStr(), data.config).weekNum
);

/**
 * 学期最大周号：取课程周段的最大结束周；
 * 无明确周段（all/odd/even）或无课程时按默认 20 周；
 * 当前周（含手动周次）超出课程范围时，至少要能查看当前周。
 */
const maxWeek = computed(() => {
	let max = 20;
	data.courses.forEach((c) => {
		const { type, weeks } = parseWeeksPattern(c.weeks);
		if (type === 'range' && weeks.size) {
			max = Math.max(max, ...weeks);
		}
	});
	return Math.max(max, currentWeekNum.value);
});

/** 当前查看的周次页下标（0 起）。初始即钳制：学期开始前打开时落在第 1 周（下标 0） */
const swiperCurrent = ref(Math.max(0, currentWeekNum.value - 1));

/** 周页缓存：weekNum -> 页对象，周次间切换时引用稳定，已渲染页不重算 */
const weekPageCache = new Map();
function getWeekPage(weekNum) {
	let page = weekPageCache.get(weekNum);
	if (!page) {
		page = { weekNum, dates: getWeekDates(weekNum, data.config.termStartDate) };
		weekPageCache.set(weekNum, page);
	}
	return page;
}
// 学期起始日或最大周变化后，周页作废重建，并把当前页钳制回范围内
watch([() => data.config.termStartDate, maxWeek], () => {
	weekPageCache.clear();
	swiperCurrent.value = Math.min(swiperCurrent.value, maxWeek.value - 1);
});

/**
 * 每个教学周一个真实页面（1..maxWeek）：
 * 原生滑动跟随手指、松手自然停靠、边界回弹，无任何瞬移复位，
 * 不再有"弹过去"的手感；@change 仅回写 swiper 自身位置。
 */
const pages = computed(() => {
	if (!hasTerm.value) return [];
	const list = [];
	for (let w = 1; w <= maxWeek.value; w++) list.push(getWeekPage(w));
	return list;
});

/** 顶部信息（跟随当前查看周） */
const headerInfo = computed(() => {
	if (!hasTerm.value) {
		return { weekNum: 1, isOddWeek: true, isManual: false, rangeLabel: '' };
	}
	const weekNum = swiperCurrent.value + 1;
	const dates = getWeekDates(weekNum, data.config.termStartDate);
	const { isOddWeek, isManual } = getWeekInfo(dates[0], data.config);
	return {
		weekNum,
		isOddWeek,
		isManual,
		rangeLabel: `${formatMDShort(dates[0])} - ${formatMDShort(dates[6])}`,
	};
});

/** 滑动换周：只回写 swiper 实际位置（H5 内容变化时不会因此被拉回） */
function onSwiperChange(e) {
	swiperCurrent.value = e.detail.current;
}

function backToThisWeek() {
	// 与初始钳制一致：学期开始前"本周"落在第 1 周
	swiperCurrent.value = Math.max(0, currentWeekNum.value - 1);
}

function goSettings() {
	uni.switchTab({ url: '/pages/settings/settings' });
}

/* ==================== 课程编辑 ==================== */

const editShow = ref(false);
const editCourse = ref(null);
const editPrefill = ref(null);
/** 打开弹窗时所在日期（课程卡点击的当天），作为「单次」模式的默认生效日期 */
const editDateContext = ref('');

function openEdit(course, date) {
	editCourse.value = course;
	editPrefill.value = null;
	editDateContext.value = date || '';
	editShow.value = true;
}

function onCellClick({ weekday, section, date }) {
	editCourse.value = null;
	editPrefill.value = { weekday, section, date };
	editDateContext.value = date || '';
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
}

function onCourseRemove(id) {
	deleteCourse(id);
	uni.showToast({ title: '已删除', icon: 'success' });
	editShow.value = false;
}

function onCourseCopy(id) {
	const copy = copyCourse(id);
	uni.showToast({ title: '已复制，可修改后保存', icon: 'none' });
	// 打开复制出的新课程继续编辑
	openEdit(copy);
}
</script>

<style lang="scss" scoped>
.schedule-page {
	display: flex;
	flex-direction: column;
	height: 100vh;
	background: #f6f7f9;
	overflow: hidden;
}

/* ---------- 头部 ---------- */
.week-header {
	background: #ffffff;
	padding: 20rpx 32rpx 24rpx;
	flex-shrink: 0;
	box-shadow: 0 2rpx 8rpx rgba(31, 45, 61, 0.03);

	.term-row {
		display: flex;
		align-items: baseline;
		gap: 16rpx;

		.term-name {
			font-size: 26rpx;
			color: #909399;
		}

		.term-sub {
			font-size: 22rpx;
			color: #c0c4cc;
		}
	}

	.week-row {
		display: flex;
		align-items: center;
		gap: 16rpx;
		margin-top: 12rpx;

		.week-num {
			font-size: 44rpx;
			font-weight: 700;
			color: #303133;
		}

		.week-badge {
			font-size: 22rpx;
			padding: 4rpx 18rpx;
			border-radius: 24rpx;
			color: #ffffff;
			line-height: 1.5;
		}

		.badge-odd {
			background: #409eff;
		}

		.badge-even {
			background: #67c23a;
		}

		.manual-badge {
			font-size: 22rpx;
			padding: 4rpx 14rpx;
			border-radius: 24rpx;
			background: #fef0f0;
			color: #f56c6c;
			line-height: 1.5;
		}
	}

	.date-range {
		display: block;
		margin-top: 8rpx;
		font-size: 24rpx;
		color: #909399;
	}
}

/* ---------- swiper ---------- */
.week-swiper {
	flex: 1;
	overflow: hidden;
	height: 0; /* flex 下让 swiper-item 撑满 */
}

/* ---------- 引导 ---------- */
.guide {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 24rpx;

	.guide-icon {
		font-size: 96rpx;
	}

	.guide-text {
		font-size: 28rpx;
		color: #909399;
	}

	.guide-btn {
		margin-top: 12rpx;
		padding: 20rpx 56rpx;
		background: #409eff;
		color: #ffffff;
		border-radius: 44rpx;
		font-size: 28rpx;
	}
}

/* ---------- 回到本周 ---------- */
.back-week {
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
