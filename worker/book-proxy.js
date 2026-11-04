// 도서 조회 중계(Cloudflare Worker) — 카카오(Daum) 책 검색 API
// - REST API 키를 브라우저에 노출하지 않기 위해 이 함수가 대신 조회한다.
// - 환경 변수(비밀): KAKAO_REST_KEY  /  선택: ALLOWED_ORIGINS (쉼표 구분)
// - 요청: GET https://<워커 주소>/?isbn=9788936434120
// - 응답: 200 {title, author, cover, publisher, pubDate, link} / 404 {error:"not_found"} / 그 외 {error:...}
// (알라딘 OpenAPI는 2026-10-30 종료되어 카카오로 교체함)

const DEFAULT_ORIGINS = ["https://ryudughwan-hub.github.io", "http://localhost:8000"];

function cleanIsbn(s) { return String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase(); }

function json(body, status, origin) {
  const h = { "content-type": "application/json; charset=utf-8", "vary": "Origin" };
  if (origin) h["access-control-allow-origin"] = origin;
  if (status === 200 || status === 404) h["cache-control"] = "public, max-age=86400";
  return new Response(JSON.stringify(body), { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
    const reqOrigin = request.headers.get("origin") || "";
    const origin = allowed.includes(reqOrigin) ? reqOrigin : "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET", "vary": "Origin" } : {} });
    }
    if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, origin);
    // 허용된 사이트가 아닌 브라우저 요청은 거절(남이 내 키 한도를 쓰지 못하게)
    if (reqOrigin && !origin) return json({ error: "origin_not_allowed" }, 403, "");
    if (!env.KAKAO_REST_KEY) return json({ error: "no_key" }, 500, origin);

    const url = new URL(request.url);
    const isbn = cleanIsbn(url.searchParams.get("isbn"));
    if (!/^(\d{13}|\d{9}[\dX])$/.test(isbn)) return json({ error: "bad_isbn" }, 400, origin);

    // 같은 ISBN은 하루 동안 Cloudflare 캐시에서 응답(호출 수 절약)
    const cache = typeof caches !== "undefined" ? caches.default : null;
    const cacheKey = new Request("https://cache.local/book/" + isbn);
    if (cache) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const r = new Response(hit.body, hit);
        if (origin) r.headers.set("access-control-allow-origin", origin);
        return r;
      }
    }

    const api = "https://dapi.kakao.com/v3/search/book?" + new URLSearchParams({ query: isbn, target: "isbn", size: "5" });
    let data;
    try {
      const r = await fetch(api, { headers: { authorization: "KakaoAK " + env.KAKAO_REST_KEY } });
      if (!r.ok) {
        let msg = ""; try { msg = (await r.json()).message || ""; } catch (e) {}
        return json({ error: "kakao_" + r.status, message: msg }, 502, origin);
      }
      data = await r.json();
    } catch (e) {
      return json({ error: "upstream_failed" }, 502, origin);
    }
    const docs = (data && data.documents) || [];
    // isbn 필드는 "ISBN10 ISBN13" 형태. 요청한 ISBN과 일치하는 문서를 우선
    const it = docs.find((d) => String(d.isbn || "").split(/\s+/).includes(isbn)) || docs[0];
    let res;
    if (!it || !it.title) res = json({ error: "not_found" }, 404, origin);
    else res = json({
      title: it.title,
      author: (it.authors || []).join(", "),
      cover: String(it.thumbnail || "").replace(/^http:/, "https:"),
      publisher: it.publisher || "",
      pubDate: String(it.datetime || "").slice(0, 10),
      link: it.url || "",
    }, 200, origin);
    if (cache) {
      const toStore = new Response(res.clone().body, res);
      toStore.headers.delete("access-control-allow-origin");
      ctx.waitUntil(cache.put(cacheKey, toStore));
    }
    return res;
  },
};
