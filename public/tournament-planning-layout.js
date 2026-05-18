/**
 * Mounts the tournament planning layout into the given container.
 * Creates a two-area layout: a center grid area (placeholder for future game grid)
 * and a right-side control panel with three multi-select controls for
 * phases, groups/matches per phase, and fields.
 * @param {HTMLElement} mount Container element to mount into.
 * @returns {{ phaseSelect: HTMLSelectElement, groupSelect: HTMLSelectElement, fieldSelect: HTMLSelectElement, generateButton: HTMLButtonElement, gridArea: HTMLElement }}
 */
export function mountTournamentPlanningLayout(mount) {
  mount.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "tp-layout";

  const gridArea = document.createElement("div");
  gridArea.className = "tp-grid-area";

  const placeholderEl = document.createElement("div");
  placeholderEl.className = "placeholder-box tp-grid-placeholder";
  placeholderEl.textContent = "Spielplan wird hier angezeigt";
  gridArea.appendChild(placeholderEl);
  const panel = document.createElement("aside");
  panel.className = "tp-control-panel";

  const phaseGroup = createControlGroup("tp-phase-select", "Phase");
  const groupGroup = createControlGroup("tp-group-select", "Gruppe / Match");
  const fieldGroup = createControlGroup("tp-field-select", "Feld");

  panel.appendChild(phaseGroup.wrapper);
  panel.appendChild(groupGroup.wrapper);
  panel.appendChild(fieldGroup.wrapper);

  const generateButton = document.createElement("button");
  generateButton.type = "button";
  generateButton.className = "tp-generate-btn";
  generateButton.textContent = "Matches generieren";
  panel.appendChild(generateButton);

  layout.appendChild(gridArea);
  layout.appendChild(panel);
  mount.appendChild(layout);

  return {
    phaseSelect: phaseGroup.select,
    groupSelect: groupGroup.select,
    fieldSelect: fieldGroup.select,
    generateButton,
    gridArea,
  };
}

/**
 * Creates a labeled multi-select control group element.
 * @param {string} className CSS class for the select element.
 * @param {string} labelText Label text to display above the select.
 * @returns {{ wrapper: HTMLElement, select: HTMLSelectElement }}
 */
function createControlGroup(className, labelText) {
  const wrapper = document.createElement("div");
  wrapper.className = "tp-control-group";

  const label = document.createElement("span");
  label.className = "tp-control-label";
  label.textContent = labelText;

  const select = document.createElement("select");
  select.className = className;
  select.multiple = true;
  select.size = 6;

  wrapper.appendChild(label);
  wrapper.appendChild(select);

  return { wrapper, select };
}

/**
 * Populates the phase multi-select with the given phase list.
 * Preserves existing selections where the phase id is still present.
 * @param {HTMLSelectElement} phaseSelect Target select element.
 * @param {Array<{id: number, name: string}>} phases List of available phases.
 * @returns {void}
 */
export function renderTournamentPlanningPhases(phaseSelect, phases) {
  const previousValues = new Set([...phaseSelect.selectedOptions].map((o) => o.value));
  phaseSelect.innerHTML = "";

  if (phases.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.disabled = true;
    placeholder.textContent = "Keine Phasen vorhanden";
    phaseSelect.appendChild(placeholder);
    return;
  }

  phases.forEach((phase) => {
    const option = document.createElement("option");
    option.value = String(phase.id);
    option.textContent = phase.name || `Phase ${phase.id}`;
    if (previousValues.has(option.value)) {
      option.selected = true;
    }
    phaseSelect.appendChild(option);
  });
}

/**
 * Populates the group/match multi-select based on blocks for the selected phases.
 * Each option is labelled with the phase name and the block name.
 * Preserves existing selections by value key where still applicable.
 * @param {HTMLSelectElement} groupSelect Target select element.
 * @param {Array<number>} selectedPhaseIds Currently selected phase IDs.
 * @param {Map<number, Array<object>>} phaseBlocksByPhase All loaded phase blocks keyed by phase id.
 * @param {Array<{id: number, name: string}>} phases All phases for label context.
 * @returns {void}
 */
export function renderTournamentPlanningGroups(
  groupSelect,
  selectedPhaseIds,
  phaseBlocksByPhase,
  phases
) {
  const previousValues = new Set([...groupSelect.selectedOptions].map((o) => o.value));
  groupSelect.innerHTML = "";

  let hasOptions = false;

  selectedPhaseIds.forEach((phaseId) => {
    const blocks = phaseBlocksByPhase.get(phaseId) || [];
    const phase = phases.find((p) => p.id === phaseId);
    const phaseLabel = phase?.name || `Phase ${phaseId}`;

    blocks.forEach((block, index) => {
      const option = document.createElement("option");
      const key = `${phaseId}-${block.id ?? index}`;
      option.value = key;
      const isEinzelspiel = block.block_type === "einzelspiel";
      const defaultLabel = isEinzelspiel ? `Match ${index + 1}` : `Gruppe ${index + 1}`;
      option.textContent = `${phaseLabel}: ${block.block_name || defaultLabel}`;
      if (previousValues.has(key)) {
        option.selected = true;
      }
      groupSelect.appendChild(option);
      hasOptions = true;
    });
  });

  if (!hasOptions) {
    const placeholder = document.createElement("option");
    placeholder.disabled = true;
    placeholder.textContent =
      selectedPhaseIds.length === 0
        ? "Zuerst Phase auswaehlen"
        : "Keine Bausteine in ausgewaehlten Phasen";
    groupSelect.appendChild(placeholder);
  }
}

/**
 * Populates the fields multi-select from field 1 up to the given maximum.
 * Preserves existing selections where still applicable.
 * @param {HTMLSelectElement} fieldSelect Target select element.
 * @param {number} maxFields Maximum number of available fields.
 * @returns {void}
 */
export function renderTournamentPlanningFields(fieldSelect, maxFields) {
  const previousValues = new Set([...fieldSelect.selectedOptions].map((o) => o.value));
  fieldSelect.innerHTML = "";

  const count = Math.max(1, maxFields);
  for (let i = 1; i <= count; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `Feld ${i}`;
    if (previousValues.has(option.value)) {
      option.selected = true;
    }
    fieldSelect.appendChild(option);
  }
}

/**
 * Reads the currently selected phase IDs from the phase multi-select.
 * @param {HTMLSelectElement} phaseSelect Phase select element.
 * @returns {Array<number>} Selected phase IDs as numbers.
 */
export function readSelectedPhaseIds(phaseSelect) {
  return [...phaseSelect.selectedOptions].map((o) => Number(o.value));
}

/**
 * Renders the full match grid into the grid area, replacing any previous content.
 * Shows a placeholder when there are no matches to display.
 * Organises output into one section per phase, each containing a field-column grid.
 * @param {HTMLElement} gridArea Container element that holds the grid.
 * @param {Array<object>} matches All match records to display.
 * @param {Array<{id: number, name: string}>} phases All phases for name lookup.
 * @param {Array<{id: number, name: string}>} teamsWithIds Teams for name lookup.
 * @returns {void}
 */
export function renderMatchGrid(gridArea, matches, phases, teamsWithIds) {
  gridArea.innerHTML = "";

  if (!Array.isArray(matches) || matches.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-box tp-grid-placeholder";
    placeholder.textContent = "Spielplan wird hier angezeigt";
    gridArea.appendChild(placeholder);
    return;
  }

  const phaseNameById = new Map(phases.map((p) => [p.id, p.name]));
  const teamNameById = new Map(teamsWithIds.map((t) => [t.id, t.name]));

  const fields = [...new Set(matches.map((m) => Number(m.field_number)))].sort((a, b) => a - b);
  const timeSlots = [...new Set(matches.map((m) => String(m.start_time || "")))].sort();

  const phaseActions = buildPhaseActions(matches, phaseNameById);
  gridArea.appendChild(phaseActions);

  const board = buildGlobalBoard(matches, fields, timeSlots, teamNameById, phaseNameById);
  gridArea.appendChild(board);
}

/**
 * Builds the phase action bar with one delete button per phase.
 * @param {Array<object>} matches Match records currently rendered.
 * @param {Map<number, string>} phaseNameById Phase id to name lookup.
 * @returns {HTMLElement} Action bar container.
 */
function buildPhaseActions(matches, phaseNameById) {
  const bar = document.createElement("div");
  bar.className = "tp-phase-actions";

  const phaseIds = [...new Set(matches.map((m) => Number(m.phase_id)))];
  phaseIds.forEach((phaseId) => {
    const button = document.createElement("button");
    const phaseName = phaseNameById.get(phaseId) || `Phase ${phaseId}`;
    button.type = "button";
    button.className = "tp-phase-delete-btn";
    button.dataset.action = "delete-phase";
    button.dataset.phaseId = String(phaseId);
    button.dataset.phaseName = phaseName;
    button.textContent = `${phaseName} löschen`;
    bar.appendChild(button);
  });

  return bar;
}

/**
 * Builds one global board element with shared field columns and shared time rows.
 * @param {Array<object>} matches Match records for all phases.
 * @param {Array<number>} fields Ordered field numbers.
 * @param {Array<string>} timeSlots Ordered time slot labels.
 * @param {Map<number, string>} teamNameById Team id to name lookup.
 * @param {Map<number, string>} phaseNameById Phase id to name lookup.
 * @returns {HTMLElement} Completed board container.
 */
function buildGlobalBoard(matches, fields, timeSlots, teamNameById, phaseNameById) {
  const board = document.createElement("div");
  board.className = "tp-field-columns";
  board.style.setProperty("--tp-field-count", String(fields.length));

  // Build match lookup: key = "startTime|fieldNumber".
  const matchLookup = new Map();
  matches.forEach((m) => {
    const key = `${m.start_time}|${m.field_number}`;
    if (!matchLookup.has(key)) {
      matchLookup.set(key, []);
    }
    matchLookup.get(key).push(m);
  });

  const corner = document.createElement("div");
  corner.className = "tp-grid-corner";
  board.appendChild(corner);

  fields.forEach((fieldNumber) => {
    const fieldHeader = document.createElement("h4");
    fieldHeader.className = "tp-field-title";
    fieldHeader.textContent = `Feld ${fieldNumber}`;
    board.appendChild(fieldHeader);
  });

  timeSlots.forEach((time) => {
    const timeLabel = document.createElement("div");
    timeLabel.className = "tp-slot-time";
    timeLabel.textContent = time || "--:--";
    board.appendChild(timeLabel);

    fields.forEach((fieldNumber) => {
      const slot = document.createElement("div");
      slot.className = "tp-drop-slot";
      slot.dataset.field = String(fieldNumber);
      slot.dataset.time = time;

      const cardsWrap = document.createElement("div");
      cardsWrap.className = "tp-slot-cards";

      const cellMatches = matchLookup.get(`${time}|${fieldNumber}`) || [];
      cellMatches.forEach((match) => {
        cardsWrap.appendChild(buildMatchCard(match, teamNameById, phaseNameById));
      });

      slot.appendChild(cardsWrap);
      board.appendChild(slot);
    });
  });

  return board;
}

/**
 * Builds a match card element for one match record.
 * Cards are marked draggable for future drag-and-drop support.
 * @param {object} match Match record from the backend.
 * @param {Map<number, string>} teamNameById Team id to name lookup.
 * @param {Map<number, string>} phaseNameById Phase id to name lookup.
 * @returns {HTMLElement} Match card article element.
 */
function buildMatchCard(match, teamNameById, phaseNameById) {
  const card = document.createElement("article");
  card.className = `tp-match-card${match.is_finished ? " is-finished" : ""}`;
  card.dataset.matchId = String(match.id || "");
  card.dataset.phaseId = String(match.phase_id || "");
  card.dataset.field = String(match.field_number || "");
  card.dataset.time = match.start_time || "";
  card.draggable = true;

  const t1Label = resolveTeamLabel(match.team1_id, match.team1_ref, teamNameById);
  const t2Label = resolveTeamLabel(match.team2_id, match.team2_ref, teamNameById);

  const line = document.createElement("div");
  line.className = "tp-match-line";
  line.textContent = `#${match.id || "neu"} ${t1Label} - ${t2Label} ${match.start_time || "--:--"}`;

  const refLine = document.createElement("div");
  refLine.className = "tp-match-ref";
  const reference = buildMatchReference(match, phaseNameById);
  refLine.textContent = reference ? `Ref: ${reference}` : match.block_name || "";

  card.appendChild(line);
  card.appendChild(refLine);

  if (match.is_finished) {
    const badge = document.createElement("span");
    badge.className = "tp-match-finished-badge";
    badge.textContent = "Beendet";
    card.appendChild(badge);
  }

  return card;
}

/**
 * Builds a compact reference string for one match card.
 * @param {object} match Match record from persistence.
 * @param {Map<number, string>} phaseNameById Phase id to name lookup.
 * @returns {string} Combined reference text or empty string.
 */
function buildMatchReference(match, phaseNameById) {
  const refs = [];
  const phaseName = phaseNameById.get(Number(match.phase_id));
  if (phaseName) {
    refs.push(phaseName);
  }
  if (match.block_name) {
    refs.push(match.block_name);
  }
  if (match.team1_ref) {
    refs.push(match.team1_ref);
  }
  if (match.team2_ref) {
    refs.push(match.team2_ref);
  }
  return refs.join(" | ");
}

/**
 * Resolves a team id or ref string to a display label.
 * @param {number|null} teamId Team database id.
 * @param {string|null} teamRef Reference string when team id is not available.
 * @param {Map<number, string>} teamNameById Team id to name lookup.
 * @returns {string} Display label for the team.
 */
function resolveTeamLabel(teamId, teamRef, teamNameById) {
  if (teamId) {
    return teamNameById.get(teamId) || `Team #${teamId}`;
  }
  return teamRef || "?";
}
