# builtbybots.show — Read This Before You Touch the Site

**Audience:** any team member (Hal, Hermes, Ami, a human) editing `/var/www/tank`
**Owner of last resort:** Ghost. When unsure, stop and hand it to Ghost or leave a note.

This file exists because a good-intentioned edit on 2026-08-30/31 quietly reverted
the nav on 9 pages, the real favicon on 7, the AdSense tags on 4, the Open Graph
tags on 2, and deleted a published blog post — by overwriting current files with
older local copies. None of it was visible without diffing. Don't be the next one.

---

## The one rule that would have prevented all of it

**Never overwrite a whole file. Edit in place, and diff before you save.**

Whole-file pastes carry whatever your copy was missing. The site changes daily;
your local copy is stale the moment you made it.

---

## Pre-flight (every session, before the first edit)

```bash
cd /var/www/tank
git status            # working tree should be understood before you add to it
git pull --ff-only    # (if a remote is configured) get current
git log --oneline -5  # know what shipped recently
```

If `git status` shows changes you didn't make and don't recognise: **stop.**
Ask in `nudge` / the shared librarian before editing. Someone's uncommitted work
is sitting there and your edit-then-commit could bury it.

## Post-flight (before you walk away)

```bash
git diff                                   # read every hunk. Is that ALL you meant to change?
curl -s -H "Host: builtbybots.show" http://localhost/<path-you-changed>/ | head -60
git add -A && git commit -m "what and why"  # uncommitted work is the next person's landmine
```

Caddy serves `/var/www/tank` **directly**, 60-second cache, **no staging**. A
broken save is public in about a minute.

---

## Shared chrome — identical on every page, by design

Do **not** hand-retype any of these. Copy the block verbatim from a known-good
page (`about/index.html` is a safe reference) or leave them alone.

| Piece | What it is | Rule |
|---|---|---|
| `<header><div class="wrap"><nav>…</nav></div></header>` | The nav, incl. the **Team ▾** pure-CSS dropdown and the `nav-mobile-team` link | Byte-identical on all 14 top-level pages. Change one → change all. |
| `<link rel="stylesheet" href="/amiga.css">` | The entire design system | Every page links it. Never drop it, never inline styles that fight it. |
| Favicon block | `favicon.ico` + `favicon-32x32.png` + `favicon-16x16.png` + `apple-touch-icon.png` | 4 lines, together. Not a single inline `data:image/svg+xml` — that's the old fallback. |
| `<meta name="google-adsense-account" content="ca-pub-2874546800688654">` + `adsbygoogle.js` | Monetization | Present on content pages (`index`, `arcade`, `ami`, `blog/*` except hermes/ami-blog, etc.). If HEAD has it, keep it. |
| `<meta property="og:*">` + `<meta name="twitter:card">` | Link previews / SEO | Don't drop. Each page has its own title/description/image values. |
| `<script defer src="/assets/auth-nav.js">` + `<script defer src="/assets/bbbmod-player.js">` | Login-aware nav + the mod player | Load on every page. Add new scripts *alongside*, never *instead of*. |

The nav dropdown needs `.nav-dropdown` / `.dropdown-toggle` / `.dropdown-menu`
styles that live in `amiga.css` — they're already there. If the dropdown renders
as plain links, the page isn't loading `amiga.css`.

---

## Adding things without breaking things

**A new page:** copy the full `<head>` + `<header>` + `<footer>` from
`about/index.html`, change only the title/description/canonical/og values and the
body. Keep the shared chrome untouched.

**A new arcade game:** put it in `arcade/<slug>/` (`index.html` + `thumb.png`),
add ONE card to `arcade/index.html` following the existing card pattern. Don't
touch anything else in that file.

**New/updated assets (avatars, images):**
- Keep the **same filename** if you're replacing an image — every reference then
  updates automatically, nothing else to do.
- If you must rename: `grep -rn "old-name" /var/www/tank --include=*.html`, update
  **every** hit, and do it in one commit. A half-wired asset (new file, old refs
  on 5 pages, new refs on 2) is worse than not shipping it.
- Wire a visual feature in **everywhere or nowhere**. Consistency > partial.

**Content/blog posts:** add, don't replace. If you're "cleaning up" an older
post, that's a call for Ghost or Peter, not a side effect of another edit.

---

## Schedule / cadence language

There is **no fixed drop-day/time promise** any more (retired 2026-08-31). Public
copy says *"New episodes and History Shorts weekly"* / *"New shorts released
regularly"*. Don't reintroduce "Mondays 6 PM ET" etc. — if you see it, it's a
stale copy leaking back in.

## Video links

`/shows/` (the on-site retro-TV viewer) is the primary way to watch. One YouTube
icon in the footer is fine. Don't scatter extra "Watch on YouTube" CTAs on pages
that already embed or link the on-site viewer.

---

## If you realise you broke something

Don't patch over it. `git diff` to see the damage, `git checkout HEAD -- <file>`
to revert a file you haven't committed, and say so in `nudge`. Silent breakage
that ships is the expensive kind; a caught mistake is free.
