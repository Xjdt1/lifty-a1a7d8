(function () {
  "use strict";

  var LIFTS = window.LIFTS || [];
  var VERSION = "26.11.2026";
  var byId = {};
  LIFTS.forEach(function (l) { byId[l.id] = l; });

  var GROUPS = [
    { title: "Иностранные", ids: ["schindler3300", "otis-gen2"] },
    { title: "Отечественные", ids: ["ukl", "ul", "uel", "shk6000", "shulm", "nku-mppl"] },
    { title: "Приводы", ids: ["abb-acsm1", "schindler-fc", "varidor-15", "otis-drive", "buad-4-25"] }
  ];
  var BADGE = { schindler3300: "Sch", "otis-gen2": "Otis", ukl: "УКЛ", ul: "УЛ", uel: "УЭЛ", shk6000: "ШК", shulm: "ШУЛМ", "nku-mppl": "МППЛ" };
  var app = document.getElementById("app");
  var state = { liftId: null, query: "", homeScroll: 0, liftScroll: 0, findWords: null, offline: false };

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var LOOK = { "а": "a", "в": "b", "б": "b", "ь": "b", "с": "c", "д": "d", "е": "e", "ё": "e", "о": "0", "o": "0", "○": "0" };
  function normCode(s) {
    return String(s).toLowerCase().replace(/\s+/g, "").replace(/[авбьсдеёоo○]/g, function (c) { return LOOK[c]; });
  }
  function normText(s) { return String(s).toLowerCase().replace(/ё/g, "е"); }
  /* текст раздела для поиска и превью: пункты списков и строки таблиц разделены «·», ключ и пояснение — «—» */
  function stripHtml(h) {
    return h.replace(/<\/b>\s*<span>/g, " — ").replace(/<\/td>\s*<td[^>]*>/g, " — ")
      .replace(/<\/(li|tr|p|h3|div)>/gi, " · ")
      .replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ")
      .replace(/(\s*·\s*)+/g, " · ").replace(/^[\s·]+|[\s·]+$/g, "");
  }
  /* грубая основа слова: «ловители» найдёт «ловителей», «двери» — «дверей» */
  function stem(w) {
    if (w.length < 5) return w;
    var s = w.replace(/[аеиоуыэюяйь]{1,2}$/, "");
    return s.length >= 4 ? s : w;
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function highlight(text, words) {
    var safe = esc(text);
    if (!words.length) return safe;
    var re = new RegExp("(" + words.map(function (w) { return reEsc(esc(w)); }).join("|") + ")", "gi");
    return safe.replace(re, "<mark>$1</mark>");
  }
  function snippet(plain, word) {
    var i = normText(plain).indexOf(word);
    if (i < 0) return plain.slice(0, 140) + (plain.length > 140 ? "…" : "");
    var a = Math.max(0, i - 50), b = Math.min(plain.length, i + 110);
    return (a > 0 ? "…" : "") + plain.slice(a, b) + (b < plain.length ? "…" : "");
  }
  function codeAnchor(gi, code) { return "c-" + gi + "-" + encodeURIComponent(normCode(code)); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>';
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
  var CHEV = '<svg class="chev" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l6 6-6 6"/></svg>';

  function bar(left, title) {
    return '<header class="bar">' + (left || '<span class="bar-btn"></span>') +
      '<div class="bar-title">' + esc(title || "") + '</div>' +
      '<button class="bar-btn right" id="sizeBtn" aria-label="Размер текста">Аа</button></header>';
  }
  /* modal для детальной информации о коде ошибки */
  function createModal() {
    var modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "codeModal";
    modal.innerHTML = '<div class="modal-box">' +
      '<header class="bar"><button class="modal-close" id="modalClose" aria-label="Закрыть">✕</button>' +
      '<div class="bar-title" id="modalTitle">Код ошибки</div></header>' +
      '<div class="modal-content" id="modalContent"></div>' +
      '</div>';
    return modal;
  }

  function footer() {
    var st = state.offline
      ? '<span class="status ready">✓ Сохранено — работает без интернета</span>'
      : '<span class="status">Сохраняю для работы без интернета…</span>';
    return '<div class="foot">' + st + '<br>Версия ' + VERSION +
      '. Собрано по открытым руководствам. Если что-то расходится с документацией на ваш лифт, верьте документации.</div>';
  }

  /* ---------- search ---------- */
  /* only — искать только в одном лифте (строка поиска на странице лифта) */
  function search(q, only) {
    var qt = normText(q.trim());
    if (!qt) return [];
    var qc = normCode(q);
    var qn = /^\d+$/.test(qc) ? qc.replace(/^0+(?=\d)/, "") : "";
    var words = qt.split(/\s+/).filter(Boolean).map(stem);
    var textOk = qt.length >= 3 || /\d/.test(qt);
    var out = [];
    (only ? [only] : LIFTS).forEach(function (l) {
      var liftText = normText([l.name, l.brand, l.board].concat(l.tags).join(" "));
      var tagHit = l.tags.indexOf(qt) >= 0 || normText(l.name).indexOf(qt) === 0;
      if (!only && ((qt.length >= 3 && liftText.indexOf(qt) >= 0) || tagHit)) out.push({ rank: 2, kind: "lift", lift: l });
      l.codeGroups.forEach(function (g, gi) {
        g.items.forEach(function (it) {
          var cn = normCode(it[0]);
          var rank = -1;
          var rg = /^(\d+)[–-](\d+)$/.exec(cn);
          if (cn === qc) rank = 0;
          /* ведущие нули не важны: «301» найдёт 0301; диапазон «2200–2205» найдётся по 2203 */
          else if (qn && cn.replace(/^0+(?=\d)/, "") === qn) rank = 0;
          else if (qn && rg && +qn >= +rg[1] && +qn <= +rg[2]) rank = 0;
          else if (qc.length >= 2 && cn.indexOf(qc) === 0) rank = 1;
          else if (textOk) {
            var tn = normText(it[1]);
            if (words.every(function (w) { return tn.indexOf(w) >= 0; })) rank = 3;
          }
          if (rank >= 0) out.push({ rank: rank, kind: "code", lift: l, gi: gi, code: it[0], text: it[1] });
        });
      });
      if (qt.length >= 3) {
        l.sections.forEach(function (s) {
          var plain = stripHtml(s.html);
          var pn = normText(s.title + " " + plain);
          if (words.every(function (w) { return pn.indexOf(w) >= 0; })) {
            out.push({ rank: 4, kind: "sec", lift: l, sec: s, text: snippet(plain, words[0]) });
          }
        });
      }
    });
    out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }

  function renderResults(q) {
    var box = document.getElementById("results");
    var listBox = document.getElementById("homeList");
    if (!box) return;
    var res = search(q);
    if (!q.trim()) { box.innerHTML = ""; listBox.hidden = false; return; }
    listBox.hidden = true;
    var words = queryWords(q);
    if (!res.length) {
      box.innerHTML = '<p class="res-count">Ничего не нашлось. Попробуйте код без пробелов (например <code>44</code>, <code>A0</code>, <code>0204</code>) или одно слово (<code>двери</code>, <code>ловители</code>).</p>';
      return;
    }
    var shown = res.slice(0, 150);
    box.innerHTML = '<p class="res-count">Найдено: ' + res.length + (res.length > shown.length ? ", показаны первые " + shown.length : "") + "</p>" +
      shown.map(function (r) { return resHtml(r, words, false); }).join("");
  }

  /* слова запроса для подсветки (как в поиске, без однобуквенных) */
  function queryWords(q) {
    return normText(q.trim()).split(/\s+/).filter(function (w) { return w.length >= 2; }).map(stem);
  }

  function resHtml(r, words, inLift) {
    var who;
    if (!inLift) who = '<span class="who">' + esc(r.lift.name) + "</span>";
    else if (r.kind === "sec") who = '<span class="who">раздел</span>';
    else who = r.lift.codeGroups.length > 1 ? '<span class="who">' + esc(r.lift.codeGroups[r.gi].title.split(" (")[0]) + "</span>" : "";
    if (r.kind === "code") {
      return '<a class="res" href="#/l/' + r.lift.id + "/" + codeAnchor(r.gi, r.code) + '"><div class="top"><span class="c">' + esc(r.code) + "</span>" + who +
        '</div><div class="txt">' + highlight(r.text, words) + "</div></a>";
    }
    if (r.kind === "sec") {
      return '<a class="res" href="#/l/' + r.lift.id + "/s-" + r.sec.id + '"><div class="top"><b>' + esc(r.sec.title) + "</b>" + who +
        '</div><div class="txt">' + highlight(r.text, words) + "</div></a>";
    }
    return '<a class="res" href="#/l/' + r.lift.id + '"><div class="top"><b>' + esc(r.lift.name) + '</b><span class="who">система</span></div><div class="txt">' + esc(r.lift.board) + "</div></a>";
  }

  function renderLiftResults(l, q, box) {
    var res = search(q, l);
    var words = queryWords(q);
    var all = '<p class="res-count"><a href="#/" data-all="1">Искать во всех лифтах →</a></p>';
    if (!res.length) {
      box.innerHTML = '<p class="res-count">В ' + esc(l.name) + ' ничего не нашлось. Попробуйте код без пробелов или одно слово.</p>' + all;
      return;
    }
    box.innerHTML = '<p class="res-count">Найдено в ' + esc(l.name) + ": " + res.length + "</p>" +
      res.map(function (r) { return resHtml(r, words, true); }).join("") + all;
  }

  /* ---------- pages ---------- */
  function bindGroups() {
    app.querySelectorAll(".group-toggle").forEach(function (button) {
      button.addEventListener("click", function () {
        var open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        document.getElementById(button.getAttribute("aria-controls")).toggleAttribute("inert", !open);
      });
    });
  }

  function renderHome() {
    state.liftId = null;
    document.title = "Лифты";
    var html = bar("", "") + '<main class="wrap">' +
      '<h1 class="large-title">Лифты</h1><p class="subtitle">Выберите станцию или привод, чтобы найти ошибку и порядок проверки.</p>' +
      '<div class="sticky-search"><label class="search">' + ICON_SEARCH +
      '<input id="q" type="search" placeholder="Код ошибки или слово" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" value="' + esc(state.query) + '">' +
      '<button class="clear" id="qClear" aria-label="Очистить"' + (state.query ? "" : " hidden") + '>✕</button></label></div>' +
      '<div id="results"></div><div id="homeList">';

    if (window.navigator.standalone === false) {
      html += '<div class="callout info"><b>Поставьте значок на экран.</b> Внизу Safari нажмите «Поделиться» (квадрат со стрелкой) → «На экран „Домой“». Потом один раз откройте значок с интернетом — дальше справочник работает и без связи.</div>';
    }

    GROUPS.forEach(function (g) {
      html += '<section class="station-group"><button type="button" class="group-toggle" aria-expanded="false" aria-controls="models-' + g.ids[0] + '"><i class="shaft" aria-hidden="true"></i><span>' + esc(g.title) + '</span><small>' + g.ids.length + '</small></button><div class="group-panel" inert id="models-' + g.ids[0] + '"><nav class="list">';
      g.ids.forEach(function (id) {
        var l = byId[id];
        if (!l) return;
        var b = BADGE[id] || l.name.slice(0, 2);
        html += '<a class="row" href="#/l/' + id + '"><span class="ico"' + (b.length >= 4 ? ' style="font-size:.62rem"' : "") + ">" + esc(b) + '</span><span class="main"><span class="t">' +
          esc(l.name) + '</span><span class="s">' + esc(l.board) + "</span></span>" + CHEV + "</a>";
      });
      html += "</nav></div></section>";
    });

    html += "</div>" + footer() + "</main>";
    app.innerHTML = html;

    bindGroups();
    var q = document.getElementById("q");
    var clr = document.getElementById("qClear");
    q.addEventListener("input", function () {
      state.query = q.value;
      clr.hidden = !q.value;
      renderResults(q.value);
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") q.blur(); });
    clr.addEventListener("click", function (e) {
      e.preventDefault();
      q.value = ""; state.query = ""; clr.hidden = true; renderResults(""); q.focus();
    });
    document.getElementById("results").addEventListener("click", function (e) {
      if (e.target.closest("a.res")) state.findWords = queryWords(state.query);
    });
    if (state.query) renderResults(state.query);
    window.scrollTo(0, state.homeScroll || 0);
  }

  function renderLift(l) {
    state.liftId = l.id;
    document.title = l.name;
    var back = '<a class="bar-btn" href="#/">' + ICON_BACK + "Лифты</a>";
    var html = bar(back, l.name) + '<main class="wrap">' +
      '<div class="lift-head"><h1>' + esc(l.name) + "</h1><p>" + esc(l.board) + " · " + esc(l.where) + "</p></div>" +
      '<div class="lift-tools"><label class="search">' + ICON_SEARCH +
      '<input id="lq" type="search" placeholder="Найти в ' + esc(l.name.split(" (")[0]) + ': код или слово" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">' +
      '<button class="clear" id="lqClear" aria-label="Очистить" hidden>✕</button></label>' +
      '</div>' +
      '<div id="liftResults" hidden></div><div id="liftBody">' +
      '<div class="callout safety">Смотреть экран и журнал — безопасно. Сброс, настройку и особые режимы делает только электромеханик с допуском к этому лифту.</div>' +
      (l.note ? '<div class="callout info">' + esc(l.note) + "</div>" : "");

    function section(id, title, content) {
      return '<section class="card lift-group" id="' + id + '"><h2><button type="button" class="group-toggle" aria-expanded="false" aria-controls="panel-' + id + '">' +
        esc(title) + '</button></h2><div class="group-panel" id="panel-' + id + '" inert><div class="section-clip"><div class="section-content">' +
        content + '</div></div></div></section>';
    }
    l.sections.forEach(function (s) {
      html += section("s-" + s.id, s.title, s.html);
    });
    l.codeGroups.forEach(function (g, gi) {
      var rows = g.items.map(function (it) {
        return '<div class="code-row" id="' + codeAnchor(gi, it[0]) + '"><span class="c">' + esc(it[0]) + "</span><span>" + esc(it[1]) + "</span></div>";
      }).join("");
      html += section("g-" + gi, g.title, (g.note ? '<p class="group-note">' + esc(g.note) + "</p>" : "") +
        '<div class="codes" id="codes-' + gi + '">' + rows + "</div>");
    });
    if (l.sources.length) {
      html += section("sources", "Источники", "<ul>" + l.sources.map(function (s) {
        return '<li><a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.t) + "</a></li>";
      }).join("") + "</ul>");
    }
    app.innerHTML = html + "</div>" + footer() + "</main>";
    bindGroups();

    /* поиск внутри лифта: результаты вместо содержимого, нажатие — переход к месту */
    var lq = document.getElementById("lq");
    var lclr = document.getElementById("lqClear");
    var body = document.getElementById("liftBody");
    var rbox = document.getElementById("liftResults");
    function showBody() {
      rbox.hidden = true; rbox.innerHTML = ""; body.hidden = false;
    }
    lq.addEventListener("input", function () {
      var v = lq.value;
      lclr.hidden = !v;
      if (!v.trim()) { showBody(); window.scrollTo(0, state.liftScroll || 0); return; }
      if (!body.hidden) { state.liftScroll = window.scrollY; body.hidden = true; rbox.hidden = false; window.scrollTo(0, 0); }
      renderLiftResults(l, v, rbox);
    });
    lq.addEventListener("keydown", function (e) { if (e.key === "Enter") lq.blur(); });
    lclr.addEventListener("click", function (e) {
      e.preventDefault();
      lq.value = ""; lclr.hidden = true; showBody(); window.scrollTo(0, state.liftScroll || 0); lq.focus();
    });
    rbox.addEventListener("click", function (e) {
      if (e.target.closest("[data-all]")) { state.query = lq.value; return; }
      if (!e.target.closest("a.res")) return;
      state.findWords = queryWords(lq.value);
      lq.value = ""; lclr.hidden = true; lq.blur();
      showBody();
    });
    window.scrollTo(0, 0);
  }

  /* подсветка найденных слов внутри раздела */
  function clearFind() {
    Array.prototype.forEach.call(app.querySelectorAll("mark.find"), function (m) {
      var p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
  }
  function markFind(root, words) {
    var re = new RegExp(words.map(function (w) { return reEsc(w).replace(/е/g, "[её]"); }).join("|"), "gi");
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], first = null;
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var t = n.nodeValue, m, last = 0;
      re.lastIndex = 0;
      if (!re.test(t)) return;
      re.lastIndex = 0;
      var frag = document.createDocumentFragment();
      while ((m = re.exec(t))) {
        if (!m[0]) { re.lastIndex++; continue; }
        frag.appendChild(document.createTextNode(t.slice(last, m.index)));
        var mk = document.createElement("mark");
        mk.className = "find"; mk.textContent = m[0];
        frag.appendChild(mk);
        if (!first) first = mk;
        last = m.index + m[0].length;
      }
      frag.appendChild(document.createTextNode(t.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
    return first;
  }

  function goAnchor(anchor) {
    Array.prototype.forEach.call(app.querySelectorAll(".code-row.hit"), function (el) { el.classList.remove("hit"); });
    clearFind();
    var words = state.findWords;
    state.findWords = null;
    if (!anchor) return;
    var el = document.getElementById(anchor);
    if (!el) return;
    var group = el.closest(".lift-group");
    if (group) {
      var button = group.querySelector(".group-toggle");
      var panel = document.getElementById(button.getAttribute("aria-controls"));
      panel.style.transition = "none";
      button.setAttribute("aria-expanded", "true");
      panel.removeAttribute("inert");
      panel.getBoundingClientRect();
      panel.style.transition = "";
    }
    var target = el, block = "start";
    if (el.classList.contains("code-row")) { el.classList.add("hit"); block = "center"; }
    else if (words && words.length) {
      var f = markFind(el, words);
      if (f) { target = f; block = "center"; }
    }
    requestAnimationFrame(function () { target.scrollIntoView({ block: block }); });
  }

  /* ---------- router ---------- */
  function route(force) {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    var m = h.match(/^l\/([^/]+)(?:\/(.+))?$/);
    if (m && byId[m[1]]) {
      var anchor = m[2] ? (m[2].indexOf("c-") === 0 ? "c-" + m[2].slice(2).replace(/^(\d+)-(.*)$/, function (_, g, c) { return g + "-" + encodeURIComponent(c); }) : m[2]) : "";
      if (state.liftId !== m[1]) {
        if (state.liftId === null) state.homeScroll = window.scrollY;
        renderLift(byId[m[1]]);
      }
      goAnchor(anchor);
    } else {
      if (state.liftId !== null || !document.getElementById("q")) renderHome();
    }
    bindSize();
  }

  function bindSize() {
    var b = document.getElementById("sizeBtn");
    if (b && !b._bound) {
      b._bound = true;
      b.addEventListener("click", function () {
        var big = document.documentElement.classList.toggle("big");
        store("lift-big", big ? "1" : "0");
      });
    }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href^=\"#\"]");
    if (a && a.getAttribute("href") === location.hash) { e.preventDefault(); route(true); }
  });
  if (store("lift-big") === "1") document.documentElement.classList.add("big");
  window.addEventListener("hashchange", route);
  route();

  /* ---------- modal для кодов ошибок ---------- */
  var modal = createModal();
  document.body.appendChild(modal);

  /* обработка клика на код ошибки (.code-row) */
  document.addEventListener("click", function (e) {
    var codeRow = e.target.closest && e.target.closest(".code-row");
    if (!codeRow) return;
    var codeEl = codeRow.querySelector(".c");
    if (!codeEl) return;
    var codeText = codeEl.textContent.trim();
    var codeDescSpan = codeRow.querySelector("span:last-child");
    var codeDesc = codeDescSpan ? codeDescSpan.textContent.trim() : "";

    var content = document.getElementById("modalContent");
    var title = document.getElementById("modalTitle");
    title.textContent = byId[state.liftId].name + " · " + codeText;

    /* основное описание + доп. детали из CODE_DETAILS */
    var html = '<div class="code-modal-header">' +
      '<span class="code-modal-code">' + esc(codeText) + '</span>' +
      '</div>' +
      '<div class="code-modal-section">' +
      '<h3>Расшифровка</h3>' +
      '<p>' + esc(codeDesc) + '</p>' +
      '</div>';

    /* расширенные данные из PDF (если загружены) */
    var details = state.liftId === "schindler3300" && window.CODE_DETAILS && window.CODE_DETAILS[codeText];
    if (details) {
      if (details.causes && details.causes.length) {
        html += '<div class="code-modal-section"><h3>Причины</h3><ul>' +
          details.causes.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join("") +
          '</ul></div>';
      }
      if (details.actions && details.actions.length) {
        html += '<div class="code-modal-section"><h3>Действия для устранения</h3><ul>' +
          details.actions.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join("") +
          '</ul></div>';
      }
    }

    content.innerHTML = html;
    modal.classList.add("open");
    modal.scrollTop = 0;
  });

  /* закрытие модала по нажатию на кнопку или overlay */
  document.getElementById("modalClose").addEventListener("click", function (e) {
    e.preventDefault();
    modal.classList.remove("open");
  });
  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      modal.classList.remove("open");
    }
  });

  /* ---------- offline ---------- */
  function setOffline() {
    state.offline = true;
    var st = document.querySelector(".foot .status");
    if (st) { st.className = "status ready"; st.textContent = "✓ Сохранено — работает без интернета"; }
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(function () {
      return navigator.serviceWorker.ready;
    }).then(setOffline).catch(function () {
      var st = document.querySelector(".foot .status");
      if (st) st.textContent = "Без интернета пока не работает: откройте с интернетом ещё раз";
    });
  }
})();
