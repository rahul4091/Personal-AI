---
name: devos-agent-design
description: Use this skill to generate well-branded interfaces and assets for DevOS Agent (a developer-focused personal AI command center), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI-kit components for prototyping.
user-invocable: true
---

Read the `README.md` file within this skill, and explore the other available files:

- `colors_and_type.css` — design tokens + semantic type classes; copy/import this into anything new.
- `assets/logo.svg`, `assets/wordmark.svg` — brand marks.
- `preview/*.html` — individual cards documenting colors, type, spacing, components, icon usage. Open these to refresh your memory on a specific token or pattern.
- `ui_kits/devos/` — pixel-faithful React recreation of the product UI. Read these to lift exact component structure, then simplify cosmetically.

**When creating visual artifacts** (slides, mocks, throwaway prototypes), copy `colors_and_type.css` + any assets you need into a fresh folder and produce static HTML files for the user to view.

**When working on production code**, treat the rules in `README.md` (CONTENT FUNDAMENTALS, VISUAL FOUNDATIONS, ICONOGRAPHY) as constraints, not suggestions:
- No gradients, no shadows on cards, no emoji, no Title Case headlines.
- Hairline 0.5px borders carry the weight; the 3px left-accent bar is the signal-bearing motif.
- System fonts only; weights 400 and 500 — never 600+.
- Unicode glyphs (●, ↗, ▾, ✓, +, ·, ↔) instead of an icon set.

**If the user invokes this skill without other guidance**, ask them what they want to build or design, ask a few questions (target surface, fidelity, variations), then act as an expert designer who outputs either HTML artifacts or production code — depending on the need.
