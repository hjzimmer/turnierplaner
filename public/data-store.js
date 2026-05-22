import {
  getDefaultPhases,
  getDefaultTeams,
  getDefaultTournamentSettings,
  normalizePhases,
  normalizeTeams,
  normalizeTournamentSettings,
} from "./calculations.js";

/**
 * Loads setup settings from the backend and returns a normalized object.
 * @returns {Promise<object>} Normalized setup settings.
 */
export async function loadTournamentSettings() {
  const response = await fetch("/api/setup");
  if (!response.ok) {
    throw new Error("Turnier-Einstellungen konnten nicht geladen werden.");
  }

  const payload = await response.json();
  return normalizeTournamentSettings(payload.settings || getDefaultTournamentSettings());
}

/**
 * Persists setup settings and returns the normalized saved data.
 * @param {object} settings Setup settings payload.
 * @returns {Promise<object>} Normalized saved setup settings.
 */
export async function saveTournamentSettings(settings) {
  const normalized = normalizeTournamentSettings(settings);

  const response = await fetch("/api/setup", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ settings: normalized }),
  });

  if (!response.ok) {
    throw new Error("Turnier-Einstellungen konnten nicht gespeichert werden.");
  }

  const payload = await response.json();
  return normalizeTournamentSettings(payload.settings || normalized);
}

/**
 * Loads teams from the backend and returns a normalized list.
 * @returns {Promise<Array<{name: string, available_as_team: boolean, available_as_referee: boolean}>>} Normalized teams list.
 */
export async function loadTeams() {
  const response = await fetch("/api/teams");
  if (!response.ok) {
    throw new Error("Teams konnten nicht geladen werden.");
  }

  const payload = await response.json();
  return normalizeTeams(payload.teams || getDefaultTeams());
}

/**
 * Persists teams and returns the normalized saved list.
 * @param {Array<{name?: string, available_as_team?: boolean, available_as_referee?: boolean}>} teams Team list to save.
 * @returns {Promise<Array<{name: string, available_as_team: boolean, available_as_referee: boolean}>>} Normalized saved teams list.
 */
export async function saveTeams(teams) {
  const normalized = normalizeTeams(teams);

  const response = await fetch("/api/teams", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ teams: normalized }),
  });

  if (!response.ok) {
    throw new Error("Teams konnten nicht gespeichert werden.");
  }

  const payload = await response.json();
  return normalizeTeams(payload.teams || normalized);
}

/**
 * Loads phase columns from the backend and returns a normalized list.
 * @returns {Promise<Array<{id: number|null, name: string, mode_type: string}>>} Normalized phase list.
 */
export async function loadPhases() {
  const response = await fetch("/api/phases");
  if (!response.ok) {
    throw new Error("Phasen konnten nicht geladen werden.");
  }

  const payload = await response.json();
  return normalizePhases(payload.phases || getDefaultPhases());
}

/**
 * Persists phase columns and returns the normalized saved list.
 * @param {Array<{id?: number|null, name?: string, mode_type?: string}>} phases Phase list to save.
 * @returns {Promise<Array<{id: number|null, name: string, mode_type: string}>>} Normalized saved phase list.
 */
export async function savePhases(phases) {
  const normalized = normalizePhases(phases);

  const response = await fetch("/api/phases", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phases: normalized }),
  });

  if (!response.ok) {
    throw new Error("Phasen konnten nicht gespeichert werden.");
  }

  const payload = await response.json();
  return normalizePhases(payload.phases || []);
}

/**
 * Loads scoring mode selection from backend.
 * @returns {Promise<{mode_key: "vereinfachter_turniermodus"|"offizieller_modus"}>} Persisted scoring mode state.
 */
export async function loadScoringMode() {
  const response = await fetch("/api/scoring-mode");
  if (!response.ok) {
    throw new Error("Wertungsmodus konnte nicht geladen werden.");
  }

  const payload = await response.json();
  return {
    mode_key: payload.mode_key === "offizieller_modus" ? "offizieller_modus" : "vereinfachter_turniermodus",
  };
}

/**
 * Persists scoring mode selection to backend.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} modeKey Selected mode key.
 * @returns {Promise<{mode_key: "vereinfachter_turniermodus"|"offizieller_modus"}>} Persisted scoring mode state.
 */
export async function saveScoringMode(modeKey) {
  const normalizedMode = modeKey === "offizieller_modus" ? "offizieller_modus" : "vereinfachter_turniermodus";

  const response = await fetch("/api/scoring-mode", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode_key: normalizedMode }),
  });

  if (!response.ok) {
    throw new Error("Wertungsmodus konnte nicht gespeichert werden.");
  }

  const payload = await response.json();
  return {
    mode_key: payload.mode_key === "offizieller_modus" ? "offizieller_modus" : "vereinfachter_turniermodus",
  };
}
