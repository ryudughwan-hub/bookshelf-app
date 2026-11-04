# 내 독서 기록 (bookshelf-app)

읽은 책을 기록하는 개인용 웹 앱(PWA). 바코드(ISBN)를 카메라로 스캔해 도서정보를 자동으로 채운다. UI·문구는 한국어.

## 현재 상태
- 빌드 도구·프레임워크 없는 정적 사이트. `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`(+ PNG `icon-180/192/512.png`, SVG에서 렌더), `vendor/zxing.min.js`(@zxing/library 0.21.3 UMD).
- 기능: 책 추가/수정/삭제, 별점(1~5), 한줄 감상, 다 읽은 날, 검색, 정렬(최근/별점/제목), 통계(총 권수·올해·평균 별점), JSON 백업 내보내기/불러오기(불러올 때 항목을 데이터 모델에 맞게 정리, 형식 불량·중복은 건너뜀), 중복 ISBN 경고.
- 저장: `localStorage` 키 `bookshelf.books.v1` (기기별 저장, 동기화 없음).
- 스캔: `BarcodeDetector`가 있으면 사용, 없으면 ZXing으로 폴백. 978/979로 시작하는 유효 ISBN만 인식.
- 도서 조회: Google Books(`isbn:` 검색) → 실패 시 Open Library 순서. 둘 다 키 불필요.
- 서비스 워커: 같은 출처 GET 요청만 network-first로 캐시(성공 응답만 저장). 외부 API·표지 이미지는 캐시하지 않음. 캐시 파일 목록이 바뀌면 `CACHE` 버전(현재 `bookshelf-v2`)을 올릴 것.
- 아이콘: iOS용 `apple-touch-icon`(180px PNG), 매니페스트에 192/512 PNG(any, maskable) + SVG. 아이콘 그림은 maskable 안전 영역(중앙 지름 80%) 안에 들어가게 축소함. `icon.svg`를 바꾸면 PNG도 다시 만들 것.

## 검증 상태 (중요)
- 확인함: JS 문법, 책 추가, 별점·평균 계산, 잘못된 ISBN 거부, ZXing 로드, 콘솔 에러 없음, 백업 불러오기 검증(잘못된 항목 거부·정리), 수정 화면 표지 미리보기, 서비스 워커가 404를 캐시하지 않음, 매니페스트 아이콘 (Playwright, 로컬 서버).
- 확인 못 함: 실제 iOS/안드로이드 홈 화면 아이콘 표시.
- **확인 못 함**: 실제 카메라 스캔, Google Books/Open Library 실제 조회 (개발 환경에서 외부 접속·카메라 불가). 첫 작업은 실기기(폰)에서 이 둘을 검증하는 것.

## 실행
```
python3 -m http.server 8000   # http://localhost:8000
```
카메라는 https 또는 localhost에서만 동작. 폰 테스트는 배포(GitHub Pages / Netlify 등) 후 https 주소로.

## 데이터 모델
```
{ id, title, author, isbn, cover, date(YYYY-MM-DD), rating(0~5), note, added(ms) }
```

## 다음 할 일 (우선순위 순)
1. 호스팅에 배포(https) → 폰에서 카메라 스캔·도서 조회 실기기 검증. 홈 화면 추가(PWA) 확인.
2. 한국 도서 정보 정확도 개선: 알라딘 또는 네이버 도서 검색 API 추가. 키가 필요하므로 클라이언트에 노출되지 않게 프록시(서버리스 함수)를 둘 것. 기존 Google Books → Open Library는 폴백으로 유지.
3. 기기 간 동기화가 필요하면 백엔드(예: Supabase/Firebase) 검토. 지금은 JSON 백업으로 옮김.
4. 선택: "읽고 싶은 책 / 읽는 중" 상태, 독서 메모·인상 깊은 구절, 책장 시각화.

## 결정 사항·주의
- 사용자는 PC에서 코드 작업·배포를 하고, 기록과 스캔은 폰에서 할 계획.
- 의존성을 늘리지 않는 단순한 구조를 유지(번들러 없음). 필요하면 사용자와 상의 후 도입.
- 표지 이미지는 외부 URL을 그대로 저장함(`referrerpolicy="no-referrer"`). 오프라인 표시가 필요하면 별도 처리 필요.
- 별도로 Claude 앱에 게시한 단순 버전("내 독서 기록" 페이지)이 있으나 바코드 기능이 없는 초기 버전이며, 이 프로젝트가 본 버전이다.
