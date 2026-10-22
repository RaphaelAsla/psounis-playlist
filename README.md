# Ψούνης Playlists — ΕΑΠ

An unofficial static index of [Dimitris Psounis's YouTube](https://www.youtube.com/@psounis) playlists for the
**ΕΑΠ Πληροφορική courses**. Made by students for students.

[psounis.gr](https://psounis.gr/) lists the ΠΛΗ10 / ΠΛΗ20 / ΠΛΗ30 lessons. The channel has more playlists for those
courses that the site doesn't link, including full series, extra cards and tests, and exam walkthroughs, as well as the ΠΛΗ31 (Τεχνητή Νοημοσύνη) series.
This site keeps his layout for each course (Μάθημα · Σημειώσεις · Βίντεο · Τεστ · Κάρτες), adds the missing ΕΑΠ playlists, and lets you:

- mark each playlist **✓ Είδα** (watched) or **↻ Επανάληψη** (review again);
- see your progress per course;
- filter by "Δεν έχω δει" (not seen yet) or "Επανάληψη" (review);
- search everything, without needing accents;
- use free PDF links to [github.com/psounis/notes](https://github.com/psounis/notes) instead of the old slideshare links, which are now paywalled;
- switch between light and dark themes;
- export and import your progress as JSON.

Progress is stored only in your browser (`localStorage`). There is no backend, no tracking and no build step.
The channel's non-ΕΑΠ series (Java, Spring, web, Python, …) are deliberately left out.

## Hosting (GitHub Pages)

Settings → Pages → *Deploy from a branch* → `main` / `(root)`. That's it.
`index.html` loads `data.js` with a plain `<script>` tag, so the site also works when you open `index.html` straight from disk.

## Updating the data

```bash
pip install beautifulsoup4 yt-dlp
python scripts/update.py
```

The script reads three sources:

1. the psounis.gr course pages, for the table structure;
2. the `psounis/notes` repo tree, for the PDFs;
3. the channel's playlists, collected with yt-dlp, YouTube's internal browse API (which also returns the "course" playlists
   that yt-dlp skips) and searches inside the channel.

YouTube sometimes returns partial lists, so the crawl adds to `scripts/.playlists-cache.json` instead of replacing it.
`--reuse` skips the crawl entirely. The script then rewrites `data.js`: playlists that psounis.gr already links stay in the
course tables, and the other ΕΑΠ playlists are assigned to a course by their title (see `SERIES_ALIASES`).

## Disclaimer

Not affiliated with Δ. Ψούνης or the ΕΑΠ. All videos and notes belong to their author. This page only links to them.
If you find his work useful, support him through his channel and [psounis.gr](https://psounis.gr/).
