const GPT_IMAGE_QUALITY = {
  标准: 'low',
  高清: 'medium',
  超高清: 'high',
};

const GPT_IMAGE_RATIO_MODELS = new Set(['gpt-image-2']);
const GPT_IMAGE_PIXEL_SIZE_MODELS = new Set([
  'gpt-image-2-vip',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
]);

const NANO_ALL_RESOLUTIONS = new Set(['nano-banana-2', 'nano-banana-pro']);
const NANO_1K_ONLY = new Set([
  'nano-banana', 'nano-banana-fast', 'nano-banana-2-cl',
  'nano-banana-pro-cl', 'nano-banana-pro-vt',
]);
const NANO_2K_ONLY = new Set(['nano-banana-2-2k-cl']);
const NANO_4K_ONLY = new Set(['nano-banana-2-4k-cl', 'nano-banana-pro-4k-vip']);
const NANO_1K_2K = new Set(['nano-banana-pro-vip']);
const NANO_RESOLUTIONS = { 标准: '1K', 高清: '2K', 超高清: '4K' };

// Grsai 按模型族路由到不同端点；用户只需配置主机地址，路径由模型类型自动推导。
const NANO_BANANA_PATH = '/v1/draw/nano-banana';
const GPT_IMAGE_PATH = '/v1/draw/completions';
const DRAW_RESULT_PATH = '/v1/draw/result';

// GRSai 的 vip 模型将像素尺寸放在 aspectRatio，且 4K 正方形最大为 2880x2880。
const GPT_IMAGE_VIP_SIZES = {
  标准: { '1:1': '1024x1024', '4:3': '1152x864', '16:9': '1280x720', '9:16': '720x1280' },
  高清: { '1:1': '2048x2048', '4:3': '2304x1728', '16:9': '2048x1152', '9:16': '1152x2048' },
  超高清: { '1:1': '2880x2880', '4:3': '3264x2448', '16:9': '3840x2160', '9:16': '2160x3840' },
};

// 官方文档的完整 13 组比例；未列出长边时回退 1:1，避免把非法值传给上游。
Object.assign(GPT_IMAGE_VIP_SIZES['标准'], {
  '3:4': '864x1152', '3:2': '1536x1024', '2:3': '1024x1536',
  '5:4': '1120x896', '4:5': '896x1120', '21:9': '1456x624',
  '9:21': '624x1456', '1:2': '768x1536', '2:1': '1536x768',
});
Object.assign(GPT_IMAGE_VIP_SIZES['高清'], {
  '3:4': '1728x2304', '3:2': '2048x1360', '2:3': '1360x2048',
  '5:4': '2240x1792', '4:5': '1792x2240', '21:9': '2912x1248',
  '9:21': '1248x2912', '1:2': '1536x3072', '2:1': '3072x1536',
});
Object.assign(GPT_IMAGE_VIP_SIZES['超高清'], {
  '3:4': '2448x3264', '3:2': '3504x2336', '2:3': '2336x3504',
  '5:4': '3200x2560', '4:5': '2560x3200', '21:9': '3840x1648',
  '9:21': '1648x3840', '1:2': '1920x3840', '2:1': '3840x1920',
});

function buildGrsaiImageRequest({ model, prompt, ratio = '1:1', quality = '高清', sourceImage }) {
  const images = sourceImage ? [sourceImage] : [];
  if (GPT_IMAGE_RATIO_MODELS.has(model) || GPT_IMAGE_PIXEL_SIZE_MODELS.has(model)) {
    const normalizedQuality = GPT_IMAGE_QUALITY[quality] ? quality : '高清';
    const body = {
      model,
      prompt,
      urls: images,
      aspectRatio: ratio,
      quality: GPT_IMAGE_QUALITY[normalizedQuality],
      webHook: '-1',
      shutProgress: true,
    };
    if (GPT_IMAGE_PIXEL_SIZE_MODELS.has(model)) {
      body.aspectRatio = GPT_IMAGE_VIP_SIZES[normalizedQuality][ratio] || GPT_IMAGE_VIP_SIZES[normalizedQuality]['1:1'];
    }
    return body;
  }

  if (!model.startsWith('nano-banana')) {
    return {
      model,
      prompt,
      urls: images,
      aspectRatio: ratio,
      webHook: '-1',
      shutProgress: true,
    };
  }
  {
    const body = {
      model,
      prompt,
      urls: images,
      aspectRatio: ratio,
      webHook: '-1',
      shutProgress: true,
    };
    let imageSize;
    if (NANO_ALL_RESOLUTIONS.has(model)) imageSize = NANO_RESOLUTIONS[quality] || '2K';
    else if (NANO_1K_ONLY.has(model)) imageSize = '1K';
    else if (NANO_2K_ONLY.has(model)) imageSize = '2K';
    else if (NANO_4K_ONLY.has(model)) imageSize = '4K';
    else if (NANO_1K_2K.has(model)) imageSize = quality === '超高清' ? '2K' : '1K';
    if (imageSize) body.imageSize = imageSize;
    return body;
  }

}

// 从用户配置的端点中提取 origin，再按模型类型拼接正确的 Grsai API 路径。
function resolveGrsaiEndpoints(endpoint, model) {
  let origin;
  try {
    origin = new URL(endpoint).origin;
  } catch (_) {
    origin = '';
  }
  if (!origin) {
    return { generateUrl: endpoint, resultUrl: endpoint.replace(/generate(\?.*)?$/, 'result') };
  }

  const generateUrl = model.startsWith('nano-banana')
    ? origin + NANO_BANANA_PATH
    : origin + GPT_IMAGE_PATH;
  return { generateUrl, resultUrl: origin + DRAW_RESULT_PATH };
}

// Grsai 新端点返回 {code, data, msg} 包装格式；旧端点直接返回 {id, status, ...}。
function parseGrsaiPayload(body) {
  if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
    return body.data;
  }
  return body;
}

module.exports = {
  GPT_IMAGE_QUALITY,
  GPT_IMAGE_VIP_SIZES,
  buildGrsaiImageRequest,
  resolveGrsaiEndpoints,
  parseGrsaiPayload,
};
