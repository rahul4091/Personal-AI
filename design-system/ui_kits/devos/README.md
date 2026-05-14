# DevOS Agent — UI Kit

A click-thru recreation of the DevOS Agent product UI. Built by reading the source React components at [`rahul4091/Personal-AI`](https://github.com/rahul4091/Personal-AI) directly — not screenshots — so layout, spacing, and color use should match the live product 1:1.

## Open it

Open `index.html` in a browser. No build step.

## What's interactive

| Surface  | Demo behaviour                                                            |
|----------|---------------------------------------------------------------------------|
| Sidebar  | Click any item to switch view; Connect Google toggles header dot          |
| Digest   | "Run digest" simulates the 4-agent fan-out and re-stamps the timestamp    |
| Comms    | Click an email row to expand the Gmail-style reader; **Archive** removes it |
| Calendar | "+ New Event" reveals the Single/Recurring form; segmented + day picker work |
| Tasks    | Add a Notion task with Enter; status select per row updates state         |
| Chat     | Suggestion chips send; canned responses route by intent; bounce loader   |
| GitHub / LinkedIn / Slack | Stubbed — these are integration shells in the source product |

## Files

| File                  | What it is                                                  |
|-----------------------|-------------------------------------------------------------|
| `index.html`          | Shell + Babel imports + the `<App>` that wires everything   |
| `primitives.jsx`      | Card, Tag, Eyebrow, StatTile, Button, Input, Dot, SectionHeader |
| `TopBar.jsx`          | Brand mark + status dots                                    |
| `Sidebar.jsx`         | 200px nav + Connect Google footer                            |
| `DigestView.jsx`      | Today's digest with stat tiles and categorised cards         |
| `CommsView.jsx`       | Triaged inbox with expanding reader                          |
| `CalendarView.jsx`    | Agenda grouped by day, event-create form                     |
| `TasksView.jsx`       | Notion + Todoist + PRs + Trello combined                     |
| `ChatView.jsx`        | Asymmetric bubbles, suggestion chips, fake intent router     |

## Caveats

- All data is in-memory sample data. No real APIs are called.
- GitHub / LinkedIn / Slack panels are stubbed — see source repo if you need to mirror those.
- Email-reader iframes are simplified to a `<pre>` body (the real one renders sanitised HTML).
