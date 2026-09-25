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
  for (const st of D.STAGES) {
    await page.click(`#stage-list li:nth-child(${st.id}) button`);
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
  await m.click('#stage-list li:nth-child(1) button');
  await m.fill('#fx', 'x^'); await m.click('#btn-fire');
  console.log('parse error shown →', await m.textContent('#fx-error'));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  console.log('mobile horizontal overflow →', overflow);
  await m.screenshot({ path: `${out}/08-mobile.png`, fullPage: true });
  // 다크 모드
  const d = await browser.newPage({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' });
  await d.goto('file://' + path.resolve(__dirname, '../index.html'));
  await d.click('#stage-list li:nth-child(1) button');
  await d.screenshot({ path: `${out}/09-dark.png` });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
