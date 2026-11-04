# 도서 조회 중계 서버 (Cloudflare Worker, 카카오 책 검색)

카카오 REST API 키를 앱(브라우저)에 넣으면 누구나 볼 수 있으므로, 이 작은 함수가 키를 대신 갖고 조회한다.
코드: `book-proxy.js` (의존성 없음, Cloudflare 대시보드에 붙여넣기만 하면 됨)
알라딘 OpenAPI는 2026-10-30에 종료되어 카카오(Daum) 책 검색으로 교체했다.

## 1. 카카오 REST API 키 발급
1. https://developers.kakao.com 로그인(카카오 계정) → **내 애플리케이션** → **애플리케이션 추가하기**(앱 이름 예: 내 독서 기록)
2. 만든 앱 → **앱 키**에서 **REST API 키** 복사. 이 키는 Cloudflare에만 넣고 코드·채팅에 올리지 않는다.
3. (화면에 Daum 검색 사용 설정/활성화 항목이 있으면 켜기)

## 2. Worker 코드 교체
1. https://dash.cloudflare.com → **Workers & Pages** → 기존 `bookshelf-aladin` Worker 열기 (주소를 그대로 쓰기 위해 새로 만들지 않음)
2. **Edit code** → 기존 코드를 지우고 `book-proxy.js` 내용 전체 붙여넣기 → **Deploy**
3. **Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `KAKAO_REST_KEY`, Value: REST API 키 → 저장(Deploy)
   - 기존 `ALADIN_TTB_KEY`는 삭제해도 됨

## 3. 동작 확인
브라우저에서 `https://bookshelf-aladin.ryudughwan.workers.dev/?isbn=9788936434120` 열기
- 정상: `{"title":"소년이 온다","author":"한강", ...}`
- `{"error":"no_key"}`: Secret 이름 확인 / `{"error":"kakao_401", ...}`: 키가 틀림 / `kakao_403`: 앱 설정에서 검색 API 사용 권한 확인

## 참고
- 허용 사이트: 기본값 `https://ryudughwan-hub.github.io`, `http://localhost:8000`. 바꾸려면 변수 `ALLOWED_ORIGINS`(쉼표 구분) 추가.
- 같은 ISBN은 Cloudflare 캐시에서 하루 동안 응답.
- 표지는 카카오 썸네일(작은 크기).
