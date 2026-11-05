// 模型展示信息：设置页与输入区共用同一份说明，避免同一模型在不同位置出现不同描述。

const IMAGE_MODEL_DESCRIPTIONS = {
  'gpt-image-2': 'OpenAI GPT Image 2，适合高质量文生图与图生图，支持多比例输出。',
  'gpt-image-2-vip': 'GPT Image 2 的 VIP 通道，使用相同的图像能力，适合需要独立通道的场景。',
  'gpt-image-2.5': 'GPT Image 2.5，支持文生图、图生图与多比例输出。',
  'gpt-image-2.5-flare': 'GPT Image 2.5 Flare，支持文生图、图生图与多比例输出。',
  'gpt-image-2.5-sunburst': 'GPT Image 2.5 Sunburst，支持文生图、图生图与多比例输出。',
  'nano-banana': 'Nano Banana 图像模型，支持图生图，适合通用创意与风格化生成。',
  'nano-banana-fast': 'Nano Banana 快速版，优先缩短出图时间，适合快速探索构图。',
  'nano-banana-2': 'Nano Banana 2，支持多图参考、多画幅与多档清晰度。',
  'nano-banana-2-cl': 'Nano Banana 2 的轻量通道，适合快速生成与批量尝试。',
  'nano-banana-pro': 'Nano Banana Pro，面向更高质量与细节表现的生成场景。',
  'nano-banana-pro-vt': 'Nano Banana Pro 的加速通道，适合需要更快返回结果的场景。',
  'nano-banana-pro-cl': 'Nano Banana Pro 的轻量通道，兼顾质量与生成速度。',
  'nano-banana-pro-vip': 'Nano Banana Pro 的 VIP 通道，使用相同能力并适合独立通道调用。',
  'Qwen-Image': '通义千问文生图模型，适合中文提示词与通用图像创作，不支持参考图。',
  'Qwen-Image-Plus': '通义千问图像增强版，面向更丰富的画面表现，不支持参考图。',
  'Qwen-Image-Edit': '通义千问图像编辑模型，需要上传参考图，最多支持 3 张。',
  'Qwen-Image-Edit-Plus': '通义千问图像编辑增强版，需要参考图，最多支持 3 张。',
  'HunyuanImage-3.0': '腾讯混元图像 3.0，支持文生图、多比例与最多 3 张参考图。',
  '即梦文生图 3.0': '字节即梦文生图 3.0，纯文生图模型，不支持参考图。',
  '即梦文生图 3.1': '字节即梦文生图 3.1，纯文生图模型，不支持参考图。',
  '即梦图片生成 4.0': '字节即梦图片生成 4.0，支持多画幅与最多 10 张参考图。',
  'Doubao-Seedream-4.0': '豆包 Seedream 4.0，支持多图参考与多比例输出，最多 10 张。',
  'Doubao-Seedream-4.5': '豆包 Seedream 4.5，支持多图参考、多比例与高清输出。',
  'Doubao-Seedream-5.0-lite': '豆包 Seedream 5.0 Lite，支持多图参考，偏向轻量与快速出图。',
  'Kling-V1': '可灵 V1 图像生成模型，支持多画幅与多图参考，应用上限 10 张。',
  'Kling-V2.1': '可灵 V2.1 图像生成模型，支持多画幅与多图参考，应用上限 10 张。',
  'glm-image': '智谱 GLM 图像模型，适合通用文生图，不接受参考图。',
  Kolors: '快手可图文生图模型，适合中文提示词与海报创作，不支持参考图。',
  'Wan2.5-T2I-Preview': '通义万相 2.5 文生图预览版，支持多种常用画幅。',
  'Wan2.5-I2I-Preview': '通义万相 2.5 图生图预览版，需要参考图，最多支持 3 张。',
};

const TEXT_MODEL_DESCRIPTIONS = {
  'DeepSeek-V3.1': 'DeepSeek V3.1 文本模型，可用于提示词优化与自动摘要。',
  'DeepSeek-R1-0528': 'DeepSeek R1 文本模型，偏向推理与结构化表达，可用于提示词优化。',
};

const CATEGORY_FALLBACK = {
  image: '生图模型，具体比例、清晰度与参考图能力由供应商决定。',
  text: '文本模型，可用于提示词优化与自动摘要。',
  video: '视频模型配置，当前版本暂未提供视频生成入口。',
};

/**
 * 返回用于界面展示的模型说明。
 * 优先使用模型自身保存的描述；动态拉取的模型若 name 与 id 不同，则 name 视为说明。
 */
export function getModelDescription({ category = 'image', modelId = '', name = '', description = '' } = {}) {
  const id = String(modelId || '').trim();
  const explicit = String(description || '').trim();
  if (explicit) return explicit;
  const readableName = String(name || '').trim();
  if (readableName && readableName !== id) return readableName;
  const catalog = category === 'text' ? TEXT_MODEL_DESCRIPTIONS : category === 'image' ? IMAGE_MODEL_DESCRIPTIONS : {};
  if (catalog[id]) return catalog[id];
  return CATEGORY_FALLBACK[category] || '模型说明暂未提供。';
}

export function getImageModelDescription(modelId, name = '', description = '') {
  return getModelDescription({ category: 'image', modelId, name, description });
}
