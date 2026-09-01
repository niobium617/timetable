<template>
	<view
		class="course-card"
		:class="{ compact }"
		:style="{ backgroundColor: course.color || '#409eff' }"
		@click.stop="$emit('click')"
	>
		<text class="card-name">{{ course.name }}</text>
		<text v-if="course.classroom" class="card-room">{{ course.classroom }}</text>
	</view>
</template>

<script setup>
/**
 * courseCard —— 周网格课程块
 * 高度/宽度由父级容器（绝对定位 slot）决定，此处铺满。
 * compact 模式用于同节次多课并排（横向空间不足时缩小字号）。
 */
defineProps({
	course: { type: Object, required: true },
	compact: { type: Boolean, default: false },
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
