// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ className: "", variable: "" });
  return { Bebas_Neue: font, DM_Sans: font, Inter: font, JetBrains_Mono: font };
});
vi.mock("next-themes", () => ({ ThemeProvider: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

async function rootMetadata(appStoreUrl: string | undefined) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_APP_STORE_URL", appStoreUrl);
  return (await import("./layout")).metadata;
}

describe("root layout metadata: Smart App Banner", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("emits no apple-itunes-app tag while the App Store listing is unset", async () => {
    expect((await rootMetadata(undefined)).itunes).toBeUndefined();
    expect((await rootMetadata("")).itunes).toBeUndefined();
  });

  it("emits no tag for an invalid listing URL", async () => {
    expect((await rootMetadata("https://example.com/app")).itunes).toBeUndefined();
  });

  it("emits the app id once the listing is set", async () => {
    const meta = await rootMetadata("https://apps.apple.com/app/id6774629438");
    expect(meta.itunes).toEqual({ appId: "6774629438" });
  });
});
