import path from "node:path";
import { extensionFromMime } from "./mime.ts";
import { pickSlugSource } from "./slug.ts";

export interface AttachmentLike {
  id: string;
  file_content_type?: string | null;
}

export interface TransactionLike {
  id: string;
  emitted_at: string;
  clean_counterparty_name?: string | null;
  label?: string | null;
  reference?: string | null;
}

export interface BuiltPath {
  year: string;
  month: string;
  day: string;
  relativeDir: string;
  relativePath: string;
  filename: string;
}

export function partsFromEmittedAt(emittedAt: string): {
  year: string;
  month: string;
  day: string;
} {
  const date = new Date(emittedAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid emitted_at: ${emittedAt}`);
  }
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return { year, month, day };
}

export function buildAttachmentPath(args: {
  transaction: TransactionLike;
  attachment: AttachmentLike;
  probative?: boolean;
}): BuiltPath {
  const { year, month, day } = partsFromEmittedAt(args.transaction.emitted_at);
  const slug = pickSlugSource(args.transaction);
  const ext = extensionFromMime(args.attachment.file_content_type);
  const suffix = args.probative ? "-probative" : "";
  const filename = `${day}-${slug}-${args.attachment.id}${suffix}.${ext}`;
  const relativeDir = path.join(year, month);
  return {
    year,
    month,
    day,
    relativeDir,
    filename,
    relativePath: path.join(relativeDir, filename),
  };
}

export function monthDirFromEmittedAt(emittedAt: string): string {
  const { year, month } = partsFromEmittedAt(emittedAt);
  return path.join(year, month);
}
