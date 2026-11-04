# 알라딘 조회 중계 서버 (Cloudflare Worker)

알라딘 TTB API 키를 앱(브라우저)에 넣으면 누구나 볼 수 있으므로, 이 작은 함수가 키를 대신 갖고 조회한다.
코드: `aladin-proxy.js` (의존성 없음, Cloudflare 대시보드에 붙여넣기만 하면 됨)

## 1. 알라딘 TTB 키 발급
1. aladin.co.kr 로그인 → https://www.aladin.co.kr/ttb/wblog_manage.aspx (TTB 관리)
2. 키 신청. 블로그/사이트 주소에 `https://ryudughwan-hub.github.io/bookshelf-app/` 입력
3. 발급된 키(`ttb`로 시작) 확인. 이 키는 Cloudflare에만 넣고 코드·채팅에 올리지 않는다.

## 2. Worker 만들기
1. https://dash.cloudflare.com 가입/로그인 → **Workers & Pages** → **Create** → Worker 생성(Hello World로 시작)
2. 이름: `bookshelf-aladin` → **Deploy**
3. **Edit code** → 기존 코드를 지우고 `aladin-proxy.js` 내용 전체 붙여넣기 → **Deploy**
4. Worker의 **Settings → Variables and Secrets → Add**
   - Type: **Secret**, Name: `ALADIN_TTB_KEY`, Value: 발급받은 키 → 저장(Deploy)
5. 주소 확인: `https://bookshelf-aladin.<내 서브도메인>.workers.dev`

## 3. 동작 확인
브라우저에서 `https://bookshelf-aladin.<서브도메인>.workers.dev/?isbn=9788936434120` 열기
- 정상: `{"title":"소년이 온다", "author":"한강", ...}`
- `{"error":"no_key"}`: 4번(Secret) 확인 / `{"error":"aladin_..."}`: 키가 잘못됐거나 한도 초과

## 4. 앱에 연결
`app.js`의 `var ALADIN_PROXY = "";`에 Worker 주소를 넣고 push. (주소는 비밀이 아님)

## 참고
- 허용 사이트: 기본값 `https://ryudughwan-hub.github.io`, `http://localhost:8000`. 바꾸려면 변수 `ALLOWED_ORIGINS`(쉼표 구분) 추가.
  다른 사이트의 브라우저 요청은 403으로 거절하지만, 서버에서 직접 호출하는 것까지 막지는 못함(그 경우 알라딘 하루 한도만 소모).
- 같은 ISBN은 Cloudflare 캐시에서 하루 동안 응답.
- 알라딘 약관상 앱 하단에 "도서 DB 제공: 알라딘 인터넷서점" 표기(index.html에 있음).
- 무료 플랜: Worker 하루 10만 요청.
