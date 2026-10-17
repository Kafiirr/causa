const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const artifact = name => path.join(__dirname, '..', 'artifacts', name);
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  await fs.mkdir(artifact(''), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['camera'], acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(process.env.CAUSA_TEST_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.screenshot({ path: artifact('causa-desktop.png'), fullPage: true });
  if (process.argv.includes('--visual-only')) {
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(sizes.scroll <= sizes.width + 1);
      if (width === 390) await page.screenshot({ path: artifact('causa-mobile.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS final visual checks at 390, 768, and 1440 pixels');
    await browser.close();
    return;
  }

  async function fresh(fault) {
    await page.locator('#new-case').click();
    await page.locator('#fault-select').selectOption(fault);
    await page.getByRole('button', { name: 'Start investigation' }).click();
    await page.waitForFunction(() => document.querySelector('#metric-tests').textContent === '00');
  }
  async function testOnce() {
    await page.getByRole('button', { name: 'Commit prediction' }).click();
    assert.match(await page.locator('.prediction-box').textContent(), /PREDICTIONS COMMITTED/);
    await page.getByRole('button', { name: 'Run simulated test', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#experiment-actions button')?.disabled);
  }
  for (const fault of ['valve_closed', 'branch_kink', 'inlet_blockage', 'pump_off']) {
    await fresh(fault);
    await testOnce();
    assert.equal(await page.locator('#metric-causes').textContent(), '02');
    await testOnce();
    assert.equal(await page.locator('#metric-causes').textContent(), '01');
    assert.match(await page.locator('#metric-check').textContent(), /Pending/);
    await page.getByRole('button', { name: 'Apply simulated repair' }).click();
    assert.match(await page.locator('#metric-check').textContent(), /Pending/);
    await page.getByRole('button', { name: 'Run simulated flow check' }).click();
    await page.waitForFunction(() => document.querySelector('#metric-check').textContent.includes('Passed'));
    assert.match(await page.locator('#experiment-content').textContent(), /Operation restored/);
    console.log(`PASS browser diagnosis: ${fault}`);
  }

  await page.getByRole('button', { name: 'Inspect the evidence' }).click();
  assert.equal(await page.locator('.evidence-entry').count(), 7);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-evidence').click();
  const download = await downloadEvent;
  await download.saveAs(artifact('causa-evidence-test.json'));
  const exported = JSON.parse(await fs.readFile(artifact('causa-evidence-test.json'), 'utf8'));
  assert.equal(exported.phase, 'complete');
  assert.equal(exported.mode, 'simulation');
  assert.equal(exported.events.at(-1).passed, true);
  console.log('PASS evidence export and simulation provenance');
  await page.screenshot({ path: artifact('causa-evidence.png'), fullPage: true });

  await page.locator('nav [data-page="lab"]').click();
  await fresh('branch_kink');
  await page.getByRole('button', { name: 'Commit prediction' }).click();
  await page.getByRole('button', { name: 'Mark observation as unclear' }).click();
  assert.equal(await page.locator('#metric-causes').textContent(), '04');
  assert.equal(await page.locator('#metric-tests').textContent(), '01');
  assert.match(await page.locator('#experiment-content').textContent(), /No causes were eliminated/);
  console.log('PASS unclear observation preserves hypotheses');

  await page.locator('#view-camera').click();
  await page.locator('#camera-enable').click();
  await page.waitForFunction(() => !document.querySelector('#camera-capture').disabled);
  await page.locator('#camera-capture').click();
  assert.equal(await page.locator('#camera-thumbnails img').count(), 1);
  await page.locator('nav [data-page="evidence"]').click();
  assert.equal(await page.locator('#attachment-list img').count(), 1);
  assert.equal(await page.evaluate(() => document.querySelector('#camera-video').srcObject), null);
  console.log('PASS camera capture, reference labeling, and automatic stop');

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['lab', 'evidence', 'kit']) {
      await page.locator(`nav [data-page="${name}"]`).click();
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(dimensions.scroll <= dimensions.width + 1, `Overflow on ${name} at ${width}: ${dimensions.scroll}`);
    }
    console.log(`PASS responsive layouts: ${width}px`);
  }
  await page.locator('nav [data-page="lab"]').click();
  await fresh('inlet_blockage');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: artifact('causa-mobile.png'), fullPage: true });
  await page.locator('#layout-select').selectOption('b');
  assert.match(await page.locator('#rig-svg').getAttribute('class'), /rig-reversed/);
  console.log('PASS alternate layout');

  await page.getByRole('button', { name: 'Commit prediction' }).click();
  await page.getByRole('button', { name: 'Run simulated test', exact: true }).click();
  await fresh('pump_off');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('#metric-causes').textContent(), '04');
  assert.equal(await page.locator('#metric-tests').textContent(), '00');
  console.log('PASS new case cancels stale observations');

  assert.deepEqual(errors, []);
  console.log('PASS no browser JavaScript errors');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
