# Copilot Instructions for relation-cards-app

## Project Context
- Stack: Node.js, Express, SQLite, vanilla HTML/CSS/JavaScript modules.
- Frontend files are in `public/`.
- Backend entry point is `server.js`.
- Goal: fast iteration during active development.

## Core Development Rules
- Do not preserve backward compatibility with old versions.
- Do not add migration logic for old database schemas unless explicitly requested.
- Prefer direct, current-schema changes.
- Keep solutions simple and explicit over generic abstractions.

## Architecture and File Separation
- Separate concerns clearly:
- Layout/UI rendering and DOM structure in layout-focused files (for example `public/layout.js`).
- Persistence/API access in data-store files (for example `public/data-store.js`).
- Normalization/comparison/calculation logic in calculation files (for example `public/calculations.js`).
- App orchestration/event wiring in `public/app.js`.
- Keep backend route logic and SQLite access in `server.js` unless a refactor is explicitly requested.

## Database Rules
- Store setup values in dedicated SQLite columns, not JSON blobs.
- Current setup data lives in table `setup` with explicit columns.
- Team data lives in table `teams`; IDs are internal database identifiers.
- Do not expose DB IDs in frontend team forms unless explicitly requested.
- Maintain a markdown file to describe the database schema and any changes to it over time, but do not add migration logic to the codebase.

## API and Data Handling
- Keep API payloads normalized before save and after load.
- Return stable, predictable response shapes.
- Validate and sanitize incoming data on the server.
- Always live update the UI when something changes in the frontend, do not require a page refresh to see changes reflected.

## Documentation Style
- Add English JSDoc headers for every function you add or edit.
- Each function header must include:
- Purpose/description.
- `@param` entries for all parameters.
- `@returns` entry.

## Frontend and UX
- Keep the app responsive for mobile and desktop.
- Sidebar/navigation behavior should remain functional on small screens.
- Save buttons should stay disabled until dirty state is detected.

## Coding Style
- Prefer readable, explicit code over clever shortcuts.
- Keep naming consistent with existing code.
- Avoid unrelated refactors while implementing a focused request.
- When changing behavior, update all affected layers (UI, data-store, calculations, backend) consistently.

## Validation Checklist
When implementing a feature or fix:
1. Update relevant frontend modules by concern.
2. Update backend endpoint and database logic if needed.
3. Verify no editor/lint errors in changed files.
4. Smoke-test endpoints and main interaction flow.
5. Ensure JSDoc headers exist for added/changed functions.
