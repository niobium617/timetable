<template>
	<view class="month-cal">
		<!-- 星期表头（随 weekStartDay 调整列顺序） -->
		<view class="cal-weekdays">
			<view v-for="w in weekdayHeader" :key="w" class="cal-weekday">{{ w }}</view>
		</view>

		<!-- 日期网格 -->
		<view class="cal-grid">
			<view v-for="i in leading" :key="'b' + i" class="cal-cell cal-blank"></view>
			<view
				v-for="cell in cells"
				:key="cell.date"
				class="cal-cell"
				:class="{
					'is-today': cell.isToday,
					'is-holiday': cell.isHoliday,
					'is-adjust': cell.isAdjustment,
				}"
				@click="$emit('select', cell.date)"
			>
				<view class="cell-top">
					<text class="cell-day" :class="{ 'day-circle': cell.isToday }">{{ cell.day }}</text>
					<text v-if="cell.isHoliday" class="cell-tag tag-holiday">假</text>
					<text v-else-if="cell.isAdjustment" class="cell-tag tag-adjust">补</text>
				</view>
				<!-- 课程彩色圆点（去重颜色，最多4个） -->
				<view v-if="!cell.isHoliday" class="cell-dots">
					<view
						v-for="c in cell.colors"
						:key="c"
						class="dot"
						:style="{ backgroundColor: c }"
					></view>
				</view>
			</view>
		</view>
	</view>
</template>

<script setup>
/**
 * monthCal —— 自封装月历组件
 *
 * u-calendar 角标能力不足（方案明确），自行封装：
 * - 有课日期显示彩色圆点（颜色去重，最多4个）
 * - 假期日期置灰 + 「假」角标；调休日期显示「补」角标（角标同时存在时假期优先展示）
 * - 今天蓝色圆圈高亮
 * - 每日课程调用 getCoursesOfDate（与周课表同一过滤链），数据量小无需缓存
 */
import { computed } from 'vue';
import { useData } from '../../store/useData.js';
import { getCoursesOfDate, getDateStatus } from '../../utils/filter.js';
import { parseDate, formatDate, addDays, todayStr, WEEKDAY_NAMES, getWeekday } from '../../utils/time.js';

const props = defineProps({
	year: { type: Number, required: true },
	month: { type: Number, required: true }, // 1-12
});
defineEmits(['select']);

const { data } = useData();

/** 列顺序：weekStartDay=1 周一~周日；0 周日~周六 */
const weekdayHeader = computed(() => {
	const start = data.config.weekStartDay === 0 ? 0 : 1;
	return Array.from({ length: 7 }, (_, i) => {
		const idx = (start + i) % 7; // 0=周日
		return WEEKDAY_NAMES[idx === 0 ? 6 : idx - 1];
	});
});

/** 本月 1 号之前需要补的空白格数 */
const leading = computed(() => {
	const first = new Date(props.year, props.month - 1, 1);
	if (data.config.weekStartDay === 0) {
		return first.getDay(); // 周日起始：0=周日即列首
	}
	return getWeekday(first) - 1; // 周一起始
});

/** 本月每一天的渲染数据 */
const cells = computed(() => {
	const daysInMonth = new Date(props.year, props.month, 0).getDate();
	const list = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const dateStr = formatDate(new Date(props.year, props.month - 1, d));
		const status = getDateStatus(dateStr, data);
		const courses = getCoursesOfDate(dateStr, data);
		// 圆点颜色去重
		const colors = [...new Set(courses.map((c) => c.color).filter(Boolean))].slice(0, 4);
		list.push({
			date: dateStr,
			day: d,
			isToday: dateStr === todayStr(),
			isHoliday: status.isHoliday,
			isAdjustment: status.isAdjustment,
			colors,
		});
	}
	return list;
});
</script>

<style lang="scss" scoped>
.month-cal {
	background: #ffffff;
	border-radius: 16rpx;
	overflow: hidden;
}

.cal-weekdays {
	display: flex;
	border-bottom: 1rpx solid #f5f7fa;

	.cal-weekday {
		flex: 1;
		text-align: center;
		padding: 16rpx 0;
		font-size: 24rpx;
		color: #909399;
	}
}

.cal-grid {
	display: flex;
	flex-wrap: wrap;
}

.cal-cell {
	width: calc(100% / 7);
	height: 100rpx;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	align-items: center;
	padding-top: 8rpx;
	position: relative;

	&:active {
		background: #f5f9ff;
	}

	.cell-top {
		display: flex;
		align-items: center;
		gap: 6rpx;
		height: 40rpx;
	}

	.cell-day {
		font-size: 28rpx;
		color: #303133;
		line-height: 40rpx;
		min-width: 40rpx;
		text-align: center;
	}

	.day-circle {
		background: #409eff;
		color: #ffffff;
		border-radius: 50%;
	}

	.cell-tag {
		font-size: 16rpx;
		padding: 0 6rpx;
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

	.cell-dots {
		display: flex;
		gap: 6rpx;
		margin-top: 4rpx;

		.dot {
			width: 10rpx;
			height: 10rpx;
			border-radius: 50%;
		}
	}

	&.is-holiday {
		.cell-day {
			color: #c0c4cc;
		}

		&.is-today .day-circle {
			background: #dcdfe6;
			color: #ffffff;
		}
	}
}

.cal-blank {
	pointer-events: none;
}
</style>
