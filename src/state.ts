import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteJson } from "./atomic.ts";

export interface AccountState {
  updated_at_from?: string;
  last_sync_at?: string;
}

export interface SyncState {
  version: 1;
  accounts: Record<string, AccountState>;
}

const EMPTY_STATE: SyncState = { version: 1, accounts: {} };

export function statePath(backupDir: string): string {
  return path.join(backupDir, ".state.json");
}

export async function loadState(backupDir: string): Promise<SyncState> {
  try {
    const raw = await readFile(statePath(backupDir), "utf8");
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    if (!parsed || typeof parsed !== "object") return { ...EMPTY_STATE };
    return {
      version: 1,
      accounts: parsed.accounts ?? {},
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...EMPTY_STATE };
    }
    throw err;
  }
}

export async function saveState(backupDir: string, state: SyncState): Promise<void> {
  await atomicWriteJson(statePath(backupDir), state);
}
