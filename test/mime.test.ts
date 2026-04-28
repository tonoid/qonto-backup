import { strict as assert } from "node:assert";
import { test } from "node:test";
import { extensionFromMime } from "../src/mime.ts";

test("maps standard mimes to expected extensions", () => {
  assert.equal(extensionFromMime("application/pdf"), "pdf");
  assert.equal(extensionFromMime("image/png"), "png");
  assert.equal(extensionFromMime("image/jpeg"), "jpg");
  assert.equal(extensionFromMime("image/heic"), "heic");
  assert.equal(extensionFromMime("image/webp"), "webp");
  assert.equal(extensionFromMime("image/tiff"), "tiff");
});

test("strips charset suffix and is case-insensitive", () => {
  assert.equal(extensionFromMime("Application/PDF; charset=binary"), "pdf");
});

test("falls back to bin for unknown or missing types", () => {
  assert.equal(extensionFromMime(undefined), "bin");
  assert.equal(extensionFromMime(null), "bin");
  assert.equal(extensionFromMime("application/octet-stream"), "bin");
  assert.equal(extensionFromMime(""), "bin");
});
