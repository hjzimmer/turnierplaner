# Turnierplaner

Turnierplaner ist eine Webanwendung zur Planung und Durchfuehrung von Turnieren.
Die Anwendung verwaltet Turniersetup, Teams, Phasen, Spielplanung, Ergebnisse und
Platzierungen. Alle Anwendungsdaten werden in SQLite gespeichert.

## Komponenten

- `turnierplaner`: Node.js-Backend, REST-API und Weboberflaeche auf Port `3000`.
- `turnierplaner-timer-php`: PHP-Countdown und Spielanzeige auf Port `8080`.
- `data/app.db`: aktive SQLite-Datenbank.
- `Timer/sounds`: Sounddateien des Timers. Sie werden nicht in das Image kopiert,
  sondern read-only vom Host in den Timer-Container gemountet.

Der PHP-Timer greift nicht direkt auf SQLite zu. Er liest Konfiguration und
kommende Spiele ueber die Node-API.

## Voraussetzungen

- Linux oder WSL
- Docker Engine mit Docker-Compose-Plugin
- Git
- Node.js und npm auf dem Rechner, auf dem das Node-Image gebaut wird

Das Node-Image uebernimmt die lokal installierten `node_modules`. Vor dem ersten
Build des Node-Containers daher im Projektverzeichnis ausfuehren:

```bash
sudo apt update
sudo apt install -y nodejs npm build-essential python3 make g++
npm install
```

## 1. Node und Timer auf verschiedenen Rechnern

In diesem Szenario laeuft das Node-Backend auf Rechner A und der Timer auf
Rechner B. Der Timer erreicht das Backend ueber das Internet unter
`https://otticup.akzimmer.de`.

### Rechner A: Node-Backend

Projekt bereitstellen, Abhaengigkeiten installieren und nur den Node-Service
starten:

```bash
cd /pfad/zu/turnierplaner
npm install
mkdir -p data
docker compose build --pull turnierplaner
docker compose up -d --no-deps turnierplaner
```

Lokalen Healthcheck ausfuehren:

```bash
curl --fail http://localhost:3000/api/health
curl --fail "http://localhost:3000/api/timer/upcoming-matches?limit=4"
```

Der Reverse Proxy muss:

- `https://otticup.akzimmer.de` per TLS bereitstellen,
- Anfragen an das Node-Backend auf Port `3000` weiterleiten,
- die Pfade `/api/timer/config` und `/api/timer/upcoming-matches` erreichbar
  machen.

Von Rechner B aus pruefen:

```bash
curl --fail https://otticup.akzimmer.de/api/health
curl --fail "https://otticup.akzimmer.de/api/timer/upcoming-matches?limit=4"
```

### Rechner B: PHP-Timer

Auf Rechner B werden nur das Timer-Image und der Soundordner benoetigt. Die
beiden API-Variablen zeigen auf die oeffentliche HTTPS-Adresse des Backends:

```bash
cd /pfad/zu/turnierplaner
cat > .env <<'EOF'
TURNIERPLANER_API_BASE_URL=https://otticup.akzimmer.de
TURNIERPLANER_INTERNAL_API_BASE_URL=https://otticup.akzimmer.de
EOF
docker compose build --pull turnierplaner-timer-php
docker compose up -d --no-deps turnierplaner-timer-php
```

Timer und API-Zugriff pruefen:

```bash
curl --fail --location http://localhost:8080/
curl --fail http://localhost:8080/get_upcoming_matches.php
```

Der Timer ist unter `http://RECHNER-B:8080` erreichbar.

Das Timer-Image installiert aktuelle CA-Zertifikate und die in dieser Umgebung
benoetigte Zscaler Root CA aus `certificates/ZscalerRootCA.crt`. Die
TLS-Zertifikatspruefung bleibt aktiviert.

## 2. Beide Container auf demselben Rechner

Beide Services laufen im selben Compose-Netzwerk. PHP erreicht Node intern ueber
den Servicenamen `turnierplaner`; der Browser verwendet den veroeffentlichten
Port `3000`.

```bash
cd /pfad/zu/turnierplaner
npm install
mkdir -p data

cat > .env <<'EOF'
TURNIERPLANER_API_BASE_URL=http://localhost:3000
TURNIERPLANER_INTERNAL_API_BASE_URL=http://turnierplaner:3000
EOF

docker compose up --build -d
```

Services pruefen:

```bash
docker compose ps
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:8080/get_upcoming_matches.php
curl --fail --location http://localhost:8080/
```

Die Anwendungen sind lokal erreichbar unter:

- Turnierplaner: `http://localhost:3000`
- Timer: `http://localhost:8080`

Wird der Timer von einem anderen Geraet im Netzwerk geoeffnet, darf
`TURNIERPLANER_API_BASE_URL` nicht `localhost` enthalten. Stattdessen muss die
vom Browser erreichbare Adresse des Docker-Rechners verwendet werden:

```bash
cat > .env <<'EOF'
TURNIERPLANER_API_BASE_URL=http://192.168.1.10:3000
TURNIERPLANER_INTERNAL_API_BASE_URL=http://turnierplaner:3000
EOF
docker compose up -d --force-recreate turnierplaner-timer-php
```

## Images auf Docker Hub veroeffentlichen

Die Compose-Datei verwendet folgende Docker-Hub-Repositories:

- `hajozi70/turnierplaner`
- `hajozi70/turnierplaner-timer-php`

Vor dem Push auf Docker Hub anmelden und einen Versions-Tag festlegen:

```bash
docker login
export VERSION=1.0.0
```

Beide fertigen Images mit diesem Tag bauen und pushen:

```bash
npm install
docker compose build --pull turnierplaner turnierplaner-timer-php
docker compose push turnierplaner turnierplaner-timer-php
```

Dies veroeffentlicht:

```text
hajozi70/turnierplaner:1.0.0
hajozi70/turnierplaner-timer-php:1.0.0
```

Nach erfolgreichem Push dieselben Images optional zusaetzlich als `latest`
veroeffentlichen:

```bash
docker tag "hajozi70/turnierplaner:${VERSION}" \
  hajozi70/turnierplaner:latest
docker tag "hajozi70/turnierplaner-timer-php:${VERSION}" \
  hajozi70/turnierplaner-timer-php:latest

docker push hajozi70/turnierplaner:latest
docker push hajozi70/turnierplaner-timer-php:latest
```

Auf einem Zielrechner eine bestimmte Version herunterladen und ohne lokalen
Build starten:

```bash
export VERSION=1.0.0
docker compose pull turnierplaner turnierplaner-timer-php
docker compose up -d --no-build
```

Soll auf einem getrennten Timer-Rechner nur das Timer-Image aktualisiert werden:

```bash
export VERSION=1.0.0
docker compose pull turnierplaner-timer-php
docker compose up -d --no-deps --no-build turnierplaner-timer-php
```

## Betrieb

Status und Logs anzeigen:

```bash
docker compose ps
docker compose logs -f turnierplaner
docker compose logs -f turnierplaner-timer-php
```

Services neu bauen:

```bash
docker compose build --pull turnierplaner
docker compose build --pull turnierplaner-timer-php
docker compose up -d
```

Container stoppen und entfernen:

```bash
docker compose down
```

## Daten und Backup

Der lokale Ordner `data` wird nach `/app/data` in den Node-Container gemountet.
Dadurch bleiben Daten beim Ersetzen des Containers erhalten.

Nach Schreiboperationen erzeugt das Backend `data/app.backup.db`. Fuer eine
Wiederherstellung eine vollstaendige SQLite-Datei zuerst unter einem temporaeren
Namen nach `data` kopieren und anschliessend atomar umbenennen:

```bash
cp /pfad/zum/backup.db data/app.restore.db.tmp
mv data/app.restore.db.tmp data/app.restore.db
```

Das Backend erkennt `app.restore.db`, ersetzt damit `app.db` und entfernt die
Restore-Datei.

## Lizenz

Dieses Projekt steht unter der Apache License 2.0. Details stehen in `LICENSE`
und `NOTICE`.