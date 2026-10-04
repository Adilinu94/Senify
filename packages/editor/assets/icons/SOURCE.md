# Editor symbol set — Phosphor Icons, Regular

Source: **@phosphor-icons/core 2.1.1**, the `assets/regular/` SVGs
(https://github.com/phosphor-icons/core), MIT licensed (see `LICENSE`).

Why Phosphor Regular: it draws on a 24px grid with an optical stroke of 16/256
units, which is exactly 1.5px at 24px. That matches the plan's single required
weight ("Strich 1.5, 24px-Raster", one weight globally) without per-icon tuning,
and it is a plain MIT-licensed stroked outline set — no emoji, no mixed weights.

The editor keeps its short names; this is the mapping to the vendored files:

| Editor name | File |
|---|---|
| `undo` | `arrow-counter-clockwise.svg` |
| `redo` | `arrow-clockwise.svg` |
| `plus` | `plus.svg` |
| `publish` | `arrow-square-out.svg` |
| `down` | `caret-down.svg` |
| `right` | `caret-right.svg` |
| `caret` | `caret-right.svg` |
| `layers` | `stack.svg` |
| `box` | `cube.svg` |
| `text` | `text-t.svg` |
| `image` | `image.svg` |
| `eye` | `eye.svg` |
| `eyeoff` | `eye-slash.svg` |
| `lock` | `lock.svg` |
| `search` | `magnifying-glass.svg` |
| `close` | `x.svg` |
| `grip` | `dots-six-vertical.svg` |
| `trash` | `trash.svg` |
| `copy` | `copy.svg` |
| `wrap` | `frame-corners.svg` |
| `check` | `check.svg` |
| `alert` | `warning.svg` |
| `info` | `info.svg` |
| `ruler` | `ruler.svg` |
| `guide` | `columns.svg` |
| `grid` | `grid-four.svg` |
| `fit` | `corners-out.svg` |
| `zoomin` | `magnifying-glass-plus.svg` |
| `zoomout` | `magnifying-glass-minus.svg` |
| `device` | `monitor.svg` |
| `link` | `link.svg` |
| `branch` | `git-branch.svg` |
| `repeat` | `repeat.svg` |
| `slider` | `sliders-horizontal.svg` |
| `edge-t` | `arrow-line-up.svg` |
| `edge-r` | `arrow-line-right.svg` |
| `edge-b` | `arrow-line-down.svg` |
| `edge-l` | `arrow-line-left.svg` |
| `dot` | `circle.svg` |
| `palette` | `palette.svg` |
| `spark` | `sparkle.svg` |
| `desktop` | `desktop.svg` |
| `tablet` | `device-tablet.svg` |
| `phone` | `device-mobile.svg` |
| `history` | `clock-counter-clockwise.svg` |

Regeneration: `packages/editor/src/ui/icons.ts` and the preview's icon block are
generated from these SVGs; a vitest parity test (`packages/editor/test/ui/vorschau-paritaet.test.ts`)
fails if the preview drifts from `EDITOR_ICON_CSS`.
