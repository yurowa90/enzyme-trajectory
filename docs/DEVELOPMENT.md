# 개발 안내

사용자용 안내는 [README](../README.md), 수업용 안내는 [교사용 안내](teacher-guide.md)에 있습니다. 이 문서는 코드를 고치는 사람을 위한 내용입니다.

## 파일 구조

```
index.html              화면
css/style.css           스타일(라이트/다크)
js/data.js              기질·효소·스테이지 데이터(스테이지 추가는 여기서)
js/parser.js            eval 없는 안전한 수식 파서
js/engine.js            판정 엔진(순수 함수, 브라우저·Node 공용)
js/game.js              화면 제어·애니메이션·기록
tests/verify-stages.js  모든 스테이지가 목표 발사 수 안에 풀리는지 자동 검증
tests/e2e.js            브라우저에서 전 스테이지 실제 플레이 검증(Playwright)
docs/teacher-guide.md   교사용 안내: 학습 설계 근거·수업안·단순화 목록·참고문헌
```

## 스테이지 추가·수정

`js/data.js`의 `STAGES` 배열에 객체를 추가합니다. 좌표계는 x 0~30, y −10~10입니다. 각 스테이지에는 모범 해법 `solution`을 반드시 넣고 아래 명령으로 검증합니다. `solution`은 학생 화면에 보이지 않습니다.

```bash
node tests/verify-stages.js
```

브라우저 E2E는 Playwright가 필요합니다. 스크린샷을 저장할 폴더를 인수로 줍니다. Playwright 모듈 위치는 환경 변수 `PW`로 지정할 수 있습니다.

```bash
node tests/e2e.js <스크린샷 폴더>
```

## 배포(GitHub Pages)

`.github/workflows/deploy-pages.yml`이 포함되어 있습니다. `main` 또는 `claude/ecstatic-euler-9j8len` 브랜치에 푸시하거나 수동 실행하면, 먼저 `node tests/verify-stages.js`를 돌리고 통과하면 저장소 루트를 GitHub Pages로 배포합니다. 처음 한 번은 저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 설정해야 할 수 있습니다.
