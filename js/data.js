/* 게임 데이터 — 기질·효소·스테이지
 * 에너지 단위는 모두 "게임용 상대 단위"다. 분자 에너지 지수 = 반응 온도(°C) 값으로 둔다.
 * 실제 활성화 에너지(kJ/mol)와 1:1 대응하지 않으며, '효소가 장벽을 낮춘다'는 관계만 보존한다.
 */
(function (root) {
  const SUBSTRATES = {
    starch:  { name: '녹말',       icon: '녹', color: '#e9c46a', EaUncat: 85, EaCat: 25, product: '엿당' },
    protein: { name: '단백질',     icon: '단', color: '#e76f51', EaUncat: 90, EaCat: 25, product: '작은 펩타이드' },
    fat:     { name: '지방',       icon: '지', color: '#f4a261', EaUncat: 80, EaCat: 25, product: '지방산 + 모노글리세리드' },
    h2o2:    { name: '과산화 수소', icon: 'H₂O₂', color: '#8ecae6', EaUncat: 75, EaCat: 20, product: '물 + 산소' },
  };

  // pH: 활성을 보이는 범위(게임용 단순화). denatureT: 이 온도 이상이면 비가역적으로 변성.
  const ENZYMES = {
    amylase:  { name: '아밀레이스',  where: '침샘·이자',   substrate: 'starch',  pH: [6, 8],   denatureT: 55, color: '#2a9d8f' },
    pepsin:   { name: '펩신',        where: '위',          substrate: 'protein', pH: [1, 3],   denatureT: 55, color: '#9b5de5' },
    trypsin:  { name: '트립신',      where: '이자 → 소장', substrate: 'protein', pH: [7, 9],   denatureT: 55, color: '#00a6fb' },
    lipase:   { name: '라이페이스',  where: '이자 → 소장', substrate: 'fat',     pH: [7, 9],   denatureT: 55, color: '#f15bb5' },
    catalase: { name: '카탈레이스',  where: '간 등 대부분의 세포', substrate: 'h2o2', pH: [6, 9], denatureT: 55, color: '#38b000' },
    heat:     { name: '효소 없음(가열만)', where: '—', substrate: null, pH: null, denatureT: null, color: '#6c757d' },
  };

  const DAMAGE_T = 50; // 이 온도 이상으로 쏘면 세포 손상 1

  /* 좌표계: x ∈ [0, 30], y ∈ [-10, 10]. 궤적 y = f(x) − f(x₀) + y₀ (발사대에서 출발)
   * walls/zones: {x, y, w, h} — (x, y) 는 왼쪽 아래 모서리
   * solution: 제작자 검증용 모범 해법(학생에게 보이지 않음)
   */
  const STAGES = [
    {
      id: 1, title: '조준 훈련', concept: '수식으로 궤적 만들기 · 효소는 반응 후에도 그대로 남는다',
      briefing: '아밀레이스를 쏘아 녹말 알갱이 3개를 모두 분해하세요. 궤적은 y = f(x) 수식으로 정합니다. 효소는 반응에 쓰이고 나서도 변하지 않으므로, 한 발로 여러 개를 분해할 수 있습니다.',
      shooter: { x: 1, y: 0 },
      blocks: [
        { sub: 'starch', x: 8, y: 2.1, r: 0.9 },
        { sub: 'starch', x: 15, y: 4.2, r: 0.9 },
        { sub: 'starch', x: 22, y: 6.3, r: 0.9 },
      ],
      walls: [{ x: 11, y: -10, w: 1, h: 11 }],
      zones: [],
      enzymes: ['amylase'], tempControl: false, defaultT: 37, fieldPH: 7,
      shots: 5, par: 1, predict: false, hideDiagram: false,
      solution: [{ enzyme: 'amylase', T: 37, f: '0.3x' }],
      reflection: '효소 한 분자가 녹말 여러 개를 분해할 수 있었던 까닭을 “촉매”라는 말을 써서 설명해 보세요.',
    },
    {
      id: 2, title: '기질 특이성', concept: '효소는 정해진 기질에만 작용한다',
      briefing: '녹말·단백질·지방이 섞여 있습니다. 각 기질에 맞는 효소를 골라 모두 분해하세요. 맞지 않는 기질에 부딪치면 반응 없이 튕겨 나갑니다. (이 구역의 pH는 7입니다.)',
      shooter: { x: 1, y: 0 },
      blocks: [
        { sub: 'starch', x: 9, y: 4, r: 0.9 },
        { sub: 'starch', x: 17, y: 8, r: 0.9 },
        { sub: 'protein', x: 9, y: -4, r: 0.9 },
        { sub: 'protein', x: 17, y: -8, r: 0.9 },
        { sub: 'fat', x: 12, y: 0, r: 0.9 },
        { sub: 'fat', x: 24, y: 0, r: 0.9 },
      ],
      walls: [],
      zones: [],
      enzymes: ['amylase', 'pepsin', 'trypsin', 'lipase'], tempControl: false, defaultT: 37, fieldPH: 7,
      shots: 6, par: 3, predict: false, hideDiagram: false,
      solution: [
        { enzyme: 'amylase', T: 37, f: '0.5x' },
        { enzyme: 'trypsin', T: 37, f: '-0.5x' },
        { enzyme: 'lipase', T: 37, f: '0' },
      ],
      reflection: '펩신을 골랐다면 무슨 일이 있었나요? 같은 단백질 분해 효소인데 트립신과 결과가 달랐던 까닭을 추측해 보세요.',
    },
    {
      id: 3, title: '활성화 에너지', concept: '효소는 에너지를 주는 것이 아니라 활성화 에너지를 낮춘다',
      briefing: '이번에는 반응 온도를 직접 정합니다. 분자 에너지(=온도)가 활성화 에너지 장벽을 넘어야 반응이 일어납니다. 발사 전에 결과를 예측하세요. 50°C 이상으로 쏘면 세포가 손상됩니다.',
      shooter: { x: 1, y: 0 },
      blocks: [
        { sub: 'h2o2', x: 10, y: 0, r: 0.9 },
        { sub: 'h2o2', x: 20, y: 0, r: 0.9 },
      ],
      walls: [],
      zones: [],
      enzymes: ['catalase', 'heat'], tempControl: true, defaultT: 5, fieldPH: 7,
      shots: 5, par: 1, predict: true, hideDiagram: false,
      solution: [{ enzyme: 'catalase', T: 37, f: '0' }],
      reflection: '5°C, 37°C, 80°C에서 카탈레이스를 쏜 결과를 에너지 도표로 비교해 설명하세요. 80°C에서 반응이 일어났다면, 그것은 효소 덕분이었을까요?',
    },
    {
      id: 4, title: '뜨거운 구역', concept: '효소는 단백질 — 높은 온도에서 변성된다',
      briefing: '붉은 구역은 70°C입니다. 효소가 이 구역을 지나면 입체 구조가 망가져(변성) 다시는 작용하지 못합니다. 구역을 피해 가는 궤적을 설계하세요.',
      shooter: { x: 1, y: -6 },
      blocks: [
        { sub: 'starch', x: 17, y: -6, r: 1.0 },
        { sub: 'starch', x: 25, y: -6, r: 1.0 },
      ],
      walls: [],
      zones: [{ type: 'hot', value: 70, x: 7, y: -10, w: 5, h: 12 }],
      enzymes: ['amylase'], tempControl: false, defaultT: 37, fieldPH: 7,
      shots: 5, par: 2, predict: false, hideDiagram: false,
      solution: [
        { enzyme: 'amylase', T: 37, f: '-0.2(x-1)(x-17)' },
        { enzyme: 'amylase', T: 37, f: '-0.09(x-1)(x-25)' },
      ],
      reflection: '뜨거운 구역을 지나간 효소는 그 뒤에 녹말을 만나도 분해하지 못했습니다. 효소의 어떤 성질 때문인지 “입체 구조”와 “활성 부위”를 넣어 설명하세요.',
    },
    {
      id: 5, title: '소화관의 pH', concept: '효소마다 잘 작용하는 pH가 다르다',
      briefing: '왼쪽은 위(pH 2), 오른쪽은 소장(pH 8)입니다. 효소는 자기에게 맞는 pH 구역 안에서만 작용합니다. 어떤 효소로 어느 구역을 공략할지 계획하세요.',
      shooter: { x: 1, y: 0 },
      blocks: [
        { sub: 'protein', x: 6, y: 2, r: 0.9 },
        { sub: 'protein', x: 11, y: 4, r: 0.9 },
        { sub: 'protein', x: 20, y: -3, r: 0.9 },
        { sub: 'protein', x: 26, y: -6, r: 0.9 },
        { sub: 'fat', x: 22, y: 4, r: 0.9 },
      ],
      walls: [],
      zones: [
        { type: 'ph', value: 2, x: 0, y: -10, w: 15, h: 20, label: '위 pH 2' },
        { type: 'ph', value: 8, x: 15, y: -10, w: 15, h: 20, label: '소장 pH 8' },
      ],
      enzymes: ['amylase', 'pepsin', 'trypsin', 'lipase'], tempControl: false, defaultT: 37, fieldPH: 7,
      shots: 6, par: 3, predict: false, hideDiagram: false,
      solution: [
        { enzyme: 'pepsin', T: 37, f: '0.4x' },
        { enzyme: 'trypsin', T: 37, f: '0.102(x-1) - 0.01368(x-1)^2' },
        { enzyme: 'lipase', T: 37, f: '0.00907(x-1)^2' },
      ],
      reflection: '침 속 아밀레이스는 음식과 함께 위로 넘어가면 녹말 분해를 거의 멈춥니다. 이 스테이지의 규칙을 근거로 그 까닭을 설명하세요.',
    },
    {
      id: 6, title: '종합 임무', concept: '기질 특이성 · 활성화 에너지 · 온도 · pH 종합',
      briefing: '지금까지의 규칙이 모두 적용됩니다. 이번에는 발사 전 에너지 도표가 가려집니다. 예측 → 발사 → 결과 확인 순서로 진행하세요. 쏘는 순서도 전략입니다. 급하게 꺾이는 궤적이 필요하면 x^6 이나 exp(x) 같은 함수를 활용해 보세요.',
      shooter: { x: 1, y: -2 },
      blocks: [
        { sub: 'fat', x: 5, y: 1, r: 0.9 },
        { sub: 'starch', x: 9, y: 5, r: 0.9 },
        { sub: 'h2o2', x: 18, y: -5, r: 0.9 },
        { sub: 'h2o2', x: 26, y: -8, r: 0.9 },
        { sub: 'protein', x: 24, y: 6, r: 0.9 },
      ],
      walls: [{ x: 13, y: -3, w: 1, h: 6 }],
      zones: [
        { type: 'hot', value: 70, x: 16, y: 1, w: 4, h: 9 },
        { type: 'ph', value: 8, x: 20, y: -10, w: 10, h: 20, label: '소장 pH 8' },
      ],
      enzymes: ['amylase', 'pepsin', 'trypsin', 'lipase', 'catalase', 'heat'], tempControl: true, defaultT: 37, fieldPH: 7,
      shots: 7, par: 4, predict: true, hideDiagram: true,
      solution: [
        { enzyme: 'lipase', T: 37, f: '0.75x' },
        { enzyme: 'amylase', T: 37, f: '0.875x' },
        { enzyme: 'catalase', T: 37, f: '-0.04147(x-1) - 0.00794(x-1)^2' },
        { enzyme: 'trypsin', T: 37, f: '-0.2(x-1) + 0.0001276exp(0.5(x-1))' },
      ],
      reflection: '오늘 가장 많이 실패한 원인은 무엇이었나요? (기질 불일치 / 변성 / pH / 에너지 부족) 그 원인을 에너지 도표의 “장벽 높이”로 다시 설명해 보세요.',
    },
  ];


  /* ================= 2부: 물질대사 — TCA 회로 (생명과학 심화) =================
   * 메커니즘 반전: 발사체 = 기질 분자, 효소 = 필드에 고정된 관문(gate).
   * 분자가 맞는 관문을 지나면 다음 중간 산물로 바뀌고 부산물이 나온다.
   * 맞지 않는 관문(또는 억제된 관문)에 닿으면 반응 없이 튕겨 나간다(1부 스테이지 2와 같은 규칙).
   */
  const MOLECULES = {
    pyruvate:  { name: '피루브산',            C: 3, color: '#f4a261' },
    acetylcoa: { name: '아세틸 CoA',          C: 2, color: '#e9c46a' },
    citrate:   { name: '시트르산',            C: 6, color: '#2a9d8f' },
    isocitrate:{ name: '아이소시트르산',      C: 6, color: '#43aa8b' },
    akg:       { name: 'α-케토글루타르산',    C: 5, color: '#4d908e' },
    succoa:    { name: '석시닐 CoA',          C: 4, color: '#577590' },
    succinate: { name: '석신산',              C: 4, color: '#277da1' },
    fumarate:  { name: '푸마르산',            C: 4, color: '#9b5de5' },
    malate:    { name: '말산',                C: 4, color: '#f15bb5' },
    oaa:       { name: '옥살아세트산',        C: 4, color: '#e76f51' },
  };
  // out: 생성(+) / 소비(-). h2o 는 소비를 음수로 적는다. 회로 한 바퀴 합: CO2 2, NADH 3, FADH2 1, ATP(GTP) 1, H2O -2
  const GATES = {
    pdh:   { name: '피루브산 탈수소 효소 복합체', short: ['피루브산', '탈수소'], from: 'pyruvate',  to: 'acetylcoa', out: { co2: 1, nadh: 1 }, note: 'CoA가 결합하고 CO₂가 빠져나간다(탈탄산). 미토콘드리아 기질에서 일어난다.' },
    cs:    { name: '시트르산 합성 효소',          short: ['시트르산', '합성'],   from: 'acetylcoa', to: 'citrate',   out: { h2o: -1 }, note: '아세틸 CoA(2C) + 옥살아세트산(4C) → 시트르산(6C). 물이 들어가고 CoA가 떨어져 나간다.' },
    aco:   { name: '아코니테이스',                short: ['아코니', '테이스'],   from: 'citrate',   to: 'isocitrate', out: {}, note: '시트르산의 구조를 바꾼다(이성질화). 물이 빠졌다가 다시 들어가 알짜 변화는 없다.' },
    idh:   { name: '아이소시트르산 탈수소 효소',  short: ['아이소시트르산', '탈수소'], from: 'isocitrate', to: 'akg', out: { co2: 1, nadh: 1 }, note: '산화(NAD⁺ → NADH)와 탈탄산(CO₂ 방출)이 함께 일어난다. 6C → 5C.' },
    akgdh: { name: 'α-케토글루타르산 탈수소 효소 복합체', short: ['α-KG', '탈수소'], from: 'akg', to: 'succoa', out: { co2: 1, nadh: 1 }, note: '두 번째 탈탄산. 5C → 4C. 피루브산 탈수소 효소 복합체와 구조가 닮았다.' },
    scs:   { name: '석시닐 CoA 합성 효소',        short: ['석시닐CoA', '합성'],  from: 'succoa',    to: 'succinate', out: { atp: 1 }, note: '기질 수준 인산화: GTP(조직에 따라 ATP)가 만들어진다.' },
    sdh:   { name: '석신산 탈수소 효소',          short: ['석신산', '탈수소'],   from: 'succinate', to: 'fumarate',  out: { fadh2: 1 }, note: 'FAD → FADH₂. 미토콘드리아 내막에 박혀 있는 유일한 TCA 회로 효소다.' },
    fum:   { name: '푸마레이스',                  short: ['푸마', '레이스'],     from: 'fumarate',  to: 'malate',    out: { h2o: -1 }, note: '푸마르산에 물이 더해진다(수화).' },
    mdh:   { name: '말산 탈수소 효소',            short: ['말산', '탈수소'],     from: 'malate',    to: 'oaa',       out: { nadh: 1 }, note: 'NADH가 만들어지고 옥살아세트산이 재생되어 회로가 다시 돈다.' },
  };
  const TCA_ORDER = ['acetylcoa', 'citrate', 'isocitrate', 'akg', 'succoa', 'succinate', 'fumarate', 'malate', 'oaa'];

  const g = (enz, x, y, extra) => Object.assign({ enz, x, y, r: 0.9 }, extra || {});
  STAGES.push(
    {
      id: 7, chapter: 2, type: 'pathway', title: '피루브산 산화', concept: '물질대사는 효소 반응이 차례로 이어진 경로다',
      briefing: '이번에는 효소가 아니라 분자를 쏩니다. 효소는 필드에 고정된 관문입니다. 피루브산이 알맞은 관문을 차례로 지나 시트르산이 되게 하세요. 맞지 않는 관문에 닿으면 튕겨 나갑니다.',
      shooter: { x: 1, y: -4 }, start: 'pyruvate', target: 'citrate',
      gates: [g('pdh', 8, -1), g('cs', 8, -6), g('aco', 8, 4), g('cs', 16, 2), g('idh', 16, -4), g('pdh', 16, 7)],
      walls: [], shots: 5, par: 1, predictLedger: false,
      solution: [{ f: '0.43x' }],
      reflection: '피루브산(3C)이 아세틸 CoA(2C)가 될 때 탄소 1개는 어디로 갔나요? 생성물 장부를 근거로 쓰세요.',
    },
    {
      id: 8, chapter: 2, type: 'pathway', title: 'TCA 회로 전반부', concept: '탈탄산과 산화: CO₂와 NADH가 나온다',
      briefing: '아세틸 CoA를 쏘아 석시닐 CoA까지 가게 하세요. 각 세로줄에는 효소 관문이 여러 개 있습니다. 다음 단계에 맞는 효소를 골라 지나가야 합니다. 효소 이름은 대개 “기질 이름 + 하는 일”로 지어집니다.',
      shooter: { x: 1, y: 0 }, start: 'acetylcoa', target: 'succoa',
      gates: [
        g('cs', 6, 4.8), g('aco', 6, 0), g('idh', 6, -5),
        g('aco', 12, 7.2), g('idh', 12, 2.5), g('cs', 12, -4),
        g('idh', 18, 6), g('akgdh', 18, 1), g('aco', 18, -5),
        g('akgdh', 24, 1.2), g('idh', 24, 6), g('sdh', 24, -4),
      ],
      walls: [], shots: 6, par: 1, predictLedger: false,
      solution: [{ f: '-0.05(x-1)(x-25)' }],
      reflection: '시트르산(6C)에서 석시닐 CoA(4C)가 되는 동안 줄어든 탄소 2개와 늘어난 NADH 2개는 각각 어떤 반응 때문인가요?',
    },
    {
      id: 9, chapter: 2, type: 'pathway', title: 'TCA 회로 후반부 · 경쟁적 억제', concept: '에너지 저장 분자 생성과 효소 억제',
      briefing: '석시닐 CoA를 쏘아 옥살아세트산까지 가게 하세요. 주의: 가운데 줄의 석신산 탈수소 효소 하나에는 말론산이 붙어 있습니다. 말론산은 석신산과 모양이 닮아 활성 부위를 차지하는 경쟁적 저해제입니다. 억제되지 않은 관문을 찾으세요.',
      shooter: { x: 1, y: 2 }, start: 'succoa', target: 'oaa',
      gates: [
        g('scs', 6, -1.6), g('sdh', 6, 4), g('fum', 6, -6.5),
        g('sdh', 12, 1.2, { inhibitor: 'malonate' }), g('sdh', 12, -3.7), g('scs', 12, -8),
        g('fum', 18, -3.2), g('mdh', 18, 1.5), g('sdh', 18, -8),
        g('mdh', 24, -0.2), g('fum', 24, -5), g('scs', 24, 5),
      ],
      walls: [], shots: 6, par: 2, predictLedger: false,
      solution: [{ f: '-0.9(x-1) + 0.035(x-1)^2' }],
      reflection: '말론산이 붙은 관문에서는 왜 반응이 일어나지 않았나요? “활성 부위”, “구조가 비슷하다”를 넣어 설명하고, 이 억제가 세포의 ATP 생산에 어떤 영향을 줄지 추론하세요.',
    },
    {
      id: 10, chapter: 2, type: 'pathway', title: 'TCA 회로 한 바퀴', concept: '회로 한 바퀴의 물질·에너지 수지',
      briefing: '아세틸 CoA를 쏘아 회로를 한 바퀴 돌려 옥살아세트산을 되찾으세요. 발사 전에 이번 한 바퀴에서 나올 CO₂·NADH·FADH₂·ATP(GTP)와 들어갈 물의 수를 먼저 예측합니다. 정답 관문들은 매끄러운 곡선 위에 있습니다. 어떤 함수가 어울릴까요?',
      shooter: { x: 1, y: 0 }, start: 'acetylcoa', target: 'oaa',
      gates: [
        g('cs', 4, 3.95), g('aco', 4, -2),
        g('aco', 7, 6.52), g('idh', 7, 1.5), g('cs', 7, -4),
        g('idh', 10, 6.82), g('akgdh', 10, 2), g('scs', 10, -4),
        g('akgdh', 13, 4.74), g('aco', 13, -0.5),
        g('scs', 16, 0.99), g('sdh', 16, 6), g('fum', 16, -4),
        g('sdh', 19, -3.08), g('fum', 19, 2), g('mdh', 19, -8.5),
        g('fum', 22, -6.1), g('mdh', 22, -1), g('scs', 22, 4),
        g('mdh', 25, -6.97), g('fum', 25, -2), g('sdh', 25, 4),
      ],
      walls: [], shots: 6, par: 1, predictLedger: true,
      solution: [{ f: '7sin((x-1)/5)' }],
      reflection: '회로 한 바퀴에서 CO₂ 2개가 나갔습니다. 들어온 아세틸 CoA의 탄소 수와 비교해 “탄소가 보존된다”는 관점에서 설명하세요. 또 NADH와 FADH₂는 이후 어디에서 쓰이나요?',
    },
  );

  STAGES.forEach(st => {
    if (!st.chapter) st.chapter = 1;
    if (st.type === 'pathway') Object.assign(st, { blocks: [], zones: [], enzymes: [], tempControl: false, predict: false, defaultT: 37, fieldPH: 7.8 });
  });

  root.GameData = { SUBSTRATES, ENZYMES, STAGES, DAMAGE_T, MOLECULES, GATES, TCA_ORDER };
  if (typeof module !== 'undefined') module.exports = root.GameData;
})(typeof window !== 'undefined' ? window : globalThis);
