/**
 * Loads aggregated tournament results overview from backend.
 * @returns {Promise<{scoring_mode: string, phases: Array<object>, overall_placements: Array<object>}>} Results overview payload.
 */
export async function loadTournamentResultsOverview() {
  const response = await fetch("/api/results/overview");
  if (!response.ok) {
    let message = "Turnierergebnisse konnten nicht geladen werden.";
    try {
      const payload = await response.json();
      if (payload?.error) {
        message = String(payload.error);
      }
    } catch (_) {
      // Keep default message if payload cannot be parsed.
    }
    throw new Error(message);
  }

  const payload = await response.json();
  return {
    scoring_mode: String(payload?.scoring_mode || ""),
    phases: Array.isArray(payload?.phases) ? payload.phases : [],
    overall_placements: Array.isArray(payload?.overall_placements) ? payload.overall_placements : [],
  };
}
