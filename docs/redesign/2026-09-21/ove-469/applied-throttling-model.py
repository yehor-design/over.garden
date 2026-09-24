"""When does the LCP photograph finish under Lighthouse's applied throttling?

OVE-469. Lighthouse's `devtools` method emulates slow 4G by delaying every
request's first byte by 562.5 ms and sharing 1,474.56 kbit/s evenly between the
transfers in flight — per request, not by priority. This replays that rule over
the requests production's `/` makes (Lighthouse `network-requests`,
2026-09-23, after the chrome's bundle diet), and asks when the cover — the LCP
element — would finish under each lever.

Checked against the measurement it models: today's waterfall predicts the cover
at 5.60 s; production measured 5.73 s (median of three).

    python3 applied-throttling-model.py
"""

BANDWIDTH_KB_S = 1474.56 / 8
LATENCY_S = 0.5625

SCRIPTS_KB = [0.8, 11.2, 9.4, 74.1, 29.9, 15.6, 4.8, 0.5, 8.7, 9.8, 14.0, 9.4, 12.0, 21.6, 20.4, 1.6, 6.7]
FONTS_KB = [38.7, 36.1, 16.2, 17.2]  # Latin italic, Latin, Cyrillic, Cyrillic italic
STYLESHEETS_KB = [3.4, 16.9]
BELOW_THE_FOLD_KB = [103.0, 274.0, 453.5, 147.0, 133.1, 208.8, 208.9]
BELOW_THE_FOLD_AS_480_VARIANTS_KB = [20, 35, 40, 25, 25, 30, 30]  # estimated


def finish_times(requests, horizon_s=25.0, step_s=0.001):
    state = [{"name": n, "start": s + LATENCY_S, "left": kb, "end": None} for n, s, kb in requests]
    t = 0.0
    while t < horizon_s and any(r["end"] is None for r in state):
        active = [r for r in state if r["start"] <= t and r["end"] is None]
        if active:
            share = BANDWIDTH_KB_S * step_s / len(active)
            for r in active:
                r["left"] -= share
                if r["left"] <= 0:
                    r["end"] = t
        t += step_s
    return {r["name"]: r["end"] for r in state}


def cover_finishes(cover_kb, fonts, stylesheets, scripts, below, below_start_s):
    requests = [("cover", 0.69, cover_kb)]
    requests += [(f"font{i}", 0.69, kb) for i, kb in enumerate(fonts)]
    requests += [(f"css{i}", 0.69, kb) for i, kb in enumerate(stylesheets)]
    requests += [(f"js{i}", 0.70, kb) for i, kb in enumerate(scripts)]
    requests += [(f"img{i}", below_start_s, kb) for i, kb in enumerate(below)]
    return finish_times(requests)["cover"]


SCENARIOS = [
    ("today: 4 fonts, 2 stylesheets, 17 scripts; below the fold from 2.86 s (after the stylesheet)",
     94.3, FONTS_KB, STYLESHEETS_KB, SCRIPTS_KB, BELOW_THE_FOLD_KB, 2.86),
    ("stylesheet inlined: layout at ~0.9 s, so the lazy photographs start then",
     94.3, FONTS_KB, [], SCRIPTS_KB, BELOW_THE_FOLD_KB, 0.9),
    ("stylesheet inlined, normal faces only",
     94.3, FONTS_KB[1:3], [], SCRIPTS_KB, BELOW_THE_FOLD_KB, 0.9),
    ("stylesheet inlined, normal faces only, below the fold as 480 px variants",
     94.3, FONTS_KB[1:3], [], SCRIPTS_KB, BELOW_THE_FOLD_AS_480_VARIANTS_KB, 0.9),
    ("the same with a 40 kB cover (a phone-sized variant)",
     40, FONTS_KB[1:3], [], SCRIPTS_KB, BELOW_THE_FOLD_AS_480_VARIANTS_KB, 0.9),
    ("stylesheet kept, normal faces only, below the fold as 480 px variants",
     94.3, FONTS_KB[1:3], STYLESHEETS_KB, SCRIPTS_KB, BELOW_THE_FOLD_AS_480_VARIANTS_KB, 2.7),
    ("stylesheet inlined, no fonts, 40 kB cover, no photographs below the fold",
     40, [], [], SCRIPTS_KB, [], 0.9),
    ("the same bytes of script in one request instead of seventeen",
     40, [], [], [sum(SCRIPTS_KB)], [], 0.9),
    ("no script in the window at all",
     40, [], [], [], [], 0.9),
]

if __name__ == "__main__":
    for name, *arguments in SCENARIOS:
        print(f"{cover_finishes(*arguments):5.2f} s  {name}")
