/* 판정 엔진 — DOM과 무관한 순수 함수. 브라우저와 Node(검증 스크립트)에서 함께 쓴다.
 * 핵심 규칙 한 줄:  반응 성공 ⇔ 분자 에너지(=온도) ≥ 유효 활성화 에너지
 * 유효 활성화 에너지 = (맞는 효소 && 변성 안 됨 && 적정 pH) ? EaCat : EaUncat
 */
(function (root) {
  const D = root.GameData || (typeof require !== 'undefined' ? require('./data.js') : null);
  const X_MIN = 0, X_MAX = 30, Y_MIN = -10, Y_MAX = 10, PROJ_R = 0.3;

  function evaluate(enzymeId, T, denatured, pH, subId) {
    const enz = D.ENZYMES[enzymeId], sub = D.SUBSTRATES[subId];
    const isHeat = enzymeId === 'heat';
    const matches = !isHeat && enz.substrate === subId;
    const pHok = !isHeat && pH >= enz.pH[0] && pH <= enz.pH[1];
    const active = matches && !denatured && pHok;
    const barrier = active ? sub.EaCat : sub.EaUncat;
    const ok = T >= barrier;
    let reason = null;
    if (!ok) {
      if (isHeat) reason = 'energy';
      else if (!matches) reason = 'mismatch';
      else if (denatured) reason = 'denatured';
      else if (!pHok) reason = 'ph';
      else reason = 'cold';
    }
    return { ok, barrier, active, matches, pHok, reason, catalyzed: ok && active, heatDriven: ok && !active, E: T };
  }

  const inRect = (px, py, r, pad = 0) =>
    px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad;

  function zoneAt(stage, px, py, type) {
    return stage.zones.find(z => z.type === type && inRect(px, py, z));
  }

  /* shot: { enzyme, T, fn }  alive: 살아 있는 블록 index 배열 */
  function simulate(stage, alive, shot) {
    const { x: x0, y: y0 } = stage.shooter;
    const f0 = shot.fn(x0);
    const res = { points: [], events: [], broken: [], stop: null, damage: 0 };
    if (!isFinite(f0)) { res.stop = { type: 'undefined', x: x0, y: y0 }; return res; }
    if (shot.enzyme !== 'heat' && shot.T >= D.ENZYMES[shot.enzyme].denatureT) {
      res.events.push({ type: 'denature-launch', i: 0, x: x0, y: y0 });
    }
    if (shot.T >= D.DAMAGE_T) res.damage = 1;

    let denatured = shot.enzyme !== 'heat' && shot.T >= D.ENZYMES[shot.enzyme].denatureT;
    const aliveSet = new Set(alive);
    let lastPH = null;
    const DX = 0.01, STEP = 0.04;
    let prev = { x: x0, y: y0 };
    res.points.push(prev);

    outer:
    for (let x = x0 + DX; x <= X_MAX + 1e-9; x += DX) {
      const y = shot.fn(x) - f0 + y0;
      if (!isFinite(y)) { res.stop = { type: 'undefined', x: prev.x, y: prev.y }; break; }
      const segLen = Math.hypot(x - prev.x, y - prev.y);
      const n = Math.max(1, Math.ceil(segLen / STEP));
      for (let k = 1; k <= n; k++) {
        const px = prev.x + (x - prev.x) * k / n, py = prev.y + (y - prev.y) * k / n;
        if (py < Y_MIN || py > Y_MAX) {
          res.points.push({ x: px, y: py });
          res.stop = { type: 'out', x: px, y: py };
          break outer;
        }
        res.points.push({ x: px, y: py });
        const idx = res.points.length - 1;
        // 뜨거운 구역: 효소 비가역 변성
        const hot = zoneAt(stage, px, py, 'hot');
        if (hot && !denatured && shot.enzyme !== 'heat') {
          denatured = true;
          res.events.push({ type: 'denature-zone', i: idx, x: px, y: py, value: hot.value });
        }
        // pH 구역 진입 기록
        const phZone = zoneAt(stage, px, py, 'ph');
        const pH = phZone ? phZone.value : stage.fieldPH;
        if (pH !== lastPH) {
          if (lastPH !== null) res.events.push({ type: 'ph-change', i: idx, x: px, y: py, pH });
          lastPH = pH;
        }
        // 벽
        for (const w of stage.walls) {
          if (inRect(px, py, w, PROJ_R)) {
            res.stop = { type: 'wall', x: px, y: py };
            break outer;
          }
        }
        // 기질 블록
        for (const bi of aliveSet) {
          const b = stage.blocks[bi];
          if (Math.hypot(px - b.x, py - b.y) <= b.r + PROJ_R) {
            const ev = evaluate(shot.enzyme, shot.T, denatured, pH, b.sub);
            if (ev.ok) {
              aliveSet.delete(bi);
              res.broken.push(bi);
              res.events.push({ type: 'react', i: idx, x: px, y: py, block: bi, pH, denatured, ...ev });
            } else {
              res.events.push({ type: 'bounce', i: idx, x: px, y: py, block: bi, pH, denatured, ...ev });
              res.stop = { type: 'bounce', x: px, y: py, block: bi };
              break outer;
            }
          }
        }
      }
      prev = { x, y };
    }
    if (!res.stop) res.stop = { type: 'edge', x: prev.x, y: prev.y };
    return res;
  }

  root.Engine = { simulate, evaluate, X_MIN, X_MAX, Y_MIN, Y_MAX, PROJ_R };
  if (typeof module !== 'undefined') module.exports = root.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
