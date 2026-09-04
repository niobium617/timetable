<script>
import { isFirstRun, importData } from './store/useData.js';
import { cloudFetch } from './utils/cloudBackup.js';

export default {
	onLaunch: function () {
		// 本地无有效数据（首次使用/清缓存/数据损坏）时，尝试从云端备份找回。
		// 延迟到首页渲染后再弹窗，避免启动瞬间 showModal 无页面上下文。
		if (isFirstRun) {
			setTimeout(() => tryCloudRecover(), 600);
		}
	},
	onShow: function () {},
	onHide: function () {},
}

/**
 * 启动检测云端备份：本地数据为空且云端有备份 → 弹窗一键恢复。
 * 非微信小程序端 / 未配置环境 / 云端无备份时静默跳过。
 */
async function tryCloudRecover() {
	if (typeof wx === 'undefined' || !wx.cloud) return;
	const r = await cloudFetch();
	if (!r.ok) return; // 云端暂无备份或未配置环境，不打扰
	uni.showModal({
		title: '检测到云端备份',
		content: '本地课表数据为空，是否从云端恢复上次备份？',
		confirmText: '恢复',
		cancelText: '暂不',
		confirmColor: '#409eff',
		success: (res) => {
			if (!res.confirm) return;
			const result = importData(r.payload);
			uni.showToast({
				title: result.ok ? '已从云端恢复课表' : result.error || '恢复失败',
				icon: result.ok ? 'success' : 'none',
				duration: 2500,
			});
		},
	});
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
