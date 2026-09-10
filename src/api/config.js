/**
 * config.js —— 全局配置文件
 *
 * apiBaseUrl：模式A 后端导入接口地址（自有服务器）。
 * 部署后端后填入，例如 'https://your-server.example.com'
 * 留空时设置页的接口导入将提示"未配置服务器地址"。
 * 注意：仓库公开后请勿在此提交含真实服务器信息的配置。
 */
export const apiBaseUrl = '';

/**
 * cloudEnv：微信云开发环境 ID（云备份/云恢复用）。
 * 在微信开发者工具「云开发」控制台创建环境后，把环境 ID 写进仓库根目录的
 * .env.local（已 gitignore）：VITE_CLOUD_ENV=你的环境ID
 * 留空时点云备份会提示未配置。
 * 环境 ID 本身不是密钥，但公开仓库不提交它——安全性依赖云数据库安全规则
 * 「仅创建者可读写」隔离数据，任何时候都不要把云开发管理密钥放进仓库。
 */
export const cloudEnv = import.meta.env.VITE_CLOUD_ENV || '';
