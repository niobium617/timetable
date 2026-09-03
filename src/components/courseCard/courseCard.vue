<template>
	<view
		class="course-card"
		:class="{ compact, once, conflict }"
		:style="{ backgroundColor: course.color || '#409eff' }"
		@click.stop="$emit('click')"
	>
		<text v-if="once" class="tag-once">临时</text>
		<text class="card-name">{{ course.name }}</text>
		<text v-if="course.classroom" class="card-room">{{ course.classroom }}</text>
		<text v-if="conflict" class="badge-conflict">冲突</text>
	</view>
</template>

<script setup>
/**
 * courseCard —— 周网格课程块
 * 高度/宽度由父级容器（绝对定位 slot）决定，此处铺满。
 * compact 模式用于同节次多课并排（横向空间不足时缩小字号）。
 * once = 一次性课（仅指定日期生效），角标「临时」；
 * conflict = 与一次性课节次重叠（由过滤链标记），红框 + 角标「冲突」。
 */
defineProps({
	course: { type: Object, required: true },
	compact: { type: Boolean, default: false },
	once: { type: Boolean, default: false },
	conflict: { type: Boolean, default: false },
});
defineEmits(['click']);
</script>

<style lang="scss" scoped>
.course-card {
	width: 100%;
	height: 100%;
	border-radius: 10rpx;
	padding: 8rpx 10rpx;
	box-sizing: border-box;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.12);
	transition: transform 0.08s ease;
	position: relative;

	&:active {
		transform: scale(0.97);
		opacity: 0.92;
	}

	.card-name {
		font-size: 24rpx;
		font-weight: 600;
		color: #ffffff;
		line-height: 1.25;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
		word-break: break-all;
	}

	.card-room {
		margin-top: 4rpx;
		font-size: 20rpx;
		color: rgba(255, 255, 255, 0.88);
		line-height: 1.2;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.tag-once {
		position: absolute;
		top: 0;
		right: 0;
		font-size: 16rpx;
		color: rgba(255, 255, 255, 0.9);
		background: rgba(0, 0, 0, 0.25);
		border-radius: 0 10rpx 0 10rpx;
		padding: 2rpx 10rpx;
		line-height: 1.4;
	}

	.badge-conflict {
		position: absolute;
		bottom: 0;
		right: 0;
		font-size: 16rpx;
		color: #ffffff;
		background: #f56c6c;
		border-radius: 10rpx 0 10rpx 0;
		padding: 2rpx 10rpx;
		line-height: 1.4;
	}

	&.once {
		border: 2rpx dashed rgba(255, 255, 255, 0.75);
	}

	&.conflict {
		border: 3rpx solid #f56c6c;
	}

	&.compact {
		padding: 6rpx;
		border-radius: 8rpx;

		.card-name {
			font-size: 20rpx;
		}

		.card-room {
			font-size: 18rpx;
		}
	}
}
</style>
