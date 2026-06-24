---
name: asset-chart-preview
description: Render the bot's real asset-chart renderers (intraday + history, line/candle) to PNG fixtures for faithful visual review. Use whenever previewing, reviewing, or iterating on the look of $TICKER charts (asset-chart.ts, asset-embeds.ts) — instead of hand-drawing SVG mockups.
---

# Asset chart preview

Renders the **actual** `renderAssetChart` / `renderHistoryChart` functions against
deterministic synthetic fixtures, so any chart change is reviewed as a true PNG
rather than an approximation.

## Hard rules

1. **Never hand-draw an SVG/HTML mockup of an existing chart.** Hand mockups drift
   from the real renderer (e.g. range bars stacked vs side-by-side). Always render
   the real code and view the PNG.
2. **To preview a proposed change:** edit the renderer in `src/embeds/asset-chart.ts`,
   re-run the harness, and view the new PNG. What you see is what ships.
3. Fixtures are synthetic and offline — no network, no API key needed.

## Run

```bash
npm run preview-charts
```

Writes PNGs to `temp/` (gitignored): `preview-<type>-<range>-<mode>.png`.

## Fixture matrix

- **Types:** `stock` (AAPL), `crypto` (BTC), `commodity` (WTI). Note there is no
  `etf` type — an ETF is a `stock`-typed symbol.
- **Ranges:** `1d` (intraday → `renderAssetChart`); `1w/1m/3m/ytd/1y/5y/all`
  (history → `renderHistoryChart`).
- **Modes:** `line`, `candle` (candle is force-capped to line beyond `MAX_CANDLES`).

Fixtures carry full `open/high/low/volume` per bar and fundamentals
(`market_cap/pe_ratio/dividend_yield/next_earnings`, `week52_*`) so candle mode,
the volume overlay, and the fundamentals strip all have data to draw.

## Viewing

Read the PNGs directly (the Read tool renders images inline), e.g.
`temp/preview-stock-1y-candle.png`. Compare line vs candle, check the volume
overlay, y-axis label placement, stat list, and fundamentals strip.

## Files

- Harness: `src/scripts/previewCharts.ts` (edit fixtures here).
- Renderers under review: `src/embeds/asset-chart.ts`.
