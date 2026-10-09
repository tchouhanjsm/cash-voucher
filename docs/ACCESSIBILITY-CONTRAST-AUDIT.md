# WCAG AA Contrast Audit — October 2026

**Scope:** selected CSS source-token pairs used for text, navigation, semantic status labels, charts and focus indicators. Ratios use the WCAG relative-luminance formula on authored sRGB hex colors.

**Thresholds:** normal text 4.5:1; graphical objects and focus indicators 3:1. This is a scoped source-token audit, not a full rendered-page or formal conformance evaluation.

## Measured pairs

| Pair | Foreground | Background | Before | After | Threshold |
| --- | --- | --- | ---: | ---: | --- |
| Body text | `#1c2630` | `#f3f5f7` | 14.03:1 | 14.03:1 | 4.5:1 |
| Body text on card | `#1c2630` | `#ffffff` | 15.34:1 | 15.34:1 | 4.5:1 |
| Muted text on card | `#596978` | `#ffffff` | 5.65:1 | 5.65:1 | 4.5:1 |
| Muted text on app background | `#596978` | `#f3f5f7` | 5.17:1 | 5.17:1 | 4.5:1 |
| Primary button label | `#ffffff` | `#1f3a4d` | 11.86:1 | 11.86:1 | 4.5:1 |
| Default navigation label | `#d6e0e8` | `#1f3a4d` | 8.86:1 | 8.86:1 | 4.5:1 |
| Active navigation label | `#ffffff` | `#755016` | 7.20:1 | 7.20:1 | 4.5:1 |
| Warning badge label | `--warn` | `#fff1cf` | 4.34:1 | 5.26:1 | 4.5:1 |
| Chart hover accent | `--accent` | `#eef1f4` | 2.85:1 | 4.48:1 | 3:1 |
| General focus outline | `#725018` | `#ffffff` | 7.30:1 | 7.30:1 | 3:1 |
| Navigation focus outline | `#f3d17c` | `#1f3a4d` | 8.03:1 | 8.03:1 | 3:1 |
| Navigation focus on active item | `#f3d17c` | `#755016` | 4.88:1 | 4.88:1 | 3:1 |

The warning token changed from `#9a6700` to `#895b00`; the chart hover accent changed from `#b8862f` to `#946515`. A dependency-free Node check evaluates 19 explicit color pairs as part of `npm run check`.

## Verification boundaries

- Ratios are calculations from authored source colors; they do not inspect computed styles, opacity, gradients, background images, anti-aliasing or every component/state.
- This audit does not cover every feature-specific combination, disabled controls, all chart labels, high-contrast modes or every focus-adjacency context.
- Screen-reader output and full keyboard task completion require manual assistive-technology review. Browser assertions are regression guardrails only.
- Do not claim full WCAG conformance from this file alone.
