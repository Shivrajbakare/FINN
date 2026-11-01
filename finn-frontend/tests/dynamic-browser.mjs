// Real local UI + hosted PostgreSQL for ITC; isolated mock routes only for failure states.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const { chromium } = await import(pathToFileURL(path.resolve("../tmp/browser-tools/node_modules/playwright-core/index.mjs")));
const output = path.resolve("../docs/verification/dynamic-browser");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.FINN_CHROMIUM_PATH });
const report = { cases: [], errors: [], live: "Real API, hosted PostgreSQL and previously verified official ITC document", mocked: "Unknown company and API failure only" };
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.errors.push(error.message));
    await page.goto(`${process.env.FINN_UI_URL || "http://127.0.0.1:3000"}/research`);
    await page.getByRole("heading", { name: "Research a company", exact: true }).waitFor();
    await page.getByLabel("Reporting document", { exact: true }).waitFor({ timeout: 30000 });
    await page.getByRole("textbox", { name: "Search company name or ticker" }).fill("ITC");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: /^ITC Limited/ }).click({ timeout: 30000 });
    await page.getByLabel("Reporting document and period").waitFor({ timeout: 30000 });
    const option = page.locator("#dynamic-document option").filter({ hasText: "ITC Press Release Q4 FY2025" });
    const documentId = await option.first().getAttribute("value");
    assert.ok(documentId);
    await page.getByLabel("Reporting document and period").selectOption(documentId);
    await page.getByRole("button", { name: "Retrieve and generate research" }).click();
    const snapshot = page.getByRole("region", { name: "Dynamic research snapshot" });
    await snapshot.waitFor({ timeout: 120000 });
    await snapshot.getByText("Business overview", { exact: true }).waitFor();
    await snapshot.getByRole("region", { name: "Structured financial figures" }).getByText("gross revenue · INR 73464.55 crore", { exact: true }).waitFor();
    const citation = snapshot.locator("details").filter({ has: page.locator("summary", { hasText: "Verify citation" }) }).first();
    await citation.locator("summary").click();
    assert.match(await citation.getByRole("link").getAttribute("href"), /^https:\/\/itcportal\.com\/.*\.pdf#page=\d+$/);
    await snapshot.getByText("Narrative vs Numbers", { exact: true }).waitFor();
    assert.ok(await snapshot.getByText(/No validated like-for-like/).isVisible());
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width + 1, JSON.stringify(dimensions));
    await page.screenshot({ path: path.join(output, `${viewport.width}-itc.png`), fullPage: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, `${viewport.width}-viewport.png`) });
    report.cases.push({ viewport, case: "live company search, document/period selection, cached research, citation expansion and layout", status: "passed" });

    // Pinned legacy selector still renders both original source identities.
    await page.getByLabel("Reporting document", { exact: true }).selectOption("infosys-q1-fy26-call");
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await page.getByRole("link", { name: "Infosys Q1 FY26 earnings conference call", exact: true }).waitFor({ timeout: 45000 });
    report.cases.push({ viewport, case: "pinned July selector remains available", status: "passed" });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.route("**/research/v2/companies?**", (route) => route.fulfill({ status: 503, contentType: "application/json",
    body: JSON.stringify({ detail: { code: "database_unavailable", message: "Dynamic research database is unavailable." } }) }));
  await page.goto(`${process.env.FINN_UI_URL || "http://127.0.0.1:3000"}/research`);
  await page.getByLabel("Reporting document", { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole("textbox", { name: "Search company name or ticker" }).fill("Unknown");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText("Dynamic research database is unavailable.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("region", { name: "Dynamic research snapshot" }).count(), 0);
  await page.screenshot({ path: path.join(output, "mobile-api-failure.png"), fullPage: true });
  report.cases.push({ case: "mocked API outage does not fabricate research", status: "passed" });
  await page.unroute("**/research/v2/companies?**");
  await page.route("**/research/v2/companies?**", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ companies: [], total: 0, limit: 10, offset: 0, needs_registry_refresh: false }) }));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(/No verified company matches/).waitFor();
  report.cases.push({ case: "mocked unknown company has explicit empty state", status: "passed" });
  await context.close();
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.errors.push(error.message);
  throw error;
} finally {
  await writeFile(path.join(output, "results.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
