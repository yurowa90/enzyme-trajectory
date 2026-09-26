// 브라우저 E2E: 모든 스테이지를 모범 해법으로 플레이하고, 실패 사례·콘솔 오류·스크린샷을 확인한다.
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const D = require('../js/data.js');
(async () => {
  const out = process.argv[2] || '.';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.fill('#in-sid', '10315'); await page.fill('#in-name', '테스트');
  await page.screenshot({ path: `${out}/01-start.png`, fullPage: true });
  const waitIdle = () => page.waitForFunction(() => !document.getElementById('btn-fire').disabled);
  const stageBtn = id => page.locator('#stage-list button.stage-item').nth(id - 1);
  for (const st of D.STAGES) {
    await stageBtn(st.id).click();
    if (st.type === 'pathway') {
      if (st.id === 9) { // 억제 관문 먼저 맞혀 보기
        await page.fill('#fx', '-1.2595(x-1) + 0.1079(x-1)^2'); await page.click('#btn-fire'); await waitIdle();
        console.log('stage9 inhibited →', (await page.textContent('#log')).includes('말론산이 차지') ? 'OK' : 'MISSING');
        await page.screenshot({ path: `${out}/10-stage9-inhibited.png` });
      }
      if (st.predictLedger) for (const [k, v] of Object.entries({ co2: 2, nadh: 3, fadh2: 1, atp: 1, h2o: 1 })) await page.fill('#lp-' + k, String(v));
      await page.fill('#fx', st.solution[0].f);
      await page.click('#btn-fire');
      await page.waitForSelector('#modal:not([hidden])');
      if (st.id === 10) {
        await page.screenshot({ path: `${out}/11-stage10-modal.png` });
        const hits = await page.$$eval('.cmp-table .hit', els => els.length);
        console.log('stage10 prediction hits (h2o 오답 의도) →', hits);
      }
      console.log(`stage ${st.id}: ${await page.textContent('#modal-title')} / ${await page.$eval('.big-stars', el => el.getAttribute('aria-label'))}`);
      if (st.id === 10) {
        await page.click('#modal-actions button:has-text("다시 하기")');
        await page.screenshot({ path: `${out}/12-stage10-field.png` });
        await page.click('#btn-back');
      } else {
        await page.click('#modal-actions button:has-text("목록")');
      }
      continue;
    }
    // 스테이지 3: 먼저 5°C 저온 실패를 재현
    if (st.id === 3) {
      await page.fill('#fx', '0'); await page.check('input[value="react"]');
      await page.click('#btn-fire'); await waitIdle();
      const log = await page.textContent('#log');
      console.log('stage3 cold →', log.includes('낮아진 장벽') ? 'OK 저온 메시지' : 'MISSING');
      await page.screenshot({ path: `${out}/03-stage3-cold.png` });
    }
    for (const s of st.solution) {
      await page.click(`.enzyme-btn:nth-child(${st.enzymes.indexOf(s.enzyme) + 1})`);
      if (st.tempControl) await page.$eval('#temp', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, s.T);
      if (st.predict) await page.check('input[value="react"]');
      await page.fill('#fx', s.f);
      if (st.id === 6 && s === st.solution[0]) {
        const vt = await page.textContent('#diagram-verdict');
        console.log('stage6 diagram hidden before shot →', vt === '' ? 'OK' : 'FAIL ' + vt);
      }
      await page.click('#btn-fire');
      await page.waitForFunction(() => !document.getElementById('btn-fire').disabled || !document.getElementById('modal').hidden);
      if (st.id === 5 && s === st.solution[0]) await page.screenshot({ path: `${out}/05-stage5.png` });
    }
    await page.waitForSelector('#modal:not([hidden])');
    const title = await page.textContent('#modal-title');
    const stars = await page.$eval('.big-stars', el => el.getAttribute('aria-label'));
    console.log(`stage ${st.id}: ${title} / ${stars}`);
    if (st.id === 4) await page.screenshot({ path: `${out}/04-stage4-clear.png` });
    await page.fill('#reflection', `스테이지 ${st.id} 설명 테스트`);
    await page.click('#modal-actions button:has-text("목록")');
  }
  await page.click('#btn-results');
  await page.screenshot({ path: `${out}/07-results.png`, fullPage: true });
  // 모바일
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto('file://' + path.resolve(__dirname, '../index.html'));
  await m.locator('#stage-list button.stage-item').first().click();
  await m.fill('#fx', 'x^'); await m.click('#btn-fire');
  console.log('parse error shown →', await m.textContent('#fx-error'));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('mobile horizontal overflow →', overflow);
  await m.screenshot({ path: `${out}/08-mobile.png`, fullPage: true });
  // 다크 모드
  const d = await browser.newPage({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
  await d.goto('file://' + path.resolve(__dirname, '../index.html'));
  await d.locator('#stage-list button.stage-item').first().click();
  await d.screenshot({ path: `${out}/09-dark.png` });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
