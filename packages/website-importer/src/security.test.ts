import { describe, expect, it, vi } from "vitest";

import { SsrfSafeHttpClient, type Fetcher } from "./http.js";
import { isPrivateOrReservedIp, UrlSecurityPolicy, type DnsResolver } from "./security.js";

const allowedHosts = ["yokosushi.fr", "www.yokosushi.fr"];
const publicDns: DnsResolver = () => Promise.resolve([{ address: "93.184.216.34", family: 4 }]);

describe("protection SSRF", () => {
  it.each([
    "127.0.0.1",
    "10.10.0.2",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.1.10",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1"
  ])("bloque l’adresse privée ou réservée %s", (address) => {
    expect(isPrivateOrReservedIp(address)).toBe(true);
  });

  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])(
    "autorise l’adresse publique %s",
    (address) => {
      expect(isPrivateOrReservedIp(address)).toBe(false);
    }
  );

  it("exige un hôte exact, HTTPS, sans identifiants ni port arbitraire", async () => {
    const policy = new UrlSecurityPolicy(allowedHosts, publicDns);

    await expect(policy.assertSafe("https://www.yokosushi.fr.evil.test/")).rejects.toMatchObject({
      code: "HOST_NOT_ALLOWED"
    });
    await expect(policy.assertSafe("http://www.yokosushi.fr/")).rejects.toMatchObject({
      code: "PROTOCOL_NOT_ALLOWED"
    });
    await expect(policy.assertSafe("https://user@www.yokosushi.fr/")).rejects.toMatchObject({
      code: "CREDENTIALS_NOT_ALLOWED"
    });
    await expect(policy.assertSafe("https://www.yokosushi.fr:8443/")).rejects.toMatchObject({
      code: "PORT_NOT_ALLOWED"
    });
  });

  it("bloque un domaine autorisé qui se résout vers une IP privée", async () => {
    const privateDns: DnsResolver = () =>
      Promise.resolve([{ address: "169.254.169.254", family: 4 }]);
    const policy = new UrlSecurityPolicy(allowedHosts, privateDns);

    await expect(policy.assertSafe("https://www.yokosushi.fr/")).rejects.toMatchObject({
      code: "PRIVATE_ADDRESS_BLOCKED"
    });
  });

  it("revalide le DNS avant de suivre chaque redirection", async () => {
    let dnsCalls = 0;
    const rebindingDns: DnsResolver = () => {
      dnsCalls += 1;
      return Promise.resolve([
        dnsCalls === 1
          ? { address: "93.184.216.34", family: 4 }
          : { address: "127.0.0.1", family: 4 }
      ]);
    };
    const fetcher = vi.fn<Fetcher>(() =>
      Promise.resolve(new Response(null, { status: 302, headers: { location: "/private" } }))
    );
    const client = new SsrfSafeHttpClient(
      new UrlSecurityPolicy(allowedHosts, rebindingDns),
      {
        timeoutMs: 1_000,
        retries: 0,
        maxRedirects: 3,
        delayMs: 0,
        maxResponseBytes: 100_000,
        userAgent: "YokoSushiSocialAgent/Test"
      },
      fetcher
    );

    await expect(client.getText("https://www.yokosushi.fr/")).rejects.toMatchObject({
      code: "PRIVATE_ADDRESS_BLOCKED"
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(dnsCalls).toBe(2);
  });

  it("ne suit pas une redirection vers un domaine externe", async () => {
    const fetcher = vi.fn<Fetcher>(() =>
      Promise.resolve(
        new Response(null, { status: 302, headers: { location: "https://evil.example/" } })
      )
    );
    const client = new SsrfSafeHttpClient(
      new UrlSecurityPolicy(allowedHosts, publicDns),
      {
        timeoutMs: 1_000,
        retries: 0,
        maxRedirects: 3,
        delayMs: 0,
        maxResponseBytes: 100_000,
        userAgent: "YokoSushiSocialAgent/Test"
      },
      fetcher
    );

    await expect(client.getText("https://www.yokosushi.fr/")).rejects.toMatchObject({
      code: "HOST_NOT_ALLOWED"
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
