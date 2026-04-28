#!/usr/bin/env node
import { loadConfig } from "./config.ts";
import { log, setLogLevel } from "./logger.ts";
import { QontoApiError } from "./qonto-client.ts";
import { runSync } from "./sync.ts";

interface CliOptions {
  full: boolean;
  since?: string;
  dryRun: boolean;
  help: boolean;
  debug: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { full: false, dryRun: false, help: false, debug: false };
  for (const arg of argv) {
    if (arg === "--full") opts.full = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--debug") opts.debug = true;
    else if (arg.startsWith("--since=")) opts.since = arg.slice("--since=".length);
    else if (arg === "--since") {
      throw new Error("--since requires a value, use --since=YYYY-MM-DD");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: qonto-backup [options]",
      "",
      "Options:",
      "  --full                Ignore .state.json and resync from scratch",
      "  --since=YYYY-MM-DD    Override updated_at_from cursor for this run",
      "  --dry-run             Log what would happen without writing files",
      "  --debug               Verbose logs",
      "  -h, --help            Print this help",
      "",
      "Required env vars: QONTO_LOGIN, QONTO_SECRET_KEY, BACKUP_DIR",
      "",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  let cli: CliOptions;
  try {
    cli = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    printHelp();
    process.exit(2);
  }

  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.debug) setLogLevel("debug");

  const config = loadConfig();
  await runSync({
    config,
    full: cli.full,
    since: cli.since,
    dryRun: cli.dryRun,
  });
}

main().catch((err) => {
  if (err instanceof QontoApiError && err.status === 401) {
    log.error("auth.failed", {
      msg: "Qonto API rejected credentials. Check QONTO_LOGIN / QONTO_SECRET_KEY.",
      body: err.bodySnippet.slice(0, 200),
    });
    process.exit(3);
  }
  log.error("sync.failed", {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
