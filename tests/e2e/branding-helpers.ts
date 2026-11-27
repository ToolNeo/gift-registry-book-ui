import { expect, type Locator } from "@playwright/test";

/** Confirm bundled branding assets without depending on Vite's development or build URL prefix. */
export async function expectDefaultBrandingAsset(
  locator: Locator,
  kind: "logo" | "ico" | "background",
  attribute = "src",
) {
  const source = await locator.getAttribute(attribute);
  expect(source).toBeTruthy();
  if (kind === "background") {
    let bytes: Buffer;
    if (source!.startsWith("data:image/jpeg;base64,")) {
      bytes = Buffer.from(
        source!.slice("data:image/jpeg;base64,".length),
        "base64",
      );
    } else {
      const response = await locator.page().request.get(source!);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toContain("image/jpeg");
      bytes = await response.body();
    }
    expect(bytes.length).toBeGreaterThan(1024);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    return;
  }
  let svg: string;
  if (source!.startsWith("data:image/svg+xml,")) {
    svg = decodeURIComponent(source!.slice("data:image/svg+xml,".length));
  } else if (source!.startsWith("data:image/svg+xml;base64,")) {
    svg = Buffer.from(
      source!.slice("data:image/svg+xml;base64,".length),
      "base64",
    ).toString();
  } else {
    const response = await locator.page().request.get(source!);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    svg = await response.text();
  }
  expect(svg).toContain("<title>电子礼簿标志</title>");
  expect(svg).toMatch(/viewBox=["']0 0 256 256["']/);
}
