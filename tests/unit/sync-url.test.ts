import { describe, expect, it } from "vitest";
import { localSyncHost } from "@/lib/sync-url";

describe("money://sync target", () => {
  it("accepts the laptop on the local network", () => {
    expect(localSyncHost("http://192.168.1.20:3000/api/export?t=abc")).toBe("192.168.1.20:3000");
    expect(localSyncHost("http://10.0.0.5/x")).toBe("10.0.0.5");
    expect(localSyncHost("http://172.20.1.1/x")).toBe("172.20.1.1");
    expect(localSyncHost("http://macbook.local:3000/x")).toBe("macbook.local:3000");
    expect(localSyncHost("http://localhost:3000/x")).toBe("localhost:3000");
  });

  it("rejects internet hosts, other schemes and tricks", () => {
    expect(localSyncHost("https://evil.example/upload")).toBeNull();
    expect(localSyncHost("http://8.8.8.8/x")).toBeNull();
    expect(localSyncHost("http://172.32.0.1/x")).toBeNull();
    expect(localSyncHost("http://192.168.1.300/x")).toBeNull();
    expect(localSyncHost("ftp://192.168.1.2/x")).toBeNull();
    expect(localSyncHost("javascript:alert(1)")).toBeNull();
    expect(localSyncHost("http://user:pw@192.168.1.2/x")).toBeNull();
    expect(localSyncHost("http://192.168.1.2.evil.example/x")).toBeNull();
    expect(localSyncHost(undefined)).toBeNull();
  });
});
