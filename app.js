(() => {
  "use strict";
  const D = window.PSOUNIS_DATA;
  const $ = (s, el = document) => el.querySelector(s);
  const main = $("#main");
  // course pages: ΠΛΗ10/20/30 from psounis.gr, plus courses that only exist as playlists on the channel (ΠΛΗ31)
  const COURSES = [...D.courses, ...D.series.filter(s => !D.courses.some(c => c.code === s.name))
    .map(s => ({ code: s.name, slug: "plh" + s.name.replace(/\D/g, ""), sections: [] }))];
  const KIND = { collection: "Πλήρεις σειρές", lesson: "Μάθημα", test: "Τεστ", cards: "Κάρτες", exam: "Διαγωνίσματα & θέματα", exercises: "Ασκήσεις" };

  // ---------------------------------------------------------------- progress store
  const KEY = "ps-status";
  let status = {};
  try { status = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { status = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(status)); } catch (e) {} };
  const setStatus = (id, s) => { if (status[id] === s) delete status[id]; else status[id] = s; save(); };

  // ---------------------------------------------------------------- helpers
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const ytUrl = id => `https://www.youtube.com/playlist?list=${id}`;
  const REVIEW_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const link = (url, label, n, title = "") => `<a href="${url}" target="_blank" rel="noopener"${title && ` title="${title}"`}>${esc(label)}</a>${
    n == null ? "" : ` <span class="n">${n} βίντεο</span>`}`;
  // one tracked playlist: watched checkbox · link · video count · "review again" toggle
  const pl = (id, label, n, url = ytUrl(id), title = "") => `<span class="pl">
      <input type="checkbox" class="chk" data-id="${id}" data-s="w"${status[id] === "w" ? " checked" : ""} title="Το είδα" aria-label="Είδα: ${esc(label)}">
      <span>${link(url, label, n, title)}
      <button class="rev-btn${status[id] === "r" ? " on" : ""}" data-id="${id}" data-s="r" aria-pressed="${status[id] === "r"}" title="Θέλει επανάληψη" aria-label="Επανάληψη: ${esc(label)}">${REVIEW_ICON}</button></span></span>`;
  const pdf = (url, label = "PDF") => url ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>` : "";
  const docs = (...links) => links.some(Boolean) ? `<span class="docs">${links.join("")}</span>` : "";
  // o = row / test / cards object. o.alt = where to play it when it has no playlist of its own: a deleted
  // playlist whose videos live on in a bigger series (alt.list from alt.index) or as a single video (alt.v),
  // or an empty cell of his table whose lesson is inside one of his series
  const usable = o => o && o.video && (!o.gone || o.alt);
  const urlOf = o => !o.alt ? ytUrl(o.video)
    : `https://www.youtube.com/watch?v=${o.alt.v}` + (o.alt.list ? `&list=${o.alt.list}&index=${o.alt.index}` : "");
  const noteOf = o => !o.alt ? "" : o.alt.list
    ? "Ανοίγει στο σημείο του μαθήματος μέσα στη μεγάλη σειρά" + (o.gone ? " (η αρχική playlist διαγράφηκε)" : "")
    : "Η αρχική playlist διαγράφηκε· ανοίγει το βίντεο";
  const video = (o, label, track = true) => !o.video ? esc(label)
    : !usable(o) ? `${esc(label)} <span class="gone" title="Η playlist και τα βίντεό της δεν υπάρχουν πια στο YouTube">δεν υπάρχει πια</span>`
    : track ? pl(o.video, label, o.count, urlOf(o), noteOf(o)) : link(urlOf(o), label, o.count, noteOf(o));

  // only the lesson playlists are tracked; tests and cards are plain links
  const rowIds = r => usable(r) ? [r.video] : [];
  const rowClass = ids => ids.length && ids.some(i => status[i] === "r") ? "rev" : ids.length && ids.every(i => status[i] === "w") ? "done" : "";
  const extraFor = code => D.series.find(s => s.name === code)?.playlists || [];

  function courseIds(c) {
    const ids = new Set();
    c.sections.forEach(s => s.rows.forEach(r => rowIds(r).forEach(i => ids.add(i))));
    extraFor(c.code).forEach(p => ids.add(p.id));
    return [...ids];
  }
  function progress(ids) {
    const n = ids.length, w = ids.filter(i => status[i] === "w").length, r = ids.filter(i => status[i] === "r").length;
    const pct = x => n ? (100 * x / n).toFixed(1) : 0;
    return `<div class="bar"><i class="w" style="width:${pct(w)}%"></i><i class="r" style="width:${pct(r)}%"></i></div>
      <div class="bar-label">${w} / ${n} είδα${r ? ` · ${r} για επανάληψη` : ""}</div>`;
  }

  // ---------------------------------------------------------------- filter (all / not seen / review)
  let filter = "all";
  try { filter = sessionStorage.getItem("ps-filter") || "all"; } catch (e) {}
  const keep = ids => filter === "all" || !ids.length ? filter === "all"
    : filter === "todo" ? ids.some(i => !status[i]) : ids.some(i => status[i] === "r");
  const filterBar = ids => `<div class="toolbar">
      <div class="bar-wrap">${progress(ids)}</div>
      <div class="seg" id="filter">
        <button data-f="all" class="${filter === "all" ? "on" : ""}">Όλα</button>
        <button data-f="todo" class="${filter === "todo" ? "on" : ""}">Δεν έχω δει</button>
        <button data-f="review" class="${filter === "review" ? "on" : ""}">Επανάληψη</button>
      </div></div>`;
  const allLinks = (list, label) => list?.length ? `<div class="all">${label}: ${list.map(a =>
    `<a href="${ytUrl(a.id)}" target="_blank" rel="noopener">${esc(a.title)}</a>${a.count ? ` <span class="n">${a.count}</span>` : ""}`).join(" · ")}</div>` : "";

  // ---------------------------------------------------------------- views
  function viewHome() {
    const line = (href, title, ids) => {
      const w = ids.filter(i => status[i] === "w").length;
      return `<a class="sec${w === ids.length ? " full" : ""}" href="${href}"><span>${esc(title)}</span><span class="n">${w} / ${ids.length}</span></a>`;
    };
    const course = c => {
      const secs = c.sections.map((s, i) => [`#${c.slug}/s${i}`, s.title || "—", [...new Set(s.rows.flatMap(rowIds))]]);
      if (extraFor(c.code).length) secs.push([`#${c.slug}/extra`, "Επιπλέον playlists", extraFor(c.code).map(p => p.id)]);
      return `<section class="course"><h2><a href="#${c.slug}">${esc(c.code)}</a></h2>${progress(courseIds(c))}
        <div class="secs">${secs.filter(s => s[2].length).map(s => line(...s)).join("")}</div></section>`;
    };
    const reviews = allItems().filter(x => x.track !== false && status[x.id] === "r");
    main.innerHTML = `
      <h1>Οι playlists του Δ. Ψούνη για το ΕΑΠ</h1>
      <p class="sub">Τα μαθήματα, τα τεστ και οι κάρτες κάθε ενότητας, με τις σημειώσεις σε PDF.<br>
        Τσεκάρετε ό,τι έχετε δει και πατήστε ${REVIEW_ICON.replace("<svg", '<svg class="inline"')} για όσα θέλουν επανάληψη.</p>
      ${reviews.length ? `<h2>Για επανάληψη</h2><div class="list">${reviews.map(itemRow).join("")}</div>` : ""}
      <div class="courses">${COURSES.map(course).join("")}</div>`;
  }

  function viewCourse(c) {
    const extra = extraFor(c.code), notes = c.sections.some(s => s.rows.some(r => r.pdf || r.pdf4)), cols = notes ? 4 : 3;
    const extraList = extra.length ? `<h2 id="extra">Επιπλέον playlists</h2>
      <p class="sub">Βίντεο του καναλιού για το ${esc(c.code)} που δεν είναι στον πίνακα.</p>${seriesList(extra)}` : "";
    // channel-only courses (ΠΛΗ31) have no per-lesson playlists: every link is a position inside a big series
    const sub = c.source === "channel" ? `<p class="sub">Για το ${esc(c.code)} δεν υπάρχουν playlists ανά μάθημα. Κάθε σύνδεσμος ανοίγει
      την πλήρη σειρά στο πρώτο βίντεο του μαθήματος και το YouTube συνεχίζει κατευθείαν στο επόμενο, οπότε προσέξτε πού
      τελειώνει το μάθημα (τα βίντεό του φαίνονται δίπλα στον τίτλο).</p>` : "";
    if (!c.sections.length) {
      main.innerHTML = `<h1>${esc(c.code)}</h1>${filterBar(courseIds(c))}${seriesList(extra)}`;
      return;
    }
    let body = "";
    c.sections.forEach((s, i) => {
      const rows = s.rows.filter(r => keep(rowIds(r)));
      if (!rows.length && filter !== "all") return;
      body += `<tr class="chapter" id="s${i}"><td colspan="${cols}">${esc(s.title || "—")}${s.typologio ? ` <span class="docs">${pdf(s.typologio, "Τυπολόγιο")}</span>` : ""}${
        allLinks(s.all, "Όλη η ενότητα σε μία playlist")}</td></tr>`;
      rows.forEach(r => {
        const cell = (o, h) => `<td data-h="${h}" class="${o ? "" : "empty-cell"}">${o ? `<div class="cell"><span>${video(o, o.name, false)}</span>${docs(pdf(o.pdf), pdf(o.sol, "Λύσεις"))}</div>` : ""}</td>`;
        body += `<tr class="${rowClass(rowIds(r))}">
          <td class="lesson${r.lesson || r.video ? "" : " empty-cell"}">${r.video ? video(r, r.lesson || "Playlist") : esc(r.lesson)}</td>
          ${notes ? `<td class="${r.pdf || r.pdf4 ? "" : "empty-cell"}">${docs(pdf(r.pdf), pdf(r.pdf4, "4 σε 1"))}</td>` : ""}
          ${cell(r.test, "Τεστ")}${cell(r.cards, "Κάρτες")}</tr>`;
      });
    });
    main.innerHTML = `
      <h1>${esc(c.code)}</h1>
      ${sub}
      ${filterBar(courseIds(c))}
      <table>
        <thead><tr><th>Μάθημα</th>${notes ? "<th>Σημειώσεις</th>" : ""}<th>Τεστ</th><th>Κάρτες</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${cols}" class="empty">Τίποτα εδώ με αυτό το φίλτρο.</td></tr>`}</tbody>
      </table>
      ${extraList}`;
  }

  function seriesList(pls) {
    const shown = pls.filter(p => keep([p.id]));
    if (!shown.length) return `<div class="empty">Τίποτα εδώ με αυτό το φίλτρο.</div>`;
    let html = "", last = null;
    shown.forEach(p => {
      if (p.kind !== last) { html += `<div class="group">${KIND[p.kind] || p.kind}</div>`; last = p.kind; }
      html += itemRow(p);
    });
    return `<div class="list">${html}</div>`;
  }

  function itemRow(p) {
    const cls = status[p.id] === "w" ? "done" : status[p.id] === "r" ? "rev" : "";
    const head = p.track === false ? `<span class="pl plain"><span>${link(p.url, p.title, p.count)}</span></span>` : pl(p.id, p.title, p.count, p.url);
    return `<div class="item ${p.track === false ? "" : cls}">${head}${p.new != null && p.new < p.count ? `<span class="where" title="Τα υπόλοιπα βίντεο της playlist είναι ήδη στον πίνακα">${p.new} νέα</span>` : ""}${
      p.where ? `<span class="where">${esc(p.where)}</span>` : ""}</div>`;
  }

  // every trackable playlist, with where it lives (for search + review list)
  let _all;
  function allItems() {
    if (_all) return _all;
    const map = new Map();
    D.courses.forEach(c => c.sections.forEach(s => s.rows.forEach(r => {
      const add = (o, title, track) => usable(o) && !map.has(o.video) &&
        map.set(o.video, { id: o.video, title, count: o.count, url: urlOf(o), track, where: `${c.code} · ${s.title}`, text: `${s.title} ${r.lesson} ${title}` });
      add(r, r.lesson, true);
      add(r.test, r.lesson ? `${r.lesson} — ${r.test?.name}` : r.test?.name, false);
      add(r.cards, `${r.lesson} — ${r.cards?.name}`, false);
    })));
    D.series.forEach(s => s.playlists.forEach(p => !map.has(p.id) && map.set(p.id, { ...p, where: s.name, text: `${s.name} ${p.title}` })));
    return (_all = [...map.values()]);
  }

  function viewSearch(q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const hits = allItems().filter(x => { const t = norm(x.text); return words.every(w => t.includes(w)); });
    main.innerHTML = `<h1>Αναζήτηση</h1><p class="sub">${hits.length} αποτελέσματα για «${esc(q)}»</p>
      <div class="list">${hits.slice(0, 300).map(itemRow).join("") || '<div class="empty">Κανένα αποτέλεσμα.</div>'}</div>`;
  }

  // ---------------------------------------------------------------- routing: #slug or #slug/<section id>
  function tabs(active) {
    const a = (url, label, on) => `<a href="${url}" class="${on ? "active" : ""}">${esc(label)}</a>`;
    const nav = $("#tabs");
    nav.innerHTML = a("#", "Αρχική", active === "") + COURSES.map(c => a(`#${c.slug}`, c.code, active === c.slug)).join("");
    const on = $(".active", nav);
    if (on) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2;
  }

  function render(keepScroll) {
    const y = scrollY;
    const q = $("#search").value.trim();
    const [slug, sec] = location.hash.slice(1).split("/");
    tabs(q ? null : slug);
    const c = COURSES.find(x => x.slug === slug);
    q ? viewSearch(q) : c ? viewCourse(c) : viewHome();
    if (keepScroll) scrollTo(0, y);
    else if (sec && !q) document.getElementById(sec)?.scrollIntoView();
  }

  // ---------------------------------------------------------------- events
  main.addEventListener("click", e => {
    const b = e.target.closest("[data-s]");
    if (b) {
      const { id, s } = b.dataset;
      setStatus(id, s); render(true);
      return document.querySelector(`[data-id="${id}"][data-s="${s}"]`)?.focus({ preventScroll: true });  // keep keyboard users in place
    }
    const f = e.target.closest("#filter button");
    if (f) { filter = f.dataset.f; try { sessionStorage.setItem("ps-filter", filter); } catch (err) {} render(true); }
  });
  addEventListener("hashchange", () => { $("#search").value = ""; scrollTo(0, 0); render(); });
  let t;
  $("#search").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => render(), 150); });
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("ps-theme", document.documentElement.dataset.theme); } catch (e) {}
  });
  $("#export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(status, null, 1)], { type: "application/json" }));
    a.download = "psounis-progress.json"; a.click();
  });
  $("#import").addEventListener("change", async e => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      Object.entries(data).forEach(([k, v]) => { if (v === "w" || v === "r") status[k] = v; });
      save(); render(true);
    } catch (err) { alert("Μη έγκυρο αρχείο προόδου."); }
  });
  $("#reset").addEventListener("click", () => {
    if (confirm("Να σβηστεί όλη η πρόοδος σε αυτόν τον browser;")) { status = {}; save(); render(true); }
  });
  // sticky section headers sit just under the (wrapping) site header
  new ResizeObserver(([e]) => document.documentElement.style.setProperty("--hh", e.target.offsetHeight + "px")).observe($(".top"));
  $("#generated").textContent = `Δεδομένα: ${D.generated} · ${D.total} playlists.`;
  render();
})();
