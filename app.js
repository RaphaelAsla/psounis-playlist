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
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const plural = n => n == null ? "" : `<small>${n} βίντεο</small>`;
  const ytUrl = id => `https://www.youtube.com/playlist?list=${id}`;

  const yt = (id, label, count, url = ytUrl(id), title = "") => id
    ? `<a class="yt" href="${url}" target="_blank" rel="noopener"${title && ` title="${title}"`}><span>${esc(label)}</span>${plural(count)}</a>` : "";
  const st = id => id ? `<span class="st" data-id="${id}">
      <button class="w${status[id] === "w" ? " on" : ""}" data-s="w" title="Το είδα">✓<span class="lbl">Είδα</span></button>
      <button class="r${status[id] === "r" ? " on" : ""}" data-s="r" title="Θέλει επανάληψη">↻<span class="lbl">Επανάληψη</span></button>
    </span>` : "";
  const pdf = (url, label = "PDF") => url ? `<a class="pdf" href="${url}" target="_blank" rel="noopener">${label}</a>` : "";
  // o = row / test / cards object. o.alt = where to play it when it has no playlist of its own: a deleted
  // playlist whose videos live on in a bigger series (alt.list from alt.index) or as a single video (alt.v),
  // or an empty cell of his table whose lesson is inside one of his series
  const usable = o => o && o.video && (!o.gone || o.alt);
  const urlOf = o => !o.alt ? ytUrl(o.video)
    : `https://www.youtube.com/watch?v=${o.alt.v}` + (o.alt.list ? `&list=${o.alt.list}&index=${o.alt.index}` : "");
  const noteOf = o => !o.alt ? "" : o.alt.list
    ? "Ανοίγει στο σημείο του μαθήματος μέσα στη μεγάλη σειρά" + (o.gone ? " (η αρχική playlist διαγράφηκε)" : "")
    : "Η αρχική playlist διαγράφηκε· ανοίγει το βίντεο";
  const video = (o, label) => !o.video ? ""
    : !usable(o) ? `<span class="gone" title="Η playlist και τα βίντεό της δεν υπάρχουν πια στο YouTube">δεν υπάρχει πια</span>`
    : yt(o.video, label, o.count, urlOf(o), noteOf(o)) + st(o.video);

  const rowIds = r => [r, r.test, r.cards].filter(usable).map(o => o.video);
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
      <div class="bar-label">${w}/${n} είδα${r ? ` · ${r} για επανάληψη` : ""}</div>`;
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

  // ---------------------------------------------------------------- views
  function viewHome() {
    const card = c => `<a class="card" href="#${c.slug}"><h3>${esc(c.code)}</h3>
      <p>${c.sections.length ? `${c.sections.length} ενότητες · ` : ""}${extraFor(c.code).length} playlists εκτός psounis.gr</p>${progress(courseIds(c))}</a>`;
    const reviews = allItems().filter(x => status[x.id] === "r");
    main.innerHTML = `
      <h1>Οι playlists του Δ. Ψούνη για τα μαθήματα του ΕΑΠ</h1>
      <p class="sub">Η δομή των ΠΛΗ10/20/30 είναι ίδια με το <a href="https://psounis.gr/" target="_blank" rel="noopener">psounis.gr</a>,
        συν ${D.series.reduce((n, s) => n + s.playlists.length, 0)} playlists του καναλιού για τα ίδια μαθήματα (και το ΠΛΗ31) που δεν εμφανίζονται εκεί.
        Σημειώστε <b>✓ Είδα</b> ή <b>↻ Επανάληψη</b> σε κάθε playlist.</p>
      ${reviews.length ? `<h2>Για επανάληψη</h2><div class="table-wrap list">${reviews.map(itemRow).join("")}</div>` : ""}
      <h2>Μαθήματα</h2>
      <div class="cards">${COURSES.map(card).join("")}</div>`;
  }

  function viewCourse(c) {
    const cols = 5, extra = extraFor(c.code);
    let body = "";
    c.sections.forEach(s => {
      const rows = s.rows.filter(r => keep(rowIds(r)));
      if (!rows.length && filter !== "all") return;
      body += `<tr class="chapter"><td class="ch" colspan="${cols}">${esc(s.title || "—")}${s.typologio ? `<span class="typ">Τυπολόγιο: ${pdf(s.typologio)}</span>` : ""}${
        whole(s.all, "όλη η ενότητα σε μία playlist")}</td></tr>`;
      rows.forEach(r => {
        const ids = rowIds(r);
        const sub = (o, label) => o ? `<div class="cell"><span class="name">${esc(o.name)}</span>${pdf(o.pdf)}${pdf(o.sol, "Λύσεις")}${video(o, "Βίντεο")}</div>` : "";
        body += `<tr class="${rowClass(ids)}">
          <td class="lesson">${esc(r.lesson)}</td>
          <td data-h="Σημειώσεις" class="${r.pdf || r.pdf4 ? "" : "empty-cell"}"><div class="cell">${pdf(r.pdf)}${pdf(r.pdf4, "4 σε 1")}</div></td>
          <td data-h="Βίντεο" class="${r.video ? "" : "empty-cell"}"><div class="cell">${video(r, "Playlist")}</div></td>
          <td data-h="Τεστ" class="${r.test ? "" : "empty-cell"}">${sub(r.test)}</td>
          <td data-h="Κάρτες" class="${r.cards ? "" : "empty-cell"}">${sub(r.cards)}</td></tr>`;
      });
    });
    if (!c.sections.length) {
      main.innerHTML = `<h1>${esc(c.code)}</h1>
        <p class="sub">Δεν υπάρχει σελίδα στο psounis.gr· αυτές είναι οι ${extra.length} playlists του καναλιού για το μάθημα.</p>
        ${filterBar(courseIds(c))}${seriesList(extra)}`;
      return;
    }
    main.innerHTML = `
      <h1>${esc(c.code)}</h1>
      <p class="sub">Όπως στο <a href="https://psounis.gr/${c.slug}.html" target="_blank" rel="noopener">psounis.gr/${c.slug}</a>,
        με δωρεάν PDF από το GitHub αντί για slideshare.${extra.length ? ` <a href="#${c.slug}" data-jump="extra">${extra.length} playlists με βίντεο εκτός πίνακα ↓</a>` : ""}</p>
      ${c.all ? `<p class="sub">${whole(c.all, "πολλές ενότητες σε μία playlist")}</p>` : ""}
      ${filterBar(courseIds(c))}
      <div class="table-wrap"><table>
        <thead><tr><th>Μάθημα</th><th>Σημειώσεις</th><th>Βίντεο</th><th>Τεστ</th><th>Κάρτες</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${cols}" class="empty">Τίποτα εδώ με αυτό το φίλτρο.</td></tr>`}</tbody>
      </table></div>
      ${extra.length ? `<h2 id="extra">Επιπλέον playlists ${esc(c.code)} στο κανάλι <span class="badge">βίντεο που δεν είναι στον πίνακα</span></h2>
        ${seriesList(extra)}` : ""}`;
  }

  // series on the channel whose videos are all already in the table above: just a "play it all in one go" link
  const whole = (list, label) => list?.length ? `<span class="typ whole">▶ ${label}: ${list.map(a =>
    `<a href="${ytUrl(a.id)}" target="_blank" rel="noopener">${esc(a.title)}${a.count ? ` (${a.count})` : ""}</a>`).join(" · ")}</span>` : "";

  function seriesList(pls) {
    const shown = pls.filter(p => keep([p.id]));
    if (!shown.length) return `<div class="table-wrap"><div class="empty">Τίποτα εδώ με αυτό το φίλτρο.</div></div>`;
    let html = "", last = null;
    shown.forEach(p => {
      if (p.kind !== last) { html += `<div class="group">${KIND[p.kind] || p.kind}</div>`; last = p.kind; }
      html += itemRow(p);
    });
    return `<div class="table-wrap list">${html}</div>`;
  }

  function itemRow(p) {
    const cls = status[p.id] === "w" ? "done" : status[p.id] === "r" ? "rev" : "";
    return `<div class="item ${cls}">${yt(p.id, p.title, p.count, p.url)}${p.new != null && p.new < p.count ? `<span class="kind" title="Τα υπόλοιπα βίντεο της playlist είναι ήδη στον πίνακα">${p.new} νέα</span>` : ""}${
      p.where ? `<span class="kind">${esc(p.where)}</span>` : ""}${st(p.id)}</div>`;
  }

  // every trackable playlist, with where it lives (for search + review list)
  let _all;
  function allItems() {
    if (_all) return _all;
    const map = new Map();
    D.courses.forEach(c => c.sections.forEach(s => s.rows.forEach(r => {
      const add = (o, title) => usable(o) && !map.has(o.video) &&
        map.set(o.video, { id: o.video, title, count: o.count, url: urlOf(o), where: `${c.code} · ${s.title}`, text: `${s.title} ${r.lesson} ${title}` });
      add(r, r.lesson);
      add(r.test, `${r.lesson} — ${r.test?.name}`);
      add(r.cards, `${r.lesson} — ${r.cards?.name}`);
    })));
    D.series.forEach(s => s.playlists.forEach(p => !map.has(p.id) && map.set(p.id, { ...p, where: s.name, text: `${s.name} ${p.title}` })));
    return (_all = [...map.values()]);
  }

  function viewSearch(q) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const hits = allItems().filter(x => { const t = norm(x.text); return words.every(w => t.includes(w)); });
    main.innerHTML = `<h1>Αναζήτηση</h1><p class="sub">${hits.length} αποτελέσματα για «${esc(q)}»</p>
      <div class="table-wrap list">${hits.slice(0, 300).map(itemRow).join("") || '<div class="empty">Κανένα αποτέλεσμα.</div>'}</div>`;
  }

  // ---------------------------------------------------------------- routing
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
    const h = location.hash.slice(1);
    tabs(q ? null : h);
    const c = COURSES.find(x => x.slug === h);
    q ? viewSearch(q) : c ? viewCourse(c) : viewHome();
    if (keepScroll) scrollTo(0, y);
  }

  // ---------------------------------------------------------------- events
  main.addEventListener("click", e => {
    const b = e.target.closest(".st button");
    if (b) { setStatus(b.parentElement.dataset.id, b.dataset.s); return render(true); }
    const j = e.target.closest("[data-jump]");  // in-page jump without touching the #route
    if (j) { e.preventDefault(); return document.getElementById(j.dataset.jump)?.scrollIntoView({ behavior: "smooth" }); }
    const f = e.target.closest("#filter button");
    if (f) { filter = f.dataset.f; try { sessionStorage.setItem("ps-filter", filter); } catch (err) {} render(true); }
  });
  addEventListener("hashchange", () => { $("#search").value = ""; render(); scrollTo(0, 0); });
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
  $("#generated").textContent = `Δεδομένα: ${D.generated} · ${D.total} playlists.`;
  render();
})();
