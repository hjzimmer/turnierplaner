/**
 * Loads all teams from the backend including their database IDs.
 * @returns {Promise<Array<{id: number, name: string}>>} Teams with id and name.
 */
export async function loadTeamsWithIds() {
  const response = await fetch("/api/teams/with-ids");
  if (!response.ok) {
    throw new Error("Teams konnten nicht geladen werden.");
  }
  const payload = await response.json();
  return Array.isArray(payload.teams) ? payload.teams : [];
}

/**
 * Loads all match records from the backend.
 * @returns {Promise<Array<object>>} All match records ordered by position.
 */
export async function loadMatches() {
  const response = await fetch("/api/matches");
  if (!response.ok) {
    throw new Error("Matches konnten nicht geladen werden.");
  }
  const payload = await response.json();
  return Array.isArray(payload.matches) ? payload.matches : [];
}

/**
 * Saves match records for one phase, replacing any existing matches for that phase.
 * @param {number} phaseId Target phase id.
 * @param {Array<object>} matches Match records to persist.
 * @returns {Promise<Array<object>>} Saved match records as returned by the backend.
 */
export async function saveMatchesForPhase(phaseId, matches) {
  const response = await fetch(`/api/matches/phase/${encodeURIComponent(phaseId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matches }),
  });
  if (!response.ok) {
    throw new Error(`Matches fuer Phase ${phaseId} konnten nicht gespeichert werden.`);
  }
  const payload = await response.json();
  return Array.isArray(payload.matches) ? payload.matches : [];
}

/**
 * Deletes all match records for one phase.
 * @param {number} phaseId Target phase id.
 * @returns {Promise<void>} Resolves when deletion is complete.
 */
export async function deleteMatchesForPhase(phaseId) {
  const response = await fetch(`/api/matches/phase/${encodeURIComponent(phaseId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Matches fuer Phase ${phaseId} konnten nicht geloescht werden.`);
  }
}
