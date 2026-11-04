# 내 독서 기록 (bookshelf-app)

읽은 책을 기록하는 개인용 웹 앱(PWA). 바코드(ISBN)를 카메라로 스캔해 도서정보를 자동으로 채운다. UI·문구는 한국어.

## 현재 상태
- 빌드 도구·프레임워크 없는 정적 사이트. `index.html`, `app.js`, `sync.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`(+ PNG `icon-180/192/512.png`, SVG에서 렌더), `vendor/zxing.min.js`(@zxing/library 0.21.3 UMD).
- 기능: 책 추가/수정/삭제, 별점(1~5), 한줄 감상, 요약·좋은 구절(긴 글, A4 1장 이상 가정), 다 읽은 날, 검색(제목·저자·메모 전체), 정렬(최근/별점/제목), 통계(총 권수·올해·평균 별점), JSON 백업 내보내기/불러오기(불러올 때 항목을 데이터 모델에 맞게 정리, 형식 불량·중복은 건너뜀), 중복 ISBN 경고.
- 저장: `localStorage` 키 `bookshelf.books.v1`. 선택적으로 Supabase 동기화(`sync.js`, 설정 절차 `supabase/README.md`, 테이블 `supabase/schema.sql`).
  - `app.js` 상단 `SUPABASE_URL`/`SUPABASE_KEY`(공개 키). 비어 있으면 동기화 UI 숨김.
  - 라이브러리 없이 Auth(`/auth/v1`)·PostgREST(`/rest/v1/books`) 직접 호출. 이메일+비밀번호 로그인(매직 링크는 iOS 홈 화면 앱이 아닌 사파리로 열려 부적합).
  - 병합: 책 단위 `updated`(ms) 큰 쪽 승. 삭제는 로컬 `bookshelf.deleted.v1`(삭제 기록) → 서버 `deleted=true` 행. 매 동기화마다 전체를 받아 비교(1000행씩 페이지).
  - 기타 localStorage 키: `bookshelf.auth.v1`(세션), `bookshelf.lastsync.v1`.
- 긴 글 편집: PC(폭 800px 이상)에서 편집 창 860px, 입력칸 자동 높이, 저장 버튼 줄 고정, Ctrl/⌘+Enter 저장. 입력 0.7초 뒤 `bookshelf.draft.v1`에 임시 저장 → 저장 안 하고 닫아도 다음에 열 때 이어 쓰기 확인(스캔으로 연 새 책 창은 제외). 목록에서는 `<details>`로 접어서 표시, 구절은 빈 줄로 구분.
  - 용량 주의: localStorage는 기기당 약 5MB. 책마다 A4 1~2장이면 수백 권까지는 여유, 1000권 이상이면 IndexedDB 이전 검토.
- 스캔: `BarcodeDetector`가 있으면 사용, 없으면 ZXing으로 폴백. 978/979로 시작하는 유효 ISBN만 인식.
- 도서 조회: 카카오 책 검색(Cloudflare Worker 중계, `worker/book-proxy.js`) → Google Books(`isbn:` 검색) → Open Library 순서. 실패 시 소스별 이유를 미리보기에 표시.
  - `app.js` 상단 설정: `BOOK_PROXY`(Worker 주소, 비면 건너뜀), `GOOGLE_BOOKS_KEY`(선택).
  - 키 없는 Google Books는 전 세계 공용 일일 한도라 자주 429. 실제로 이 때문에 폰에서 조회가 전부 실패했음(2026-11-04).
  - 카카오 REST API 키는 Worker의 Secret `KAKAO_REST_KEY`에만 둔다. 설치 절차: `worker/README.md`.
  - 알라딘 OpenAPI는 2026-10-30 종료(신규 발급은 9월 중단). 네이버 책 검색 API도 2026년 중 종료됐다는 보고가 있어 제외. 대안 후보: 국립중앙도서관 ISBN 서지정보(seoji) API(키 승인 필요).
- 서비스 워커: 같은 출처 GET 요청만 network-first로 캐시(성공 응답만 저장). 외부 API·표지 이미지는 캐시하지 않음. 캐시 파일 목록이 바뀌면 `CACHE` 버전(현재 `bookshelf-v4`)을 올릴 것.
- 아이콘: iOS용 `apple-touch-icon`(180px PNG), 매니페스트에 192/512 PNG(any, maskable) + SVG. 아이콘 그림은 maskable 안전 영역(중앙 지름 80%) 안에 들어가게 축소함. `icon.svg`를 바꾸면 PNG도 다시 만들 것.

## 검증 상태 (중요)
- 확인함: JS 문법, 책 추가, 별점·평균 계산, 잘못된 ISBN 거부, ZXing 로드, 콘솔 에러 없음, 백업 불러오기 검증(잘못된 항목 거부·정리), 수정 화면 표지 미리보기, 서비스 워커가 404를 캐시하지 않음, 매니페스트 아이콘 (Playwright, 로컬 서버).
- 확인 못 함: 실제 iOS/안드로이드 홈 화면 아이콘 표시.
- 동기화: 가짜 Supabase 서버(Auth+REST 일부 흉내)로 두 기기 시나리오 확인 — 가입 시 기존 기록 업로드, 다른 기기 로그인 시 내려받기, 추가·삭제 전파, 수정 충돌(나중 수정 승), 토큰 만료 시 자동 갱신, 오프라인 후 재연결 업로드, 로그아웃 시 로컬 유지, 미설정 시 UI 숨김. 실제 Supabase로는 아직 확인 못 함. (Playwright 테스트 시 서비스 워커를 막아야 함: `serviceWorkers: "block"`)
- 카카오 Worker 로직·앱 연동은 가짜 응답으로만 확인. 실제 카카오 API 응답은 확인 못 함(개발 환경에서 외부 접속 불가).
- 실기기(폰) 확인함(2026-11-04, 사용자 보고): 바코드 스캔 → 카카오 조회 → 저장까지 정상.

## 배포
- GitHub Pages: https://ryudughwan-hub.github.io/bookshelf-app/ (저장소 `ryudughwan-hub/bookshelf-app`, `main` 브랜치 루트). push하면 1~2분 뒤 반영.
- 도서 조회 Worker: `https://bookshelf-aladin.ryudughwan.workers.dev`(이름은 알라딘 시절 그대로) — Cloudflare 대시보드에서 수동 배포(`worker/book-proxy.js` 붙여넣기). 코드 수정 시 대시보드에 다시 붙여넣어야 함. 개발 환경에서는 workers.dev 접속 불가.

## 실행
```
python3 -m http.server 8000   # http://localhost:8000
```
카메라는 https 또는 localhost에서만 동작. 폰 테스트는 배포(GitHub Pages / Netlify 등) 후 https 주소로.

## 데이터 모델
```
{ id, title, author, isbn, cover, date(YYYY-MM-DD), rating(0~5), note(한줄 감상), summary(요약), quotes(좋은 구절, 빈 줄로 구분), added(ms), updated(ms, 마지막 수정) }
```

## 다음 할 일 (우선순위 순)
1. 홈 화면 추가(PWA)·아이콘 표시 확인(아직 보고 없음).
2. 사용자가 Supabase 프로젝트 생성(`supabase/README.md`) → `SUPABASE_URL`/`SUPABASE_KEY` 설정 → 실제 동기화 확인 → 새 가입 막기.
3. 선택: "읽고 싶은 책 / 읽는 중" 상태, 책장 시각화.

## 결정 사항·주의
- 사용자는 PC에서 코드 작업·배포를 하고, 기록과 스캔은 폰에서 할 계획.
- 의존성을 늘리지 않는 단순한 구조를 유지(번들러 없음). 필요하면 사용자와 상의 후 도입.
- 표지 이미지는 외부 URL을 그대로 저장함(`referrerpolicy="no-referrer"`). 오프라인 표시가 필요하면 별도 처리 필요.
- 별도로 Claude 앱에 게시한 단순 버전("내 독서 기록" 페이지)이 있으나 바코드 기능이 없는 초기 버전이며, 이 프로젝트가 본 버전이다.
