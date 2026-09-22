const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "app.db");
const backupDbPath = path.join(__dirname, "data", "app.backup.db");
const temporaryBackupDbPath = path.join(__dirname, "data", "app.backup.tmp.db");
const restoreDbPath = path.join(__dirname, "data", "app.restore.db");
const replacedDbPath = path.join(__dirname, "data", "app.replace.tmp.db");
const timerConfigPath = path.join(__dirname, "data", "timer_config.json");
const restoreCheckIntervalMs = 15_000;

let db = new sqlite3.Database(dbPath);
let databaseBackupQueue = Promise.resolve();
let databaseRestoreInProgress = false;
let activeApiRequestCount = 0;
let resolveActiveApiRequests = null;

/**
 * Opens a new SQLite database connection for the current database file.
 * @returns {void} Updates the active database connection.
 */
function openDatabase() {
  db = new sqlite3.Database(dbPath);
}

/**
 * Closes the active SQLite database connection.
 * @returns {Promise<void>} Resolves after the connection has closed.
 */
function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * Waits until all API requests accepted before a database restore have completed.
 * @returns {Promise<void>} Resolves when no API request remains active.
 */
function waitForActiveApiRequests() {
  if (activeApiRequestCount === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    resolveActiveApiRequests = resolve;
  });
}

/**
 * Applies a fully prepared restore database file to the running backend.
 * @returns {Promise<boolean>} True when a restore file was found and applied.
 */
async function applyPendingDatabaseRestore() {
  if (databaseRestoreInProgress) {
    return false;
  }

  try {
    await fs.promises.access(restoreDbPath, fs.constants.F_OK);
  } catch {
    return false;
  }

  databaseRestoreInProgress = true;
  try {
    await waitForActiveApiRequests();
    await databaseBackupQueue;
    await closeDatabase();

    await fs.promises.rm(replacedDbPath, { force: true });
    await fs.promises.rename(dbPath, replacedDbPath);

    try {
      await fs.promises.rename(restoreDbPath, dbPath);
    } catch (error) {
      await fs.promises.rename(replacedDbPath, dbPath);
      throw error;
    }

    await fs.promises.rm(replacedDbPath, { force: true });
    openDatabase();
    return true;
  } finally {
    databaseRestoreInProgress = false;
  }
}

/**
 * Checks for a prepared restore database and logs unexpected restore failures.
 * @returns {Promise<void>} Resolves after the restore check finishes.
 */
async function checkForPendingDatabaseRestore() {
  try {
    const restored = await applyPendingDatabaseRestore();
    if (restored) {
      // eslint-disable-next-line no-console
      console.log("Database restore applied from data/app.restore.db.");
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Database restore failed:", error);
    try {
      await fs.promises.access(dbPath, fs.constants.F_OK);
      openDatabase();
    } catch (_) {
      // Keep the failure visible in the log; no database file is available to reopen.
    }
  }
}

/**
 * Executes a SQL write statement and resolves with sqlite run metadata.
 * @param {string} sql SQL statement.
 * @param {Array<*>} [params=[]] Positional SQL parameters.
 * @returns {Promise<import('sqlite3').RunResult>} sqlite run result object.
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

/**
 * Creates a consistent SQLite backup in a temporary file.
 * @returns {Promise<void>} Resolves after the SQLite backup API has finished.
 */
function createTemporaryDatabaseBackup() {
  return new Promise((resolve, reject) => {
    const backup = db.backup(temporaryBackupDbPath);
    backup.step(-1, (stepError) => {
      if (stepError) {
        backup.finish(() => reject(stepError));
        return;
      }

      backup.finish((finishError) => {
        if (finishError) {
          reject(finishError);
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Creates and atomically publishes a current database backup.
 * @returns {Promise<void>} Resolves after the backup file has been replaced.
 */
function createDatabaseBackup() {
  const backupTask = databaseBackupQueue.then(async () => {
    await fs.promises.rm(temporaryBackupDbPath, { force: true });
    await createTemporaryDatabaseBackup();
    await fs.promises.rename(temporaryBackupDbPath, backupDbPath);
  });

  databaseBackupQueue = backupTask.catch(() => undefined);
  return backupTask;
}

/**
 * Commits the active transaction and creates a current database backup.
 * @returns {Promise<void>} Resolves after the transaction and backup succeed.
 */
async function commitAndBackup() {
  await run("COMMIT");
  await createDatabaseBackup();
}

/**
 * Executes a SQL query and resolves with all result rows.
 * @param {string} sql SQL query.
 * @param {Array<*>} [params=[]] Positional SQL parameters.
 * @returns {Promise<Array<object>>} Query result rows.
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

/**
 * Returns the first row of a SQL query or undefined when no row exists.
 * @param {string} sql SQL query.
 * @param {Array<*>} [params=[]] Positional SQL parameters.
 * @returns {Promise<object|undefined>} First query row or undefined.
 */
async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows[0];
}

/**
 * Creates the setup table with dedicated columns for all setup fields.
 * @returns {Promise<void>} Resolves when table creation is complete.
 */
async function createSetupTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS setup (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      tournament_name TEXT NOT NULL,
      logo TEXT NOT NULL,
      tournament_date TEXT NOT NULL,
      tournament_time TEXT NOT NULL,
      fields INTEGER NOT NULL,
      sets_per_match INTEGER NOT NULL,
      minutes_per_set INTEGER NOT NULL,
      minutes_between_sets INTEGER NOT NULL,
      pause_between_matches INTEGER NOT NULL,
      lunch_break_time TEXT NOT NULL,
      lunch_break_duration INTEGER NOT NULL,
      app_password_hash TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    )
  `);
}

/**
 * Converts normalized setup settings into setup table insert/update parameters.
 * @param {object} settings Normalized setup settings.
 * @returns {Array<*>} SQL parameter list for setup field values.
 */
function setupSettingsToSqlParams(settings) {
  return [
    settings.tournament_name,
    settings.logo,
    settings.tournament_date,
    settings.tournament_time,
    settings.fields,
    settings.sets_per_match,
    settings.minutes_per_set,
    settings.minutes_between_sets,
    settings.pause_between_matches,
    settings.lunch_break.time,
    settings.lunch_break.duration,
  ];
}

/**
 * Maps one setup table row into API setup payload format.
 * @param {object|undefined} row Setup database row.
 * @returns {object} Normalized setup object.
 */
function setupRowToSettings(row) {
  if (!row) {
    return getDefaultTournamentSettings();
  }

  return normalizeTournamentSettings({
    tournament_name: row.tournament_name,
    logo: row.logo,
    tournament_date: row.tournament_date,
    tournament_time: row.tournament_time,
    fields: row.fields,
    sets_per_match: row.sets_per_match,
    minutes_per_set: row.minutes_per_set,
    minutes_between_sets: row.minutes_between_sets,
    pause_between_matches: row.pause_between_matches,
    lunch_break: {
      time: row.lunch_break_time,
      duration: row.lunch_break_duration,
    },
  });
}

/**
 * Creates the default setup record if it does not exist yet.
 * @returns {Promise<void>} Resolves after setup bootstrap.
 */
async function ensureSetupRow() {
  const setupRow = await get("SELECT id FROM setup WHERE id = 1");
  if (!setupRow) {
    await run(
      `INSERT INTO setup (
        id,
        tournament_name,
        logo,
        tournament_date,
        tournament_time,
        fields,
        sets_per_match,
        minutes_per_set,
        minutes_between_sets,
        pause_between_matches,
        lunch_break_time,
        lunch_break_duration,
        app_password_hash,
        updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [...setupSettingsToSqlParams(getDefaultTournamentSettings()), ""]
    );
  }
}

/**
 * Creates required tables and ensures initial records exist.
 * @returns {Promise<void>} Resolves after database initialization.
 */
async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      available_as_team INTEGER NOT NULL DEFAULT 1,
      available_as_referee INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    )
  `);

  try {
    await run("ALTER TABLE teams ADD COLUMN available_as_team INTEGER NOT NULL DEFAULT 1");
  } catch (_) {
    // Column already present.
  }

  try {
    await run("ALTER TABLE teams ADD COLUMN available_as_referee INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already present.
  }

  await run(`
    CREATE TABLE IF NOT EXISTS phases (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    )
  `);

  // Add mode_type column to phases if it does not exist yet.
  try {
    await run("ALTER TABLE phases ADD COLUMN mode_type TEXT NOT NULL DEFAULT ''");
  } catch (_) {
    // Column already present — no action needed.
  }

  await run(`
    CREATE TABLE IF NOT EXISTS phase_blocks (
      id INTEGER PRIMARY KEY,
      phase_id INTEGER NOT NULL,
      block_name TEXT NOT NULL DEFAULT '',
      block_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_phase_id INTEGER,
      teams_per_group INTEGER NOT NULL,
      position INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS phase_block_slots (
      block_id INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      entry_value TEXT,
      PRIMARY KEY (block_id, slot_index)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS placements (
      id INTEGER PRIMARY KEY,
      team_count INTEGER NOT NULL,
      position_number INTEGER NOT NULL,
      position_label TEXT NOT NULL,
      position_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS placement_entries (
      id INTEGER PRIMARY KEY,
      placement_id INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      entry_type TEXT NOT NULL,
      entry_source_id INTEGER,
      entry_source_phase_id INTEGER,
      entry_group_name TEXT,
      entry_group_position INTEGER,
      entry_match_result TEXT,
      entry_match_name TEXT,
      entry_team_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (placement_id) REFERENCES placements(id)
    )
  `);

  try {
    await run("ALTER TABLE placement_entries ADD COLUMN entry_group_name TEXT");
  } catch (error) {
    // Column already present - no action needed.
  }

  try {
    await run("ALTER TABLE placement_entries ADD COLUMN entry_group_position INTEGER");
  } catch (error) {
    // Column already present - no action needed.
  }

  try {
    await run("ALTER TABLE placement_entries ADD COLUMN entry_match_result TEXT");
  } catch (error) {
    // Column already present - no action needed.
  }

  try {
    await run("ALTER TABLE placement_entries ADD COLUMN entry_match_name TEXT");
  } catch (error) {
    // Column already present - no action needed.
  }

  try {
    await run("ALTER TABLE phase_blocks ADD COLUMN block_name TEXT NOT NULL DEFAULT ''");
  } catch (error) {
    // Column already present - no action needed.
  }

  await createSetupTable();

  try {
    await run("ALTER TABLE setup ADD COLUMN app_password_hash TEXT NOT NULL DEFAULT ''");
  } catch (_) {
    // Column already present.
  }

  await run(`
    CREATE TABLE IF NOT EXISTS scoring_mode_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      mode_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const scoringModeRow = await get("SELECT id FROM scoring_mode_state WHERE id = 1");
  if (!scoringModeRow) {
    await run(
      "INSERT INTO scoring_mode_state (id, mode_key, updated_at) VALUES (1, ?, datetime('now'))",
      ["vereinfachter_turniermodus"]
    );
  }

  await run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY,
      phase_id INTEGER NOT NULL,
      block_id INTEGER,
      block_name TEXT NOT NULL DEFAULT '',
      team1_id INTEGER,
      team2_id INTEGER,
      team1_ref TEXT,
      team2_ref TEXT,
      referee_id INTEGER,
      field_number INTEGER NOT NULL DEFAULT 1,
      start_time TEXT NOT NULL DEFAULT '',
      entry_type TEXT NOT NULL DEFAULT 'match',
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      is_finished INTEGER NOT NULL DEFAULT 0,
      winner_id INTEGER,
      loser_id INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (phase_id) REFERENCES phases(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS match_sets (
      id INTEGER PRIMARY KEY,
      match_id INTEGER NOT NULL,
      set_index INTEGER NOT NULL,
      team1_score INTEGER,
      team2_score INTEGER,
      is_finished INTEGER NOT NULL DEFAULT 0,
      UNIQUE (match_id, set_index),
      FOREIGN KEY (match_id) REFERENCES matches(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS started_match_phases (
      phase_id INTEGER PRIMARY KEY,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (phase_id) REFERENCES phases(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS started_match_phase_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      active_phase_id INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (active_phase_id) REFERENCES phases(id)
    )
  `);

  const startedStateRow = await get("SELECT id FROM started_match_phase_state WHERE id = 1");
  if (!startedStateRow) {
    await run(
      "INSERT INTO started_match_phase_state (id, active_phase_id, updated_at) VALUES (1, NULL, datetime('now'))"
    );
  }

  try {
    await run("ALTER TABLE matches ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'match'");
  } catch (_) {
    // Column already present.
  }

  try {
    await run("ALTER TABLE matches ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 0");
  } catch (_) {
    // Column already present.
  }

  // Development mode: keep only the current schema.
  await run("DROP TABLE IF EXISTS app_state");
  await run("DROP TABLE IF EXISTS relations");
  await run("DROP TABLE IF EXISTS gruppe_configs");
  await run("DROP TABLE IF EXISTS gruppe_slots");
  await run("DROP TABLE IF EXISTS tournament_settings");

  await ensureSetupRow();
}

/**
 * Returns default setup values for tournament configuration.
 * @returns {object} Default setup object.
 */
function getDefaultTournamentSettings() {
  return {
    tournament_name: "",
    logo: "",
    tournament_date: "",
    tournament_time: "",
    fields: 1,
    sets_per_match: 1,
    minutes_per_set: 10,
    minutes_between_sets: 0,
    pause_between_matches: 0,
    lunch_break: {
      time: "",
      duration: 0,
    },
  };
}

/**
 * Converts an input value to a trimmed string.
 * @param {*} value Raw input value.
 * @returns {string} Trimmed string.
 */
function normalizeString(value) {
  return String(value || "").trim();
}

/**
 * Converts raw password input to a string without trimming.
 * @param {*} value Raw password input.
 * @returns {string} Password input as string.
 */
function normalizePasswordInput(value) {
  return typeof value === "string" ? value : String(value || "");
}

/**
 * Returns whether a stored hash value is set and non-empty.
 * @param {*} value Stored hash value.
 * @returns {boolean} True when password hash exists.
 */
function hasStoredPasswordHash(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * Creates a salted scrypt hash for one plaintext password.
 * @param {string} password Plaintext password.
 * @returns {string} Stored hash format: scrypt$<saltHex>$<hashHex>.
 */
function createPasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Verifies one plaintext password against a stored hash.
 * @param {string} password Plaintext password.
 * @param {string} storedHash Stored hash string.
 * @returns {boolean} True when password is valid.
 */
function verifyPasswordHash(password, storedHash) {
  if (!hasStoredPasswordHash(storedHash)) {
    return false;
  }

  const parts = String(storedHash).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const saltHex = parts[1];
  const expectedHashHex = parts[2];
  if (!saltHex || !expectedHashHex) {
    return false;
  }

  let salt;
  let expectedHash;
  try {
    salt = Buffer.from(saltHex, "hex");
    expectedHash = Buffer.from(expectedHashHex, "hex");
  } catch {
    return false;
  }

  if (expectedHash.length === 0) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, expectedHash.length);
  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualHash, expectedHash);
}

/**
 * Loads the currently stored app password hash.
 * @returns {Promise<string>} Stored password hash or empty string.
 */
async function loadStoredAppPasswordHash() {
  const row = await get("SELECT app_password_hash FROM setup WHERE id = 1");
  return typeof row?.app_password_hash === "string" ? row.app_password_hash : "";
}

/**
 * Validates and normalizes date values in YYYY-MM-DD format.
 * @param {*} value Raw date input.
 * @returns {string} Normalized date or empty string.
 */
function normalizeDate(value) {
  const normalized = normalizeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

/**
 * Validates and normalizes time values in HH:mm format.
 * @param {*} value Raw time input.
 * @returns {string} Normalized time or empty string.
 */
function normalizeTime(value) {
  const normalized = normalizeString(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : "";
}

/**
 * Converts a value to a non-negative integer.
 * @param {*} value Raw numeric input.
 * @param {number} [fallback=0] Fallback value when parsing fails.
 * @returns {number} Non-negative integer result.
 */
function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsed));
}

/**
 * Converts a value to boolean with fallback.
 * @param {*} value Raw boolean-like input.
 * @param {boolean} [fallback=false] Fallback value.
 * @returns {boolean} Normalized boolean.
 */
function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === "1" || value === "true" || value === "on") {
    return true;
  }
  if (value === 0 || value === "0" || value === "false" || value === "off") {
    return false;
  }
  return fallback;
}

/**
 * Validates and normalizes timer values in MM:SS or H:MM:SS-like text input format.
 * @param {*} value Raw timer input.
 * @returns {string} Normalized timer value or empty string.
 */
function normalizeTimerInputValue(value) {
  const normalized = normalizeString(value);
  return /^\d{1,2}:\d{2}$/.test(normalized) ? normalized : "";
}

/**
 * Loads the persisted timer configuration JSON file.
 * @returns {Promise<object>} Parsed timer configuration object.
 */
async function loadTimerConfigFile() {
  const rawContent = await fs.promises.readFile(timerConfigPath, "utf8");
  const parsedContent = JSON.parse(rawContent);
  return parsedContent && typeof parsedContent === "object" ? parsedContent : {};
}

/**
 * Writes one timer configuration object to disk.
 * @param {object} config Timer configuration payload.
 * @returns {Promise<void>} Resolves when the file has been written.
 */
async function saveTimerConfigFile(config) {
  const jsonContent = `${JSON.stringify(config, null, 2)}\n`;
  await fs.promises.writeFile(timerConfigPath, jsonContent, "utf8");
}

/**
 * Normalizes a timer config update payload coming from the UI.
 * @param {object} input Raw request payload.
 * @returns {{start: string, alerts: Array<{id: number, alertTime: string}>}|null} Normalized update or null when invalid.
 */
function normalizeTimerConfigUpdate(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const start = normalizeTimerInputValue(input.start);
  if (!start) {
    return null;
  }

  if (!Array.isArray(input.alerts)) {
    return null;
  }

  const alerts = [];
  for (const rawAlert of input.alerts) {
    const alertId = Number(rawAlert?.id);
    const alertTime = normalizeTimerInputValue(rawAlert?.alertTime);
    if (!Number.isInteger(alertId) || alertId <= 0 || !alertTime) {
      return null;
    }

    alerts.push({ id: alertId, alertTime });
  }

  return { start, alerts };
}

/**
 * Merges a normalized timer update into an existing config object.
 * @param {object} currentConfig Existing timer configuration.
 * @param {{start: string, alerts: Array<{id: number, alertTime: string}>}} update Normalized timer update.
 * @returns {object} Merged timer configuration.
 */
function mergeTimerConfig(currentConfig, update) {
  const nextConfig = {
    ...(currentConfig && typeof currentConfig === "object" ? currentConfig : {}),
  };

  nextConfig.start = update.start;

  const existingAlerts = Array.isArray(nextConfig.alerts) ? nextConfig.alerts : [];
  const mergedAlerts = existingAlerts.map((alert) => {
    if (!alert || typeof alert !== "object") {
      return alert;
    }
    return { ...alert };
  });

  const alertsById = new Map(
    mergedAlerts
      .filter((alert) => alert && typeof alert === "object")
      .map((alert) => [Number(alert.id), alert])
  );

  update.alerts.forEach((alertUpdate) => {
    const currentAlert = alertsById.get(alertUpdate.id);
    if (currentAlert) {
      currentAlert.alertTime = alertUpdate.alertTime;
      return;
    }

    mergedAlerts.push({ id: alertUpdate.id, alertTime: alertUpdate.alertTime });
  });

  nextConfig.alerts = mergedAlerts;
  return nextConfig;
}

/**
 * Reads configured set count from current setup settings.
 * @returns {Promise<number>} Configured set count per match.
 */
async function loadConfiguredSetCount() {
  const setupRow = await get("SELECT sets_per_match FROM setup WHERE id = 1");
  return Math.max(1, normalizeInteger(setupRow?.sets_per_match, 1));
}

/**
 * Loads the persisted scoring mode key.
 * @returns {Promise<"vereinfachter_turniermodus"|"offizieller_modus">} Active scoring mode key.
 */
async function loadScoringModeKey() {
  const row = await get("SELECT mode_key FROM scoring_mode_state WHERE id = 1");
  return normalizeScoringModeKey(row?.mode_key);
}

/**
 * Aggregates finished set statistics for one match.
 * @param {Array<object>} sets Set rows with team1_score, team2_score, is_finished.
 * @returns {{team1Wins: number, team2Wins: number, team1Draws: number, team2Draws: number, team1Points: number, team2Points: number, finishedSetCount: number, hasSetDraw: boolean}} Aggregated set statistics.
 */
function aggregateFinishedSetStats(sets) {
  const stats = {
    team1Wins: 0,
    team2Wins: 0,
    team1Draws: 0,
    team2Draws: 0,
    team1Points: 0,
    team2Points: 0,
    finishedSetCount: 0,
    hasSetDraw: false,
  };

  (Array.isArray(sets) ? sets : []).forEach((entry) => {
    if (!normalizeBoolean(entry?.is_finished, false)) {
      return;
    }

    const team1Score = Number(entry?.team1_score);
    const team2Score = Number(entry?.team2_score);
    if (!Number.isFinite(team1Score) || !Number.isFinite(team2Score)) {
      return;
    }

    stats.finishedSetCount += 1;
    stats.team1Points += team1Score;
    stats.team2Points += team2Score;

    if (team1Score === team2Score) {
      stats.team1Draws += 1;
      stats.team2Draws += 1;
      stats.hasSetDraw = true;
      return;
    }

    if (team1Score > team2Score) {
      stats.team1Wins += 1;
    } else {
      stats.team2Wins += 1;
    }
  });

  return stats;
}

/**
 * Calculates match points for one team pair in the simplified scoring mode.
 * @param {{team1Wins: number, team2Wins: number, team1Draws: number, team2Draws: number}} setStats Aggregated set statistics.
 * @returns {{team1MatchPoints: number, team2MatchPoints: number}} Match points for group ranking.
 */
function calculateSimplifiedGroupMatchPoints(setStats) {
  return {
    team1MatchPoints: setStats.team1Wins * 2 + setStats.team1Draws,
    team2MatchPoints: setStats.team2Wins * 2 + setStats.team2Draws,
  };
}

/**
 * Calculates match points for one team pair in the official scoring mode.
 * @param {{team1Wins: number, team2Wins: number}} setStats Aggregated set statistics.
 * @param {number} configuredSetCount Configured number of sets per match.
 * @returns {{team1MatchPoints: number, team2MatchPoints: number}} Match points for group ranking.
 */
function calculateOfficialGroupMatchPoints(setStats, configuredSetCount) {
  if (setStats.team1Wins === setStats.team2Wins) {
    return {
      team1MatchPoints: 0,
      team2MatchPoints: 0,
    };
  }

  const winnerIsTeam1 = setStats.team1Wins > setStats.team2Wins;
  const loserWins = winnerIsTeam1 ? setStats.team2Wins : setStats.team1Wins;
  const isShortMatch = Math.max(1, configuredSetCount) <= 3;
  const winnerPoints = isShortMatch
    ? (loserWins === 0 ? 3 : 2)
    : (loserWins <= 1 ? 3 : 2);
  const loserPoints = winnerPoints === 3 ? 0 : 1;

  return winnerIsTeam1
    ? { team1MatchPoints: winnerPoints, team2MatchPoints: loserPoints }
    : { team1MatchPoints: loserPoints, team2MatchPoints: winnerPoints };
}

/**
 * Resolves winner and loser ids from aggregated set stats.
 * Primary criterion is number of set wins. If set wins are tied,
 * total scored points across finished sets are used as tie-breaker.
 * @param {{team1Wins: number, team2Wins: number, team1Points: number, team2Points: number}} setStats Aggregated set statistics.
 * @param {number|null} team1Id Team 1 id from match row.
 * @param {number|null} team2Id Team 2 id from match row.
 * @returns {{winnerId: number|null, loserId: number|null}|null} Winner/loser ids, or null when no unique winner exists.
 */
function resolveWinnerAndLoserFromSetStats(setStats, team1Id, team2Id) {
  const hasTeam1 = Number.isInteger(team1Id) && team1Id > 0;
  const hasTeam2 = Number.isInteger(team2Id) && team2Id > 0;

  if (setStats.team1Wins > setStats.team2Wins && hasTeam1) {
    return {
      winnerId: team1Id,
      loserId: hasTeam2 ? team2Id : null,
    };
  }

  if (setStats.team2Wins > setStats.team1Wins && hasTeam2) {
    return {
      winnerId: team2Id,
      loserId: hasTeam1 ? team1Id : null,
    };
  }

  if (setStats.team1Points > setStats.team2Points && hasTeam1) {
    return {
      winnerId: team1Id,
      loserId: hasTeam2 ? team2Id : null,
    };
  }

  if (setStats.team2Points > setStats.team1Points && hasTeam2) {
    return {
      winnerId: team2Id,
      loserId: hasTeam1 ? team1Id : null,
    };
  }

  return null;
}

/**
 * Calculates match completion and winner/loser ids from set rows.
 * @param {Array<object>} sets Set rows with team1_score, team2_score, is_finished.
 * @param {number|null} team1Id Team 1 id from match row.
 * @param {number|null} team2Id Team 2 id from match row.
 * @param {number} configuredSetCount Configured number of sets for one match.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} scoringModeKey Active scoring mode.
 * @param {{allowDrawOutcome?: boolean}} [options] Additional validation options.
 * @returns {{ isFinished: number, winnerId: number|null, loserId: number|null, isDraw: boolean, error: string|null, setStats: object }} Match outcome.
 */
function calculateMatchOutcomeFromSets(
  sets,
  team1Id,
  team2Id,
  configuredSetCount,
  scoringModeKey,
  options = {}
) {
  const setStats = aggregateFinishedSetStats(sets);
  const hasAllConfiguredSets = setStats.finishedSetCount >= Math.max(1, configuredSetCount);
  const isFinished = hasAllConfiguredSets ? 1 : 0;
  const allowDrawOutcome = options.allowDrawOutcome !== false;

  if (isFinished === 0) {
    return {
      isFinished: 0,
      winnerId: null,
      loserId: null,
      isDraw: false,
      error: null,
      setStats,
    };
  }

  if (scoringModeKey === "offizieller_modus" && setStats.hasSetDraw) {
    return {
      isFinished: 0,
      winnerId: null,
      loserId: null,
      isDraw: false,
      error: "Im offiziellen Modus sind Satz-Unentschieden nicht erlaubt.",
      setStats,
    };
  }

  const winnerOutcome = resolveWinnerAndLoserFromSetStats(setStats, team1Id, team2Id);
  if (winnerOutcome) {
    return {
      isFinished: 1,
      winnerId: winnerOutcome.winnerId,
      loserId: winnerOutcome.loserId,
      isDraw: false,
      error: null,
      setStats,
    };
  }

  if (!allowDrawOutcome) {
    return {
      isFinished: 0,
      winnerId: null,
      loserId: null,
      isDraw: true,
      error: "Dieses Match benoetigt einen eindeutigen Gewinner.",
      setStats,
    };
  }

  return {
    isFinished: 1,
    winnerId: null,
    loserId: null,
    isDraw: true,
    error: null,
    setStats,
  };
}

/**
 * Builds a map of team rows keyed by team name.
 * @param {Array<object>} teams Team rows from the database.
 * @returns {Map<string, {id: number, name: string}>} Teams keyed by name.
 */
function createTeamsByNameMap(teams) {
  return new Map(
    (Array.isArray(teams) ? teams : [])
      .map((team) => ({ id: Number(team.id), name: normalizeString(team.name) }))
      .filter((team) => Number.isInteger(team.id) && team.id > 0 && team.name)
      .map((team) => [team.name, team])
  );
}

/**
 * Builds a map of team rows keyed by id.
 * @param {Array<object>} teams Team rows from the database.
 * @returns {Map<number, {id: number, name: string}>} Teams keyed by id.
 */
function createTeamsByIdMap(teams) {
  return new Map(
    (Array.isArray(teams) ? teams : [])
      .map((team) => ({ id: Number(team.id), name: normalizeString(team.name) }))
      .filter((team) => Number.isInteger(team.id) && team.id > 0)
      .map((team) => [team.id, team])
  );
}

/**
 * Returns a stable display name for one phase block.
 * @param {object|null|undefined} block Phase block row.
 * @returns {string} Block display name.
 */
function getPhaseBlockDisplayName(block) {
  const blockName = normalizeString(block?.block_name);
  if (blockName) {
    return blockName;
  }
  const blockId = Number(block?.id);
  return Number.isInteger(blockId) && blockId > 0 ? `Block ${blockId}` : "Block";
}

/**
 * Generates round-robin pairs for resolved team descriptors.
 * @param {Array<object>} teamEntries Ordered team descriptors.
 * @returns {Array<{round: number, team1: object, team2: object}>} Generated match pairs.
 */
function generateResolvedRoundRobin(teamEntries) {
  if (!Array.isArray(teamEntries) || teamEntries.length < 2) {
    return [];
  }

  const teams = [...teamEntries];
  if (teams.length % 2 !== 0) {
    teams.push(null);
  }

  const fixed = teams[0];
  const rotating = teams.slice(1);
  const numRounds = teams.length - 1;
  const perRound = teams.length / 2;
  const matches = [];

  for (let round = 0; round < numRounds; round += 1) {
    for (let index = 0; index < perRound; index += 1) {
      const team1 = index === 0 ? fixed : rotating[index - 1];
      const team2 = index === 0 ? rotating[rotating.length - 1] : rotating[rotating.length - 1 - index];
      if (team1 && team2) {
        matches.push({ round, team1, team2 });
      }
    }

    rotating.unshift(rotating.pop());
  }

  return matches;
}

/**
 * Converts a resolved team descriptor into persisted match team fields.
 * @param {{id?: number|null, name?: string|null, ref?: string|null}|null} descriptor Resolved descriptor.
 * @returns {{teamId: number|null, teamRef: string|null}} Persistable team fields.
 */
function descriptorToMatchFields(descriptor) {
  if (!descriptor) {
    return { teamId: null, teamRef: null };
  }

  const descriptorId = Number(descriptor.id);
  if (Number.isInteger(descriptorId) && descriptorId > 0) {
    return {
      teamId: descriptorId,
      teamRef: null,
    };
  }

  return {
    teamId: null,
    teamRef: normalizeString(descriptor.ref) || normalizeString(descriptor.name) || null,
  };
}

/**
 * Resolves one block slot to a current team descriptor.
 * @param {{entry_value?: string|null}|null} slot Phase block slot.
 * @param {{teamsByName: Map<string, object>, teamsById: Map<number, object>, blockById: Map<number, object>, standingsByBlockId: Map<number, Array<object>>, firstMatchByBlockId: Map<number, object>, completedGroupBlockIds?: Set<number>}} context Resolution context.
 * @returns {{id: number|null, name: string|null, ref: string|null}|null} Resolved descriptor.
 */
function resolveBlockSlotDescriptor(slot, context) {
  const entryValue = normalizeString(slot?.entry_value);
  if (!entryValue) {
    return null;
  }

  if (entryValue.startsWith("team:")) {
    const teamName = entryValue.slice(5);
    const team = context.teamsByName.get(teamName);
    return team ? { id: team.id, name: team.name, ref: null } : { id: null, name: teamName, ref: null };
  }

  if (entryValue.startsWith("placement:")) {
    const [, rawBlockId, rawRank] = entryValue.split(":");
    const sourceBlockId = Number(rawBlockId);
    const rank = Number(rawRank);
    const sourceBlock = context.blockById.get(sourceBlockId);
    const sourceName = getPhaseBlockDisplayName(sourceBlock);

    // Group placement references are only materialized after all group matches are completed.
    if (
      normalizeString(sourceBlock?.block_type) === "gruppe" &&
      !(context.completedGroupBlockIds instanceof Set && context.completedGroupBlockIds.has(sourceBlockId))
    ) {
      return { id: null, name: null, ref: `Platz ${rank} (${sourceName})` };
    }

    const standings = context.standingsByBlockId.get(sourceBlockId) || [];
    const rankedTeam = standings.find((entry) => Number(entry.rank) === rank);
    if (rankedTeam && Number.isInteger(Number(rankedTeam.team_id)) && Number(rankedTeam.team_id) > 0) {
      const team = context.teamsById.get(Number(rankedTeam.team_id));
      return {
        id: Number(rankedTeam.team_id),
        name: team?.name || normalizeString(rankedTeam.team_name) || null,
        ref: null,
      };
    }
    return { id: null, name: null, ref: `Platz ${rank} (${sourceName})` };
  }

  if (entryValue.startsWith("match-winner:")) {
    const sourceBlockId = Number(entryValue.split(":")[1]);
    const sourceBlock = context.blockById.get(sourceBlockId);
    const sourceName = getPhaseBlockDisplayName(sourceBlock);
    const sourceMatch = context.firstMatchByBlockId.get(sourceBlockId);
    const winnerId = Number(sourceMatch?.winner_id);
    if (Number.isInteger(winnerId) && winnerId > 0) {
      const team = context.teamsById.get(winnerId);
      return { id: winnerId, name: team?.name || null, ref: null };
    }
    return { id: null, name: null, ref: `Gewinner (${sourceName})` };
  }

  if (entryValue.startsWith("match-loser:")) {
    const sourceBlockId = Number(entryValue.split(":")[1]);
    const sourceBlock = context.blockById.get(sourceBlockId);
    const sourceName = getPhaseBlockDisplayName(sourceBlock);
    const sourceMatch = context.firstMatchByBlockId.get(sourceBlockId);
    const loserId = Number(sourceMatch?.loser_id);
    if (Number.isInteger(loserId) && loserId > 0) {
      const team = context.teamsById.get(loserId);
      return { id: loserId, name: team?.name || null, ref: null };
    }
    return { id: null, name: null, ref: `Verlierer (${sourceName})` };
  }

  return { id: null, name: null, ref: entryValue };
}

/**
 * Builds the expected pair list for one block based on current references.
 * @param {object} block Phase block row with slots.
 * @param {object} context Resolution context.
 * @returns {Array<{team1: object|null, team2: object|null}>} Expected match descriptors for this block.
 */
function buildExpectedBlockPairs(block, context) {
  const orderedSlots = [...(Array.isArray(block?.slots) ? block.slots : [])].sort(
    (left, right) => Number(left.slot_index) - Number(right.slot_index)
  );
  const descriptors = orderedSlots.map((slot) => resolveBlockSlotDescriptor(slot, context));

  if (normalizeString(block?.block_type) === "einzelspiel") {
    return descriptors.length >= 2 ? [{ team1: descriptors[0], team2: descriptors[1] }] : [];
  }

  return generateResolvedRoundRobin(descriptors).map((pair) => ({
    team1: pair.team1,
    team2: pair.team2,
  }));
}

/**
 * Computes group standings for one group block.
 * @param {object} block Phase block row.
 * @param {Array<object>} blockMatches Persisted matches belonging to the block.
 * @param {Map<number, Array<object>>} matchSetsByMatchId Match id to persisted set rows.
 * @param {Array<object>} resolvedSlots Ordered resolved team descriptors for the block slots.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} scoringModeKey Active scoring mode.
 * @param {number} configuredSetCount Configured set count.
 * @param {Map<number, object>} teamsById Teams keyed by id.
 * @returns {Array<object>} Ranked standings rows for the group block.
 */
function calculateGroupStandingsForBlock(
  block,
  blockMatches,
  matchSetsByMatchId,
  resolvedSlots,
  scoringModeKey,
  configuredSetCount,
  teamsById
) {
  const standingsByTeamId = new Map();
  const initialOrder = new Map();

  resolvedSlots.forEach((descriptor, index) => {
    const teamId = Number(descriptor?.id);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return;
    }
    initialOrder.set(teamId, index);
    standingsByTeamId.set(teamId, {
      team_id: teamId,
      team_name: teamsById.get(teamId)?.name || normalizeString(descriptor?.name) || `Team ${teamId}`,
      ranking_points: 0,
      sets_won: 0,
      sets_drawn: 0,
      sets_lost: 0,
      set_diff: 0,
      points_scored: 0,
      points_allowed: 0,
      point_diff: 0,
      matches_played: 0,
      sort_seed: index,
      head_to_head_points: 0,
    });
  });

  (Array.isArray(blockMatches) ? blockMatches : []).forEach((match) => {
    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    if (!standingsByTeamId.has(team1Id) || !standingsByTeamId.has(team2Id)) {
      return;
    }

    const team1Stats = standingsByTeamId.get(team1Id);
    const team2Stats = standingsByTeamId.get(team2Id);
    const setStats = aggregateFinishedSetStats(matchSetsByMatchId.get(Number(match.id)) || []);

    if (setStats.finishedSetCount === 0) {
      return;
    }

    team1Stats.matches_played += 1;
    team2Stats.matches_played += 1;

    team1Stats.sets_won += setStats.team1Wins;
    team1Stats.sets_drawn += setStats.team1Draws;
    team1Stats.sets_lost += setStats.team2Wins;
    team2Stats.sets_won += setStats.team2Wins;
    team2Stats.sets_drawn += setStats.team2Draws;
    team2Stats.sets_lost += setStats.team1Wins;

    team1Stats.points_scored += setStats.team1Points;
    team1Stats.points_allowed += setStats.team2Points;
    team2Stats.points_scored += setStats.team2Points;
    team2Stats.points_allowed += setStats.team1Points;

    const rankingPoints = scoringModeKey === "offizieller_modus"
      ? calculateOfficialGroupMatchPoints(setStats, configuredSetCount)
      : calculateSimplifiedGroupMatchPoints(setStats);

    team1Stats.ranking_points += rankingPoints.team1MatchPoints;
    team2Stats.ranking_points += rankingPoints.team2MatchPoints;
  });

  standingsByTeamId.forEach((entry) => {
    entry.set_diff = entry.sets_won - entry.sets_lost;
    entry.point_diff = entry.points_scored - entry.points_allowed;
  });

  const standings = [...standingsByTeamId.values()];
  const tieGroups = new Map();

  standings.forEach((entry) => {
    const key = `${entry.ranking_points}:${entry.set_diff}`;
    if (!tieGroups.has(key)) {
      tieGroups.set(key, []);
    }
    tieGroups.get(key).push(entry.team_id);
  });

  tieGroups.forEach((teamIds) => {
    if (teamIds.length < 2) {
      return;
    }

    const tieSet = new Set(teamIds);
    const headToHead = new Map(teamIds.map((teamId) => [teamId, 0]));
    (Array.isArray(blockMatches) ? blockMatches : []).forEach((match) => {
      const team1Id = Number(match.team1_id);
      const team2Id = Number(match.team2_id);
      if (!tieSet.has(team1Id) || !tieSet.has(team2Id)) {
        return;
      }

      const setStats = aggregateFinishedSetStats(matchSetsByMatchId.get(Number(match.id)) || []);
      if (setStats.finishedSetCount === 0) {
        return;
      }

      const rankingPoints = scoringModeKey === "offizieller_modus"
        ? calculateOfficialGroupMatchPoints(setStats, configuredSetCount)
        : calculateSimplifiedGroupMatchPoints(setStats);
      headToHead.set(team1Id, (headToHead.get(team1Id) || 0) + rankingPoints.team1MatchPoints);
      headToHead.set(team2Id, (headToHead.get(team2Id) || 0) + rankingPoints.team2MatchPoints);
    });

    teamIds.forEach((teamId) => {
      const standing = standingsByTeamId.get(teamId);
      if (standing) {
        standing.head_to_head_points = headToHead.get(teamId) || 0;
      }
    });
  });

  standings.sort((left, right) => {
    if (right.ranking_points !== left.ranking_points) {
      return right.ranking_points - left.ranking_points;
    }
    if (right.set_diff !== left.set_diff) {
      return right.set_diff - left.set_diff;
    }
    if (right.head_to_head_points !== left.head_to_head_points) {
      return right.head_to_head_points - left.head_to_head_points;
    }
    if (right.point_diff !== left.point_diff) {
      return right.point_diff - left.point_diff;
    }
    return (initialOrder.get(left.team_id) || 0) - (initialOrder.get(right.team_id) || 0);
  });

  return standings.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    block_id: Number(block?.id) || null,
    block_name: getPhaseBlockDisplayName(block),
  }));
}

/**
 * Loads all phase blocks keyed by phase id.
 * @returns {Promise<{phases: Array<object>, blocksByPhaseId: Map<number, Array<object>>, blockById: Map<number, object>}>} Ordered phases and block maps.
 */
async function loadAllPhaseBlocksState() {
  const phases = await all("SELECT id, name, position FROM phases ORDER BY position ASC, id ASC");
  const blocksByPhaseId = new Map();
  const blockById = new Map();

  for (const phase of phases) {
    const blocks = await loadPhaseBlocksWithSlots(Number(phase.id));
    blocksByPhaseId.set(Number(phase.id), blocks);
    blocks.forEach((block) => {
      blockById.set(Number(block.id), block);
    });
  }

  return {
    phases,
    blocksByPhaseId,
    blockById,
  };
}

/**
 * Returns whether a match block feeds future match-winner or match-loser references.
 * @param {number|null} blockId Source block id.
 * @returns {Promise<boolean>} True when future slots depend on a clear match result.
 */
async function blockHasOutcomeReferenceConsumers(blockId) {
  const normalizedBlockId = Number(blockId);
  if (!Number.isInteger(normalizedBlockId) || normalizedBlockId <= 0) {
    return false;
  }

  const row = await get(
    "SELECT 1 FROM phase_block_slots WHERE entry_value IN (?, ?) LIMIT 1",
    [`match-winner:${normalizedBlockId}`, `match-loser:${normalizedBlockId}`]
  );
  return Boolean(row);
}

/**
 * Re-evaluates dependent match participants and derived group standings after a result change.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} scoringModeKey Active scoring mode.
 * @param {number} configuredSetCount Configured set count.
 * @returns {Promise<Map<number, Array<object>>>} Calculated group standings by block id.
 */
async function recomputeDerivedMatchState(scoringModeKey, configuredSetCount) {
  const teams = await all("SELECT id, name FROM teams ORDER BY position ASC, id ASC");
  const teamsByName = createTeamsByNameMap(teams);
  const teamsById = createTeamsByIdMap(teams);
  const phaseState = await loadAllPhaseBlocksState();
  const matches = await all(
    `SELECT m.*, p.position AS phase_position
     FROM matches m
     LEFT JOIN phases p ON p.id = m.phase_id
     ORDER BY COALESCE(p.position, 0) ASC, m.position ASC, m.id ASC`
  );
  const matchIds = matches.map((match) => Number(match.id)).filter((id) => Number.isInteger(id) && id > 0);
  const matchSetsByMatchId = new Map();

  if (matchIds.length > 0) {
    const placeholders = matchIds.map(() => "?").join(",");
    const setRows = await all(
      `SELECT * FROM match_sets WHERE match_id IN (${placeholders}) ORDER BY match_id ASC, set_index ASC, id ASC`,
      matchIds
    );
    setRows.forEach((setRow) => {
      const matchId = Number(setRow.match_id);
      if (!matchSetsByMatchId.has(matchId)) {
        matchSetsByMatchId.set(matchId, []);
      }
      matchSetsByMatchId.get(matchId).push(setRow);
    });
  }

  const matchesByBlockId = new Map();
  const firstMatchByBlockId = new Map();
  matches.forEach((match) => {
    const blockId = Number(match.block_id);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      return;
    }
    if (!matchesByBlockId.has(blockId)) {
      matchesByBlockId.set(blockId, []);
    }
    matchesByBlockId.get(blockId).push(match);
  });
  matchesByBlockId.forEach((blockMatches) => {
    blockMatches.sort((left, right) => Number(left.position) - Number(right.position) || Number(left.id) - Number(right.id));
    if (blockMatches.length > 0) {
      firstMatchByBlockId.set(Number(blockMatches[0].block_id), blockMatches[0]);
    }
  });

  const standingsByBlockId = new Map();
  const completedGroupBlockIds = new Set();

  for (const phase of phaseState.phases) {
    const blocks = phaseState.blocksByPhaseId.get(Number(phase.id)) || [];
    for (const block of blocks) {
      const context = {
        teamsByName,
        teamsById,
        blockById: phaseState.blockById,
        standingsByBlockId,
        firstMatchByBlockId,
        completedGroupBlockIds,
      };
      const orderedSlots = [...(Array.isArray(block.slots) ? block.slots : [])].sort(
        (left, right) => Number(left.slot_index) - Number(right.slot_index)
      );
      const resolvedSlots = orderedSlots.map((slot) => resolveBlockSlotDescriptor(slot, context));
      const expectedPairs = buildExpectedBlockPairs(block, context);
      const blockMatches = matchesByBlockId.get(Number(block.id)) || [];

      for (let index = 0; index < blockMatches.length; index += 1) {
        const match = blockMatches[index];
        const expectedPair = expectedPairs[index] || { team1: null, team2: null };
        const nextTeam1 = descriptorToMatchFields(expectedPair.team1);
        const nextTeam2 = descriptorToMatchFields(expectedPair.team2);
        const currentTeam1Id = Number(match.team1_id);
        const currentTeam2Id = Number(match.team2_id);
        const currentTeam1Ref = normalizeString(match.team1_ref) || null;
        const currentTeam2Ref = normalizeString(match.team2_ref) || null;

        const participantChanged =
          (Number.isInteger(currentTeam1Id) && currentTeam1Id > 0 ? currentTeam1Id : null) !== nextTeam1.teamId ||
          (Number.isInteger(currentTeam2Id) && currentTeam2Id > 0 ? currentTeam2Id : null) !== nextTeam2.teamId ||
          currentTeam1Ref !== nextTeam1.teamRef ||
          currentTeam2Ref !== nextTeam2.teamRef;

        if (participantChanged) {
          await run(
            `UPDATE matches
             SET team1_id = ?, team2_id = ?, team1_ref = ?, team2_ref = ?,
                 is_finished = 0, winner_id = NULL, loser_id = NULL
             WHERE id = ?`,
            [nextTeam1.teamId, nextTeam2.teamId, nextTeam1.teamRef, nextTeam2.teamRef, Number(match.id)]
          );
          await run("DELETE FROM match_sets WHERE match_id = ?", [Number(match.id)]);
          match.team1_id = nextTeam1.teamId;
          match.team2_id = nextTeam2.teamId;
          match.team1_ref = nextTeam1.teamRef;
          match.team2_ref = nextTeam2.teamRef;
          match.is_finished = 0;
          match.winner_id = null;
          match.loser_id = null;
          matchSetsByMatchId.set(Number(match.id), []);
        }
      }

      const finishedMatches = blockMatches.filter((match) => Number(match.is_finished) > 0).length;
      const expectedMatchCount = expectedPairs.length;
      const isGroupBlock = normalizeString(block.block_type) === "gruppe";

      if (isGroupBlock && expectedMatchCount > 0 && finishedMatches >= expectedMatchCount) {
        completedGroupBlockIds.add(Number(block.id));
      } else {
        completedGroupBlockIds.delete(Number(block.id));
      }

      if (isGroupBlock) {
        standingsByBlockId.set(
          Number(block.id),
          calculateGroupStandingsForBlock(
            block,
            blockMatches,
            matchSetsByMatchId,
            resolvedSlots,
            scoringModeKey,
            configuredSetCount,
            teamsById
          )
        );
      }

      if (blockMatches.length > 0) {
        firstMatchByBlockId.set(Number(block.id), blockMatches[0]);
      }
    }
  }

  return standingsByBlockId;
}

/**
 * Builds a compact set result text from persisted set rows.
 * @param {Array<object>} sets Persisted set rows.
 * @returns {string} Joined set score text.
 */
function buildSetResultsText(sets) {
  return (Array.isArray(sets) ? sets : [])
    .filter(
      (entry) =>
        Number.isFinite(Number(entry?.team1_score)) &&
        Number.isFinite(Number(entry?.team2_score))
    )
    .sort((left, right) => Number(left.set_index) - Number(right.set_index))
    .map((entry) => `${Number(entry.team1_score)}:${Number(entry.team2_score)}`)
    .join(" | ");
}

/**
 * Resolves one match participant label.
 * @param {number|null} teamId Team id from match row.
 * @param {string|null} teamRef Team reference from match row.
 * @param {Map<number, {id: number, name: string}>} teamsById Teams keyed by id.
 * @returns {string} Display label for one participant.
 */
function resolveMatchParticipantLabel(teamId, teamRef, teamsById) {
  const normalizedTeamId = Number(teamId);
  if (Number.isInteger(normalizedTeamId) && normalizedTeamId > 0) {
    return teamsById.get(normalizedTeamId)?.name || `Team #${normalizedTeamId}`;
  }
  return normalizeString(teamRef) || "?";
}

/**
 * Loads a derived, read-only results snapshot for result overview pages.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} scoringModeKey Active scoring mode.
 * @param {number} configuredSetCount Configured set count.
 * @returns {Promise<{phases: Array<object>, standingsByBlockId: Map<number, Array<object>>, firstMatchByBlockId: Map<number, object>, teamsById: Map<number, object>}>} Derived snapshot payload.
 */
async function buildReadOnlyResultsSnapshot(scoringModeKey, configuredSetCount) {
  const teams = await all("SELECT id, name FROM teams ORDER BY position ASC, id ASC");
  const teamsByName = createTeamsByNameMap(teams);
  const teamsById = createTeamsByIdMap(teams);
  const phaseState = await loadAllPhaseBlocksState();
  const matches = await all(
    `SELECT m.*, p.position AS phase_position
     FROM matches m
     LEFT JOIN phases p ON p.id = m.phase_id
     ORDER BY COALESCE(p.position, 0) ASC, m.position ASC, m.id ASC`
  );

  const matchIds = matches.map((match) => Number(match.id)).filter((id) => Number.isInteger(id) && id > 0);
  const matchSetsByMatchId = new Map();
  if (matchIds.length > 0) {
    const placeholders = matchIds.map(() => "?").join(",");
    const setRows = await all(
      `SELECT * FROM match_sets WHERE match_id IN (${placeholders}) ORDER BY match_id ASC, set_index ASC, id ASC`,
      matchIds
    );
    setRows.forEach((setRow) => {
      const matchId = Number(setRow.match_id);
      if (!matchSetsByMatchId.has(matchId)) {
        matchSetsByMatchId.set(matchId, []);
      }
      matchSetsByMatchId.get(matchId).push(setRow);
    });
  }

  const matchesByBlockId = new Map();
  const firstMatchByBlockId = new Map();
  matches.forEach((match) => {
    const blockId = Number(match.block_id);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      return;
    }
    if (!matchesByBlockId.has(blockId)) {
      matchesByBlockId.set(blockId, []);
    }
    matchesByBlockId.get(blockId).push(match);
  });
  matchesByBlockId.forEach((blockMatches) => {
    blockMatches.sort((left, right) => Number(left.position) - Number(right.position) || Number(left.id) - Number(right.id));
    if (blockMatches.length > 0) {
      firstMatchByBlockId.set(Number(blockMatches[0].block_id), blockMatches[0]);
    }
  });

  const standingsByBlockId = new Map();
  const completedGroupBlockIds = new Set();
  const phases = [];

  for (const phase of phaseState.phases) {
    const phaseBlocks = phaseState.blocksByPhaseId.get(Number(phase.id)) || [];
    const blockSummaries = [];

    for (const block of phaseBlocks) {
      const context = {
        teamsByName,
        teamsById,
        blockById: phaseState.blockById,
        standingsByBlockId,
        firstMatchByBlockId,
        completedGroupBlockIds,
      };

      const orderedSlots = [...(Array.isArray(block.slots) ? block.slots : [])].sort(
        (left, right) => Number(left.slot_index) - Number(right.slot_index)
      );
      const resolvedSlots = orderedSlots.map((slot) => resolveBlockSlotDescriptor(slot, context));
      const expectedPairs = buildExpectedBlockPairs(block, context);
      const blockMatches = [...(matchesByBlockId.get(Number(block.id)) || [])];
      blockMatches.sort((left, right) => Number(left.position) - Number(right.position) || Number(left.id) - Number(right.id));

      if (normalizeString(block.block_type) === "gruppe") {
        const standings = calculateGroupStandingsForBlock(
          block,
          blockMatches,
          matchSetsByMatchId,
          resolvedSlots,
          scoringModeKey,
          configuredSetCount,
          teamsById
        );
        standingsByBlockId.set(Number(block.id), standings);
      }

      if (blockMatches.length > 0) {
        firstMatchByBlockId.set(Number(block.id), blockMatches[0]);
      }

      const finishedMatches = blockMatches.filter((match) => Number(match.is_finished) > 0).length;
      const expectedMatchCount = expectedPairs.length;
      const isGroup = normalizeString(block.block_type) === "gruppe";

      if (isGroup && expectedMatchCount > 0 && finishedMatches >= expectedMatchCount) {
        completedGroupBlockIds.add(Number(block.id));
      } else {
        completedGroupBlockIds.delete(Number(block.id));
      }

      const groupRows = isGroup
        ? (standingsByBlockId.get(Number(block.id)) || []).map((row) => ({
            rank: Number(row.rank),
            team_name: row.team_name,
            ranking_points: Number(row.ranking_points || 0),
            sets_won: Number(row.sets_won || 0),
            sets_drawn: Number(row.sets_drawn || 0),
            sets_lost: Number(row.sets_lost || 0),
            points_scored: Number(row.points_scored || 0),
            points_allowed: Number(row.points_allowed || 0),
            set_diff: Number(row.set_diff || 0),
            point_diff: Number(row.point_diff || 0),
            matches_played: Number(row.matches_played || 0),
          }))
        : [];

      const matchRows = blockMatches.map((match) => {
        const sets = matchSetsByMatchId.get(Number(match.id)) || [];
        return {
          id: Number(match.id),
          start_time: normalizeString(match.start_time),
          field_number: Number(match.field_number || 0),
          team1_label: resolveMatchParticipantLabel(match.team1_id, match.team1_ref, teamsById),
          team2_label: resolveMatchParticipantLabel(match.team2_id, match.team2_ref, teamsById),
          winner_label:
            Number.isInteger(Number(match.winner_id)) && Number(match.winner_id) > 0
              ? (teamsById.get(Number(match.winner_id))?.name || `Team #${Number(match.winner_id)}`)
              : "",
          is_finished: Number(match.is_finished) > 0,
          set_results_text: buildSetResultsText(sets),
        };
      });

      blockSummaries.push({
        block_id: Number(block.id),
        block_name: getPhaseBlockDisplayName(block),
        block_type: normalizeString(block.block_type),
        expected_match_count: expectedMatchCount,
        finished_match_count: finishedMatches,
        is_completed: expectedMatchCount > 0 && finishedMatches >= expectedMatchCount,
        groups: groupRows,
        matches: matchRows,
      });
    }

    phases.push({
      phase_id: Number(phase.id),
      phase_name: normalizeString(phase.name),
      blocks: blockSummaries,
    });
  }

  return {
    phases,
    standingsByBlockId,
    firstMatchByBlockId,
    teamsById,
    completedGroupBlockIds,
  };
}

/**
 * Resolves one configured placement entry to a display label.
 * @param {object} entry Placement entry row.
 * @param {{standingsByBlockId: Map<number, Array<object>>, firstMatchByBlockId: Map<number, object>, teamsById: Map<number, object>, completedGroupBlockIds?: Set<number>}} context Derived resolution context.
 * @returns {string} Resolved placement label.
 */
function resolvePlacementEntryLabel(entry, context) {
  const entryType = normalizeString(entry?.entry_type);
  if (entryType === "team") {
    return normalizeString(entry?.entry_team_name) || "-";
  }

  if (entryType === "group_rank") {
    const blockId = Number(entry?.entry_source_id);
    const rank = Number(entry?.entry_group_position);
    if (!(context.completedGroupBlockIds instanceof Set && context.completedGroupBlockIds.has(blockId))) {
      return "-";
    }
    const standings = context.standingsByBlockId.get(blockId) || [];
    const team = standings.find((row) => Number(row.rank) === rank);
    return team?.team_name || "-";
  }

  if (entryType === "match_winner") {
    const blockId = Number(entry?.entry_source_id);
    const sourceMatch = context.firstMatchByBlockId.get(blockId);
    const winnerId = Number(sourceMatch?.winner_id);
    return Number.isInteger(winnerId) && winnerId > 0
      ? (context.teamsById.get(winnerId)?.name || `Team #${winnerId}`)
      : "-";
  }

  if (entryType === "match_loser") {
    const blockId = Number(entry?.entry_source_id);
    const sourceMatch = context.firstMatchByBlockId.get(blockId);
    const loserId = Number(sourceMatch?.loser_id);
    return Number.isInteger(loserId) && loserId > 0
      ? (context.teamsById.get(loserId)?.name || `Team #${loserId}`)
      : "-";
  }

  return "-";
}

/**
 * Loads resolved overall placement rows for the current team count.
 * @param {{standingsByBlockId: Map<number, Array<object>>, firstMatchByBlockId: Map<number, object>, teamsById: Map<number, object>, completedGroupBlockIds?: Set<number>}} context Derived resolution context.
 * @returns {Promise<Array<object>>} Resolved placement rows.
 */
async function loadResolvedOverallPlacements(context) {
  const teamCountRow = await get("SELECT COUNT(*) AS total FROM teams WHERE available_as_team = 1");
  const activeTeamCount = Math.max(0, Number(teamCountRow?.total || 0));
  const placements = await loadPlacementsWithEntries();
  if (!Array.isArray(placements) || placements.length === 0) {
    return [];
  }

  const preferred = placements.filter((placement) => Number(placement.team_count) === activeTeamCount);
  const sourcePlacements = preferred.length > 0
    ? preferred
    : placements.filter((placement) => Number(placement.team_count) === Math.max(...placements.map((p) => Number(p.team_count) || 0)));

  return sourcePlacements
    .sort((left, right) => Number(left.position_index) - Number(right.position_index))
    .map((placement) => {
      const entry = Array.isArray(placement.entries) && placement.entries.length > 0 ? placement.entries[0] : null;
      const entryType = normalizeString(entry?.entry_type);
      return {
        position_label: normalizeString(placement.position_label) || `Platz ${Number(placement.position_number || 0)}`,
        source_type: entryType || "",
        source_label:
          entryType === "group_rank"
            ? `${normalizeString(entry?.entry_group_name) || "Gruppe"} Platz ${Number(entry?.entry_group_position) || "?"}`
            : entryType === "match_winner"
              ? `${normalizeString(entry?.entry_match_name) || "Match"} Gewinner`
              : entryType === "match_loser"
                ? `${normalizeString(entry?.entry_match_name) || "Match"} Verlierer`
                : entryType === "team"
                  ? "Direktes Team"
                  : "",
        resolved_team: resolvePlacementEntryLabel(entry, context),
      };
    });
}

/**
 * Normalizes setup payload into a stable validated structure.
 * @param {object} input Raw setup payload.
 * @returns {object} Normalized setup object.
 */
function normalizeTournamentSettings(input) {
  const settings = input || {};
  const lunchBreak = settings.lunch_break || {};
  const defaults = getDefaultTournamentSettings();

  return {
    tournament_name: normalizeString(settings.tournament_name),
    logo: normalizeString(settings.logo),
    tournament_date: normalizeDate(settings.tournament_date),
    tournament_time: normalizeTime(settings.tournament_time),
    fields: normalizeInteger(settings.fields, defaults.fields),
    sets_per_match: normalizeInteger(settings.sets_per_match, defaults.sets_per_match),
    minutes_per_set: normalizeInteger(settings.minutes_per_set, defaults.minutes_per_set),
    minutes_between_sets: normalizeInteger(
      settings.minutes_between_sets,
      defaults.minutes_between_sets
    ),
    pause_between_matches: normalizeInteger(
      settings.pause_between_matches,
      defaults.pause_between_matches
    ),
    lunch_break: {
      time: normalizeTime(lunchBreak.time),
      duration: normalizeInteger(lunchBreak.duration, defaults.lunch_break.duration),
    },
  };
}

/**
 * Normalizes team payload by trimming names and removing empty entries.
 * @param {Array<{name?: string, available_as_team?: boolean|number|string, available_as_referee?: boolean|number|string}>} input Raw teams input.
 * @returns {Array<{name: string, available_as_team: boolean, available_as_referee: boolean}>} Normalized teams array.
 */
function normalizeTeams(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((team) => ({
      name: normalizeString(team?.name),
      available_as_team: normalizeBoolean(team?.available_as_team, true),
      available_as_referee: normalizeBoolean(team?.available_as_referee, false),
    }))
    .filter((team) => team.name.length > 0);
}

/**
 * Normalizes phase payload by trimming names and removing empty entries.
 * @param {Array<{name?: string}>} input Raw phases input.
 * @returns {Array<{name: string}>} Normalized phases array.
 */
function normalizePhases(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((phase) => normalizeString(phase?.name))
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));
}

/**
 * Validates and normalizes phase block type values.
 * @param {*} value Raw block type input.
 * @returns {"gruppe"} Normalized block type.
 */
function normalizePhaseBlockType(value) {
  const normalized = normalizeString(value);
  return normalized === "einzelspiel" ? "einzelspiel" : "gruppe";
}

/**
 * Validates and normalizes phase block source type values.
 * @param {*} value Raw source type input.
 * @returns {"teams"|"phase"} Normalized source type.
 */
function normalizePhaseBlockSourceType(value) {
  const normalized = normalizeString(value);
  if (normalized === "phase") return "phase";
  if (normalized === "match") return "match";
  return "teams";
}

/**
 * Validates and normalizes phase block name values.
 * @param {*} value Raw block name input.
 * @param {number} position Zero-based block position.
 * @returns {string} Normalized non-empty block name.
 */
function normalizePhaseBlockName(value, position) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : `Gruppe ${position + 1}`;
}

/**
 * Normalizes one block slot entry value.
 * @param {*} value Raw slot value.
 * @returns {string|null} Normalized slot value or null for empty.
 */
function normalizePhaseBlockSlotValue(value) {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Generates suggested placement labels based on team count.
 * @param {number} teamCount Number of teams.
 * @returns {Array<string>} Suggested placement labels (e.g., "1st Place", "2nd Place", ...).
 */
function generatePlacementLabels(teamCount) {
  const labels = [];
  for (let i = 1; i <= teamCount; i++) {
    const suffix = i === 1 ? "st" : i === 2 ? "nd" : i === 3 ? "rd" : "th";
    labels.push(`${i}${suffix} Place`);
  }
  return labels;
}

/**
 * Normalizes placement input data.
 * @param {*} value Raw placement input.
 * @param {number} index Placement index.
 * @returns {object} Normalized placement object.
 */
function normalizePlacement(value, index) {
  const placement = value || {};
  const positionLabel = normalizeString(placement.position_label) || `Place ${index + 1}`;
  return {
    position_number: index + 1,
    position_label: positionLabel,
    position_index: index,
  };
}

/**
 * Loads all placements with their entries from the database.
 * @returns {Promise<Array<object>>} Array of placements with entries.
 */
async function loadPlacementsWithEntries() {
  const rows = await all(`
    SELECT id, team_count, position_number, position_label, position_index, created_at, updated_at
    FROM placements
    ORDER BY team_count DESC, position_index ASC
  `);

  const placements = [];
  for (const row of rows) {
    const entries = await all(
      "SELECT id, slot_index, entry_type, entry_source_id, entry_source_phase_id, entry_group_name, entry_group_position, entry_match_result, entry_match_name, entry_team_name FROM placement_entries WHERE placement_id = ? ORDER BY slot_index ASC",
      [row.id]
    );

    placements.push({
      id: row.id,
      team_count: row.team_count,
      position_number: row.position_number,
      position_label: row.position_label,
      position_index: row.position_index,
      entries: entries || [],
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return placements;
}

/**
 * Adds CORS headers for local cross-origin requests from the PHP timer host.
 * @param {import('express').Request} req Express request object.
 * @param {import('express').Response} res Express response object.
 * @param {import('express').NextFunction} next Express next callback.
 * @returns {void} Sends 204 for preflight or continues the middleware chain.
 */
app.use((req, res, next) => {
  const requestOrigin = normalizeString(req.headers.origin);
  const allowedOrigins = new Set([
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  // Set CORS headers for allowed origins, or fallback to wildcard for local dev
  if (allowedOrigins.has(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // Allow all origins for local development (Docker + local testing)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "3600");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

/**
 * Blocks new API requests during a database restore and tracks accepted requests.
 * @param {import('express').Request} req Express request object.
 * @param {import('express').Response} res Express response object.
 * @param {import('express').NextFunction} next Express next callback.
 * @returns {void} Continues the request or sends a restore-in-progress response.
 */
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    next();
    return;
  }

  if (databaseRestoreInProgress) {
    res.status(503).json({ error: "Database restore in progress. Please retry shortly." });
    return;
  }

  activeApiRequestCount += 1;
  res.once("finish", () => {
    activeApiRequestCount = Math.max(0, activeApiRequestCount - 1);
    if (activeApiRequestCount === 0 && resolveActiveApiRequests) {
      resolveActiveApiRequests();
      resolveActiveApiRequests = null;
    }
  });
  next();
});

app.use(express.static(path.join(__dirname, "public")));

/**
 * Returns process health status for container readiness checks.
 * @returns {void} Sends health metadata.
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "turnierplaner",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Returns whether an app access password is already configured.
 * @returns {Promise<void>} Sends password configuration status.
 */
app.get("/api/access-password/status", async (req, res) => {
  try {
    const storedHash = await loadStoredAppPasswordHash();
    res.json({ is_set: hasStoredPasswordHash(storedHash) });
  } catch {
    res.status(500).json({ error: "Failed to load password status." });
  }
});

/**
 * Stores an app access password when none exists yet.
 * @param {string} req.body.password Password to store.
 * @returns {Promise<void>} Sends password set confirmation.
 */
app.put("/api/access-password", async (req, res) => {
  try {
    const rawPassword = normalizePasswordInput(req.body?.password);
    if (rawPassword.length === 0) {
      res.status(400).json({ error: "Password must not be empty." });
      return;
    }

    const currentHash = await loadStoredAppPasswordHash();
    if (hasStoredPasswordHash(currentHash)) {
      res.status(409).json({ error: "Password is already set." });
      return;
    }

    const nextHash = createPasswordHash(rawPassword);
    await run(
      "UPDATE setup SET app_password_hash = ?, updated_at = datetime('now') WHERE id = 1",
      [nextHash]
    );
    await createDatabaseBackup();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to set password." });
  }
});

/**
 * Verifies a plaintext password against the stored app access password.
 * @param {string} req.body.password Password to verify.
 * @returns {Promise<void>} Sends verification result.
 */
app.post("/api/access-password/verify", async (req, res) => {
  try {
    const rawPassword = normalizePasswordInput(req.body?.password);
    const currentHash = await loadStoredAppPasswordHash();
    if (!hasStoredPasswordHash(currentHash)) {
      res.status(409).json({ error: "Password is not set yet.", is_set: false });
      return;
    }

    const isValid = rawPassword.length > 0 && verifyPasswordHash(rawPassword, currentHash);
    if (!isValid) {
      res.status(401).json({ ok: false, error: "Invalid password." });
      return;
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to verify password." });
  }
});

/**
 * Persists the timer config JSON used by the countdown UI.
 * @returns {Promise<void>} Sends the updated timer configuration.
 */
app.put("/api/timer/config", async (req, res) => {
  try {
    const update = normalizeTimerConfigUpdate(req.body);
    if (!update) {
      res.status(400).json({ error: "Invalid timer config payload." });
      return;
    }

    const currentConfig = await loadTimerConfigFile();
    const nextConfig = mergeTimerConfig(currentConfig, update);
    await saveTimerConfigFile(nextConfig);

    res.json({ ok: true, config: nextConfig });
  } catch (error) {
    res.status(500).json({ error: "Failed to save timer config." });
  }
});

/**
 * Returns the timer configuration used by the countdown UI.
 * @returns {Promise<void>} Sends the persisted timer configuration.
 */
app.get("/api/timer/config", async (req, res) => {
  try {
    res.json(await loadTimerConfigFile());
  } catch (error) {
    res.status(500).json({ error: "Failed to load timer config." });
  }
});

/**
 * Changes the app access password.
 * Requires current password verification when a password is already set.
 * @param {string} req.body.current_password Current plaintext password.
 * @param {string} req.body.new_password New plaintext password.
 * @returns {Promise<void>} Sends password change confirmation.
 */
app.post("/api/access-password/change", async (req, res) => {
  try {
    const currentPassword = normalizePasswordInput(req.body?.current_password);
    const newPassword = normalizePasswordInput(req.body?.new_password);

    if (newPassword.length === 0) {
      res.status(400).json({ error: "New password must not be empty." });
      return;
    }

    const currentHash = await loadStoredAppPasswordHash();
    const hasExistingPassword = hasStoredPasswordHash(currentHash);

    if (hasExistingPassword) {
      const isValidCurrentPassword =
        currentPassword.length > 0 && verifyPasswordHash(currentPassword, currentHash);
      if (!isValidCurrentPassword) {
        res.status(401).json({ error: "Invalid current password." });
        return;
      }
    }

    const nextHash = createPasswordHash(newPassword);
    await run(
      "UPDATE setup SET app_password_hash = ?, updated_at = datetime('now') WHERE id = 1",
      [nextHash]
    );
    await createDatabaseBackup();

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to change password." });
  }
});

app.get("/api/setup", async (req, res) => {
  try {
    const row = await get(
      "SELECT tournament_name, logo, tournament_date, tournament_time, fields, sets_per_match, minutes_per_set, minutes_between_sets, pause_between_matches, lunch_break_time, lunch_break_duration FROM setup WHERE id = 1"
    );
    const settings = setupRowToSettings(row);

    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: "Failed to load setup." });
  }
});

app.put("/api/setup", async (req, res) => {
  try {
    const normalizedSettings = normalizeTournamentSettings(req.body?.settings);

    await run(
      `UPDATE setup SET
        tournament_name = ?,
        logo = ?,
        tournament_date = ?,
        tournament_time = ?,
        fields = ?,
        sets_per_match = ?,
        minutes_per_set = ?,
        minutes_between_sets = ?,
        pause_between_matches = ?,
        lunch_break_time = ?,
        lunch_break_duration = ?,
        updated_at = datetime('now')
      WHERE id = 1`,
      setupSettingsToSqlParams(normalizedSettings)
    );
    await createDatabaseBackup();

    res.json({ settings: normalizedSettings });
  } catch (error) {
    res.status(500).json({ error: "Failed to save setup." });
  }
});



/**
 * Normalizes scoring mode key to one of the supported options.
 * @param {*} value Raw mode key input.
 * @returns {"vereinfachter_turniermodus"|"offizieller_modus"} Normalized mode key.
 */
function normalizeScoringModeKey(value) {
  const normalized = normalizeString(value);
  if (normalized === "offizieller_modus") {
    return "offizieller_modus";
  }
  return "vereinfachter_turniermodus";
}

/**
 * Returns the persisted scoring mode selection.
 * @returns {Promise<void>} Sends current scoring mode key.
 */
app.get("/api/scoring-mode", async (req, res) => {
  try {
    const row = await get("SELECT mode_key FROM scoring_mode_state WHERE id = 1");
    res.json({
      mode_key: normalizeScoringModeKey(row?.mode_key),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load scoring mode." });
  }
});

/**
 * Persists the scoring mode selection.
 * @param {string} req.body.mode_key Selected mode key.
 * @returns {Promise<void>} Sends persisted scoring mode key.
 */
app.put("/api/scoring-mode", async (req, res) => {
  try {
    const modeKey = normalizeScoringModeKey(req.body?.mode_key);
    await run(
      "UPDATE scoring_mode_state SET mode_key = ?, updated_at = datetime('now') WHERE id = 1",
      [modeKey]
    );
    await createDatabaseBackup();
    res.json({ mode_key: modeKey });
  } catch (error) {
    res.status(500).json({ error: "Failed to save scoring mode." });
  }
});

app.get("/api/teams", async (req, res) => {
  try {
    const rows = await all(
      "SELECT id, name, available_as_team, available_as_referee FROM teams ORDER BY position ASC, id ASC"
    );
    const teams = rows.map((row) => ({
      name: row.name,
      available_as_team: Number(row.available_as_team) === 1,
      available_as_referee: Number(row.available_as_referee) === 1,
    }));
    res.json({ teams });
  } catch (error) {
    res.status(500).json({ error: "Failed to load teams." });
  }
});

app.put("/api/teams", async (req, res) => {
  try {
    const teams = normalizeTeams(req.body?.teams);

    await run("BEGIN TRANSACTION");
    await run("DELETE FROM teams");

    for (let index = 0; index < teams.length; index += 1) {
      await run(
        "INSERT INTO teams (name, available_as_team, available_as_referee, position) VALUES (?, ?, ?, ?)",
        [
          teams[index].name,
          teams[index].available_as_team ? 1 : 0,
          teams[index].available_as_referee ? 1 : 0,
          index,
        ]
      );
    }

    await commitAndBackup();
    res.json({ teams });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to save teams." });
  }
});

app.get("/api/phases", async (req, res) => {
  try {
    const rows = await all("SELECT id, name, mode_type FROM phases ORDER BY position ASC, id ASC");
    const phases = rows.map((row) => ({
      id: row.id,
      name: row.name,
      mode_type: row.mode_type || "",
    }));
    res.json({ phases });
  } catch (error) {
    res.status(500).json({ error: "Failed to load phases." });
  }
});

app.put("/api/phases", async (req, res) => {
  try {
    const rawPhases = Array.isArray(req.body?.phases) ? req.body.phases : [];

    // Accept phases with optional existing id; filter out blank names.
    const phases = rawPhases
      .map((p) => ({
        id:
          Number.isInteger(Number(p?.id)) && Number(p?.id) > 0
            ? Number(p.id)
            : null,
        name: String(p?.name || "").trim(),
      }))
      .filter((p) => p.name.length > 0);

    await run("BEGIN TRANSACTION");

    const keptIds = [];
    for (let index = 0; index < phases.length; index += 1) {
      const phase = phases[index];
      if (phase.id) {
        await run("UPDATE phases SET name = ?, position = ? WHERE id = ?", [
          phase.name,
          index,
          phase.id,
        ]);
        keptIds.push(phase.id);
      } else {
        const result = await run(
          "INSERT INTO phases (name, position, mode_type) VALUES (?, ?, '')",
          [phase.name, index]
        );
        keptIds.push(result.lastID);
      }
    }

    // Delete phases that are no longer in the list.
    if (keptIds.length > 0) {
      const placeholders = keptIds.map(() => "?").join(",");
      await run(`DELETE FROM phases WHERE id NOT IN (${placeholders})`, keptIds);
    } else {
      await run("DELETE FROM phases");
    }

    await commitAndBackup();

    const rows = await all("SELECT id, name, mode_type FROM phases ORDER BY position ASC, id ASC");
    const result = rows.map((r) => ({ id: r.id, name: r.name, mode_type: r.mode_type || "" }));
    res.json({ phases: result });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to save phases." });
  }
});

/**
 * Loads all blocks for one phase, including slot assignments.
 * @param {number} phaseId Phase id.
 * @returns {Promise<Array<object>>} Ordered phase block payload.
 */
async function loadPhaseBlocksWithSlots(phaseId) {
  const blockRows = await all(
    `SELECT id, phase_id, block_name, block_type, source_type, source_phase_id, teams_per_group, position
     FROM phase_blocks
     WHERE phase_id = ?
     ORDER BY position ASC, id ASC`,
    [phaseId]
  );

  const blockIds = blockRows.map((row) => row.id);
  const slotsByBlock = new Map();

  if (blockIds.length > 0) {
    const placeholders = blockIds.map(() => "?").join(",");
    const slotRows = await all(
      `SELECT block_id, slot_index, entry_value
       FROM phase_block_slots
       WHERE block_id IN (${placeholders})
       ORDER BY block_id ASC, slot_index ASC`,
      blockIds
    );

    slotRows.forEach((slot) => {
      if (!slotsByBlock.has(slot.block_id)) {
        slotsByBlock.set(slot.block_id, []);
      }
      slotsByBlock.get(slot.block_id).push({
        slot_index: slot.slot_index,
        entry_value: slot.entry_value || null,
      });
    });
  }

  return blockRows.map((row) => ({
    id: row.id,
    phase_id: row.phase_id,
    block_name: row.block_name || "",
    block_type: row.block_type,
    source_type: row.source_type,
    source_phase_id: row.source_phase_id,
    teams_per_group: row.teams_per_group,
    position: row.position,
    slots: slotsByBlock.get(row.id) || [],
  }));
}

/**
 * Returns all phase blocks for one phase.
 */
app.get("/api/phases/:id/blocks", async (req, res) => {
  try {
    const phaseId = Number(req.params.id);
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      return res.status(400).json({ error: "Invalid phase id." });
    }

    const blocks = await loadPhaseBlocksWithSlots(phaseId);
    res.json({ blocks });
  } catch (error) {
    res.status(500).json({ error: "Failed to load phase blocks." });
  }
});

/**
 * Persists all phase blocks for one phase, replacing previous data for that phase.
 */
app.put("/api/phases/:id/blocks", async (req, res) => {
  try {
    const phaseId = Number(req.params.id);
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      return res.status(400).json({ error: "Invalid phase id." });
    }

    const rawBlocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];

    await run("BEGIN TRANSACTION");

    const keptIds = [];

    for (let index = 0; index < rawBlocks.length; index += 1) {
      const rawBlock = rawBlocks[index] || {};
      const blockId =
        Number.isInteger(Number(rawBlock.id)) && Number(rawBlock.id) > 0
          ? Number(rawBlock.id)
          : null;
      const blockName = normalizePhaseBlockName(rawBlock.block_name, index);
      const blockType = normalizePhaseBlockType(rawBlock.block_type);
      const sourceType = normalizePhaseBlockSourceType(rawBlock.source_type);
      const sourcePhaseId =
        (["phase", "match"].includes(sourceType) && Number.isInteger(Number(rawBlock.source_phase_id)))
          ? Number(rawBlock.source_phase_id)
          : null;
      const teamsPerGroup = blockType === "einzelspiel" ? 2 : Math.max(2, normalizeInteger(rawBlock.teams_per_group, 4));
      const rawSlots = Array.isArray(rawBlock.slots) ? rawBlock.slots : [];

      let persistedBlockId = blockId;
      if (persistedBlockId) {
        await run(
          `UPDATE phase_blocks
           SET block_name = ?, block_type = ?, source_type = ?, source_phase_id = ?, teams_per_group = ?, position = ?
           WHERE id = ? AND phase_id = ?`,
          [blockName, blockType, sourceType, sourcePhaseId, teamsPerGroup, index, persistedBlockId, phaseId]
        );
      } else {
        const result = await run(
          `INSERT INTO phase_blocks (phase_id, block_name, block_type, source_type, source_phase_id, teams_per_group, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [phaseId, blockName, blockType, sourceType, sourcePhaseId, teamsPerGroup, index]
        );
        persistedBlockId = result.lastID;
      }

      keptIds.push(persistedBlockId);

      await run("DELETE FROM phase_block_slots WHERE block_id = ?", [persistedBlockId]);

      for (let slotIndex = 0; slotIndex < teamsPerGroup; slotIndex += 1) {
        const rawSlot = rawSlots.find((slot) => Number(slot?.slot_index) === slotIndex) || {};
        const entryValue = normalizePhaseBlockSlotValue(rawSlot.entry_value);
        await run(
          `INSERT INTO phase_block_slots (block_id, slot_index, entry_value)
           VALUES (?, ?, ?)`,
          [persistedBlockId, slotIndex, entryValue]
        );
      }
    }

    if (keptIds.length > 0) {
      const placeholders = keptIds.map(() => "?").join(",");
      const staleRows = await all(
        `SELECT id FROM phase_blocks WHERE phase_id = ? AND id NOT IN (${placeholders})`,
        [phaseId, ...keptIds]
      );
      for (const row of staleRows) {
        await run("DELETE FROM phase_block_slots WHERE block_id = ?", [row.id]);
      }
      await run(`DELETE FROM phase_blocks WHERE phase_id = ? AND id NOT IN (${placeholders})`, [
        phaseId,
        ...keptIds,
      ]);
    } else {
      const staleRows = await all("SELECT id FROM phase_blocks WHERE phase_id = ?", [phaseId]);
      for (const row of staleRows) {
        await run("DELETE FROM phase_block_slots WHERE block_id = ?", [row.id]);
      }
      await run("DELETE FROM phase_blocks WHERE phase_id = ?", [phaseId]);
    }

    await commitAndBackup();

    const blocks = await loadPhaseBlocksWithSlots(phaseId);
    res.json({ blocks });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to save phase blocks." });
  }
});

// Liefert alle definierten Platzierungen mit ihren Einträgen.
app.get("/api/placements", async (req, res) => {
  try {
    const placements = await loadPlacementsWithEntries();
    res.json({ placements });
  } catch (error) {
    res.status(500).json({ error: "Failed to load placements." });
  }
});

// Liefert Vorschläge für Platzierungen basierend auf der Anzahl der Teams.
app.get("/api/placements/suggestions", async (req, res) => {
  try {
    const teams = await all("SELECT id FROM teams");
    const teamCount = teams.length;
    const labels = generatePlacementLabels(teamCount);
    const suggestions = labels.map((label, index) => ({
      position_number: index + 1,
      position_label: label,
      position_index: index,
    }));
    res.json({ teamCount, suggestions });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate placement suggestions." });
  }
});

// Speichert die Platzierungen und ihre Einträge atomar.
app.put("/api/placements", async (req, res) => {
  try {
    const rawPlacements = Array.isArray(req.body?.placements) ? req.body.placements : [];
    const teamCountInput = Number.isInteger(Number(req.body?.team_count)) ? Number(req.body.team_count) : 0;

    await run("BEGIN TRANSACTION");

    // Delete old placements for this team count
    await run("DELETE FROM placement_entries WHERE placement_id IN (SELECT id FROM placements WHERE team_count = ?)", [teamCountInput]);
    await run("DELETE FROM placements WHERE team_count = ?", [teamCountInput]);

    const persistedPlacementIds = [];

    for (let index = 0; index < rawPlacements.length; index += 1) {
      const rawPlacement = rawPlacements[index] || {};
      const normalized = normalizePlacement(rawPlacement, index);

      const result = await run(
        `INSERT INTO placements (team_count, position_number, position_label, position_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [teamCountInput, normalized.position_number, normalized.position_label, normalized.position_index]
      );

      const placementId = result.lastID;
      persistedPlacementIds.push(placementId);

      const rawEntries = Array.isArray(rawPlacement.entries) ? rawPlacement.entries : [];
      for (let slotIndex = 0; slotIndex < rawEntries.length; slotIndex += 1) {
        const rawEntry = rawEntries[slotIndex] || {};
        const entryType = normalizeString(rawEntry.entry_type) || "team";
        const entrySourceId = Number.isInteger(Number(rawEntry.entry_source_id)) ? Number(rawEntry.entry_source_id) : null;
        const entrySourcePhaseId = Number.isInteger(Number(rawEntry.entry_source_phase_id)) ? Number(rawEntry.entry_source_phase_id) : null;
        const entryGroupName = normalizeString(rawEntry.entry_group_name) || null;
        const entryGroupPosition = Number.isInteger(Number(rawEntry.entry_group_position))
          ? Number(rawEntry.entry_group_position)
          : null;
        const entryMatchResult = normalizeString(rawEntry.entry_match_result) || null;
        const entryMatchName = normalizeString(rawEntry.entry_match_name) || null;
        const entryTeamName = normalizeString(rawEntry.entry_team_name) || null;

        await run(
          `INSERT INTO placement_entries (
            placement_id,
            slot_index,
            entry_type,
            entry_source_id,
            entry_source_phase_id,
            entry_group_name,
            entry_group_position,
            entry_match_result,
            entry_match_name,
            entry_team_name,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            placementId,
            slotIndex,
            entryType,
            entrySourceId,
            entrySourcePhaseId,
            entryGroupName,
            entryGroupPosition,
            entryMatchResult,
            entryMatchName,
            entryTeamName,
          ]
        );
      }
    }

    await commitAndBackup();

    const placements = await loadPlacementsWithEntries();
    res.json({ placements });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to save placements." });
  }
});

/**
 * Returns all teams with their database IDs.
 * @returns {Promise<void>} Sends teams array with id and name.
 */
app.get("/api/teams/with-ids", async (req, res) => {
  try {
    const rows = await all(
      "SELECT id, name, available_as_team, available_as_referee FROM teams ORDER BY position ASC, id ASC"
    );
    res.json({
      teams: rows.map((r) => ({
        id: r.id,
        name: r.name,
        available_as_team: Number(r.available_as_team) === 1,
        available_as_referee: Number(r.available_as_referee) === 1,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load teams with IDs." });
  }
});

/**
 * Returns all match records ordered by position.
 * @returns {Promise<void>} Sends matches array.
 */
app.get("/api/matches", async (req, res) => {
  try {
    const rows = await all(`
      SELECT
        m.*,
        (
          SELECT group_concat(set_pair, ' | ')
          FROM (
            SELECT
              CASE
                WHEN ms.team1_score IS NOT NULL AND ms.team2_score IS NOT NULL
                THEN CAST(ms.team1_score AS TEXT) || ':' || CAST(ms.team2_score AS TEXT)
                ELSE NULL
              END AS set_pair
            FROM match_sets ms
            WHERE ms.match_id = m.id
            ORDER BY ms.set_index ASC
          ) ordered_sets
        ) AS set_results_text
      FROM matches m
      ORDER BY m.position ASC, m.id ASC
    `);
    res.json({ matches: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load matches." });
  }
});

/**
 * Formats a persisted match start time into HH:MM when possible.
 * @param {string|null|undefined} rawStartTime Raw persisted start time value.
 * @returns {string} Formatted display time.
 */
function formatMatchStartTime(rawStartTime) {
  const value = normalizeString(rawStartTime);
  if (!value) {
    return "--:--";
  }

  const hhmmMatch = value.match(/^(\d{1,2}:\d{2})/);
  if (hhmmMatch) {
    return hhmmMatch[1];
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  }

  return value;
}

/**
 * Returns upcoming matches optimized for the timer read-only display.
 * @param {number} [req.query.limit=4] Maximum amount of matches to return.
 * @returns {Promise<void>} Sends timer match payload.
 */
app.get("/api/timer/upcoming-matches", async (req, res) => {
  const parsedLimit = Number.parseInt(String(req.query?.limit ?? "4"), 10);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 20) : 4;

  try {
    const rows = await all(
      `
        SELECT
          m.id,
          m.field_number,
          m.start_time,
          m.position,
          t1.name AS team1_name,
          t2.name AS team2_name,
          tr.name AS referee_name
        FROM matches m
        LEFT JOIN teams t1 ON t1.id = m.team1_id
        LEFT JOIN teams t2 ON t2.id = m.team2_id
        LEFT JOIN teams tr ON tr.id = m.referee_id
        WHERE m.is_finished = 0
          AND COALESCE(m.entry_type, 'match') = 'match'
        ORDER BY
          CASE WHEN TRIM(COALESCE(m.start_time, '')) = '' THEN 1 ELSE 0 END ASC,
          m.start_time ASC,
          m.position ASC,
          m.id ASC
        LIMIT ?
      `,
      [limit]
    );

    const matches = rows.map((row, index) => ({
      id: row.id,
      field: row.field_number,
      time: formatMatchStartTime(row.start_time),
      team1: normalizeString(row.team1_name) || "TBD",
      team2: normalizeString(row.team2_name) || "TBD",
      referee: normalizeString(row.referee_name) || "-",
      status: index < 2 ? "current" : "next",
    }));

    res.json({ matches });
  } catch (error) {
    res.status(500).json({ error: "Failed to load upcoming timer matches." });
  }
});

/**
 * Returns an aggregated tournament results overview by phase.
 * Includes group standings, match results and resolved overall placements.
 * @returns {Promise<void>} Sends result overview payload.
 */
app.get("/api/results/overview", async (req, res) => {
  try {
    const configuredSetCount = await loadConfiguredSetCount();
    const scoringModeKey = await loadScoringModeKey();
    const snapshot = await buildReadOnlyResultsSnapshot(scoringModeKey, configuredSetCount);
    const overallPlacements = await loadResolvedOverallPlacements({
      standingsByBlockId: snapshot.standingsByBlockId,
      firstMatchByBlockId: snapshot.firstMatchByBlockId,
      teamsById: snapshot.teamsById,
      completedGroupBlockIds: snapshot.completedGroupBlockIds,
    });

    res.json({
      scoring_mode: scoringModeKey,
      phases: snapshot.phases,
      overall_placements: overallPlacements,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load tournament results overview." });
  }
});

/**
 * Returns all persisted set rows for one match.
 * @param {number} req.params.matchId Target match id.
 * @returns {Promise<void>} Sends ordered set rows.
 */
app.get("/api/matches/:matchId/sets", async (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }

  try {
    const matchRow = await get("SELECT id FROM matches WHERE id = ?", [matchId]);
    if (!matchRow) {
      res.status(404).json({ error: "Match not found." });
      return;
    }

    const rows = await all(
      "SELECT * FROM match_sets WHERE match_id = ? ORDER BY set_index ASC, id ASC",
      [matchId]
    );
    res.json({ sets: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load match sets." });
  }
});

/**
 * Replaces set rows for one match and updates match winner/finished flags.
 * @param {number} req.params.matchId Target match id.
 * @param {Array<object>} req.body.sets Set rows with set_index, team1_score, team2_score, is_finished.
 * @returns {Promise<void>} Sends persisted set rows.
 */
app.put("/api/matches/:matchId/sets", async (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }

  const rawSets = Array.isArray(req.body?.sets) ? req.body.sets : [];

  try {
    const matchRow = await get(
      "SELECT id, phase_id, block_id, team1_id, team2_id, entry_type FROM matches WHERE id = ?",
      [matchId]
    );
    if (!matchRow) {
      res.status(404).json({ error: "Match not found." });
      return;
    }
    if (normalizeString(matchRow.entry_type) === "pause") {
      res.status(400).json({ error: "Pause entries do not support set results." });
      return;
    }

    const configuredSetCount = await loadConfiguredSetCount();
    const scoringModeKey = await loadScoringModeKey();
    const allowDrawOutcome = !(await blockHasOutcomeReferenceConsumers(matchRow.block_id));

    await run("BEGIN TRANSACTION");

    await run("DELETE FROM match_sets WHERE match_id = ?", [matchId]);

    for (let index = 0; index < rawSets.length; index += 1) {
      const rawSet = rawSets[index] || {};
      const setIndex = Math.max(1, normalizeInteger(rawSet.set_index, index + 1));

      const hasTeam1Score =
        rawSet.team1_score !== null &&
        rawSet.team1_score !== undefined &&
        String(rawSet.team1_score).trim() !== "";
      const hasTeam2Score =
        rawSet.team2_score !== null &&
        rawSet.team2_score !== undefined &&
        String(rawSet.team2_score).trim() !== "";
      const team1Score = hasTeam1Score ? normalizeInteger(rawSet.team1_score, 0) : null;
      const team2Score = hasTeam2Score ? normalizeInteger(rawSet.team2_score, 0) : null;
      const isFinished =
        normalizeBoolean(rawSet.is_finished, false) &&
        Number.isInteger(team1Score) &&
        Number.isInteger(team2Score)
          ? 1
          : 0;

      await run(
        `INSERT INTO match_sets (
          match_id, set_index, team1_score, team2_score, is_finished
        ) VALUES (?, ?, ?, ?, ?)`,
        [matchId, setIndex, team1Score, team2Score, isFinished]
      );
    }

    const persistedSets = await all(
      "SELECT * FROM match_sets WHERE match_id = ? ORDER BY set_index ASC, id ASC",
      [matchId]
    );
    const outcome = calculateMatchOutcomeFromSets(
      persistedSets,
      Number(matchRow.team1_id),
      Number(matchRow.team2_id),
      configuredSetCount,
      scoringModeKey,
      { allowDrawOutcome }
    );

    if (outcome.error) {
      try {
        await run("ROLLBACK");
      } catch (_) {
        // Ignore rollback errors.
      }
      res.status(400).json({ error: outcome.error });
      return;
    }

    await run(
      "UPDATE matches SET is_finished = ?, winner_id = ?, loser_id = ? WHERE id = ?",
      [outcome.isFinished, outcome.winnerId, outcome.loserId, matchId]
    );

    await recomputeDerivedMatchState(scoringModeKey, configuredSetCount);

    await commitAndBackup();
    res.json({
      sets: persistedSets,
      outcome,
    });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_) {
      // Ignore rollback errors.
    }
    res.status(500).json({ error: "Failed to save match sets." });
  }
});

/**
 * Deletes all set rows for one match and resets winner/finished flags.
 * @param {number} req.params.matchId Target match id.
 * @returns {Promise<void>} Sends ok confirmation.
 */
app.delete("/api/matches/:matchId/sets", async (req, res) => {
  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    res.status(400).json({ error: "Invalid match id." });
    return;
  }

  try {
    const matchRow = await get("SELECT id FROM matches WHERE id = ?", [matchId]);
    if (!matchRow) {
      res.status(404).json({ error: "Match not found." });
      return;
    }

    const configuredSetCount = await loadConfiguredSetCount();
    const scoringModeKey = await loadScoringModeKey();

    await run("BEGIN TRANSACTION");
    await run("DELETE FROM match_sets WHERE match_id = ?", [matchId]);
    await run("UPDATE matches SET is_finished = 0, winner_id = NULL, loser_id = NULL WHERE id = ?", [matchId]);
    await recomputeDerivedMatchState(scoringModeKey, configuredSetCount);
    await commitAndBackup();
    res.json({ ok: true });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_) {
      // Ignore rollback errors.
    }
    res.status(500).json({ error: "Failed to delete match sets." });
  }
});

/**
 * Returns persisted started-phase state for the all-matches workflow.
 * @returns {Promise<void>} Sends startedPhaseIds and activePhaseId.
 */
app.get("/api/matches/phases/started", async (req, res) => {
  try {
    const startedRows = await all(
      "SELECT phase_id FROM started_match_phases ORDER BY started_at ASC, phase_id ASC"
    );
    const stateRow = await get("SELECT active_phase_id FROM started_match_phase_state WHERE id = 1");

    const startedPhaseIds = startedRows
      .map((row) => Number(row.phase_id))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0);
    const activePhaseId = Number(stateRow?.active_phase_id);

    res.json({
      startedPhaseIds,
      activePhaseId: Number.isInteger(activePhaseId) && activePhaseId > 0 ? activePhaseId : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load started match phases state." });
  }
});

/**
 * Persists started-phase state for the all-matches workflow atomically.
 * @param {Array<number>} req.body.startedPhaseIds Started phase ids.
 * @param {number|null} req.body.activePhaseId Active started phase id.
 * @returns {Promise<void>} Sends persisted state payload.
 */
app.put("/api/matches/phases/started", async (req, res) => {
  const rawStartedIds = Array.isArray(req.body?.startedPhaseIds) ? req.body.startedPhaseIds : [];
  const startedPhaseIds = [...new Set(
    rawStartedIds
      .map((phaseId) => Number(phaseId))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
  )];

  const rawActivePhaseId = Number(req.body?.activePhaseId);
  const activePhaseId = Number.isInteger(rawActivePhaseId) && rawActivePhaseId > 0
    ? rawActivePhaseId
    : null;

  if (activePhaseId !== null && !startedPhaseIds.includes(activePhaseId)) {
    res.status(400).json({ error: "Active phase must be included in startedPhaseIds." });
    return;
  }

  try {
    await run("BEGIN TRANSACTION");

    await run("DELETE FROM started_match_phases");
    for (const phaseId of startedPhaseIds) {
      await run(
        "INSERT INTO started_match_phases (phase_id, started_at) VALUES (?, datetime('now'))",
        [phaseId]
      );
    }

    await run(
      "UPDATE started_match_phase_state SET active_phase_id = ?, updated_at = datetime('now') WHERE id = 1",
      [activePhaseId]
    );

    await commitAndBackup();

    res.json({
      startedPhaseIds,
      activePhaseId,
    });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_) {
      // Ignore rollback errors.
    }
    res.status(500).json({ error: "Failed to persist started match phases state." });
  }
});

/**
 * Replaces all match records for one phase atomically.
 * @param {number} req.params.phaseId Target phase id.
 * @param {Array<object>} req.body.matches Match records to save.
 * @returns {Promise<void>} Sends saved matches for that phase.
 */
app.put("/api/matches/phase/:phaseId", async (req, res) => {
  const phaseId = Number(req.params.phaseId);
  if (!Number.isInteger(phaseId) || phaseId <= 0) {
    res.status(400).json({ error: "Invalid phase id." });
    return;
  }

  const rawMatches = Array.isArray(req.body?.matches) ? req.body.matches : [];

  try {
    await run("BEGIN TRANSACTION");

    const existingRows = await all("SELECT id FROM matches WHERE phase_id = ?", [phaseId]);
    const existingIds = new Set(existingRows.map((row) => Number(row.id)));
    const keptIds = [];

    for (let i = 0; i < rawMatches.length; i += 1) {
      const m = rawMatches[i] || {};
      const incomingId =
        Number.isInteger(Number(m.id)) && Number(m.id) > 0 ? Number(m.id) : null;
      const blockId =
        Number.isInteger(Number(m.block_id)) && Number(m.block_id) > 0
          ? Number(m.block_id)
          : null;
      const team1Id =
        Number.isInteger(Number(m.team1_id)) && Number(m.team1_id) > 0
          ? Number(m.team1_id)
          : null;
      const team2Id =
        Number.isInteger(Number(m.team2_id)) && Number(m.team2_id) > 0
          ? Number(m.team2_id)
          : null;
      const refereeId =
        Number.isInteger(Number(m.referee_id)) && Number(m.referee_id) > 0
          ? Number(m.referee_id)
          : null;
      const winnerId =
        Number.isInteger(Number(m.winner_id)) && Number(m.winner_id) > 0
          ? Number(m.winner_id)
          : null;
      const loserId =
        Number.isInteger(Number(m.loser_id)) && Number(m.loser_id) > 0
          ? Number(m.loser_id)
          : null;
      const entryType = normalizeString(m.entry_type) === "pause" ? "pause" : "match";
      const durationMinutes = Math.max(0, normalizeInteger(m.duration_minutes, 0));

      if (incomingId && existingIds.has(incomingId)) {
        await run(
          `UPDATE matches
           SET block_id = ?, block_name = ?,
               team1_id = ?, team2_id = ?, team1_ref = ?, team2_ref = ?,
               referee_id = ?, field_number = ?, start_time = ?,
               entry_type = ?, duration_minutes = ?,
               is_finished = ?, winner_id = ?, loser_id = ?, position = ?
           WHERE id = ? AND phase_id = ?`,
          [
            blockId,
            normalizeString(m.block_name),
            team1Id,
            team2Id,
            normalizeString(m.team1_ref) || null,
            normalizeString(m.team2_ref) || null,
            refereeId,
            Math.max(1, normalizeInteger(m.field_number, 1)),
            normalizeString(m.start_time),
            entryType,
            durationMinutes,
            m.is_finished ? 1 : 0,
            winnerId,
            loserId,
            i,
            incomingId,
            phaseId,
          ]
        );
        keptIds.push(incomingId);
      } else {
        const inserted = await run(
          `INSERT INTO matches (
            phase_id, block_id, block_name,
            team1_id, team2_id, team1_ref, team2_ref,
            referee_id, field_number, start_time,
            entry_type, duration_minutes,
            is_finished, winner_id, loser_id, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            phaseId,
            blockId,
            normalizeString(m.block_name),
            team1Id,
            team2Id,
            normalizeString(m.team1_ref) || null,
            normalizeString(m.team2_ref) || null,
            refereeId,
            Math.max(1, normalizeInteger(m.field_number, 1)),
            normalizeString(m.start_time),
            entryType,
            durationMinutes,
            m.is_finished ? 1 : 0,
            winnerId,
            loserId,
            i,
          ]
        );
        keptIds.push(Number(inserted.lastID));
      }
    }

    const keptIdSet = new Set(keptIds.map((id) => Number(id)));
    const removedMatchIds = [...existingIds].filter((existingId) => !keptIdSet.has(Number(existingId)));
    if (removedMatchIds.length > 0) {
      const placeholders = removedMatchIds.map(() => "?").join(",");
      await run(`DELETE FROM match_sets WHERE match_id IN (${placeholders})`, removedMatchIds);
    }

    if (keptIds.length > 0) {
      const placeholders = keptIds.map(() => "?").join(",");
      await run(`DELETE FROM matches WHERE phase_id = ? AND id NOT IN (${placeholders})`, [
        phaseId,
        ...keptIds,
      ]);
    } else {
      await run("DELETE FROM match_sets WHERE match_id IN (SELECT id FROM matches WHERE phase_id = ?)", [
        phaseId,
      ]);
      await run("DELETE FROM matches WHERE phase_id = ?", [phaseId]);
    }

    await commitAndBackup();
    const rows = await all(
      "SELECT * FROM matches WHERE phase_id = ? ORDER BY position ASC, id ASC",
      [phaseId]
    );
    res.json({ matches: rows });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (_) {
      // no-op
    }
    res.status(500).json({ error: "Failed to save matches." });
  }
});

/**
 * Deletes all match records for one phase.
 * @param {number} req.params.phaseId Target phase id.
 * @returns {Promise<void>} Sends ok confirmation.
 */
app.delete("/api/matches/phase/:phaseId", async (req, res) => {
  const phaseId = Number(req.params.phaseId);
  if (!Number.isInteger(phaseId) || phaseId <= 0) {
    res.status(400).json({ error: "Invalid phase id." });
    return;
  }

  try {
    await run("DELETE FROM match_sets WHERE match_id IN (SELECT id FROM matches WHERE phase_id = ?)", [
      phaseId,
    ]);
    await run("DELETE FROM matches WHERE phase_id = ?", [phaseId]);
    await createDatabaseBackup();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete matches." });
  }
});

// Initialisiert die Datenbank und startet danach den HTTP-Server.
initializeDatabase()
  .then(async () => {
    await createDatabaseBackup();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Turnierplaner running on http://localhost:${PORT}`);
    });
    setInterval(() => {
      void checkForPendingDatabaseRestore();
    }, restoreCheckIntervalMs);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
