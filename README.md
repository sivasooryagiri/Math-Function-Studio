# Math Function Studio

Interactive math function visualizer built with React + Vite. Define functions, combine them, and explore their behavior in real time.

## Features
- Multiple named functions with color + visibility control
- Function composition, addition, and multiplication
- Multi-function combine (sum/product/compose)
- Derivative and integral overlays
- Discontinuity detection (holes/asymptotes)
- Mouse/touch pan + zoom
- PNG/SVG export
- Fullscreen mode

## Quick Start
```bash
npm install
npm run dev
```

## Usage
1. Add a function with a name (e.g. `f`) and an expression (e.g. `sin(x)`).
2. Use Quick Insert for common functions and constants.
3. Combine functions in the tools panel to build new expressions.
4. Toggle derivative/integral overlays in the analysis section.
5. Export graphs as PNG or SVG from the Graph panel.

## Controls
- Drag to pan
- Scroll / pinch to zoom
- Use fullscreen for a focused view

## Tech Stack
- React 18
- Vite 5
- Custom parser + evaluator (no external math library)
