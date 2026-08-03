// 仅允许应用已审核的 HTTPS 外部站点，避免渲染层借新窗口跳转任意协议或域名。
const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'grsai.ai',
  'www.grsai.ai',
]);

function isAllowedExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.port === ''
      && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

module.exports = {
  ALLOWED_EXTERNAL_HOSTS,
  isAllowedExternalUrl,
};
