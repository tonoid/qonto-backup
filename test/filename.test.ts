import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAttachmentPath, monthDirFromEmittedAt, partsFromEmittedAt } from "../src/filename.ts";

test("partsFromEmittedAt parses ISO date in UTC", () => {
  const parts = partsFromEmittedAt("2026-04-15T08:30:00.000Z");
  assert.deepEqual(parts, { year: "2026", month: "04", day: "15" });
});

test("partsFromEmittedAt zero-pads month and day", () => {
  const parts = partsFromEmittedAt("2026-01-03T00:00:00.000Z");
  assert.deepEqual(parts, { year: "2026", month: "01", day: "03" });
});

test("partsFromEmittedAt throws on invalid input", () => {
  assert.throws(() => partsFromEmittedAt("not-a-date"));
});

test("monthDirFromEmittedAt builds YYYY/MM", () => {
  assert.equal(monthDirFromEmittedAt("2026-04-15T00:00:00Z"), "2026/04");
});

test("buildAttachmentPath composes day-slug-id.ext", () => {
  const built = buildAttachmentPath({
    transaction: {
      id: "tx_1",
      emitted_at: "2026-04-15T08:30:00Z",
      clean_counterparty_name: "Crédit Mutuel",
    },
    attachment: { id: "att_xyz", file_content_type: "application/pdf" },
  });
  assert.equal(built.year, "2026");
  assert.equal(built.month, "04");
  assert.equal(built.day, "15");
  assert.equal(built.relativeDir, "2026/04");
  assert.equal(built.filename, "15-credit-mutuel-att_xyz.pdf");
  assert.equal(built.relativePath, "2026/04/15-credit-mutuel-att_xyz.pdf");
});

test("buildAttachmentPath appends -probative for probative variant", () => {
  const built = buildAttachmentPath({
    transaction: {
      id: "tx_2",
      emitted_at: "2026-04-15T08:30:00Z",
      label: "Loyer",
    },
    attachment: { id: "att_p", file_content_type: "application/pdf" },
    probative: true,
  });
  assert.equal(built.filename, "15-loyer-att_p-probative.pdf");
});

test("buildAttachmentPath defaults extension to bin for unknown mime", () => {
  const built = buildAttachmentPath({
    transaction: {
      id: "tx_3",
      emitted_at: "2026-04-15T08:30:00Z",
      reference: "REF",
    },
    attachment: { id: "att_q", file_content_type: "application/foo" },
  });
  assert.equal(built.filename.endsWith(".bin"), true);
});

test("buildAttachmentPath uses transaction id as last-resort slug", () => {
  const built = buildAttachmentPath({
    transaction: { id: "tx_only", emitted_at: "2026-04-15T08:30:00Z" },
    attachment: { id: "att_z", file_content_type: "image/png" },
  });
  assert.equal(built.filename, "15-tx-only-att_z.png");
});
