/* 안전한 수식 파서 — eval 없이 y = f(x) 를 해석한다.
 * 지원: 숫자, x, + - * / ^, 괄호, 단항 -, 암묵적 곱(2x, 3(x+1), x sin(x))
 * 함수: sin cos tan abs sqrt exp ln log   상수: pi e
 */
(function (root) {
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, abs: Math.abs,
    sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log: Math.log10,
  };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function tokenize(src) {
    const s = src.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').toLowerCase();
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        const num = s.slice(i, j);
        if ((num.match(/\./g) || []).length > 1) throw new Error(`숫자 형식이 잘못되었습니다: ${num}`);
        out.push({ t: 'num', v: parseFloat(num) });
        i = j;
      } else if (/[a-z]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-z]/.test(s[j])) j++;
        let word = s.slice(i, j);
        // "xsin" 같이 붙여 쓴 경우를 x · sin 으로 쪼갠다
        while (word.length) {
          const m = Object.keys(FUNCS).concat(Object.keys(CONSTS), ['x'])
            .sort((a, b) => b.length - a.length)
            .find(k => word.startsWith(k));
          if (!m) throw new Error(`알 수 없는 이름: "${word}" (쓸 수 있는 것: x, sin, cos, tan, abs, sqrt, exp, ln, log, pi, e)`);
          if (FUNCS[m]) out.push({ t: 'fn', v: m });
          else if (m === 'x') out.push({ t: 'x' });
          else out.push({ t: 'num', v: CONSTS[m] });
          word = word.slice(m.length);
        }
        i = j;
      } else if ('+-*/^()'.includes(c)) {
        out.push({ t: c });
        i++;
      } else {
        throw new Error(`쓸 수 없는 기호: "${c}"`);
      }
    }
    // 암묵적 곱 삽입: [num x )] 뒤에 [num x fn (] 가 오면 *
    const res = [];
    for (let k = 0; k < out.length; k++) {
      const a = out[k - 1], b = out[k];
      if (a && ['num', 'x', ')'].includes(a.t) && ['num', 'x', 'fn', '('].includes(b.t)) res.push({ t: '*' });
      res.push(b);
    }
    return res;
  }

  // 재귀 하강 파서 → 클로저 트리
  function parse(src) {
    if (!src || !src.trim()) throw new Error('수식을 입력하세요.');
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = t => {
      if (!toks[p] || toks[p].t !== t) throw new Error(`"${t}" 가 필요합니다.`);
      return toks[p++];
    };
    function expr() {
      let l = term();
      while (peek() && (peek().t === '+' || peek().t === '-')) {
        const op = toks[p++].t, r = term(), L = l;
        l = op === '+' ? x => L(x) + r(x) : x => L(x) - r(x);
      }
      return l;
    }
    function term() {
      let l = unary();
      while (peek() && (peek().t === '*' || peek().t === '/')) {
        const op = toks[p++].t, r = unary(), L = l;
        l = op === '*' ? x => L(x) * r(x) : x => L(x) / r(x);
      }
      return l;
    }
    function unary() {
      if (peek() && peek().t === '-') { p++; const u = unary(); return x => -u(x); }
      if (peek() && peek().t === '+') { p++; return unary(); }
      return power();
    }
    function power() {
      const b = atom();
      if (peek() && peek().t === '^') { p++; const e = unary(); return x => Math.pow(b(x), e(x)); }
      return b;
    }
    function atom() {
      const t = peek();
      if (!t) throw new Error('수식이 중간에 끝났습니다.');
      if (t.t === 'num') { p++; const v = t.v; return () => v; }
      if (t.t === 'x') { p++; return x => x; }
      if (t.t === 'fn') {
        p++;
        const f = FUNCS[t.v];
        if (peek() && peek().t === '(') { eat('('); const a = expr(); eat(')'); return x => f(a(x)); }
        const a = power(); // sin x 처럼 괄호 없이
        return x => f(a(x));
      }
      if (t.t === '(') { p++; const a = expr(); eat(')'); return a; }
      throw new Error(`"${t.t}" 가 올 자리가 아닙니다.`);
    }
    const f = expr();
    if (p < toks.length) throw new Error(`"${toks[p].t === 'num' ? toks[p].v : toks[p].t}" 부근을 해석할 수 없습니다.`);
    return f;
  }

  root.MathParser = { parse };
  if (typeof module !== 'undefined') module.exports = root.MathParser;
})(typeof window !== 'undefined' ? window : globalThis);
