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

		<!--
			周课表：每个教学周一个真实页面，横向排开由 track 平移展示（自绘翻页器）。
			不用原生 swiper 的原因见页面顶部注释：swiper 会跟手，导致拖动课程时
			手指相对内容不动、没法换列；MP 端又无法中途关掉它。
		-->
		<view
			v-else
			class="week-pager"
			@touchstart="onPagerTouchStart"
			@touchmove="onPagerTouchMove"
			@touchend="onPagerTouchEnd"
			@touchcancel="onPagerTouchEnd"
		>
			<view class="pager-track" :style="trackStyle">
				<!-- key 按周号固定：页面列表只增删不重排，实例稳定复用 -->
				<view v-for="page in pages" :key="'w' + page.weekNum" class="pager-page">
					<week-grid
						:week-dates="page.dates"
						:drag="drag"
						@cell-click="onCellClick"
						@course-click="openEdit"
						@drag-begin="onDragBegin"
						@drag-start="onDragStart"
						@drag-move="onDragMove"
						@drag-end="onDragEnd"
						@drag-cancel="resetDrag"
					/>
				</view>
			</view>
		</view>

		<!--
			拖动覆盖层：**纯视觉**，不接受任何触摸（pointer-events: none）。
			拖动是手指不离开屏幕一气呵成的——touchmove 由源卡片（weekGrid 的
			.course-slot）接收后冒泡上来的，跟覆盖层无关；覆盖层只管画浮动卡片。
			渲染在分页器之外：track 用 transform 平移，fixed 子元素会被当成
			相对定位。
		-->
		<view v-if="drag.active" class="drag-overlay">
			<view class="drag-ghost" :style="ghostStyle">
				<text class="ghost-name">{{ drag.course && drag.course.name }}</text>
				<text v-if="drag.course && drag.course.classroom" class="ghost-room">{{ drag.course.classroom }}</text>
				<text class="ghost-hint">松手放到高亮格</text>
			</view>
		</view>

		<!-- 回到本周 -->
		<view v-if="pageIndex + 1 !== currentWeekNum" class="back-week" @click="backToThisWeek">
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
			@remove-once="onCourseRemoveOnce"
			@remove-sections="onCourseRemoveSections"
			@remove-range="onCourseRemoveRange"
			@copy="onCourseCopy"
		/>
	</view>
</template>

<script setup>
/**
 * schedule —— 周课表页（课表 Tab）
 * - 左右滑动切换周次：自绘翻页器（每周一页，横向跟手 + 松手停靠）
 * - 顶部展示当前教学周号、单双周标识与日期范围
 * - 点击课程块编辑、点击空白格快速新增、回到本周按钮
 *
 * 为什么不用原生 swiper：拖动课程要求"长按后手指不离开屏幕直接拖"，而 swiper
 * 会跟着手指横移 —— 手指相对内容就不动了，根本没法把课拖到别的星期。MP 端又
 * 没有 disable-touch（只在 uni-h5 里实现）能中途关掉它，`catchtouchmove` 只能
 * 静态声明、会永久破坏"手指落在卡片上滑动切周"；曾短暂用过"松手再按住浮动卡片"
 * 的两段式绕开（手感差，已废弃）。自绘翻页器后手势完全自己掌控：拖动期间页面不
 * 跟手、改用"贴边悬停翻页"，正好是手机上挪 App 图标的手感。
 */
import { ref, reactive, computed, watch, onUnmounted } from 'vue';
import { useData } from '../../store/useData.js';
import { getWeekInfo, getWeekDates } from '../../utils/week.js';
import { parseWeeksPattern } from '../../utils/weeksPattern.js';
import { todayStr, formatMDShort, WEEKDAY_NAMES } from '../../utils/time.js';
import weekGrid from '../../components/weekGrid/weekGrid.vue';
import courseEdit from '../../components/courseEdit/courseEdit.vue';

const {
	data,
	addCourse,
	updateCourse,
	deleteCourse,
	copyCourse,
	splitCourseRange,
	cancelCourseOnDate,
	deleteCourseRange,
	deleteCourseSections,
} = useData();

const hasTerm = computed(() => !!data.config.termStartDate);

/* ==================== 周次与翻页 ==================== */

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
const pageIndex = ref(Math.max(0, currentWeekNum.value - 1));

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
	pageIndex.value = Math.min(pageIndex.value, maxWeek.value - 1);
});

/**
 * 每个教学周一个真实页面（1..maxWeek），横向排成一列由 .pager-track 平移展示。
 * 都是真实页面、引用稳定，没有"占位页/瞬移复位"那一套。
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
	const weekNum = pageIndex.value + 1;
	const dates = getWeekDates(weekNum, data.config.termStartDate);
	const { isOddWeek, isManual } = getWeekInfo(dates[0], data.config);
	return {
		weekNum,
		isOddWeek,
		isManual,
		rangeLabel: `${formatMDShort(dates[0])} - ${formatMDShort(dates[6])}`,
	};
});

/* ---------- 翻页：横向跟手拖动 + 松手停靠 ---------- */

/** 跟手位移（px；0 = 停在当前周页） */
const pan = reactive({ startX: 0, startY: 0, dx: 0, axis: '', startTime: 0 });

const PAN_SLOP = 8; // 低于这个位移不判定方向（点按/长按不算滑动）
const PAN_FLICK_MS = 260; // 快速轻扫
const PAN_FLICK_DX = 30;
const PAN_RATIO = 0.22; // 或被拖过页面宽度的这个比例 → 翻页

function pageWidth() {
	const info = (uni.getWindowInfo ? uni.getWindowInfo() : uni.getSystemInfoSync()) || {};
	return info.windowWidth || 375;
}

/**
 * 画布位移。拖动课程期间 transition 必须为 none：
 * 贴边翻页是瞬时切换的，动画会让落点列失去准头（见 updateEdgeFlip）。
 */
const trackStyle = computed(() => ({
	transform: `translateX(calc(${-pageIndex.value * 100}% + ${pan.dx}px))`,
	transition: pan.axis === 'x' || drag.active
		? 'none'
		: 'transform 260ms cubic-bezier(0.25, 0.8, 0.35, 1)',
}));

function onPagerTouchStart(e) {
	const t = e.touches && e.touches[0];
	if (!t) return;
	pan.startX = t.clientX;
	pan.startY = t.clientY;
	pan.dx = 0;
	pan.axis = '';
	pan.startTime = Date.now();
}

function onPagerTouchMove(e) {
	// 拖动课程期间（含长按后查询未返回的窗口）页面**绝不跟手**：
	// 跟手了手指相对内容就不动，没法把课挪到别的星期
	if (drag.active || drag.pending) return;
	const t = e.touches && e.touches[0];
	if (!t) return;
	const dx = t.clientX - pan.startX;
	const dy = t.clientY - pan.startY;
	if (!pan.axis) {
		if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) return;
		// 轴向锁定：竖向交给网格自己的 scroll-view，这里不插手
		pan.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
	}
	if (pan.axis !== 'x') return;
	const first = pageIndex.value === 0;
	const last = pageIndex.value === pages.value.length - 1;
	// 首尾页之外没有内容：阻尼拖拽做回弹提示
	pan.dx = (first && dx > 0) || (last && dx < 0) ? dx * 0.3 : dx;
}

function onPagerTouchEnd() {
	// 拖动课程期间的松手是从源卡片冒泡上来的，绝不能触发翻页判定
	if (drag.active || drag.pending) {
		pan.axis = '';
		pan.dx = 0;
		return;
	}
	if (pan.axis === 'x') {
		const dt = Date.now() - pan.startTime;
		const flick = dt < PAN_FLICK_MS && Math.abs(pan.dx) > PAN_FLICK_DX;
		const far = Math.abs(pan.dx) > pageWidth() * PAN_RATIO;
		if (flick || far) {
			const next = pageIndex.value + (pan.dx < 0 ? 1 : -1);
			if (next >= 0 && next < pages.value.length) pageIndex.value = next;
		}
	}
	// 先解除"跟手中"（transition 恢复），同一帧里 dx 归零 → 平滑滑到目标页
	pan.axis = '';
	pan.dx = 0;
}

function backToThisWeek() {
	// 与初始钳制一致：学期开始前"本周"落在第 1 周
	pageIndex.value = Math.max(0, currentWeekNum.value - 1);
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

/* ==================== 分级删除 ==================== */

/** 仅取消当天这一节（其他日期照常上课） */
function onCourseRemoveOnce({ id, date }) {
	const r = cancelCourseOnDate(id, date);
	if (!r.ok) {
		uni.showToast({ title: r.error || '取消失败', icon: 'none', duration: 2500 });
		return;
	}
	uni.showToast({
		title: r.existed ? '当天已经是取消状态' : '已取消当天课程，可在日历页恢复',
		icon: 'none',
		duration: 2500,
	});
	editShow.value = false;
}

/** 删除部分节次（中间截断时自动拆分为两门课） */
function onCourseRemoveSections({ id, start, end }) {
	const r = deleteCourseSections(id, start, end);
	if (!r.ok) {
		uni.showToast({ title: r.error || '删除失败', icon: 'none', duration: 2500 });
		return;
	}
	uni.showToast({
		title: r.deleted ? '已删除整门课程' : r.split ? '已删除所选节次（拆分为两门课）' : '已删除所选节次',
		icon: 'success',
		duration: 2500,
	});
	editShow.value = false;
}

/** 删除部分周次（删完则整门删除） */
function onCourseRemoveRange({ id, start, end }) {
	const r = deleteCourseRange(id, start, end);
	if (!r.ok) {
		uni.showToast({ title: r.error || '删除失败', icon: 'none', duration: 2500 });
		return;
	}
	uni.showToast({
		title: r.deleted ? '已删除整门课程' : `已删除第 ${start}-${end} 周的课程`,
		icon: 'success',
		duration: 2500,
	});
	editShow.value = false;
}

/* ==================== 长按拖动课程 ==================== */

/**
 * 拖动状态（页面持有，weekGrid 只读消费做视觉反馈）：
 * 长按卡片 → 振动 + 源卡片变暗 + 浮动卡片贴着手指 → **手指不离开屏幕**直接拖到
 * 目标格松手。像手机上挪动 App 图标那样一气呵成。
 *
 * 为什么不用"阻止翻页"的思路：MP 端没有 disable-touch 能让原生手势中途失效，
 * 所以反过来给拖动**最高优先级**——weekGrid 在长按那一刻**同步**发出 dragBegin，
 * 页面立即挂起翻页手势（drag.pending，等异步的几何查询回来再转成 drag.active），
 * 从长按到松手整条手势都不会被翻页器/滚动抢走。翻周改为拖动中贴屏幕边缘悬停。
 * 落点只由**手指位置**决定，翻到哪一页都不影响判定（每周页面几何完全一致）。
 * 手指纵向拖动时网格跟着滚（1:1），滚动量由 weekGrid 采集并在换算行号时补上——
 * 这样超出视口的行（10 小节课表的下半屏）也拖得到。
 */
const drag = reactive({
	active: false,
	/** 长按已发生、几何查询还没回来：先挂起翻页手势（移动优先级最高） */
	pending: false,
	course: null,
	date: '',
	/** 源卡片所在列（调休周可能 ≠ 课程 weekday，用于判断"没挪窝"） */
	fromCol: -1,
	x: 0,
	y: 0,
	/** 浮动卡片尺寸（px，取自源卡片实际矩形） */
	w: 0,
	h: 0,
	/** 手指相对浮动卡片左上角的偏移（长按那一刻算好，浮动卡片就不会跳到手指下） */
	grab: null,
	/** 落点 { di, si, siEnd }（行/列下标），越界或未拖到卡片上时为 null */
	target: null,
	cellRects: [],
	sections: 0,
	/** 源课程的起始节次下标，位移叠加在它上面 */
	baseSi: 0,
	/** 长按拿起那一刻浮动卡片的纵坐标，落点行按与它的位移换算 */
	y0: 0,
	/** 拿起时网格的滚动位置（拖动中网格会跟着手指滚，换算行号要补差） */
	scrollTop0: 0,
});

const ghostStyle = computed(() => ({
	left: `${drag.x}px`,
	top: `${drag.y}px`,
	width: `${drag.w}px`,
	height: `${drag.h}px`,
	backgroundColor: (drag.course && drag.course.color) || '#409eff',
}));

/** 课程节次跨度（拖动只改位置，不改变跨度） */
const dragSpan = computed(() =>
	drag.course ? drag.course.endSection - drag.course.startSection + 1 : 1
);

/**
 * 长按后、几何查询返回前手指就抬起了（或触摸被打断）：这次拖动作废。
 * 查询是异步的，回来时手势早已结束——若照样进入拖动状态，就再没有 touchend
 * 来结束它（见 onDragStart）。onDragBegin 每次都复位。
 */
let dragAborted = false;

/** 长按已发生、dragStart 还没到（几何查询是异步的）期间的兜底清理 */
let pendingTimer = null;
function clearPending() {
	if (pendingTimer) {
		clearTimeout(pendingTimer);
		pendingTimer = null;
	}
	drag.pending = false;
}

/**
 * weekGrid 在长按那一刻**同步**发来的信号：立即挂起翻页手势并清掉可能已经
 * 积累的跟手位移——不能等 dragStart（异步查询），否则这一小段窗口里手指横移
 * 会被当成翻周手势、页面先横滑一截再被拽回，看起来就是"课自己乱跳"。
 * 查询失败（拖不起来）时由兜底定时器解开挂起。
 */
function onDragBegin() {
	if (drag.active) return;
	clearPending(); // 先清掉上一个兜底定时器，再置位（顺序不能反，clearPending 会复位 pending）
	dragAborted = false;
	drag.pending = true;
	pan.axis = '';
	pan.dx = 0;
	clearEdgeFlip();
	pendingTimer = setTimeout(() => {
		pendingTimer = null;
		if (!drag.active) drag.pending = false;
	}, 1500);
}

function onDragStart(payload) {
	clearPending();
	// 这次长按的手势已经结束了（手指在几何查询返回前就抬起了）：作废。
	// 若照样进入拖动状态，就再也没有 touchend 来结束它——拖动状态永远为真，
	// 翻页手势与卡片点击会全部失效，只有重载能恢复。
	if (dragAborted) {
		dragAborted = false;
		return;
	}
	if (!payload || !payload.slotRect || !payload.cellRects.length) return;
	drag.active = true;
	drag.course = payload.course;
	drag.date = payload.date;
	drag.fromCol = payload.col;
	drag.w = payload.slotRect.width;
	drag.h = payload.slotRect.height;
	// 浮动卡片出现在源卡片原位（覆盖层与 rect 同坐标系，见 .drag-overlay 的样式注释）
	drag.x = payload.slotRect.left;
	drag.y = payload.slotRect.top;
	// 手指相对卡片左上角的偏移：按它就位，浮动卡片原地等手指继续拖，不会突然跳到指尖下
	drag.grab = payload.grab || { dx: drag.w / 2, dy: drag.h / 2 };
	drag.cellRects = payload.cellRects;
	drag.sections = payload.sections;
	/** 源课程起始节次下标；落点行 = 它 + 手指纵向位移（见 updateDragTarget） */
	drag.baseSi = payload.course.startSection - 1;
	drag.y0 = payload.slotRect.top;
	drag.scrollTop0 = payload.scrollTop0 || 0;
	// 初始高亮即原位（提示"当前在这里"）
	drag.target = {
		di: payload.col,
		si: payload.course.startSection - 1,
		siEnd: payload.course.endSection - 1,
	};
	try {
		uni.vibrateShort({});
	} catch (e) {
		/* 部分平台不支持震动，忽略 */
	}
	// 拿起这一刻可能已经有几 px 的跟手位移（长按要求基本不动，可忽略不计）：
	// 清掉它，页面回到整页位置，后面"手指 x → 第几列"才准
	pan.axis = '';
	pan.dx = 0;
	clearEdgeFlip();
	uni.showToast({ title: '拖到目标格后松手', icon: 'none', duration: 1500 });
}

/**
 * 拖动中：手指仍按在源卡片上，touchmove 从卡片冒泡到 weekGrid 再发到这里。
 * 全程不拦截、不 .stop —— 分页器的滚动/翻周判定照常拿到事件（翻页由贴边悬停触发，
 * 见 updateEdgeFlip，就像挪 App 图标时拖到屏幕边缘翻页）。
 * p：触点坐标；scrollDelta：拿到卡片后网格的纵向滚动量（内容跟着滚了，行号要补差）。
 */
function onDragMove(p, scrollDelta) {
	if (!drag.active || !p) return;
	if (drag.grab) {
		drag.x = p.x - drag.grab.dx;
		drag.y = p.y - drag.grab.dy;
	}
	updateDragTarget(scrollDelta);
	updateEdgeFlip();
}

function onDragEnd() {
	// 手指在几何查询返回前抬起：本组触摸已经结束，不会再来的 touchmove 能救它，
	// 直接作废（onDragStart 回来时看到标记即放弃）
	if (!drag.active) {
		dragAborted = true;
		clearPending();
		return;
	}
	commitDrag();
}

/* ---------- 拖动中的翻页：贴着左右边缘悬停一会儿 → 翻到相邻周 ---------- */

const EDGE_X = 16; // 距「屏幕」边缘多少 px 算贴边（按浮动卡片中心）
const EDGE_ENTER_MS = 250; // 第一次贴边等这么久就翻（太久不跟手、太短容易误触）
const EDGE_REPEAT_MS = 450; // 继续贴着：一拍一拍往后翻
let edgeDir = 0;
let edgeTimer = null;

/**
 * 拖动期间翻页不用跟手（手指相对内容就不动了），改用贴边悬停，且**瞬时切换**：
 * 每周页面几何完全一致，页面停在整页位置上，"手指 x → 第几列"的换算才始终精确。
 * 换页后源卡片的矩形依然有效，落点判定完全不受影响。
 *
 * 翻页区必须贴着**屏幕**边缘（0 / windowWidth），不能用格子的左/右边：
 * 格子的边缘正好在周一/周日列里——按旧算法瞄准周一列悬停半秒就会误翻页，
 * 松手时课就"跑到别的周去了"，整页瞬时横跳也像"别的课自己乱跑"。
 * 屏幕左边缘 0~16px 落在时间列上（时间列约 44px 宽），贴时间列翻页正合适。
 */
function updateEdgeFlip() {
	if (!drag.active) {
		clearEdgeFlip();
		return;
	}
	const winW = pageWidth();
	const cx = drag.x + drag.w / 2;
	const dir = cx <= EDGE_X ? -1 : cx >= winW - EDGE_X ? 1 : 0;
	if (!dir) {
		clearEdgeFlip();
		return;
	}
	if (dir !== edgeDir) {
		edgeDir = dir;
		armEdgeTimer(EDGE_ENTER_MS); // 首次进入贴边区：短延迟即翻
		return;
	}
	if (!edgeTimer) armEdgeTimer(EDGE_REPEAT_MS); // 同一侧持续悬停：翻过一页后等下一拍
}

function armEdgeTimer(ms) {
	if (edgeTimer) clearTimeout(edgeTimer);
	edgeTimer = setTimeout(() => {
		edgeTimer = null;
		if (!drag.active) return;
		const next = pageIndex.value + edgeDir;
		if (next < 0 || next >= pages.value.length) {
			edgeDir = 0; // 已经是首/末周：不再翻
			return;
		}
		pageIndex.value = next;
	}, ms);
}

function clearEdgeFlip() {
	if (edgeTimer) {
		clearTimeout(edgeTimer);
		edgeTimer = null;
	}
	edgeDir = 0;
}

/** 由格子矩形换算落点：列按浮动卡片中心，行按手指纵向位移了多少行 */
function updateDragTarget(scrollDelta = 0) {
	const cells = drag.cellRects;
	const first = cells[0];
	if (!first || !drag.sections) {
		drag.target = null;
		return;
	}
	// 列宽/行高取相邻格子的差值（差值天然与坐标系原点无关）
	const colW = cells[1] ? cells[1].left - first.left : first.width;
	const rowH = cells[7] ? cells[7].top - first.top : first.height;
	if (!colW || !rowH) {
		drag.target = null;
		return;
	}
	const di = Math.floor((drag.x + drag.w / 2 - first.left) / colW);
	// 行按下移量算，而不是用浮动卡片的绝对纵坐标去比格子：
	// 位移是纯差值，不受各端 rect 原点差异影响，原地松手也必然回到原行。
	// 再补上网格滚动量——纵向拖动时内容会跟着滚，只按手指位移算会少走几行。
	const si = drag.baseSi + Math.round((drag.y - drag.y0 + scrollDelta) / rowH);
	const span = dragSpan.value;
	const nextTarget = (di < 0 || di > 6 || si < 0 || si + span > drag.sections)
		? null
		: { di, si, siEnd: si + span - 1 };
	// 目标格没变就不写：drag.target 被全部周页的全部格子引用做高亮判定，
	// 每个 touchmove 都换新对象会让它们整体重算一遍，拖动就卡了。
	const cur = drag.target;
	if (nextTarget === null) {
		if (cur !== null) drag.target = null;
		return;
	}
	if (!cur || cur.di !== nextTarget.di || cur.si !== nextTarget.si || cur.siEnd !== nextTarget.siEnd) {
		drag.target = nextTarget;
	}
}

function commitDrag() {
	const t = drag.target;
	const c = drag.course;
	if (!c) {
		resetDrag();
		return;
	}
	// 松手处不在课表内（时间列、首尾页外、节次越界）：出声说明，别静默得像"挪了没动"
	if (!t) {
		uni.showToast({ title: '松手处不在课表内，未移动', icon: 'none', duration: 1800 });
		resetDrag();
		return;
	}
	const startSection = t.si + 1;
	const endSection = t.si + dragSpan.value;
	const sameCol = t.di === drag.fromCol;
	// 目标日期 = 当前（可能已翻页）这一周第 t.di 列的日期——一次性课按日期落位
	const dropPage = pages.value[pageIndex.value];
	const targetDate = dropPage ? dropPage.dates[t.di] : '';
	// 「原位落下 = 取消」必须限定在**同一天**：翻到别的周后同一格位置并不同义——
	// 单双周课在下一周本来就没有这节，落下去是"挪到那一周"，不是没动。
	const sameDate = targetDate === (c.date || drag.date);
	if (sameCol && startSection === c.startSection && sameDate) {
		// 同一天原位落下：这次拖动作废（不是删除）。出声——整段手势做完总得有个交代，
		// 否则用户分不清"本来就没动"和"拖动没生效"。
		uni.showToast({ title: '课未移动', icon: 'none', duration: 1500 });
		resetDrag();
		return;
	}
	// 同列只改节次：保留原 weekday（调休周该列 ≠ 课程 weekday）
	const weekday = sameCol ? c.weekday : t.di + 1;
	const label = `${WEEKDAY_NAMES[weekday - 1]} 第 ${startSection}${endSection > startSection ? `-${endSection}` : ''} 节`;
	if (c.date) {
		// 已经是一次性课（临时/替代）：整条记录搬过去。overrideId 保留——
		// 它抑制的对象不变，换到别的日期仍然只影响它自己。
		updateCourse(c.id, targetDate
			? { date: targetDate, weekday, startSection, endSection }
			: { weekday, startSection, endSection });
		uni.showToast({
			title: `已移到${targetDate ? ` ${formatMDShort(targetDate)}` : ''}${label}`,
			icon: 'success',
		});
	} else if (drag.date && targetDate) {
		// 每周课：**只挪长按的这一节**。
		// 跨列/跨页落点：原日期这一节取消（其他周不动）+ 目标日期新增一条
		// 「仅本次」替代课（overrideId 抑制原课在目标日期的显示，落点即所见）。
		// 同列只动节次：目标日期 = 长按日期，单条替代课即可。
		if (targetDate !== drag.date) {
			cancelCourseOnDate(c.id, drag.date);
		}
		addCourse({
			name: c.name,
			teacher: c.teacher,
			classroom: c.classroom,
			color: c.color,
			weekday,
			startSection,
			endSection,
			weeks: c.weeks,
			remark: c.remark,
			date: targetDate,
			overrideId: c.id,
		});
		uni.showToast({
			title: targetDate === drag.date
				? `已把 ${formatMDShort(drag.date)} 这一节移到${label}（其他周不变）`
				: `已把 ${formatMDShort(drag.date)} 这一节移到 ${formatMDShort(targetDate)}${label}（其他周不变）`,
			icon: 'none',
			duration: 2500,
		});
	} else {
		// 没有日期上下文（理论上到不了这里）：退回整课修改
		updateCourse(c.id, { weekday, startSection, endSection });
		uni.showToast({ title: `已移到${label}`, icon: 'success' });
	}
	resetDrag();
}

function resetDrag() {
	drag.active = false;
	drag.course = null;
	drag.grab = null;
	drag.target = null;
	drag.cellRects = [];
	// 触摸被打断（touchcancel）时几何查询可能还在路上：它回来不得再进入拖动状态
	dragAborted = true;
	clearPending();
	clearEdgeFlip();
}

onUnmounted(() => {
	clearPending();
	clearEdgeFlip();
});
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

/* ---------- 自绘分页器 ---------- */
.week-pager {
	flex: 1;
	overflow: hidden;
	/* flex 下高度会被内容撑开，用一个确定的高度基准让内部 grid 撑满 */
	height: 0;
}

/*
 * 画布：宽度 = 容器宽度（flex 容器不会被溢出的子项撑宽），
 * 因此 translateX(-100%) 恰好 = 一页宽，calc() 里可直接和跟手位移相加。
 */
.pager-track {
	display: flex;
	width: 100%;
	height: 100%;
	will-change: transform;
}

.pager-page {
	flex: 0 0 100%;
	width: 100%;
	height: 100%;
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

/* ---------- 拖动覆盖层 ---------- */
.drag-overlay {
	position: fixed;
	left: 0;
	top: 0;
	right: 0;
	bottom: 0;
	z-index: 1000;
	background: rgba(31, 45, 61, 0.08);
	/*
	 * 纯视觉层：不吃任何触摸。拖动本身靠源卡片那条 touch 序列（触摸目标在
	 * touchstart 就定了，覆盖层挡不住它），分页器的翻周手势也照常透过去。
	 */
	pointer-events: none;
	touch-action: none;

	/*
	 * H5：对齐到「页面内容区」原点。
	 * uni-h5 会把选择器 rect 与触摸点一起减去窗口顶栏高度（--window-top，即原生
	 * 导航栏），而 position: fixed 仍以视口为原点 —— 不加这一句，浮动卡片会比
	 * 手指高出一个导航栏（实测 44px ≈ 一行），落点行的判定也跟着偏。小程序端
	 * rect、触摸点、fixed 定位三者本就同为视口坐标，故仅在 H5 端补偿。
	 */
	/* #ifdef H5 */
	top: var(--window-top, 0px);
	/* #endif */
}

.drag-ghost {
	position: absolute;
	border-radius: 10rpx;
	padding: 8rpx 10rpx;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.32);
	transform: scale(1.05);
	opacity: 0.96;

	.ghost-name {
		font-size: 24rpx;
		font-weight: 600;
		color: #ffffff;
		line-height: 1.25;
		overflow: hidden;
	}

	.ghost-room {
		margin-top: 4rpx;
		font-size: 20rpx;
		color: rgba(255, 255, 255, 0.88);
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.ghost-hint {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		font-size: 18rpx;
		text-align: center;
		color: rgba(255, 255, 255, 0.92);
		background: rgba(0, 0, 0, 0.28);
		padding: 2rpx 0;
	}
}

/* ---------- 回到本周 ---------- */
.back-week {
	position: fixed;
	right: 32rpx;
	/* H5 的 tabbar 是盖在页面上的 fixed 层（--window-bottom = 它的高度，MP 下为 0）：
	   不加这一项，按钮下半截会被 tabbar 压住点不到 */
	bottom: calc(60rpx + var(--window-bottom, 0px));
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
