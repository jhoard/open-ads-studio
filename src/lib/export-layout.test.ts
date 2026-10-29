import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPORT_SIZES, exportLayout, type Box } from "./export-layout";

const inside = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;

for (const size of EXPORT_SIZES) {
  test(`${size}: every block sits on the canvas and the badge sits on the media`, () => {
    const layout = exportLayout(size);
    const canvas = { x: 0, y: 0, width: layout.width, height: layout.height };
    for (const box of [layout.media, layout.copy, layout.logo, layout.badge]) assert.ok(inside(box, canvas));
    assert.ok(inside(layout.badge, layout.media));
  });

  test(`${size}: the badge stays out of the product's central column`, () => {
    const { media, badge } = exportLayout(size);
    const centerLeft = media.x + media.width * 0.3;
    const centerRight = media.x + media.width * 0.7;
    const overlaps = badge.x < centerRight && badge.x + badge.width > centerLeft && badge.y + badge.height > media.y + media.height * 0.2;
    assert.ok(!overlaps);
  });
}

test("panel layouts keep the creative at 4:5", () => {
  for (const size of ["9:16", "16:9"] as const) {
    const { media } = exportLayout(size);
    assert.equal(Math.round((media.width / media.height) * 100), 80);
  }
});
