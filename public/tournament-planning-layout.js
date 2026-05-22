/**
 * Mounts the tournament planning layout into the given container.
 * Creates a two-area layout: a center grid area (placeholder for future game grid)
 * and a right-side control panel with three multi-select controls for
 * phases, groups/matches per phase, and fields.
 * @param {HTMLElement} mount Container element to mount into.
 * @returns {{ phaseSelect: HTMLSelectElement, groupSelect: HTMLSelectElement, fieldSelect: HTMLSelectElement, generateButton: HTMLButtonElement, pauseButton: HTMLButtonElement, assignRefereesButton: HTMLButtonElement, gridArea: HTMLElement }}
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

  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "tp-pause-btn";
  pauseButton.textContent = "Pause einfuegen";
  panel.appendChild(pauseButton);

  const assignRefereesButton = document.createElement("button");
  assignRefereesButton.type = "button";
  assignRefereesButton.className = "tp-assign-referees-btn";
  assignRefereesButton.textContent = "Schiedsrichter zuweisen";
  panel.appendChild(assignRefereesButton);

  layout.appendChild(gridArea);
  layout.appendChild(panel);
  mount.appendChild(layout);

  return {
    phaseSelect: phaseGroup.select,
    groupSelect: groupGroup.select,
    fieldSelect: fieldGroup.select,
    generateButton,
    pauseButton,
    assignRefereesButton,
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

  const phaseNameById = new Map(
    phases
      .map((phase) => [Number(phase.id), phase.name])
      .filter(([phaseId]) => Number.isInteger(phaseId) && phaseId > 0)
  );
  const teamNameById = new Map(
    teamsWithIds
      .map((team) => [Number(team.id), team.name])
      .filter(([teamId]) => Number.isInteger(teamId) && teamId > 0)
  );
  const phaseIndexById = new Map(phases.map((phase, index) => [Number(phase.id), index]));

  const phaseActions = buildPhaseActions(matches, phaseNameById);
  gridArea.appendChild(phaseActions);

  const matchesByPhase = new Map();
  matches.forEach((match) => {
    const phaseId = Number(match.phase_id);
    if (!matchesByPhase.has(phaseId)) {
      matchesByPhase.set(phaseId, []);
    }
    matchesByPhase.get(phaseId).push(match);
  });

  const orderedPhaseIds = [...matchesByPhase.keys()].sort(
    (a, b) => (phaseIndexById.get(a) ?? Number.MAX_SAFE_INTEGER) - (phaseIndexById.get(b) ?? Number.MAX_SAFE_INTEGER)
  );

  orderedPhaseIds.forEach((phaseId) => {
    const phaseMatches = matchesByPhase.get(phaseId) || [];
    if (phaseMatches.length === 0) {
      return;
    }

    const phaseName = phaseNameById.get(phaseId) || `Phase ${phaseId}`;
    const section = buildPhaseSection(phaseName, phaseMatches, teamNameById, phaseNameById);
    gridArea.appendChild(section);
  });
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
 * Builds one phase section with title bar and board table.
 * @param {string} phaseName Display name of the phase.
 * @param {Array<object>} matches Match records for a single phase.
 * @param {Map<number, string>} teamNameById Team id to name lookup.
 * @param {Map<number, string>} phaseNameById Phase id to name lookup.
 * @returns {HTMLElement} Completed phase section container.
 */
function buildPhaseSection(phaseName, matches, teamNameById, phaseNameById) {
  const section = document.createElement("section");
  section.className = "tp-phase-section";

  const band = document.createElement("div");
  band.className = "tp-phase-band";

  const icon = document.createElement("span");
  icon.className = "tp-phase-band-icon";
  icon.textContent = "📋";

  const title = document.createElement("h3");
  title.className = "tp-phase-band-title";
  title.textContent = phaseName;

  band.appendChild(icon);
  band.appendChild(title);
  section.appendChild(band);

  const fields = [...new Set(matches.map((m) => Number(m.field_number)).filter((value) => value > 0))].sort(
    (a, b) => a - b
  );
  const timeSlots = [...new Set(matches.map((m) => String(m.start_time || "").trim()))]
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    .sort((a, b) => {
      const [ah, am] = a.split(":").map(Number);
      const [bh, bm] = b.split(":").map(Number);
      return (ah * 60 + am) - (bh * 60 + bm);
    });

  if (fields.length === 0 || timeSlots.length === 0) {
    const empty = document.createElement("div");
    empty.className = "placeholder-box tp-grid-placeholder";
    empty.textContent = "Keine Slots in dieser Phase";
    section.appendChild(empty);
    return section;
  }

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
  corner.className = "tp-grid-head-time";
  corner.textContent = "Zeit";
  board.appendChild(corner);

  fields.forEach((fieldNumber) => {
    const fieldHeader = document.createElement("div");
    fieldHeader.className = "tp-field-head";
    fieldHeader.textContent = `Feld ${fieldNumber}`;
    board.appendChild(fieldHeader);
  });

  timeSlots.forEach((time) => {
    const timeLabel = document.createElement("div");
    timeLabel.className = "tp-time-cell";

    const timeValue = document.createElement("div");
    timeValue.className = "tp-time-value";
    timeValue.textContent = time || "--:--";

    const phaseBadge = document.createElement("div");
    phaseBadge.className = "tp-time-phase-badge";
    phaseBadge.textContent = formatPhaseBadge(phaseName);

    timeLabel.appendChild(timeValue);
    timeLabel.appendChild(phaseBadge);
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

  section.appendChild(board);
  return section;
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
  const isPause = String(match.entry_type || "match") === "pause";
  const card = document.createElement("article");
  card.className = `tp-match-card${match.is_finished ? " is-finished" : ""}${isPause ? " is-pause" : ""}`;
  card.dataset.matchId = String(match.id || "");
  card.dataset.phaseId = String(match.phase_id || "");
  card.dataset.field = String(match.field_number || "");
  card.dataset.time = match.start_time || "";
  card.draggable = !isPause;

  if (isPause) {
    const pauseMeta = document.createElement("div");
    pauseMeta.className = "tp-card-meta";

    const pauseBadge = document.createElement("span");
    pauseBadge.className = "tp-card-group-badge";
    pauseBadge.textContent = "Pause";

    const pauseMetaRight = document.createElement("div");
    pauseMetaRight.className = "tp-card-meta-right";

    const pauseRefId = document.createElement("span");
    pauseRefId.className = "tp-card-match-number";
    pauseRefId.textContent = `#${match.id || "neu"}`;

    const deletePauseButton = document.createElement("button");
    deletePauseButton.type = "button";
    deletePauseButton.className = "tp-card-delete-btn";
    deletePauseButton.dataset.action = "delete-pause";
    deletePauseButton.dataset.matchId = String(match.id || "");
    deletePauseButton.textContent = "🗑";
    deletePauseButton.title = "Pause loeschen";
    deletePauseButton.setAttribute("aria-label", "Pause loeschen");

    pauseMetaRight.appendChild(pauseRefId);
    pauseMetaRight.appendChild(deletePauseButton);

    pauseMeta.appendChild(pauseBadge);
    pauseMeta.appendChild(pauseMetaRight);

    const pauseLine = document.createElement("div");
    pauseLine.className = "tp-card-title";
    const duration = Math.max(1, Number(match.duration_minutes) || 0);
    pauseLine.textContent = `Pause (${duration} min)`;

    const pauseRef = document.createElement("div");
    pauseRef.className = "tp-card-referee";
    pauseRef.textContent = `Hinweis: ${buildMatchReference(match, phaseNameById) || "Pausenslot"}`;

    card.appendChild(pauseMeta);
    card.appendChild(pauseLine);
    card.appendChild(pauseRef);
    return card;
  }

  const t1Label = resolveTeamLabel(match.team1_id, match.team1_ref, teamNameById);
  const t2Label = resolveTeamLabel(match.team2_id, match.team2_ref, teamNameById);
  const refereeLabel = resolveRefereeLabel(match, teamNameById);
  const setResultsText = String(match.set_results_text || "").trim();

  let team1OutcomeClass = "";
  let team2OutcomeClass = "";
  if (match.is_finished) {
    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    const winnerId = Number(match.winner_id);
    const loserId = Number(match.loser_id);
    const hasWinner = Number.isInteger(winnerId) && winnerId > 0;
    const hasLoser = Number.isInteger(loserId) && loserId > 0;

    if (
      hasWinner &&
      hasLoser &&
      Number.isInteger(team1Id) &&
      team1Id > 0 &&
      Number.isInteger(team2Id) &&
      team2Id > 0
    ) {
      if (team1Id === winnerId && team2Id === loserId) {
        team1OutcomeClass = "is-winner";
        team2OutcomeClass = "is-loser";
      } else if (team2Id === winnerId && team1Id === loserId) {
        team1OutcomeClass = "is-loser";
        team2OutcomeClass = "is-winner";
      }
    }

    if (!team1OutcomeClass && !team2OutcomeClass) {
      team1OutcomeClass = "is-draw";
      team2OutcomeClass = "is-draw";
    }
  }

  const meta = document.createElement("div");
  meta.className = "tp-card-meta";

  const groupBadge = document.createElement("span");
  groupBadge.className = "tp-card-group-badge";
  groupBadge.textContent = resolveGroupBadge(match);

  const matchNumber = document.createElement("span");
  matchNumber.className = "tp-card-match-number";
  matchNumber.textContent = `#${match.id || "neu"}`;

  meta.appendChild(groupBadge);
  meta.appendChild(matchNumber);

  const line = document.createElement("div");
  line.className = "tp-card-title";
  const teamsWrap = document.createElement("span");
  teamsWrap.className = "tp-teams-inline";

  const team1Span = document.createElement("span");
  team1Span.className = `tp-team ${team1OutcomeClass}`.trim();
  team1Span.textContent = t1Label;

  const sepSpan = document.createElement("span");
  sepSpan.className = "tp-team-sep";
  sepSpan.textContent = " - ";

  const team2Span = document.createElement("span");
  team2Span.className = `tp-team ${team2OutcomeClass}`.trim();
  team2Span.textContent = t2Label;

  teamsWrap.appendChild(team1Span);
  teamsWrap.appendChild(sepSpan);
  teamsWrap.appendChild(team2Span);
  line.appendChild(teamsWrap);

  if (match.is_finished) {
    const resultChip = document.createElement("span");
    resultChip.className = "tp-card-result-chip";
    resultChip.textContent = setResultsText || "erfasst";
    line.appendChild(resultChip);
  }

  const refLine = document.createElement("div");
  refLine.className = "tp-card-referee";
  refLine.textContent = `Schiri: ${refereeLabel}`;

  card.appendChild(meta);
  card.appendChild(line);
  card.appendChild(refLine);

  return card;
}

/**
 * Formats a compact phase badge label for time cells.
 * @param {string} phaseName Phase display name.
 * @returns {string} Short badge text for the phase.
 */
function formatPhaseBadge(phaseName) {
  const trimmed = String(phaseName || "").trim();
  if (trimmed.length === 0) {
    return "Phase";
  }
  return trimmed.length > 18 ? `${trimmed.slice(0, 18)}...` : trimmed;
}

/**
 * Resolves the visual group badge text for one match card.
 * @param {object} match Match record from persistence.
 * @returns {string} Group badge label.
 */
function resolveGroupBadge(match) {
  const blockName = String(match.block_name || "").trim();
  if (blockName) {
    return blockName;
  }

  const blockType = String(match.block_type || "").trim();
  if (blockType === "einzelspiel") {
    return "Match";
  }

  return "Gruppe";
}

/**
 * Resolves referee label from available fields with fallback.
 * @param {object} match Match record from persistence.
 * @param {Map<number, string>} teamNameById Team id to name lookup.
 * @returns {string} Referee display text.
 */
function resolveRefereeLabel(match, teamNameById) {
  const refereeId = Number(match.referee_id);
  if (Number.isInteger(refereeId) && refereeId > 0 && teamNameById.has(refereeId)) {
    return teamNameById.get(refereeId) || "TBD";
  }

  if (match.team1_ref && String(match.team1_ref).toLowerCase().includes("schiri")) {
    return String(match.team1_ref);
  }

  if (match.team2_ref && String(match.team2_ref).toLowerCase().includes("schiri")) {
    return String(match.team2_ref);
  }

  return "TBD";
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
  const numericTeamId = Number(teamId);
  if (Number.isInteger(numericTeamId) && numericTeamId > 0) {
    return teamNameById.get(numericTeamId) || `Team #${numericTeamId}`;
  }
  return teamRef || "?";
}

/**
 * Mounts the tabular tournament matches layout into the given container.
 * @param {HTMLElement} mount Container element to mount into.
 * @returns {{ tableArea: HTMLElement, phaseToggleButton: HTMLButtonElement, phaseToggleHint: HTMLElement, helperFillButton: HTMLButtonElement }} References to key UI nodes.
 */
export function mountTournamentMatchesLayout(mount) {
  mount.innerHTML = "";

  const card = document.createElement("article");
  card.className = "tm-card";

  const controls = document.createElement("div");
  controls.className = "tm-phase-controls";

  const phaseToggleButton = document.createElement("button");
  phaseToggleButton.type = "button";
  phaseToggleButton.className = "tm-phase-toggle-btn";
  phaseToggleButton.dataset.mode = "start";
  phaseToggleButton.textContent = "Start";

  const phaseToggleHint = document.createElement("span");
  phaseToggleHint.className = "tm-phase-toggle-hint";
  phaseToggleHint.textContent = "";

  const helperFillButton = document.createElement("button");
  helperFillButton.type = "button";
  helperFillButton.className = "tm-helper-fill-btn";
  helperFillButton.textContent = "Temp: Zufalls-Ergebnisse fuellen";

  controls.appendChild(phaseToggleButton);
  controls.appendChild(helperFillButton);
  controls.appendChild(phaseToggleHint);

  const tableArea = document.createElement("div");
  tableArea.className = "tm-table-area";

  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-box";
  placeholder.textContent = "Noch keine Matches vorhanden";
  tableArea.appendChild(placeholder);

  card.appendChild(controls);
  card.appendChild(tableArea);
  mount.appendChild(card);

  return { tableArea, phaseToggleButton, phaseToggleHint, helperFillButton };
}

/**
 * Renders the phase start/reset control above the match table.
 * @param {HTMLButtonElement} phaseToggleButton Toggle button.
 * @param {HTMLElement} phaseToggleHint Inline hint label.
 * @param {{mode: "start"|"reset"|"done", phaseName: string, hasMatches: boolean}} state Control state.
 * @returns {void}
 */
export function renderTournamentMatchesPhaseControl(phaseToggleButton, phaseToggleHint, state) {
  const mode = String(state?.mode || "done");
  const phaseName = String(state?.phaseName || "");
  const hasMatches = Boolean(state?.hasMatches);

  phaseToggleButton.dataset.mode = mode;

  if (!hasMatches || mode === "done") {
    phaseToggleButton.textContent = "Alle Phasen gestartet";
    phaseToggleButton.disabled = true;
    phaseToggleHint.textContent = hasMatches
      ? "Es sind keine weiteren Phasen zum Starten vorhanden."
      : "Es sind noch keine Matches vorhanden.";
    return;
  }

  if (mode === "start") {
    phaseToggleButton.textContent = `Start Phase ${phaseName}`;
    phaseToggleButton.disabled = false;
    phaseToggleHint.textContent = "Spielaktionen bleiben gesperrt, bis die Phase gestartet wurde.";
    return;
  }

  phaseToggleButton.textContent = `Phase ${phaseName} zuruecksetzen`;
  phaseToggleButton.disabled = false;
  phaseToggleHint.textContent = "Zuruecksetzen ist vorbereitet und wird im naechsten Schritt implementiert.";
}

/**
 * Renders the tabular all-matches page.
 * @param {HTMLElement} tableArea Target table container.
 * @param {Array<object>} rows Prepared row view-model entries.
 * @returns {void}
 */
export function renderTournamentMatchesTable(tableArea, rows) {
  tableArea.innerHTML = "";

  if (!Array.isArray(rows) || rows.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-box";
    placeholder.textContent = "Noch keine Matches vorhanden";
    tableArea.appendChild(placeholder);
    return;
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "tm-table-wrap";

  const table = document.createElement("table");
  table.className = "tm-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Zeit</th>
      <th>Feld</th>
      <th>#</th>
      <th>Runde</th>
      <th>Teams</th>
      <th>Schiedsrichter</th>
      <th>Status</th>
      <th>Aktion</th>
    </tr>
  `;

  const tbody = document.createElement("tbody");

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const statusClass = row.isFinished ? "is-finished" : "is-open";
    const statusText = row.isFinished ? "Beendet" : "Offen";
    const fieldLabel = `Feld ${row.fieldNumber}`;

    const actionsHtml = row.showActions
      ? `
        <button type="button" class="tm-action-btn is-primary" data-action="match-entry" data-match-id="${row.matchId}" ${row.actionsEnabled ? "" : "disabled"}>Eintragen</button>
        <button type="button" class="tm-action-btn is-danger" data-action="match-delete" data-match-id="${row.matchId}" ${row.actionsEnabled ? "" : "disabled"}>Loeschen</button>
      `
      : "";

    const setResultsHtml = row.setResultsText
      ? `<div class="tm-set-results">${row.setResultsText}</div>`
      : "";

    const teamsHtml = row.isPause
      ? escapeHtml(String(row.teamsLabel || ""))
      : `
        <span class="tm-team ${String(row.team1OutcomeClass || "")}">${escapeHtml(String(row.team1Label || ""))}</span>
        <span class="tm-team-sep"> - </span>
        <span class="tm-team ${String(row.team2OutcomeClass || "")}">${escapeHtml(String(row.team2Label || ""))}</span>
      `;

    tr.innerHTML = `
      <td class="tm-time">${row.startTime}</td>
      <td><span class="tm-chip tm-chip-field">${fieldLabel}</span></td>
      <td>${row.number}</td>
      <td><span class="tm-chip tm-chip-round">${row.roundLabel}</span></td>
      <td class="tm-teams">${teamsHtml}</td>
      <td class="tm-ref-cell"></td>
      <td>
        <span class="tm-status ${statusClass}">${statusText}</span>
        ${setResultsHtml}
      </td>
      <td class="tm-actions">
        ${actionsHtml}
      </td>
    `;

    const refCell = tr.querySelector(".tm-ref-cell");
    if (!row.canEditReferee) {
      const text = document.createElement("span");
      text.className = "tm-ref-static";
      text.textContent = row.refereeLabel;
      refCell.appendChild(text);
    } else {
      const select = document.createElement("select");
      select.className = "tm-ref-select";
      select.dataset.matchId = String(row.matchId);
      select.dataset.phaseId = String(row.phaseId);

      const noneOption = document.createElement("option");
      noneOption.value = "";
      noneOption.textContent = "-- Kein Schiedsrichter --";
      select.appendChild(noneOption);

      row.refereeOptions.forEach((optionEntry) => {
        const option = document.createElement("option");
        option.value = String(optionEntry.id);
        option.textContent = optionEntry.unavailable
          ? `${optionEntry.name} (nicht verfuegbar)`
          : optionEntry.name;
        select.appendChild(option);
      });

      select.value = row.refereeId > 0 ? String(row.refereeId) : "";
      refCell.appendChild(select);
    }

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableArea.appendChild(tableWrap);
}

/**
 * Escapes minimal HTML-sensitive characters for safe text interpolation.
 * @param {string} value Input text value.
 * @returns {string} Escaped string.
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
