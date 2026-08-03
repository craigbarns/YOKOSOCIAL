import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface DnsAddress {
  address: string;
  family: number;
}

export type DnsResolver = (hostname: string) => Promise<readonly DnsAddress[]>;

export class UrlSecurityError extends Error {
  readonly code: string;
  readonly url: string;

  constructor(code: string, message: string, url: string) {
    super(message);
    this.name = "UrlSecurityError";
    this.code = code;
    this.url = url;
  }
}

const IPV4_BLOCKED_CIDRS = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const;

const IPV6_BLOCKED_CIDRS = [
  ["::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
] as const;

function ipv4ToBigInt(address: string): bigint | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let result = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8n) + BigInt(octet);
  }
  return result;
}

function ipv6ToBigInt(rawAddress: string): bigint | null {
  let address = rawAddress.toLowerCase();
  const zoneIndex = address.indexOf("%");
  if (zoneIndex >= 0) address = address.slice(0, zoneIndex);

  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":");
    if (lastColon < 0) return null;
    const ipv4 = ipv4ToBigInt(address.slice(lastColon + 1));
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    address = `${address.slice(0, lastColon)}:${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;

  const left = halves[0]?.length ? halves[0].split(":") : [];
  const right = halves[1]?.length ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;

  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  let result = 0n;
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    result = (result << 16n) + BigInt(`0x${group}`);
  }
  return result;
}

function isInCidr(value: bigint, base: bigint, prefix: number, bits: number): boolean {
  if (prefix === 0) return true;
  const shift = BigInt(bits - prefix);
  return value >> shift === base >> shift;
}

function isBlockedIpv4(address: string): boolean {
  const value = ipv4ToBigInt(address);
  if (value === null) return true;
  return IPV4_BLOCKED_CIDRS.some(([base, prefix]) => {
    const baseValue = ipv4ToBigInt(base);
    return baseValue !== null && isInCidr(value, baseValue, prefix, 32);
  });
}

function isBlockedIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null) return true;

  const mappedBase = ipv6ToBigInt("::ffff:0:0");
  if (mappedBase !== null && isInCidr(value, mappedBase, 96, 128)) {
    const ipv4 = [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 0xffn)).join(".");
    return isBlockedIpv4(ipv4);
  }

  if (
    IPV6_BLOCKED_CIDRS.some(([base, prefix]) => {
      const baseValue = ipv6ToBigInt(base);
      return baseValue !== null && isInCidr(value, baseValue, prefix, 128);
    })
  ) {
    return true;
  }

  const globalUnicastBase = ipv6ToBigInt("2000::");
  return globalUnicastBase === null || !isInCidr(value, globalUnicastBase, 3, 128);
}

export function isPrivateOrReservedIp(address: string): boolean {
  const version = isIP(address.split("%")[0] ?? address);
  if (version === 4) return isBlockedIpv4(address);
  if (version === 6) return isBlockedIpv6(address);
  return true;
}

function normalizeHost(host: string): string {
  return host.toLowerCase();
}

export function isExactAllowedHttpsUrl(
  rawUrl: string | URL,
  allowedHosts: readonly string[]
): boolean {
  try {
    const url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
    const normalizedHosts = new Set(allowedHosts.map(normalizeHost));
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (url.port === "" || url.port === "443") &&
      normalizedHosts.has(normalizeHost(url.hostname))
    );
  } catch {
    return false;
  }
}

const defaultDnsResolver: DnsResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export class UrlSecurityPolicy {
  private readonly allowedHosts: ReadonlySet<string>;

  constructor(
    allowedHosts: readonly string[],
    private readonly resolveDns: DnsResolver = defaultDnsResolver
  ) {
    if (allowedHosts.length === 0) throw new Error("Au moins un domaine doit être autorisé.");
    this.allowedHosts = new Set(allowedHosts.map(normalizeHost));
  }

  isAllowedHost(url: string | URL): boolean {
    return isExactAllowedHttpsUrl(url, [...this.allowedHosts]);
  }

  async assertSafe(rawUrl: string | URL): Promise<URL> {
    let url: URL;
    try {
      url = rawUrl instanceof URL ? new URL(rawUrl.href) : new URL(rawUrl);
    } catch {
      throw new UrlSecurityError("INVALID_URL", "L’URL fournie est invalide.", String(rawUrl));
    }

    if (url.protocol !== "https:") {
      throw new UrlSecurityError(
        "PROTOCOL_NOT_ALLOWED",
        "Seules les URLs HTTPS sont autorisées.",
        url.href
      );
    }
    if (url.username || url.password) {
      throw new UrlSecurityError(
        "CREDENTIALS_NOT_ALLOWED",
        "Les identifiants intégrés aux URLs sont interdits.",
        url.href
      );
    }
    if (url.port && url.port !== "443") {
      throw new UrlSecurityError(
        "PORT_NOT_ALLOWED",
        "Le port demandé n’est pas autorisé.",
        url.href
      );
    }
    if (!this.allowedHosts.has(normalizeHost(url.hostname))) {
      throw new UrlSecurityError(
        "HOST_NOT_ALLOWED",
        "Le domaine demandé ne figure pas dans la liste blanche.",
        url.href
      );
    }

    let addresses: readonly DnsAddress[];
    try {
      addresses = await this.resolveDns(url.hostname);
    } catch {
      throw new UrlSecurityError(
        "DNS_LOOKUP_FAILED",
        "La résolution DNS du domaine a échoué.",
        url.href
      );
    }

    if (addresses.length === 0) {
      throw new UrlSecurityError(
        "DNS_EMPTY",
        "La résolution DNS n’a retourné aucune adresse.",
        url.href
      );
    }
    if (addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
      throw new UrlSecurityError(
        "PRIVATE_ADDRESS_BLOCKED",
        "Le domaine se résout vers une adresse privée ou réservée.",
        url.href
      );
    }

    url.hash = "";
    return url;
  }
}
