/**
 * Electron 运行时安全开关。
 *
 * 默认配置面向受支持的 macOS 12+ Apple Silicon 环境：启用渲染器沙箱和硬件加速。
 * 仅为排查历史渲染器兼容问题保留显式的临时降级开关，不能以其他真值形式触发。
 */
function getRuntimeSecurityConfig(env = {}) {
  const hasLegacyRendererFlag = env !== null
    && typeof env === 'object'
    && Object.prototype.hasOwnProperty.call(env, 'MIAOS_LEGACY_RENDERER');
  const legacyMode = hasLegacyRendererFlag && env.MIAOS_LEGACY_RENDERER === '1';

  return {
    legacyMode,
    sandbox: !legacyMode,
    disableHardwareAcceleration: legacyMode,
    appendNoSandbox: legacyMode,
  };
}

module.exports = { getRuntimeSecurityConfig };
