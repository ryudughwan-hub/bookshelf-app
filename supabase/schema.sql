-- 내 독서 기록: 동기화용 테이블. Supabase 대시보드 → SQL Editor에 붙여넣고 Run.
create table if not exists public.books (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated bigint not null default 0,     -- 마지막 수정 시각(ms). 더 큰 쪽이 이김
  deleted boolean not null default false, -- 삭제 기록(다른 기기에 삭제를 전파)
  primary key (user_id, id)
);

-- 행 단위 보안: 로그인한 본인 행만 읽고 쓸 수 있음
alter table public.books enable row level security;
drop policy if exists "own books" on public.books;
create policy "own books" on public.books
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
