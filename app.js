(function () {
  "use strict";
  var LS = "bookshelf.books.v1";
  // Google Books API 키(선택). 키 없이 쓰면 전 세계 공용 한도를 같이 써서 자주 429(한도 초과)가 난다.
  // Google Cloud 콘솔에서 발급하고, "HTTP 리퍼러" 제한을 이 사이트 주소로 걸어 둘 것.
  var GOOGLE_BOOKS_KEY = "";
  // 알라딘 조회 중계(Cloudflare Worker) 주소. worker/README.md 참고. 비워 두면 알라딘은 건너뜀.
  var ALADIN_PROXY = "";
  var books = [], editingId = null, rating = 0, cover = "";
  var $ = function (id) { return document.getElementById(id); };
  var COLORS = ["#8c4a2f", "#3f6b5e", "#44546a", "#a0522d", "#6b4a7a", "#b5763a", "#2f5d62"];

  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function color(t) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return COLORS[h % COLORS.length]; }
  function setStatus(m) { $("status").textContent = m || ""; }
  function load() { try { books = JSON.parse(localStorage.getItem(LS) || "[]"); } catch (e) { books = []; } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(books)); } catch (e) { setStatus("저장에 실패했어요. 저장 공간을 확인해주세요."); } }

  // ---------- ISBN ----------
  function cleanIsbn(s) { return String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase(); }
  function validIsbn13(s) {
    if (!/^\d{13}$/.test(s)) return false;
    var sum = 0; for (var i = 0; i < 12; i++) sum += (+s[i]) * (i % 2 ? 3 : 1);
    return (10 - (sum % 10)) % 10 === +s[12];
  }
  function validIsbn10(s) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    var sum = 0; for (var i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : +s[i]) * (10 - i);
    return sum % 11 === 0;
  }
  function validIsbn(s) { return validIsbn13(s) || validIsbn10(s); }

  async function fetchJson(url) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 8000);
    try { var r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  function why(e) {
    var m = String(e && e.message || e);
    if (m === "429") return "조회 한도 초과";
    if (/^\d{3}$/.test(m)) return "오류 " + m;
    if (e && e.name === "AbortError") return "응답 시간 초과";
    return "접속 실패";
  }
  // 성공하면 {title, author, cover}, 실패하면 {fail: "소스별 실패 이유"}
  async function lookupIsbn(isbn) {
    var fails = [];
    // 1) 알라딘(중계 서버 경유) — 한국 도서에 가장 정확
    if (ALADIN_PROXY) {
      try {
        var a = await fetchJson(ALADIN_PROXY.replace(/\/$/, "") + "/?isbn=" + isbn);
        if (a.title) return { title: a.title, author: a.author || "", cover: a.cover || "" };
        fails.push("알라딘: 결과 없음");
      } catch (e) { fails.push("알라딘: " + (String(e && e.message) === "404" ? "결과 없음" : why(e))); }
    }
    // 2) Google Books
    try {
      var g = await fetchJson("https://www.googleapis.com/books/v1/volumes?q=isbn:" + isbn + "&maxResults=1" + (GOOGLE_BOOKS_KEY ? "&key=" + GOOGLE_BOOKS_KEY : ""));
      if (!(g.items && g.items.length)) fails.push("Google: 결과 없음");
      else {
        var v = g.items[0].volumeInfo || {};
        var img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || "";
        return { title: v.title ? (v.title + (v.subtitle ? ": " + v.subtitle : "")) : "", author: (v.authors || []).join(", "), cover: img.replace(/^http:/, "https:") };
      }
    } catch (e) { fails.push("Google: " + why(e)); }
    // 3) Open Library
    try {
      var o = await fetchJson("https://openlibrary.org/api/books?bibkeys=ISBN:" + isbn + "&format=json&jscmd=data");
      var b = o["ISBN:" + isbn];
      if (b) return { title: b.title || "", author: (b.authors || []).map(function (a) { return a.name; }).join(", "), cover: (b.cover && (b.cover.medium || b.cover.small)) || "" };
      fails.push("Open Library: 결과 없음");
    } catch (e) { fails.push("Open Library: " + why(e)); }
    return { fail: fails.join(", ") };
  }

  async function doLookup(isbn) {
    isbn = cleanIsbn(isbn);
    if (!validIsbn(isbn)) { setPreview("ISBN 형식이 올바르지 않아요."); return false; }
    $("fIsbn").value = isbn;
    setPreview("불러오는 중…");
    var info = await lookupIsbn(isbn);
    if (!info.title) { setPreview("정보를 찾지 못했어요. 제목과 저자를 직접 입력해주세요. (" + (info.fail || "제목 없음") + ")"); return false; }
    if (!$("fTitle").value.trim()) $("fTitle").value = info.title;
    if (!$("fAuthor").value.trim()) $("fAuthor").value = info.author;
    cover = info.cover || cover;
    setPreview("정보를 불러왔어요. 내용을 확인해주세요.");
    return true;
  }
  // 현재 표지(있으면)와 안내 문구를 함께 표시
  function setPreview(msg) {
    $("preview").innerHTML = (cover ? '<img class="cover" alt="" referrerpolicy="no-referrer" src="' + esc(cover) + '">' : "") +
      (msg ? '<span class="a">' + esc(msg) + "</span>" : "");
  }

  // ---------- 렌더 ----------
  function stars(n) { return "★".repeat(n) + "☆".repeat(5 - n); }
  function render() {
    var q = $("q").value.trim().toLowerCase(), s = $("sort").value;
    var arr = books.filter(function (b) { return !q || (b.title + " " + (b.author || "")).toLowerCase().indexOf(q) >= 0; });
    arr.sort(function (a, b) {
      if (s === "rating") return (b.rating || 0) - (a.rating || 0) || (b.date || "").localeCompare(a.date || "");
      if (s === "title") return a.title.localeCompare(b.title, "ko");
      return (b.date || "").localeCompare(a.date || "") || (b.added || 0) - (a.added || 0);
    });
    $("list").innerHTML = arr.length ? arr.map(function (b) {
      var thumb = b.cover ? '<img class="cover" alt="" loading="lazy" referrerpolicy="no-referrer" src="' + esc(b.cover) + '">' : '<div class="spine" style="background:' + color(b.title) + '">' + esc(b.title.slice(0, 12)) + "</div>";
      return '<div class="book">' + thumb + '<div class="info"><div class="t">' + esc(b.title) + "</div>" +
        (b.author ? '<div class="a">' + esc(b.author) + "</div>" : "") +
        (b.rating ? '<div class="stars">' + stars(b.rating) + "</div>" : "") +
        (b.note ? '<div class="note">' + esc(b.note) + "</div>" : "") +
        '<div class="meta"><span>' + esc(b.date || "") + "</span><span>" +
        '<button class="ghost small" data-e="' + b.id + '">수정</button> ' +
        '<button class="ghost small" data-d="' + b.id + '">삭제</button></span></div></div></div>';
    }).join("") : '<div class="empty">' + (books.length ? "검색 결과가 없어요" : "아직 기록이 없어요.<br>📷 버튼으로 바코드를 찍어 첫 책을 추가해보세요") + "</div>";
    var yr = String(new Date().getFullYear()), rated = books.filter(function (b) { return b.rating; });
    $("sTotal").textContent = books.length;
    $("sYear").textContent = books.filter(function (b) { return (b.date || "").indexOf(yr) === 0; }).length;
    $("sAvg").textContent = rated.length ? (rated.reduce(function (a, b) { return a + b.rating; }, 0) / rated.length).toFixed(1) : "-";
  }

  // ---------- 폼 ----------
  function drawRate() { $("fRate").innerHTML = [1, 2, 3, 4, 5].map(function (i) { return '<span data-r="' + i + '" class="' + (i <= rating ? "on" : "") + '">★</span>'; }).join(""); }
  $("fRate").addEventListener("click", function (e) { var r = +e.target.getAttribute("data-r"); if (!r) return; rating = rating === r ? 0 : r; drawRate(); });

  function openForm(b, isbn) {
    editingId = b ? b.id : null;
    $("dlgTitle").textContent = b ? "책 수정" : "책 추가";
    $("fIsbn").value = b ? b.isbn || "" : isbn || "";
    $("fTitle").value = b ? b.title : "";
    $("fAuthor").value = b ? b.author || "" : "";
    $("fDate").value = b ? b.date || "" : today();
    $("fNote").value = b ? b.note || "" : "";
    cover = b ? b.cover || "" : "";
    rating = b ? b.rating || 0 : 0; drawRate();
    setPreview("");
    if (!$("dlg").open) $("dlg").showModal();
  }
  $("add").onclick = function () { openForm(null); };
  $("cancel").onclick = function () { $("dlg").close(); };
  $("lookup").onclick = function () { doLookup($("fIsbn").value); };
  $("form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("fTitle").value.trim(); if (!t) return;
    var isbn = cleanIsbn($("fIsbn").value);
    var item = { title: t, author: $("fAuthor").value.trim(), isbn: isbn, cover: cover, date: $("fDate").value, rating: rating, note: $("fNote").value.trim() };
    if (!editingId && isbn && books.some(function (b) { return b.isbn === isbn; }) && !confirm("이미 기록한 책이에요. 또 추가할까요?")) return;
    if (editingId) books = books.map(function (b) { return b.id === editingId ? Object.assign({}, b, item) : b; });
    else { item.id = "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); item.added = Date.now(); books.push(item); }
    $("dlg").close(); save(); render();
  });
  $("list").addEventListener("click", function (e) {
    var d = e.target.getAttribute("data-d"), ed = e.target.getAttribute("data-e");
    if (ed) openForm(books.filter(function (b) { return b.id === ed; })[0]);
    if (d) {
      if (e.target.getAttribute("data-c")) { books = books.filter(function (b) { return b.id !== d; }); save(); render(); }
      else { var el = e.target; el.textContent = "정말?"; el.setAttribute("data-c", "1"); setTimeout(function () { el.textContent = "삭제"; el.removeAttribute("data-c"); }, 2500); }
    }
  });
  $("q").addEventListener("input", render);
  $("sort").addEventListener("change", render);

  // ---------- 스캐너 ----------
  var stream = null, scanning = false, reader = null;
  function stopScan() {
    scanning = false;
    if (reader) { try { reader.reset(); } catch (e) {} reader = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    $("video").srcObject = null;
    if ($("scanDlg").open) $("scanDlg").close();
  }
  async function onCode(code) {
    code = cleanIsbn(code);
    if (!validIsbn(code) || !/^(978|979)/.test(code) && code.length === 13) return false; // 가격 바코드 등 무시
    stopScan();
    openForm(null, code);
    await doLookup(code);
    return true;
  }
  async function startScan() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert("이 브라우저는 카메라를 지원하지 않거나, https 로 접속해야 해요."); return; }
    $("scanHint").textContent = "책 뒷면의 바코드(978/979로 시작)를 화면에 맞춰주세요.";
    $("scanDlg").showModal();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
    } catch (e) { $("scanHint").textContent = "카메라 권한이 필요해요. 브라우저 설정에서 허용해주세요."; return; }
    var v = $("video"); v.srcObject = stream; await v.play().catch(function () {});
    scanning = true;
    if ("BarcodeDetector" in window) {
      var det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a"] });
      (async function loop() {
        while (scanning) {
          try { var r = await det.detect(v); if (r.length && await onCode(r[0].rawValue)) return; } catch (e) {}
          await new Promise(function (res) { setTimeout(res, 200); });
        }
      })();
    } else if (window.ZXing) {
      var hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]);
      reader = new ZXing.BrowserMultiFormatReader(hints, 300);
      reader.decodeFromStream(stream, v, function (res) { if (res && scanning) onCode(res.getText()); });
    } else { $("scanHint").textContent = "스캐너를 불러오지 못했어요. ISBN을 직접 입력해주세요."; }
  }
  $("scan").onclick = startScan;
  $("scanCancel").onclick = stopScan;
  $("scanDlg").addEventListener("close", function () { if (scanning || stream) stopScan(); });

  // ---------- 백업 ----------
  // 백업 파일의 항목을 데이터 모델에 맞게 정리. 필수값(id, title)이 없으면 null
  function str(v) { return typeof v === "string" ? v.trim() : ""; }
  function normalize(b) {
    if (!b || typeof b !== "object") return null;
    var id = typeof b.id === "number" ? String(b.id) : str(b.id), title = str(b.title);
    if (!id || !title) return null;
    var cover = str(b.cover), date = str(b.date), rating = Math.round(+b.rating) || 0, added = +b.added;
    return {
      id: id, title: title, author: str(b.author), isbn: cleanIsbn(str(b.isbn)),
      cover: /^https?:\/\//i.test(cover) ? cover : "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      rating: Math.min(5, Math.max(0, rating)), note: str(b.note),
      added: isFinite(added) && added > 0 ? added : Date.now()
    };
  }
  $("export").onclick = function () {
    var blob = new Blob([JSON.stringify(books, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bookshelf-" + today() + ".json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  };
  $("import").onclick = function () { $("importFile").click(); };
  $("importFile").addEventListener("change", function () {
    var f = this.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var data = JSON.parse(rd.result); if (!Array.isArray(data)) throw 0;
        var ids = {}; books.forEach(function (b) { ids[b.id] = 1; });
        var added = [], skipped = 0;
        data.forEach(function (b) {
          var item = normalize(b);
          if (!item || ids[item.id]) { skipped++; return; }
          ids[item.id] = 1; added.push(item);
        });
        books = books.concat(added); save(); render();
        setStatus(added.length + "권을 불러왔어요." + (skipped ? " (" + skipped + "건은 중복이거나 형식이 맞지 않아 건너뛰었어요)" : ""));
      } catch (e) { setStatus("올바른 백업 파일이 아니에요."); }
    };
    rd.readAsText(f); this.value = "";
  });

  load(); render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
