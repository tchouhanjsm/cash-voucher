# WCAG AA Contrast Audit — October 2026

**Scope:** selected CSS source-token pairs used for text, navigation, semantic status labels, charts and focus indicators. Ratios use the WCAG relative-luminance formula on authored sRGB hex colors.

**Thresholds:** normal text 4.5:1; graphical objects and focus indicators 3:1. This is a scoped source-token audit, not a full rendered-page or formal conformance evaluation.

## Measured pairs

Normal text uses a 4.5:1 minimum; chart graphics and focus indicators use 3:1.

- Body text `#1c2630` on application background `#f3f5f7`: **14.03:1**.
- Body text `#1c2630` on card `#ffffff`: **15.34:1**.
- Muted text `#596978` on card `#ffffff`: **5.65:1**.
- Muted text `#596978` on application background `#f3f5f7`: **5.17:1**.
- Primary button label `#ffffff` on brand `#1f3a4d`: **11.86:1**.
- Default navigation label `#d6e0e8` on brand `#1f3a4d`: **8.86:1**.
- Active navigation label `#ffffff` on `#755016`: **7.20:1**.
- Warning badge label on `#fff1cf`: **4.34:1 before**, **5.26:1 after**.
- Chart hover accent on chart track `#eef1f4`: **2.85:1 before**, **4.48:1 after**.
- General focus outline `#725018` on white controls: **7.30:1**.
- Navigation focus outline `#f3d17c` on brand `#1f3a4d`: **8.03:1**.
- Navigation focus outline `#f3d17c` on active item `#755016`: **4.88:1**.

The warning token changed from `#9a6700` to `#895b00`; the chart hover accent changed from `#b8862f` to `#946515`. A dependency-free Node check evaluates 19 explicit color pairs as part of `npm run check`.

## Verification boundaries

- Ratios are calculations from authored source colors; they do not inspect computed styles, opacity, gradients, background images, anti-aliasing or every component/state.
- This audit does not cover every feature-specific combination, disabled controls, all chart labels, high-contrast modes or every focus-adjacency context.
- Screen-reader output and full keyboard task completion require manual assistive-technology review. Browser assertions are regression guardrails only.
- Do not claim full WCAG conformance from this file alone.
