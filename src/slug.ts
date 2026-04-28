const MAX_LEN = 50;
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string | null | undefined): string {
  if (!input) return "";
  const normalized = input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, MAX_LEN).replace(/-+$/g, "");
}

export function pickSlugSource(tx: {
  clean_counterparty_name?: string | null;
  label?: string | null;
  reference?: string | null;
  id: string;
}): string {
  const candidate =
    nonEmpty(tx.clean_counterparty_name) ??
    nonEmpty(tx.label) ??
    nonEmpty(tx.reference) ??
    tx.id;
  const slug = slugify(candidate);
  return slug || slugify(tx.id) || "transaction";
}

function nonEmpty(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
