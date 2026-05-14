# DevOS Agent Design System

A design system extracted from **DevOS Agent**, a personal AI command center that orchestrates Gmail, Google Calendar, Notion, GitHub, Trello, Slack, LinkedIn and Todoist behind a single React UI plus a chat agent.

This system captures the **visual + interaction vocabulary** of that product so future surfaces (marketing pages, slides, mocks, related apps) stay on-brand without re-inventing the wheel.

---

## Source

- **GitHub:** [`rahul4091/Personal-AI`](https://github.com/rahul4091/Personal-AI) — the React 19 + Vite client and Node/Express server it was extracted from. Explore further if you want to add new product surfaces (e.g. a marketing site) — read `client/src/components/` for any pattern not yet captured here.

The original product is sometimes called *Personal-AI* (repo name) and sometimes *DevOS Agent* (product name). This system uses **DevOS Agent**.

---

## What is DevOS Agent?

A single-pane-of-glass agent UI for developers who already live in Notion + Gmail + Calendar + GitHub + Slack. The product splits across:

| Surface         | What it does                                                          |
|-----------------|-----------------------------------------------------------------------|
| **Today's digest** | One-tap parallel run of 4 sub-agents; stats + cards for comms / conflicts / blockers / drafts |
| **Comms**          | Triaged inbox — P1 / P2 / P3 priorities, expandable Gmail-style reader |
| **Calendar**       | Day-grouped agenda with conflict detection, focus blocks, recurring-event builder |
| **Tasks**          | Notion + Todoist tasks, GitHub PR staleness, Trello cards — unified |
| **Content**        | LinkedIn drafts (3 variants), changelog from merged PRs |
| **GitHub / LinkedIn / Slack** | Per-integration panels |
| **Chat**           | Free-form intent router that fans out to the right sub-agent |

It's a power-user dashboard, not a consumer app. Information density is high; chrome is minimal.

---

## Index — what's in this folder

```
DevOS Agent Design System/
├── README.md                  ← you are here
├── SKILL.md                   ← agent-skill manifest (drop into Claude Code)
├── colors_and_type.css        ← all tokens + semantic type classes
├── assets/                    ← logo, wordmark, brand SVGs
│   ├── logo.svg
│   └── wordmark.svg
├── preview/                   ← cards rendered into the Design System tab
│   ├── colors-primary.html
│   ├── colors-semantic.html
│   ├── colors-tags.html
│   ├── colors-dots.html
│   ├── type-scale.html
│   ├── type-eyebrow.html
│   ├── spacing-radii.html
│   ├── spacing-borders.html
│   ├── elevation.html
│   ├── buttons.html
│   ├── inputs.html
│   ├── tags.html
│   ├── cards.html
│   ├── stat-tiles.html
│   ├── nav-item.html
│   ├── status-dots.html
│   └── logo-card.html
└── ui_kits/
    └── devos/                 ← React UI kit (Babel-loaded JSX)
        ├── README.md
        ├── index.html         ← interactive click-thru of the full app
        ├── TopBar.jsx
        ├── Sidebar.jsx
        ├── DigestView.jsx
        ├── CommsView.jsx
        ├── CalendarView.jsx
        ├── TasksView.jsx
        ├── ChatView.jsx
        └── primitives.jsx     ← Card, Tag, Eyebrow, StatTile, Button, Input
```

---

## CONTENT FUNDAMENTALS

DevOS Agent speaks like a senior developer's terminal — terse, lowercase-leaning, no marketing fluff, no exclamation points.

### Voice
- **Direct, second-person.** "Connect Google" — not "Click here to connect your Google account."
- **The agent is invisible.** Copy never says "I" or refers to the AI as an entity. Output is presented as fact: "Inbox clear ✓", "Triaging inbox…".
- **Active verbs, no hedging.** "Run digest", "Archive", "Refresh" — not "Try running" or "You can refresh".
- **Em-dash is the connector of choice.** "Personal AI Command Center — an autonomous agent that…". Don't use semicolons.
- **Lowercase headlines.** Panel titles use sentence case with subtle weight (500), not Title Case All Caps: "Today's digest", "Comms — triaged inbox", "Calendar conflicts".
- **Eyebrow labels are UPPERCASE** with 0.05em tracking — but they're tiny (11px) and gray, never shouting: `COMMS`, `BLOCKERS`, `CALENDAR CONFLICTS`.

### Examples — pulled directly from the product

| Surface              | Copy                                                              |
|----------------------|-------------------------------------------------------------------|
| Empty digest         | "No digest yet for today" / "Click 'Run digest' to pull all sub-agents — result is cached until you refresh" |
| Loading              | "Triaging inbox…" · "Running 4 sub-agents in parallel…"           |
| Empty inbox          | "Inbox clear ✓"                                                   |
| Empty calendar       | "No upcoming events"                                              |
| Chat placeholder     | "Ask DevOS anything…"                                             |
| Chat empty state     | "Ask DevOS anything about your emails, calendar, or tasks."       |
| Chat suggestions     | "What do I have today?" · "Add task: review PRs and block 2h focus time tomorrow" · "Any urgent emails?" |
| Status indicator     | "● Google connected"                                              |
| Stat label           | "Emails pending" / "Conflicts" / "Blockers" / "Content drafts"     |

### Punctuation & casing rules
- Ellipsis is the **typographic ellipsis (…)**, never three periods.
- Use **·** as an inline separator, not commas: `email@x.com · Mar 4, 2:13 PM`.
- Use **↗** for external link affordances, **▾** for expandables, **✓** for completion, **●** for status. *Never* use other arrow glyphs.
- **No emoji** in production strings except `✓` (and `↗`/`▾`/`●` if you count them, which we don't).
- Numbers are bare: `4 sub-agents`, `3d stale`, not `four sub-agents`.
- Time formats: `2:13 PM`, `Mar 4`, `Today` / `Tomorrow` / weekday name.

### What to avoid
- ❌ "Hi! 👋" / "Welcome!" / "Awesome!" — no exclamation points, no greetings
- ❌ "Your AI assistant will help you…" — never anthropomorphize
- ❌ "Click here" / "Learn more" — too generic; use the actual verb
- ❌ Long marketing taglines — keep status copy under 60 chars

---

## VISUAL FOUNDATIONS

### The vibe
A **calm, paper-warm dashboard** that looks like it was designed by a backend engineer who likes Linear and reads `man` pages. Everything is small, everything is precise, hairlines everywhere, generous whitespace inside cards, one accent color (green) doing most of the work.

### Colors

| Token        | Hex       | Use                                             |
|--------------|-----------|-------------------------------------------------|
| `--bg`       | `#f9f9f8` | App background. **Warm** off-white, not blue-white. |
| `--surface`  | `#ffffff` | Cards, sidebar, top bar.                        |
| `--border`   | `#e5e4e0` | Hairline borders (drawn at **0.5px**).          |
| `--text`     | `#1a1a18` | Body text — near-black with a warm tint.        |
| `--muted`    | `#6b6b68` | Secondary text, metadata.                       |
| `--hint`     | `#a0a09d` | Timestamps, counts, very faint info.            |
| `--accent`   | `#1D9E75` | DevOS green — primary CTAs, sender avatar, "Connected" state, brand mark. |
| `--danger`   | `#D85A30` | P1 emails, blockers, conflict bars.             |
| `--warning`  | `#BA7517` | P2 emails, scheduling warnings.                 |
| `--info`     | `#378ADD` | Focus blocks, links, "Soon" tags.               |
| `--success`  | `#639922` | Done states, ✓ confirmations.                   |

**Panel dots** — each navigation row + status indicator carries a 7×7 colored dot:
- Digest `#888780` (gray), Comms `#1D9E75` (green), Calendar `#7F77DD` (lavender), Tasks `#D85A30` (orange), GitHub `#24292f` (graphite), LinkedIn `#0A66C2` (LinkedIn blue), Slack `#611f69` (Slack aubergine), Chat `#378ADD` (azure). One purple bonus: `#8B5CF6` for `class/study/dsa` calendar events.

**No gradients.** Anywhere. The brand is flat.
**No dark mode** in the source. If you need one, derive — don't invent.

### Typography
- **Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "Helvetica Neue", Arial, sans-serif`. System font everywhere — *no web fonts are loaded*. (See "Fonts" note below.)
- **No serif. No display face. No mono outside `<pre>`/`<code>`.**
- **Sizes are tiny:** body is `13px`, panel titles `16px`, eyebrow labels `11px`, hints `11px`, the big digest numerals `24px`, expanded email subject `20px`.
- **Weights:** 400 (regular), 500 (medium). **No 600 or 700** anywhere. Even h2 panel titles are 500.
- **Line height:** 1.5 for body, 1.6–1.7 for long-form email content, 1.3 for headings.
- **Letter-spacing:** default 0; uppercase eyebrows use 0.05em.

### Backgrounds & imagery
- **No background images, no full-bleed photos, no illustrations, no patterns, no textures, no gradients.** The product is 100% flat color blocks. Don't add what isn't there.
- **No hand-drawn or branded marketing imagery exists** in the source. If a marketing surface needs one, flag it and ask.

### Borders & corners
- **Hairline (0.5px) borders** on every card, input, button, sidebar edge. This is the dominant visual element.
- **Radii:** `8px` (`--radius`) is the default; `12px` (`--radius-lg`) appears on email-bubble corners; `4px` (`--radius-sm`) on tags; `999px` on dots.
- **Asymmetric radii** show up on directional cards: `0 8px 8px 0` when there's a 3px accent bar on the left. Chat bubbles use `12px 12px 2px 12px` (user) and `12px 12px 12px 2px` (assistant).
- **The 3px accent bar** is the signal-bearing motif: priority emails, conflicts, blockers, stale PRs. Always paired with the matching semantic color.

### Shadows / elevation
- **Almost none.** The product uses border-on-white instead of shadow-on-white. If a shadow is needed (popovers, sticky toolbars), use `0 1px 2px rgba(20,20,20,0.04)` — tiny and warm-tinted.
- **No inner shadows. No glows. No colored shadows.**

### Layout rules
- App is a **fixed 200px sidebar + flexible main panel**, with a **48px top bar** above both.
- Main panel padding is `16px`. Card padding is `10px 14px` (default) or `14px 20px` (email expanded view).
- Stat tiles are arranged `repeat(4, 1fr)` with `gap: 8px`.
- Vertical rhythm between cards is `6–8px` gap.
- **Information density is HIGH** — don't over-pad. The product is designed for keyboard-driven power users.

### Hover & press states
- **Hover:** background shifts to `--bg` (subtle paper tone) on buttons. Sidebar items use the same. No scaling, no shadow change, no color shift.
- **Primary buttons on hover:** `opacity: 0.9`. That's it.
- **No press state** is explicitly defined; rely on browser default click feedback.
- **No focus rings** are styled — inputs swap border color to `--accent`.

### Transitions
- **Single timing:** `0.12s` for color/background changes (`--t-fast`).
- **0.2s** on the expand-arrow rotation (`--t-normal`).
- **No springs, no bounces, no easing curves** beyond the default. The product feels mechanical / deliberate.
- One CSS keyframe exists: a 3-dot loading bounce in `ChatPanel`. Reuse it if you need "thinking…" UI.

### Transparency & blur
- **Not used.** No glass effects, no backdrop-filter, no translucent overlays. Modals (if any) would be opaque on top of a low-opacity scrim — but the source has none.

### Cards — anatomy
A DevOS card is:
1. `var(--surface)` (white) on `var(--bg)` (warm).
2. `0.5px solid var(--border)` on all four sides — *unless* there's an accent bar, in which case the left border becomes `3px solid <semantic-color>` and the radius drops the left corners.
3. `8px` radius (or `0 8px 8px 0` with accent).
4. `10px 14px` padding.
5. **No shadow, no hover lift, no transform.**
6. Content order inside a card: eyebrow (small, muted, uppercase if section header) → title (500 weight, 13px) → metadata (11px, muted).

### Status & state communication
- **Dots > badges.** A 7×7 colored dot is preferred over a pill/badge for binary status. Reserve tags for priority / category labels.
- **Color carries meaning consistently:** green = good/connected/done, orange = P1/blocked/danger, ochre = P2/warning, azure = info/focus, lavender = scheduled.

---

## ICONOGRAPHY

**There is no icon library in the source.** DevOS Agent deliberately uses Unicode glyphs + colored dots as its entire iconography. This is a strong brand choice — preserve it.

### What's actually used
| Glyph | Meaning                       | Where                              |
|-------|-------------------------------|------------------------------------|
| `●`   | Status indicator              | TopBar dots, "Google connected"    |
| `↗`   | External link                 | "View ↗" on PRs, Trello, email links |
| `▾`   | Expandable / accordion        | Email row toggle                   |
| `✓`   | Completion / success          | "Inbox clear ✓"                    |
| `+`   | Create new                    | "+ New Event"                      |
| `·`   | Inline separator              | Between attendees, intents          |
| `↔`   | Two-way conflict              | Calendar conflicts: "EventA ↔ EventB" |

### Custom shapes
- **Sender avatar:** 36×36 round, solid `#1a73e8` (Gmail-style blue inside email reader specifically — this is *not* DevOS green, it's a Gmail homage in the reader pane only), first-letter of sender, white text, 15px weight 500.
- **Brand mark:** 26×26 rounded square (8px radius), `#1D9E75` background, white "D" centered. See `assets/logo.svg` and `assets/wordmark.svg`.
- **Status dots:** 7×7 perfect circles, solid color.

### What NOT to do
- ❌ Don't introduce a stroke icon set (Lucide, Heroicons, Feather). The brand reads as quieter than any of them.
- ❌ Don't use emoji in UI (even `📧`, `📅`). The only checkmark used is the Unicode `✓`.
- ❌ Don't draw multi-color icons or fill-with-outline icons.
- ❌ Don't substitute filled circles with squares, rings with discs, etc — they're load-bearing signals.

### If a new surface genuinely needs an icon
1. Try Unicode first — `▸`, `■`, `→`, `⌘`, `↩`, `⌥`, `⇧` are on-brand.
2. If unicode won't do it, use **Lucide** (1.5px stroke, no fills) at 14–16px in `--muted` color — and **flag the substitution** in your design comments. It is NOT part of the system yet.

> **Substitution flag:** No icon set is provided. This system intentionally leans on Unicode + colored dots. Adding Lucide or similar is an *extension*, not a fidelity choice — surface this to the user before doing it broadly.

---

## Fonts

**No font files are bundled** because the source product uses 100% system fonts. The CSS stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, "Helvetica Neue", Arial, sans-serif` resolves to:

- macOS / iOS → San Francisco
- Windows → Segoe UI
- Android → Roboto
- Linux / fallback → Helvetica Neue → Arial

> **Substitution flag:** If you need a hosted equivalent (e.g. for a print PDF where system fonts won't render consistently), use **Inter** (400 / 500 only — never 600+) as the closest open-source match. Please ask the user before swapping — DevOS's system-font choice is intentional and contributes to the "native developer tool" feel.

---

## Caveats & open questions

- **No real logo asset existed** — the brand mark in `TopBar.jsx` is a CSS-drawn green square with the letter "D". `assets/logo.svg` and `assets/wordmark.svg` are 1:1 SVG recreations of that mark. If a proper logo gets designed, swap these.
- **No marketing surface, no slides, no print collateral** exist in the source. This system covers the *product UI only*. Slide templates would have to be designed fresh.
- **No dark mode** in the source — don't infer one.
- **Sidebar dot colors** for LinkedIn / Slack / GitHub are borrowed from those companies' brands, not DevOS-owned colors. Treat them as integration accents, not brand colors.
