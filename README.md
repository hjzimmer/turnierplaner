# Relation Cards App

Standalone web application to generate all unique relations between N elements, display them as cards, reorder via drag and drop, and persist everything in SQLite.

## Features

- Generate all unique pair relations for a list of elements
- Formula: total relations = N * (N - 1) / 2
- Cards shown in a vertical list
- Drag-and-drop sorting of cards
- Persistent storage in SQLite database

## Run

1. Install dependencies:

   npm install

2. Start app:

   npm start

3. Open in browser:

   http://localhost:3000

## API

- `GET /api/state` - get current elements and relations
- `POST /api/generate` - generate relation cards from element list
- `POST /api/reorder` - persist new order after drag and drop
