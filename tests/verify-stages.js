// 각 스테이지의 모범 해법이 실제로 모든 기질을 분해하는지, par 이내인지 검증한다.
const D = require('../js/data.js');
global.GameData = D;
const P = require('../js/parser.js');
const E = require('../js/engine.js');
let fail = 0;
for (const st of D.STAGES) {
  if (st.type === 'pathway') {
    const r = E.simulatePathway(st, { fn: P.parse(st.solution[0].f) });
    const ok = r.completed && st.solution.length <= st.par;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} 스테이지 ${st.id} ${st.title} → ${r.molecule} 장부 ${JSON.stringify(r.ledger)}`);
    continue;
  }
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
// 2부 규칙: 한 바퀴 수지가 교과서 값과 같은지, 억제·불일치 관문에서 튕기는지, 쓸어내기 꼼수가 막히는지
const s10 = D.STAGES.find(s => s.id === 10), s9 = D.STAGES.find(s => s.id === 9);
const L = E.simulatePathway(s10, { fn: P.parse(s10.solution[0].f) }).ledger;
chk('TCA 한 바퀴 수지 CO2 2·NADH 3·FADH2 1·ATP 1·H2O 2 소비', L.co2 === 2 && L.nadh === 3 && L.fadh2 === 1 && L.atp === 1 && L.h2o === -2);
const inh = E.simulatePathway(s9, { fn: P.parse('-1.2595(x-1) + 0.1079(x-1)^2') });
chk('말론산 억제 관문에서 튕김', inh.events.some(e => e.type === 'reject' && e.reason === 'inhibited'));
const wrong = E.simulatePathway(s9, { fn: P.parse('0.3x') });
chk('맞지 않는 관문에서 튕김', wrong.events.some(e => e.type === 'reject' && e.reason === 'wrong'));
const sweep = E.simulatePathway(s10, { fn: P.parse('9sin(3x)') });
chk('관문 쓸어내기 꼼수 차단', !sweep.completed);
// 모든 관문 효소 반응이 회로 순서와 맞물리는지
const G = D.GATES, O = D.TCA_ORDER;
chk('관문 반응이 TCA 순서와 일치', ['cs','aco','idh','akgdh','scs','sdh','fum','mdh'].every((k, i) => G[k].from === O[i] && G[k].to === O[i + 1]));
process.exit(fail ? 1 : 0);
