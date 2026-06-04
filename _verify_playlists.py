#!/usr/bin/env python3
import urllib.request
import urllib.parse
import json
import re
import sys
import time
import unicodedata

INVIDIOUS = "https://invidious.materialio.us"

def norm(s):
    if not s: return ""
    n = unicodedata.normalize('NFKD', s)
    n = n.encode('ascii', 'ignore').decode('ascii')
    return n.lower().strip()

def clean_title(t):
    for _ in range(5):
        old = t
        t = re.sub(r'\s*[\(\[][^\(\)\[\]]*?(official|lyric|music\s*video|remaster|live|cover|remix|version|hd|4k|video|audio|explicit|clean|koncert|concert|festival)[^\(\)\[\]]*?[\)\]]\s*', ' ', t, flags=re.I)
        t = re.sub(r'\s*[\(\[]\s*\d{4}\s*remaster\s*[\)\]]\s*', ' ', t, flags=re.I)
        t = re.sub(r'\s*[\(\[]\s*\d{4}\s*[\)\]]\s*', ' ', t)
        t = re.sub(r'\s*[\(\[]\s*[#@][^\(\)\[\]]*?[\)\]]\s*', ' ', t)
        t = re.sub(r'\s*[\(\[]\s*(live|koncert|concert)\s*[\)\]]\s*', ' ', t, flags=re.I)
        t = re.sub(r'\s*[\(\[]\s*(spodek|opole|woodstock|festival|sopot|nysa|kielce|jarocin|opener)[^\(\)\[\]]*?[\)\]]\s*', ' ', t, flags=re.I)
        t = re.sub(r'^\s*[\(\[]\s*(official|video|audio|lyric|hd|4k)\s*[\)\]]\s*', '', t, flags=re.I)
        t = re.sub(r'\s+#\w+\s*$', ' ', t)
        if t == old:
            break
    t = re.sub(r'\s+', ' ', t).strip(' -–—')
    return t

def search(query):
    url = f"{INVIDIOUS}/api/v1/search?q={urllib.parse.quote(query)}&type=video"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            return [v for v in data if v.get('type') == 'video']
    except Exception as e:
        print(f"  ERR search '{query}': {e}", file=sys.stderr)
        return []

def oembed(video_id):
    url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return None

def best_match(videos, expected_artist_keywords, expected_title_keywords):
    if not videos:
        return None
    def score(v):
        s = 0
        title = (v.get('title') or '').lower()
        author = (v.get('author') or '').lower()
        views = v.get('viewCount', 0) or 0
        verified = v.get('authorVerified', False)
        seconds = v.get('lengthSeconds', 0) or 0
        if verified: s += 500
        for kw in expected_artist_keywords:
            if kw.lower() in author or kw.lower() in title: s += 100
        for kw in expected_title_keywords:
            if kw.lower() in title: s += 200
        if 60 < seconds < 600: s += 50
        s += min(views / 100000, 100)
        if 'live' in title or 'koncert' in title: s -= 50
        if 'karaoke' in title: s -= 500
        if 'lyrics' in title and 'official' not in title: s -= 20
        return s
    ranked = sorted(videos, key=score, reverse=True)
    return ranked[0] if ranked else None

# (search_query, artist_keywords, title_keywords, expected_filename)
SONGS = [
    # NOC (Night) - calmer/melodic
    ("Kult Arahja official", ["kult", "s.p. records", "sp records"], ["arahja"], "noc"),
    ("Kult Baranek official", ["kult", "s.p. records"], ["baranek"], "noc"),
    ("Kult Lewe dziwki w lesie official", ["kult", "s.p. records"], ["lewe dziwki"], "noc"),
    ("Kult Gdy nie ma dzieci official", ["kult", "s.p. records"], ["gdy nie ma dzieci"], "noc"),
    ("Kult Hej czy nie wiecie", ["kult", "s.p. records"], ["hej czy nie wiecie"], "noc"),
    ("Kult Polska", ["kult", "s.p. records"], ["polska"], "noc"),
    ("Kult Wiosna", ["kult", "s.p. records"], ["wiosna"], "noc"),
    ("Lady Pank Zawsze tam gdzie ty", ["lady pank", "vevo"], ["zawsze tam gdzie ty"], "noc"),
    ("Lady Pank Mniej niz zero", ["lady pank", "vevo"], ["mniej niż zero", "mniej niz zero"], "noc"),
    ("Lady Pank Tacy sami", ["lady pank", "vevo"], ["tacy sami"], "noc"),
    ("Republika Biala flaga Ciechowski", ["republika"], ["biała flaga", "biala flaga"], "noc"),
    ("Republika Odchodzac", ["republika"], ["odchodząc", "odchodzac"], "noc"),
    ("Republika Telefony", ["republika"], ["telefony"], "noc"),
    ("Dzem Whisky Riedel", ["dżem", "dzem"], ["whisky"], "noc"),
    ("Dzem Wehukul czasu", ["dżem", "dzem"], ["wehikuł czasu", "wehukul czasu"], "noc"),
    ("Dzem Czerwony jak cegla", ["dżem", "dzem"], ["czerwony jak cegła", "czerwony jak cegla"], "noc"),
    ("Budka Suflera Jolka Jolka", ["budka suflera"], ["jolka"], "noc"),
    ("Budka Suflera Czas olbrzymow", ["budka suflera"], ["czas olbrzymów", "czas olbrzymow"], "noc"),
    ("Budka Suflera Sen o Victorii", ["budka suflera"], ["sen o victorii"], "noc"),
    ("Perfect Kołysanka dla nieznajomej", ["perfect"], ["kołysanka"], "noc"),
    ("Perfect Autobiografia", ["perfect"], ["autobiografia"], "noc"),
    ("Perfect Nie pytaj o Polske", ["perfect"], ["nie pytaj o polskę", "nie pytaj o polske"], "noc"),
    ("Maanam Krakowski spleen", ["maanam"], ["krakowski spleen"], "noc"),
    ("Maanam O! Maanam", ["maanam"], ["o! maanam", "o maanam"], "noc"),

    # PORANEK (Morning) - energetic
    ("T.Love Warszawa official", ["t.love", "tlove", "t love", "warner"], ["warszawa"], "poranek"),
    ("T.Love King", ["t.love", "tlove", "t love", "warner"], ["king"], "poranek"),
    ("T.Love Ajrisz", ["t.love", "tlove", "t love", "warner"], ["ajrisz"], "poranek"),
    ("T.Love Chlopaki nie placza", ["t.love", "tlove", "t love", "warner"], ["chłopaki", "chlopaki"], "poranek"),
    ("Myslovitz Dlugosc dzwieku samotnosci", ["myslovitz"], ["długość dźwięku", "dlugosc dzwieku"], "poranek"),
    ("Myslovitz Peggy Brown", ["myslovitz"], ["peggy brown"], "poranek"),
    ("Myslovitz Sprzedawcy marzen", ["myslovitz"], ["sprzedawcy marzeń", "sprzedawcy marzen"], "poranek"),
    ("Myslovitz Myszy i ludzie", ["myslovitz"], ["myszy i ludzie"], "poranek"),
    ("Myslovitz Zwykly dzien", ["myslovitz"], ["zwykły dzień", "zwykly dzien"], "poranek"),
    ("Bajm Jozek nie ruszaj sie", ["bajm"], ["józek", "jozef", "józef", "jozek"], "poranek"),
    ("Bajm Biala armia", ["bajm"], ["biała armia", "biala armia"], "poranek"),
    ("Bajm Co mi panie dasz", ["bajm"], ["co mi panie dasz"], "poranek"),
    ("Lombard Przezyj to sam", ["lombard"], ["przeżyj to sam", "przezyj to sam"], "poranek"),
    ("Lombard Szklana pogoda", ["lombard"], ["szklana pogoda"], "poranek"),
    ("TSA 51", ["tsa"], ["51"], "poranek"),
    ("TSA Wielki mis", ["tsa"], ["wielki miś", "wielki mis"], "poranek"),
    ("Kazik 12 groszy", ["kazik", "natemat"], ["12 groszy"], "poranek"),
    ("Kazik Bariera", ["kazik", "natemat"], ["bariera"], "poranek"),
    ("Strachy na Lachy Zycie to kratka", ["strachy na lachy"], ["życie to kratka", "zycie to kratka"], "poranek"),
    ("Strachy na Lachy Piła tango", ["strachy na lachy"], ["piła tango", "pila tango"], "poranek"),

    # DZIEŃ (Day) - mix of classic Polish rock
    ("Kult Parostatek", ["kult", "s.p. records"], ["parostatek"], "dzien"),
    ("Kult Komendant", ["kult", "s.p. records"], ["komendant"], "dzien"),
    ("Kult Piosenka mury", ["kult", "s.p. records"], ["piosenka", "mury"], "dzien"),
    ("Kult Dzien dobry Kocham cie", ["kult", "s.p. records"], ["dzień dobry", "dzien dobry", "kocham cię", "kocham cie"], "dzien"),
    ("Kult Twoje oczy lubia mnie", ["kult", "s.p. records"], ["twoje oczy", "lubia mnie"], "dzien"),
    ("Lady Pank Wciaz bardziej obcy", ["lady pank", "vevo"], ["wciąż bardziej obcy", "wciaz bardziej obcy"], "dzien"),
    ("Lady Pank Stacja Warszawa", ["lady pank", "vevo"], ["stacja warszawa"], "dzien"),
    ("Lady Pank Sztuczna", ["lady pank", "vevo"], ["sztuczna"], "dzien"),
    ("Lady Pank Jestem z miasta", ["lady pank", "vevo"], ["jestem z miasta"], "dzien"),
    ("Republika Smierc w bikini", ["republika"], ["śmierć w bikini", "smierc w bikini"], "dzien"),
    ("Republika Lawa", ["republika"], ["lawa"], "dzien"),
    ("Republika Balon", ["republika"], ["balon"], "dzien"),
    ("Republika Tak dlugo czekam", ["republika"], ["tak długo czekam", "tak dlugo czekam"], "dzien"),
    ("Dzem List do M", ["dżem", "dzem"], ["list do m", "list do m."], "dzien"),
    ("Dzem Paw", ["dżem", "dzem"], ["paw"], "dzien"),
    ("Dzem We mnie jest milosc", ["dżem", "dzem"], ["jest miłość", "we mnie jest"], "dzien"),
    ("Dzem Harley", ["dżem", "dzem"], ["harley"], "dzien"),
    ("Budka Suflera Za ostatni grosz", ["budka suflera"], ["za ostatni grosz"], "dzien"),
    ("Budka Suflera Nie wierz nigdy kobiecie", ["budka suflera"], ["nie wierz nigdy kobiecie"], "dzien"),
    ("Budka Suflera Miedzy ciszami", ["budka suflera"], ["między ciszami", "miedzy ciszami"], "dzien"),
    ("Maanam Zadza", ["maanam"], ["żądza", "zadza"], "dzien"),
    ("Maanam Cykady na Cykladach", ["maanam"], ["cykady"], "dzien"),
    ("Maanam Boskie Buenos", ["maanam"], ["boskie buenos"], "dzien"),
    ("Perfect Kolysanka dla nieznajomej", ["perfect"], ["kołysanka dla nieznajomej", "kolysanka dla nieznajomej"], "dzien"),
    ("Perfect Raz dzien", ["perfect"], ["raz dzień", "raz dzien"], "dzien"),

    # WIECZÓR (Evening) - calmer
    ("Kult Jestem z miasta", ["kult", "s.p. records"], ["jestem z miasta"], "wieczor"),
    ("Kult Nie wiesz", ["kult", "s.p. records"], ["nie wiesz"], "wieczor"),
    ("Kult Dokonal sie czyn", ["kult", "s.p. records"], ["czyn"], "wieczor"),
    ("Lady Pank To co mam", ["lady pank", "vevo"], ["to co mam"], "wieczor"),
    ("Lady Pank Na granicy", ["lady pank", "vevo"], ["na granicy"], "wieczor"),
    ("Republika Ukryty kraj", ["republika"], ["ukryty kraj"], "wieczor"),
    ("Republika Masakra", ["republika"], ["masakra"], "wieczor"),
    ("Dzem Sen o Victorii", ["dżem", "dzem"], ["sen o victorii"], "wieczor"),
    ("Dzem Autsajder", ["dżem", "dzem"], ["autsajder", "outsajder"], "wieczor"),
    ("Dzem Jesiony", ["dżem", "dzem"], ["jesiony"], "wieczor"),
    ("Budka Suflera Nie ma jak w domu", ["budka suflera"], ["dom"], "wieczor"),
    ("Budka Suflera Cala jestes z dreszczy", ["budka suflera"], ["cała jesteś", "cala jestes"], "wieczor"),
    ("Budka Suflera Takie ladne oczy", ["budka suflera"], ["oczy"], "wieczor"),
    ("Maanam Ruchome piaski", ["maanam"], ["ruchome piaski"], "wieczor"),
    ("Maanam Szał niebieskich ciał", ["maanam"], ["ciał"], "wieczor"),
    ("Maanam Kocham cie", ["maanam"], ["kocham cię", "kocham cie"], "wieczor"),
    ("Maanam Tamte dni", ["maanam"], ["tamte dni"], "wieczor"),
    ("Perfect Odnalezione szczescie", ["perfect"], ["odnalezione szczęście", "odnalezione szczescie"], "wieczor"),
    ("Perfect Wszyscy razem", ["perfect"], ["wszyscy razem"], "wieczor"),
    ("Perfect Wyspa", ["perfect"], ["wyspa"], "wieczor"),
    ("T.Love Nie ma nie bedzie", ["t.love", "tlove"], ["nie ma nie będzie"], "wieczor"),
    ("Myslovitz To nie jest film", ["myslovitz"], ["to nie jest film"], "wieczor"),
    ("Myslovitz Acidland", ["myslovitz"], ["acidland"], "wieczor"),
    ("Myslovitz Chce zeby ktos", ["myslovitz"], ["chcę żeby ktoś", "chce zeby ktos"], "wieczor"),
    ("Bajm Miedzy ciszami", ["bajm"], ["między ciszami", "miedzy ciszami"], "wieczor"),
    ("Bajm Ten sam", ["bajm"], ["ten sam"], "wieczor"),
    ("Strachy na Lachy Nieustraszony", ["strachy na lachy"], ["nieustraszony"], "wieczor"),
    ("Strachy na Lachy Dzień dobry", ["strachy na lachy"], ["dzień dobry", "dzien dobry"], "wieczor"),
]

results = {}
skipped = []

for q, artist_kws, title_kws, target in SONGS:
    print(f"\n>>> {q} (target: {target})", file=sys.stderr)
    videos = search(q)
    if not videos:
        print(f"  NO RESULTS", file=sys.stderr)
        skipped.append((q, target, "no results"))
        continue
    best = best_match(videos, artist_kws, title_kws)
    if not best:
        skipped.append((q, target, "no best match"))
        continue
    vid = best['videoId']
    title = best['title']
    secs = best.get('lengthSeconds', 0)
    author = best.get('author', '')
    verified = best.get('authorVerified', False)
    print(f"  CANDIDATE: {vid} | {title} | {secs}s | {author} | verified={verified}", file=sys.stderr)
    # Verify with oEmbed
    oe = oembed(vid)
    if not oe:
        print(f"  OEMBED FAIL", file=sys.stderr)
        skipped.append((q, target, f"oembed fail: {vid}"))
        continue
    actual_title = oe.get('title', '')
    print(f"  OEMBED: {actual_title}", file=sys.stderr)
    clean = clean_title(actual_title)
    if not clean:
        clean = actual_title
    # Diacritic-insensitive checks
    low_title = norm(clean)
    low_author = norm(author)
    ok = True
    if not any(norm(kw) in low_title for kw in title_kws):
        ok = False
    # Trusted label/official channels override artist check
    TRUSTED = {
        "mtj wytwornia muzyczna", "s.p. records", "sp records",
        "zespoedzem", "ladypankvevo", "ladypanktvvevo",
        "t.love", "tlove", "t love", "t.l.",
        "myslovitzofficial", "bajm", "kult", "kazik",
        "lady pank", "lady pank vevo",
        "republika", "republika -",  # Republika band, not TV Republika
        "tsa", "perfect", "budka suflera", "dzem", "mam na",
        "lombard", "strachy na lachy", "maanam",
    }
    if low_author not in TRUSTED:
        if not any(norm(kw) in low_author for kw in artist_kws):
            ok = False
    if not ok:
        print(f"  TITLE MISMATCH: {clean} | author={author}", file=sys.stderr)
        skipped.append((q, target, f"title mismatch: {vid} | {clean} | author={author}"))
        continue
    if secs <= 0 or secs > 1800:
        print(f"  BAD DURATION: {secs}", file=sys.stderr)
        skipped.append((q, target, f"bad duration {secs}: {vid}"))
        continue
    results.setdefault(target, []).append((vid, secs, clean))
    print(f"  OK: {vid},{secs},{clean}", file=sys.stderr)
    time.sleep(0.3)

# Write playlists
def fmt_playlist(name, header, entries):
    lines = [f"# NiC Radio - Playlista {header}", "# Format: ID_YOUTUBE,DLUGOSC_W_SEKUNDACH,TYTUL", ""]
    for vid, secs, title in entries:
        lines.append(f"{vid},{secs},{title}")
    return "\n".join(lines) + "\n"

names = {
    "noc": ("noc.txt", "NOC"),
    "poranek": ("poranek.txt", "PORANEK"),
    "dzien": ("dzien.txt", "DZIEŃ"),
    "wieczor": ("wieczor.txt", "WIECZÓR"),
    "popoludnie": ("popoludnie.txt", "POPOŁUDNIE"),
}

# Use dzien for popoludnie if needed (just for variety, or leave for user)
# Actually let me keep them separate. The schedule has popoludnie between dzien and wieczor
# We can use dzien's list for popoludnie, or generate a separate one
# Let me copy dzien to popoludnie for now
if "dzien" in results and "popoludnie" not in results:
    results["popoludnie"] = results["dzien"][:]

for key, (filename, header) in names.items():
    if key in results and results[key]:
        path = f"C:/Users/adamm/Kodowanie/NiC Radio/{filename}"
        content = fmt_playlist(filename, header, results[key])
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\nWROTE {filename} ({len(results[key])} tracks)", file=sys.stderr)

# Save skipped for review
with open("C:/Users/adamm/Kodowanie/NiC Radio/_skipped.txt", "w", encoding="utf-8") as f:
    for q, t, reason in skipped:
        f.write(f"[{t}] {q} | {reason}\n")
print(f"\nSkipped: {len(skipped)}", file=sys.stderr)
print(f"Total OK: {sum(len(v) for v in results.values())}", file=sys.stderr)
