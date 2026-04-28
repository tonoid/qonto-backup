import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function atomicWriteFile(
  destination: string,
  data: Buffer | Uint8Array | string,
): Promise<void> {
  await ensureDir(path.dirname(destination));
  const tmp = `${destination}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, destination);
}

export async function atomicWriteJson(destination: string, value: unknown): Promise<void> {
  await atomicWriteFile(destination, JSON.stringify(value, null, 2) + "\n");
}
