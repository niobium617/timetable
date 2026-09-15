<template>
	<!--
		拖动覆盖层：**纯视觉**，不接受任何触摸（pointer-events: none）。
		拖动是手指不离开屏幕一气呵成的——touchmove 由源卡片（weekGrid 的
		.course-slot）接收后冒泡上去，跟覆盖层无关；覆盖层只管画浮动卡片。

		渲染在分页器之外：track 用 transform 平移，其内部的 fixed 子元素会被
		当成相对定位（见 schedule.vue 的模板注释）。
	-->
	<view class="drag-overlay">
		<view class="drag-ghost" :style="ghostStyle">
			<text class="ghost-name">{{ drag.course && drag.course.name }}</text>
			<text v-if="drag.course && drag.course.classroom" class="ghost-room">{{ drag.course.classroom }}</text>
			<text class="ghost-hint">松手放到高亮格</text>
		</view>
	</view>
</template>

<script setup>
/**
 * dragGhost —— 拖动中的浮动卡片（纯视觉层）
 *
 * 单独成组件是为了性能，不是为了复用：卡片位置每帧都在变，若画在 schedule.vue
 * 的模板里，每个 touchmove 都要重算整页 vnode（含 20 个周页）再下发一次页面级
 * setData；抽出来后位置只被本组件读取，一次移动就只更新这一个小节点
 * （小程序端尤其明显）。
 */
import { computed } from 'vue';

const props = defineProps({
	/** 页面的拖动状态；这里只读画图要用的 x / y / w / h / course */
	drag: { type: Object, required: true },
});

/**
 * 定位用 transform 而不是 left/top：浮动卡片正压在整个网格上方，left/top 每帧
 * 都会让视图层重排重绘，代价是整屏；transform 配 will-change 让卡片进自己的
 * 合成层，移动时只做合成——真机上"不跟手"的主因就在这里。
 */
const ghostStyle = computed(() => ({
	transform: `translate3d(${props.drag.x}px, ${props.drag.y}px, 0) scale(1.05)`,
	width: `${props.drag.w}px`,
	height: `${props.drag.h}px`,
	backgroundColor: (props.drag.course && props.drag.course.color) || '#409eff',
}));
</script>

<style lang="scss" scoped>
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
	left: 0;
	top: 0;
	/* 进自己的合成层：每帧移动只做合成，不重绘下方网格 */
	will-change: transform;
	border-radius: 10rpx;
	padding: 8rpx 10rpx;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-shadow: 0 16rpx 40rpx rgba(0, 0, 0, 0.32);
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
</style>
