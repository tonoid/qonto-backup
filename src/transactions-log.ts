import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, ensureDir } from "./atomic.ts";
import { monthDirFromEmittedAt } from "./filename.ts";

export interface TransactionRecord {
  id: string;
  emitted_at: string;
  [key: string]: unknown;
}

interface MonthBuffer {
  filePath: string;
  byId: Map<string, TransactionRecord>;
  loaded: boolean;
  dirty: boolean;
}

export class TransactionsLog {
  private readonly buffers = new Map<string, MonthBuffer>();
  private readonly backupDir: string;
  private readonly dryRun: boolean;

  constructor(backupDir: string, dryRun: boolean = false) {
    this.backupDir = backupDir;
    this.dryRun = dryRun;
  }

  async upsert(transaction: TransactionRecord): Promise<void> {
    const monthDir = monthDirFromEmittedAt(transaction.emitted_at);
    const filePath = path.join(this.backupDir, monthDir, "transactions.jsonl");
    const buf = await this.getBuffer(filePath);
    const existing = buf.byId.get(transaction.id);
    const next = JSON.stringify(transaction);
    const prev = existing ? JSON.stringify(existing) : undefined;
    if (prev !== next) {
      buf.byId.set(transaction.id, transaction);
      buf.dirty = true;
    }
  }

  async flush(): Promise<void> {
    if (this.dryRun) return;
    for (const buf of this.buffers.values()) {
      if (!buf.dirty) continue;
      const lines = Array.from(buf.byId.values())
        .sort((a, b) => a.emitted_at.localeCompare(b.emitted_at) || a.id.localeCompare(b.id))
        .map((tx) => JSON.stringify(tx))
        .join("\n");
      await ensureDir(path.dirname(buf.filePath));
      await atomicWriteFile(buf.filePath, lines + (lines.length > 0 ? "\n" : ""));
      buf.dirty = false;
    }
  }

  private async getBuffer(filePath: string): Promise<MonthBuffer> {
    let buf = this.buffers.get(filePath);
    if (buf) return buf;
    buf = { filePath, byId: new Map(), loaded: false, dirty: false };
    this.buffers.set(filePath, buf);
    await this.loadIfPresent(buf);
    return buf;
  }

  private async loadIfPresent(buf: MonthBuffer): Promise<void> {
    if (buf.loaded) return;
    buf.loaded = true;
    try {
      const raw = await readFile(buf.filePath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as TransactionRecord;
          if (parsed && typeof parsed.id === "string") {
            buf.byId.set(parsed.id, parsed);
          }
        } catch {
          // skip corrupted line
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
