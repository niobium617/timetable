/**
 * importApi.js —— 模式A：后端接口导入（方案优化版 第六节 API 契约）
 *
 * POST /api/import
 *   req : { school, studentId, password, captcha }
 *   ok  : { code: 0, data: { courses: [...], warnings: [...] } }
 *   err : { code: 1, message: '验证码错误 / 登录失败 / 课表为空' }
 *
 * data.courses 元素结构与前端 courses 一致（weeks/weekday/startSection 等）；
 * id 由前端生成，sourceKey 由后端给出（增量导入去重用）。
 * 后端不存储任何数据，凭据内存即用即弃（见 backend/ 规划，P3 实施）。
 */

import { apiBaseUrl } from './config.js';

/**
 * 调用后端导入接口
 * @param {{ school, studentId, password, captcha }} payload
 * @returns {Promise<{ ok: boolean, courses?: Array, warnings?: Array, error?: string }>}
 */
export function importFromServer(payload) {
	return new Promise((resolve) => {
		if (!apiBaseUrl) {
			resolve({ ok: false, error: '未配置服务器地址，请先在 src/api/config.js 填写' });
			return;
		}
		uni.request({
			url: `${apiBaseUrl}/api/import`,
			method: 'POST',
			data: payload,
			timeout: 30000,
			success: (res) => {
				const body = res.data || {};
				if (body.code === 0 && Array.isArray(body.data && body.data.courses)) {
					resolve({
						ok: true,
						courses: body.data.courses,
						warnings: body.data.warnings || [],
					});
				} else {
					resolve({ ok: false, error: body.message || '导入失败' });
				}
			},
			fail: () => {
				resolve({ ok: false, error: '网络请求失败，请检查服务器地址与网络' });
			},
		});
	});
}
