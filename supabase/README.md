# 기기 간 동기화 설정 (Supabase)

같은 계정으로 로그인한 기기끼리 책 기록을 자동으로 맞춘다. 코드: `sync.js` (라이브러리 없이 Supabase REST API 호출)

## 1. 프로젝트 만들기
1. https://supabase.com 가입 → **New project**
2. 이름 예: `bookshelf`, 데이터베이스 비밀번호는 아무거나(앱에서는 안 씀), Region: **Northeast Asia (Seoul)**
3. 만들어질 때까지 1~2분 대기

## 2. 테이블 만들기
**SQL Editor** → New query → `schema.sql` 내용 전체 붙여넣기 → **Run** ("Success" 확인)

## 3. 로그인 설정
**Authentication → Sign In / Providers → Email**
- **Confirm email**: 끄기 (켜 두면 가입 확인 메일을 눌러야 하고, 무료 플랜 메일은 시간당 몇 통으로 제한됨)

## 4. 주소와 공개 키 복사
**Project Settings → API Keys**(또는 Data API)
- Project URL: `https://xxxx.supabase.co`
- 공개 키: **Publishable key**(`sb_publishable_...`) 또는 예전 방식 **anon** 키
- **secret / service_role 키는 절대 쓰지 말 것** (모든 데이터에 접근 가능한 관리자 키)

`app.js`의 `SUPABASE_URL`, `SUPABASE_KEY`에 넣고 push. 공개 키는 원래 노출돼도 되는 키이며, 데이터는 2번의 행 단위 보안으로 본인 것만 접근 가능.

## 5. 가입 후 새 가입 막기 (권장)
앱에서 **로그인 → 처음이에요(가입)** 으로 내 계정을 만든 뒤,
**Authentication → Sign In / Providers → Allow new users to sign up** 끄기.
앱 주소를 아는 다른 사람이 내 Supabase에 계정을 만드는 것을 막는다.

## 참고
- 무료 플랜은 7일 동안 접속이 없으면 프로젝트가 일시 정지됨. 데이터는 남아 있고, 대시보드에서 **Restore**로 재개. 정지 중에는 앱이 "동기화 실패"를 표시하지만 기기 안의 기록은 그대로 쓸 수 있음.
- 병합 규칙: 책 한 권 단위로 마지막에 수정한 쪽이 이김. 두 기기에서 같은 책을 동시에 고치면 나중 것만 남음.
- 동기화 시점: 저장·삭제 1.5초 뒤, 앱을 열 때, 앱으로 돌아올 때(30초 간격), 인터넷이 다시 연결될 때, "지금 동기화" 버튼.
