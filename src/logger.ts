type Level = "debug" | "info" | "warn" | "error";

let minLevel: Level = "info";

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
} as const;

const LEVEL_COLOR: Record<Level, string> = {
  debug: COLOR.gray,
  info: COLOR.cyan,
  warn: COLOR.yellow,
  error: COLOR.red,
};

const LEVEL_LABEL: Record<Level, string> = {
  debug: "DBG",
  info: "INF",
  warn: "WRN",
  error: "ERR",
};

export function setLogLevel(level: Level): void {
  minLevel = level;
}

function pickStream(level: Level): NodeJS.WriteStream {
  return level === "error" || level === "warn" ? process.stderr : process.stdout;
}

function shouldPretty(stream: NodeJS.WriteStream): boolean {
  if (process.env.LOG_FORMAT === "json") return false;
  if (process.env.LOG_FORMAT === "pretty") return true;
  return !!stream.isTTY;
}

function formatPretty(level: Level, msg: string, fields?: Record<string, unknown>): string {
  const time = new Date().toLocaleTimeString("fr-FR", { hour12: false });
  const color = LEVEL_COLOR[level];
  const head = `${COLOR.dim}${time}${COLOR.reset} ${color}${LEVEL_LABEL[level]}${COLOR.reset} ${msg}`;
  if (!fields) return head;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${COLOR.dim}${key}=${COLOR.reset}${formatValue(value)}`);
  }
  return parts.length ? `${head} ${parts.join(" ")}` : head;
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    return /[\s"]/.test(value) ? JSON.stringify(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[minLevel]) return;
  const stream = pickStream(level);
  if (shouldPretty(stream)) {
    stream.write(formatPretty(level, msg, fields) + "\n");
    return;
  }
  const entry = { ts: new Date().toISOString(), level, msg, ...fields };
  stream.write(JSON.stringify(entry) + "\n");
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
