const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

export function extensionFromMime(contentType: string | null | undefined): string {
  if (!contentType) return "bin";
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TO_EXT[normalized] ?? "bin";
}
