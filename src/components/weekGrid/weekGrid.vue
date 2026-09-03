<template>
	<view class="week-grid">
		<!-- 顶部星期表头 -->
		<view class="grid-header">
			<view class="header-gutter"></view>
			<view
				v-for="(d, di) in weekDates"
				:key="d"
				class="day-header"
				:class="{ 'is-today': isToday(d) }"
			>
				<text class="day-name">{{ WEEKDAY_NAMES[di] }}</text>
				<view class="day-date" :class="{ 'date-bubble': isToday(d) }">
					<text>{{ formatMDShort(d) }}</text>
				</view>
				<!-- 假期/调休角标 -->
				<view v-if="statusMap[d]" class="day-tags">
					<text v-if="statusMap[d].isHoliday" class="tag tag-holiday">假</text>
					<text v-if="statusMap[d].isAdjustment" class="tag tag-adjust">补</text>
				</view>
			</view>
		</view>

		<!-- 可滚动的网格主体 -->
		<scroll-view scroll-y class="grid-body" :show-scrollbar="false">
			<view class="grid-inner" :style="{ height: totalHeight }">
				<!-- 左侧节次时间列 -->
				<view class="time-gutter">
					<view v-for="s in sections" :key="s.section" class="time-cell">
						<text class="time-num">{{ s.section }}</text>
						<text class="time-range">{{ s.startTime }}</text>
					</view>
				</view>

				<!-- 背景单元格（点击空白格快速新增） -->
				<view class="cells-area">
					<view v-for="(s, si) in sections" :key="s.section" class="row-cells">
						<view
							v-for="(d, di) in weekDates"
							:key="d"
							class="day-cell"
							:class="{ 'is-today': isToday(d) }"
							@click="onCellClick(di, si)"
						></view>
					</view>

					<!-- 课程块（绝对定位在 7 列区域内，同节次多课横向均分并排） -->
					<view
						v-for="item in layoutItems"
						:key="item.course.id + item.date"
						class="course-slot"
						:style="{ top: item.top, left: item.left, width: item.width, height: item.height }"
					>
						<course-card
							:course="item.course"
							:compact="item.compact"
							:once="!!item.course.date"
							:conflict="!!item.course.conflict"
							@click="$emit('courseClick', item.course, item.date)"
						/>
					</view>
				</view>

				<!-- 当前时间参考线 -->
				<view v-if="nowLine" class="now-line" :style="{ top: nowLine }">
					<view class="now-dot"></view>
				</view>
			</view>
		</scroll-view>
	</view>
</template>

<script setup>
/**
 * weekGrid —— 周课表网格
 *
 * 职责：
 * - 渲染 7 天 × N 节次的网格（今天列高亮、假期/调休角标）
 * - 同节次多课横向均分并排（并查集按节次区间重叠分组）
 * - 当前时间参考线（每 30 秒刷新，落在节次区间内才显示）
 * - 空白格点击 → cellClick（快速新增）；课程块点击 → courseClick
 *
 * 所有课程过滤统一走 utils/filter.js 的 getCoursesOfDate，
 * 与日历页、当日弹窗完全一致。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import courseCard from '../courseCard/courseCard.vue';
import { useData } from '../../store/useData.js';
import { getCoursesOfDate } from '../../utils/filter.js';
import { WEEKDAY_NAMES, todayStr, formatMDShort, timeToMinutes, sectionsOverlap } from '../../utils/time.js';

const props = defineProps({
	/** 本周 7 个日期（周一~周日绝对顺序），由父级按周次计算传入 */
	weekDates: { type: Array, required: true },
});
defineEmits(['cellClick', 'courseClick']);

const { data } = useData();
const sections = computed(() => data.config.sections || []);

/** 与 uni.scss 中 $tt-row-height 保持一致（rpx） */
const ROW_H = 92;
const totalHeight = computed(() => `${sections.value.length * ROW_H}rpx`);

const isToday = (d) => d === todayStr();

/** 每天的状态（假期/调休），用于表头角标 */
const statusMap = computed(() => {
	const map = {};
	props.weekDates.forEach((d) => {
		const holiday = data.holidays.some((h) => h.date === d);
		const adjustment = data.adjustments.some((a) => a.date === d);
		if (holiday || adjustment) map[d] = { isHoliday: holiday, isAdjustment: adjustment };
	});
	return map;
});

/* ==================== 课程布局：同节次并排 ==================== */

/** 并查集：按节次区间重叠把课程分组 */
function groupOverlaps(list) {
	const n = list.length;
	const parent = Array.from({ length: n }, (_, i) => i);
	const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
	const union = (a, b) => {
		const ra = find(a), rb = find(b);
		if (ra !== rb) parent[ra] = rb;
	};
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const a = list[i], b = list[j];
			if (sectionsOverlap(a.startSection, a.endSection, b.startSection, b.endSection)) {
				union(i, j);
			}
		}
	}
	const groups = new Map();
	list.forEach((c, i) => {
		const root = find(i);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root).push(c);
	});
	return [...groups.values()];
}

/**
 * 计算全部课程块的几何布局（参照系为 cells-area 的 7 列区域）
 * 星期列：left = 列起点 + 组内均分位置；width = 单列宽 / 组内课程数；
 * 纵向 top/height 由节次区间换算。
 */
const DAY_COL = 100 / 7; // 每列占 cells-area 的百分比（周一~周日均分）

const layoutItems = computed(() => {
	const items = [];
	props.weekDates.forEach((date, di) => {
		const list = getCoursesOfDate(date, data);
		const groups = groupOverlaps(list);
		groups.forEach((group) => {
			const sorted = [...group].sort((a, b) => a.startSection - b.startSection);
			const n = sorted.length;
			sorted.forEach((course, k) => {
				items.push({
					course,
					date,
					col: di,
					top: `${(course.startSection - 1) * ROW_H}rpx`,
					height: `${(course.endSection - course.startSection + 1) * ROW_H}rpx`,
					left: `calc(${di * DAY_COL + (k * DAY_COL) / n}% + 2rpx)`,
					width: `calc(${DAY_COL / n}% - ${4 / n}rpx)`,
					compact: n > 1,
				});
			});
		});
	});
	return items;
});

/* ==================== 空白格点击 → 快速新增 ==================== */

function onCellClick(di, si) {
	$emit('cellClick', {
		date: props.weekDates[di],
		weekday: di + 1, // 列顺序即周一~周日，与绝对星期一致
		section: si + 1,
	});
}

/* ==================== 当前时间参考线 ==================== */

const nowLine = ref(null);
let timer = null;

function updateNowLine() {
	nowLine.value = null;
	const todayIdx = props.weekDates.indexOf(todayStr());
	if (todayIdx === -1) return; // 今天不在此周

	const now = new Date();
	const minutes = now.getHours() * 60 + now.getMinutes();
	for (let i = 0; i < sections.value.length; i++) {
		const s = sections.value[i];
		const st = timeToMinutes(s.startTime);
		const en = timeToMinutes(s.endTime);
		if (minutes >= st && minutes <= en) {
			const progress = (minutes - st) / Math.max(1, en - st);
			nowLine.value = `${(i + progress) * ROW_H}rpx`;
			return;
		}
	}
}

onMounted(() => {
	updateNowLine();
	timer = setInterval(updateNowLine, 30000); // 每30秒刷新
});

onUnmounted(() => {
	if (timer) clearInterval(timer);
});

watch(() => props.weekDates, updateNowLine);
</script>

<style lang="scss" scoped>
.week-grid {
	display: flex;
	flex-direction: column;
	height: 100%;
}

/* ---------- 表头 ---------- */
.grid-header {
	display: flex;
	flex-shrink: 0;
	background: #ffffff;
	border-bottom: 1rpx solid #f0f2f5;

	.header-gutter {
		width: $tt-gutter-width;
		flex-shrink: 0;
	}

	.day-header {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12rpx 0 10rpx;
		position: relative;

		.day-name {
			font-size: 24rpx;
			color: #909399;
			line-height: 1.2;
		}

		.day-date {
			margin-top: 6rpx;
			font-size: 22rpx;
			color: #606266;
			padding: 2rpx 12rpx;
			border-radius: 20rpx;
			line-height: 1.4;
		}

		.date-bubble {
			background: #409eff;
			color: #ffffff;
		}

		&.is-today .day-name {
			color: #409eff;
			font-weight: 600;
		}

		.day-tags {
			position: absolute;
			top: 2rpx;
			right: 6rpx;
			display: flex;
			gap: 4rpx;

			.tag {
				font-size: 18rpx;
				padding: 0 6rpx;
				border-radius: 6rpx;
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
}

/* ---------- 主体 ---------- */
.grid-body {
	flex: 1;
	overflow: hidden;
	background: #ffffff;
}

.grid-inner {
	position: relative;
	display: flex;
}

.time-gutter {
	width: $tt-gutter-width;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
	background: #ffffff;

	.time-cell {
		height: $tt-row-height;
		box-sizing: border-box;
		border-right: 1rpx solid #f0f2f5;
		border-bottom: 1rpx solid #f0f2f5;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;

		.time-num {
			font-size: 22rpx;
			color: #303133;
			font-weight: 600;
			line-height: 1.2;
		}

		.time-range {
			font-size: 18rpx;
			color: #c0c4cc;
			line-height: 1.3;
			transform: scale(0.92);
		}
	}
}

.cells-area {
	flex: 1;
	position: relative;

	.row-cells {
		display: flex;
		height: $tt-row-height;
	}

	.day-cell {
		flex: 1;
		border-right: 1rpx solid #f5f7fa;
		border-bottom: 1rpx solid #f5f7fa;
		box-sizing: border-box;
		background: #ffffff;

		&.is-today {
			background: $tt-today-bg;
		}

		&:active {
			background: #ecf5ff;
		}
	}
}

/* ---------- 课程块 ---------- */
.course-slot {
	position: absolute;
	right: auto;
	padding: 2rpx;
	box-sizing: border-box;
	z-index: 2;
}

/* ---------- 当前时间参考线 ---------- */
.now-line {
	position: absolute;
	left: $tt-gutter-width;
	right: 0;
	height: 3rpx;
	background: #f56c6c;
	z-index: 3;
	pointer-events: none;
	transform: translateY(-1rpx);

	.now-dot {
		position: absolute;
		left: -8rpx;
		top: 50%;
		transform: translateY(-50%);
		width: 12rpx;
		height: 12rpx;
		border-radius: 50%;
		background: #f56c6c;
		box-shadow: 0 0 0 4rpx rgba(245, 108, 108, 0.25);
		animation: pulse 2s ease-in-out infinite;
	}
}

@keyframes pulse {
	0%, 100% {
		box-shadow: 0 0 0 4rpx rgba(245, 108, 108, 0.25);
	}
	50% {
		box-shadow: 0 0 0 8rpx rgba(245, 108, 108, 0.1);
	}
}
</style>
