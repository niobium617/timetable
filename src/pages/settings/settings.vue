<template>
	<view class="settings-page">
		<!-- ============ 学校与学期 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">学校与学期</view>
			<view class="tt-form-item">
				<text class="tt-form-label">学校名称</text>
				<input class="tt-form-input" v-model="config.schoolName" placeholder="仅展示用" @blur="saveConfig()" />
			</view>
			<view class="tt-form-item">
				<text class="tt-form-label">学期名称</text>
				<input class="tt-form-input" v-model="config.termName" placeholder="如 2026-2027学年第一学期" @blur="saveConfig()" />
			</view>
		</view>

		<!-- ============ 学期配置 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">学期配置</view>

			<view class="tt-form-item">
				<text class="tt-form-label">学期起始日</text>
				<picker mode="date" :value="config.termStartDate" @change="onTermStartChange">
					<view class="tt-form-value picker-link">
						<text>{{ config.termStartDate || '未设置' }}</text>
						<u-icon name="arrow-right" size="14" color="#c0c4cc"></u-icon>
					</view>
				</picker>
			</view>
			<view class="form-tip">第一周周一，保存时校验（周号恒从这一天起每7天一周）</view>

			<view class="tt-form-item">
				<text class="tt-form-label">第一周为</text>
				<view class="chip-row">
					<view
						class="chip"
						:class="{ active: config.firstWeekType === 'odd' }"
						@click="setFirstWeek('odd')"
					>单周</view>
					<view
						class="chip"
						:class="{ active: config.firstWeekType === 'even' }"
						@click="setFirstWeek('even')"
					>双周</view>
				</view>
			</view>

			<view class="tt-form-item">
				<text class="tt-form-label">每周起始日</text>
				<view class="chip-row">
					<view
						class="chip"
						:class="{ active: config.weekStartDay === 1 }"
						@click="setWeekStart(1)"
					>周一</view>
					<view
						class="chip"
						:class="{ active: config.weekStartDay === 0 }"
						@click="setWeekStart(0)"
					>周日</view>
				</view>
			</view>
			<view class="form-tip">仅影响课表列顺序与月历起始列，不影响周号计算</view>

			<view class="tt-form-item">
				<text class="tt-form-label">手动周次</text>
				<view class="manual-row">
					<switch
						:checked="isManual"
						color="#409eff"
						style="transform: scale(0.8)"
						@change="onManualSwitch"
					/>
					<picker v-if="isManual" mode="selector" :range="weekRange" :value="(config.manualWeek || 1) - 1" @change="onManualWeekChange">
						<view class="picker-link manual-picker">
							<text>第 {{ config.manualWeek || 1 }} 周</text>
							<u-icon name="arrow-down" size="14" color="#c0c4cc"></u-icon>
						</view>
					</picker>
				</view>
			</view>
			<view class="form-tip">
				{{ isManual ? `已强制为第 ${config.manualWeek} 周，单双周随之计算` : `自动计算：今天为第 ${todayWeek.weekNum} 周（${todayWeek.isOddWeek ? '单周' : '双周'}）` }}
			</view>
		</view>

		<!-- ============ 节次时间表 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">节次时间表</view>
			<view v-for="(s, i) in draftSections" :key="s.key" class="section-row">
				<text class="section-num">{{ i + 1 }}</text>
				<picker mode="time" :value="s.startTime" @change="(e) => onSectionTime(i, 'startTime', e.detail.value)">
					<view class="time-box">{{ s.startTime }}</view>
				</picker>
				<text class="section-sep">-</text>
				<picker mode="time" :value="s.endTime" @change="(e) => onSectionTime(i, 'endTime', e.detail.value)">
					<view class="time-box">{{ s.endTime }}</view>
				</picker>
				<view class="section-del" @click="removeSection(i)">
					<u-icon name="trash" size="18" color="#f56c6c"></u-icon>
				</view>
			</view>
			<view class="section-actions">
				<view class="btn-mini" @click="addSection">＋ 添加一节</view>
				<view class="btn-mini btn-primary" @click="commitSections">保存节次表</view>
			</view>
			<view class="form-tip">节次表影响课程"第几节"与当前节次参考线</view>
		</view>

		<!-- ============ 假期管理 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">假期管理</view>
			<view v-if="data.holidays.length === 0" class="tt-empty">暂无假期</view>
			<view v-for="h in holidayList" :key="h.date" class="list-row">
				<view class="list-main">
					<text class="list-title">{{ h.name }}</text>
					<text class="list-sub">{{ h.date }}</text>
				</view>
				<view class="list-del" @click="onDeleteHoliday(h)">
					<u-icon name="trash" size="18" color="#c0c4cc"></u-icon>
				</view>
			</view>
			<view v-if="data.holidays.length > LIST_LIMIT" class="list-toggle" @click="holidayExpanded = !holidayExpanded">
				<text>{{ holidayExpanded ? '收起' : `展开全部（${data.holidays.length} 天）` }}</text>
				<u-icon :name="holidayExpanded ? 'arrow-up' : 'arrow-down'" size="12" color="#909399"></u-icon>
			</view>

			<view class="add-form">
				<picker mode="date" :value="holidayForm.start" @change="(e) => (holidayForm.start = e.detail.value)">
					<view class="time-box">{{ holidayForm.start || '开始日期' }}</view>
				</picker>
				<view class="range-toggle" @click="holidayForm.range = !holidayForm.range">
					<text :class="{ on: holidayForm.range }">{{ holidayForm.range ? '批量范围' : '单日' }}</text>
					<u-icon name="arrow-down" size="12" :color="holidayForm.range ? '#409eff' : '#909399'"></u-icon>
				</view>
				<picker v-if="holidayForm.range" mode="date" :value="holidayForm.end || holidayForm.start" @change="(e) => (holidayForm.end = e.detail.value)">
					<view class="time-box">{{ holidayForm.end || '结束日期' }}</view>
				</picker>
				<input class="mini-input" v-model="holidayForm.name" placeholder="名称" />
				<view class="btn-mini btn-primary" @click="onAddHoliday">添加</view>
			</view>
			<view class="form-tip">假期当天完全不显示课程（即使同时是调休，假期优先）</view>
			<view v-for="y in officialYears" :key="'hol' + y" class="btn-mini btn-plain official-btn" @click="onAddOfficialHolidays(y)">
				一键添加 {{ y }} 官方假期（{{ OFFICIAL_HOLIDAYS[y].length }} 天）
			</view>
		</view>

		<!-- ============ 调休管理 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">调休管理</view>
			<view v-if="data.adjustments.length === 0" class="tt-empty">暂无调休</view>
			<view v-for="a in adjustList" :key="a.date" class="list-row">
				<view class="list-main">
					<text class="list-title">{{ a.date }} 补{{ weekdayName(a.targetWeekday) }}的课</text>
					<text class="list-sub">{{ a.remark || '调休' }}</text>
				</view>
				<view class="list-del" @click="onDeleteAdjustment(a)">
					<u-icon name="trash" size="18" color="#c0c4cc"></u-icon>
				</view>
			</view>
			<view v-if="data.adjustments.length > LIST_LIMIT" class="list-toggle" @click="adjustExpanded = !adjustExpanded">
				<text>{{ adjustExpanded ? '收起' : `展开全部（${data.adjustments.length} 条）` }}</text>
				<u-icon :name="adjustExpanded ? 'arrow-up' : 'arrow-down'" size="12" color="#909399"></u-icon>
			</view>

			<view class="add-form">
				<picker mode="date" :value="adjustForm.date" @change="onAdjustDateChange">
					<view class="time-box">{{ adjustForm.date || '调休日期' }}</view>
				</picker>
				<picker mode="selector" :range="WEEKDAY_NAMES" :value="adjustForm.weekday - 1" @change="onAdjustWeekdayChange">
					<view class="time-box">{{ weekdayName(adjustForm.weekday) }}</view>
				</picker>
				<input class="mini-input" v-model="adjustForm.remark" placeholder="备注，如补周一的课" />
				<view class="btn-mini btn-primary" @click="onAddAdjustment">添加</view>
			</view>
			<view v-if="adjustHint" class="form-tip adjust-hint">{{ adjustHint }}</view>
			<view class="form-tip">调休当天按目标星期的课表上课，单双周/周段用当天周号过滤</view>
			<view v-for="y in officialYears" :key="'adj' + y" class="btn-mini btn-plain official-btn" @click="onAddOfficialAdjustments(y)">
				一键添加 {{ y }} 官方调休上班日（{{ (OFFICIAL_ADJUSTMENTS[y] || []).length }} 天）
			</view>
		</view>

		<!-- ============ 课表导入 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">课表导入</view>
			<view class="import-entry" @click="goImport">
				<view class="import-entry-main">
					<text class="import-entry-title">多模态 AI 识别导入</text>
					<text class="import-entry-sub">内置提示词：截图课表发给 AI，粘贴返回的 JSON 即可导入</text>
				</view>
				<u-icon name="arrow-right" size="14" color="#c0c4cc"></u-icon>
			</view>
			<view class="form-tip">模式A 服务器一键导入：开发中；本入口为当前可用方式</view>
		</view>

		<!-- ============ 数据管理 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">数据管理</view>
			<view class="data-actions">
				<view class="btn-mini btn-plain" @click="onExport">导出备份</view>
				<view class="btn-mini btn-plain" @click="openImport">导入备份</view>
				<view class="btn-mini btn-plain" @click="onUndo">撤销导入</view>
				<view class="btn-mini btn-danger" @click="onResetDemo">恢复示例</view>
			</view>
			<view class="form-tip">数据仅保存在本机；导入前会自动备份当前数据，可撤销</view>
		</view>

		<!-- ============ 关于 ============ -->
		<view class="tt-card">
			<view class="tt-card-title">关于</view>
			<view class="about-row">
				<text class="about-label">数据版本</text>
				<text class="about-value">v{{ data.version }}</text>
			</view>
			<view class="about-row">
				<text class="about-label">数据统计</text>
				<text class="about-value">{{ stats }}</text>
			</view>
			<view class="about-row">
				<text class="about-label">存储位置</text>
				<text class="about-value">本机本地</text>
			</view>
			<view class="about-row">
				<text class="about-label">隐私</text>
				<text class="about-value">无账号体系，数据不出设备</text>
			</view>
		</view>

		<!-- ============ 导出弹窗 ============ -->
		<u-popup :show="exportShow" mode="bottom" :round="24" safe-area-inset-bottom @close="exportShow = false">
			<view class="io-popup">
				<view class="io-header">
					<text class="io-title">导出备份</text>
					<view class="io-close" @click="exportShow = false">
						<u-icon name="close" size="20" color="#909399"></u-icon>
					</view>
				</view>
				<textarea class="io-textarea" :value="exportText" disabled></textarea>
				<view class="io-footer">
					<view class="btn btn-primary" @click="onCopyExport">复制全部</view>
				</view>
			</view>
		</u-popup>

		<!-- ============ 导入弹窗 ============ -->
		<u-popup :show="importShow" mode="bottom" :round="24" safe-area-inset-bottom @close="importShow = false">
			<view class="io-popup">
				<view class="io-header">
					<text class="io-title">导入备份</text>
					<view class="io-close" @click="importShow = false">
						<u-icon name="close" size="20" color="#909399"></u-icon>
					</view>
				</view>
				<textarea class="io-textarea" v-model="importText" placeholder="在此粘贴导出的 JSON 数据" placeholder-class="ph"></textarea>
				<view class="io-footer">
					<view class="btn btn-plain" @click="importShow = false">取消</view>
					<view class="btn btn-primary" @click="onImport">导入（覆盖当前数据）</view>
				</view>
			</view>
		</u-popup>
	</view>
</template>

<script setup>
/**
 * settings —— 设置页（设置 Tab）
 * - 学校/学期信息、学期配置（起始日校验周一、首周单双、周起始日、手动周次）
 * - 节次时间表编辑
 * - 假期（单日/范围批量）、调休（与假期冲突检测）
 * - 数据备份导出/导入（自动备份+可撤销）、恢复示例
 */
import { ref, reactive, computed } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useData } from '../../store/useData.js';
import { getDisplayWeekInfo } from '../../utils/week.js';
import { WEEKDAY_NAMES, parseDate, formatDate, addDays, todayStr, diffDays, getWeekday } from '../../utils/time.js';
import { suggestAdjustWeekday } from '../../utils/holiday.js';
import { OFFICIAL_HOLIDAYS, OFFICIAL_ADJUSTMENTS, getOfficialYears } from '../../utils/officialHolidays.js';

// 每次进入页面时同步本地草稿（如导入/重置后返回）
onShow(() => {
	syncLocalState();
});

const {
	data,
	updateConfig,
	updateSections,
	addHolidays,
	deleteHoliday,
	addAdjustment,
	deleteAdjustment,
	exportData,
	importData,
	undoImport,
	resetDemo,
} = useData();

/** 配置字段的双向绑定代理（修改后统一 saveConfig） */
const config = reactive({
	schoolName: data.config.schoolName,
	termName: data.config.termName,
	termStartDate: data.config.termStartDate,
	firstWeekType: data.config.firstWeekType,
	weekStartDay: data.config.weekStartDay,
	manualWeek: data.config.manualWeek,
});
const isManual = computed(() => config.manualWeek != null);

/** 导入/重置后全局数据被整体替换，本地草稿需重新同步 */
function syncLocalState() {
	config.schoolName = data.config.schoolName;
	config.termName = data.config.termName;
	config.termStartDate = data.config.termStartDate;
	config.firstWeekType = data.config.firstWeekType;
	config.weekStartDay = data.config.weekStartDay;
	config.manualWeek = data.config.manualWeek;
	draftSections.splice(
		0,
		draftSections.length,
		...data.config.sections.map((s) => ({ ...s, key: `s${s.section}_${Math.random().toString(36).slice(2, 6)}` }))
	);
}

function saveConfig() {
	updateConfig({
		schoolName: config.schoolName,
		termName: config.termName,
		termStartDate: config.termStartDate,
		firstWeekType: config.firstWeekType,
		weekStartDay: config.weekStartDay,
		manualWeek: config.manualWeek,
	});
}

/** 今天的教学周（自动计算展示；展示时周号下限为 1） */
const todayWeek = computed(() => getDisplayWeekInfo(todayStr(), data.config));

/* ---------- 学期起始日（必须为周一） ---------- */
function onTermStartChange(e) {
	const date = e.detail.value;
	const day = parseDate(date).getDay(); // 0=周日
	if (day !== 1) {
		const tip = day === 0 ? '周日' : WEEKDAY_NAMES[day - 1];
		uni.showToast({ title: `起始日必须为周一（当前为${tip}）`, icon: 'none', duration: 2500 });
		return;
	}
	config.termStartDate = date;
	saveConfig();
	uni.showToast({ title: '已保存', icon: 'success' });
}

/* ---------- 首周单双 / 周起始日 ---------- */
function setFirstWeek(type) {
	config.firstWeekType = type;
	saveConfig();
}

function setWeekStart(day) {
	config.weekStartDay = day;
	saveConfig();
}

/* ---------- 手动周次 ---------- */
const weekRange = Array.from({ length: 30 }, (_, i) => `第 ${i + 1} 周`);

function onManualSwitch(e) {
	config.manualWeek = e.detail.value ? (todayWeek.value.weekNum || 1) : null;
	saveConfig();
}

function onManualWeekChange(e) {
	config.manualWeek = Number(e.detail.value) + 1;
	saveConfig();
}

/* ---------- 节次时间表（本地草稿，保存时提交） ---------- */
const draftSections = reactive(
	data.config.sections.map((s) => ({ ...s, key: `s${s.section}_${Math.random().toString(36).slice(2, 6)}` }))
);

function onSectionTime(i, field, value) {
	draftSections[i][field] = value;
}

function addSection() {
	const next = draftSections.length + 1;
	draftSections.push({
		key: `s${next}_${Math.random().toString(36).slice(2, 6)}`,
		section: next,
		startTime: '08:00',
		endTime: '08:45',
	});
}

function removeSection(i) {
	if (draftSections.length <= 1) {
		uni.showToast({ title: '至少保留一节', icon: 'none' });
		return;
	}
	draftSections.splice(i, 1);
}

function commitSections() {
	for (const s of draftSections) {
		if (s.startTime >= s.endTime) {
			uni.showToast({ title: `第 ${draftSections.indexOf(s) + 1} 节时间不合法`, icon: 'none' });
			return;
		}
	}
	updateSections(
		draftSections.map((s, i) => ({ section: i + 1, startTime: s.startTime, endTime: s.endTime }))
	);
	uni.showToast({ title: '节次表已保存', icon: 'success' });
}

/* ---------- 假期 ---------- */
const holidayForm = reactive({ start: '', end: '', name: '', range: false });

function onAddHoliday() {
	if (!holidayForm.start) {
		uni.showToast({ title: '请选择日期', icon: 'none' });
		return;
	}
	let dates = [holidayForm.start];
	if (holidayForm.range && holidayForm.end) {
		const start = parseDate(holidayForm.start);
		const end = parseDate(holidayForm.end);
		if (end < start) {
			uni.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
			return;
		}
		if (diffDays(start, end) > 60) {
			uni.showToast({ title: '单次最多添加 60 天', icon: 'none' });
			return;
		}
		dates = [];
		for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
			dates.push(formatDate(d));
		}
	}
	const name = holidayForm.name.trim() || '假期';
	const added = addHolidays(dates, name);
	uni.showToast({ title: `已添加 ${added} 天假期`, icon: 'success' });
	holidayForm.start = '';
	holidayForm.end = '';
	holidayForm.name = '';
	holidayForm.range = false;
}

/** 一键添加官方假期（按年份，已存在的日期自动跳过） */
function onAddOfficialHolidays(year) {
	const list = OFFICIAL_HOLIDAYS[year] || [];
	const missing = list.filter((h) => !data.holidays.some((x) => x.date === h.date));
	if (missing.length === 0) {
		uni.showToast({ title: `${year} 官方假期已全部添加`, icon: 'none' });
		return;
	}
	uni.showModal({
		title: '添加官方假期',
		content: `将添加国务院公布的 ${year} 年官方假期（${missing.length} 天未添加，已添加的自动跳过）。`,
		confirmColor: '#409eff',
		success: (res) => {
			if (!res.confirm) return;
			missing.forEach((h) => addHolidays(h.date, h.name));
			uni.showToast({ title: `已添加 ${missing.length} 天假期`, icon: 'success' });
		},
	});
}

/** 一键添加官方调休上班日（按年份，补课星期官方未定义，按附近假期推算，请核对） */
function onAddOfficialAdjustments(year) {
	const list = OFFICIAL_ADJUSTMENTS[year] || [];
	const missing = list.filter((a) => !data.adjustments.some((x) => x.date === a.date));
	if (missing.length === 0) {
		uni.showToast({ title: `${year} 官方调休已全部添加`, icon: 'none' });
		return;
	}
	uni.showModal({
		title: '添加官方调休',
		content: `将添加 ${year} 年 ${missing.length} 个官方调休上班日，补课星期按附近假期自动推算，请按学校通知核对改选。`,
		confirmColor: '#409eff',
		success: (res) => {
			if (!res.confirm) return;
			let n = 0;
			missing.forEach((a) => {
				const sug = suggestAdjustWeekday(a.date, data.holidays);
				addAdjustment({
					date: a.date,
					targetWeekday: sug ? sug.weekday : getWeekday(a.date),
					remark: a.remark,
				});
				n++;
			});
			uni.showToast({ title: `已添加 ${n} 个调休上班日`, icon: 'success' });
		},
	});
}

function onDeleteHoliday(h) {
	uni.showModal({
		title: '删除假期',
		content: `删除 ${h.date}「${h.name}」？`,
		confirmColor: '#f56c6c',
		success: (res) => {
			if (res.confirm) deleteHoliday(h.date);
		},
	});
}

/* ---------- 调休 ---------- */
const adjustForm = reactive({ date: '', weekday: 1, remark: '' });
/** 已有官方节假日数据的年份（设置页按钮按此渲染） */
const officialYears = getOfficialYears();

/* ==================== 假期/调休列表折叠 ==================== */

/** 列表默认展示条数，超出折叠 */
const LIST_LIMIT = 5;
const holidayExpanded = ref(false);
const adjustExpanded = ref(false);
const holidayList = computed(() => (holidayExpanded.value ? data.holidays : data.holidays.slice(0, LIST_LIMIT)));
const adjustList = computed(() => (adjustExpanded.value ? data.adjustments : data.adjustments.slice(0, LIST_LIMIT)));
/** 调休建议提示（选日期后自动推算，见 suggestAdjustWeekday） */
const adjustHint = ref('');
const adjustSuggestion = ref(null);

function weekdayName(w) {
	return WEEKDAY_NAMES[(w || 1) - 1];
}

/** 选择调休日期：自动推算建议的补课星期（可改选，改选后提示不再显示建议来源） */
function onAdjustDateChange(e) {
	adjustForm.date = e.detail.value;
	const sug = suggestAdjustWeekday(adjustForm.date, data.holidays);
	adjustSuggestion.value = sug;
	const own = `${adjustForm.date} 是${weekdayName(getWeekday(adjustForm.date))}`;
	if (sug) {
		adjustForm.weekday = sug.weekday;
		adjustHint.value = `${own}；附近假期 ${sug.sourceDate}，已自动建议补${weekdayName(sug.weekday)}的课，可改选`;
	} else {
		adjustHint.value = `${own}；附近 21 天内没有假期记录，请按放假通知手动选择补课星期`;
	}
}

/** 手动改选补课星期：不再被自动建议覆盖 */
function onAdjustWeekdayChange(e) {
	adjustForm.weekday = Number(e.detail.value) + 1;
	if (adjustSuggestion.value) {
		adjustSuggestion.value = null;
		adjustHint.value = '已手动选择，按所选星期执行';
	}
}

function onAddAdjustment() {
	if (!adjustForm.date) {
		uni.showToast({ title: '请选择调休日期', icon: 'none' });
		return;
	}
	const date = adjustForm.date;
	// 与假期冲突检测（保存时提示，由用户决定）
	const conflict = data.holidays.some((h) => h.date === date);
	if (conflict) {
		uni.showModal({
			title: '与假期冲突',
			content: `${date} 已设为假期，假期优先，调休当天不会显示课程。仍要保存吗？`,
			confirmColor: '#e6a23c',
			success: (res) => {
				if (res.confirm) doAddAdjustment(date);
			},
		});
		return;
	}
	doAddAdjustment(date);
}

function doAddAdjustment(date) {
	addAdjustment({
		date,
		targetWeekday: adjustForm.weekday,
		remark: adjustForm.remark.trim() || `补${weekdayName(adjustForm.weekday)}的课`,
	});
	uni.showToast({ title: '已保存调休', icon: 'success' });
	adjustForm.date = '';
	adjustForm.weekday = 1;
	adjustForm.remark = '';
	adjustHint.value = '';
	adjustSuggestion.value = null;
}

function onDeleteAdjustment(a) {
	uni.showModal({
		title: '删除调休',
		content: `删除 ${a.date} 的调休规则？`,
		confirmColor: '#f56c6c',
		success: (res) => {
			if (res.confirm) deleteAdjustment(a.date);
		},
	});
}

/* ---------- 数据管理 ---------- */
const exportShow = ref(false);
const exportText = ref('');

function goImport() {
	uni.navigateTo({ url: '/pages/import/import' });
}

function onExport() {
	exportText.value = exportData();
	exportShow.value = true;
}

function onCopyExport() {
	uni.setClipboardData({
		data: exportText.value,
		success: () => uni.showToast({ title: '已复制到剪贴板', icon: 'success' }),
	});
}

const importShow = ref(false);
const importText = ref('');

function openImport() {
	importText.value = '';
	importShow.value = true;
}

function onImport() {
	if (!importText.value.trim()) {
		uni.showToast({ title: '请粘贴备份内容', icon: 'none' });
		return;
	}
	uni.showModal({
		title: '导入备份',
		content: '将覆盖当前全部数据（导入前会自动备份，可撤销）',
		confirmColor: '#409eff',
		success: (res) => {
			if (!res.confirm) return;
			const result = importData(importText.value);
			if (result.ok) {
				importShow.value = false;
				syncLocalState();
				uni.showToast({ title: '导入成功', icon: 'success' });
			} else {
				uni.showToast({ title: result.error || '导入失败', icon: 'none', duration: 2500 });
			}
		},
	});
}

function onUndo() {
	undoImport();
}

function onResetDemo() {
	uni.showModal({
		title: '恢复示例数据',
		content: '将清空当前数据并恢复为内置示例（当前数据会先自动备份）',
		confirmColor: '#f56c6c',
		success: (res) => {
			if (res.confirm) {
				resetDemo();
				syncLocalState();
			}
		},
	});
}

/* ---------- 关于 ---------- */
const stats = computed(() => {
	const d = data;
	return `课程 ${d.courses.length} 门 · 假期 ${d.holidays.length} 天 · 调休 ${d.adjustments.length} 条 · 节次 ${d.config.sections.length} 节`;
});
</script>

<style lang="scss" scoped>
.settings-page {
	padding-bottom: 60rpx;
}

.tt-form-input {
	flex: 1;
	text-align: right;
	font-size: 28rpx;
	color: #606266;
}

.form-tip {
	font-size: 22rpx;
	color: #c0c4cc;
	padding: 6rpx 0 16rpx;
	line-height: 1.5;
}

.picker-link {
	gap: 8rpx;
}

/* chips */
.chip-row {
	display: flex;
	gap: 16rpx;

	.chip {
		padding: 10rpx 28rpx;
		border-radius: 30rpx;
		background: #f5f7fa;
		font-size: 26rpx;
		color: #606266;

		&.active {
			background: #409eff;
			color: #ffffff;
		}
	}
}

/* 手动周次 */
.manual-row {
	display: flex;
	align-items: center;
	gap: 16rpx;

	.manual-picker {
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 20rpx;
		gap: 10rpx;
		justify-content: center;
	}
}

/* 节次表 */
.section-row {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 14rpx 0;

	.section-num {
		width: 44rpx;
		height: 44rpx;
		border-radius: 50%;
		background: #ecf5ff;
		color: #409eff;
		font-size: 24rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.time-box {
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 22rpx;
		font-size: 26rpx;
		color: #303133;
	}

	.section-sep {
		color: #909399;
	}

	.section-del {
		margin-left: auto;
		padding: 10rpx;
	}
}

.section-actions {
	display: flex;
	gap: 20rpx;
	margin-top: 20rpx;
}

/* 假期/调休列表 */
.list-row {
	display: flex;
	align-items: center;
	padding: 18rpx 0;
	border-bottom: 1rpx solid #f5f7fa;

	.list-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6rpx;

		.list-title {
			font-size: 28rpx;
			color: #303133;
		}

		.list-sub {
			font-size: 22rpx;
			color: #909399;
		}
	}

	.list-del {
		padding: 12rpx;
	}
}

/* 新增表单 */
.add-form {
	display: flex;
	align-items: center;
	gap: 12rpx;
	flex-wrap: wrap;
	margin-top: 20rpx;

	.time-box {
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 20rpx;
		font-size: 24rpx;
		color: #303133;
	}

	.range-toggle {
		display: flex;
		align-items: center;
		gap: 4rpx;
		font-size: 24rpx;
		color: #909399;

		.on {
			color: #409eff;
		}
	}

	.mini-input {
		background: #f5f7fa;
		border-radius: 10rpx;
		padding: 10rpx 20rpx;
		font-size: 24rpx;
		color: #303133;
		min-width: 120rpx;
		flex: 1;
	}
}

/* 通用小按钮 */
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

	&.btn-danger {
		background: #fef0f0;
		color: #f56c6c;
	}
}

/* 课表导入入口 */
.import-entry {
	display: flex;
	align-items: center;
	gap: 16rpx;
	padding: 20rpx 24rpx;
	background: #f5f7fa;
	border-radius: 12rpx;

	.import-entry-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6rpx;
	}

	.import-entry-title {
		font-size: 28rpx;
		font-weight: 600;
		color: #303133;
	}

	.import-entry-sub {
		font-size: 22rpx;
		color: #909399;
		line-height: 1.5;
	}

	&:active {
		background: #ecf5ff;
	}
}

.adjust-hint {
	color: #e6a23c;
}

.official-btn {
	margin-top: 16rpx;
}

/* 折叠切换 */
.list-toggle {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6rpx;
	padding: 16rpx 0 4rpx;
	font-size: 22rpx;
	color: #909399;

	&:active {
		opacity: 0.8;
	}
}

/* 数据管理 */
.data-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 16rpx;
}

/* 关于 */
.about-row {
	display: flex;
	justify-content: space-between;
	padding: 16rpx 0;
	border-bottom: 1rpx solid #f5f7fa;

	&:last-child {
		border-bottom: none;
	}

	.about-label {
		font-size: 26rpx;
		color: #909399;
	}

	.about-value {
		font-size: 26rpx;
		color: #303133;
	}
}

/* 导出/导入弹窗 */
.io-popup {
	background: #ffffff;
	border-radius: 24rpx 24rpx 0 0;
	padding: 32rpx;
	display: flex;
	flex-direction: column;

	.io-header {
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		margin-bottom: 24rpx;

		.io-title {
			font-size: 32rpx;
			font-weight: 600;
			color: #303133;
		}

		.io-close {
			position: absolute;
			right: 0;
			top: 0;
			padding: 4rpx;
		}
	}

	.io-textarea {
		width: 100%;
		height: 420rpx;
		background: #f5f7fa;
		border-radius: 12rpx;
		padding: 20rpx;
		font-size: 22rpx;
		color: #303133;
		box-sizing: border-box;
		line-height: 1.5;
	}

	.io-footer {
		display: flex;
		gap: 20rpx;
		margin-top: 24rpx;

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
		}
	}
}

.ph {
	color: #c0c4cc;
}
</style>
