const path = require("path");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, "data", "app.db");

const db = new sqlite3.Database(dbPath);

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
        updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      setupSettingsToSqlParams(getDefaultTournamentSettings())
    );
  }
}

/**
 * Creates required tables and ensures initial records exist.
 * @returns {Promise<void>} Resolves after database initialization.
 */
async function initializeDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      elements_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY,
      left_element TEXT NOT NULL,
      right_element TEXT NOT NULL,
      position INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    )
  `);

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
    CREATE TABLE IF NOT EXISTS gruppe_configs (
      phase_id INTEGER PRIMARY KEY,
      teams_per_group INTEGER NOT NULL DEFAULT 4
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS gruppe_slots (
      phase_id    INTEGER NOT NULL,
      group_index INTEGER NOT NULL,
      slot_index  INTEGER NOT NULL,
      team_name   TEXT,
      PRIMARY KEY (phase_id, group_index, slot_index)
    )
  `);

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
      is_finished INTEGER NOT NULL DEFAULT 0,
      winner_id INTEGER,
      loser_id INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (phase_id) REFERENCES phases(id)
    )
  `);

  // Development mode: keep only the current schema.
  await run("DROP TABLE IF EXISTS tournament_settings");

  const stateRows = await all("SELECT id FROM app_state WHERE id = 1");
  if (stateRows.length === 0) {
    await run(
      "INSERT INTO app_state (id, elements_json, updated_at) VALUES (1, ?, datetime('now'))",
      [JSON.stringify([])]
    );
  }

  await ensureSetupRow();
}

/**
 * Normalizes element input by trimming values, removing blanks, and deduplicating.
 * @param {Array<*>} inputElements Raw element list.
 * @returns {Array<string>} Normalized unique element names.
 */
function normalizeElements(inputElements) {
  if (!Array.isArray(inputElements)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const item of inputElements) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

/**
 * Reorders pair entries to reduce consecutive element overlap.
 * @param {Array<{left: string, right: string, position: number}>} pairs Pair list to reorder in place.
 * @returns {Array<{left: string, right: string, position: number}>} Reordered pairs.
 */
function normalizePairs(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) {
    return pairs;
  }

  const usageCount = new Map();
  const lastUsageIndex = new Map();
  const remaining = pairs.map((pair, originalIndex) => ({ pair, originalIndex }));
  const orderedPairs = [];

  /**
   * Checks whether two pair objects share at least one element.
   * @param {{left: string, right: string}|undefined} firstPair First pair.
   * @param {{left: string, right: string}|undefined} secondPair Second pair.
   * @returns {boolean} True when both pairs share an element.
   */
  const sharesElement = (firstPair, secondPair) => {
    if (!firstPair || !secondPair) {
      return false;
    }

    return (
      firstPair.left === secondPair.left ||
      firstPair.left === secondPair.right ||
      firstPair.right === secondPair.left ||
      firstPair.right === secondPair.right
    );
  };

  /**
   * Reads usage count for one element.
   * @param {string} element Element identifier.
   * @returns {number} Number of uses in ordered output.
   */
  const getUsageCount = (element) => usageCount.get(element) || 0;
  /**
   * Reads latest usage index for one element.
   * @param {string} element Element identifier.
   * @returns {number} Latest index or -1 when never used.
   */
  const getLastUsageIndex = (element) => lastUsageIndex.get(element) ?? -1;

  while (remaining.length > 0) {
    const previousPair = orderedPairs[orderedPairs.length - 1];
    const disjointCandidates = previousPair
      ? remaining.filter((entry) => !sharesElement(previousPair, entry.pair))
      : remaining;
    const candidatePool = disjointCandidates.length > 0 ? disjointCandidates : remaining;

    let bestEntry = candidatePool[0];

    for (const entry of candidatePool.slice(1)) {
      const bestPair = bestEntry.pair;
      const currentPair = entry.pair;

      const bestUsageScore = getUsageCount(bestPair.left) + getUsageCount(bestPair.right);
      const currentUsageScore = getUsageCount(currentPair.left) + getUsageCount(currentPair.right);

      if (currentUsageScore < bestUsageScore) {
        bestEntry = entry;
        continue;
      }

      if (currentUsageScore > bestUsageScore) {
        continue;
      }

      const bestRecencyScore = Math.max(
        getLastUsageIndex(bestPair.left),
        getLastUsageIndex(bestPair.right)
      );
      const currentRecencyScore = Math.max(
        getLastUsageIndex(currentPair.left),
        getLastUsageIndex(currentPair.right)
      );

      if (currentRecencyScore < bestRecencyScore) {
        bestEntry = entry;
        continue;
      }

      if (currentRecencyScore > bestRecencyScore) {
        continue;
      }

      if (entry.originalIndex < bestEntry.originalIndex) {
        bestEntry = entry;
      }
    }

    orderedPairs.push(bestEntry.pair);
    usageCount.set(bestEntry.pair.left, getUsageCount(bestEntry.pair.left) + 1);
    usageCount.set(bestEntry.pair.right, getUsageCount(bestEntry.pair.right) + 1);
    lastUsageIndex.set(bestEntry.pair.left, orderedPairs.length - 1);
    lastUsageIndex.set(bestEntry.pair.right, orderedPairs.length - 1);

    remaining.splice(remaining.indexOf(bestEntry), 1);
  }

  pairs.splice(0, pairs.length, ...orderedPairs);
  for (let index = 0; index < pairs.length; index += 1) {
    pairs[index].position = index;
  }

  return pairs;
}

/**
 * Generates all unique pair combinations and applies ordering normalization.
 * @param {Array<string>} elements Source element list.
 * @returns {Array<{left: string, right: string, position: number}>} Ordered unique pairs.
 */
function buildUniquePairs(elements) {
  const pairs = [];
  let position = 0;

  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      pairs.push({
        left: elements[i],
        right: elements[j],
        position,
      });
      position += 1;
    }
  }

  normalizePairs(pairs);

  return pairs;
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
 * @param {Array<{name?: string}>} input Raw teams input.
 * @returns {Array<{name: string}>} Normalized teams array.
 */
function normalizeTeams(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((team) => normalizeString(team?.name))
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));
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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

    res.json({ settings: normalizedSettings });
  } catch (error) {
    res.status(500).json({ error: "Failed to save setup." });
  }
});

app.get("/api/teams", async (req, res) => {
  try {
    const rows = await all("SELECT id, name FROM teams ORDER BY position ASC, id ASC");
    const teams = rows.map((row) => ({ name: row.name }));
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
      await run("INSERT INTO teams (name, position) VALUES (?, ?)", [teams[index].name, index]);
    }

    await run("COMMIT");
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

    await run("COMMIT");

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

    await run("COMMIT");

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

// Liefert den aktuellen Elementzustand und die gespeicherten Relationen an das Frontend.
app.get("/api/state", async (req, res) => {
  try {
    const state = await all("SELECT elements_json FROM app_state WHERE id = 1");
    const relations = await all(
      "SELECT id, left_element, right_element, position FROM relations ORDER BY position ASC"
    );

    const elements = state.length ? JSON.parse(state[0].elements_json) : [];

    res.json({
      elements,
      relations,
      total: relations.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load state." });
  }
});

// Erzeugt aus den übergebenen Elementen alle Relationen neu und speichert sie atomar.
app.post("/api/generate", async (req, res) => {
  try {
    const elements = normalizeElements(req.body?.elements);
    const pairs = buildUniquePairs(elements);

    console.log(`/api/generate with elements: ${JSON.stringify(elements)}, pairs are ${JSON.stringify(pairs)}`);

    await run("BEGIN TRANSACTION");
    await run("DELETE FROM relations");

    for (const pair of pairs) {
      await run(
        "INSERT INTO relations (left_element, right_element, position) VALUES (?, ?, ?)",
        [pair.left, pair.right, pair.position]
      );
    }

    await run(
      "UPDATE app_state SET elements_json = ?, updated_at = datetime('now') WHERE id = 1",
      [JSON.stringify(elements)]
    );
    await run("COMMIT");

    const relations = await all(
      "SELECT id, left_element, right_element, position FROM relations ORDER BY position ASC"
    );

    res.json({
      elements,
      relations,
      total: relations.length,
    });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to generate relations." });
  }
});

// Übernimmt eine neue Reihenfolge der Relationen und persistiert die Positionen.
app.post("/api/reorder", async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

    console.log(`/api/reorder with ${JSON.stringify(orderedIds)}`);

    const current = await all("SELECT id FROM relations ORDER BY position ASC");
    if (orderedIds.length !== current.length) {
      res.status(400).json({ error: "Invalid relation count for reorder." });
      return;
    }

    const validIds = new Set(current.map((row) => row.id));
    const uniqueCheck = new Set();
    for (const id of orderedIds) {
      if (!validIds.has(id) || uniqueCheck.has(id)) {
        res.status(400).json({ error: "Invalid relation ids for reorder." });
        return;
      }
      uniqueCheck.add(id);
    }

    await run("BEGIN TRANSACTION");
    for (let index = 0; index < orderedIds.length; index += 1) {
      await run("UPDATE relations SET position = ? WHERE id = ?", [index, orderedIds[index]]);
    }
    await run("COMMIT");

    const relations = await all(
      "SELECT id, left_element, right_element, position FROM relations ORDER BY position ASC"
    );

    res.json({ relations, total: relations.length });
  } catch (error) {
    try {
      await run("ROLLBACK");
    } catch (rollbackError) {
      // no-op
    }
    res.status(500).json({ error: "Failed to persist reorder." });
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

    await run("COMMIT");

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
    const rows = await all("SELECT id, name FROM teams ORDER BY position ASC, id ASC");
    res.json({ teams: rows.map((r) => ({ id: r.id, name: r.name })) });
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
    const rows = await all("SELECT * FROM matches ORDER BY position ASC, id ASC");
    res.json({ matches: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to load matches." });
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

      if (incomingId && existingIds.has(incomingId)) {
        await run(
          `UPDATE matches
           SET block_id = ?, block_name = ?,
               team1_id = ?, team2_id = ?, team1_ref = ?, team2_ref = ?,
               referee_id = ?, field_number = ?, start_time = ?,
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
            is_finished, winner_id, loser_id, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            m.is_finished ? 1 : 0,
            winnerId,
            loserId,
            i,
          ]
        );
        keptIds.push(Number(inserted.lastID));
      }
    }

    if (keptIds.length > 0) {
      const placeholders = keptIds.map(() => "?").join(",");
      await run(`DELETE FROM matches WHERE phase_id = ? AND id NOT IN (${placeholders})`, [
        phaseId,
        ...keptIds,
      ]);
    } else {
      await run("DELETE FROM matches WHERE phase_id = ?", [phaseId]);
    }

    await run("COMMIT");
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
    await run("DELETE FROM matches WHERE phase_id = ?", [phaseId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete matches." });
  }
});

// Initialisiert die Datenbank und startet danach den HTTP-Server.
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Relation cards app running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Database initialization failed:", error);
    process.exit(1);
  });
