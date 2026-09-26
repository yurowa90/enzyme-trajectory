/* 효소 궤적 — 화면 제어 */
(function () {
  const { SUBSTRATES, ENZYMES, STAGES, DAMAGE_T, MOLECULES, GATES, TCA_ORDER } = window.GameData;
  const { parse } = window.MathParser;
  const Engine = window.Engine;
  const STORE_KEY = 'enzymeTrajectory.v1';
  const $ = id => document.getElementById(id);

  /* ---------- 저장 ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || { student: {}, stages: {} }; }
    catch { return { student: {}, stages: {} }; }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 저장 불가 환경 */ } }
  let store = load();

  /* ---------- 한국어 조사 ---------- */
  function josa(word, pair) {
    const [withB, withoutB] = pair.split('/');
    const ch = word.replace(/[^가-힣]/g, '').slice(-1);
    if (!ch) return word + withB;
    const has = (ch.charCodeAt(0) - 0xac00) % 28 !== 0;
    return word + (has ? withB : withoutB);
  }

  /* ---------- 상태 ---------- */
  let stage = null, S = null;
  const REASON_LABEL = { mismatch: '기질 불일치', denatured: '효소 변성', ph: 'pH 부적합', cold: '저온(에너지 부족)', energy: '효소 없이 에너지 부족', wrong: '관문 효소 불일치', inhibited: '억제된 효소(말론산)' };
  const isPW = () => stage && stage.type === 'pathway';

  function newState(st) {
    return {
      alive: st.blocks.map((_, i) => i),
      shotsLeft: st.shots,
      damage: 0,
      enzyme: st.enzymes[0],
      T: st.defaultT,
      history: [],       // 지난 궤적
      shots: [],         // 기록용
      reasons: {},
      predictions: { correct: 0, total: 0 },
      helpOpened: 0,
      startedAt: Date.now(),
      fired: false,
      lastEval: null,
      busy: false,
      particles: [],
      molecule: st.start,       // 2부: 현재(마지막 발사) 분자
      liveLedger: null,         // 2부: 마지막 발사의 생성물 장부
      ledgerPred: null,         // 2부: 한 바퀴 수지 예측
      completedLedger: null,
    };
  }

  /* ---------- 화면 전환 ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    window.scrollTo(0, 0);
  }

  function starsHTML(n, big) {
    let h = '';
    for (let i = 0; i < 3; i++) h += i < n ? '★' : '<span class="off">★</span>';
    return `<span class="${big ? 'big-stars' : 'stars'}" aria-label="별 ${n}개">${h}</span>`;
  }

  function stageUnlocked(i) {
    if (i === 0 || STAGES[i].chapter !== STAGES[i - 1].chapter) return true; // 각 부의 첫 스테이지는 항상 열림
    const prev = store.stages[STAGES[i - 1].id];
    return !!(prev && prev.attempts && prev.attempts.length);
  }

  function renderStageList() {
    const ol = $('stage-list');
    ol.innerHTML = '';
    const CH = { 1: ['1부 · 효소의 성질', '고1 통합과학'], 2: ['2부 · 물질대사: TCA 회로', '생명과학 심화'] };
    STAGES.forEach((st, i) => {
      if (i === 0 || STAGES[i - 1].chapter !== st.chapter) {
        const h = document.createElement('li');
        h.className = 'chapter-head';
        h.innerHTML = `${CH[st.chapter][0]}<small>${CH[st.chapter][1]}</small>`;
        ol.appendChild(h);
      }
      const rec = store.stages[st.id];
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.className = 'stage-item';
      b.type = 'button';
      b.disabled = !stageUnlocked(i);
      b.innerHTML = `<span class="stage-no">${st.id}</span>
        <span class="stage-meta"><b>${st.title}</b><span>${st.concept}</span></span>
        ${starsHTML(rec ? rec.best : 0)}`;
      b.addEventListener('click', () => startStage(st));
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  /* ---------- 스테이지 시작 ---------- */
  function startStage(st) {
    store.student = { id: $('in-sid').value.trim(), name: $('in-name').value.trim() };
    save();
    stage = st;
    S = newState(st);
    $('hud-stage-no').textContent = `스테이지 ${st.id}`;
    $('hud-stage-title').textContent = st.title;
    $('stage-concept').textContent = st.concept;
    $('stage-briefing').textContent = st.briefing;
    $('temp-block').hidden = !st.tempControl;
    $('predict-block').hidden = !st.predict;
    document.querySelectorAll('input[name="predict"]').forEach(r => { r.checked = false; });
    $('temp').value = S.T;
    $('fx').value = '';
    $('fx-error').textContent = '';
    $('log').innerHTML = '';
    $('toast').hidden = true; $('toast').innerHTML = ''; delete $('toast').dataset.level;
    const pw = st.type === 'pathway';
    $('enzyme-label').textContent = pw ? '① 발사체와 효소 관문' : '① 효소 장전';
    $('diagram-label').textContent = pw ? 'TCA 회로 지도 · 생성물 장부' : '에너지 도표';
    $('diagram-sub').hidden = pw;
    $('hud-left-label').textContent = pw ? '목표' : '기질';
    $('hud-damage-wrap').hidden = pw;
    $('ledger-predict-block').hidden = !st.predictLedger;
    document.querySelectorAll('#ledger-predict-block input').forEach(el => { el.value = ''; el.disabled = false; });
    if (pw) renderGateLegend(); else { renderEnzymes(); renderDiagramSelect(); }
    renderChips();
    updateHUD();
    updateTemp();
    show('screen-game');
    drawField();
    drawDiagram();
    addLog('shot', pw
      ? `임무: ${MOLECULES[st.start].name} → ${MOLECULES[st.target].name} · 발사 ${st.shots}회 · 목표 ${st.par}발 이내`
      : `임무: 기질 ${st.blocks.length}개 분해 · 발사 ${st.shots}회 · 목표 ${st.par}발 이내`);
    $('fx').focus();
  }

  function renderEnzymes() {
    const box = $('enzyme-list');
    box.innerHTML = '';
    stage.enzymes.forEach(id => {
      const e = ENZYMES[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'enzyme-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(S.enzyme === id));
      const sub = e.substrate ? SUBSTRATES[e.substrate].name : '모든 기질(비특이적)';
      const ph = e.pH ? `pH ${e.pH[0]}–${e.pH[1]}` : '';
      const dn = e.denatureT ? ` · ${e.denatureT}°C↑ 변성` : '';
      b.innerHTML = `<span class="dot" style="background:${e.color}"></span><b>${e.name}</b>
        <small>기질: ${sub}${ph ? ' · ' + ph : ''}${dn} · ${e.where}</small>`;
      b.addEventListener('click', () => {
        S.enzyme = id;
        S.lastEval = null;
        updateTemp();
        box.querySelectorAll('.enzyme-btn').forEach(x => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        if (e.substrate) $('diagram-sub').value = e.substrate;
        drawField();
        drawDiagram();
      });
      box.appendChild(b);
    });
  }

  // 2부: 효소 관문 목록(반응 내용은 숨긴다 — 어떤 효소가 다음 단계인지 판단하는 것이 과제)
  function renderGateLegend() {
    const box = $('enzyme-list');
    const m = MOLECULES[stage.start];
    const ids = [...new Set(stage.gates.map(gt => gt.enz))];
    box.innerHTML = `<div class="gate-item projectile"><span class="dot" style="background:${m.color}"></span><b>발사체: ${m.name} (${m.C}C)</b><small>목표: ${MOLECULES[stage.target].name}</small></div>` +
      ids.map(id => `<div class="gate-item"><span class="dot"></span><b>${GATES[id].name}</b></div>`).join('') +
      (stage.gates.some(gt => gt.inhibitor) ? '<div class="gate-item"><span class="dot" style="border-color:#b91c1c"></span><b>빗금 + 말론산 표시</b><small>말론산에 억제된 관문</small></div>' : '');
  }

  const CHIPS = ['0.5x', '-0.5x', '0.1(x-1)(x-15)', '-0.2(x-1)(x-17)', '3sin(x/3)', '0.0005x^3', 'abs(x-10)'];
  function renderChips() {
    const box = $('fx-chips');
    box.innerHTML = '';
    CHIPS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = c;
      b.addEventListener('click', () => { $('fx').value = c; $('fx').focus(); });
      box.appendChild(b);
    });
  }

  function renderDiagramSelect() {
    const sel = $('diagram-sub');
    const subs = [...new Set(stage.blocks.map(b => b.sub))];
    sel.innerHTML = subs.map(s => `<option value="${s}">${SUBSTRATES[s].name}</option>`).join('');
    const es = ENZYMES[S.enzyme].substrate;
    sel.value = subs.includes(es) ? es : subs[0];
  }

  function updateHUD() {
    $('hud-shots').textContent = `${S.shotsLeft}/${stage.shots}`;
    $('hud-left').textContent = isPW() ? MOLECULES[stage.target].name : S.alive.length;
    $('hud-damage').textContent = S.damage;
  }
  function updateTemp() {
    S.T = +$('temp').value;
    if (isPW()) return;
    const e = ENZYMES[S.enzyme];
    let note = '';
    if (S.T >= DAMAGE_T) note = ' ⚠ 세포 손상';
    if (e.denatureT && S.T >= e.denatureT) note = ' ⚠ 효소 변성';
    $('temp-val').textContent = `${S.T}°C${note}`;
  }

  /* ---------- 필드 그리기 ---------- */
  const cv = $('field'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const sx = x => (x - Engine.X_MIN) / (Engine.X_MAX - Engine.X_MIN) * W;
  const sy = y => H - (y - Engine.Y_MIN) / (Engine.Y_MAX - Engine.Y_MIN) * H;
  const unit = W / (Engine.X_MAX - Engine.X_MIN);
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function drawField(proj) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = css('--field-bg'); ctx.fillRect(0, 0, W, H);
    // 구역
    for (const z of stage.zones) {
      const x = sx(z.x), y = sy(z.y + z.h), w = z.w * unit, h = z.h * unit;
      if (z.type === 'hot') {
        ctx.fillStyle = 'rgba(220, 38, 38, 0.16)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.6)'; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(185, 28, 28, 0.95)'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(`${z.value}°C`, x + w / 2, y + 20);
      } else {
        const acid = z.value < 7;
        ctx.fillStyle = acid ? 'rgba(234, 179, 8, 0.10)' : 'rgba(59, 130, 246, 0.08)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = acid ? 'rgba(161, 98, 7, 0.9)' : 'rgba(29, 78, 216, 0.85)';
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(z.label || `pH ${z.value}`, x + 8, H - 10);
      }
    }
    // 격자
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= 30; gx++) {
      ctx.strokeStyle = gx % 5 === 0 ? css('--axis') : css('--grid');
      ctx.beginPath(); ctx.moveTo(sx(gx) + .5, 0); ctx.lineTo(sx(gx) + .5, H); ctx.stroke();
    }
    for (let gy = -10; gy <= 10; gy++) {
      ctx.strokeStyle = gy === 0 ? css('--axis') : (gy % 5 === 0 ? css('--axis') : css('--grid'));
      ctx.beginPath(); ctx.moveTo(0, sy(gy) + .5); ctx.lineTo(W, sy(gy) + .5); ctx.stroke();
    }
    ctx.fillStyle = css('--ink-2'); ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
    for (let gx = 5; gx < 30; gx += 5) ctx.fillText(gx, sx(gx), sy(0) + 13);
    ctx.textAlign = 'right';
    for (let gy = -5; gy <= 5; gy += 5) if (gy) ctx.fillText(gy, sx(0) + 22, sy(gy) + 4);
    // 벽
    for (const w of stage.walls) {
      const x = sx(w.x), y = sy(w.y + w.h), ww = w.w * unit, hh = w.h * unit;
      ctx.fillStyle = css('--ink-2'); ctx.fillRect(x, y, ww, hh);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip();
      ctx.strokeStyle = css('--field-bg'); ctx.lineWidth = 2;
      for (let k = -hh; k < ww + hh; k += 10) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k + hh, y + hh); ctx.stroke(); }
      ctx.restore();
    }
    // 지난 궤적
    S.history.slice(-3).forEach((pts, i, arr) => {
      ctx.strokeStyle = css('--ink-2'); ctx.globalAlpha = 0.18 + 0.12 * (i === arr.length - 1);
      ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); pts.forEach((p, k) => k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    });
    // 기질
    for (const bi of S.alive) {
      const b = stage.blocks[bi], sub = SUBSTRATES[b.sub];
      ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), b.r * unit, 0, Math.PI * 2);
      ctx.fillStyle = sub.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
      ctx.fillStyle = '#1d232a'; ctx.font = `bold ${b.sub === 'h2o2' ? 12 : 16}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sub.icon, sx(b.x), sy(b.y));
      ctx.textBaseline = 'alphabetic';
    }
    // 효소 관문(2부)
    if (isPW()) stage.gates.forEach(drawGate);
    // 분해 파티클 · 생성물 글자
    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      if (p.text) {
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // 발사대
    const shooterColor = isPW() ? MOLECULES[stage.start].color : ENZYMES[S.enzyme].color;
    const { x: shx, y: shy } = stage.shooter;
    ctx.beginPath(); ctx.arc(sx(shx), sy(shy), 0.55 * unit, 0, Math.PI * 2);
    ctx.fillStyle = shooterColor; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = css('--surface'); ctx.stroke();
    // 날아가는 효소
    if (proj) {
      ctx.strokeStyle = proj.color; ctx.lineWidth = 3;
      ctx.beginPath(); proj.trail.forEach((p, k) => k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))); ctx.stroke();
      const head = proj.trail[proj.trail.length - 1];
      ctx.beginPath(); ctx.arc(sx(head.x), sy(head.y), Engine.PROJ_R * unit * 1.4, 0, Math.PI * 2);
      ctx.fillStyle = proj.denatured ? '#9ca3af' : proj.color; ctx.fill();
      if (proj.denatured) {
        ctx.fillStyle = '#6b7280'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('변성', sx(head.x), sy(head.y) - 14);
      }
      if (proj.label) {
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = css('--field-bg'); ctx.strokeText(proj.label, sx(head.x), sy(head.y) - 14);
        ctx.fillStyle = css('--ink'); ctx.fillText(proj.label, sx(head.x), sy(head.y) - 14);
      }
    }
  }

  function drawGate(gt) {
    const def = GATES[gt.enz], cx = sx(gt.x), cy = sy(gt.y), half = gt.r * unit;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - half, cy - half, half * 2, half * 2, 8); else ctx.rect(cx - half, cy - half, half * 2, half * 2);
    ctx.fillStyle = css('--surface'); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = gt.inhibitor ? '#b91c1c' : css('--ink-2'); ctx.stroke();
    if (gt.inhibitor) {
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(185, 28, 28, .25)'; ctx.lineWidth = 3;
      for (let k = -2 * half; k < 2 * half; k += 8) { ctx.beginPath(); ctx.moveTo(cx - half + k, cy - half); ctx.lineTo(cx - half + k + 2 * half, cy + half); ctx.stroke(); }
      ctx.restore();
    }
    ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif';
    def.short.forEach((line, k) => {
      const ty = cy - 3 + k * 12;
      ctx.lineWidth = 3; ctx.strokeStyle = css('--surface'); ctx.strokeText(line, cx, ty);
      ctx.fillStyle = css('--ink'); ctx.fillText(line, cx, ty);
    });
    if (gt.inhibitor) {
      ctx.fillStyle = '#b91c1c'; ctx.font = 'bold 11px sans-serif';
      ctx.fillText('말론산', cx, cy - half - 5);
    }
  }

  function floatText(x, y, text, color, dy) {
    S.particles.push({ x: sx(x), y: sy(y), vx: (Math.random() - 0.5) * 0.6, vy: dy, r: 0, life: 1.6, color, text });
  }

  function burst(x, y, color) {
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3;
      S.particles.push({ x: sx(x), y: sy(y), vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 3, life: 1, color });
    }
  }
  function stepParticles() {
    S.particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; });
    S.particles = S.particles.filter(p => p.life > 0);
  }

  /* ---------- 에너지 도표 ---------- */
  const dv = $('diagram'), dctx = dv.getContext('2d');
  function drawDiagram() {
    if (isPW()) { drawCycle(); return; }
    const DW = dv.width, DH = dv.height;
    dctx.clearRect(0, 0, DW, DH);
    dctx.fillStyle = css('--surface'); dctx.fillRect(0, 0, DW, DH);
    const hidden = stage.hideDiagram && !S.lastEval; // 종합 스테이지: 발사 전 미리보기 없음, 결과만 공개
    const subId = S.lastEval ? S.lastEval.sub : $('diagram-sub').value;
    const sub = SUBSTRATES[subId];
    let ev = S.lastEval;
    if (!ev) {
      const denat = S.enzyme !== 'heat' && S.T >= ENZYMES[S.enzyme].denatureT;
      ev = { ...Engine.evaluate(S.enzyme, S.T, denat, stage.fieldPH, subId), sub: subId, enzyme: S.enzyme, pH: stage.fieldPH, preview: true };
    }
    const L = 34, R = DW - 10, T0 = 12, B = DH - 26;
    const ey = e => B - (e / 100) * (B - T0);
    // 축
    dctx.strokeStyle = css('--axis'); dctx.lineWidth = 1;
    dctx.beginPath(); dctx.moveTo(L, T0); dctx.lineTo(L, B); dctx.lineTo(R, B); dctx.stroke();
    dctx.fillStyle = css('--ink-2'); dctx.font = '11px sans-serif'; dctx.textAlign = 'center';
    dctx.fillText('반응 진행 →', (L + R) / 2, DH - 8);
    dctx.save(); dctx.translate(12, (T0 + B) / 2); dctx.rotate(-Math.PI / 2); dctx.fillText('에너지 →', 0, 0); dctx.restore();
    if (hidden) {
      dctx.fillStyle = css('--ink-2'); dctx.font = 'bold 14px sans-serif';
      dctx.fillText('발사 후 공개됩니다 — 먼저 예측하세요', (L + R) / 2, (T0 + B) / 2);
      $('diagram-verdict').textContent = '';
      return;
    }
    const base = 10, prod = 2; // 반응물·생성물 에너지(상대)
    const curve = (peak, dash, color, width) => {
      dctx.strokeStyle = color; dctx.lineWidth = width; dctx.setLineDash(dash);
      dctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const t = i / 100, x = L + 6 + t * (R - L - 12);
        const bump = Math.exp(-Math.pow((t - 0.5) / 0.13, 2));
        const y = ey(t < 0.5 ? base + (peak - base) * bump : prod + (peak - prod) * bump);
        i ? dctx.lineTo(x, y) : dctx.moveTo(x, y);
      }
      dctx.stroke(); dctx.setLineDash([]);
    };
    curve(sub.EaUncat + base, [], css('--ink-2'), 2);
    if (ev.active) curve(sub.EaCat + base, [], ENZYMES[ev.enzyme].color, 3);
    else if (ENZYMES[ev.enzyme].substrate === subId) curve(sub.EaCat + base, [5, 4], ENZYMES[ev.enzyme].color, 1.5);
    // 분자 에너지 선
    const Ey = ey(ev.E + base);
    dctx.strokeStyle = ev.ok ? css('--ok') : css('--bad'); dctx.lineWidth = 2; dctx.setLineDash([2, 3]);
    dctx.beginPath(); dctx.moveTo(L, Ey); dctx.lineTo(R, Ey); dctx.stroke(); dctx.setLineDash([]);
    dctx.fillStyle = ev.ok ? css('--ok') : css('--bad'); dctx.textAlign = 'left'; dctx.font = 'bold 11px sans-serif';
    dctx.fillText(`분자 에너지 ${ev.E}`, L + 4, Math.max(T0 + 10, Ey - 4));
    dctx.fillStyle = css('--ink-2'); dctx.textAlign = 'right'; dctx.font = '11px sans-serif';
    dctx.fillText(`효소 없음 ${sub.EaUncat}`, R, ey(sub.EaUncat + base) - 4);
    if (ENZYMES[ev.enzyme].substrate === subId) {
      dctx.fillStyle = ENZYMES[ev.enzyme].color;
      dctx.fillText(`효소 ${sub.EaCat}${ev.active ? '' : ' (작용 안 함)'}`, R, ey(sub.EaCat + base) + 14);
    }
    dctx.fillStyle = css('--ink-2'); dctx.textAlign = 'left';
    dctx.fillText(sub.name, L + 6, ey(base) + 14);
    dctx.textAlign = 'right'; dctx.fillText(sub.product, R - 4, ey(prod) + 14);

    const head = ev.preview ? '발사 전 미리보기' : '마지막 접촉';
    const cond = `${ENZYMES[ev.enzyme].name} · ${ev.E}°C · pH ${ev.pH}${ev.denatured ? ' · 변성됨' : ''}`;
    $('diagram-verdict').innerHTML = `${head}: ${cond} → ${ev.ok ? '<b class="ok">장벽 넘음(분해)</b>' : '<b class="bad">장벽 못 넘음</b>'}` +
      (ev.preview && stage.zones.length ? '<br>※ 구역에 들어가면 조건이 달라질 수 있습니다.' : '');
  }

  /* ---------- TCA 회로 지도 · 생성물 장부 (2부) ---------- */
  const CYCLE = ['citrate', 'isocitrate', 'akg', 'succoa', 'succinate', 'fumarate', 'malate', 'oaa'];
  const SHORT = { citrate: '시트르산', isocitrate: '아이소시트르산', akg: 'α-케토글루타르산', succoa: '석시닐 CoA', succinate: '석신산', fumarate: '푸마르산', malate: '말산', oaa: '옥살아세트산', acetylcoa: '아세틸 CoA', pyruvate: '피루브산' };
  function drawCycle() {
    const DW = dv.width, DH = dv.height;
    dctx.clearRect(0, 0, DW, DH);
    dctx.fillStyle = css('--surface'); dctx.fillRect(0, 0, DW, DH);
    const cx = 112, cy = 112, R = 58;
    const cur = S.molecule;
    const pos = CYCLE.map((m, k) => { const a = -Math.PI / 2 + (k + 0.5) * (2 * Math.PI / 8); return { m, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; });
    // 고리
    dctx.strokeStyle = css('--axis'); dctx.lineWidth = 2;
    dctx.beginPath(); dctx.arc(cx, cy, R, 0, Math.PI * 2); dctx.stroke();
    // 회전 방향 화살표(시계 방향)
    dctx.fillStyle = css('--axis');
    dctx.beginPath(); dctx.moveTo(cx + R + 5, cy - 4); dctx.lineTo(cx + R - 5, cy - 4); dctx.lineTo(cx + R, cy + 5); dctx.fill();
    // 아세틸 CoA 진입
    const top = { x: cx, y: cy - R };
    dctx.strokeStyle = css('--ink-2'); dctx.lineWidth = 1.5;
    dctx.beginPath(); dctx.moveTo(top.x, 14); dctx.lineTo(top.x, top.y - 4); dctx.stroke();
    dctx.fillStyle = cur === 'acetylcoa' ? MOLECULES.acetylcoa.color : css('--ink-2');
    dctx.font = `${cur === 'acetylcoa' ? 'bold ' : ''}10px sans-serif`; dctx.textAlign = 'center';
    dctx.fillText(cur === 'pyruvate' ? '피루브산 → 아세틸 CoA' : '아세틸 CoA', top.x, 11);
    pos.forEach(p => {
      const on = p.m === cur;
      dctx.beginPath(); dctx.arc(p.x, p.y, on ? 12 : 9, 0, Math.PI * 2);
      dctx.fillStyle = on ? MOLECULES[p.m].color : css('--surface-2'); dctx.fill();
      dctx.lineWidth = on ? 3 : 1.5; dctx.strokeStyle = on ? css('--ink') : css('--axis'); dctx.stroke();
      dctx.fillStyle = on ? '#1d232a' : css('--ink-2'); dctx.font = 'bold 9px sans-serif'; dctx.textBaseline = 'middle';
      dctx.fillText(`${MOLECULES[p.m].C}C`, p.x, p.y);
      dctx.textBaseline = 'alphabetic';
      const lx = p.x + Math.cos(p.a) * 20, ly = p.y + Math.sin(p.a) * 18 + 3;
      dctx.textAlign = Math.cos(p.a) > 0.3 ? 'left' : Math.cos(p.a) < -0.3 ? 'right' : 'center';
      dctx.font = `${on ? 'bold ' : ''}10px sans-serif`; dctx.fillStyle = on ? css('--ink') : css('--ink-2');
      dctx.fillText(p.m === 'akg' ? 'α-KG' : SHORT[p.m], lx, ly);
    });
    // 장부
    const L = S.liveLedger || { co2: 0, nadh: 0, fadh2: 0, atp: 0, h2o: 0 };
    const rows = [['CO₂ 나감', L.co2], ['NADH', L.nadh], ['FADH₂', L.fadh2], ['ATP(GTP)', L.atp], ['H₂O 들어감', -L.h2o]];
    const x0 = 272; // 오른쪽 라벨(아이소시트르산)과 겹치지 않게
    dctx.textAlign = 'left'; dctx.fillStyle = css('--ink-2'); dctx.font = 'bold 11px sans-serif';
    dctx.fillText('생성물 장부', x0, 40);
    dctx.font = '11px sans-serif'; dctx.fillText('(이번 발사)', x0, 54);
    rows.forEach(([k, v], i) => {
      const y = 80 + i * 22;
      dctx.fillStyle = css('--ink-2'); dctx.font = '11px sans-serif'; dctx.textAlign = 'left'; dctx.fillText(k, x0, y);
      dctx.fillStyle = css('--ink'); dctx.font = 'bold 15px sans-serif'; dctx.textAlign = 'right'; dctx.fillText(String(v), DW - 6, y);
    });
    dctx.textAlign = 'left';
    const m = MOLECULES[cur];
    $('diagram-verdict').innerHTML = `현재 분자: <b>${m.name} (${m.C}C)</b> · 목표: ${MOLECULES[stage.target].name}`;
  }

  /* ---------- 기록 ---------- */
  function addLog(cls, text) {
    const li = document.createElement('li');
    li.className = cls; li.textContent = text;
    $('log').prepend(li);
    // 핵심 판정은 필드 위에도 띄워 스크롤 없이 보이게 한다
    if (['ok', 'bad', 'warn'].includes(cls)) {
      const t = $('toast'), line = document.createElement('div');
      line.textContent = text;
      t.appendChild(line);
      while (t.children.length > 3) t.firstChild.remove();
      // 한 발 안에서 가장 심각한 판정 색을 유지
      const rank = { ok: 1, warn: 2, bad: 3 };
      if (!t.dataset.level || rank[cls] > rank[t.dataset.level]) { t.dataset.level = cls; t.className = `toast ${cls}`; }
      t.hidden = false;
    }
  }

  function describe(ev) {
    const e = ENZYMES[ev.enzyme ?? S.enzyme], sub = SUBSTRATES[stage.blocks[ev.block].sub];
    if (ev.type === 'react') {
      if (ev.catalyzed) return ['ok', `✔ ${josa(e.name, '이/가')} ${josa(sub.name, '을/를')} 분해했습니다. 장벽 높이가 ${sub.EaUncat}에서 ${sub.EaCat}(으)로 낮아져, 분자 에너지 ${ev.E}만으로도 넘을 수 있었습니다. 생성물: ${sub.product}. 효소는 변하지 않고 계속 날아갑니다.`];
      return ['warn', `△ ${josa(sub.name, '이/가')} 분해되었지만 효소 덕분이 아닙니다. ${ev.E}°C의 높은 에너지로 원래 장벽(높이 ${sub.EaUncat})을 그냥 넘은 것입니다. 세포는 이런 온도를 견디지 못합니다.`];
    }
    switch (ev.reason) {
      case 'mismatch': return ['bad', `✖ ${e.name}의 활성 부위는 ${sub.name}에 맞지 않습니다(기질 특이성). 장벽 높이 ${sub.EaUncat} 그대로 → 반응 없음.`];
      case 'denatured': return ['bad', `✖ 변성된 ${josa(e.name, '은/는')} 활성 부위 모양이 망가져 ${josa(sub.name, '을/를')} 분해하지 못합니다. 장벽 높이 ${sub.EaUncat} 그대로.`];
      case 'ph': return ['bad', `✖ pH ${ev.pH}에서는 ${josa(e.name, '이/가')} 작용하지 못합니다(작용 범위 pH ${e.pH[0]}–${e.pH[1]}). 장벽 높이 ${sub.EaUncat} 그대로.`];
      case 'cold': return ['bad', `✖ 맞는 효소지만, 분자 에너지 ${ev.E}로는 낮아진 장벽(높이 ${sub.EaCat})도 넘지 못합니다. 온도가 낮으면 반응이 거의 일어나지 않습니다(효소가 변성된 것은 아님).`];
      default: return ['bad', `✖ 효소 없이 분자 에너지 ${ev.E}로는 ${sub.name}의 장벽(높이 ${sub.EaUncat})을 넘지 못합니다.`];
    }
  }

  /* ---------- 발사 ---------- */
  function fire() {
    if (isPW()) return firePathway();
    if (S.busy || S.shotsLeft <= 0 || !S.alive.length) return;
    let fn;
    try { fn = parse($('fx').value); fn(stage.shooter.x); }
    catch (err) { $('fx-error').textContent = err.message; return; }
    $('fx-error').textContent = '';
    let prediction = null;
    if (stage.predict) {
      const r = document.querySelector('input[name="predict"]:checked');
      if (!r) { $('fx-error').textContent = '발사 전에 결과를 먼저 예측하세요(④).'; return; }
      prediction = r.value;
    }
    updateTemp();
    const shot = { enzyme: S.enzyme, T: stage.tempControl ? S.T : stage.defaultT, fn };
    const res = Engine.simulate(stage, S.alive, shot);
    S.busy = true; $('btn-fire').disabled = true;
    const toast = $('toast'); toast.innerHTML = ''; toast.hidden = true; delete toast.dataset.level;
    S.shotsLeft--;
    S.damage += res.damage;
    const e = ENZYMES[shot.enzyme];
    addLog('shot', `#${stage.shots - S.shotsLeft} ${e.name} · ${shot.T}°C · y = ${$('fx').value.trim()}`);
    if (res.damage) addLog('warn', `⚠ ${shot.T}°C로 발사 — 세포 손상 +1. 생물체 안에서는 이런 고온을 쓸 수 없습니다.`);

    // 기록
    const firstContact = res.events.find(ev => ev.type === 'react' || ev.type === 'bounce');
    let predOk = null;
    if (prediction && firstContact) {
      predOk = prediction === firstContact.type;
      S.predictions.total++; if (predOk) S.predictions.correct++;
    }
    res.events.filter(ev => ev.type === 'bounce').forEach(ev => { S.reasons[ev.reason] = (S.reasons[ev.reason] || 0) + 1; });
    if (res.events.some(ev => ev.type === 'denature-zone' || ev.type === 'denature-launch')) S.reasons.denatureEvent = (S.reasons.denatureEvent || 0) + 1;
    S.shots.push({
      enzyme: shot.enzyme, T: shot.T, f: $('fx').value.trim(), broken: res.broken.length,
      stop: res.stop.type, reason: firstContact && firstContact.type === 'bounce' ? firstContact.reason : null,
      heatDriven: res.events.some(ev => ev.type === 'react' && ev.heatDriven),
      prediction, predictionCorrect: predOk,
    });

    animate(res, shot);
  }

  function animate(res, shot) {
    const e = ENZYMES[shot.enzyme];
    const proj = { trail: [res.points[0]], color: e.color, denatured: res.events.some(ev => ev.type === 'denature-launch') };
    if (proj.denatured) addLog('warn', `⚠ ${shot.T}°C에서 ${josa(e.name, '이/가')} 발사 순간 변성되었습니다(${e.denatureT}°C 이상).`);
    const evs = res.events.filter(ev => ev.type !== 'denature-launch');
    let i = 0, ei = 0;
    const SPEED = 9;
    function frame() {
      const next = Math.min(res.points.length - 1, i + SPEED);
      for (; i <= next; i++) {
        proj.trail.push(res.points[i]);
        while (ei < evs.length && evs[ei].i <= i) {
          const ev = { ...evs[ei], enzyme: shot.enzyme };
          if (ev.type === 'react') {
            S.alive = S.alive.filter(b => b !== ev.block);
            burst(ev.x, ev.y, SUBSTRATES[stage.blocks[ev.block].sub].color);
            const [c, t] = describe(ev); addLog(c, t);
            S.lastEval = { ...ev, sub: stage.blocks[ev.block].sub };
          } else if (ev.type === 'bounce') {
            const [c, t] = describe(ev); addLog(c, t);
            S.lastEval = { ...ev, sub: stage.blocks[ev.block].sub };
          } else if (ev.type === 'denature-zone') {
            proj.denatured = true;
            addLog('warn', `⚠ ${ev.value}°C 구역 통과 — ${josa(e.name, '이/가')} 변성되었습니다. 식혀도 원래 모양으로 돌아오지 않습니다.`);
          } else if (ev.type === 'ph-change') {
            addLog('', `pH ${ev.pH} 구역에 들어갔습니다.`);
          }
          ei++;
        }
      }
      stepParticles();
      drawField(proj);
      updateHUD();
      if (i < res.points.length) requestAnimationFrame(frame);
      else finishShot(res, proj);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 2부 발사 ---------- */
  const LEDGER_KEYS = ['co2', 'nadh', 'fadh2', 'atp', 'h2o'];
  const OUT_LABEL = { co2: 'CO₂', nadh: 'NADH', fadh2: 'FADH₂', atp: 'ATP(GTP)', h2o: 'H₂O' };
  function outText(out) {
    const parts = Object.entries(out).map(([k, v]) => (k === 'h2o' ? `H₂O ${-v}개 들어감` : `${OUT_LABEL[k]} ${v}개${k === 'co2' ? ' 나감' : ' 생성'}`));
    return parts.length ? parts.join(', ') : '부산물 없음';
  }
  function firePathway() {
    if (S.busy || S.shotsLeft <= 0) return;
    let fn;
    try { fn = parse($('fx').value); fn(stage.shooter.x); }
    catch (err) { $('fx-error').textContent = err.message; return; }
    if (stage.predictLedger && !S.ledgerPred) {
      const vals = LEDGER_KEYS.map(k => $('lp-' + k).value.trim());
      if (vals.some(v => v === '')) { $('fx-error').textContent = '발사 전에 한 바퀴의 수지를 먼저 예측하세요(④).'; return; }
      S.ledgerPred = Object.fromEntries(LEDGER_KEYS.map((k, i) => [k, +vals[i]]));
      document.querySelectorAll('#ledger-predict-block input').forEach(el => { el.disabled = true; });
      addLog('', `예측 기록: CO₂ ${S.ledgerPred.co2}, NADH ${S.ledgerPred.nadh}, FADH₂ ${S.ledgerPred.fadh2}, ATP ${S.ledgerPred.atp}, H₂O ${S.ledgerPred.h2o}`);
    }
    $('fx-error').textContent = '';
    const res = Engine.simulatePathway(stage, { fn });
    S.busy = true; $('btn-fire').disabled = true;
    const toast = $('toast'); toast.innerHTML = ''; toast.hidden = true; delete toast.dataset.level;
    S.shotsLeft--;
    S.molecule = stage.start;
    S.liveLedger = { co2: 0, nadh: 0, fadh2: 0, atp: 0, h2o: 0 };
    addLog('shot', `#${stage.shots - S.shotsLeft} ${MOLECULES[stage.start].name} 발사 · y = ${$('fx').value.trim()}`);
    const rej = res.events.find(ev => ev.type === 'reject');
    if (rej) S.reasons[rej.reason] = (S.reasons[rej.reason] || 0) + 1;
    S.shots.push({
      f: $('fx').value.trim(), stop: res.stop.type, completed: res.completed, finalMolecule: res.molecule,
      reason: rej ? rej.reason : null, rejectedAt: rej ? stage.gates[rej.gate].enz : null, ledger: res.ledger,
      prediction: null, predictionCorrect: null,
    });
    if (res.completed) S.completedLedger = res.ledger;

    const proj = { trail: [res.points[0]], color: MOLECULES[stage.start].color, label: MOLECULES[stage.start].name };
    let i = 0, ei = 0;
    const SPEED = 7;
    function frame() {
      const next = Math.min(res.points.length - 1, i + SPEED);
      for (; i <= next; i++) {
        proj.trail.push(res.points[i]);
        while (ei < res.events.length && res.events[ei].i <= i) {
          const ev = res.events[ei], gt = ev.gate != null ? stage.gates[ev.gate] : null;
          if (ev.type === 'convert') {
            const def = GATES[gt.enz], a = MOLECULES[ev.from], b = MOLECULES[ev.to];
            S.molecule = ev.to;
            proj.color = b.color; proj.label = b.name;
            for (const [k, v] of Object.entries(ev.out)) {
              S.liveLedger[k] += v;
              if (k === 'h2o') floatText(ev.x - 0.8, ev.y - 1.2, 'H₂O ↓', '#0284c7', -1.2);
              else for (let n = 0; n < v; n++) floatText(ev.x + n * 0.6, ev.y + 0.6, OUT_LABEL[k], k === 'co2' ? '#6b7280' : '#15803d', -1.4);
            }
            addLog('ok', `✔ ${def.name}: ${a.name}(${a.C}C) → ${b.name}(${b.C}C). ${outText(ev.out)}. ${def.note}`);
            drawDiagram();
          } else if (ev.type === 'reject') {
            const def = GATES[gt.enz], a = MOLECULES[ev.from];
            addLog('bad', ev.reason === 'inhibited'
              ? `✖ ${def.name}의 활성 부위를 말론산이 차지하고 있습니다(경쟁적 저해). ${josa(a.name, '이/가')} 결합하지 못하고 튕겨 나갑니다.`
              : `✖ ${def.name}의 기질은 ${MOLECULES[def.from].name}입니다. 지금 분자는 ${josa(a.name, '이라/라')} 결합하지 못하고 튕겨 나갑니다.`);
          } else if (ev.type === 'complete') {
            addLog('ok', `★ 목표 도달: ${MOLECULES[stage.target].name}!`);
          }
          ei++;
        }
      }
      stepParticles();
      drawField(proj);
      if (i < res.points.length) requestAnimationFrame(frame);
      else {
        if (!res.completed && !rej) {
          const m = MOLECULES[res.molecule];
          addLog('warn', `◎ 분자가 ${m.name}(${m.C}C)에서 멈춰 있습니다. 다음 단계에 필요한 효소 관문을 지나지 못했습니다.`);
        }
        finishShot(res, proj);
      }
    }
    requestAnimationFrame(frame);
  }

  function finishShot(res, proj) {
    const stopMsg = {
      wall: '막에 부딪혀 멈췄습니다.', out: '궤적이 화면 밖으로 나갔습니다.', edge: '오른쪽 끝에 도달했습니다.',
      undefined: '함수값이 정의되지 않는 곳(0으로 나누기, 음수의 제곱근 등)에서 궤적이 끊겼습니다.', bounce: null, reject: null,
    }[res.stop.type];
    if (stopMsg) addLog('', stopMsg);
    if (res.nearMiss) addLog('warn', nearMissText(res.nearMiss, res.stop));
    const last = S.shots[S.shots.length - 1];
    if (last.predictionCorrect !== null) addLog(last.predictionCorrect ? 'ok' : 'warn', `예측 ${last.predictionCorrect ? '적중' : '빗나감'} — 에너지 도표로 이유를 확인하세요.`);
    S.history.push(proj.trail);
    S.fired = true;
    document.querySelectorAll('input[name="predict"]').forEach(r => { r.checked = false; });
    // 파티클 마무리
    const settle = () => {
      stepParticles(); drawField();
      if (S.particles.length) requestAnimationFrame(settle);
    };
    settle();
    drawDiagram();
    S.busy = false; $('btn-fire').disabled = false;
    const cleared = isPW() ? res.completed : !S.alive.length;
    if (cleared) endStage(true);
    else if (S.shotsLeft <= 0) endStage(false);
  }

  // 그래프 읽기 언어로 빗나간 정도를 알려 준다. 정답 수식은 알려 주지 않는다.
  function nearMissText(nm, stop) {
    const b = stage.blocks[nm.block], name = SUBSTRATES[b.sub].name;
    const where = `${name}(${b.x}, ${b.y})`;
    if (nm.crossY === null) {
      return `◎ 가장 가까운 기질은 ${where}입니다. 궤적이 x = ${stop.x.toFixed(1)}에서 끝나 x = ${b.x}까지 가지 못했습니다.`;
    }
    const dy = nm.crossY - b.y;
    const dir = dy > 0 ? '위로' : '아래로';
    return `◎ 가장 가까운 기질은 ${where}입니다. 궤적은 x = ${b.x}에서 y = ${nm.crossY.toFixed(1)}을 지나, ${Math.abs(dy).toFixed(1)}칸 ${dir} 빗나갔습니다.`;
  }

  /* ---------- 스테이지 종료 ---------- */
  function computeStars(cleared) {
    if (!cleared) return 0;
    const used = stage.shots - S.shotsLeft;
    let s = used <= stage.par ? 3 : used <= stage.par + 2 ? 2 : 1;
    if (S.damage > 0) s = Math.min(s, 2);
    return s;
  }

  function endStage(cleared) {
    const stars = computeStars(cleared);
    const used = stage.shots - S.shotsLeft;
    const attempt = {
      at: new Date().toISOString(), cleared, stars, shotsUsed: used, par: stage.par, damage: S.damage,
      seconds: Math.round((Date.now() - S.startedAt) / 1000), reasons: S.reasons, predictions: S.predictions,
      helpOpened: S.helpOpened, shots: S.shots, reflection: '',
      ...(isPW() ? { ledger: S.completedLedger, ledgerPrediction: S.ledgerPred } : {}),
    };
    const rec = store.stages[stage.id] || { best: 0, attempts: [] };
    rec.attempts.push(attempt);
    rec.best = Math.max(rec.best, stars);
    store.stages[stage.id] = rec;
    save();

    const reasonsTxt = Object.entries(S.reasons).filter(([k]) => REASON_LABEL[k]).map(([k, v]) => `${REASON_LABEL[k]} ${v}`).join(', ') || '없음';
    const pw = isPW();
    const msg = pw
      ? (cleared ? `${MOLECULES[stage.target].name}에 도달했습니다.` : `발사를 모두 썼습니다. 목표 분자 ${MOLECULES[stage.target].name}에 도달하지 못했습니다.`)
      : (cleared ? '모든 기질을 분해했습니다.' : `발사를 모두 썼습니다. 남은 기질 ${S.alive.length}개.`);
    let cmp = '';
    if (pw && S.ledgerPred) {
      const act = S.completedLedger;
      cmp = `<table class="cmp-table"><tr><th></th>${LEDGER_KEYS.map(k => `<th>${OUT_LABEL[k]}${k === 'h2o' ? ' 들어감' : ''}</th>`).join('')}</tr>
        <tr><td>예측</td>${LEDGER_KEYS.map(k => `<td>${S.ledgerPred[k]}</td>`).join('')}</tr>
        <tr><td>실제</td>${LEDGER_KEYS.map(k => {
          if (!act) return '<td>-</td>';
          const v = k === 'h2o' ? -act[k] : act[k];
          return `<td class="${v === S.ledgerPred[k] ? 'hit' : 'miss'}">${v}</td>`;
        }).join('')}</tr></table>`;
      attempt.ledgerPredictionHits = act ? LEDGER_KEYS.filter(k => (k === 'h2o' ? -act[k] : act[k]) === S.ledgerPred[k]).length : null;
      save();
    }
    const body = `
      ${starsHTML(stars, true)}
      <p>${msg}</p>
      ${cmp}
      <div class="stat-grid">
        <div class="stat">사용한 발사<b>${used} / 목표 ${stage.par}</b></div>
        ${pw ? '' : `<div class="stat">세포 손상<b>${S.damage}</b></div>`}
        <div class="stat">실패 원인<b style="font-size:14px">${reasonsTxt}</b></div>
        ${stage.predict ? `<div class="stat">예측 적중<b>${S.predictions.correct} / ${S.predictions.total}</b></div>` : ''}
      </div>
      <label for="reflection"><b>설명해 보기</b> — ${stage.reflection}</label>
      <textarea id="reflection" placeholder="두세 문장으로 써 보세요."></textarea>`;
    const next = STAGES[STAGES.indexOf(stage) + 1];
    openModal(cleared ? `스테이지 ${stage.id} 완료` : `스테이지 ${stage.id} 종료`, body, [
      { label: '다시 하기', cls: 'ghost', fn: () => { saveReflection(attempt); startStage(stage); } },
      { label: '목록', cls: 'ghost', fn: () => { saveReflection(attempt); renderStageList(); show('screen-start'); } },
      ...(next ? [{ label: '다음 스테이지 →', cls: 'primary', fn: () => { saveReflection(attempt); startStage(next); } }] : []),
    ]);
  }
  function saveReflection(attempt) {
    const t = $('reflection');
    attempt.reflection = t ? t.value.trim() : '';
    save();
  }

  /* ---------- 모달 ---------- */
  function openModal(title, html, actions) {
    $('modal-title').textContent = title;
    $('modal-body').innerHTML = html;
    const box = $('modal-actions'); box.innerHTML = '';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `btn ${a.cls || ''}`; b.textContent = a.label;
      b.addEventListener('click', () => { closeModal(); a.fn && a.fn(); });
      box.appendChild(b);
    });
    $('modal').hidden = false;
    const focusable = $('modal').querySelector('textarea, button');
    focusable && focusable.focus();
  }
  function closeModal() { $('modal').hidden = true; }

  function openHelp() {
    S.helpOpened++;
    openModal('수식 도움말', `
      <p>궤적은 <code>y = f(x)</code>의 그래프입니다. 발사대에서 출발하도록 자동으로 평행이동되므로, <b>그래프의 모양</b>만 생각하면 됩니다.</p>
      <table class="help-table">
        <tr><td><code>0.5x</code></td><td>기울기 0.5인 직선</td></tr>
        <tr><td><code>-0.2(x-1)(x-17)</code></td><td>x=1, x=17을 지나는 위로 볼록한 포물선</td></tr>
        <tr><td><code>3sin(x/3)</code></td><td>물결 모양</td></tr>
        <tr><td><code>0.0005x^3</code></td><td>처음엔 완만하다가 급하게 꺾임</td></tr>
        <tr><td><code>abs(x-10)</code></td><td>x=10에서 꺾이는 V자</td></tr>
        <tr><td><code>exp(0.3x)</code></td><td>지수 함수 — 뒤로 갈수록 급상승</td></tr>
      </table>
      <p>쓸 수 있는 것: <code>+ - * / ^ ( )</code>, <code>sin cos tan abs sqrt exp ln log pi e</code>. <code>2x</code>처럼 곱셈 기호를 생략해도 됩니다.</p>
      <p><b>1부 반응 규칙</b>: 분자 에너지(=온도) ≥ 유효 활성화 에너지. 효소는 맞는 기질·변성 안 됨·알맞은 pH일 때만 장벽을 낮춥니다.</p>
      <p><b>2부 경로 규칙</b>: 분자는 지금 자기를 기질로 삼는 효소 관문만 통과하며 다음 중간 산물로 바뀝니다. 맞지 않거나 억제된 관문에 닿으면 튕겨 나갑니다. 한 줄에서 관문 하나만 지나가도록 궤적을 설계하세요.</p>`,
      [{ label: '닫기', cls: 'primary' }]);
  }

  /* ---------- 결과 ---------- */
  function totals() {
    const sum = {};
    Object.values(store.stages).forEach(r => r.attempts.forEach(a => Object.entries(a.reasons).forEach(([k, v]) => { sum[k] = (sum[k] || 0) + v; })));
    return sum;
  }
  function renderResults() {
    const st = store.student || {};
    $('results-who').textContent = `${st.id || '(학번 없음)'} ${st.name || '(이름 없음)'}`;
    let rows = '<tr><th>스테이지</th><th>최고</th><th>시도</th><th>최근 발사</th><th>최근 설명</th></tr>';
    STAGES.forEach(s => {
      const r = store.stages[s.id];
      const last = r && r.attempts[r.attempts.length - 1];
      rows += `<tr><td>${s.id}. ${s.title}</td><td>${starsHTML(r ? r.best : 0)}</td><td>${r ? r.attempts.length : 0}</td>
        <td>${last ? `${last.shotsUsed}/${last.par}` : '-'}</td><td>${last && last.reflection ? escapeHTML(last.reflection) : '-'}</td></tr>`;
    });
    $('results-table').innerHTML = rows;
    const sum = totals();
    $('results-reasons').innerHTML = Object.keys(REASON_LABEL).map(k => `<div class="reason">${REASON_LABEL[k]}<b>${sum[k] || 0}</b></div>`).join('');
    show('screen-results');
  }
  function escapeHTML(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function exportPayload() {
    return { app: 'enzyme-trajectory', version: 1, exportedAt: new Date().toISOString(), student: store.student, stages: store.stages, reasonTotals: totals() };
  }
  function download() {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const st = store.student || {};
    a.href = URL.createObjectURL(blob);
    a.download = `효소궤적_${st.id || 'noid'}_${st.name || 'noname'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function summaryText() {
    const st = store.student || {};
    const lines = [`[효소 궤적] ${st.id || ''} ${st.name || ''}`];
    STAGES.forEach(s => {
      const r = store.stages[s.id];
      if (!r) return;
      const last = r.attempts[r.attempts.length - 1];
      lines.push(`${s.id}. ${s.title}: 최고 ★${r.best}, 시도 ${r.attempts.length}회${last.reflection ? ` / 설명: ${last.reflection}` : ''}`);
    });
    const sum = totals();
    lines.push('실패 원인: ' + Object.keys(REASON_LABEL).map(k => `${REASON_LABEL[k]} ${sum[k] || 0}`).join(', '));
    return lines.join('\n');
  }

  /* ---------- 이벤트 ---------- */
  $('in-sid').value = (store.student && store.student.id) || '';
  $('in-name').value = (store.student && store.student.name) || '';
  $('student-form').addEventListener('submit', e => e.preventDefault());
  $('btn-back').addEventListener('click', () => { if (!S || !S.busy) { renderStageList(); show('screen-start'); } });
  $('btn-fire').addEventListener('click', fire);
  $('fx').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); fire(); } });
  $('fx').addEventListener('input', () => { $('fx-error').textContent = ''; });
  $('temp').addEventListener('input', () => { updateTemp(); S.lastEval = null; drawDiagram(); });
  $('diagram-sub').addEventListener('change', () => { S.lastEval = null; drawDiagram(); });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-results').addEventListener('click', () => {
    store.student = { id: $('in-sid').value.trim(), name: $('in-name').value.trim() }; save(); renderResults();
  });
  $('btn-results-back').addEventListener('click', () => { renderStageList(); show('screen-start'); });
  $('btn-download').addEventListener('click', download);
  $('btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(summaryText()); $('copy-msg').textContent = '복사했습니다. 과제 제출란에 붙여 넣으세요.'; }
    catch { $('copy-msg').textContent = '복사 권한이 없어 파일 저장을 이용하세요.'; }
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('이 기기에 저장된 모든 기록을 지웁니다. 계속할까요?')) return;
    store = { student: {}, stages: {} }; save(); renderResults();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden && $('modal-title').textContent === '수식 도움말') closeModal(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (stage) { drawField(); drawDiagram(); } });

  renderStageList();
})();
