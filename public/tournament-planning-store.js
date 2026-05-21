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

/**
 * Loads persisted started-phase state for the all-matches workflow.
 * @returns {Promise<{startedPhaseIds: Array<number>, activePhaseId: number|null}>} Persisted phase-start state.
 */
export async function loadStartedMatchPhasesState() {
  const response = await fetch("/api/matches/phases/started");
  if (!response.ok) {
    throw new Error("Gestartete Phasen konnten nicht geladen werden.");
  }

  const payload = await response.json();
  const startedPhaseIds = Array.isArray(payload.startedPhaseIds)
    ? payload.startedPhaseIds
        .map((phaseId) => Number(phaseId))
        .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
    : [];

  const activePhaseId = Number(payload.activePhaseId);
  return {
    startedPhaseIds,
    activePhaseId: Number.isInteger(activePhaseId) && activePhaseId > 0 ? activePhaseId : null,
  };
}

/**
 * Persists started-phase state for the all-matches workflow.
 * @param {Array<number>} startedPhaseIds Started phase ids.
 * @param {number|null} activePhaseId Currently active started phase id.
 * @returns {Promise<void>} Resolves when state is persisted.
 */
export async function saveStartedMatchPhasesState(startedPhaseIds, activePhaseId) {
  const response = await fetch("/api/matches/phases/started", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startedPhaseIds, activePhaseId }),
  });
  if (!response.ok) {
    throw new Error("Gestartete Phasen konnten nicht gespeichert werden.");
  }
}

/**
 * Loads all persisted set rows for one match.
 * @param {number} matchId Target match id.
 * @returns {Promise<Array<object>>} Set rows ordered by set index.
 */
export async function loadMatchSets(matchId) {
  const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/sets`);
  if (!response.ok) {
    throw new Error("Satzdaten konnten nicht geladen werden.");
  }
  const payload = await response.json();
  return Array.isArray(payload.sets) ? payload.sets : [];
}

/**
 * Replaces set rows for one match.
 * @param {number} matchId Target match id.
 * @param {Array<object>} sets Set rows to persist.
 * @returns {Promise<Array<object>>} Persisted set rows.
 */
export async function saveMatchSets(matchId, sets) {
  const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/sets`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sets }),
  });
  if (!response.ok) {
    throw new Error("Satzdaten konnten nicht gespeichert werden.");
  }
  const payload = await response.json();
  return Array.isArray(payload.sets) ? payload.sets : [];
}

/**
 * Deletes all set rows for one match.
 * @param {number} matchId Target match id.
 * @returns {Promise<void>} Resolves when delete is complete.
 */
export async function deleteMatchSets(matchId) {
  const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/sets`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Satzdaten konnten nicht geloescht werden.");
  }
}
