const GPT_IMAGE_QUALITY = {
  标准: 'low',
  高清: 'medium',
  超高清: 'high',
};

const GPT_IMAGE_MODELS = new Set(['gpt-image-2', 'gpt-image-2-vip']);

// GRSai 的 vip 模型将像素尺寸放在 aspectRatio，且 4K 正方形最大为 2880x2880。
const GPT_IMAGE_VIP_SIZES = {
  标准: { '1:1': '1024x1024', '4:3': '1152x864', '16:9': '1280x720', '9:16': '720x1280' },
  高清: { '1:1': '2048x2048', '4:3': '2304x1728', '16:9': '2048x1152', '9:16': '1152x2048' },
  超高清: { '1:1': '2880x2880', '4:3': '3264x2448', '16:9': '3840x2160', '9:16': '2160x3840' },
};

function buildGrsaiImageRequest({ model, prompt, ratio = '1:1', quality = '高清', sourceImage }) {
  const images = sourceImage ? [sourceImage] : [];
  if (!GPT_IMAGE_MODELS.has(model)) {
    return {
      model,
      prompt,
      images,
      aspectRatio: ratio,
      replyType: 'json',
    };
  }

  const normalizedQuality = GPT_IMAGE_QUALITY[quality] ? quality : '高清';
  const body = {
    model,
    prompt,
    images,
    aspectRatio: ratio,
    quality: GPT_IMAGE_QUALITY[normalizedQuality],
    replyType: 'json',
  };
  if (model === 'gpt-image-2-vip') {
    body.aspectRatio = GPT_IMAGE_VIP_SIZES[normalizedQuality][ratio] || GPT_IMAGE_VIP_SIZES[normalizedQuality]['1:1'];
  }
  return body;
}

module.exports = {
  GPT_IMAGE_QUALITY,
  GPT_IMAGE_VIP_SIZES,
  buildGrsaiImageRequest,
};
