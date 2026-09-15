<template>
	<view class="week-grid" :id="gridId">
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
		<scroll-view scroll-y class="grid-body" :show-scrollbar="false" @scroll="onGridScroll">
			<view class="grid-inner" :style="{ height: totalHeight }">
				<!-- 左侧节次时间列 -->
				<view class="time-gutter">
					<view v-for="s in sections" :key="s.section" class="time-cell">
						<text class="time-num">{{ s.section }}</text>
						<text class="time-range">{{ s.startTime }}</text>
						<text class="time-range time-end">{{ s.endTime }}</text>
					</view>
				</view>

				<!-- 背景单元格（点击空白格快速新增） -->
				<view class="cells-area">
					<view v-for="(s, si) in sections" :key="s.section" class="row-cells">
						<view
							v-for="(d, di) in weekDates"
							:key="d"
							class="day-cell"
							:class="{ 'is-today': isToday(d), 'drop-target': isDropTarget(di, si) }"
							@click="onCellClick(di, si)"
						></view>
					</view>

					<!-- 课程块（绝对定位在 7 列区域内，同节次多课横向均分并排） -->
					<view
						v-for="(item, idx) in layoutItems"
						:key="item.course.id + item.date"
						class="course-slot"
						:class="{ 'is-drag-source': isDragSource(item) }"
						:style="{ top: item.top, left: item.left, width: item.width, height: item.height }"
						@longpress="onSlotLongpress(item, idx, $event)"
						@touchmove="onSlotTouchMove($event)"
						@touchend="onSlotTouchEnd"
						@touchcancel="onSlotTouchCancel"
					>
						<course-card
							:course="item.course"
							:compact="item.compact"
							:once="!!item.course.date"
							:conflict="!!item.course.conflict"
							@click="onCourseCardClick(item)"
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
import { ref, computed, watch, onMounted, onUnmounted, getCurrentInstance } from 'vue';
import courseCard from '../courseCard/courseCard.vue';
import { useData } from '../../store/useData.js';
import { getCoursesOfDate } from '../../utils/filter.js';
import { WEEKDAY_NAMES, todayStr, formatMDShort, timeToMinutes, sectionsOverlap } from '../../utils/time.js';

const props = defineProps({
	/** 本周 7 个日期（周一~周日绝对顺序），由父级按周次计算传入 */
	weekDates: { type: Array, required: true },
	/**
	 * 拖动状态（页面持有并传入，只读使用）：
	 * { active, course: {id,...}, target: {di, si, siEnd} | null }
	 * - course 命中 → 源卡片变暗占位
	 * - target 命中 → 目标格整段高亮（落点预览）
	 */
	drag: { type: Object, default: () => ({ active: false, course: null, target: null }) },
});
const emit = defineEmits(['cellClick', 'courseClick', 'dragBegin', 'dragStart', 'dragMove', 'dragEnd', 'dragCancel']);

/**
 * 本网格的唯一 id：同一页面 swiper 会同时挂载多个周页，
 * 选择器查询必须限定在"当前这一页"内，否则会取到其它周页的格子矩形。
 */
const gridId = computed(() => `wg-${(props.weekDates && props.weekDates[0]) || 'na'}`);

/**
 * 当前组件实例。
 * 小程序端 `uni.createSelectorQuery()` 默认**只查页面范围的节点，不查自定义组件内部**
 * （微信原生语义），而本组件会编译成 `"component": true` 的自定义组件 ——
 * 不加 `.in(组件)` 就查不到 `.day-cell` / `.course-slot`，长按后静默无反应。
 * 必须传 proxy（uni 的 `in()` 内部靠 `component.$scope` 拿到小程序组件实例，
 * 内部实例上没有 $scope）；H5 端对 proxy 同样兼容。uview-plus 也是这么用的。
 */
const instance = getCurrentInstance();

const { data } = useData();
const sections = computed(() => data.config.sections || []);

/**
 * 网格滚动位置：拖动中纵向滚动会让内容整体移动，落点行号要补上这段差。
 *
 * 拖动期间网格**保持可滚动**（不冻结 scroll-y）：手指竖移内容跟着滚（1:1），
 * 落点行由页面按「手指位移 + scrollDelta 补偿」换算。曾经在 MP 端冻结过滚动
 * （避免内容跟手），但冻结让视口外的行**永远拖不到**——课表小节超过一屏
 * （如 10 小节）时，挪到下半屏的格子就必然「未移动」，正是"单双周挪不动"的真凶
 * 之一，故已废弃。MP 端 scroll-view 原生跟随滚动；H5 端长按会阻止浏览器原生
 * 滚动，拖动中滚不到视口外是 H5 的已知限制（次要端，可用编辑调整）。
 */
const scrollTop = ref(0);
function onGridScroll(e) {
	scrollTop.value = (e.detail && e.detail.scrollTop) || 0;
}

/** 拖动松手后浏览器会补发 click，这段时间内忽略，避免拖完弹出编辑框 */
let suppressClickUntil = 0;

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
	// 注意：script setup 中没有 $emit，必须用 defineEmits 返回的 emit
	emit('cellClick', {
		date: props.weekDates[di],
		weekday: di + 1, // 列顺序即周一~周日，与绝对星期一致
		section: si + 1,
	});
}

/* ==================== 长按拖动（源卡片 + 落点预览） ==================== */

/** 拖动中的源卡片：变暗占位，表示"原位置暂时空出" */
function isDragSource(item) {
	const d = props.drag;
	return !!d && d.active && d.course && d.course.id === item.course.id;
}

/** 落点预览：目标列 + 覆盖课程节次跨度的整段格子高亮 */
function isDropTarget(di, si) {
	const d = props.drag;
	if (!d || !d.active || !d.target) return false;
	return d.target.di === di && si >= d.target.si && si <= d.target.siEnd;
}

/** 触点坐标（触摸事件；拖动全程都是触摸，鼠标不参与） */
function pointOf(e) {
	const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
	if (t) return { x: t.clientX, y: t.clientY };
	return null;
}

/**
 * 长按课程块 → 采集几何信息（本卡片矩形 + 全部格子矩形）交给页面，
 * 由页面渲染浮动卡片并计算落点。
 *
 * 语义：**只挪长按的这一节（这一天）**——每周课落下时页面会写一条「仅本次」
 * 一次性课，原课和其他周不动；一次性课落下就直接改它自己。取消型一次性课
 * 不进网格，天然拖不到。
 *
 * 手指**不离开屏幕**：长按之后这条 touch 序列的 touchmove/touchend 会继续投递给
 * 源卡片并冒泡到这里（见下面三个处理函数），所以能直接接着拖。
 */
function onSlotLongpress(item, idx, e) {
	// **同步**通知页面「拖动即将开始」：几何查询是异步的，查询回来前页面不能
	// 把手指的移动当翻周手势处理（移动优先级最高），否则会出现"先横移了一截再
	// 被拉回"的跳页观感。
	emit('dragBegin');
	// 触点在长按这一刻读取：查询是异步的，事件对象到回调里可能已被回收
	const start = pointOf(e);
	// 网格滚动位置：纵向拖动时内容会跟着滚，换算行号要补差
	const scrollTop0 = scrollTop.value;
	// .in(instance.proxy)：限定在本组件内查询，见 instance 的注释
	const query = instance && instance.proxy
		? uni.createSelectorQuery().in(instance.proxy)
		: uni.createSelectorQuery();
	query.selectAll(`#${gridId.value} .day-cell`).boundingClientRect();
	query.selectAll(`#${gridId.value} .course-slot`).boundingClientRect();
	query.exec((res) => {
		const cells = (res && res[0]) || [];
		const slots = (res && res[1]) || [];
		const slot = slots[idx];
		// 布局未就绪（隐藏周页、渲染中）时放弃。这里刻意出声：曾经因为漏了 .in()
		// 在小程序端静默失败过——长按毫无反应且没有任何线索，很难查。
		if (!slot || cells.length < props.weekDates.length * sections.value.length) {
			uni.showToast({ title: '未能取到网格位置，拖动暂不可用', icon: 'none' });
			return;
		}
		emit('dragStart', {
			course: item.course,
			date: item.date,
			col: item.col,
			slotRect: { left: slot.left, top: slot.top, width: slot.width, height: slot.height },
			// 手指相对卡片左上角的偏移：浮动卡片按它定位，原地等手指继续拖
			grab: start ? { dx: start.x - slot.left, dy: start.y - slot.top } : null,
			cellRects: cells.map((c) => ({ left: c.left, top: c.top, width: c.width, height: c.height })),
			sections: sections.value.length,
			scrollTop0,
		});
	});
}

/**
 * 拖动中。刻意**不** .stop：让 touchmove 继续冒泡给分页器和 scroll-view，
 * 页面按手指位置算落点、按滚动量补差（见上面 scrollTop 的注释）。
 */
function onSlotTouchMove(e) {
	if (!props.drag || !props.drag.active) return;
	const p = pointOf(e);
	if (!p) return;
	emit('dragMove', p, scrollTop.value - (props.drag.scrollTop0 || 0));
}

function onSlotTouchEnd() {
	if (!props.drag || !props.drag.active) return;
	// 浏览器/小程序在 touchend 后会补发 click：拖完松手不能顺手弹出编辑框
	suppressClickUntil = Date.now() + 400;
	emit('dragEnd');
}

function onSlotTouchCancel() {
	if (!props.drag || !props.drag.active) return;
	suppressClickUntil = Date.now() + 400;
	emit('dragCancel');
}

/**
 * 卡片点击 → 打开编辑弹窗；拖动期间忽略
 * （H5 长按后浏览器仍会补发 click，必须拦掉，否则拖完会弹出编辑框）
 */
function onCourseCardClick(item) {
	if (props.drag && props.drag.active) return;
	if (Date.now() < suppressClickUntil) return;
	emit('courseClick', item.course, item.date);
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

		.time-end {
			color: #dcdfe6;
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

		/* 拖动落点预览：整段节次高亮 */
		&.drop-target {
			background: #d9ecff;
			box-shadow: inset 0 0 0 2rpx #409eff;
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

	/* 拖动中的源卡片：变暗占位（浮动卡片由页面覆盖层渲染） */
	&.is-drag-source {
		opacity: 0.25;
	}
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
