import { downloadAttachmentsForTransaction, type AttachmentResource } from "./attachments.ts";
import type { Config } from "./config.ts";
import { log } from "./logger.ts";
import { QontoClient } from "./qonto-client.ts";
import {
  fetchOrganization,
  syncBeneficiaries,
  syncLabels,
  writeOrganizationSnapshot,
  type BankAccount,
} from "./snapshots.ts";
import { loadState, saveState, type SyncState } from "./state.ts";
import { TransactionsLog, type TransactionRecord } from "./transactions-log.ts";

export interface SyncOptions {
  config: Config;
  full?: boolean;
  since?: string;
  dryRun?: boolean;
}

export interface SyncSummary {
  bank_accounts: number;
  transactions_seen: number;
  attachments_downloaded: number;
  attachments_skipped: number;
  attachments_dry_run: number;
  attachments_failed: number;
}

export async function runSync(opts: SyncOptions): Promise<SyncSummary> {
  const { config } = opts;
  const dryRun = !!opts.dryRun;
  const client = new QontoClient({
    login: config.login,
    secretKey: config.secretKey,
    baseUrl: config.baseUrl,
  });

  const summary: SyncSummary = {
    bank_accounts: 0,
    transactions_seen: 0,
    attachments_downloaded: 0,
    attachments_skipped: 0,
    attachments_dry_run: 0,
    attachments_failed: 0,
  };

  const state = opts.full ? freshState() : await loadState(config.backupDir);

  log.info("sync.start", {
    backup_dir: config.backupDir,
    full: !!opts.full,
    since: opts.since,
    dry_run: dryRun,
  });

  const orgPayload = await fetchOrganization(client);
  if (!dryRun) await writeOrganizationSnapshot(config.backupDir, orgPayload);

  if (!dryRun) {
    await syncLabels(client, config.backupDir);
    await syncBeneficiaries(client, config.backupDir);
  } else {
    log.info("snapshot.skipped_dry_run", {});
  }

  const accounts = orgPayload.organization?.bank_accounts ?? [];
  summary.bank_accounts = accounts.length;

  const txLog = new TransactionsLog(config.backupDir, dryRun);

  for (const account of accounts) {
    const accountId = account.id;
    if (!accountId) continue;
    const cursor = pickCursor(state, accountId, opts.since);
    const accountResult = await syncAccount({
      account,
      cursor,
      client,
      config,
      dryRun,
      txLog,
    });
    summary.transactions_seen += accountResult.transactionsSeen;
    summary.attachments_downloaded += accountResult.downloaded;
    summary.attachments_skipped += accountResult.skipped;
    summary.attachments_dry_run += accountResult.dryRunCount;
    summary.attachments_failed += accountResult.failed;

    if (!dryRun) {
      state.accounts[accountId] = {
        updated_at_from: accountResult.maxUpdatedAt ?? state.accounts[accountId]?.updated_at_from,
        last_sync_at: new Date().toISOString(),
      };
    }
  }

  await txLog.flush();
  if (!dryRun) await saveState(config.backupDir, state);

  log.info("sync.done", { ...summary });
  return summary;
}

function freshState(): SyncState {
  return { version: 1, accounts: {} };
}

function pickCursor(state: SyncState, accountId: string, since?: string): string | undefined {
  if (since) return new Date(since).toISOString();
  return state.accounts[accountId]?.updated_at_from;
}

interface AccountSyncResult {
  transactionsSeen: number;
  downloaded: number;
  skipped: number;
  dryRunCount: number;
  failed: number;
  maxUpdatedAt?: string;
}

async function syncAccount(args: {
  account: BankAccount;
  cursor: string | undefined;
  client: QontoClient;
  config: Config;
  dryRun: boolean;
  txLog: TransactionsLog;
}): Promise<AccountSyncResult> {
  const { account, cursor, client, config, dryRun, txLog } = args;
  const result: AccountSyncResult = {
    transactionsSeen: 0,
    downloaded: 0,
    skipped: 0,
    dryRunCount: 0,
    failed: 0,
  };

  log.info("account.sync_start", {
    account_id: account.id,
    iban: account.iban,
    cursor,
  });

  const query: Record<string, string | string[] | number | undefined> = {
    bank_account_id: account.id,
    "status[]": ["completed", "pending", "declined"],
    "includes[]": "attachments",
    sort_by: "updated_at:asc",
    per_page: 100,
  };
  if (cursor) query.updated_at_from = cursor;

  for await (const page of client.paginate<TransactionWithAttachments>(
    "transactions",
    query,
    "transactions",
  )) {
    for (const tx of page.items) {
      if (!tx?.id || !tx.emitted_at) continue;
      result.transactionsSeen += 1;
      const record: TransactionRecord = tx;
      await txLog.upsert(record);

      const downloads = await downloadAttachmentsForTransaction(tx, {
        backupDir: config.backupDir,
        dryRun,
        client,
      });
      for (const dl of downloads) {
        if (dl.status === "downloaded") result.downloaded += 1;
        else if (dl.status === "skipped") result.skipped += 1;
        else if (dl.status === "dry_run") result.dryRunCount += 1;
        else if (dl.status === "failed") result.failed += 1;
      }

      if (tx.updated_at) {
        if (!result.maxUpdatedAt || tx.updated_at > result.maxUpdatedAt) {
          result.maxUpdatedAt = tx.updated_at;
        }
      }
    }
    log.info("account.page_done", {
      account_id: account.id,
      page: page.meta.current_page,
      total_pages: page.meta.total_pages,
      items: page.items.length,
    });
  }

  log.info("account.sync_done", {
    account_id: account.id,
    transactions: result.transactionsSeen,
    downloaded: result.downloaded,
    skipped: result.skipped,
    failed: result.failed,
    max_updated_at: result.maxUpdatedAt,
  });
  return result;
}

interface TransactionWithAttachments extends TransactionRecord {
  updated_at?: string;
  attachments?: AttachmentResource[] | null;
}
