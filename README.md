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
```bash
TURNIERPLANER_API_BASE_URL='http://localhost:3000'; TURNIERPLANER_INTERNAL_API_BASE_URL='http://localhost:3000'; php -S 0.0.0.0:8080 -t Timer
```
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
- Read-only Datenfluss fuer PHP:
- `Timer/get_upcoming_matches.php` liest keine SQLite-Datei direkt.
- Stattdessen konsumiert PHP die Node-API: `/api/timer/upcoming-matches`.
### Voraussetzungen
- Node.js 18+ empfohlen.
- npm.
- Fuer WSL/Ubuntu bei nativen Modulen (sqlite3): `build-essential`, `python3`, `make`, `g++`.

### Installation

```bash
npm install
```

WSL-Hinweis (falls sqlite3 Build-Fehler auftreten):

```bash
sudo apt update
sudo apt install -y build-essential python3 make g++
npm rebuild sqlite3
```

### Start

```bash
npm start
```

Die App ist danach standardmaessig erreichbar unter:

```text
http://localhost:3000
```

**Fuer die Entwicklung mit Timer (PHP-Server in separatem Terminal):**

```bash
TURNIERPLANER_API_BASE_URL='http://localhost:3000'; TURNIERPLANER_INTERNAL_API_BASE_URL='http://localhost:3000'; php -S 0.0.0.0:8080 -t Timer
```

Timer ist dann erreichbar unter `http://localhost:8080`.

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

Docker Compose-Services:
- `turnierplaner`: Node API + Frontend auf Port `3000`.
- `turnierplaner-timer-php`: PHP-Host fuer `Timer` auf Port `8080`.

Read-only Datenfluss fuer PHP:
- `Timer/get_upcoming_matches.php` liest keine SQLite-Datei direkt.
- Stattdessen konsumiert PHP die Node-API: `/api/timer/upcoming-matches`.
- API-Basis-URL wird ueber `TURNIERPLANER_API_BASE_URL` gesteuert.

Reproduzierbarkeit im Build:
- Das Node-Image kopiert die lokal installierten `node_modules` in den Container.
- Das ist hier der robuste Workaround, weil die Container-Installation von npm in dieser Umgebung `express` unvollstaendig erzeugt.

Aktueller Stand:
- `docker compose up --build -d` startet Node und den PHP-Timer-Service erfolgreich.
- Der Node-Service ist per Healthcheck abgesichert und der PHP-Service wartet auf einen healthy Node-Status.
- Die Timer-Seite liest ihre Matchdaten ueber die Node-API statt direkt aus SQLite.

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

### Deploy Runbook (WSL und Docker Compose)

#### A) Lokale Nutzung in WSL mit npm start

1. Voraussetzungen installieren (einmalig):

```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3 make g++
```

2. Projekt starten:

```bash
npm install
npm start
```

3. Verifizieren:

```bash
curl http://localhost:3000/api/health
```

4. Timer-Endpunkt testen:

```bash
curl "http://localhost:3000/api/timer/upcoming-matches?limit=4"
```

5. Timer PHP Server starten (in separatem Terminal):

```bash
cd /mnt/c/temp/vsv/Dokumente/familie/turnierplaner
TURNIERPLANER_API_BASE_URL=http://localhost:3000 php -S 0.0.0.0:8080 -t Timer
```

Timer verfuegbar unter: `http://localhost:8080/`

#### B) Containerbetrieb mit Docker Compose (fuer Production/Deployment)

1. Build und Start:

```bash
docker compose up --build -d
```

2. Status pruefen:

```bash
docker compose ps
docker compose logs -f turnierplaner
```

3. Healthcheck pruefen:

```bash
curl http://localhost:3000/api/health
```

4. App verfuegbar unter:
   - Node App: `http://localhost:3000`
   - Timer: `http://localhost:8080`
     - PHP-Timer pruefen:
```bash
curl http://localhost:8080/get_upcoming_matches.php
```

5. Stoppen:

```bash
docker compose down
```

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
