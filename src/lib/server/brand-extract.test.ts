import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateAddress } from "./brand-extract";

test("private, loopback, link-local and CGNAT IPv4 are blocked", () => {
  for (const address of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
});

test("IPv4-mapped IPv6 is unmapped before the check, in dotted and hex form", () => {
  for (const address of ["::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:172.16.0.1", "::ffff:100.64.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:a9fe:a9fe"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
});

test("IPv6 loopback, unique-local and link-local are blocked", () => {
  for (const address of ["::1", "fd00::1", "fe80::1"]) assert.equal(isPrivateAddress(address), true, address);
});

test("public addresses pass", () => {
  for (const address of ["151.101.1.140", "2606:4700::6810:84e5", "::ffff:8.8.8.8"]) assert.equal(isPrivateAddress(address), false, address);
});

// End to end in a real browser: 127.0.0.1 plays the public site, localhost plays the private target.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright-core";
import { extractDesign } from "../../../packages/design-extract/src/extractor.js";
import { createGuard } from "./brand-extract";

function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; port: number }> {
  const server = createServer(handler);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port })));
}

const anythingButLoopbackIsPrivate = async (host: string): Promise<boolean> => host !== "127.0.0.1";

test("a redirect to a private host stops the crawl before extraction", async () => {
  const target = await listen((_request, response) => response.end("<title>secret</title>"));
  const site = await listen((_request, response) => {
    response.writeHead(302, { location: `http://localhost:${target.port}/secret` });
    response.end();
  });
  const guard = createGuard(anythingButLoopbackIsPrivate);
  try {
    await assert.rejects(
      extractDesign(`http://127.0.0.1:${site.port}/`, { launch: () => chromium.launch({ headless: true }), prepareContext: guard.prepareContext, beforeExtract: guard.assertClean }),
      /redirected to a local or internal address/,
    );
  } finally {
    site.server.close();
    target.server.close();
  }
});

test("subresources on private hosts are blocked outright", async () => {
  let privateHits = 0;
  const target = await listen((_request, response) => {
    privateHits++;
    response.end("x");
  });
  const site = await listen((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<title>Shop</title><img src="http://localhost:${target.port}/pixel.png"><h1>Hi</h1>`);
  });
  const guard = createGuard(anythingButLoopbackIsPrivate);
  try {
    const { data } = await extractDesign(`http://127.0.0.1:${site.port}/`, { launch: () => chromium.launch({ headless: true }), prepareContext: guard.prepareContext });
    assert.equal(data.title, "Shop");
    assert.equal(privateHits, 0);
  } finally {
    site.server.close();
    target.server.close();
  }
});
