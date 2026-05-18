/**
 * Loads all persisted bausteine (blocks) for one phase.
 * @param {number} phaseId Target phase id.
 * @returns {Promise<Array<object>>} Block list with slot assignments.
 */
export async function loadPhaseBlocks(phaseId) {
  const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/blocks`);
  if (!response.ok) {
    throw new Error(`Bausteine fuer Phase ${phaseId} konnten nicht geladen werden.`);
  }
  const payload = await response.json();
  return Array.isArray(payload.blocks) ? payload.blocks : [];
}

/**
 * Saves all bausteine (blocks) for one phase.
 * @param {number} phaseId Target phase id.
 * @param {Array<object>} blocks Full ordered block list.
 * @returns {Promise<Array<object>>} Persisted normalized block list.
 */
export async function savePhaseBlocks(phaseId, blocks) {
  const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/blocks`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ blocks }),
  });

  if (!response.ok) {
    throw new Error(`Bausteine fuer Phase ${phaseId} konnten nicht gespeichert werden.`);
  }

  const payload = await response.json();
  return Array.isArray(payload.blocks) ? payload.blocks : [];
}
