/**
 * Adds a number of minutes to a HH:mm time string.
 * Wraps around midnight using modulo 1440.
 * @param {string} timeStr Start time in HH:mm format.
 * @param {number} minutes Minutes to add.
 * @returns {string} Resulting time in HH:mm format.
 */
function addMinutes(timeStr, minutes) {
  const parts = (timeStr || "09:00").split(":");
  const totalMinutes = (Number(parts[0] || 0) * 60 + Number(parts[1] || 0) + minutes) % 1440;
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Resolves one block slot entry_value to a team descriptor.
 * Produces a human-readable reference string for unresolved placeholders.
 * @param {{entry_value: string|null}|undefined} slot Block slot from the backend.
 * @param {Map<string, {id: number, name: string}>} teamsByName Teams indexed by name.
 * @param {Map<number, Array<object>>} phaseBlocksByPhase All phase blocks for reference lookup.
 * @returns {{id: number|null, name: string|null, ref: string|null}} Team descriptor.
 */
function resolveSlot(slot, teamsByName, phaseBlocksByPhase) {
  if (!slot || !slot.entry_value) {
    return null;
  }

  const val = slot.entry_value;

  if (val.startsWith("team:")) {
    const name = val.slice(5);
    const team = teamsByName.get(name);
    return team ? { id: team.id, name: team.name, ref: null } : { id: null, name, ref: null };
  }

  if (val.startsWith("placement:")) {
    const parts = val.split(":");
    const blockId = Number(parts[1]);
    const rank = parts[2];
    const blockName = findBlockName(blockId, phaseBlocksByPhase);
    return { id: null, name: null, ref: `Platz ${rank} (${blockName})` };
  }

  if (val.startsWith("match-winner:")) {
    const blockId = Number(val.split(":")[1]);
    const blockName = findBlockName(blockId, phaseBlocksByPhase);
    return { id: null, name: null, ref: `Gewinner (${blockName})` };
  }

  if (val.startsWith("match-loser:")) {
    const blockId = Number(val.split(":")[1]);
    const blockName = findBlockName(blockId, phaseBlocksByPhase);
    return { id: null, name: null, ref: `Verlierer (${blockName})` };
  }

  return { id: null, name: null, ref: val };
}

/**
 * Looks up a block name by block id across all phases.
 * @param {number} blockId Target block id.
 * @param {Map<number, Array<object>>} phaseBlocksByPhase All phase blocks.
 * @returns {string} Block name or a fallback label.
 */
function findBlockName(blockId, phaseBlocksByPhase) {
  for (const blocks of phaseBlocksByPhase.values()) {
    const found = blocks.find((b) => b.id === blockId);
    if (found) {
      return found.block_name || `Block ${blockId}`;
    }
  }
  return `Block ${blockId}`;
}

/**
 * Generates all round-robin match pairs for a list of team entries.
 * Uses the standard polygon rotation algorithm. Teams are distributed across
 * rounds so no team plays consecutively when avoidable.
 * Null entries (byes) are excluded from the output.
 * @param {Array<{id: number|null, name: string|null, ref: string|null}>} teamEntries List of team descriptors.
 * @returns {Array<{round: number, team1: object, team2: object}>} Ordered match pairs with round index.
 */
export function generateRoundRobin(teamEntries) {
  if (teamEntries.length < 2) {
    return [];
  }

  const teams = [...teamEntries];
  if (teams.length % 2 !== 0) {
    teams.push(null); // add bye slot so round count is correct
  }

  const n = teams.length;
  const fixed = teams[0];
  const rotating = teams.slice(1);
  const numRounds = n - 1;
  const perRound = n / 2;
  const matches = [];

  for (let round = 0; round < numRounds; round += 1) {
    for (let i = 0; i < perRound; i += 1) {
      let t1;
      let t2;

      if (i === 0) {
        t1 = fixed;
        t2 = rotating[rotating.length - 1];
      } else {
        t1 = rotating[i - 1];
        t2 = rotating[rotating.length - 1 - i];
      }

      // Skip bye matches
      if (t1 !== null && t2 !== null) {
        matches.push({ round, team1: t1, team2: t2 });
      }
    }

    // Rotate: move last element to front
    rotating.unshift(rotating.pop());
  }

  return matches;
}

/**
 * Assigns available fields to blocks, trying to keep one group per field.
 * When blocks <= fields each block gets one or more dedicated fields.
 * When blocks > fields, fields are assigned cyclically.
 * @param {Array<object>} blocks Block objects with id property.
 * @param {Array<number>} fields Available field numbers.
 * @returns {Map<number, Array<number>>} Block id to assigned field numbers.
 */
function assignFieldsToBlocks(blocks, fields) {
  const assignment = new Map();

  if (blocks.length === 0 || fields.length === 0) {
    return assignment;
  }

  if (blocks.length <= fields.length) {
    const baseCount = Math.floor(fields.length / blocks.length);
    const extra = fields.length % blocks.length;
    let offset = 0;

    blocks.forEach((block, index) => {
      const count = baseCount + (index < extra ? 1 : 0);
      assignment.set(block.id, fields.slice(offset, offset + count));
      offset += count;
    });
  } else {
    blocks.forEach((block, index) => {
      assignment.set(block.id, [fields[index % fields.length]]);
    });
  }

  return assignment;
}

/**
 * Builds the complete scheduled match list for all selected blocks.
 * Generates round-robin pairings per block, assigns fields with group affinity,
 * and calculates start times based on setup timing values.
 * @param {Array<{phaseId: number, blockId: number}>} selectedBlockRefs Selected block references.
 * @param {Map<number, Array<object>>} phaseBlocksByPhase All phase blocks indexed by phase id.
 * @param {Map<string, {id: number, name: string}>} teamsByName Teams indexed by name.
 * @param {Array<number>} selectedFieldNumbers Available field numbers.
 * @param {object} setup Tournament setup (tournament_time, minutes_per_set, sets_per_match, etc.).
 * @param {Array<object>} [existingMatches=[]] Already planned matches used to continue start times.
 * @returns {Array<object>} Scheduled match records ready for backend persistence.
 */
export function buildScheduledMatches(
  selectedBlockRefs,
  phaseBlocksByPhase,
  teamsByName,
  selectedFieldNumbers,
  setup,
  existingMatches = []
) {
  const setsPerMatch = Math.max(1, Number(setup.sets_per_match) || 1);
  const minutesPerSet = Math.max(1, Number(setup.minutes_per_set) || 10);
  const minutesBetweenSets = Math.max(0, Number(setup.minutes_between_sets) || 0);
  const pauseBetweenMatches = Math.max(0, Number(setup.pause_between_matches) || 0);
  const matchDuration =
    setsPerMatch * minutesPerSet + Math.max(0, setsPerMatch - 1) * minutesBetweenSets;
  const slotDuration = matchDuration + pauseBetweenMatches;
  const startTime = setup.tournament_time || "09:00";
  const fields = selectedFieldNumbers.length > 0 ? selectedFieldNumbers : [1];

  /**
   * Converts a HH:mm time string into a slot index from the configured start time.
   * @param {string} time Candidate time string.
   * @returns {number} Non-negative slot index.
   */
  const getSlotIndexFromTime = (time) => {
    const [startH, startM] = startTime.split(":").map((v) => Number(v || 0));
    const [h, m] = String(time || "").split(":").map((v) => Number(v || 0));
    const startMinutes = startH * 60 + startM;
    const minutes = h * 60 + m;
    const diff = Math.max(0, minutes - startMinutes);
    return Math.floor(diff / Math.max(1, slotDuration));
  };

  // Group refs by phase, preserving phase order from the incoming refs
  const phaseOrder = [];
  const refsByPhase = new Map();
  for (const ref of selectedBlockRefs) {
    if (!refsByPhase.has(ref.phaseId)) {
      refsByPhase.set(ref.phaseId, []);
      phaseOrder.push(ref.phaseId);
    }
    refsByPhase.get(ref.phaseId).push(ref);
  }

  const allMatches = [];
  let position = 0;

  // Track next free slot per field from already planned matches.
  const fieldSlotIndex = new Map(fields.map((f) => [f, 0]));
  existingMatches
    .filter((m) => fields.includes(Number(m.field_number)))
    .forEach((m) => {
      const field = Number(m.field_number);
      const idx = getSlotIndexFromTime(m.start_time) + 1;
      const prev = fieldSlotIndex.get(field) || 0;
      fieldSlotIndex.set(field, Math.max(prev, idx));
    });

  for (const phaseId of phaseOrder) {
    const blockRefs = refsByPhase.get(phaseId);
    const phaseBlocks = phaseBlocksByPhase.get(phaseId) || [];

    // Resolve block objects for this phase
    const blocks = blockRefs
      .map((ref) => phaseBlocks.find((b) => b.id === ref.blockId))
      .filter(Boolean);

    if (blocks.length === 0) {
      continue;
    }

    // Generate round-robin matches per block
    const blockMatchSets = blocks.map((block) => {
      const isEinzelspiel = block.block_type === "einzelspiel";
      const slots = Array.isArray(block.slots) ? block.slots : [];

      let rawPairs;
      if (isEinzelspiel) {
        // Single match: first slot vs second slot
        const t1 = resolveSlot(slots[0], teamsByName, phaseBlocksByPhase);
        const t2 = resolveSlot(slots[1], teamsByName, phaseBlocksByPhase);
        rawPairs = t1 && t2 ? [{ round: 0, team1: t1, team2: t2 }] : [];
      } else {
        const teamEntries = slots
          .map((s) => resolveSlot(s, teamsByName, phaseBlocksByPhase))
          .filter(Boolean);
        rawPairs = generateRoundRobin(teamEntries);
      }

      return { block, pairs: rawPairs };
    });

    // Assign fields to blocks (group affinity)
    const fieldAssignment = assignFieldsToBlocks(blocks, fields);

    // Schedule round by round, interleaving blocks at the same round
    const maxRound = Math.max(
      0,
      ...blockMatchSets.map(({ pairs }) =>
        pairs.length > 0 ? Math.max(...pairs.map((p) => p.round)) : 0
      )
    );

    for (let round = 0; round <= maxRound; round += 1) {
      for (const { block, pairs } of blockMatchSets) {
        const roundPairs = pairs.filter((p) => p.round === round);
        if (roundPairs.length === 0) {
          continue;
        }

        const assignedFields = fieldAssignment.get(block.id) || [fields[0]];

        roundPairs.forEach((pair, matchIndex) => {
          const field = assignedFields[matchIndex % assignedFields.length];
          const slotIdx = fieldSlotIndex.get(field) || 0;
          fieldSlotIndex.set(field, slotIdx + 1);

          const time = addMinutes(startTime, slotIdx * slotDuration);

          allMatches.push({
            phase_id: phaseId,
            block_id: block.id,
            block_name: block.block_name || `Block ${block.id}`,
            team1_id: pair.team1.id || null,
            team2_id: pair.team2.id || null,
            team1_ref: pair.team1.ref || (pair.team1.id ? null : pair.team1.name) || null,
            team2_ref: pair.team2.ref || (pair.team2.id ? null : pair.team2.name) || null,
            referee_id: null,
            field_number: field,
            start_time: time,
            is_finished: 0,
            winner_id: null,
            loser_id: null,
            position: position++,
          });
        });
      }
    }
  }

  return allMatches;
}
