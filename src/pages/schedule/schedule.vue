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

		<!-- 周课表：swiper 预渲染 上/当前/下 三页 -->
		<swiper
			v-else
			class="week-swiper"
			:current="swiperCurrent"
			duration="220"
			:circular="false"
			@change="onSwiperChange"
		>
			<swiper-item v-for="page in pages" :key="'w' + page.weekNum">
				<week-grid
					:week-dates="page.dates"
					@cell-click="onCellClick"
					@course-click="openEdit"
				/>
			</swiper-item>
		</swiper>

		<!-- 回到本周 -->
		<view v-if="weekOffset !== 0" class="back-week" @click="backToThisWeek">
			<u-icon name="arrow-leftward" size="18" color="#ffffff"></u-icon>
			<text>本周</text>
		</view>

		<!-- 课程编辑弹窗 -->
		<course-edit
			:show="editShow"
			:course="editCourse"
			:prefill="editPrefill"
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
import { ref, computed } from 'vue';
import { useData } from '../../store/useData.js';
import { getWeekInfo, getWeekDates } from '../../utils/week.js';
import { todayStr, formatMDShort } from '../../utils/time.js';
import weekGrid from '../../components/weekGrid/weekGrid.vue';
import courseEdit from '../../components/courseEdit/courseEdit.vue';

const {
	data,
	addCourse,
	updateCourse,
	deleteCourse,
	copyCourse,
} = useData();

const hasTerm = computed(() => !!data.config.termStartDate);

/* ==================== 周次与 swiper 三页 ==================== */

const weekOffset = ref(0); // 相对当前周偏移：0=本周
const swiperCurrent = ref(1);

/** 当前教学周号（跟随 config 变化，如设置页改了起始日/手动周次） */
const currentWeekNum = computed(() =>
	getWeekInfo(todayStr(), data.config).weekNum
);

const pages = computed(() => {
	if (!hasTerm.value) return [];
	return [weekOffset.value - 1, weekOffset.value, weekOffset.value + 1].map((n) => {
		const weekNum = currentWeekNum.value + n;
		return {
			weekNum,
			dates: getWeekDates(weekNum, data.config.termStartDate),
		};
	});
});

/** 顶部信息（跟随当前查看周） */
const headerInfo = computed(() => {
	if (!hasTerm.value) {
		return { weekNum: 1, isOddWeek: true, isManual: false, rangeLabel: '' };
	}
	const weekNum = currentWeekNum.value + weekOffset.value;
	const dates = getWeekDates(weekNum, data.config.termStartDate);
	const { isOddWeek, isManual } = getWeekInfo(dates[0], data.config);
	return {
		weekNum,
		isOddWeek,
		isManual,
		rangeLabel: `${formatMDShort(dates[0])} - ${formatMDShort(dates[6])}`,
	};
});

function onSwiperChange(e) {
	const cur = e.detail.current;
	if (cur === 0) {
		weekOffset.value -= 1;
	} else if (cur === 2) {
		weekOffset.value += 1;
	}
	// 重置到中间页（无动画），内容与刚滑到的页一致，视觉无缝
	swiperCurrent.value = 1;
}

function backToThisWeek() {
	weekOffset.value = 0;
	swiperCurrent.value = 1;
}

function goSettings() {
	uni.switchTab({ url: '/pages/settings/settings' });
}

/* ==================== 课程编辑 ==================== */

const editShow = ref(false);
const editCourse = ref(null);
const editPrefill = ref(null);

function openEdit(course) {
	editCourse.value = course;
	editPrefill.value = null;
	editShow.value = true;
}

function onCellClick({ weekday, section }) {
	editCourse.value = null;
	editPrefill.value = { weekday, section };
	editShow.value = true;
}

function onCourseSave(payload) {
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
