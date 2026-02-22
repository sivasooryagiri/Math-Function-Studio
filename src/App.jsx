import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildFunctionRegistry,
  validateName,
  CONSTANT_KEYS,
  BUILTIN_KEYS,
  evaluateAst,
  collectDivisionNodes
} from "./engine/math.js";

const DEFAULT_FUNCTIONS = [
  { id: 1, name: "f", expr: "sin(x)", color: "#ff6b6b", visible: true },
  { id: 2, name: "g", expr: "x^2 - 4", color: "#4dabf7", visible: true },
  { id: 3, name: "h", expr: "f(x) + 0.5*g(x)", color: "#ffd43b", visible: true }
];

const PALETTE = [
  "#ff6b6b",
  "#4dabf7",
  "#ffd43b",
  "#69db7c",
  "#ffa94d",
  "#748ffc",
  "#20c997",
  "#e599f7"
];

const QUICK_INSERTS = [
  { label: "sin()", value: "sin(" },
  { label: "cos()", value: "cos(" },
  { label: "tan()", value: "tan(" },
  { label: "ln()", value: "ln(" },
  { label: "log()", value: "log(" },
  { label: "exp()", value: "exp(" },
  { label: "sqrt()", value: "sqrt(" },
  { label: "abs()", value: "abs(" }
];

const ADVANCED_INSERTS = [
  { label: "asin()", value: "asin(" },
  { label: "acos()", value: "acos(" },
  { label: "atan()", value: "atan(" },
  { label: "atan2()", value: "atan2(" },
  { label: "sinh()", value: "sinh(" },
  { label: "cosh()", value: "cosh(" },
  { label: "tanh()", value: "tanh(" },
  { label: "asinh()", value: "asinh(" },
  { label: "acosh()", value: "acosh(" },
  { label: "atanh()", value: "atanh(" }
];

const CONSTANT_INSERTS = [
  { label: "pi", value: "pi" },
  { label: "e", value: "e" }
];

function useResizeObserver(ref) {
  const [size, setSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function niceStep(range) {
  const rough = range / 10;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  if (frac < 1.5) return 1 * pow;
  if (frac < 3) return 2 * pow;
  if (frac < 7) return 5 * pow;
  return 10 * pow;
}

function drawGraph(ctx, width, height, view, plots, options = {}) {
  ctx.clearRect(0, 0, width, height);

  const { xMin, xMax, yMin, yMax } = view;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;

  const xToPx = (x) => ((x - xMin) / xRange) * width;
  const yToPx = (y) => height - ((y - yMin) / yRange) * height;

  ctx.fillStyle = "rgba(7, 20, 29, 0.85)";
  ctx.fillRect(0, 0, width, height);

  const xStep = niceStep(xRange);
  const yStep = niceStep(yRange);

  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";

  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const px = xToPx(x);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const py = yToPx(y);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
  ctx.lineWidth = 1.5;

  if (xMin <= 0 && xMax >= 0) {
    const px = xToPx(0);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  if (yMin <= 0 && yMax >= 0) {
    const py = yToPx(0);
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }

  const showLabels = options.showAxisLabels;
  const labelFormatter = options.labelFormatter || formatNumber;
  if (showLabels) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "12px 'JetBrains Mono', monospace";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      const px = xToPx(x) + 4;
      if (px < 0 || px > width - 20) continue;
      ctx.fillText(labelFormatter(x), px, 4);
    }
    ctx.textBaseline = "middle";
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      const py = yToPx(y);
      if (py < 10 || py > height - 10) continue;
      ctx.fillText(labelFormatter(y), 6, py);
    }
  }

  plots.forEach((plot) => {
    ctx.strokeStyle = plot.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(plot.dash || []);
    ctx.beginPath();

    let started = false;
    const breaks = plot.breaks || [];
    let breakIndex = 0;

    for (let px = 0; px <= width; px += 1) {
      const x = xMin + (px / width) * xRange;
      let y;
      try {
        y = plot.fn(x);
      } catch {
        y = NaN;
      }
      if (!Number.isFinite(y)) {
        started = false;
        continue;
      }
      const py = yToPx(y);

      while (breakIndex < breaks.length && x > breaks[breakIndex].x + breaks[breakIndex].epsilon) {
        breakIndex += 1;
      }
      if (
        breakIndex < breaks.length &&
        Math.abs(x - breaks[breakIndex].x) <= breaks[breakIndex].epsilon
      ) {
        started = false;
        continue;
      }

      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }

    ctx.stroke();
    ctx.setLineDash([]);
  });

  plots.forEach((plot) => {
    const dots = plot.dots || [];
    const dotSize = Math.max(5, options.dotSize || 3);
    if (dots.length === 0) return;
    dots.forEach((dot) => {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dotSize, 0, Math.PI * 2);
      if (dot.filled) {
        ctx.fillStyle = plot.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = plot.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  });

  if (options.showAsymptotes) {
    plots.forEach((plot) => {
      const lines = plot.asymptotes || [];
      if (lines.length === 0) return;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      lines.forEach((px) => {
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    });
  }
}

function formatNumber(value) {
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "-∞";
  if (Math.abs(value) >= 1000 || Math.abs(value) < 1) return value.toExponential(2);
  return Math.round(value).toString();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function findRootBisection(fn, a, b) {
  let fa = fn(a);
  let fb = fn(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  let left = a;
  let right = b;
  for (let i = 0; i < 40; i += 1) {
    const mid = (left + right) / 2;
    const fm = fn(mid);
    if (!Number.isFinite(fm)) return null;
    if (Math.abs(fm) < 1e-8) return mid;
    if (fa * fm <= 0) {
      right = mid;
      fb = fm;
    } else {
      left = mid;
      fa = fm;
    }
  }
  return (left + right) / 2;
}

function detectDivisionDiscontinuities(ast, context, view, sampleCount) {
  const divisions = collectDivisionNodes(ast);
  if (divisions.length === 0) return [];

  const { xMin, xMax } = view;
  const step = (xMax - xMin) / (sampleCount - 1);
  const disc = [];
  const seen = new Set();

  const evalSub = (sub, x) => {
    try {
      return evaluateAst(sub, {
        ...context,
        x
      });
    } catch {
      return NaN;
    }
  };

  divisions.forEach(({ num, den }) => {
    const denFn = (x) => evalSub(den, x);
    const numFn = (x) => evalSub(num, x);

    let prevX = xMin;
    let prevDen = denFn(prevX);
    for (let i = 1; i < sampleCount; i += 1) {
      const x = xMin + i * step;
      const denVal = denFn(x);
      const signChange =
        Number.isFinite(prevDen) &&
        Number.isFinite(denVal) &&
        prevDen !== 0 &&
        denVal !== 0 &&
        prevDen * denVal < 0;
      const nearZero = Number.isFinite(denVal) && Math.abs(denVal) < 1e-6;

      if (signChange || nearZero) {
        const left = signChange ? prevX : x - step;
        const right = signChange ? x : x + step;
        const root = findRootBisection(denFn, left, right) ?? x;
        const key = root.toFixed(6);
        if (!seen.has(key)) {
          seen.add(key);
          let removable = false;
          let yValue = null;
          const numAt = numFn(root);
          if (Number.isFinite(numAt) && Math.abs(numAt) < 1e-4) {
            removable = true;
            const delta = step * 0.5;
            const leftVal = numFn(root - delta) / denFn(root - delta);
            const rightVal = numFn(root + delta) / denFn(root + delta);
            if (Number.isFinite(leftVal) && Number.isFinite(rightVal)) {
              yValue = (leftVal + rightVal) / 2;
            } else if (Number.isFinite(leftVal)) {
              yValue = leftVal;
            } else if (Number.isFinite(rightVal)) {
              yValue = rightVal;
            }
          }
          disc.push({ x: root, removable, y: yValue });
        }
      }
      prevX = x;
      prevDen = denVal;
    }
  });

  return disc;
}

 

function buildSampledFn(values, xMin, xMax) {
  const n = values.length;
  return (x) => {
    if (x <= xMin) return values[0];
    if (x >= xMax) return values[n - 1];
    const t = ((x - xMin) / (xMax - xMin)) * (n - 1);
    const i = Math.floor(t);
    const frac = t - i;
    const a = values[i];
    const b = values[Math.min(i + 1, n - 1)];
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return lerp(a, b, frac);
  };
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildSvgDocument(view, plots, width, height) {
  const { xMin, xMax, yMin, yMax } = view;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xToPx = (x) => ((x - xMin) / xRange) * width;
  const yToPx = (y) => height - ((y - yMin) / yRange) * height;

  let paths = "";
  const step = 2;

  plots.forEach((plot) => {
    let d = "";
    let started = false;
    let prevY = null;

    for (let px = 0; px <= width; px += step) {
      const x = xMin + (px / width) * xRange;
      let y;
      try {
        y = plot.fn(x);
      } catch {
        y = NaN;
      }
      if (!Number.isFinite(y)) {
        started = false;
        prevY = null;
        continue;
      }
      const py = yToPx(y);
      if (prevY !== null && Math.abs(py - prevY) > height * 1.5) {
        started = false;
        prevY = null;
        continue;
      }
      if (!started) {
        d += `M ${px.toFixed(2)} ${py.toFixed(2)} `;
        started = true;
      } else {
        d += `L ${px.toFixed(2)} ${py.toFixed(2)} `;
      }
      prevY = py;
    }

    if (d) {
      const dash = plot.dash ? ` stroke-dasharray="${plot.dash.join(" ")}"` : "";
      paths += `<path d="${d.trim()}" fill="none" stroke="${plot.color}" stroke-width="2"${dash} />`;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  <rect width="100%" height="100%" fill="#07141d"/>\n  ${paths}\n</svg>`;
}

export default function App() {
  const [functions, setFunctions] = useState(DEFAULT_FUNCTIONS);
  const [angleUnit, setAngleUnit] = useState("rad");
  const [view, setView] = useState({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 });
  const [hover, setHover] = useState({ x: null, y: null });
  const [activeField, setActiveField] = useState({ id: null, caret: 0 });
  const [combine, setCombine] = useState({
    a: "f",
    b: "g",
    mode: "add",
    name: "u",
    destination: "new",
    targetId: null
  });
  const [combineMany, setCombineMany] = useState({
    selected: [],
    mode: "sum",
    name: "m",
    destination: "new",
    targetId: null
  });
  const [analysis, setAnalysis] = useState({
    targets: ["f"],
    showDerivative: false,
    showIntegral: false,
    integralAnchor: "zero"
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewOptions, setViewOptions] = useState({
    showAxisLabels: false,
    dotSize: 5,
    showAsymptotes: true,
    showHoverReadout: true
  });
  const [showViewOptions, setShowViewOptions] = useState(false);

  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const exprRefs = useRef({});
  const stageRef = useRef(null);
  const size = useResizeObserver(wrapperRef);

  const nextName = (seed = "u") => {
    const taken = new Set(functions.map((fn) => fn.name));
    if (!taken.has(seed)) return seed;
    let i = 1;
    while (taken.has(`${seed}${i}`)) i += 1;
    return `${seed}${i}`;
  };

  const nameCounts = useMemo(() => {
    const counts = {};
    functions.forEach((fn) => {
      if (!fn.name) return;
      counts[fn.name] = (counts[fn.name] || 0) + 1;
    });
    return counts;
  }, [functions]);

  const functionNames = useMemo(
    () => functions.filter((fn) => fn.name).map((fn) => fn.name),
    [functions]
  );

  const registry = useMemo(() => buildFunctionRegistry(functions, { angleUnit }), [functions, angleUnit]);

  const errors = useMemo(() => {
    const reserved = new Set([...BUILTIN_KEYS, ...CONSTANT_KEYS, "x"]);
    const map = {};
    for (const fn of functions) {
      const nameError = validateName(fn.name, reserved);
      if (nameError) map[fn.id] = nameError;
      if (fn.name && nameCounts[fn.name] > 1) map[fn.id] = "Duplicate name";
      if (fn.name && registry.errors[fn.name]) map[fn.id] = registry.errors[fn.name];
    }
    return map;
  }, [functions, nameCounts, registry.errors]);

  const combineError = useMemo(() => {
    if (functionNames.length === 0) return "Add a named function first";
    const reserved = new Set([...BUILTIN_KEYS, ...CONSTANT_KEYS, "x"]);
    if (combine.destination === "new") {
      const nameToCheck = combine.name.trim() || nextName();
      const validation = validateName(nameToCheck, reserved);
      if (validation) return validation;
      if (functions.some((fn) => fn.name === nameToCheck)) return "Name already used";
    } else if (!combine.targetId) {
      return "Pick a target function";
    }
    return null;
  }, [combine.name, combine.destination, combine.targetId, functionNames, functions]);

  const combineManyError = useMemo(() => {
    if (functionNames.length === 0) return "Add a named function first";
    if (combineMany.selected.length < 2) return "Select at least two functions";
    const reserved = new Set([...BUILTIN_KEYS, ...CONSTANT_KEYS, "x"]);
    if (combineMany.destination === "new") {
      const nameToCheck = combineMany.name.trim() || nextName("m");
      const validation = validateName(nameToCheck, reserved);
      if (validation) return validation;
      if (functions.some((fn) => fn.name === nameToCheck)) return "Name already used";
    } else if (!combineMany.targetId) {
      return "Pick a target function";
    }
    return null;
  }, [combineMany, functionNames, functions]);

  const getPlots = () => {
    const basePlots = functions
      .filter((fn) => fn.visible && fn.name && !errors[fn.id])
      .map((fn) => {
        const ast = registry.asts ? registry.asts[fn.name] : null;
        const context = {
          x: 0,
          constants: { pi: Math.PI, e: Math.E },
          builtins: registry.builtins,
          functions: registry.compiled,
          stack: []
        };
        const sampleCount = Math.max(600, Math.floor(size.width * 2));
        let discontinuities = [];
        if (ast) {
          try {
            discontinuities = detectDivisionDiscontinuities(ast, context, view, sampleCount);
          } catch {
            discontinuities = [];
          }
        }
        const epsilon = (view.xMax - view.xMin) / (sampleCount * 1.5);

        const dots = [];
        const asymptotes = [];
        const breaks = [];
        const asymptoteSet = new Set();
        discontinuities.forEach((d) => {
          const xPx = clamp(((d.x - view.xMin) / (view.xMax - view.xMin)) * size.width, 2, size.width - 2);
          if (d.removable && d.y !== null && Number.isFinite(d.y)) {
            const yPx = clamp(
              size.height - ((d.y - view.yMin) / (view.yMax - view.yMin)) * size.height,
              2,
              size.height - 2
            );
            dots.push({ x: xPx, y: yPx, filled: true });
          } else {
            const delta = epsilon * 1.5;
            let leftVal = NaN;
            let rightVal = NaN;
            try {
              leftVal = registry.compiled[fn.name](d.x - delta);
            } catch {
              leftVal = NaN;
            }
            try {
              rightVal = registry.compiled[fn.name](d.x + delta);
            } catch {
              rightVal = NaN;
            }
            if (Number.isFinite(leftVal)) {
              const yPx = clamp(
                size.height - ((leftVal - view.yMin) / (view.yMax - view.yMin)) * size.height,
                2,
                size.height - 2
              );
              dots.push({ x: xPx, y: yPx, filled: false });
            }
            if (Number.isFinite(rightVal)) {
              const yPx = clamp(
                size.height - ((rightVal - view.yMin) / (view.yMax - view.yMin)) * size.height,
                2,
                size.height - 2
              );
              dots.push({ x: xPx, y: yPx, filled: false });
            }
            if (!asymptoteSet.has(xPx.toFixed(2))) {
              asymptoteSet.add(xPx.toFixed(2));
              asymptotes.push(xPx);
            }
          }
        });

        // Always break on division discontinuities.
        discontinuities.forEach((d) => {
          breaks.push({ x: d.x, epsilon });
        });

        // Heuristic break detection for functions like tan(x) that spike to infinity
        // without explicit division nodes in the AST.
        const jumpThreshold = Math.max(12, (view.yMax - view.yMin) * 6);
        let prevY = null;
        for (let i = 0; i < sampleCount; i += 1) {
          const x = view.xMin + (i / (sampleCount - 1)) * (view.xMax - view.xMin);
          let y;
          try {
            y = registry.compiled[fn.name](x);
          } catch {
            y = NaN;
          }
          if (!Number.isFinite(y) || Math.abs(y) > jumpThreshold) {
            breaks.push({ x, epsilon });
            const xPx = clamp(((x - view.xMin) / (view.xMax - view.xMin)) * size.width, 2, size.width - 2);
            const key = xPx.toFixed(2);
            if (!asymptoteSet.has(key)) {
              asymptoteSet.add(key);
              asymptotes.push(xPx);
            }
            prevY = null;
            continue;
          }
          if (prevY !== null && Math.abs(y - prevY) > jumpThreshold) {
            breaks.push({ x, epsilon });
            const xPx = clamp(((x - view.xMin) / (view.xMax - view.xMin)) * size.width, 2, size.width - 2);
            const key = xPx.toFixed(2);
            if (!asymptoteSet.has(key)) {
              asymptoteSet.add(key);
              asymptotes.push(xPx);
            }
          }
          prevY = y;
        }

        return {
          id: fn.id,
          color: fn.color,
          fn: (x) => registry.compiled[fn.name](x),
          dots,
          asymptotes,
          breaks
        };
      });

    if (!analysis.showDerivative && !analysis.showIntegral) {
      return basePlots;
    }

    const sampleCount = Math.max(240, Math.floor(size.width));
    const xMin = view.xMin;
    const xMax = view.xMax;
    const dx = (xMax - xMin) / (sampleCount - 1);

    analysis.targets.forEach((targetName) => {
      const target = functions.find((fn) => fn.name === targetName);
      if (!target || !target.visible || errors[target.id] || !registry.compiled[target.name]) return;

      const baseValues = new Array(sampleCount);
      for (let i = 0; i < sampleCount; i += 1) {
        const x = xMin + i * dx;
        try {
          baseValues[i] = registry.compiled[target.name](x);
        } catch {
          baseValues[i] = NaN;
        }
      }

      if (analysis.showDerivative) {
        const deriv = new Array(sampleCount).fill(NaN);
        for (let i = 1; i < sampleCount - 1; i += 1) {
          const a = baseValues[i - 1];
          const b = baseValues[i + 1];
          if (Number.isFinite(a) && Number.isFinite(b)) {
            deriv[i] = (b - a) / (2 * dx);
          }
        }
        basePlots.push({
          id: `${target.id}-deriv`,
          color: hexToRgba(target.color, 0.75),
          dash: [6, 6],
          fn: buildSampledFn(deriv, xMin, xMax)
        });
      }

      if (analysis.showIntegral) {
        const integ = new Array(sampleCount).fill(NaN);
        const anchorX = analysis.integralAnchor === "zero" ? 0 : xMin;
        const anchorIndex = Math.min(
          sampleCount - 1,
          Math.max(0, Math.round((anchorX - xMin) / dx))
        );

        integ[anchorIndex] = 0;
        let accRight = 0;
        for (let i = anchorIndex + 1; i < sampleCount; i += 1) {
          const a = baseValues[i - 1];
          const b = baseValues[i];
          if (Number.isFinite(a) && Number.isFinite(b)) {
            accRight += ((a + b) / 2) * dx;
            integ[i] = accRight;
          } else {
            integ[i] = NaN;
          }
        }

        let accLeft = 0;
        for (let i = anchorIndex - 1; i >= 0; i -= 1) {
          const a = baseValues[i];
          const b = baseValues[i + 1];
          if (Number.isFinite(a) && Number.isFinite(b)) {
            accLeft -= ((a + b) / 2) * dx;
            integ[i] = accLeft;
          } else {
            integ[i] = NaN;
          }
        }
        basePlots.push({
          id: `${target.id}-integ`,
          color: hexToRgba(target.color, 0.6),
          dash: [4, 8],
          fn: buildSampledFn(integ, xMin, xMax)
        });
      }
    });

    return basePlots;
  };

  useEffect(() => {
    if (functionNames.length === 0) return;
    setCombine((prev) => ({
      ...prev,
      a: functionNames.includes(prev.a) ? prev.a : functionNames[0],
      b: functionNames.includes(prev.b) ? prev.b : functionNames[0],
      targetId:
        prev.targetId && functions.some((fn) => fn.id === prev.targetId)
          ? prev.targetId
          : functions[0].id
    }));
    setAnalysis((prev) => ({
      ...prev,
      targets:
        prev.targets && prev.targets.length > 0
          ? prev.targets.filter((name) => functionNames.includes(name))
          : [functionNames[0]]
    }));
    setCombineMany((prev) => ({
      ...prev,
      selected:
        prev.selected && prev.selected.length > 0
          ? prev.selected.filter((name) => functionNames.includes(name))
          : functionNames.slice(0, 2),
      targetId:
        prev.targetId && functions.some((fn) => fn.id === prev.targetId)
          ? prev.targetId
          : functions[0].id
    }));
  }, [functionNames]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const plots = getPlots();

    drawGraph(ctx, size.width, size.height, view, plots, viewOptions);
  }, [functions, errors, registry, size, view, analysis, viewOptions]);

  const updateFunction = (id, patch) => {
    setFunctions((prev) => prev.map((fn) => (fn.id === id ? { ...fn, ...patch } : fn)));
  };

  const addFunction = () => {
    const id = Date.now();
    setFunctions((prev) => [
      ...prev,
      {
        id,
        name: "",
        expr: "",
        color: PALETTE[prev.length % PALETTE.length],
        visible: true
      }
    ]);
  };

  const removeFunction = (id) => {
    setFunctions((prev) => prev.filter((fn) => fn.id !== id));
  };

  const insertIntoActive = (snippet) => {
    let targetId = activeField.id;
    if (!targetId && functions.length > 0) {
      targetId = functions[0].id;
    }
    if (!targetId) return;
    const caret = activeField.id ? activeField.caret : functions[0].expr.length;
    setFunctions((prev) =>
      prev.map((fn) => {
        if (fn.id !== targetId) return fn;
        const before = fn.expr.slice(0, caret);
        const after = fn.expr.slice(caret);
        return { ...fn, expr: `${before}${snippet}${after}` };
      })
    );
    const ref = exprRefs.current[targetId];
    if (ref) {
      const nextPos = caret + snippet.length;
      requestAnimationFrame(() => {
        ref.focus();
        ref.setSelectionRange(nextPos, nextPos);
        setActiveField({ id: targetId, caret: nextPos });
      });
    }
  };

  const createCombinedFunction = () => {
    if (combineError) return;
    const name = combine.name.trim() || nextName();
    const a = combine.a;
    const b = combine.b;
    let expr = "";
    if (combine.mode === "add") expr = `${a}(x) + ${b}(x)`;
    if (combine.mode === "multiply") expr = `${a}(x) * ${b}(x)`;
    if (combine.mode === "compose") expr = `${a}(${b}(x))`;
    if (combine.mode === "composeReverse") expr = `${b}(${a}(x))`;
    if (combine.destination === "existing" && combine.targetId) {
      setFunctions((prev) =>
        prev.map((fn) => (fn.id === combine.targetId ? { ...fn, expr } : fn))
      );
    } else {
      setFunctions((prev) => [
        ...prev,
        { id: Date.now(), name, expr, color: PALETTE[prev.length % PALETTE.length], visible: true }
      ]);
      setCombine((prev) => ({ ...prev, name: nextName(prev.name || "u") }));
    }
  };

  const toggleManySelection = (name) => {
    setCombineMany((prev) => {
      const exists = prev.selected.includes(name);
      if (exists) {
        return { ...prev, selected: prev.selected.filter((n) => n !== name) };
      }
      return { ...prev, selected: [...prev.selected, name] };
    });
  };

  const createCombinedMany = () => {
    if (combineManyError) return;
    const name = combineMany.name.trim() || nextName("m");
    const list = combineMany.selected;
    let expr = "";
    if (combineMany.mode === "sum") {
      expr = list.map((n) => `${n}(x)`).join(" + ");
    } else if (combineMany.mode === "product") {
      expr = list.map((n) => `${n}(x)`).join(" * ");
    } else if (combineMany.mode === "compose") {
      expr = list.reduceRight((acc, n) => `${n}(${acc})`, "x");
    }

    if (combineMany.destination === "existing" && combineMany.targetId) {
      setFunctions((prev) =>
        prev.map((fn) => (fn.id === combineMany.targetId ? { ...fn, expr } : fn))
      );
    } else {
      setFunctions((prev) => [
        ...prev,
        { id: Date.now(), name, expr, color: PALETTE[prev.length % PALETTE.length], visible: true }
      ]);
      setCombineMany((prev) => ({ ...prev, name: nextName("m") }));
    }
  };

  const onWheel = (event) => {
    event.preventDefault();
    const zoom = event.deltaY > 0 ? 1.1 : 0.9;
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = view.xMin + ((event.clientX - rect.left) / rect.width) * (view.xMax - view.xMin);
    const anchorY = view.yMax - ((event.clientY - rect.top) / rect.height) * (view.yMax - view.yMin);
    setView((prev) => zoomView(prev, zoom, anchorX, anchorY));
  };

  const zoomView = (baseView, factor, anchorX, anchorY) => {
    const xMin = anchorX - (anchorX - baseView.xMin) * factor;
    const xMax = anchorX + (baseView.xMax - anchorX) * factor;
    const yMin = anchorY - (anchorY - baseView.yMin) * factor;
    const yMax = anchorY + (baseView.yMax - anchorY) * factor;
    return { xMin, xMax, yMin, yMax };
  };

  const zoomBy = (factor) => {
    setView((prev) => {
      const xCenter = (prev.xMin + prev.xMax) / 2;
      const yCenter = (prev.yMin + prev.yMax) / 2;
      return zoomView(prev, factor, xCenter, yCenter);
    });
  };

  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const x = view.xMin + (px / rect.width) * (view.xMax - view.xMin);
    const y = view.yMax - (py / rect.height) * (view.yMax - view.yMin);
    setHover({ x, y });

    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const points = Array.from(pointersRef.current.values());
      const a = points[0];
      const b = points[1];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      if (distance > 0) {
        const { startDistance, startView } = pinchRef.current;
        const factor = startDistance / distance;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const anchorX =
          startView.xMin + ((midX - rect.left) / rect.width) * (startView.xMax - startView.xMin);
        const anchorY =
          startView.yMax - ((midY - rect.top) / rect.height) * (startView.yMax - startView.yMin);
        setView(zoomView(startView, factor, anchorX, anchorY));
      }
      return;
    }

    if (dragRef.current) {
      const { startX, startY, startView } = dragRef.current;
      const dx = (event.clientX - startX) / rect.width;
      const dy = (event.clientY - startY) / rect.height;
      const xRange = startView.xMax - startView.xMin;
      const yRange = startView.yMax - startView.yMin;
      setView({
        xMin: startView.xMin - dx * xRange,
        xMax: startView.xMax - dx * xRange,
        yMin: startView.yMin + dy * yRange,
        yMax: startView.yMax + dy * yRange
      });
    }
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startView: { ...view }
      };
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null;
      const points = Array.from(pointersRef.current.values());
      const a = points[0];
      const b = points[1];
      pinchRef.current = {
        startDistance: Math.hypot(b.x - a.x, b.y - a.y),
        startView: { ...view }
      };
    }
  };

  const onPointerUp = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      dragRef.current = {
        startX: remaining.x,
        startY: remaining.y,
        startView: { ...view }
      };
    } else if (pointersRef.current.size === 0) {
      dragRef.current = null;
    }
  };

  const onPointerLeave = (event) => {
    pointersRef.current.delete(event.pointerId);
    setHover({ x: null, y: null });
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      pinchRef.current = null;
    }
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = async () => {
    const target = stageRef.current;
    if (!target) return;
    try {
      if (!document.fullscreenElement) {
        const request =
          target.requestFullscreen ||
          target.webkitRequestFullscreen ||
          target.msRequestFullscreen;
        if (request) {
          await request.call(target);
        }
      } else {
        const exit =
          document.exitFullscreen ||
          document.webkitExitFullscreen ||
          document.msExitFullscreen;
        if (exit) {
          await exit.call(document);
        }
      }
    } catch (err) {
      // Fullscreen can fail in restricted contexts; ignore silently.
    }
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const plots = getPlots();
    const intLabel = (v) => (Number.isFinite(v) ? String(Math.round(v)) : "");
    drawGraph(ctx, size.width, size.height, view, plots, {
      ...viewOptions,
      showAxisLabels: true,
      labelFormatter: intLabel
    });
    const url = exportCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = "math-plot.png";
    link.click();
  };

  const exportSvg = () => {
    const plots = getPlots();
    const svg = buildSvgDocument(view, plots, 1200, 720);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "math-plot.svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Math Function Studio</p>
          <h1>Visualize, combine, and compose functions in real time.</h1>
          <p className="subhead">
            Plot trig, polynomials, and custom expressions. Stack functions, multiply them, or nest one into
            another with full control over the viewport.
          </p>
          <div className="hero-links">
            <a className="ghost link" href="#limitations">
              What’s possible & what’s not
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div>
            <span className="label">Angle Mode</span>
            <div className="toggle">
              <button
                className={angleUnit === "rad" ? "active" : ""}
                onClick={() => setAngleUnit("rad")}
              >
                Radians
              </button>
              <button
                className={angleUnit === "deg" ? "active" : ""}
                onClick={() => setAngleUnit("deg")}
              >
                Degrees
              </button>
            </div>
          </div>
          <div>
            <span className="label">Constants</span>
            <div className="constants">{CONSTANT_KEYS.join(", ")}</div>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="panel">
          <div className="panel-header">
            <h2>Functions</h2>
            <button className="primary" onClick={addFunction}>
              Add Function
            </button>
          </div>

          <div className="functions">
            {functions.map((fn) => (
              <div className="fn-row" key={fn.id}>
                <input
                  className="fn-name"
                  value={fn.name}
                  onChange={(e) => updateFunction(fn.id, { name: e.target.value.trim() })}
                  placeholder="name"
                />
                <input
                  className="fn-expr"
                  value={fn.expr}
                  onChange={(e) => updateFunction(fn.id, { expr: e.target.value })}
                  onFocus={(e) => setActiveField({ id: fn.id, caret: e.target.selectionStart || 0 })}
                  onClick={(e) => setActiveField({ id: fn.id, caret: e.target.selectionStart || 0 })}
                  onKeyUp={(e) => setActiveField({ id: fn.id, caret: e.target.selectionStart || 0 })}
                  ref={(el) => {
                    if (el) exprRefs.current[fn.id] = el;
                  }}
                  placeholder="expression e.g. sin(x) + 0.5*g(x)"
                />
                <input
                  type="color"
                  value={fn.color}
                  className="fn-color"
                  onChange={(e) => updateFunction(fn.id, { color: e.target.value })}
                />
                <label className="toggle-visibility">
                  <input
                    type="checkbox"
                    checked={fn.visible}
                    onChange={(e) => updateFunction(fn.id, { visible: e.target.checked })}
                  />
                  <span>Show</span>
                </label>
                <button className="ghost" onClick={() => removeFunction(fn.id)}>
                  Remove
                </button>
                {errors[fn.id] ? <div className="fn-error">{errors[fn.id]}</div> : null}
              </div>
            ))}
          </div>

          <div className="quick-insert">
            <span className="label">Quick Insert</span>
            <div className="pill-row">
              {QUICK_INSERTS.map((item) => (
                <button key={item.label} className="pill" onClick={() => insertIntoActive(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button className="ghost tiny" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "Hide advanced" : "Show advanced"}
            </button>
            {showAdvanced ? (
              <div className="pill-row">
                {ADVANCED_INSERTS.map((item) => (
                  <button key={item.label} className="pill" onClick={() => insertIntoActive(item.value)}>
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="pill-row">
              {CONSTANT_INSERTS.map((item) => (
                <button key={item.label} className="pill ghost" onClick={() => insertIntoActive(item.value)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="toolbox">
            <div className="tool-card">
              <div className="tool-header">
                <h3>Combine</h3>
                <span className="tag">compose • add • multiply</span>
              </div>
              <div className="tool-grid">
                <label>
                  A
                  <select value={combine.a} onChange={(e) => setCombine((p) => ({ ...p, a: e.target.value }))}>
                    {functionNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  B
                  <select value={combine.b} onChange={(e) => setCombine((p) => ({ ...p, b: e.target.value }))}>
                    {functionNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mode
                  <select
                    value={combine.mode}
                    onChange={(e) => setCombine((p) => ({ ...p, mode: e.target.value }))}
                  >
                    <option value="add">A + B</option>
                    <option value="multiply">A × B</option>
                    <option value="compose">A(B(x))</option>
                    <option value="composeReverse">B(A(x))</option>
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    value={combine.destination}
                    onChange={(e) => setCombine((p) => ({ ...p, destination: e.target.value }))}
                  >
                    <option value="new">Create new</option>
                    <option value="existing">Write into</option>
                  </select>
                </label>
                {combine.destination === "new" ? (
                  <label>
                    Name
                    <input
                      value={combine.name}
                      onChange={(e) => setCombine((p) => ({ ...p, name: e.target.value }))}
                      placeholder="new function"
                    />
                  </label>
                ) : (
                  <label>
                    Target
                    <select
                      value={combine.targetId || ""}
                      onChange={(e) => setCombine((p) => ({ ...p, targetId: Number(e.target.value) }))}
                    >
                      {functions.map((fn) => (
                        <option key={fn.id} value={fn.id}>
                          {fn.name || "(unnamed)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {combineError ? <div className="fn-error tool-error">{combineError}</div> : null}
              <button className="primary" onClick={createCombinedFunction} disabled={!!combineError}>
                {combine.destination === "new" ? "Create Combined" : "Write Expression"}
              </button>
            </div>

            <div className="tool-card">
              <div className="tool-header">
                <h3>Analysis</h3>
                <span className="tag">derivative • integral</span>
              </div>
              <div className="tool-grid">
                <label>
                  Targets
                  <div className="checklist">
                    {functionNames.map((name) => (
                      <label key={name} className="checkline">
                        <input
                          type="checkbox"
                          checked={analysis.targets.includes(name)}
                          onChange={() =>
                            setAnalysis((prev) => ({
                              ...prev,
                              targets: prev.targets.includes(name)
                                ? prev.targets.filter((n) => n !== name)
                                : [...prev.targets, name]
                            }))
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={analysis.showDerivative}
                    onChange={(e) => setAnalysis((p) => ({ ...p, showDerivative: e.target.checked }))}
                  />
                  Show derivative
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={analysis.showIntegral}
                    onChange={(e) => setAnalysis((p) => ({ ...p, showIntegral: e.target.checked }))}
                  />
                  Show integral
                </label>
                <label>
                  Integral anchor
                  <select
                    value={analysis.integralAnchor}
                    onChange={(e) => setAnalysis((p) => ({ ...p, integralAnchor: e.target.value }))}
                  >
                    <option value="zero">Anchor at x=0</option>
                    <option value="view">Anchor at view min</option>
                  </select>
                </label>
              </div>
              <p className="hint">Derivative uses a central difference. Integral uses a running trapezoid.</p>
            </div>

            <div className="tool-card">
              <div className="tool-header">
                <h3>Combine Many</h3>
                <span className="tag">sum • product • compose</span>
              </div>
              <div className="tool-grid">
                <label>
                  Pick functions (order matters for compose)
                  <div className="checklist">
                    {functionNames.map((name) => (
                      <label key={name} className="checkline">
                        <input
                          type="checkbox"
                          checked={combineMany.selected.includes(name)}
                          onChange={() => toggleManySelection(name)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </label>
                <label>
                  Mode
                  <select
                    value={combineMany.mode}
                    onChange={(e) => setCombineMany((p) => ({ ...p, mode: e.target.value }))}
                  >
                    <option value="sum">Sum</option>
                    <option value="product">Product</option>
                    <option value="compose">Compose chain</option>
                  </select>
                </label>
                <label>
                  Destination
                  <select
                    value={combineMany.destination}
                    onChange={(e) => setCombineMany((p) => ({ ...p, destination: e.target.value }))}
                  >
                    <option value="new">Create new</option>
                    <option value="existing">Write into</option>
                  </select>
                </label>
                {combineMany.destination === "new" ? (
                  <label>
                    Name
                    <input
                      value={combineMany.name}
                      onChange={(e) => setCombineMany((p) => ({ ...p, name: e.target.value }))}
                      placeholder="new function"
                    />
                  </label>
                ) : (
                  <label>
                    Target
                    <select
                      value={combineMany.targetId || ""}
                      onChange={(e) => setCombineMany((p) => ({ ...p, targetId: Number(e.target.value) }))}
                    >
                      {functions.map((fn) => (
                        <option key={fn.id} value={fn.id}>
                          {fn.name || "(unnamed)"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {combineManyError ? <div className="fn-error tool-error">{combineManyError}</div> : null}
              <button className="primary" onClick={createCombinedMany} disabled={!!combineManyError}>
                {combineMany.destination === "new" ? "Create Combined" : "Write Expression"}
              </button>
            </div>
          </div>

        </section>

        <section className={`stage ${isFullscreen ? "fullscreen" : ""}`} ref={stageRef}>
          <div className="stage-header">
            <h2>Graph</h2>
            <div className="stage-actions">
              <div className="export-row">
                <button className="ghost" onClick={toggleFullscreen}>
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>
                <button className="ghost" onClick={exportPng}>
                  Export PNG
                </button>
                <button className="ghost" onClick={exportSvg}>
                  Export SVG
                </button>
              </div>
            </div>
          </div>
          <div className="legend">
            <div className="legend-item">
              <span className="legend-line deriv" />
              <span>Derivative</span>
            </div>
            <div className="legend-item">
              <span className="legend-line integ" />
              <span>Integral</span>
            </div>
            <button className="ghost tiny" onClick={() => setShowViewOptions((v) => !v)}>
              {showViewOptions ? "Hide additional options" : "Additional options"}
            </button>
          </div>
          {showViewOptions ? (
            <div className="viewport-card">
              <div className="tool-grid">
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={viewOptions.showAxisLabels}
                    onChange={(e) =>
                      setViewOptions((prev) => ({ ...prev, showAxisLabels: e.target.checked }))
                    }
                  />
                  Show axis values
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={viewOptions.showAsymptotes}
                    onChange={(e) =>
                      setViewOptions((prev) => ({ ...prev, showAsymptotes: e.target.checked }))
                    }
                  />
                  Show asymptotes
                </label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    checked={viewOptions.showHoverReadout}
                    onChange={(e) =>
                      setViewOptions((prev) => ({ ...prev, showHoverReadout: e.target.checked }))
                    }
                  />
                  Show hover coordinates
                </label>
                <label>
                  Dot size
                  <input
                    type="range"
                    min="2"
                    max="10"
                    value={viewOptions.dotSize}
                    onChange={(e) => setViewOptions((prev) => ({ ...prev, dotSize: Number(e.target.value) }))}
                  />
                </label>
              </div>
            </div>
          ) : null}
          {isFullscreen ? (
            <div className="fullscreen-panel">
              <button className="ghost tiny" onClick={() => setShowViewOptions((v) => !v)}>
                {showViewOptions ? "Hide options" : "Options"}
              </button>
              {showViewOptions ? (
                <div className="fullscreen-options">
                  <div className="functions">
                    {functions.map((fn) => (
                      <div className="fn-row" key={fn.id}>
                        <input
                          className="fn-name"
                          value={fn.name}
                          onChange={(e) => updateFunction(fn.id, { name: e.target.value.trim() })}
                          placeholder="name"
                        />
                        <input
                          className="fn-expr"
                          value={fn.expr}
                          onChange={(e) => updateFunction(fn.id, { expr: e.target.value })}
                          placeholder="expression"
                        />
                        <input
                          type="color"
                          value={fn.color}
                          className="fn-color"
                          onChange={(e) => updateFunction(fn.id, { color: e.target.value })}
                        />
                        <label className="toggle-visibility">
                          <input
                            type="checkbox"
                            checked={fn.visible}
                            onChange={(e) => updateFunction(fn.id, { visible: e.target.checked })}
                          />
                          <span>Show</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  <div className="fullscreen-card">
                    <div className="tool-grid">
                      <label className="checkline">
                        <input
                          type="checkbox"
                          checked={viewOptions.showAxisLabels}
                          onChange={(e) =>
                            setViewOptions((prev) => ({ ...prev, showAxisLabels: e.target.checked }))
                          }
                        />
                        Show axis values
                      </label>
                      <label className="checkline">
                        <input
                          type="checkbox"
                          checked={viewOptions.showAsymptotes}
                          onChange={(e) =>
                            setViewOptions((prev) => ({ ...prev, showAsymptotes: e.target.checked }))
                          }
                        />
                        Show asymptotes
                      </label>
                      <label className="checkline">
                        <input
                          type="checkbox"
                          checked={viewOptions.showHoverReadout}
                          onChange={(e) =>
                            setViewOptions((prev) => ({ ...prev, showHoverReadout: e.target.checked }))
                          }
                        />
                        Show hover coordinates
                      </label>
                      <label>
                        Dot size
                        <input
                          type="range"
                          min="2"
                          max="10"
                          value={viewOptions.dotSize}
                          onChange={(e) =>
                            setViewOptions((prev) => ({ ...prev, dotSize: Number(e.target.value) }))
                          }
                        />
                      </label>
                    </div>
                  </div>
                  <div className="view-actions">
                    <button className="ghost" onClick={() => zoomBy(0.85)}>
                      Zoom In
                    </button>
                    <button className="ghost" onClick={() => zoomBy(1.15)}>
                      Zoom Out
                    </button>
                    <button
                      className="ghost"
                      onClick={() => setView({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 })}
                    >
                      Reset View
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="viewport-card">
            <div className="viewport-header">
              <h3>Viewport</h3>
              <div className="view-actions">
                <button className="ghost" onClick={() => zoomBy(0.85)}>
                  Zoom In
                </button>
                <button className="ghost" onClick={() => zoomBy(1.15)}>
                  Zoom Out
                </button>
                <button
                  className="ghost"
                  onClick={() => setView({ xMin: -10, xMax: 10, yMin: -6, yMax: 6 })}
                >
                  Reset View
                </button>
              </div>
            </div>
            <div className="view-grid">
              <div>
                <label>Min X</label>
                <input
                  type="number"
                  value={view.xMin}
                  onChange={(e) => setView((prev) => ({ ...prev, xMin: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label>Max X</label>
                <input
                  type="number"
                  value={view.xMax}
                  onChange={(e) => setView((prev) => ({ ...prev, xMax: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label>Min Y</label>
                <input
                  type="number"
                  value={view.yMin}
                  onChange={(e) => setView((prev) => ({ ...prev, yMin: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label>Max Y</label>
                <input
                  type="number"
                  value={view.yMax}
                  onChange={(e) => setView((prev) => ({ ...prev, yMax: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <div
            className="canvas-wrap"
            ref={wrapperRef}
            onWheel={onWheel}
            onPointerMove={onPointerMove}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
          >
            <canvas ref={canvasRef} className="plot" />
            {viewOptions.showHoverReadout ? (
              <div className="canvas-readout">
                <span>x: {hover.x === null ? "--" : formatNumber(hover.x)}</span>
                <span>y: {hover.y === null ? "--" : formatNumber(hover.y)}</span>
              </div>
            ) : null}
            <div className="canvas-hint">Scroll or pinch to zoom. Drag to pan.</div>
          </div>
        </section>
      </main>

      <section id="limitations" className="notice">
        <h2>What’s Possible & What’s Not (Yet)</h2>
        <div className="notice-grid">
          <div>
            <h3>Currently Possible</h3>
            <ul>
              <li>Custom expressions with trig, logs, exponentials, roots.</li>
              <li>Function composition, sum, product, and mixing functions.</li>
              <li>Numeric derivative and integral overlays.</li>
              <li>Discontinuity dots for division-based removable/vertical cases.</li>
              <li>PNG/SVG export with axis labels.</li>
            </ul>
          </div>
          <div>
            <h3>Current Limits</h3>
            <ul>
              <li>Discontinuity detection only for division by zero.</li>
              <li>No symbolic simplification (e.g., canceling factors).</li>
              <li>Very complex expressions may slow the UI.</li>
            </ul>
          </div>
          <div>
            <h3>Future Possibilities</h3>
            <ul>
              <li>Domain analysis for `log`, `sqrt`, and `tan` asymptotes.</li>
              <li>Symbolic simplification and exact discontinuity detection.</li>
              <li>Analytic derivative and integral for common functions.</li>
              <li>Multi-graph export with annotations.</li>
            </ul>
          </div>
        </div>
        <p className="credit">
          This is a vibe coded project by{" "}
          <a className="link" href="https://deadtechguy.fun/" target="_blank" rel="noreferrer">
            DeadTechGuy
          </a>
          .
        </p>
      </section>
    </div>
  );
}
