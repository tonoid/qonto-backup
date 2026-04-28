import { stat } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile, ensureDir } from "./atomic.ts";
import { buildAttachmentPath, type AttachmentLike, type TransactionLike } from "./filename.ts";
import { log } from "./logger.ts";
import { QontoClient } from "./qonto-client.ts";

export interface AttachmentResource extends AttachmentLike {
  url?: string | null;
  file_name?: string | null;
  file_size?: number | string | null;
  probative_attachment?: AttachmentResource | null;
}

export interface DownloadResult {
  status: "downloaded" | "skipped" | "dry_run" | "failed" | "no_url";
  path: string;
  bytes?: number;
  error?: string;
}

export interface DownloadOptions {
  backupDir: string;
  dryRun: boolean;
  client: QontoClient;
  fetchImpl?: typeof fetch;
}

export async function downloadAttachmentsForTransaction(
  transaction: TransactionLike & { attachments?: AttachmentResource[] | null },
  opts: DownloadOptions,
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  const attachments = transaction.attachments ?? [];
  for (const attachment of attachments) {
    if (!attachment?.id) continue;
    results.push(await tryDownload(transaction, attachment, attachment, false, opts));
    const probative = attachment.probative_attachment;
    if (probative && probative.url) {
      results.push(
        await tryDownload(
          transaction,
          { ...probative, id: attachment.id },
          attachment,
          true,
          opts,
        ),
      );
    }
  }
  return results;
}

async function tryDownload(
  transaction: TransactionLike,
  attachment: AttachmentResource,
  parent: AttachmentResource,
  probative: boolean,
  opts: DownloadOptions,
): Promise<DownloadResult> {
  try {
    return await downloadOne(transaction, attachment, parent, probative, opts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("attachment.failed", {
      transaction_id: transaction.id,
      attachment_id: parent.id,
      probative,
      error: message,
    });
    return { status: "failed", path: "", error: message };
  }
}

async function downloadOne(
  transaction: TransactionLike,
  attachment: AttachmentResource,
  parent: AttachmentResource,
  probative: boolean,
  opts: DownloadOptions,
): Promise<DownloadResult> {
  const built = buildAttachmentPath({ transaction, attachment, probative });
  const absolute = path.join(opts.backupDir, built.relativePath);

  if (await fileExists(absolute)) {
    return { status: "skipped", path: built.relativePath };
  }

  if (opts.dryRun) {
    log.info("attachment.would_download", {
      transaction_id: transaction.id,
      attachment_id: parent.id,
      probative,
      path: built.relativePath,
    });
    return { status: "dry_run", path: built.relativePath };
  }

  const buffer = await fetchAttachmentBinary(attachment, parent, probative, opts);
  await ensureDir(path.dirname(absolute));
  await atomicWriteFile(absolute, buffer);
  log.info("attachment.downloaded", {
    transaction_id: transaction.id,
    attachment_id: parent.id,
    probative,
    path: built.relativePath,
    bytes: buffer.byteLength,
  });
  return { status: "downloaded", path: built.relativePath, bytes: buffer.byteLength };
}

async function fetchAttachmentBinary(
  attachment: AttachmentResource,
  parent: AttachmentResource,
  probative: boolean,
  opts: DownloadOptions,
): Promise<Buffer> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = attachment.url;
  if (url) {
    try {
      return await fetchPresignedUrl(url, fetchImpl);
    } catch (err) {
      if (!(err instanceof PresignedExpiredError)) throw err;
      log.warn("attachment.url_expired", { attachment_id: parent.id, probative });
    }
  }

  if (!parent.id) {
    throw new Error("Cannot refresh attachment URL: missing parent attachment id");
  }

  const refreshed = await opts.client.getJson<{ attachment?: AttachmentResource }>(
    `attachments/${parent.id}`,
  );
  const refreshedAttachment = refreshed.attachment;
  const freshUrl = probative
    ? refreshedAttachment?.probative_attachment?.url
    : refreshedAttachment?.url;
  if (!freshUrl) {
    throw new MissingUrlError(parent.id, probative);
  }
  return fetchPresignedUrl(freshUrl, fetchImpl);
}

class MissingUrlError extends Error {
  constructor(attachmentId: string, probative: boolean) {
    super(
      `No ${probative ? "probative " : ""}url returned when refreshing attachment ${attachmentId}`,
    );
    this.name = "MissingUrlError";
  }
}

class PresignedExpiredError extends Error {
  status: number;
  constructor(status: number) {
    super(`Presigned URL expired (status ${status})`);
    this.status = status;
  }
}

async function fetchPresignedUrl(url: string, fetchImpl: typeof fetch): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (response.status === 403 || response.status === 410) {
    throw new PresignedExpiredError(response.status);
  }
  if (!response.ok) {
    throw new Error(`Attachment download failed: HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}
