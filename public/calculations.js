const DEFAULT_SETTINGS = {
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

/**
 * Converts any input to a trimmed string.
 * @param {*} value Raw input value.
 * @returns {string} Trimmed string representation.
 */
function sanitizeString(value) {
  return String(value ?? "").trim();
}

/**
 * Validates and normalizes an ISO date string (YYYY-MM-DD).
 * @param {*} value Raw date value.
 * @returns {string} Normalized date or an empty string.
 */
function sanitizeDate(value) {
  const normalized = sanitizeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

/**
 * Validates and normalizes a 24-hour time string (HH:mm).
 * @param {*} value Raw time value.
 * @returns {string} Normalized time or an empty string.
 */
function sanitizeTime(value) {
  const normalized = sanitizeString(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : "";
}

/**
 * Converts a value to a non-negative integer with a fallback.
 * @param {*} value Raw numeric input.
 * @param {number} [fallback=0] Fallback value when parsing fails.
 * @returns {number} Non-negative integer.
 */
function sanitizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.round(parsed));
}

/**
 * Returns a deep copy of the default tournament settings.
 * @returns {object} Default setup object.
 */
export function getDefaultTournamentSettings() {
  return structuredClone(DEFAULT_SETTINGS);
}

/**
 * Normalizes tournament settings into a stable, validated structure.
 * @param {object} rawSettings Untrusted settings input.
 * @returns {object} Normalized tournament settings.
 */
export function normalizeTournamentSettings(rawSettings) {
  const incoming = rawSettings || {};
  const lunchBreak = incoming.lunch_break || {};

  return {
    tournament_name: sanitizeString(incoming.tournament_name),
    logo: sanitizeString(incoming.logo),
    tournament_date: sanitizeDate(incoming.tournament_date),
    tournament_time: sanitizeTime(incoming.tournament_time),
    fields: sanitizeNumber(incoming.fields, DEFAULT_SETTINGS.fields),
    sets_per_match: sanitizeNumber(incoming.sets_per_match, DEFAULT_SETTINGS.sets_per_match),
    minutes_per_set: sanitizeNumber(incoming.minutes_per_set, DEFAULT_SETTINGS.minutes_per_set),
    minutes_between_sets: sanitizeNumber(
      incoming.minutes_between_sets,
      DEFAULT_SETTINGS.minutes_between_sets
    ),
    pause_between_matches: sanitizeNumber(
      incoming.pause_between_matches,
      DEFAULT_SETTINGS.pause_between_matches
    ),
    lunch_break: {
      time: sanitizeTime(lunchBreak.time),
      duration: sanitizeNumber(lunchBreak.duration, DEFAULT_SETTINGS.lunch_break.duration),
    },
  };
}

/**
 * Compares two setup objects after normalization.
 * @param {object} a First settings object.
 * @param {object} b Second settings object.
 * @returns {boolean} True when both represent the same normalized settings.
 */
export function areTournamentSettingsEqual(a, b) {
  const left = normalizeTournamentSettings(a);
  const right = normalizeTournamentSettings(b);
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Alias helper that normalizes setup payloads.
 * @param {object} rawSettings Raw setup payload.
 * @returns {object} Normalized setup payload.
 */
export function normalizeSetup(rawSettings) {
  return normalizeTournamentSettings(rawSettings);
}

/**
 * Provides the default teams collection.
 * @returns {Array<{name: string}>} Empty team list.
 */
export function getDefaultTeams() {
  return [];
}

/**
 * Normalizes a team list by trimming names and removing empty entries.
 * @param {Array<{name?: string}>} rawTeams Incoming team data.
 * @returns {Array<{name: string}>} Normalized teams.
 */
export function normalizeTeams(rawTeams) {
  if (!Array.isArray(rawTeams)) {
    return [];
  }

  return rawTeams
    .map((team) => sanitizeString(team?.name))
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));
}

/**
 * Compares two team lists after normalization.
 * @param {Array<{name?: string}>} a First team list.
 * @param {Array<{name?: string}>} b Second team list.
 * @returns {boolean} True when both team lists are equivalent.
 */
export function areTeamsEqual(a, b) {
  const left = normalizeTeams(a);
  const right = normalizeTeams(b);
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Provides the default phase collection.
 * @returns {Array<{id: number|null, name: string, mode_type: string}>} Empty phase list.
 */
export function getDefaultPhases() {
  return [];
}

/**
 * Normalizes phase definitions by trimming names, preserving ids/mode types, and removing empty entries.
 * @param {Array<{id?: number|null, name?: string, mode_type?: string}>} rawPhases Incoming phase data.
 * @returns {Array<{id: number|null, name: string, mode_type: string}>} Normalized phase list.
 */
export function normalizePhases(rawPhases) {
  if (!Array.isArray(rawPhases)) {
    return [];
  }

  return rawPhases
    .map((phase) => {
      const idValue = Number(phase?.id);
      const id = Number.isInteger(idValue) && idValue > 0 ? idValue : null;
      const name = sanitizeString(phase?.name);
      const modeType = sanitizeString(phase?.mode_type);

      return {
        id,
        name,
        mode_type: modeType === "gruppe" ? "gruppe" : "",
      };
    })
    .filter((phase) => phase.name.length > 0);
}

/**
 * Compares two phase lists after normalization.
 * @param {Array<{id?: number|null, name?: string, mode_type?: string}>} a First phase list.
 * @param {Array<{id?: number|null, name?: string, mode_type?: string}>} b Second phase list.
 * @returns {boolean} True when both phase lists are equivalent.
 */
export function arePhasesEqual(a, b) {
  const left = normalizePhases(a);
  const right = normalizePhases(b);
  return JSON.stringify(left) === JSON.stringify(right);
}
