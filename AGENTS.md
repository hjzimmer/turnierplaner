# AGENTS.md

## Quick Guide for Coding Agents

### Mission
Build and iterate quickly on the current product state.
No backward compatibility unless explicitly requested.

### Stack
- Backend: Node.js + Express + SQLite
- Frontend: vanilla HTML/CSS/JavaScript modules
- Main backend file: `server.js`
- Frontend modules: `public/app.js`, `public/layout.js`, `public/data-store.js`, `public/calculations.js`

### Non-Negotiable Rules
1. No legacy compatibility work by default.
2. No migration layers for old schemas unless explicitly requested.
3. Prefer direct schema and code updates for the current version.
4. Keep edits focused; avoid unrelated refactors.

### Separation of Concerns
- Layout and DOM rendering: `public/layout.js`
- API/persistence calls: `public/data-store.js`
- Normalization/comparison/calculation logic: `public/calculations.js`
- Event wiring and app orchestration: `public/app.js`
- API routes + DB statements: `server.js`

### Database Rules
- Setup data is stored in table `setup` in dedicated columns (no JSON blob storage).
- Team data is stored in table `teams`.
- Team IDs are internal DB identifiers and should not be shown in frontend forms unless requested.

### API Rules
- Validate and normalize input before writing.
- Return stable response shapes.
- Keep endpoint behavior explicit and predictable.

### Function Documentation Rule
For every added or changed function, include English JSDoc with:
- Description of the function purpose.
- `@param` for all parameters.
- `@returns` for return value.

### UX Rules
- Keep mobile responsiveness intact.
- Keep navigation/sidebar behavior functional on mobile and desktop.
- Save buttons should only be enabled when data is dirty.

### Done Checklist
1. Update all affected layers consistently (UI, calculations, data-store, backend).
2. Ensure JSDoc headers exist for changed functions.
3. Check for editor/lint/runtime errors in changed files.
4. Smoke-test key endpoints and the primary UI flow.
