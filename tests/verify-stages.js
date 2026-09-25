// 각 스테이지의 모범 해법이 실제로 모든 기질을 분해하는지, par 이내인지 검증한다.
const D = require('../js/data.js');
global.GameData = D;
const P = require('../js/parser.js');
const E = require('../js/engine.js');
let fail = 0;
for (const st of D.STAGES) {
  let alive = st.blocks.map((_, i) => i);
  const log = [];
  for (const s of st.solution) {
    const r = E.simulate(st, alive, { enzyme: s.enzyme, T: s.T, fn: P.parse(s.f) });
    alive = alive.filter(i => !r.broken.includes(i));
    log.push(`${s.enzyme}@${s.T} y=${s.f} → 분해 [${r.broken}] 정지:${r.stop.type}${r.stop.block!=null?'#'+r.stop.block:''} (${r.stop.x.toFixed(1)},${r.stop.y.toFixed(1)})`);
  }
  const ok = alive.length === 0 && st.solution.length <= st.par;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} 스테이지 ${st.id} ${st.title} (남은 블록: ${alive})`);
  log.forEach(l => console.log('   ', l));
}
// 파서 단위 검사
const cases = [['2x', 3, 6], ['x^2', 3, 9], ['-x^2', 3, -9], ['sin(pi x/2)', 1, 1], ['3(x+1)', 1, 6], ['xsin(x)', 0, 0], ['2^-1', 0, 0.5], ['abs(x-5)', 2, 3]];
for (const [src, x, want] of cases) {
  const got = P.parse(src)(x);
  const ok = Math.abs(got - want) < 1e-9;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} parse ${src} @${x} = ${got} (기대 ${want})`);
}
for (const bad of ['', 'x+', 'y*2', 'eval(1)', '1..2', '(x']) {
  try { P.parse(bad); console.log('FAIL 오류가 나야 함:', bad); fail++; } catch (e) { console.log('PASS 거부:', JSON.stringify(bad), '→', e.message); }
}
// 규칙 검사: 변성·pH·저온
const ev = E.evaluate;
const chk = (name, cond) => { if (!cond) fail++; console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); };
chk('카탈레이스 37°C 반응', ev('catalase', 37, false, 7, 'h2o2').catalyzed);
chk('카탈레이스 5°C 저온 실패', ev('catalase', 5, false, 7, 'h2o2').reason === 'cold');
chk('변성 효소 37°C 실패', ev('catalase', 37, true, 7, 'h2o2').reason === 'denatured');
chk('80°C 가열로만 반응(효소 아님)', ev('catalase', 80, true, 7, 'h2o2').heatDriven);
chk('펩신 pH7 실패', ev('pepsin', 37, false, 7, 'protein').reason === 'ph');
chk('아밀레이스-단백질 불일치', ev('amylase', 37, false, 7, 'protein').reason === 'mismatch');
process.exit(fail ? 1 : 0);
