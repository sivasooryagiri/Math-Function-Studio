const CONSTANTS = {
  pi: Math.PI,
  e: Math.E
};

function clampNumber(value) {
  if (!Number.isFinite(value)) return NaN;
  if (Math.abs(value) > 1e12) return NaN;
  return value;
}

const BUILTIN_KEYS = [
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "cosec",
  "asin",
  "acos",
  "atan",
  "acot",
  "asec",
  "acsc",
  "acosec",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "coth",
  "sech",
  "csch",
  "asinh",
  "acosh",
  "atanh",
  "acoth",
  "asech",
  "acsch",
  "abs",
  "sqrt",
  "ln",
  "log",
  "exp",
  "floor",
  "ceil",
  "round",
  "min",
  "max",
  "pow"
];

function makeBuiltins(angleUnit) {
  const toRad = angleUnit === "deg" ? (v) => (v * Math.PI) / 180 : (v) => v;
  const fromRad = angleUnit === "deg" ? (v) => (v * 180) / Math.PI : (v) => v;

  return {
    sin: (x) => Math.sin(toRad(x)),
    cos: (x) => Math.cos(toRad(x)),
    tan: (x) => Math.tan(toRad(x)),
    cot: (x) => 1 / Math.tan(toRad(x)),
    sec: (x) => 1 / Math.cos(toRad(x)),
    csc: (x) => 1 / Math.sin(toRad(x)),
    cosec: (x) => 1 / Math.sin(toRad(x)),
    asin: (x) => fromRad(Math.asin(x)),
    acos: (x) => fromRad(Math.acos(x)),
    atan: (x) => fromRad(Math.atan(x)),
    acot: (x) => fromRad(Math.atan(1 / x)),
    asec: (x) => fromRad(Math.acos(1 / x)),
    acsc: (x) => fromRad(Math.asin(1 / x)),
    acosec: (x) => fromRad(Math.asin(1 / x)),
    atan2: (y, x) => fromRad(Math.atan2(y, x)),
    sinh: (x) => Math.sinh(x),
    cosh: (x) => Math.cosh(x),
    tanh: (x) => Math.tanh(x),
    coth: (x) => Math.cosh(x) / Math.sinh(x),
    sech: (x) => 1 / Math.cosh(x),
    csch: (x) => 1 / Math.sinh(x),
    asinh: (x) => Math.asinh(x),
    acosh: (x) => Math.acosh(x),
    atanh: (x) => Math.atanh(x),
    acoth: (x) => Math.atanh(1 / x),
    asech: (x) => Math.acosh(1 / x),
    acsch: (x) => Math.asinh(1 / x),
    abs: (x) => Math.abs(x),
    sqrt: (x) => Math.sqrt(x),
    ln: (x) => Math.log(x),
    log: (x) => Math.log10(x),
    exp: (x) => Math.exp(x),
    floor: (x) => Math.floor(x),
    ceil: (x) => Math.ceil(x),
    round: (x) => Math.round(x),
    min: (...args) => Math.min(...args),
    max: (...args) => Math.max(...args),
    pow: (a, b) => Math.pow(a, b)
  };
}

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ type: "comma", value: ",", pos: i });
      i += 1;
      continue;
    }
    if (ch === "(" || ch === ")") {
      tokens.push({ type: "paren", value: ch, pos: i });
      i += 1;
      continue;
    }
    if ("+-*/^".includes(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i += 1;
      continue;
    }
    if (ch === "." || (ch >= "0" && ch <= "9")) {
      let start = i;
      i += 1;
      while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")) i += 1;
      if (i < input.length && (input[i] === "e" || input[i] === "E")) {
        i += 1;
        if (input[i] === "+" || input[i] === "-") i += 1;
        while (i < input.length && input[i] >= "0" && input[i] <= "9") i += 1;
      }
      const raw = input.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Invalid number at ${start}`);
      tokens.push({ type: "number", value, pos: start });
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let start = i;
      i += 1;
      while (i < input.length) {
        const c = input[i];
        if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_") {
          i += 1;
        } else break;
      }
      const name = input.slice(start, i);
      tokens.push({ type: "id", value: name, pos: start });
      continue;
    }
    throw new Error(`Unexpected character '${ch}' at ${i}`);
  }
  return tokens;
}

class Parser {
  constructor(tokens, functionNames) {
    this.tokens = tokens;
    this.index = 0;
    this.functionNames = functionNames;
  }

  current() {
    return this.tokens[this.index];
  }

  consume() {
    const t = this.tokens[this.index];
    this.index += 1;
    return t;
  }

  match(type, value) {
    const t = this.current();
    if (!t || t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.index += 1;
    return true;
  }

  parseExpression() {
    return this.parseAddSub();
  }

  parseAddSub() {
    let node = this.parseTerm();
    while (true) {
      const t = this.current();
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      this.consume();
      const right = this.parseTerm();
      node = { type: "binary", op: t.value, left: node, right };
    }
    return node;
  }

  isImplicitMultiplyStart(token) {
    if (!token) return false;
    if (token.type === "number") return true;
    if (token.type === "id") return true;
    if (token.type === "paren" && token.value === "(") return true;
    return false;
  }

  parseTerm() {
    let node = this.parseUnary();
    while (true) {
      const t = this.current();
      if (t && t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.consume();
        const right = this.parseUnary();
        node = { type: "binary", op: t.value, left: node, right };
        continue;
      }
      if (this.isImplicitMultiplyStart(t)) {
        const right = this.parseUnary();
        node = { type: "binary", op: "*", left: node, right };
        continue;
      }
      break;
    }
    return node;
  }

  parsePower() {
    let node = this.parsePrimary();
    const t = this.current();
    if (t && t.type === "op" && t.value === "^") {
      this.consume();
      const right = this.parseUnary();
      node = { type: "binary", op: "^", left: node, right };
    }
    return node;
  }

  parseUnary() {
    const t = this.current();
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.consume();
      const value = this.parseUnary();
      return { type: "unary", op: t.value, value };
    }
    return this.parsePower();
  }

  parsePrimary() {
    const t = this.current();
    if (!t) throw new Error("Unexpected end of input");

    if (t.type === "number") {
      this.consume();
      return { type: "number", value: t.value };
    }

    if (t.type === "id") {
      this.consume();
      const name = t.value;
      const next = this.current();
      const isCall = next && next.type === "paren" && next.value === "(" && this.functionNames.has(name);
      if (isCall) {
        this.consume();
        const args = [];
        if (!this.match("paren", ")")) {
          while (true) {
            args.push(this.parseExpression());
            if (this.match("paren", ")")) break;
            if (!this.match("comma", ",")) {
              const cur = this.current();
              const pos = cur ? cur.pos : "end";
              throw new Error(`Expected ',' or ')' at ${pos}`);
            }
          }
        }
        return { type: "call", name, args };
      }
      return { type: "identifier", name };
    }

    if (t.type === "paren" && t.value === "(") {
      this.consume();
      const expr = this.parseExpression();
      if (!this.match("paren", ")")) {
        const cur = this.current();
        const pos = cur ? cur.pos : "end";
        throw new Error(`Expected ')' at ${pos}`);
      }
      return expr;
    }

    throw new Error(`Unexpected token at ${t.pos}`);
  }
}

export function evaluateAst(node, context) {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier": {
      if (node.name === "x") return context.x;
      if (node.name in context.constants) return context.constants[node.name];
      if (context.functions[node.name]) {
        return context.functions[node.name](context.x, context.stack);
      }
      throw new Error(`Unknown identifier '${node.name}'`);
    }
    case "unary": {
      const value = evaluateAst(node.value, context);
      return node.op === "-" ? -value : value;
    }
    case "binary": {
      const left = evaluateAst(node.left, context);
      const right = evaluateAst(node.right, context);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? NaN : left / right;
        case "^":
          return Math.pow(left, right);
        default:
          throw new Error(`Unknown operator '${node.op}'`);
      }
    }
    case "call": {
      const fn = context.builtins[node.name] || context.functions[node.name];
      if (!fn) throw new Error(`Unknown function '${node.name}'`);
      const args = node.args.map((arg) => evaluateAst(arg, context));
      if (context.functions[node.name]) {
        if (node.args.length !== 1) throw new Error(`'${node.name}' expects 1 argument`);
        return fn(args[0], context.stack);
      }
      return fn(...args);
    }
    default:
      throw new Error("Unknown AST node");
  }
}

export function buildFunctionRegistry(defs, options) {
  const angleUnit = options?.angleUnit || "rad";
  const builtins = makeBuiltins(angleUnit);
  const names = new Set(Object.keys(builtins));

  for (const def of defs) {
    if (def.name) names.add(def.name);
  }

  const compiled = {};
  const errors = {};
  const asts = {};

  for (const def of defs) {
    if (!def.name) continue;
    try {
      const tokens = tokenize(def.expr || "");
      const parser = new Parser(tokens, names);
      const ast = parser.parseExpression();
      if (parser.current()) throw new Error(`Unexpected token at ${parser.current().pos}`);
      asts[def.name] = ast;
    } catch (err) {
      errors[def.name] = err.message;
    }
  }

  for (const def of defs) {
    if (!def.name) continue;
    compiled[def.name] = (x, stack = []) => {
      if (errors[def.name]) throw new Error(errors[def.name]);
      if (!asts[def.name]) throw new Error(`No expression for '${def.name}'`);
      if (stack.includes(def.name)) throw new Error(`Recursive call detected: ${stack.join(" -> ")} -> ${def.name}`);
      const nextStack = [...stack, def.name];
      const context = {
        x,
        constants: CONSTANTS,
        builtins,
        functions: compiled,
        stack: nextStack
      };
      return clampNumber(evaluateAst(asts[def.name], context));
    };
  }

  return { compiled, errors, builtins, asts };
}

export function validateName(name, reserved = new Set()) {
  if (!name) return "Name is required";
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return "Use letters, numbers, and underscores";
  if (name === "x") return "'x' is reserved";
  if (reserved.has(name)) return `'${name}' is reserved`;
  return null;
}

export const CONSTANT_KEYS = Object.keys(CONSTANTS);
export { BUILTIN_KEYS };


export function collectDivisionNodes(node, acc = []) {
  if (!node) return acc;
  if (node.type === "binary" && node.op === "/") {
    acc.push({ num: node.left, den: node.right });
  }
  if (node.left) collectDivisionNodes(node.left, acc);
  if (node.right) collectDivisionNodes(node.right, acc);
  if (node.value) collectDivisionNodes(node.value, acc);
  if (node.args) node.args.forEach((arg) => collectDivisionNodes(arg, acc));
  return acc;
}
