<script>
import { initData } from './store/index.js';

export default {
	onLaunch: function () {
		// 首次启动时初始化本地数据（写入示例数据，便于演示；用户可随时清除）
		initData();
	},
	onShow: function () {},
	onHide: function () {},
}
</script>

<style lang="scss">
@import "uview-plus/index.scss";

/* 每个页面公共css */
page {
	background-color: #f6f7f9;
	font-size: 28rpx;
	color: #303133;
}

/* 通用卡片容器 */
.tt-card {
	background-color: #ffffff;
	border-radius: 16rpx;
	margin: 20rpx 24rpx;
	padding: 24rpx;
	box-shadow: 0 2rpx 12rpx rgba(31, 45, 61, 0.04);
}

.tt-card-title {
	font-size: 30rpx;
	font-weight: 600;
	color: #303133;
	margin-bottom: 20rpx;
	display: flex;
	align-items: center;
}

.tt-card-title::before {
	content: '';
	width: 8rpx;
	height: 28rpx;
	background: #409eff;
	border-radius: 4rpx;
	margin-right: 12rpx;
}

/* 设置页表单项 */
.tt-form-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 22rpx 0;
	border-bottom: 1rpx solid #f0f2f5;
}

.tt-form-item:last-child {
	border-bottom: none;
}

.tt-form-label {
	font-size: 28rpx;
	color: #303133;
	flex-shrink: 0;
	margin-right: 20rpx;
}

.tt-form-value {
	font-size: 28rpx;
	color: #606266;
	text-align: right;
	flex: 1;
	display: flex;
	align-items: center;
	justify-content: flex-end;
}

/* 空状态 */
.tt-empty {
	padding: 60rpx 0;
	text-align: center;
	color: #c0c4cc;
	font-size: 26rpx;
}
</style>
