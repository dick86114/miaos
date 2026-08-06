---
name: MiaoS Cyber-Minimal
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1c1b1d'
  surface-container: '#201f22'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e5e1e4'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#e5e1e4'
  inverse-on-surface: '#313032'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#ffb869'
  on-tertiary: '#482900'
  tertiary-container: '#ca801e'
  on-tertiary-container: '#3f2300'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#131315'
  on-background: '#e5e1e4'
  surface-variant: '#353437'
  background-deep: '#000000'
  surface-elevated: '#18181B'
  surface-stroke: '#27272A'
  status-waiting: '#71717A'
  status-processing: '#3B82F6'
  status-success: '#10B981'
  status-error: '#EF4444'
  status-warning: '#F59E0B'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: -0.02em
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  margin-screen: 20px
  gutter-grid: 12px
  card-padding: 16px
  section-gap: 32px
---

## 品牌与风格

此设计系统旨在为“妙生 (MiaoS)”打造一个深邃、精准且充满未来感的数字创作空间。品牌性格被定义为**技术主权、极简主义与灵感流动**。

### 设计风格：科技极简 (Tech-Minimalism)
设计融合了**极简主义**的留白处理与**高科技感**的视觉元素。通过极高的对比度突出 AI 生成的内容，同时利用细微的深色阶梯（Tonal Layers）构建层次感。
- **呼吸感：** 严格执行大间距策略，让复杂的 AI 参数与生成结果互不干扰。
- **隐私感：** 视觉表现冷峻且安全，呼应其“本地优先”与“无登录”的核心属性。
- **沉浸式：** UI 元素尽可能弱化，采用极细边框或纯色块，使图像作品成为页面的绝对主角。

## 色彩方案

采用**纯黑 (OLED Black)** 为底色，以极致的深色背景降低光污染，提升创作专注度。

- **品牌色：** 使用“赛博紫” (`#8B5CF6`) 作为主要动作色，“电光青” (`#06B6D4`) 为辅助色，营造霓虹感。
- **中性色：** 以锌灰色调 (`Zinc`) 构建，避免纯灰带来的沉闷感，保持冷色调的一致性。
- **状态色：** 严格遵循功能说明书定义的语义，其中 `status-processing` 建议配合微光呼吸动画使用。
- **安全感：** 敏感字段（如 API Key）背景应使用 `surface-elevated` 并配合模糊滤镜。

## 字体排版

排版逻辑侧重于**数据可读性**与**中文阅读的流畅度**。

- **标题：** 使用 `Hanken Grotesk`，其现代化的字形具有极强的科技美感。
- **正文：** 选用 `Inter`，它是 Android 平台上易读性最高的非衬线字体，能很好地兼顾中文屏显效果。
- **技术数据：** 所有 Prompt、API 地址及 JSON 预览必须使用 `JetBrains Mono`，强调工具的专业性与准确性。
- **排版建议：** 增加段落间的 `padding`，确保 Prompt 长文本在小屏幕上不会产生视觉压迫。

## 布局与间距

采用**流式响应布局 (Fluid Grid)**，以适应 Android 生态多样的屏幕尺寸及折叠屏设备。

- **基础步长：** 以 `4px` 为原子单位，所有间距均为 4 的倍数。
- **呼吸感原则：** 屏幕左右边距设定为 `20px`，确保内容不紧贴边缘。
- **网格系统：** 历史记录列表在手机上默认为 2 列，平板设备根据宽度自动扩展至 4-6 列。
- **层级区分：** 通过间距的变化而非分割线来区分模块。例如，"快捷历史" 与 "生成队列" 之间使用 `section-gap` 进行强隔离。

## 层级与深度

在纯黑背景下，深度不再通过传统的模糊阴影表现，而是通过**色调层级 (Tonal Tiers)** 和**边框光影**来体现。

- **基础层级：** `background-deep` (#000000) 作为底部容器。
- **浮动层级：** 所有的卡片、对话框使用 `surface-elevated` (#18181B)，并赋予极细的 `surface-stroke` (#27272A) 描边。
- **视觉反馈：** 当用户点击可交互元素时，描边颜色应过渡至 `primary_color`，产生一种“通电”激活的视觉隐喻。
- **磨砂效果：** 顶部导航栏和底部操作栏采用 `Backdrop Blur (20px)` 配合半透明背景，维持背景内容的流动感。

## 形状语言

形状设计平衡了软工业设计与几何严谨性。

- **容器：** 采用 `Rounded` (0.5rem) 级别。这能确保在展示 AI 生成的艺术图像（通常为直角或微圆角）时，外层容器不会因圆角过大而切割画面意境。
- **媒体元素：** 图像预览组件使用 `rounded-lg` (1rem)，以柔化技术感带来的冷硬感。
- **交互组件：** 输入框与状态标签采用完全一致的圆角率，保持界面语言的高度统一。

## 组件设计规范

### 1. 按钮 (Buttons)
- **主操作：** 填充 `primary_color`，文字使用深色以保证对比度。
- **幽灵按钮：** 仅显示 `surface-stroke` 描边，用于次要操作如“取消”或“重置”。

### 2. 生成卡片 (Generation Cards)
- 采用一体化布局，图像占据上方 80% 区域。
- 下方信息区使用 `code-sm` 字体展示模型简写与维度。
- 右上角悬浮状态标签（Status Tag），背景带 40% 不透明度。

### 3. 版本树 (Version Tree)
- 采用左侧缩进线条连接父子节点。
- 当前选中的版本应具有 `primary_color` 的外发光描边。
- 自动分支（Auto-Branching）产生的节点建议使用虚线连接。

### 4. 输入字段 (Inputs)
- 采用纯色填充而非下划线模式，背景为 `surface-elevated`。
- 聚焦状态下，边框变为 `secondary_color`。

### 5. 提示反馈 (Feedback)
- **Toast：** 浮动在屏幕中下方，采用胶囊形状，不带阴影，仅通过背景色与边框与底层区分。
- **Loading：** 针对“提示词优化”，使用从左向右滑动的紫色渐变扫描动画。