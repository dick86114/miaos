// 仅允许应用已审核的 HTTPS 外部站点，避免渲染层借新窗口跳转任意协议或域名。
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'grsai.ai',
  'www.grsai.ai',
]);

// 原始 authority 必须是严格的小写 ASCII 标准形式。先检查原始值，避免 URL 规范化放行大小写、IDN、百分号或显式端口变体。
const ALLOWED_EXTERNAL_URL_PREFIX = /^https:\/\/(github\.com|www\.github\.com|grsai\.ai|www\.grsai\.ai)(?=\/|\?|#|$)/;
// shell.openExternal 会自行规范化 URL；解析前必须拒绝 Unicode White_Space、BOM 与 ASCII 控制字符，避免原始值与实际打开目标不一致。
const DISALLOWED_RAW_URL_CHARACTERS = /[\p{White_Space}\uFEFF\x00-\x1F\x7F]/u;

function isAllowedExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || DISALLOWED_RAW_URL_CHARACTERS.test(value)) return false;

  const prefix = value.match(ALLOWED_EXTERNAL_URL_PREFIX);
  if (!prefix) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && url.hostname === prefix[1]
      && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  ALLOWED_EXTERNAL_HOSTS,
  isAllowedExternalUrl,
};
