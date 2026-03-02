import { mkdir } from "fs/promises";
import path from "path";

export async function captureScreenshot(
  url: string,
  projectDir: string,
  selector?: string,
): Promise<string> {
  let playwright: any;
  try {
    // @ts-ignore — optional dependency
    playwright = await import("playwright");
  } catch {
    throw new Error(
      "Playwright is required for screenshots but not installed. Install with: bunx playwright install chromium",
    );
  }

  const screenshotDir = path.join(projectDir, ".aceto", "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const filename = `screenshot-${Date.now()}.png`;
  const filePath = path.join(screenshotDir, filename);

  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    if (selector) {
      const element = await page.locator(selector).first();
      await element.screenshot({ type: "png", path: filePath });
    } else {
      await page.screenshot({ type: "png", fullPage: true, path: filePath });
    }
  } finally {
    await browser.close();
  }

  return filePath;
}
