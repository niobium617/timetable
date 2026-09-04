<template>
	<view class="import-page">
		<!-- ============ 输入态 ============ -->
		<template v-if="!preview">
			<!-- 多模态 AI 识别说明 -->
			<view class="tt-card">
				<view class="tt-card-title">多模态 AI 识别（推荐）</view>
				<view class="ai-steps">
					<text>1. 点「复制提示词」</text>
					<text>2. 给课表截图，与提示词一起发给 ChatGPT / Claude 等多模态 AI（发送前建议开启 AI 的深度思考/推理模式）</text>
					<text>3. 把 AI 返回的 JSON 粘贴到下方输入框，点「解析课表」</text>
				</view>
				<scroll-view scroll-y class="prompt-box">
					<text class="prompt-text">{{ AI_PROMPT }}</text>
				</scroll-view>
				<view class="prompt-actions">
					<view class="btn-mini btn-plain" @click="onCopyPrompt">复制提示词</view>
				</view>
				<view class="form-tip">提示：课表截图会发送给第三方 AI，介意请勿使用此方式</view>
			</view>

			<!-- 粘贴 JSON -->
			<view class="tt-card">
				<view class="tt-card-title">粘贴 AI 返回的 JSON</view>
				<textarea
					class="paste-area"
					v-model="source"
					:maxlength="200000"
					placeholder="将 AI 返回的 JSON 粘贴到这里（可包含 ```json 代码块）"
					placeholder-class="ph"
				></textarea>
				<view class="form-tip">纯本地解析，解析结果不会上传</view>
				<view class="parse-actions">
					<view class="btn-mini btn-primary" :class="{ disabled: !source.trim() }" @click="onParse">解析课表</view>
				</view>
			</view>

			<!-- 输入态解析提示 -->
			<view v-if="inputWarnings.length" class="tt-card warn-card">
				<view class="tt-card-title">解析提示（{{ inputWarnings.length }}）</view>
				<view v-for="(w, i) in inputWarnings" :key="i" class="warn-row">
					<u-icon name="warning" size="14" color="#e6a23c"></u-icon>
					<text class="warn-text">{{ w }}</text>
				</view>
			</view>
		</template>

		<!-- ============ 预览态 ============ -->
		<template v-else>
			<!-- 模式切换 -->
			<view class="tt-card">
				<view class="tt-card-title">导入预览</view>
				<view class="chip-row">
					<view class="chip" :class="{ active: mode === 'merge' }" @click="onToggleMode('merge')">增量导入</view>
					<view class="chip" :class="{ active: mode === 'replace' }" @click="onToggleMode('replace')">覆盖导入</view>
				</view>
				<view class="form-tip">{{ modeTip }}</view>
				<view class="stats-line">
					共解析 {{ result.courses.length }} 门：新增 {{ groups.add.length }} · 更新 {{ groups.update.length }} · 不变 {{ groups.unchanged.length }}
				</view>
			</view>

			<!-- 解析警告 -->
			<view v-if="result.warnings.length" class="tt-card warn-card">
				<view class="tt-card-title">解析提示（{{ result.warnings.length }}）</view>
				<view v-for="(w, i) in result.warnings" :key="i" class="warn-row">
					<u-icon name="warning" size="14" color="#e6a23c"></u-icon>
					<text class="warn-text">{{ w }}</text>
				</view>
			</view>

			<!-- 节次时间表（可选应用） -->
			<view v-if="sectionsDiffer" class="tt-card">
				<view class="tt-card-title">节次时间表</view>
				<view class="sections-apply" @click="applySections = !applySections">
					<view class="row-check" :class="{ checked: applySections }">
						<text v-if="applySections">✓</text>
					</view>
					<view class="sections-main">
						<text class="sections-title">同时应用课表中的节次时间（{{ result.sections.length }} 节）</text>
						<text class="sections-preview">{{ sectionsPreview }}</text>
					</view>
				</view>
				<view class="form-tip">课表标注了节次时间，勾选后导入时一并写入（当前节次时间表将被替换）</view>
			</view>

			<!-- 三组列表 -->
			<view v-for="grp in ['add', 'update', 'unchanged']" :key="grp" class="tt-card" v-show="groups[grp].length">
				<view class="tt-card-title">
					<text class="grp-chip" :class="'grp-' + grp">{{ groupTitle[grp] }}</text>
					<text class="grp-count">{{ groups[grp].length }}</text>
				</view>

				<view
					v-for="(row, idx) in groups[grp]"
					:key="grp + idx"
					class="course-row"
					:class="{ 'row-conflict': isConflict(grp, idx) }"
				>
					<!-- 勾选框（不变组为被动成员，不可勾选） -->
					<view
						v-if="grp !== 'unchanged'"
						class="row-check"
						:class="{ checked: !isExcluded(grp, idx) }"
						@click="toggleExclude(grp, idx)"
					>
						<text v-if="!isExcluded(grp, idx)">✓</text>
					</view>
					<view class="row-main">
						<view class="row-name-line">
							<view class="color-dot" :style="{ backgroundColor: rowColor(grp, row) }"></view>
							<text class="row-name">{{ rowName(grp, row) }}</text>
							<text v-if="isConflict(grp, idx)" class="badge-conflict">冲突</text>
						</view>
						<text class="row-sub">{{ rowInfo(grp, row) }}</text>
						<text v-if="grp === 'update'" class="row-diff">变更：{{ rowDiff(row) }}</text>
					</view>
				</view>
			</view>

			<!-- 底部操作 -->
			<view class="footer-bar">
				<view class="btn btn-plain" @click="onBack">取消</view>
				<view class="btn btn-primary" :class="{ disabled: !canConfirm }" @click="onConfirm">确认导入</view>
			</view>
		</template>
	</view>
</template>

<script setup>
/**
 * import.vue —— P3 模式B 导入页（多模态 AI 识别路径）
 *
 * 流程：复制提示词 → 截图发给 AI → 粘贴 AI 返回的 JSON → 解析预览 →
 * 三组（新增/更新/不变）+ 冲突标红 + 勾选排除 → 增量/覆盖导入。
 * 导入前自动备份（设置页可撤销）；解析纯函数见 utils/parser.js。
 */
import { ref, reactive, computed } from 'vue';
import { useData } from '../../store/useData.js';
import { parseTimetable } from '../../utils/parser.js';
import { matchIncremental, findConflicts, courseKey } from '../../utils/importMatch.js';
import { WEEKDAY_NAMES } from '../../utils/time.js';
import { describeWeeks } from '../../utils/weeksPattern.js';

const { data, importCourses } = useData();

/** 标准提示词（通用，不含任何学校信息） */
const AI_PROMPT =
	'请识别这张课表图片，输出严格的 JSON（不要任何解释文字）。凡规则 6、7 要求提问的情形，必须先向用户提问并等待回答，未收到回答前禁止输出 JSON：\n' +
	'{"courses":[{"name":"课程名","teacher":"教师","classroom":"教室","weekday":1,"startSection":1,"endSection":2,"weeks":"1-16"}],"sections":[{"section":1,"startTime":"08:30","endTime":"09:15"}]}\n\n' +
	'规则：\n' +
	'1. weekday 用数字：1=周一，2=周二，3=周三，4=周四，5=周五，6=周六，7=周日\n' +
	'2. 节次用小节编号；若课表按"大节"标注（如第一大节=第01-02小节），请换算：第一大节 startSection=1,endSection=2，第二大节 3-4，第三大节 5-6，第四大节 7-8，第五大节 9-10，以此类推\n' +
	'3. weeks 取值："all" 每周；"odd" 单周；"even" 双周；区间如 "1-16"、"5-8"；**区间+单双周如 "1-16双周"、"5-8单周"**（图片标注了周次范围又标注单双周时用此写法）；不连续列表直接逗号分隔如 "2,4,6,8"；图片未标注周次用 "all"\n' +
	'4. 同一门课同一节次在不同周次有不同教室（隔周轮换）时，拆成多条课程，分别写各自的 weeks 与 classroom\n' +
	'5. 空白格忽略；教师/教室未标注用 ""；课程名保留括号内原文\n' +
	'6. 节次时间以图片为准：读取课表左侧时间列的起止时间标注，逐条照原样输出到 sections，不得按固定时长（如 40/45 分钟）推算、均分或臆测（各校各学期每节课时长与课间安排不同）。左侧按每小节标注了起止时间（如"第1节 08:30-09:15、第2节 09:20-10:05"）就逐节照抄起止时间；左侧每小节只标注开始时间、没有结束时间时，必须向用户提问确认每小节的结束时间（如"每节课时长是多少分钟？"），未收到回答前禁止输出 JSON；左侧只按"大节"标注（如"第一大节 08:30-10:00"）时，必须向用户提问并等待回答，未收到回答前禁止输出 JSON：问"按大节时间原样写入（第1、2节均记 08:30-10:00），还是提供每小节精确起止时间？"——用户提供每小节课长与课间（如"每小节 45 分钟、课间 10 分钟"）就据此逐小节照抄；用户明确选择按大节原样写，就把该大节时间原样写到属于它的每个小节：section 1: 08:30-10:00、section 2: 08:30-10:00，第二大节同理写 section 3、section 4，依此类推（不拆分不猜测）；图片未标注任何时间则 "sections":[]\n' +
	'7. 图片信息不清时禁止自行猜测，必须先向用户提问确认并等待回答，未收到回答前禁止输出 JSON。例如：周次、教室、教师看不清（问"XX 课的周次/教室/教师是什么？"）；课程名被截断或缩写（问"XX 课的全名是什么？"）\n' +
	'8. 用户确认后：只输出 JSON，可包在 ```json 代码块内，不要附加解释文字\n' +
	'\n（本任务建议在深度思考/推理模式下完成，识别与提问会更准确）';

const source = ref('');
const preview = ref(false);
const result = ref(null); // parseTimetable 结果
const inputWarnings = ref([]);
const mode = ref('merge');
/** 被勾选排除的课程：key = `${组名}${下标}` */
const excluded = reactive({});
/** 是否同时应用解析出的节次时间表（默认勾选，AI 返回了时间即可直接生效） */
const applySections = ref(true);

const groupTitle = { add: '新增', update: '更新', unchanged: '不变' };

/* ==================== 解析 ==================== */

function onParse() {
	if (!source.value.trim()) {
		uni.showToast({ title: '请先粘贴 AI 返回的 JSON', icon: 'none' });
		return;
	}
	const r = parseTimetable(source.value);
	result.value = r;
	Object.keys(excluded).forEach((k) => delete excluded[k]);
	applySections.value = true;
	if (r.courses.length === 0) {
		inputWarnings.value = r.warnings;
		preview.value = false;
		return;
	}
	inputWarnings.value = [];
	preview.value = true;
}

function onCopyPrompt() {
	uni.setClipboardData({
		data: AI_PROMPT,
		success: () => uni.showToast({ title: '提示词已复制', icon: 'success' }),
	});
}

/* ==================== 预览分组 ==================== */

const groups = computed(() => {
	if (!result.value) return { add: [], update: [], unchanged: [] };
	if (mode.value === 'replace') {
		return { add: result.value.courses, update: [], unchanged: [] };
	}
	return matchIncremental(result.value.courses, data.courses);
});

const modeTip = computed(() =>
	mode.value === 'merge'
		? '增量导入：与现有课程按「名称+星期+开始节次」匹配，命中更新、未命中新增，其余课程保留'
		: '覆盖导入：用勾选的解析结果替换全部课程（学期配置、假期、调休保留）'
);

/** 解析到的节次时间表与当前配置是否不同（不同才显示勾选卡） */
const sectionsDiffer = computed(() => {
	const s = result.value?.sections;
	if (!s || s.length === 0) return false;
	const cur = data.config.sections || [];
	if (cur.length !== s.length) return true;
	return s.some((x, i) => x.startTime !== cur[i].startTime || x.endTime !== cur[i].endTime);
});

const sectionsPreview = computed(() => {
	const s = result.value?.sections || [];
	return s.slice(0, 4).map((x) => `${x.section}:${x.startTime}-${x.endTime}`).join(' · ') + (s.length > 4 ? ' …' : '');
});

/* ==================== 勾选与冲突 ==================== */

const isExcluded = (grp, idx) => !!excluded[grp + idx];

function toggleExclude(grp, idx) {
	const key = grp + idx;
	excluded[key] = !excluded[key];
}

/** 参与冲突检测的最终课程集（勾选排除后重算）：merge 含现有课程（排除被更新的旧版本），replace 仅勾选解析课程 */
const conflictList = computed(() => {
	if (!result.value) return [];
	const incoming = [];
	groups.value.add.forEach((c, idx) => {
		if (!isExcluded('add', idx)) incoming.push(c);
	});
	groups.value.update.forEach((u, idx) => {
		if (!isExcluded('update', idx)) incoming.push(u.parsed);
	});
	if (mode.value === 'merge') {
		const updateIds = new Set(groups.value.update.map((u) => u.existing.id));
		return [...data.courses.filter((c) => !updateIds.has(c.id)), ...incoming];
	}
	return incoming;
});

const conflictGroups = computed(() => findConflicts(conflictList.value));

/** 该行代表课程是否在某个冲突组中（按对象同一性） */
function isConflict(grp, idx) {
	const row = groups.value[grp][idx];
	if (!row) return false;
	const obj = grp === 'unchanged' ? row.existing : grp === 'update' ? row.parsed : row;
	return conflictGroups.value.some((g) => g.includes(obj));
}

/* ==================== 行展示 ==================== */

/** 行代表课程对象：add 组的行即课程本身；update/unchanged 组为 {parsed, existing} */
const rowCourse = (grp, row) => (grp === 'add' ? row : grp === 'unchanged' ? row.existing : row.parsed);
const rowName = (grp, row) => rowCourse(grp, row).name;

function rowInfo(grp, row) {
	const c = rowCourse(grp, row);
	return `${WEEKDAY_NAMES[c.weekday - 1]} 第${c.startSection}-${c.endSection}节 · ${c.teacher || '无教师'} · ${c.classroom || '无教室'} · ${describeWeeks(c.weeks)}`;
}

function rowColor(grp, row) {
	return rowCourse(grp, row).color || '#409eff';
}

const FIELD_LABELS = { name: '名称', teacher: '教师', classroom: '教室', weekday: '星期', startSection: '节次', endSection: '节次', weeks: '周次' };

function rowDiff(row) {
	const labels = [];
	if (row.parsed.name !== row.existing.name) labels.push(FIELD_LABELS.name);
	if (row.parsed.teacher !== row.existing.teacher) labels.push(FIELD_LABELS.teacher);
	if (row.parsed.classroom !== row.existing.classroom) labels.push(FIELD_LABELS.classroom);
	if (row.parsed.weekday !== row.existing.weekday) labels.push(FIELD_LABELS.weekday);
	if (row.parsed.startSection !== row.existing.startSection || row.parsed.endSection !== row.existing.endSection) labels.push(FIELD_LABELS.startSection);
	if (row.parsed.weeks !== row.existing.weeks) labels.push(FIELD_LABELS.weeks);
	return labels.join('、') || '无实质变更';
}

/* ==================== 提交 ==================== */

const checkedCount = computed(() => {
	let n = 0;
	groups.value.add.forEach((_, idx) => { if (!isExcluded('add', idx)) n++; });
	groups.value.update.forEach((_, idx) => { if (!isExcluded('update', idx)) n++; });
	return n;
});

const canConfirm = computed(() => checkedCount.value > 0);

function onToggleMode(m) {
	if (mode.value === m) return;
	mode.value = m;
	Object.keys(excluded).forEach((k) => delete excluded[k]);
}

function onBack() {
	preview.value = false;
}

function onConfirm() {
	if (!canConfirm.value) return;
	const incoming = [];
	groups.value.add.forEach((c, idx) => {
		if (!isExcluded('add', idx)) incoming.push(c);
	});
	groups.value.update.forEach((u, idx) => {
		if (!isExcluded('update', idx)) incoming.push(u.parsed);
	});
	const isMerge = mode.value === 'merge';
	const useSections = applySections.value && sectionsDiffer.value;
	uni.showModal({
		title: isMerge ? '增量导入' : '覆盖导入',
		content: isMerge
			? `将新增/更新 ${incoming.length} 门课程（其余课程保留）${useSections ? '，并应用课表中的节次时间表' : ''}，自动补齐官方假期。导入前自动备份，可在设置页「撤销导入」。`
			: `将以解析结果替换全部课程（当前 ${data.courses.length} 门将被移除；学期配置、假期、调休保留）${useSections ? '，并应用课表中的节次时间表' : ''}，自动补齐官方假期。导入前自动备份，可在设置页「撤销导入」。`,
		confirmColor: isMerge ? '#409eff' : '#f56c6c',
		success: (res) => {
			if (!res.confirm) return;
			const r = importCourses(incoming, mode.value, {
				sections: useSections ? result.value.sections : undefined,
			});
			if (!r.ok) {
				uni.showToast({ title: r.error || '导入失败', icon: 'none', duration: 2500 });
				return;
			}
			const extra = r.holidaysAdded > 0 ? `，自动补齐假期 ${r.holidaysAdded} 天` : '';
			uni.showToast({ title: `导入成功：新增${r.added} 更新${r.updated}${extra}`, icon: 'success', duration: 2500 });
			setTimeout(() => uni.navigateBack(), 900);
		},
	});
}
</script>

<style lang="scss" scoped>
.import-page {
	padding: 24rpx 24rpx 60rpx;
}

.ai-steps {
	display: flex;
	flex-direction: column;
	gap: 8rpx;
	font-size: 24rpx;
	color: #606266;
	line-height: 1.5;
}

.prompt-box {
	margin-top: 20rpx;
	height: 220rpx;
	background: #f5f7fa;
	border-radius: 12rpx;
	padding: 20rpx;
	box-sizing: border-box;

	.prompt-text {
		font-size: 22rpx;
		color: #606266;
		line-height: 1.5;
		word-break: break-all;
	}
}

.prompt-actions {
	margin-top: 20rpx;
}

.parse-actions {
	margin-top: 20rpx;
	display: flex;

	.btn-mini.disabled {
		opacity: 0.5;
	}
}

.paste-area {
	width: 100%;
	height: 320rpx;
	background: #f5f7fa;
	border-radius: 12rpx;
	padding: 20rpx;
	font-size: 22rpx;
	color: #303133;
	box-sizing: border-box;
	line-height: 1.5;
}

.form-tip {
	font-size: 22rpx;
	color: #909399;
	margin-top: 12rpx;
	line-height: 1.5;
}

/* 小按钮（与设置页一致） */
.btn-mini {
	padding: 14rpx 32rpx;
	border-radius: 34rpx;
	font-size: 26rpx;
	background: #f5f7fa;
	color: #606266;
	display: inline-flex;
	align-items: center;
	justify-content: center;

	&:active {
		opacity: 0.85;
	}

	&.btn-primary {
		background: #409eff;
		color: #ffffff;
	}

	&.btn-plain {
		background: #ecf5ff;
		color: #409eff;
	}
}

/* 警告卡片 */
.warn-card {
	.warn-row {
		display: flex;
		align-items: flex-start;
		gap: 8rpx;
		padding: 8rpx 0;

		.warn-text {
			font-size: 22rpx;
			color: #e6a23c;
			line-height: 1.5;
			flex: 1;
		}
	}
}

/* 模式 chips */
.chip-row {
	display: flex;
	gap: 16rpx;
	margin-top: 16rpx;

	.chip {
		padding: 10rpx 32rpx;
		border-radius: 34rpx;
		background: #f5f7fa;
		color: #606266;
		font-size: 26rpx;

		&.active {
			background: #409eff;
			color: #ffffff;
		}
	}
}

.stats-line {
	margin-top: 16rpx;
	font-size: 24rpx;
	color: #303133;
}

/* 节次时间表勾选 */
.sections-apply {
	display: flex;
	align-items: flex-start;
	gap: 16rpx;
	padding: 16rpx 0;

	.sections-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8rpx;
	}

	.sections-title {
		font-size: 26rpx;
		font-weight: 600;
		color: #303133;
	}

	.sections-preview {
		font-size: 22rpx;
		color: #909399;
		line-height: 1.5;
	}
}

/* 分组 */
.grp-chip {
	font-size: 26rpx;
	font-weight: 600;
	padding: 4rpx 20rpx;
	border-radius: 24rpx;
	color: #ffffff;
}

.grp-add {
	background: #67c23a;
}

.grp-update {
	background: #409eff;
}

.grp-unchanged {
	background: #909399;
}

.grp-count {
	margin-left: 12rpx;
	font-size: 24rpx;
	color: #909399;
	font-weight: 400;
}

/* 课程行 */
.course-row {
	display: flex;
	align-items: flex-start;
	gap: 16rpx;
	padding: 20rpx 12rpx;
	border-bottom: 1rpx solid #f5f7fa;
	border-left: 6rpx solid transparent;

	&.row-conflict {
		border-left-color: #f56c6c;
		background: #fef0f0;
	}

	.row-check {
		width: 36rpx;
		height: 36rpx;
		border-radius: 50%;
		border: 2rpx solid #dcdfe6;
		background: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 4rpx;

		text {
			font-size: 24rpx;
			color: #ffffff;
		}

		&.checked {
			background: #409eff;
			border-color: #409eff;
		}
	}

	.row-main {
		flex: 1;
		min-width: 0;
	}

	.row-name-line {
		display: flex;
		align-items: center;
		gap: 10rpx;

		.color-dot {
			width: 16rpx;
			height: 16rpx;
			border-radius: 50%;
			flex-shrink: 0;
		}

		.row-name {
			font-size: 28rpx;
			font-weight: 600;
			color: #303133;
		}

		.badge-conflict {
			font-size: 20rpx;
			color: #ffffff;
			background: #f56c6c;
			border-radius: 6rpx;
			padding: 2rpx 12rpx;
		}
	}

	.row-sub {
		display: block;
		margin-top: 8rpx;
		font-size: 22rpx;
		color: #909399;
		line-height: 1.5;
	}

	.row-diff {
		display: block;
		margin-top: 6rpx;
		font-size: 22rpx;
		color: #e6a23c;
	}
}

/* 底部操作栏 */
.footer-bar {
	display: flex;
	gap: 20rpx;
	margin-top: 32rpx;

	.btn {
		flex: 1;
		height: 84rpx;
		border-radius: 42rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 28rpx;
		font-weight: 600;

		&.btn-primary {
			background: #409eff;
			color: #ffffff;
		}

		&.btn-plain {
			background: #f5f7fa;
			color: #606266;
		}

		&.disabled {
			opacity: 0.5;
		}
	}
}

.ph {
	color: #c0c4cc;
}
</style>
