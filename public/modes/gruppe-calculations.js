/**
 * Returns the default Gruppe mode configuration.
 * @returns {{teamsPerGroup: number, groups: Array}} Default config with no groups.
 */
export function getDefaultGruppeConfig() {
  return { teamsPerGroup: 4, groups: [] };
}

/**
 * Normalizes a single slot entry to a stable structure.
 * @param {*} raw Raw slot input.
 * @param {number} slotIndex Expected slot position index.
 * @returns {{slotIndex: number, teamName: string|null}} Normalized slot.
 */
function normalizeSlot(raw, slotIndex) {
  const input = raw || {};
  const teamName =
    typeof input.teamName === "string" && input.teamName.trim()
      ? input.teamName.trim()
      : null;
  return { slotIndex, teamName };
}

/**
 * Normalizes a single group entry with its slots.
 * @param {*} raw Raw group input.
 * @param {number} groupIndex Expected group position index.
 * @param {number} teamsPerGroup Slot count each group must have.
 * @returns {{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}} Normalized group.
 */
function normalizeGroup(raw, groupIndex, teamsPerGroup) {
  const input = raw || {};
  const rawSlots = Array.isArray(input.slots) ? input.slots : [];
  const slots = Array.from({ length: teamsPerGroup }, (_, s) =>
    normalizeSlot(rawSlots[s], s)
  );
  return { groupIndex, slots };
}

/**
 * Normalizes a full Gruppe configuration into a stable, validated structure.
 * @param {*} raw Raw config input.
 * @returns {{teamsPerGroup: number, groups: Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>}} Normalized config.
 */
export function normalizeGruppeConfig(raw) {
  const input = raw || {};
  const teamsPerGroup = Math.max(2, Math.round(Number(input.teamsPerGroup) || 4));
  const rawGroups = Array.isArray(input.groups) ? input.groups : [];
  const groups = rawGroups.map((g, i) => normalizeGroup(g, i, teamsPerGroup));
  return { teamsPerGroup, groups };
}

/**
 * Compares two Gruppe configurations for equality after normalization.
 * @param {*} a First config.
 * @param {*} b Second config.
 * @returns {boolean} True when both configs represent the same normalized state.
 */
export function areGruppeConfigsEqual(a, b) {
  return JSON.stringify(normalizeGruppeConfig(a)) === JSON.stringify(normalizeGruppeConfig(b));
}

/**
 * Builds a fresh group array for a given teamsPerGroup count, preserving existing slot assignments where possible.
 * @param {number} teamsPerGroup Slots per group.
 * @param {number} totalTeams Total number of available teams (used to compute group count).
 * @param {Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>} [existingGroups=[]] Previously assigned groups to preserve.
 * @returns {Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>} Rebuilt group array.
 */
export function buildGroups(teamsPerGroup, totalTeams, existingGroups = []) {
  const groupCount = totalTeams > 0 ? Math.ceil(totalTeams / teamsPerGroup) : 1;
  const groups = [];
  for (let g = 0; g < groupCount; g++) {
    const existing = existingGroups.find((gr) => gr.groupIndex === g) || { slots: [] };
    const slots = Array.from({ length: teamsPerGroup }, (_, s) => {
      const existingSlot = existing.slots.find((sl) => sl.slotIndex === s);
      return { slotIndex: s, teamName: existingSlot?.teamName ?? null };
    });
    groups.push({ groupIndex: g, slots });
  }
  return groups;
}
