import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export class CrawlInputError extends Error {}

// Public URL checks shared by website crawling and logo downloads.
const BLOCKED = new BlockList();
for (const [net, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["64:ff9b::", 96], ["2001:db8::", 32]] as const) BLOCKED.addSubnet(net, prefix, "ipv6");

function unmapIPv4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) ?? /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = unmapIPv4(address);
  if (mapped) return BLOCKED.check(mapped, "ipv4");
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? "ipv4" : "ipv6");
}

export const isLocalName = (host: string): boolean => host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal");

export interface VettedSite {
  url: URL;
  /** Pin the connection so a DNS rebind cannot swap in a private address. */
  address: string;
}

export async function validateSiteUrl(raw: string): Promise<VettedSite> {
  let url: URL;
  try { url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); }
  catch { throw new CrawlInputError("That does not look like a website address."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CrawlInputError("Use an http or https website address.");
  if (url.username || url.password) throw new CrawlInputError("Use a public website address without login credentials.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isLocalName(host)) throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((entry) => entry.address);
  if (addresses.length === 0) throw new CrawlInputError(`Could not find ${host}.`);
  if (addresses.some(isPrivateAddress)) throw new CrawlInputError("Local and internal addresses cannot be crawled.");
  return { url, address: addresses[0] };
}
