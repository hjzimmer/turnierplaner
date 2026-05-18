/**
 * Loads the Gruppe mode configuration for a given phase from the server.
 * @param {number} phaseId Phase database identifier.
 * @returns {Promise<{teamsPerGroup: number, groups: Array}>} Loaded config.
 */
export async function loadGruppeConfig(phaseId) {
  const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/gruppe`);
  if (!response.ok) {
    throw new Error(`Failed to load gruppe config for phase ${phaseId}.`);
  }
  const data = await response.json();
  return data.config;
}

/**
 * Saves the Gruppe mode configuration for a given phase to the server.
 * @param {number} phaseId Phase database identifier.
 * @param {{teamsPerGroup: number, groups: Array}} config Gruppe config to persist.
 * @returns {Promise<{teamsPerGroup: number, groups: Array}>} Saved config as returned by the server.
 */
export async function saveGruppeConfig(phaseId, config) {
  const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/gruppe`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save gruppe config for phase ${phaseId}.`);
  }
  const data = await response.json();
  return data.config;
}

/**
 * Saves the mode type for a given phase.
 * @param {number} phaseId Phase database identifier.
 * @param {string} modeType Mode type string, e.g. 'gruppe' or '' for no mode.
 * @returns {Promise<void>}
 */
export async function savePhaseMode(phaseId, modeType) {
  const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/mode`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode_type: modeType }),
  });
  if (!response.ok) {
    throw new Error(`Failed to save mode for phase ${phaseId}.`);
  }
}
