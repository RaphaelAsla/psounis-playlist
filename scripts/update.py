#!/usr/bin/env python3
"""Rebuild data.js for the site.

Sources (all public):
  1. psounis.gr course pages (ΠΛΗ10/20/30): lesson tables -> exact structure of his site
  2. github.com/psounis/notes: free PDF copies (slideshare links became paid in 2021)
  3. YouTube channel @psounis: every playlist, via
       - yt-dlp --flat-playlist on the Playlists tab (regular playlists)
       - InnerTube browse of the Playlists tab (adds "course" playlists yt-dlp skips)
       - InnerTube channel search for many queries (adds public playlists hidden from the tab)

Usage:  python scripts/update.py [--reuse]   (needs: beautifulsoup4, yt-dlp on PATH;
                                             --reuse = use the cached playlist crawl)
"""
import json, re, subprocess, sys, time, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CHANNEL = "UC985YzcBf8iUWGyEMJ10v-Q"
SITE = "http://psounis.gr/"
NOTES_RAW = "https://raw.githubusercontent.com/psounis/notes/master/"
NOTES_TREE = "https://api.github.com/repos/psounis/notes/git/trees/HEAD?recursive=1"
API = "https://www.youtube.com/youtubei/v1/browse?prettyPrint=false"
CTX = {"client": {"clientName": "WEB", "clientVersion": "2.20260101.00.00", "hl": "el", "gl": "GR"}}
HDR = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Cookie": "SOCS=CAI"}
SEARCH_QUERIES = ["ΠΛΗ10", "ΠΛΗ20", "ΠΛΗ30", "ΠΛΗ31", "ΤΕΣΤ", "ΚΑΡΤΕΣ", "ΔΙΑΓΩΝΙΣΜΑ", "ΕΠΑΝΑΛΗΨΗ", "ΕΞΕΤΑΣΕΙΣ",
                  "ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ", "ΓΛΩΣΣΑ C", "ΑΛΓΟΡΙΘΜΟΙ", "ΔΟΜΕΣ ΔΕΔΟΜΕΝΩΝ", "ΛΟΓΙΚΗ", "ΓΡΑΦΩΝ"]


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def get(url, data=None, headers=None):
    for attempt in range(5):
        time.sleep(0.5 + attempt * 3)
        try:
            req = urllib.request.Request(url, data=data, headers=headers or {"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:  # rate limits / resets: back off
            log("  retry", attempt + 1, url[:60], type(e).__name__)
    raise RuntimeError("failed: " + url)


def list_id(href, key="list"):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(href).query)
    return q.get(key, [None])[0]


# ---------------------------------------------------------------- 1+2. psounis.gr + GitHub PDFs
def table_grid(soup, width=11):
    """Yield each <tr> as a list of `width` cells (td or None), resolving rowspan/colspan."""
    pending = {}  # column -> rows still covered by a rowspan from above
    for tr in soup.find_all("tr"):
        out, it = [], iter(tr.find_all(["td", "th"]))
        while len(out) < width:
            col = len(out)
            if pending.get(col):
                pending[col] -= 1; out.append(None); continue
            td = next(it, None)
            if td is None:
                break
            cs, rs = int(td.get("colspan", 1)), int(td.get("rowspan", 1))
            for k in range(cs):
                out.append(td if k == 0 else None)
                if rs > 1:
                    pending[col + k] = rs - 1
        yield tr, out + [None] * (width - len(out))


AUTO_GROUPS = [  # lesson-title prefix -> section for courses whose page has no heading there (ΠΛΗ10)
    (r"^C Μάθημα", "C", "Γλώσσα C"), (r"^Αλγόριθμοι C", "algc", "Αλγόριθμοι σε C"),
    (r"^Δομές C", "dsc", "Δομές Δεδομένων σε C"), (r"^Επανάληψη \d", "rev", "Επανάληψη & Διαγωνίσματα"),
]


def scrape_site():
    tree = json.loads(get(NOTES_TREE))
    notes = {x["path"] for x in tree["tree"] if x["type"] == "blob"}

    def pdf(path):
        return NOTES_RAW + urllib.parse.quote(path) if path in notes else None

    def text(td):
        return td.get_text(" ", strip=True) if td is not None else ""

    def yt(*tds):
        """{"video": playlist id, "v": first video id} of the first YouTube link in these cells."""
        href = next((a.get("href", "") for td in tds if td is not None
                     for a in td.find_all("a") if "youtube" in a.get("href", "")), "")
        return {"video": list_id(href), "v": list_id(href, "v")} if href else {"video": None}

    courses = []
    for code in ("10", "20", "30"):
        p = f"plh{code}/plh{code}"
        soup = BeautifulSoup(get(f"{SITE}plh{code}.html").decode("utf-8", "replace"), "html.parser")
        course = {"code": f"ΠΛΗ{code}", "slug": f"plh{code}", "sections": []}

        def new_section(title, group=None):
            s = {"title": title, "group": group, "rows": []}
            course["sections"].append(s)
            return s

        section = None
        for tr, c in table_grid(soup):
            if c[0] is not None and int(c[0].get("colspan", 1)) >= 11:  # chapter heading (+ formula sheet)
                section = new_section(re.sub(r"\s*\(\s*Τυπολόγιο.*$", "", text(c[0])).strip())
                continue
            lesson = text(c[0])
            if lesson == "Μάθημα" or not any(text(x) or (x is not None and x.find("a")) for x in c):
                continue
            num = re.match(r"(\d+)\.(\d+)", lesson)
            test_name = text(c[4])
            # which logical group this row belongs to; a change of group with no heading starts a new section
            if num:
                group, title = num.group(1), f"Ενότητα {num.group(1)}"
            elif re.match(r"^\d{4}\s*[ΑΒAB]$", test_name):
                group, title = "exams", "Θέματα Εξετάσεων (λυμένα σε βίντεο)"
            elif not lesson and re.match(r"Τεστ", test_name):
                group, title = "tests", "Επιπλέον Τεστ"
            else:
                group, title = next(((g, t) for rx, g, t in AUTO_GROUPS if re.match(rx, lesson)), (None, None))
            if section is None or (group and section["group"] not in (None, group) and section["rows"]):
                section = new_section(title or "")
            if group and section["group"] is None:
                section["group"] = group
            row = {"lesson": lesson, **yt(c[3])}
            if test_name:
                row["test"] = {"name": test_name, **yt(c[4], c[5], c[6])}
                t = re.match(r"Τεστ\s*(\d+)$", test_name)
                d = re.match(r"Επ\.\s*Διαγ\.\s*(\d+)", test_name)
                if t:
                    row["test"]["pdf"] = pdf(f"{p}_test_{t.group(1)}.pdf")
                elif d:
                    row["test"]["pdf"] = pdf(f"{p}_epan_diagonisma{d.group(1)}.pdf")
                    row["test"]["sol"] = pdf(f"{p}_epan_diagonisma{d.group(1)}_liseis.pdf")
            if text(c[7]):
                row["cards"] = {"name": "Κάρτες " + text(c[7]).rstrip(":"), **yt(c[10], c[9])}
            if num:
                a, b = num.groups()
                row["pdf"] = pdf(f"{p}_lesson_{a}_{b}.pdf")
                row["pdf4"] = pdf(f"{p}_lesson_{a}_{b}(4in1).pdf") or pdf(f"{p}_lesson_{a}_{b}(4sl).pdf")
                if "cards" in row:
                    row["cards"]["pdf"] = pdf(f"{p}.{a}.{b}.card.pdf")
            section["rows"].append(row)
        # formula sheets: chapter number = first numbered lesson of the section (or of the next one)
        secs = course["sections"]
        for i, s in enumerate(secs):
            ch = next((m.group(1) for t in secs[i:] for r in t["rows"] for m in [re.match(r"(\d+)\.", r["lesson"])] if m), None)
            if ch and s["group"] in (None, ch):
                s["typologio"] = pdf(f"{p}.{ch}.typologio.pdf")
                if "Χάρτης" in s["title"]:
                    s["typologio"] = pdf(f"{p}.{ch}.xartis.pdf")
        for s in secs:
            s.pop("group", None)
        courses.append(course)
        log("site", course["code"], len(secs), "sections", sum(len(s["rows"]) for s in secs), "rows")
    return courses


# ---------------------------------------------------------------- 3. every channel playlist
def innertube(body):
    return json.loads(get(API, json.dumps({"context": CTX, **body}).encode(), HDR))


def walk(o, out, conts):
    if isinstance(o, dict):
        if "lockupViewModel" in o:
            l = o["lockupViewModel"]
            s = json.dumps(l, ensure_ascii=False)
            m = re.search(r'"text":\s*"(\d[\d.,]*)\s*(?:βίντεο|videos?|μαθήματα|lessons?)"', s)
            title = l.get("metadata", {}).get("lockupMetadataViewModel", {}).get("title", {}).get("content", "")
            if l.get("contentId") and "PLAYLIST" in l.get("contentType", "") or "COURSE" in l.get("contentType", ""):
                out[l["contentId"]] = {"id": l["contentId"], "title": title,
                                       "count": int(re.sub(r"\D", "", m.group(1))) if m else None}
            return
        if "playlistRenderer" in o:
            p = o["playlistRenderer"]
            vc = str(p.get("videoCount", ""))
            out[p["playlistId"]] = {"id": p["playlistId"], "title": p.get("title", {}).get("simpleText", ""),
                                    "count": int(vc) if vc.isdigit() else None}
            return
        if "continuationCommand" in o:
            conts.append(o["continuationCommand"]["token"])
        for v in o.values():
            walk(v, out, conts)
    elif isinstance(o, list):
        for v in o:
            walk(v, out, conts)


def crawl(first_body, out, max_pages=60):
    conts, seen = [], set()
    walk(innertube(first_body), out, conts)
    while conts and len(seen) < max_pages:
        t = conts.pop(0)
        if t not in seen:
            seen.add(t); walk(innertube({"continuation": t}), out, conts)


def channel_playlists(extra_ids):
    found = {}
    # a) yt-dlp: regular playlists on the Playlists tab
    try:
        r = subprocess.run(["yt-dlp", "--flat-playlist", "-J", "--extractor-retries", "5", "--sleep-requests", "1",
                            "https://www.youtube.com/@psounis/playlists"],
                           capture_output=True, text=True, encoding="utf-8", timeout=900)
        for e in json.loads(r.stdout).get("entries", []):
            found[e["id"]] = {"id": e["id"], "title": e.get("title", ""), "count": None}
        log("yt-dlp:", len(found))
    except Exception as e:
        log("yt-dlp failed:", e)
    # b) InnerTube Playlists tab (adds course-type playlists)
    crawl({"browseId": CHANNEL, "params": "EglwbGF5bGlzdHMgAQ=="}, found); log("+tab:", len(found))
    # c) channel search (adds public playlists not listed on the tab)
    for q in SEARCH_QUERIES:
        crawl({"browseId": CHANNEL, "params": "EgZzZWFyY2jyBgQKAjIA", "query": q}, found, max_pages=25)
        log("+search", q, len(found))
    for pid in extra_ids - found.keys():  # linked from psounis.gr but found nowhere else
        found[pid] = {"id": pid, "title": "", "count": None}
    return found


def fill_missing(pls, linked):
    """Fetch title / video count for the ΕΑΠ playlists that the listings returned without them."""
    todo = [p for p in pls.values() if (p["id"] in linked or series_of(p["title"]))
            and (not p["title"] or p["count"] is None) and not p.get("gone")]
    log("filling", len(todo), "playlists")
    for p in todo:
        try:
            s = json.dumps(innertube({"browseId": "VL" + p["id"]}), ensure_ascii=False)
            if not p["title"]:
                m = re.search(r'"playlistMetadataRenderer": \{"title": "([^"]*)"', s)
                p["title"] = m.group(1) if m else ""
            m = re.search(r'"content": "(\d[\d.,]*) (?:βίντεο|videos?)"', s)
            if m:
                p["count"] = int(re.sub(r"\D", "", m.group(1)))
            elif '"alertRenderer": {"type": "ERROR"' in s:  # "Η λίστα αναπαραγωγής δεν υπάρχει"
                p["gone"] = True
        except Exception as e:
            log("  failed", p["id"], e)


# ---------------------------------------------------------------- grouping of the rest into series
SERIES_ALIASES = [  # (regex on title, series name); first match wins, so course rules come first
    (r"ΠΛΗ31|ΤΕΧΝΗΤΗ ΝΟΗΜΟΣΥΝΗ|PROLOG", "ΠΛΗ31"),
    (r"ΠΛΗ10|ΣΥΣΤΗΜΑΤΑ ΑΡΙΘΜΗΣΗΣ|ΛΟΓΙΚΕΣ ΠΥΛΕΣ|ΨΕΥΔΟΓΛΩΣΣΑ|ΕΙΣΑΓΩΓΗ ΣΤΟΥΣ Η/Υ", "ΠΛΗ10"),
    (r"ΠΛΗ20|ΣΥΝΔΥΑΣΤΙΚ|ΠΡΟΤΑΣΙΑΚ|ΚΑΤΗΓΟΡΗΜΑΤΙΚ|ΓΡΑΦΩΝ|ΓΕΝΝΗΤΡΙΕΣ|ΜΑΘΗΜΑΤΙΚΗ ΛΟΓΙΚΗ", "ΠΛΗ20"),
    (r"ΠΛΗ30|ΠΟΛΥΠΛΟΚΟΤΗΤ|ΘΕΩΡΙΑ ΥΠΟΛΟΓΙΣΜΟΥ|ΘΕΩΡΙΑΣ ΥΠΟΛΟΓΙΣΜΟΥ|ΜΑΘΗΜΑΤΙΚΑ ΑΛΓΟΡΙΘΜΩΝ|ΣΧΕΔΙΑΣΗ ΑΛΓΟΡΙΘΜΩΝ", "ΠΛΗ30"),
    (r"C\+\+", None),  # his C series belongs to ΠΛΗ10 (see psounis.gr/plh10); C++ does not
    (r"ΓΛΩΣΣΑ C\b|ΑΛΓΟΡΙΘΜΟΙ ΣΕ C\b|ΔΟΜΕΣ ΔΕΔΟΜΕΝΩΝ ΣΕ C\b", "ΠΛΗ10"),
]  # everything else on the channel (Java, Spring, web, Python, ...) is not ΕΑΠ material and is left out
COURSES = ["ΠΛΗ10", "ΠΛΗ20", "ΠΛΗ30", "ΠΛΗ31"]
LESSON = r"[MΜ][AΑ]Θ[HΗ][MΜ][AΑ]"  # titles mix Greek and Latin look-alike letters


def series_of(title):
    for rx, name in SERIES_ALIASES:
        if re.search(rx, title, re.I):
            return name
    return None


def kind_of(title):
    t = title.upper()
    if "ΚΑΡΤ" in t: return "cards"
    if re.search(r"ΤΕΣΤ|TEST", t): return "test"
    if re.search(LESSON + r"\s*\d", t): return "lesson"
    if re.search(r"ΔΙΑΓΩΝΙΣΜΑ|ΕΠΑΝΑΛΗΨΗ|ΕΞΕΤΑΣ|ΘΕΜΑΤΑ \d{4}|\b20\d\d[ΑΒAB]\b", t): return "exam"
    if "ΑΣΚΗΣΕΙΣ" in t: return "exercises"
    return "collection"


def lesson_key(title):
    m = re.search(LESSON + r"\s*(\d+(?:\.\d+)*)", title, re.I) or re.search(r"(?:ΤΕΣΤ|TEST|ΚΑΡΤΕΣ|ΔΙΑΓΩΝΙΣΜΑ)\s*(\d+(?:\.\d+)*)", title, re.I)
    return tuple(int(x) for x in m.group(1).split(".")) if m else None


def playlist_videos(pid):
    """[(video id, title)] of a playlist, via yt-dlp."""
    r = subprocess.run(["yt-dlp", "--flat-playlist", "-J", "--extractor-retries", "5",
                        f"https://www.youtube.com/playlist?list={pid}"],
                       capture_output=True, text=True, encoding="utf-8", timeout=300)
    return [(e["id"], e.get("title") or "") for e in (json.loads(r.stdout or "{}").get("entries") or [])]


def fetch_videos(pls, ids):
    """Store the video ids of each playlist in pls[id]["videos"] (cached; only missing ones are fetched)."""
    from concurrent.futures import ThreadPoolExecutor
    todo = [i for i in dict.fromkeys(ids) if i in pls and "videos" not in pls[i] and not pls[i].get("gone")]
    log("fetching video lists of", len(todo), "playlists")

    def one(pid):
        try:
            return pid, [v for v, _ in playlist_videos(pid)]
        except Exception as e:
            log("  videos failed", pid, e)
            return pid, None
    with ThreadPoolExecutor(4) as ex:
        for pid, vids in ex.map(one, todo):
            if vids:  # an empty answer is usually throttling: try again next run
                pls[pid]["videos"] = vids


def relink_gone(site, candidates):
    """Many deleted per-lesson playlists were merged into a big series (e.g. ΠΛΗ10 2.x -> ΨΕΥΔΟΓΛΩΣΣΑ).
    psounis.gr links point at the playlist's first video, which still exists: find the live playlist
    that contains it and link into that, so the lesson still plays in order."""
    links = [o for c in site for s in c["sections"] for r in s["rows"] for o in (r, r.get("test") or {}, r.get("cards") or {})]
    gone = [o for o in links if o.get("gone") and o.get("v")]
    for o in links:  # the first-video id is only needed for deleted playlists
        if not o.get("gone"):
            o.pop("v", None)
    if not gone:
        return
    where = {}  # video id -> (playlist id, 1-based index, all entries of that playlist)
    for p in sorted(candidates, key=lambda p: -(p["count"] or 0)):  # prefer the big series
        try:
            vids = playlist_videos(p["id"])
        except Exception as e:
            log("  videos failed", p["id"], e); continue
        for i, (vid, _) in enumerate(vids):
            where.setdefault(vid, (p["id"], i + 1, vids))
        if all(o["v"] in where for o in gone):
            break
    for o in gone:
        if o["v"] not in where:  # not in any playlist any more: link the single video, if it still exists
            try:
                get(f"https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v={o['v']}")
                o["alt"] = {"v": o["v"]}
            except RuntimeError:
                pass
            continue
        pid, idx, vids = where[o["v"]]
        # the lesson's videos are the consecutive ones that share the first video's "ΜΑΘΗΜΑ x.y" / "ΤΕΣΤ n" tag
        tag = re.search(LESSON + r"\s*\d+(?:\.\d+)*|ΤΕΣΤ\s*\d+", vids[idx - 1][1], re.I)
        n = 1
        while tag and idx - 1 + n < len(vids) and tag.group(0).upper() in vids[idx - 1 + n][1].upper():
            n += 1
        o["alt"] = {"v": o["v"], "list": pid, "index": idx}
        o["count"] = n if tag else None
    log("deleted playlists:", len(gone), "-> in a live series:", sum("list" in o.get("alt", {}) for o in gone),
        "/ single video:", sum(o.get("alt", {}).keys() == {"v"} for o in gone), "/ nothing left:", sum("alt" not in o for o in gone))


def site_videos(course, pls):
    """video id -> (section, playlist id) for every video reachable from a course's psounis.gr table."""
    where = {}
    for s in course["sections"]:
        for r in s["rows"]:
            for o in (r, r.get("test") or {}, r.get("cards") or {}):
                a = o.get("alt") or {}
                if not o.get("video"):
                    continue
                if "list" in a:  # lesson linked into a bigger series: its stretch of that series
                    vids, owner = pls.get(a["list"], {}).get("videos", [])[a["index"] - 1:a["index"] - 1 + (o.get("count") or 1)], o["video"]
                elif not o.get("gone"):
                    vids, owner = pls.get(o["video"], {}).get("videos") or [], o["video"]
                else:
                    vids, owner = [a.get("v")], o["video"]
                for v in vids:
                    where.setdefault(v, (s, owner))
    return where


def course_of(p, site):
    return next((c for c in site if c["code"] == series_of(p["title"])), None)


def fill_gap(p, site):
    """True if this extra playlist fills an empty cell of his table (e.g. "ΠΛΗ30 ΤΕΣΤ 6", whose cell has no video)."""
    course, k = course_of(p, site), lesson_key(p["title"])
    if course is None:
        return False
    rows = [r for s in course["sections"] for r in s["rows"]]
    if kind_of(p["title"]) == "test" and k:
        cells = [r["test"] for r in rows if (r.get("test") or {}).get("name", "").upper() == f"ΤΕΣΤ {k[0]}"]
    elif kind_of(p["title"]) == "cards" and re.search(r"ΜΑΘΗΜΑΤΟΣ\s*(\d+\.\d+)", p["title"]):
        n = re.search(r"ΜΑΘΗΜΑΤΟΣ\s*(\d+\.\d+)", p["title"]).group(1)  # "ΠΛΗ20 ΚΑΡΤΕΣ ΜΑΘΗΜΑΤΟΣ 1.1"
        cells = [r["cards"] for r in rows if r.get("cards") and r["lesson"].startswith(n + ":")]
    else:
        return False
    for o in cells:
        if not usable_link(o):
            o.update(video=p["id"], count=p["count"])
            o.pop("gone", None); o.pop("alt", None)
            return True
    return False


SERIES_FOR_LESSONS = {"C Μάθημα": "ΓΛΩΣΣΑ C", "Αλγόριθμοι C": "ΑΛΓΟΡΙΘΜΟΙ ΣΕ C", "Δομές C": "ΔΟΜΕΣ ΔΕΔΟΜΕΝΩΝ ΣΕ C"}


def fill_lessons_from_series(site, extras):
    """Some lesson rows of his ΠΛΗ10 table have no video, but the lesson is inside one of his big C series
    (e.g. "C Μάθημα 5" = videos 26-37 of ΓΛΩΣΣΑ C): link into the series at that point."""
    by_title, videos = {p["title"]: p["id"] for p in extras}, {}
    for c in site:
        for s in c["sections"]:
            for r in s["rows"]:
                m = re.match(r"(C Μάθημα|Αλγόριθμοι C|Δομές C)\s*(\d+)", r["lesson"])
                if r.get("video") or not m or SERIES_FOR_LESSONS[m.group(1)] not in by_title:
                    continue
                pid = by_title[SERIES_FOR_LESSONS[m.group(1)]]
                vids = videos.setdefault(pid, playlist_videos(pid))
                idx = [i for i, (_, t) in enumerate(vids) if re.search(LESSON + r"\s*" + m.group(2) + r"(?![\d.])", t)]
                if idx:  # synthetic id (playlist@index) so it can still be marked watched
                    r.update(video=f"{pid}@{idx[0] + 1}", count=len(idx),
                             alt={"v": vids[idx[0]][0], "list": pid, "index": idx[0] + 1})
                    log("  filled", r["lesson"], "from", SERIES_FOR_LESSONS[m.group(1)], "videos", idx[0] + 1, "-", idx[-1] + 1)


_where = {}


def merged_into_table(p, site, pls):
    """Compare an extra playlist's videos with the course table. True when they are already there (so it is not
    listed as an extra): a merged "whole chapter" series becomes a link on that chapter (or on the course, if it
    spans chapters); a copy of a single lesson is dropped. Otherwise p["new"] = videos not in the table."""
    course = course_of(p, site)
    vids = pls.get(p["id"], {}).get("videos")
    if course is None or not vids:  # ΠΛΗ31 has no table to compare with
        return False
    where = _where.setdefault(course["code"], site_videos(course, pls))
    hits = [where[v] for v in vids if v in where]
    if len(hits) < 0.9 * len(vids):
        p["new"] = len(vids) - len(hits)
        return False
    if len({owner for _, owner in hits}) == 1:  # just a copy of one lesson's playlist
        return True
    link = {"id": p["id"], "title": p["title"], "count": p["count"]}
    secs = defaultdict(int)
    for s, _ in hits:
        secs[id(s)] += 1
    top = max(secs.values())
    if top >= 0.9 * len(vids):
        s = next(s for s, _ in hits if secs[id(s)] == top)
        s.setdefault("all", []).append(link)
    else:
        course.setdefault("all", []).append(link)
    return True


def usable_link(o):
    return bool(o.get("video")) and (not o.get("gone") or bool(o.get("alt")))


def main():
    site = scrape_site()
    linked = {v for c in site for s in c["sections"] for r in s["rows"]
              for v in [r.get("video"), (r.get("test") or {}).get("video"), (r.get("cards") or {}).get("video")] if v}
    cache = ROOT / "scripts" / ".playlists-cache.json"
    pls = json.loads(cache.read_text(encoding="utf-8")) if cache.exists() else {}
    if "--reuse" not in sys.argv:  # --reuse skips the slow YouTube crawl (for tweaking the output)
        # YouTube throttles and sometimes returns partial lists, so the crawl is cumulative
        pls.update({k: v for k, v in channel_playlists(linked).items() if v["title"] or k not in pls})
    for pid in linked - pls.keys():
        pls[pid] = {"id": pid, "title": "", "count": None}
    fill_missing(pls, linked)
    cache.write_text(json.dumps(pls, ensure_ascii=False), encoding="utf-8")
    log("total playlists:", len(pls))
    for c in site:  # attach titles/counts to site rows
        for s in c["sections"]:
            for r in s["rows"]:
                for obj in (r, r.get("test") or {}, r.get("cards") or {}):
                    if obj.get("video") in pls:
                        obj["count"] = pls[obj["video"]]["count"]
                        if pls[obj["video"]].get("gone"):  # psounis.gr still links playlists that were deleted
                            obj["gone"] = True
    rest = [p for pid, p in pls.items() if pid not in linked and p["title"] and not p.get("gone")]
    relink_gone(site, [p for p in rest if series_of(p["title"])])
    links = [o for c in site for s in c["sections"] for r in s["rows"] for o in (r, r.get("test") or {}, r.get("cards") or {})]
    fetch_videos(pls, [o["video"] for o in links if o.get("video") and not o.get("gone")]
                 + [o["alt"]["list"] for o in links if "list" in o.get("alt", {})]
                 + [p["id"] for p in rest if series_of(p["title"])])
    cache.write_text(json.dumps(pls, ensure_ascii=False), encoding="utf-8")
    rest = [p for p in rest if series_of(p["title"]) and not fill_gap(p, site)]
    fill_lessons_from_series(site, rest)
    fetch_videos(pls, [o["video"] for o in links if o.get("video") and not o.get("gone")])  # gap fillers
    rest = [p for p in rest if not merged_into_table(p, site, pls)]
    groups = defaultdict(list)
    for p in rest:
        name = series_of(p["title"])
        if name:
            p["kind"] = kind_of(p["title"]); p["key"] = lesson_key(p["title"])
            groups[name].append(p)
    series = []
    for name in COURSES:
        items = sorted(groups.get(name, []), key=lambda p: ({"collection": 0, "lesson": 1, "test": 2, "cards": 3, "exam": 4, "exercises": 5}[p["kind"]],
                                                            p["key"] or (999,), p["title"]))
        if items:
            series.append({"name": name, "playlists": [{k: p[k] for k in ("id", "title", "count", "kind", "new") if k in p} for p in items]})
    extra = sum(len(s["playlists"]) for s in series)
    data = {"generated": time.strftime("%Y-%m-%d"), "courses": site, "series": series,
            "total": sum(1 for pid in linked if not pls.get(pid, {}).get("gone")) + extra}
    out = ROOT / "data.js"
    out.write_text("window.PSOUNIS_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    log("wrote", out, f"{out.stat().st_size // 1024} KB;", extra, "extra ΕΑΠ playlists")


if __name__ == "__main__":
    main()
