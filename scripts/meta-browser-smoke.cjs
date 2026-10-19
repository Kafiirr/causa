// Billable, opt-in end-to-end smoke test with a synthetic schematic, never a camera.
if (!process.argv.includes('--allow-live')) {
  console.error('Pass --allow-live to send the synthetic rig diagram to Meta through the local app.');
  process.exit(2);
}
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const artifact = name => path.join(__dirname, '..', 'artifacts', name);

(async () => {
  await fs.mkdir(artifact(''), { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
    const image = await page.locator('#rig-svg').screenshot({ path: artifact('meta-schematic-fixture.png') });
    await page.locator('#view-camera').click();
    await page.locator('#frame-upload').setInputFiles({ name: 'synthetic-rig.png', mimeType: 'image/png', buffer: image });
    await page.waitForFunction(() => !document.querySelector('#analyze-frame').disabled);
    await page.locator('#perception-task').selectOption('pump');
    await page.locator('#region-controls summary').click();
    // The synthetic schematic checks transport and geometry, not real equipment accuracy.
    for(const [key,value] of Object.entries({x:30,y:30,width:180,height:180}))await page.locator(`#region-${key}`).fill(String(value));
    await page.locator('#region-apply').click();
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/perception/analyze'), { timeout: 75000 });
    await page.locator('#analyze-frame').click();
    const response = await responsePromise;
    const result = await response.json();
    assert.equal(response.status(), 200, result.error?.code);
    await page.waitForSelector('.review-form');
    assert.equal(result.assessment.outcome, 'unknown');
    assert.equal(result.schema,'causa.perception.v4');assert.equal(result.focus.component,'pump');
    assert.equal(result.focus.width,180);assert.equal(result.segmentations[0].component,'pump');
    assert.equal(result.segmentations[0].status,'completed');
    for(const select of await page.locator('.review-form fieldset select').all())await select.selectOption('unclear');
    await page.getByRole('button', { name: 'Save review', exact: true }).click();
    assert.equal(await page.locator('#metric-causes').textContent(), '04');
    await page.locator('nav [data-page="evidence"]').click();
    const downloaded = page.waitForEvent('download');
    await page.locator('#export-evidence').click();
    await (await downloaded).saveAs(artifact('meta-live-ui-export.json'));
    const exported = JSON.parse(await fs.readFile(artifact('meta-live-ui-export.json'), 'utf8'));
    assert.equal(exported.perception.analyses.length, 1);
    assert.equal(exported.perception.reviews[0].sha256, result.frame.sha256);
    assert.equal(exported.mode, 'simulation');
    const report = { at: new Date().toISOString(), fixture: 'CAUSA synthetic schematic, not a physical rig', success: true, httpStatus: response.status(), usable: result.assessment.usable, outcome: result.assessment.outcome, sam: result.segmentations.map(s => ({ component: s.component, status: s.status, objects: s.objects.length })), elapsedMs: result.elapsedMs, usage: result.usage, focus:result.focus, checks: ['original plus crop', 'targeted SAM', 'upload', 'explicit analysis', 'unknown state', 'operator review', 'frame-bound export', 'simulation unchanged'] };
    await fs.writeFile(artifact('meta-live-ui-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
