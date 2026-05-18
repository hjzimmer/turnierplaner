/**
 * placements-store.js — API client for placements data.
 */

/**
 * Loads all placements with their entries from the backend.
 * @returns {Promise<Array<object>>} Array of placements with entries.
 */
export async function loadPlacements() {
  const response = await fetch("/api/placements");
  if (!response.ok) {
    throw new Error("Failed to load placements");
  }
  const data = await response.json();
  return data.placements || [];
}

/**
 * Gets suggested placements based on current team count.
 * @returns {Promise<object>} Object with teamCount and suggested placement labels.
 */
export async function getPlacementSuggestions() {
  const response = await fetch("/api/placements/suggestions");
  if (!response.ok) {
    throw new Error("Failed to load placement suggestions");
  }
  return response.json();
}

/**
 * Saves placements and their entries to the backend.
 * @param {number} teamCount Number of teams.
 * @param {Array<object>} placements Array of placements with entries.
 * @returns {Promise<Array<object>>} Saved placements with entries.
 */
export async function savePlacements(teamCount, placements) {
  const response = await fetch("/api/placements", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team_count: teamCount, placements }),
  });
  if (!response.ok) {
    throw new Error("Failed to save placements");
  }
  const data = await response.json();
  return data.placements || [];
}
