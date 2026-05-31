# Solitaire Game — Project Context

## Who is this for?
This project is being built by Larry's dad, who is new to Claude Code and software development. Larry (his son, experienced with game development) is advising. Keep all explanations beginner-friendly and avoid jargon unless it is explained.

---

## Project Goal
Build a classic Klondike Solitaire game, starting simple and growing it through the phases below.

---

## Phases

### Phase 1 — Local Prototype (current)
Build a fully playable solitaire game that runs in a web browser locally. No internet or accounts needed.
- [ ] Decide on game type (Klondike is the default)
- [ ] Build the HTML/CSS/JavaScript game files
- [ ] Get the game running on localhost / opening in browser
- [ ] Playtest and refine until the game feels good

### Phase 2 — GitHub Setup
Set up a GitHub account and push the project so the code is safely version-controlled.
- [ ] Create a GitHub account for Larry's dad
- [ ] Initialize a git repository in this project folder
- [ ] Make the first commit
- [ ] Push to GitHub

### Phase 3 — Share with Friends & Family
Deploy the game to free hosting so anyone can play it via a web link.
- [x] Choose a hosting platform — Netlify
- [x] Deploy the game — https://lunchtimesolitare.netlify.app
- [ ] Share the link with friends and family
- [ ] Add shared database (Supabase) so all devices share the same player stats

### Stretch Goal — App Store
Package the game as a mobile app and publish to Apple App Store and/or Google Play.
- [ ] Research packaging options (e.g. Capacitor, PWA, or React Native wrapper)
- [ ] Build and test on mobile
- [ ] Submit to App Store(s)

---

## Current Status
> **Phase 3 complete.** Game is live and publicly accessible. Next: add shared player stats via Supabase (so all devices share the same leaderboard), then stretch goal of App Store.

## Setup Completed
- Claude Code permissions configured (`.claude/settings.json`)
- GitHub CLI installed and authenticated as **OTLunch**
- Git initialized and connected to **https://github.com/OTLunch/solitaire**
- Deployed to Netlify: **https://lunchtimesolitare.netlify.app**
- Auto-deploys on every `git push` to master

---

## Key Decisions Log
_Record important choices made here so future sessions have full context._

| Decision | Choice | Reason |
|---|---|---|
| Game type | TBD | Not yet decided |
| Tech stack | TBD | Not yet decided |
| Hosting | TBD | Phase 3 decision |

---

## Notes for Claude
- Always check this file at the start of a new session to understand where we left off.
- Update the checklist items and "Current Status" section as work progresses.
- Keep communication warm and simple — Larry's dad is the primary user.
- Larry (the son) may provide technical guidance; defer to him on architecture decisions.
