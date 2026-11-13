/**
 * money://sync deep links carry a URL that the phone either uploads the whole
 * finance DB to (backup) or overwrites its data from (import). Any app or web
 * page can open a deep link, so only http(s) addresses on the local network
 * are accepted: localhost, private IPv4 ranges and mDNS `.local` names.
 * Shared by the phone app; kept in src/lib so it is unit-tested.
 */
export function localSyncHost(raw: string | undefined): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    const isPrivate =
      a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
    return isPrivate ? url.host : null;
  }
  if (host === "localhost" || host.endsWith(".local")) return url.host;
  return null;
}
