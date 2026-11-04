// 기기 간 동기화 (Supabase). 라이브러리 없이 Supabase Auth/REST API를 fetch로 호출한다.
// - 로그인: 이메일 + 비밀번호
// - 테이블: public.books (user_id, id, data jsonb, updated bigint, deleted bool) — 설치는 supabase/README.md
// - 병합: 책 한 권 단위로 updated(수정 시각, ms)가 더 큰 쪽이 이김. 삭제는 deleted=true 행으로 전파.
window.BookSync = function (cfg) {
  "use strict";
  // cfg: { url, key, getBooks(), setBooks(arr), onStatus() }
  var AUTH = "bookshelf.auth.v1", TOMB = "bookshelf.deleted.v1", LAST = "bookshelf.lastsync.v1";
  var base = String(cfg.url || "").replace(/\/$/, ""), key = cfg.key || "";
  var enabled = !!(base && key);
  var session = read(AUTH), timer = null, running = false, again = false, lastTry = 0;
  var state = { msg: "", error: false, last: +read(LAST) || 0 };

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function status(msg, error) { state.msg = msg || ""; state.error = !!error; cfg.onStatus && cfg.onStatus(); }

  function errMsg(j, code) {
    var c = (j && (j.error_code || j.code || j.error)) || "", m = (j && (j.msg || j.error_description || j.message)) || "";
    var map = {
      invalid_credentials: "이메일 또는 비밀번호가 틀려요.", invalid_grant: "이메일 또는 비밀번호가 틀려요.",
      email_not_confirmed: "가입 확인 메일의 링크를 먼저 눌러주세요.", user_already_exists: "이미 가입된 이메일이에요. 로그인해주세요.",
      signup_disabled: "새 가입이 막혀 있어요.", weak_password: "비밀번호가 너무 약해요(6자 이상).",
      over_email_send_rate_limit: "메일을 너무 자주 보냈어요. 잠시 후 다시 해주세요.", validation_failed: "이메일 형식을 확인해주세요."
    };
    return map[c] || (m ? m : "오류 " + code);
  }
  async function call(method, path, body, token, extraHeaders) {
    var h = { apikey: key, "content-type": "application/json" };
    if (token) h.authorization = "Bearer " + token;
    Object.assign(h, extraHeaders || {});
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 15000);
    try {
      var r = await fetch(base + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: c.signal });
      var text = await r.text(), j = null;
      try { j = text ? JSON.parse(text) : null; } catch (e) {}
      if (!r.ok) { var err = new Error(errMsg(j, r.status)); err.status = r.status; throw err; }
      return j;
    } catch (e) {
      if (e.status) throw e;
      var ne = new Error("인터넷 연결을 확인해주세요."); ne.status = 0; throw ne;
    } finally { clearTimeout(t); }
  }

  // ---------- 로그인 ----------
  function keep(j) {
    if (!j || !j.access_token) return false;
    session = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, uid: j.user && j.user.id, email: j.user && j.user.email };
    write(AUTH, session); return true;
  }
  async function signIn(email, pw) {
    keep(await call("POST", "/auth/v1/token?grant_type=password", { email: email, password: pw }));
    status("로그인했어요."); await syncNow(); return true;
  }
  async function signUp(email, pw) {
    var j = await call("POST", "/auth/v1/signup", { email: email, password: pw });
    if (keep(j)) { status("가입했어요."); await syncNow(); return true; }
    return false; // 이메일 확인이 켜져 있으면 세션 없이 응답 → 메일 확인 후 로그인
  }
  function signOut() {
    var s = session; session = null; write(AUTH, null); write(LAST, null); state.last = 0;
    if (s) call("POST", "/auth/v1/logout", null, s.access).catch(function () {});
    status("로그아웃했어요. 이 기기의 기록은 그대로 남아 있어요.");
  }
  async function token() {
    if (!session) throw Object.assign(new Error("로그인이 필요해요."), { status: 401 });
    if (Date.now() < session.exp - 60000) return session.access;
    try { keep(await call("POST", "/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh })); }
    catch (e) { if (e.status) { session = null; write(AUTH, null); throw Object.assign(new Error("다시 로그인해주세요."), { status: 401 }); } throw e; }
    return session.access;
  }
  async function rest(method, path, body, headers) {
    try { return await call(method, "/rest/v1/" + path, body, await token(), headers); }
    catch (e) {
      if (e.status !== 401 || !session) throw e;
      session.exp = 0; // 토큰이 서버에서 거절됨 → 한 번 갱신 후 재시도
      return await call(method, "/rest/v1/" + path, body, await token(), headers);
    }
  }

  // ---------- 동기화 ----------
  function stamp(b) { return +b.updated || +b.added || 0; }
  function markDeleted(id) { var t = read(TOMB) || {}; t[id] = Date.now(); write(TOMB, t); }

  async function syncNow() {
    if (!enabled || !session) return;
    if (running) { again = true; return; }
    running = true; again = false; lastTry = Date.now();
    status("동기화 중…");
    try {
      // Supabase는 한 번에 최대 1000행만 주므로 나눠서 받음
      var remote = [], page;
      do {
        page = await rest("GET", "books?select=id,data,updated,deleted&order=id&limit=1000&offset=" + remote.length) || [];
        remote = remote.concat(page);
      } while (page.length === 1000);
      // --- 병합(동기 구간: 이 사이에는 사용자 변경이 끼어들지 않음) ---
      var local = cfg.getBooks(), tomb = read(TOMB) || {}, tombSnap = Object.assign({}, tomb);
      var byId = {}, rIds = {}, push = [], changed = false;
      local.forEach(function (b) { byId[b.id] = b; });
      remote.forEach(function (r) {
        rIds[r.id] = 1;
        var l = byId[r.id], lu = l ? stamp(l) : (tomb[r.id] || -1), ru = +r.updated || 0;
        if (ru >= lu) {
          if (r.deleted) { if (l) { delete byId[r.id]; changed = true; } }
          else if (!l || ru > lu) { byId[r.id] = Object.assign({}, r.data, { id: r.id, updated: ru }); changed = true; }
          delete tomb[r.id];
        } else if (l) push.push(l);
        else push.push({ id: r.id, deleted: true, updated: tomb[r.id] });
      });
      local.forEach(function (b) { if (!rIds[b.id] && byId[b.id]) push.push(b); });
      Object.keys(tomb).forEach(function (id) { if (!rIds[id]) push.push({ id: id, deleted: true, updated: tomb[id] }); });
      if (changed) cfg.setBooks(Object.keys(byId).map(function (id) { return byId[id]; }));
      // --- 올리기 ---
      if (push.length) {
        var rows = push.map(function (b) {
          if (b.deleted) return { user_id: session.uid, id: b.id, data: {}, updated: b.updated || Date.now(), deleted: true };
          return { user_id: session.uid, id: b.id, data: b, updated: stamp(b) || Date.now(), deleted: false };
        });
        await rest("POST", "books?on_conflict=user_id,id", rows, { prefer: "resolution=merge-duplicates,return=minimal" });
      }
      // 처리한 삭제 기록만 지움(동기화 중에 새로 삭제한 것은 남김)
      var cur = read(TOMB) || {};
      Object.keys(tombSnap).forEach(function (id) { if (cur[id] === tombSnap[id]) delete cur[id]; });
      write(TOMB, cur);
      state.last = Date.now(); write(LAST, state.last);
      status("");
    } catch (e) {
      status("동기화 실패: " + e.message, true);
    } finally {
      running = false;
      if (again) schedule(500);
    }
  }
  function schedule(ms) {
    if (!enabled || !session) return;
    clearTimeout(timer); timer = setTimeout(syncNow, ms == null ? 1500 : ms);
  }

  if (enabled) {
    document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - lastTry > 30000) schedule(0); });
    window.addEventListener("online", function () { schedule(0); });
  }

  return {
    enabled: enabled,
    user: function () { return session && session.email; },
    state: state,
    signIn: signIn, signUp: signUp, signOut: signOut,
    markDeleted: markDeleted, schedule: schedule, syncNow: syncNow
  };
};
