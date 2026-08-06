---
name: Cyber-Minimal Light
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#494454'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#7b7486'
  outline-variant: '#cbc3d7'
  surface-tint: '#6d3bd7'
  primary: '#6b38d4'
  on-primary: '#ffffff'
  primary-container: '#8455ef'
  on-primary-container: '#fffbff'
  inverse-primary: '#d0bcff'
  secondary: '#006591'
  on-secondary: '#ffffff'
  secondary-container: '#39b8fd'
  on-secondary-container: '#004666'
  tertiary: '#855000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a76500'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#c9e6ff'
  secondary-fixed-dim: '#89ceff'
  on-secondary-fixed: '#001e2f'
  on-secondary-fixed-variant: '#004c6e'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#673d00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

This design system translates a high-tech, cybernetic aesthetic into a clean, high-readability light environment. It balances the precision of developer-centric tools with the approachability of modern SaaS. The brand personality is clinical, efficient, and forward-thinking.

The style is **Cyber-Minimalism**, characterized by:
- **Pristine Surfaces:** Utilizing pure white and extremely subtle cool grays to create a sense of vast digital space.
- **Electric Accents:** Retaining a singular, high-vibrancy purple to signify data, action, and intelligence.
- **Structural Clarity:** Using hair-line borders and functional monospaced elements to evoke technical blueprints.
- **Refined Depth:** Moving away from heavy shadows toward tonal layering and subtle, high-diffusion "soft-glow" elevations.

## Colors

The palette is anchored by a high-contrast relationship between deep ink-blacks and clinical whites, punctuated by a signature violet.

- **Primary (#8b5cf6):** Used for primary actions, active navigation states, and critical data visualizations.
- **Secondary (#0ea5e9):** A technical cyan used for informative accents and secondary interactive elements.
- **Neutral (#64748b):** A slate-based gray scale that maintains legibility without the harshness of pure black.
- **Background (#FFFFFF):** The primary canvas. Use for main page areas to maximize "air" and focus.
- **Surface (#F8F9FA):** Used for sidebars, cards, and input backgrounds to create subtle structural hierarchy.
- **Border (#E2E8F0):** A precise, low-contrast gray for defining grids without cluttering the visual field.

## Typography

The typography system relies on the intersection of a modern grotesque and a technical monospace.

- **Hanken Grotesk** serves as the primary typeface. It should be set with tight letter-spacing for headings to maintain a "locked-in" technical feel. 
- **JetBrains Mono** is reserved for labels, metadata, and small UI hints. This reinforces the "cyber" narrative by treating UI text like code or technical readouts.
- All text should use high-contrast grays (Slate-800 or Slate-900) to ensure accessibility on white backgrounds.
- Capitalization should be used sparingly for labels to emphasize the systematic nature of the design.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile.

- **Rhythm:** A base-4 spacing system ensures mathematical consistency.
- **Density:** The design favors generous white space to prevent the "cluttered dashboard" trope common in technical tools.
- **Alignment:** Elements should strictly align to the grid. Avoid centering content; favor left-aligned layouts that evoke a sense of a structured document or terminal.
- **Breakpoints:**
  - Mobile: < 600px (16px margins)
  - Tablet: 600px - 1024px (24px margins)
  - Desktop: > 1024px (48px margins, 1200px max-content width)

## Elevation & Depth

In the light theme, depth is achieved through **low-contrast outlines** and **atmospheric shadows**.

- **Level 0 (Flat):** Used for the main background.
- **Level 1 (Subtle):** Surface-colored containers (#F8F9FA) with a 1px border (#E2E8F0). No shadow.
- **Level 2 (Floating):** White cards with a very soft, diffused shadow: `0 4px 20px rgba(0, 0, 0, 0.04)`.
- **Level 3 (Overlay):** Modals and dropdowns. Use a crisp border and a more pronounced shadow: `0 12px 40px rgba(139, 92, 246, 0.08)`. Note the subtle purple tint in the shadow to tie back to the brand.
- **Glassmorphism:** Use sparingly for navigation bars. `backdrop-filter: blur(12px)` with a `rgba(255, 255, 255, 0.8)` background.

## Shapes

The shape language is defined by **Medium Roundedness (Round 8)**.

- **Standard Elements:** Buttons, input fields, and cards use an 8px (0.5rem) radius.
- **Large Elements:** Sections or major containers use a 16px (1rem) radius.
- **Interactive States:** On hover, avoid changing the radius; instead, use subtle scale transforms (1.02x) or border-color shifts.
- **Consistency:** All interactive elements must share the same base radius to maintain the "modular" cybernetic feel.

## Components

### Buttons
- **Primary:** Background #8b5cf6, Text #FFFFFF. No shadow on rest, subtle purple glow on hover.
- **Secondary:** Background #FFFFFF, Border 1px #E2E8F0, Text #64748b.
- **Ghost:** No background or border. Text #8b5cf6.

### Input Fields
- **Default:** Background #F8F9FA, Border 1px #E2E8F0, Text #1e293b.
- **Focus:** Border 1px #8b5cf6, Box-shadow 0 0 0 2px rgba(139, 92, 246, 0.1).
- **Labels:** Use `label-sm` (JetBrains Mono) in all-caps for a technical readout appearance.

### Cards
- **Structure:** White background, 1px border #E2E8F0.
- **Header:** Use a subtle bottom border to separate the title area.
- **Interaction:** On hover, the border color shifts to the primary purple.

### Chips & Tags
- **Style:** Small, using `label-sm`. Background #F1F5F9, 1px border #E2E8F0. 
- **Active:** Background rgba(139, 92, 246, 0.1), Border #8b5cf6, Text #8b5cf6.

### Lists
- Separate list items with a 1px border-bottom #F1F5F9.
- Use a 4px vertical accent bar (Primary Purple) for the "Selected" state on the left edge of the list item.