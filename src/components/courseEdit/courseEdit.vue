<template>
	<u-popup :show="show" mode="bottom" :round="24" safe-area-inset-bottom @close="$emit('close')">
		<view class="course-edit">
			<view class="edit-header">
				<text class="edit-title">{{ isEdit ? '编辑课程' : '新增课程' }}</text>
				<view class="edit-close" @click="$emit('close')">
					<u-icon name="close" size="20" color="#909399"></u-icon>
				</view>
			</view>

			<scroll-view scroll-y class="edit-body">
				<!-- 课程完整信息（只读展示，长文本完整换行，可随弹窗滚动查看） -->
				<view v-if="isEdit" class="course-brief">
					<view v-if="form.name" class="brief-row">
						<text class="brief-label">课程</text>
						<text class="brief-text">{{ form.name }}</text>
					</view>
					<view v-if="form.teacher" class="brief-row">
						<text class="brief-label">教师</text>
						<text class="brief-text">{{ form.teacher }}</text>
					</view>
					<view v-if="form.classroom" class="brief-row">
						<text class="brief-label">教室</text>
						<text class="brief-text">{{ form.classroom }}</text>
					</view>
					<view v-if="form.remark" class="brief-row">
						<text class="brief-label">备注</text>
						<text class="brief-text">{{ form.remark }}</text>
					</view>
				</view>

				<!-- 课程名称 -->
				<view class="form-row">
					<text class="form-label">课程名称</text>
					<input class="form-input" v-model="form.name" placeholder="如：高等数学" placeholder-class="ph" />
				</view>

				<!-- 教师 / 教室 -->
				<view class="form-row">
					<text class="form-label">教师</text>
					<input class="form-input" v-model="form.teacher" placeholder="选填" placeholder-class="ph" />
				</view>
				<view class="form-row">
					<text class="form-label">教室</text>
					<input class="form-input" v-model="form.classroom" placeholder="选填" placeholder-class="ph" />
				</view>

				<!-- 生效范围 -->
				<view class="form-row form-row-col">
					<text class="form-label">生效范围</text>
					<view class="week-chips">
						<view class="chip" :class="{ active: form.scope === 'weekly' }" @click="onScopeChange('weekly')">每周</view>
						<view v-if="isEdit && !form.originalDate" class="chip" :class="{ active: form.scope === 'range' }" @click="onScopeChange('range')">周段</view>
						<view class="chip" :class="{ active: form.scope === 'once' }" @click="onScopeChange('once')">单次</view>
					</view>
					<view v-if="form.scope === 'range'" class="custom-weeks">
						<view class="range-pickers">
							<picker mode="selector" :range="weekOptions" :value="form.rangeStart - 1" @change="onRangeStartChange">
								<view class="date-box">第 {{ form.rangeStart }} 周</view>
							</picker>
							<text class="range-sep">至</text>
							<picker mode="selector" :range="weekOptions" :value="form.rangeEnd - 1" @change="onRangeEndChange">
								<view class="date-box">第 {{ form.rangeEnd }} 周</view>
							</picker>
						</view>
						<text class="scope-tip">{{ scopeTip }}</text>
					</view>
					<view v-if="form.scope === 'once'" class="custom-weeks">
						<picker mode="date" :value="form.onceDate" @change="(e) => (form.onceDate = e.detail.value)">
							<view class="date-box">{{ form.onceDate }}</view>
						</picker>
						<text class="scope-tip">{{ scopeTip }}</text>
					</view>
				</view>

				<!-- 颜色 -->
				<view class="form-row form-row-col">
					<text class="form-label">颜色</text>
					<view class="color-list">
						<view
							v-for="c in COURSE_COLORS"
							:key="c"
							class="color-item"
							:style="{ backgroundColor: c }"
							:class="{ active: form.color === c }"
							@click="form.color = c"
						>
							<text v-if="form.color === c" class="color-check">✓</text>
						</view>
					</view>
				</view>

				<!-- 星期 / 节次 -->
				<view class="form-row">
					<text class="form-label">星期</text>
					<picker mode="selector" :range="WEEKDAY_NAMES" :value="form.weekday - 1" @change="onWeekdayChange">
						<view class="picker-value">
							<text>{{ WEEKDAY_NAMES[form.weekday - 1] }}</text>
							<u-icon name="arrow-right" size="14" color="#c0c4cc"></u-icon>
						</view>
					</picker>
				</view>
				<view class="form-row">
					<text class="form-label">节次</text>
					<view class="section-picker">
						<picker mode="selector" :range="sectionOptions" :value="form.startSection - 1" @change="onStartChange">
							<view class="picker-value picker-box">
								<text>第 {{ form.startSection }} 节</text>
								<u-icon name="arrow-down" size="14" color="#c0c4cc"></u-icon>
							</view>
						</picker>
						<text class="picker-sep">至</text>
						<picker mode="selector" :range="sectionOptions" :value="form.endSection - 1" @change="onEndChange">
							<view class="picker-value picker-box">
								<text>第 {{ form.endSection }} 节</text>
								<u-icon name="arrow-down" size="14" color="#c0c4cc"></u-icon>
							</view>
						</picker>
					</view>
				</view>

				<!-- 周规则（单次模式不适用，隐藏） -->
				<view v-if="form.scope === 'weekly'" class="form-row form-row-col">
					<text class="form-label">上课周次</text>
					<view class="week-chips">
						<view
							v-for="opt in WEEK_TYPES"
							:key="opt.value"
							class="chip"
							:class="{ active: form.weekType === opt.value }"
							@click="form.weekType = opt.value"
						>
							{{ opt.label }}
						</view>
					</view>
					<view v-if="form.weekType === 'custom'" class="custom-weeks">
						<input class="form-input" v-model="form.customPattern" placeholder="如 1-16 或 2-8,10-14" placeholder-class="ph" />
						<text v-if="patternPreview" class="pattern-preview">{{ patternPreview }}</text>
						<text v-else class="pattern-preview pattern-warn">请输入合法的周次，如 1-16、2-8,10-14</text>
					</view>
				</view>

				<!-- 备注 -->
				<view class="form-row form-row-col">
					<text class="form-label">备注</text>
					<textarea class="form-textarea" v-model="form.remark" placeholder="选填，如：带教材、实验分组等" placeholder-class="ph" :maxlength="100" auto-height />
				</view>
			</scroll-view>

			<!-- 底部操作 -->
			<view class="edit-footer">
				<view v-if="isEdit" class="btn btn-danger" @click="onDelete">删除</view>
				<view v-if="isEdit" class="btn btn-plain" @click="$emit('copy', form.id)">复制</view>
				<view class="btn btn-primary" @click="onSave">保存</view>
			</view>
		</view>
	</u-popup>
</template>

<script setup>
/**
 * courseEdit —— 课程编辑弹窗（新增/编辑/删除/复制）
 *
 * 父级（周课表页/日历页）控制 show；
 * - course 为空 → 新增模式（可用 prefill 预填星期与节次，空白格快速新增）
 * - course 非空 → 编辑模式（底部出现 删除/复制）
 */
import { ref, reactive, watch, computed } from 'vue';
import { WEEKDAY_NAMES, todayStr } from '../../utils/time.js';
import { describeWeeks, parseWeeksPattern, intersectWeeksRange } from '../../utils/weeksPattern.js';

const props = defineProps({
	show: { type: Boolean, default: false },
	course: { type: Object, default: null },
	/** 快速新增预填：{ weekday, section, date? }（空白格/当日弹窗快速新增） */
	prefill: { type: Object, default: null },
	/** 打开弹窗时所在日期（课程卡点击的当天），「单次」模式的默认生效日期 */
	dateContext: { type: String, default: '' },
	/** 节次总数（来自 config.sections） */
	sectionsCount: { type: Number, default: 12 },
	/** 周段选择的最大周号（「周段」模式起止周范围） */
	maxWeek: { type: Number, default: 20 },
});
const emit = defineEmits(['close', 'save', 'remove', 'copy']);

const COURSE_COLORS = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#8e44ad', '#16a085', '#e84393', '#3498db', '#9c6b3c', '#909399'];
const WEEK_TYPES = [
	{ value: 'all', label: '每周' },
	{ value: 'odd', label: '单周' },
	{ value: 'even', label: '双周' },
	{ value: 'custom', label: '自定义' },
];

const isEdit = computed(() => !!props.course);
const sectionOptions = computed(() =>
	Array.from({ length: props.sectionsCount }, (_, i) => `第 ${i + 1} 节`)
);

const form = reactive({
	id: null,
	name: '',
	teacher: '',
	classroom: '',
	color: COURSE_COLORS[0],
	weekday: 1,
	startSection: 1,
	endSection: 2,
	weekType: 'all',
	customPattern: '1-16',
	remark: '',
	/** 生效范围：weekly 每周 / range 周段（拆分修改）/ once 单次（仅所选日期生效） */
	scope: 'weekly',
	onceDate: '',
	rangeStart: 1,
	rangeEnd: 20,
	/** 原课程是否一次性课（编辑既有一次性课时保留 date/overrideId） */
	originalDate: null,
	originalOverrideId: null,
});

/** 自定义周次实时预览 */
const patternPreview = computed(() => {
	const p = String(form.customPattern || '').trim();
	if (!p) return '';
	const { weeks } = parseWeeksPattern(p);
	if (!weeks || weeks.size === 0) return '';
	return describeWeeks(p);
});

watch(
	() => props.show,
	(v) => {
		if (v) initForm();
	}
);

function initForm() {
	const c = props.course;
	const pre = props.prefill;
	const todayWeekday = new Date().getDay() || 7;

	form.id = c ? c.id : null;
	form.name = c ? c.name : '';
	form.teacher = c ? c.teacher : '';
	form.classroom = c ? c.classroom : '';
	form.color = c && c.color ? c.color : COURSE_COLORS[0];
	form.weekday = c ? c.weekday : (pre && pre.weekday) || todayWeekday;
	form.startSection = c ? c.startSection : (pre && pre.section) || 1;
	form.endSection = c ? c.endSection : (pre && pre.section) || 2;
	form.remark = c ? c.remark : '';

	// 生效范围：编辑既有一次性课 → 单次；否则每周（prefill.date/dateContext 作为单次模式默认日期）
	form.originalDate = c ? c.date || null : null;
	form.originalOverrideId = c ? c.overrideId || null : null;
	form.scope = form.originalDate ? 'once' : 'weekly';
	form.onceDate = form.originalDate || (pre && pre.date) || props.dateContext || todayStr();
	form.rangeStart = 1;
	form.rangeEnd = props.maxWeek;

	if (c && c.weeks) {
		const p = c.weeks;
		if (p === 'odd' || p === 'even') {
			form.weekType = p;
			form.customPattern = '1-16';
		} else if (p === 'all') {
			form.weekType = 'all';
			form.customPattern = '1-16';
		} else {
			form.weekType = 'custom';
			form.customPattern = p;
		}
	} else {
		form.weekType = 'all';
		form.customPattern = '1-16';
	}
}

function onScopeChange(scope) {
	form.scope = scope;
}

/** 周段选择器选项：第 1 周 ~ 第 maxWeek 周 */
const weekOptions = computed(() =>
	Array.from({ length: props.maxWeek }, (_, i) => `第 ${i + 1} 周`)
);

function onRangeStartChange(e) {
	const v = Number(e.detail.value) + 1;
	form.rangeStart = v;
	if (form.rangeEnd < v) form.rangeEnd = v;
}

function onRangeEndChange(e) {
	const v = Number(e.detail.value) + 1;
	form.rangeEnd = Math.max(v, form.rangeStart);
}

/** 生效范围提示文案 */
const scopeTip = computed(() => {
	if (form.scope === 'range') {
		return `保存后拆分为两段：第 ${form.rangeStart}-${form.rangeEnd} 周使用当前信息，其余周自动保留原信息`;
	}
	if (!isEdit.value) return '仅所选日期生效的一次性课（临时课）';
	if (!form.originalDate) return '保存后将作为仅该日期生效的一次性课，原每周课在其他日期不受影响';
	return '该一次性课仅所选日期生效';
});

function onWeekdayChange(e) {
	form.weekday = Number(e.detail.value) + 1;
}

function onStartChange(e) {
	const v = Number(e.detail.value) + 1;
	form.startSection = v;
	if (form.endSection < v) form.endSection = v;
}

function onEndChange(e) {
	const v = Number(e.detail.value) + 1;
	form.endSection = Math.max(v, form.startSection);
}

function onSave() {
	const name = String(form.name || '').trim();
	if (!name) {
		uni.showToast({ title: '请填写课程名称', icon: 'none' });
		return;
	}
	// 周段拆分：编辑每周课切「周段」保存 → 拆成修改段 + 剩余周（父级调 splitCourseRange）
	if (form.scope === 'range') {
		if (!isEdit.value || form.originalDate) {
			uni.showToast({ title: '周段修改仅适用于每周课程', icon: 'none' });
			return;
		}
		if (!intersectWeeksRange(props.course.weeks || 'all', form.rangeStart, form.rangeEnd)) {
			uni.showToast({ title: `原课在第 ${form.rangeStart}-${form.rangeEnd} 周没有课程`, icon: 'none' });
			return;
		}
		emit('save', {
			splitRange: true,
			originalId: form.id,
			rangeStart: form.rangeStart,
			rangeEnd: form.rangeEnd,
			name,
			teacher: String(form.teacher || '').trim(),
			classroom: String(form.classroom || '').trim(),
			color: form.color,
			weekday: form.weekday,
			startSection: form.startSection,
			endSection: form.endSection,
			weeks: 'all',
			remark: String(form.remark || '').trim(),
		});
		return;
	}
	// 单次模式：必须选生效日期
	if (form.scope === 'once' && !form.onceDate) {
		uni.showToast({ title: '请选择生效日期', icon: 'none' });
		return;
	}
	// 周规则组装（单次模式忽略周次，固定 all）
	let weeks = 'all';
	if (form.scope === 'weekly') {
		weeks = form.weekType;
		if (form.weekType === 'custom') {
			const p = String(form.customPattern || '').trim();
			const { weeks: set } = parseWeeksPattern(p);
			if (!set || set.size === 0) {
				uni.showToast({ title: '自定义周次格式不正确', icon: 'none' });
				return;
			}
			weeks = p;
		}
	}

	// 「仅本次修改」拆分：编辑每周课切到单次保存 → 新增一次性课（overrideId 指向原课），原课不动
	const isSplitting = form.scope === 'once' && isEdit.value && !form.originalDate;

	emit('save', {
		id: isSplitting ? null : form.id,
		name,
		teacher: String(form.teacher || '').trim(),
		classroom: String(form.classroom || '').trim(),
		color: form.color,
		weekday: form.weekday,
		startSection: form.startSection,
		endSection: form.endSection,
		weeks,
		remark: String(form.remark || '').trim(),
		// 一次性课字段：单次 → date 生效；拆分 → overrideId 抑制原课该日期
		date: form.scope === 'once' ? form.onceDate : undefined,
		overrideId: isSplitting ? form.id : form.originalOverrideId != null ? form.originalOverrideId : undefined,
	});
}

function onDelete() {
	uni.showModal({
		title: '删除课程',
		content: `确定删除「${props.course.name}」吗？`,
		confirmColor: '#f56c6c',
		success: (res) => {
			if (res.confirm) emit('remove', form.id);
		},
	});
}
</script>

<style lang="scss" scoped>
.course-edit {
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	display: flex;
	flex-direction: column;
	max-height: 80vh;
}

.edit-header {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 28rpx 32rpx 16rpx;
	position: relative;
	flex-shrink: 0;

	.edit-title {
		font-size: 32rpx;
		font-weight: 600;
		color: #303133;
	}

	.edit-close {
		position: absolute;
		right: 32rpx;
		top: 28rpx;
		padding: 4rpx;
	}
}

.edit-body {
	flex: 1;
	padding: 0 32rpx;
	max-height: 56vh;
	box-sizing: border-box;
}

/* 课程完整信息只读展示（长文本完整换行） */
.course-brief {
	margin-top: 8rpx;
	background: #f5f7fa;
	border-radius: 12rpx;
	padding: 16rpx 20rpx;
	display: flex;
	flex-direction: column;
	gap: 8rpx;

	.brief-row {
		display: flex;
		align-items: flex-start;
		gap: 12rpx;
	}

	.brief-label {
		flex-shrink: 0;
		font-size: 22rpx;
		color: #909399;
		line-height: 1.5;
	}

	.brief-text {
		flex: 1;
		font-size: 26rpx;
		color: #303133;
		line-height: 1.5;
		word-break: break-all;
	}
}

.form-row {
	display: flex;
	align-items: center;
	padding: 20rpx 0;
	border-bottom: 1rpx solid #f5f7fa;

	.form-label {
		width: 150rpx;
		flex-shrink: 0;
		font-size: 28rpx;
		color: #303133;
	}

	.form-input {
		flex: 1;
		font-size: 28rpx;
		color: #303133;
		height: 44rpx;
		line-height: 44rpx;
	}

	&.form-row-col {
		flex-direction: column;
		align-items: flex-start;

		.form-label {
			margin-bottom: 16rpx;
		}

		.form-input {
			width: 100%;
		}
	}
}

.ph {
	color: #c0c4cc;
}

/* 颜色选择 */
.color-list {
	display: flex;
	flex-wrap: wrap;
	gap: 20rpx;

	.color-item {
		width: 56rpx;
		height: 56rpx;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;

		.color-check {
			color: #ffffff;
			font-size: 28rpx;
			font-weight: 700;
		}

		&.active {
			border: 4rpx solid #303133;
		}
	}
}

/* 选择器 */
.picker-value {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8rpx;
	font-size: 28rpx;
	color: #303133;
	flex: 1;
}

.section-picker {
	flex: 1;
	display: flex;
	align-items: center;
	gap: 16rpx;
	justify-content: flex-end;

	.picker-box {
		flex: none;
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 20rpx;
		justify-content: center;
		gap: 10rpx;
	}

	.picker-sep {
		color: #909399;
		font-size: 26rpx;
	}
}

/* 周规则 chips */
.week-chips {
	display: flex;
	gap: 16rpx;

	.chip {
		padding: 12rpx 28rpx;
		border-radius: 32rpx;
		background: #f5f7fa;
		font-size: 26rpx;
		color: #606266;

		&.active {
			background: #409eff;
			color: #ffffff;
		}
	}
}

.custom-weeks {
	width: 100%;
	margin-top: 16rpx;

	.date-box {
		display: inline-block;
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 24rpx;
		font-size: 26rpx;
		color: #303133;
	}

	.range-pickers {
		display: flex;
		align-items: center;
		gap: 12rpx;

		.range-sep {
			font-size: 24rpx;
			color: #909399;
		}
	}

	.scope-tip {
		display: block;
		margin-top: 10rpx;
		font-size: 22rpx;
		color: #e6a23c;
		line-height: 1.4;
	}

	.pattern-preview {
		display: block;
		margin-top: 10rpx;
		font-size: 24rpx;
		color: #67c23a;
		line-height: 1.4;
	}

	.pattern-warn {
		color: #e6a23c;
	}
}

.form-textarea {
	width: 100%;
	font-size: 28rpx;
	color: #303133;
	line-height: 1.5;
	min-height: 72rpx;
	padding: 8rpx 0;
	box-sizing: border-box;
}

/* 底部按钮 */
.edit-footer {
	display: flex;
	gap: 20rpx;
	padding: 24rpx 32rpx;
	padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
	flex-shrink: 0;

	.btn {
		flex: 1;
		height: 84rpx;
		border-radius: 42rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 30rpx;
		font-weight: 600;

		&:active {
			opacity: 0.85;
		}
	}

	.btn-primary {
		background: #409eff;
		color: #ffffff;
		flex: 2;
	}

	.btn-plain {
		background: #f5f7fa;
		color: #606266;
	}

	.btn-danger {
		background: #fef0f0;
		color: #f56c6c;
	}
}
</style>
