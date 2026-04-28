import { strict as assert } from "node:assert";
import { test } from "node:test";
import { pickSlugSource, slugify } from "../src/slug.ts";

test("slugify lowercases and kebabs accented input", () => {
  assert.equal(slugify("Café Tournée n°42"), "cafe-tournee-n-42");
});

test("slugify strips combining diacritics from NFD input", () => {
  assert.equal(slugify("Crédit Agricole"), "credit-agricole");
});

test("slugify trims leading/trailing dashes", () => {
  assert.equal(slugify("--Hello--World--"), "hello-world");
});

test("slugify caps at 50 characters and trims trailing dash", () => {
  const long = "A".repeat(80);
  const out = slugify(long);
  assert.equal(out.length <= 50, true);
});

test("slugify caps long input with dashes without trailing dash", () => {
  const noisy = "abc " + "d".repeat(100);
  const out = slugify(noisy);
  assert.equal(out.endsWith("-"), false);
});

test("slugify returns empty string for nullish or empty input", () => {
  assert.equal(slugify(null), "");
  assert.equal(slugify(undefined), "");
  assert.equal(slugify(""), "");
  assert.equal(slugify("   "), "");
});

test("pickSlugSource prefers clean_counterparty_name", () => {
  const slug = pickSlugSource({
    id: "tx_1",
    clean_counterparty_name: "SNCF Connect",
    label: "ignored",
    reference: "ignored",
  });
  assert.equal(slug, "sncf-connect");
});

test("pickSlugSource falls back to label when counterparty empty", () => {
  const slug = pickSlugSource({
    id: "tx_1",
    clean_counterparty_name: "",
    label: "Loyer Mars",
    reference: "ignored",
  });
  assert.equal(slug, "loyer-mars");
});

test("pickSlugSource falls back to reference when label empty", () => {
  const slug = pickSlugSource({
    id: "tx_1",
    clean_counterparty_name: null,
    label: null,
    reference: "VIR-2025-001",
  });
  assert.equal(slug, "vir-2025-001");
});

test("pickSlugSource falls back to id when nothing else available", () => {
  const slug = pickSlugSource({ id: "txn_abc123" });
  assert.equal(slug, "txn-abc123");
});

test("pickSlugSource returns 'transaction' if everything strips empty", () => {
  const slug = pickSlugSource({
    id: "!!!",
    clean_counterparty_name: "***",
    label: "###",
    reference: "@@@",
  });
  assert.equal(slug, "transaction");
});
