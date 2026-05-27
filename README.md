# Turnierplaner

Turnierplaner ist eine lokale Webanwendung zur Planung und Durchfuehrung von Turnieren.
Die Anwendung bietet einen kompletten Ablauf von der Turnierkonfiguration bis zur Ergebnisauswertung.
Alle Daten werden in einer SQLite-Datenbank gespeichert.

## Features

### 1. Turniersetup
- Pflege von Turniername, Logo, Datum und Startzeit.
- Konfiguration zentraler Spielparameter wie Felder, Sets und Zeitdauern.
- Verwaltung einer Mittagspause.
- Passwortschutz fuer geschuetzte Bereiche.
- Passwort aendern und aktive geschuetzte Session abmelden.

### 2. Teamverwaltung
- Anlegen und Bearbeiten von Teams.
- Pro Team getrennte Verfuegbarkeit als spielendes Team und als Schiedsrichter.

### 3. Turnierkonfiguration
- Erstellen von Turnierphasen.
- Konfiguration von Gruppen- und Match-basierten Bloecken.
- Wahl und Persistenz des Wertungsmodus.
- Verwaltung von Platzierungen.

### 4. Turnierplanung
- Planung von Spielen ueber Phasen, Gruppen und Felder.
- Bearbeitbare Spielplanung in der Planungsansicht.
- Separate Spielplan-Ansicht als schreibgeschuetzte Uebersicht.

### 5. Turnierdurchfuehrung
- Ergebniseingabe pro Match inklusive Satzdaten.
- Tabellarische Matchsicht fuer die laufende Durchfuehrung.

### 6. Turnierergebnisse
- Uebersicht der Ergebnisse je Phase.
- Darstellung von Gruppentabellen, Matchlisten und Platzierungen.

## Nutzung

Ein sinnvoller Standardablauf ist:

1. In Turniersetup alle Basisdaten und Zeitparameter hinterlegen.
2. Teams erfassen und die Verfuegbarkeit setzen.
3. Turnierphasen und Blockstruktur in der Turnierkonfiguration aufbauen.
4. Wertungsmodus festlegen und Platzierungen konfigurieren.
5. Spiele in der Spielplanung einteilen.
6. In der Ergebniseingabe waehrend des Turniers Ergebnisse erfassen.
7. In Turnierergebnisse die Gesamtuebersicht und Endstaende kontrollieren.

## Running

### Voraussetzungen
- Node.js 18+ empfohlen.
- npm.

### Installation

```bash
npm install
```

### Start

```bash
npm start
```

Die App ist danach standardmaessig erreichbar unter:

```text
http://localhost:3000
```

### Alternativer Port

Du kannst einen eigenen Port setzen:

```bash
PORT=3001 npm start
```

### Wichtige Laufzeitinfos
- Server-Entry-Point: `server.js`
- Frontend: `public/`
- SQLite-Datei: `data/app.db`
- Startskripte: `npm start` und `npm run dev` (beide starten aktuell `node server.js`)

### Docker

Container bauen und starten:

```bash
docker compose up --build -d
```

Logs anzeigen:

```bash
docker compose logs -f
```

Container stoppen:

```bash
docker compose down
```

Hinweis zur Datenpersistenz:
- Die SQLite-Datenbank wird ueber den lokalen Ordner `./data` nach `/app/data` gemountet.
- Dadurch nutzt der Container dieselbe `data/app.db` wie die lokale App.

## Offene Punkte

Die folgenden Punkte sind als moegliche Weiterentwicklungen sinnvoll:

- konfigurierte Turnierpause beim Spielplan direkt beachten
- Automatisierte Tests fuer zentrale Workflows (API, Planung, Ergebniseingabe).
- Exportfunktionen fuer Spielplan und Ergebnisse (z. B. CSV/PDF).
- Bessere Rollen-/Rechteverwaltung statt globalem Passwortschutz.
- Verbesserte Validierung und Fehlermeldungen fuer komplexe Turnierkonfigurationen.
- Deployment- und Backup-Strategie fuer produktive Nutzung.

## Lizenz

Dieses Projekt steht unter der Apache License 2.0.

Freie Nutzung, Veraenderung und Weitergabe sind erlaubt, sofern die Lizenz und die
Autorenangabe erhalten bleiben.

Volltext: siehe Datei LICENSE.

Zusaetzliche Attribution: siehe Datei NOTICE.
