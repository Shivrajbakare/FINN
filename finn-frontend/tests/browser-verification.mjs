// Real Chromium interactions. Requires local services; never uses a personal profile.
// Research normally uses the real API and pinned PDFs. Failure/market routes are mocks.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const moduleName = process.env.PLAYWRIGHT_MODULE;
const { chromium } = await import(moduleName ? pathToFileURL(moduleName).href : 'playwright-core');
const output = path.resolve('../docs/verification/browser');
await mkdir(output, { recursive: true });
const manifest = JSON.parse(await readFile('../finn-backend/app/config/research_sources.json', 'utf8'));
const report = { started_at: new Date().toISOString(), research: 'real local API, hash-verified genuine PDFs in cache',
  market: 'mocked; no live market-data claim', cases: [], sourceNavigations: [], errors: [] };
const browser = await chromium.launch({ headless: true });
report.browser = await browser.version();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function visible(locator) { await locator.waitFor({ state: 'visible', timeout: 20000 }); }
async function textContains(page, text) { await visible(page.getByText(text, { exact: false }).first()); }
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const unavailable = { ticker: 'INFY.NS', company_name: 'Infosys Limited', status: 'unavailable',
  period: 'Q4 / FY25 (historical)', documents: [], sections: [], limitations: [],
  issues: ['Test-injected missing document; no substitute evidence.'] };
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const label = viewport.width === 390 ? 'mobile' : 'desktop';
    const context = await browser.newContext({ viewport, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push({ viewport: label, error: error.message }));
    async function check(name, fn) {
      try { await fn(); report.cases.push({ viewport: label, name, status: 'passed' }); }
      catch (error) {
        report.cases.push({ viewport: label, name, status: 'failed', error: error.message });
        await page.screenshot({ path: path.join(output, `${label}-failure.png`), fullPage: true });
        throw error;
      }
    }
    async function layout(name) {
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        viewport: document.querySelector('meta[name="viewport"]')?.content,
        quoteSize: document.querySelector('blockquote') ? getComputedStyle(document.querySelector('blockquote')).fontSize : null }));
      assert.ok(dimensions.scroll <= dimensions.width + 1, `${name}: horizontal overflow ${JSON.stringify(dimensions)}`);
      assert.doesNotMatch(dimensions.viewport, /user-scalable=no|maximum-scale=1(?:,|$)/);
      report.cases.push({ viewport: label, name: `${name} layout and zoom metadata`, status: 'passed', dimensions });
      await page.screenshot({ path: path.join(output, `${label}-${name}.png`), fullPage: true });
    }
    async function verifyDocument(company) {
      const api = await context.request.get(`http://127.0.0.1:8000/api/research/INFY?document_id=${company.document.id}`);
      const snapshot = await api.json();
      assert.equal(snapshot.status, 'available');
      assert.equal(snapshot.documents[0].sha256, company.document.sha256);
      const expectedClaims = snapshot.sections.flatMap(section => section.claims);
      await textContains(page, 'Source-verified historical excerpts.');
      await textContains(page, `${company.period}. Read this as a historical snapshot`);
      let count = 0;
      for (const tab of ['Snapshot', 'Guidance & risks']) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        const cards = page.locator('article');
        for (const card of await cards.all()) {
          const href = await card.getByRole('link').getAttribute('href');
          assert.ok(href.startsWith(company.document.url + '#page='), href);
          const quote = await card.locator('blockquote').innerText();
          assert.ok(expectedClaims.some(claim => claim.text === quote && claim.evidence.url === href));
          count++;
        }
      }
      assert.equal(count, 7);
      await page.getByRole('tab', { name: 'Sources', exact: true }).click();
      await textContains(page, company.document.event_date);
      await page.getByText('Document integrity', { exact: true }).click();
      await textContains(page, company.document.sha256);
      const link = page.getByRole('link', { name: company.document.title, exact: true });
      assert.equal(await link.getAttribute('href'), company.document.url);
      // Click the real link; record its outgoing request even if external navigation fails.
      const requestPromise = context.waitForEvent('request', { predicate: request => request.url() === company.document.url });
      const popupPromise = context.waitForEvent('page');
      await link.click();
      const request = await requestPromise;
      const popup = await popupPromise;
      report.sourceNavigations.push({ viewport: label, document: company.document.id, requested_url: request.url() });
      await popup.close();
      await page.getByRole('tab', { name: 'Snapshot', exact: true }).click();
    }
    await check('April real API, excerpts, citations and source-link click', async () => {
      await page.goto('http://127.0.0.1:3000/research');
      await visible(page.getByLabel('Reporting document'));
      await page.getByLabel('Reporting document').selectOption('infosys-q4-fy25-call');
      await verifyDocument(manifest.companies[0]);
      await layout('april');
    });
    await check('July real API, excerpts, citations and source-link click', async () => {
      await page.getByLabel('Reporting document').selectOption('infosys-q1-fy26-call');
      await verifyDocument(manifest.companies[1]);
      await visible(page.getByRole('button', { name: 'Infosys Limited - 2 reviewed documents', exact: true }));
      await layout('july');
    });
    await check('Repeated period switching preserves identity', async () => {
      for (const company of [...manifest.companies, ...manifest.companies]) {
        await page.getByLabel('Reporting document').selectOption(company.document.id);
        await textContains(page, `${company.period}. Read this as a historical snapshot`);
        for (const link of await page.getByRole('link', { name: /Read primary source/ }).all())
          assert.ok((await link.getAttribute('href')).startsWith(company.document.url));
      }
    });
    await check('Delayed April response cannot overwrite July', async () => {
      await page.route('**/api/research/INFY.NS?document_id=infosys-q4-fy25-call', async route => {
        const response = await route.fetch();
        await pause(1200);
        try { await route.fulfill({ response }); }
        catch (error) {
          // The application aborts an obsolete request when the period changes.
          if (!/Route is already handled/.test(error.message)) throw error;
        }
      });
      await page.getByLabel('Reporting document').selectOption('infosys-q4-fy25-call');
      await textContains(page, 'Retrieving and checking primary-document evidence');
      await page.getByLabel('Reporting document').selectOption('infosys-q1-fy26-call');
      await textContains(page, 'Q1 / FY26 (historical). Read this as a historical snapshot');
      await pause(1500);
      await textContains(page, 'Q1 / FY26 (historical). Read this as a historical snapshot');
      for (const link of await page.getByRole('link', { name: /Read primary source/ }).all())
        assert.ok((await link.getAttribute('href')).startsWith(manifest.companies[1].document.url));
      await page.unroute('**/api/research/INFY.NS?document_id=infosys-q4-fy25-call');
    });
    if (label === 'mobile') await check('Mobile emulated pinch zoom to 200 percent', async () => {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      assert.equal(await page.evaluate(() => visualViewport.scale), 2);
      await page.screenshot({ path: path.join(output, 'mobile-zoom-200.png') });
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
      await cdp.detach();
    });
    await check('Unsupported ticker has no substituted evidence', async () => {
      await page.getByLabel('Company ticker').fill('TCS');
      await page.getByRole('button', { name: 'Research', exact: true }).click();
      await textContains(page, 'Research is unsupported');
      assert.equal(await page.locator('blockquote').count(), 0);
    });
    await check('Mocked loading then missing-document state', async () => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/research/INFY.NS*', async route => { await gate; await json(route, unavailable); });
      await page.getByLabel('Company ticker').fill('INFY');
      await page.getByRole('button', { name: 'Research', exact: true }).click();
      await textContains(page, 'Retrieving and checking primary-document evidence');
      release();
      await textContains(page, 'Research is unavailable');
      assert.equal(await page.locator('blockquote').count(), 0);
      await layout('missing-document');
      await page.unroute('**/api/research/INFY.NS*');
    });
    await check('Mocked research HTTP failure and retry', async () => {
      await page.route('**/api/research/INFY.NS*', route => json(route, { detail: 'test failure' }, 503));
      await page.getByRole('button', { name: 'Retry retrieval', exact: true }).click();
      await textContains(page, 'HTTP 503');
      assert.equal(await page.locator('blockquote').count(), 0);
      await page.unroute('**/api/research/INFY.NS*');
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await textContains(page, 'Source-verified historical excerpts');
    });
    // Prevent all market-data network requests from leaving the browser.
    const scan = { status: 'unavailable', checked_at: '2026-10-29T00:00:00Z', source: 'Mock browser-test provider',
      freshness_policy: 'Test fixture, not real market data', coverage: { total: 18, available: 0, evaluated: 0, companies: [] }, stocks: [], alerts: [] };
    const alertRequests = [];
    let marketFailure = false;
    await context.route(/\/api\/(portfolio|alerts)(\?|$)/, async route => {
      const url = route.request().url();
      if (url.includes('/alerts')) alertRequests.push(url);
      await pause(350);
      await json(route, marketFailure ? { detail: 'test outage' } : scan, marketFailure ? 503 : 200);
    });
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await check('Settings save, reload and thresholds on both consumers', async () => {
      await nav.getByRole('link', { name: 'Settings' }).click();
      const volume = page.getByLabel('Volume Anomaly Threshold');
      const price = page.getByLabel('Price Move Threshold');
      await volume.focus(); await volume.press('Home');
      for (let i=0; i<15; i++) await volume.press('ArrowRight');
      await price.focus(); await price.press('Home');
      for (let i=0; i<6; i++) await price.press('ArrowRight');
      await page.getByRole('button', { name: 'Save Thresholds' }).click();
      await textContains(page, 'Settings saved.');
      await page.reload();
      await visible(page.getByRole('button', { name: 'Save Thresholds' }));
      await page.waitForFunction(() => document.querySelector('fieldset')?.disabled === false);
      assert.equal(await volume.inputValue(), '3');
      assert.equal(await price.inputValue(), '4');
      await layout('settings');
      for (const name of ['Portfolio', 'Alerts']) {
        alertRequests.length = 0;
        await nav.getByRole('link', { name }).click();
        await visible(page.locator('.skeleton').first());
        await textContains(page, 'Market data is unavailable');
        assert.ok(alertRequests.some(url => new URL(url).searchParams.get('volume_threshold') === '3' && new URL(url).searchParams.get('price_threshold') === '4'));
        await layout(name.toLowerCase());
      }
      await textContains(page, 'this is not an all-clear');
    });
    await check('Dashboard and alerts HTTP failure states', async () => {
      marketFailure = true;
      for (const name of ['Portfolio', 'Alerts']) {
        await nav.getByRole('link', { name }).click();
        await textContains(page, 'HTTP 503');
        assert.equal(await page.getByText('No threshold crossings detected in the completed EOD scan.', { exact: true }).count(), 0);
      }
    });
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.message; process.exitCode = 1;
} finally {
  await browser.close();
  report.finished_at = new Date().toISOString();
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
