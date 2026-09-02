<template>
	<u-popup :show="show" mode="bottom" :round="24" safe-area-inset-bottom @close="$emit('close')">
		<view class="day-sheet">
			<!-- 头部：日期 + 周次 + 状态角标 -->
			<view class="sheet-header">
				<view class="sheet-date">
					<text class="sheet-date-main">{{ headerText }}</text>
					<view class="sheet-tags">
						<view v-if="status.isHoliday" class="tag tag-holiday">假期</view>
						<view v-if="status.isAdjustment" class="tag tag-adjust">调休</view>
					</view>
				</view>
				<text class="sheet-week">第 {{ status.weekNum }} 周 · {{ status.isOddWeek ? '单周' : '双周' }}</text>
				<text v-if="holidayName" class="sheet-remark">{{ holidayName }}</text>
				<text v-else-if="adjustRemark" class="sheet-remark">{{ adjustRemark }}</text>
				<view class="sheet-close" @click="$emit('close')">
					<u-icon name="close" size="20" color="#909399"></u-icon>
				</view>
			</view>

			<!-- 内容 -->
			<scroll-view scroll-y class="sheet-body">
				<!-- 假期：无课 -->
				<view v-if="status.isHoliday" class="sheet-empty">
					<text class="empty-icon">🎉</text>
					<text>假期，没有课程</text>
				</view>

				<!-- 课程时间线 -->
				<template v-else>
					<view
						v-for="item in courseList"
						:key="item.course.id + item.date"
						class="sheet-course"
						@click="$emit('courseClick', item.course)"
					>
						<view class="course-bar" :style="{ backgroundColor: item.course.color }"></view>
						<view class="course-main">
							<text class="course-name">{{ item.course.name }}</text>
							<view class="course-sub">
								<text v-if="item.course.teacher" class="sub-item">{{ item.course.teacher }}</text>
								<text v-if="item.course.classroom" class="sub-item">{{ item.course.classroom }}</text>
								<text v-if="item.course.remark" class="sub-item remark">{{ item.course.remark }}</text>
							</view>
						</view>
						<view class="course-time">
							<text class="time-range">{{ item.timeRange }}</text>
							<text class="time-section">第{{ item.course.startSection }}-{{ item.course.endSection }}节</text>
						</view>
					</view>

					<view v-if="courseList.length === 0" class="sheet-empty">
						<text class="empty-icon">🍃</text>
						<text>这一天没有课程</text>
					</view>
				</template>
			</scroll-view>
		</view>
	</u-popup>
</template>

<script setup>
/**
 * daySheet —— 当日课程底部弹窗（日历页点击日期弹出）
 * - 展示当天课程时间线（时间来自 config.sections）
 * - 假期/调休状态与说明
 * - 点击课程行 → 打开编辑弹窗
 */
import { computed } from 'vue';
import { useData } from '../../store/useData.js';
import { getCoursesOfDate, getDateStatus } from '../../utils/filter.js';
import { parseDate, WEEKDAY_NAMES, getWeekday } from '../../utils/time.js';

const props = defineProps({
	show: { type: Boolean, default: false },
	date: { type: String, default: '' },
});
defineEmits(['close', 'courseClick']);

const { data } = useData();

/** 当天状态；展示用周号下限为 1（学期开始前不出现"第 0 周/负数周"），单双周随之计算 */
const status = computed(() => {
	const s = getDateStatus(props.date, data);
	const weekNum = Math.max(1, s.weekNum);
	const firstWeekType = data.config.firstWeekType || 'odd';
	return {
		...s,
		weekNum,
		isOddWeek: (weekNum % 2 === 1) === (firstWeekType === 'odd'),
	};
});

const headerText = computed(() => {
	if (!props.date) return '';
	const d = parseDate(props.date);
	return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_NAMES[getWeekday(props.date) - 1]}`;
});

const holidayName = computed(() => (status.value.holiday ? status.value.holiday.name : ''));
const adjustRemark = computed(() => (status.value.adjustment ? status.value.adjustment.remark || '' : ''));

/** 课程列表 + 起止时间文本（取节次表首尾时间） */
const courseList = computed(() => {
	const courses = getCoursesOfDate(props.date, data);
	const sections = data.config.sections || [];
	const findTime = (n) => {
		const s = sections.find((x) => Number(x.section) === n);
		return s ? `${s.startTime} - ${s.endTime}` : '';
	};
	return courses.map((c) => ({
		course: c,
		date: props.date,
		timeRange: c.startSection === c.endSection
			? findTime(c.startSection)
			: `${findTime(c.startSection).split(' - ')[0]} - ${findTime(c.endSection).split(' - ')[1] || ''}`,
	}));
});
</script>

<style lang="scss" scoped>
.day-sheet {
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	display: flex;
	flex-direction: column;
	max-height: 75vh;
}

.sheet-header {
	padding: 32rpx 32rpx 24rpx;
	border-bottom: 1rpx solid #f5f7fa;
	position: relative;
	flex-shrink: 0;

	.sheet-date {
		display: flex;
		align-items: center;
		gap: 16rpx;

		.sheet-date-main {
			font-size: 36rpx;
			font-weight: 700;
			color: #303133;
		}

		.sheet-tags {
			display: flex;
			gap: 8rpx;

			.tag {
				font-size: 22rpx;
				padding: 4rpx 16rpx;
				border-radius: 20rpx;
				color: #ffffff;
				line-height: 1.5;
			}

			.tag-holiday {
				background: #c0c4cc;
			}

			.tag-adjust {
				background: #e6a23c;
			}
		}
	}

	.sheet-week {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #909399;
	}

	.sheet-remark {
		display: block;
		margin-top: 6rpx;
		font-size: 24rpx;
		color: #e6a23c;
	}

	.sheet-close {
		position: absolute;
		right: 32rpx;
		top: 32rpx;
		padding: 4rpx;
	}
}

.sheet-body {
	flex: 1;
	padding: 8rpx 32rpx;
	box-sizing: border-box;
	max-height: 55vh;
}

.sheet-course {
	display: flex;
	align-items: center;
	gap: 20rpx;
	padding: 26rpx 4rpx;
	border-bottom: 1rpx solid #f5f7fa;

	&:active {
		background: #f5f9ff;
	}

	.course-bar {
		width: 10rpx;
		height: 64rpx;
		border-radius: 6rpx;
		flex-shrink: 0;
	}

	.course-main {
		flex: 1;
		min-width: 0;

		.course-name {
			font-size: 30rpx;
			font-weight: 600;
			color: #303133;
			display: block;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.course-sub {
			margin-top: 8rpx;
			display: flex;
			flex-wrap: wrap;
			gap: 12rpx;

			.sub-item {
				font-size: 22rpx;
				color: #909399;
			}

			.remark {
				color: #c0c4cc;
			}
		}
	}

	.course-time {
		flex-shrink: 0;
		text-align: right;

		.time-range {
			display: block;
			font-size: 26rpx;
			color: #606266;
			font-weight: 600;
		}

		.time-section {
			display: block;
			margin-top: 6rpx;
			font-size: 20rpx;
			color: #c0c4cc;
		}
	}
}

.sheet-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16rpx;
	padding: 80rpx 0;
	color: #909399;
	font-size: 26rpx;

	.empty-icon {
		font-size: 72rpx;
	}
}
</style>
