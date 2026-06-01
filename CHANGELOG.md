# Changelog

All notable changes to this project are documented in this file.

## [v1.1.0] - 2026-06-01
### Added
- "Generating game…" indicator displayed while searching for a winnable deck.

### Changed
- Winnable-deck heuristic solver rewritten to correctly simulate moves:
  - Properly removes cards from source piles when moving to foundations or tableau.
  - Flips exposed tableau cards when sequences are moved.
  - Avoids duplicating cards during simulation.
  - Runs in small yields to keep the UI responsive while searching.

### Fixed
- New game could hang/stall when "winnable games only" option was active — fixed.
- `Start Playing` button unresponsive in offline/local mode — added localStorage fallback and safer startup wiring.
- Resolved a JavaScript syntax error (extra closing brace) that prevented the app from loading in some cases.

### Notes
- Commit: 850af1575ff5e124d1af4f6e31e93cf76af0927a
- Merge branch: `agents/solitaire-resume-session` → `master`

### How to test
1. Open the game locally at `http://127.0.0.1:8000` or the deployed site.
2. Click "Start Playing" and verify the player modal starts a new game.
3. Click "New Game" and observe the "Generating game…" indicator while the solver runs.
4. Verify normal play and that auto-complete/auto-moves work as expected.

---

If you'd like, I can create a Git tag and push it, and draft a GitHub release description using this changelog.