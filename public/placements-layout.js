/**
 * placements-layout.js — UI rendering for placements management.
 */

/**
 * Returns only phases that contain at least one group block.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {Array<object>} Phases with group blocks.
 */
function getGroupPhaseOptions(allPhases, blocksByPhase) {
  return allPhases.filter((phase) => {
    const blocks = blocksByPhase.get(phase.id) || [];
    return blocks.some((block) => block.block_type === "gruppe");
  });
}

/**
 * Returns group blocks for one phase.
 * @param {number} phaseId Phase id.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {Array<object>} Group blocks for the selected phase.
 */
function getGroupBlocksForPhase(phaseId, blocksByPhase) {
  const blocks = blocksByPhase.get(phaseId) || [];
  return blocks.filter((block) => block.block_type === "gruppe");
}

/**
 * Returns a readable group display name with fallback to phase-local numbering.
 * @param {object} groupBlock Group block object.
 * @param {number} indexInPhase Zero-based index within the current phase group list.
 * @returns {string} Display label for group selects.
 */
function getGroupDisplayName(groupBlock, indexInPhase) {
  const explicitName = String(groupBlock?.block_name || "").trim();
  if (explicitName) {
    return explicitName;
  }
  return `Gruppe ${indexInPhase + 1}`;
}

/**
 * Returns only phases that contain at least one match block.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {Array<object>} Phases with match blocks.
 */
function getMatchPhaseOptions(allPhases, blocksByPhase) {
  return allPhases.filter((phase) => {
    const blocks = blocksByPhase.get(phase.id) || [];
    return blocks.some((block) => block.block_type === "einzelspiel");
  });
}

/**
 * Returns match blocks for one phase.
 * @param {number} phaseId Phase id.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {Array<object>} Match blocks for the selected phase.
 */
function getMatchBlocksForPhase(phaseId, blocksByPhase) {
  const blocks = blocksByPhase.get(phaseId) || [];
  return blocks.filter((block) => block.block_type === "einzelspiel");
}

/**
 * Creates a placement card element.
 * @param {object} placement Placement object with id, position_label, entries array.
 * @param {number} placementIndex Index of the placement.
 * @param {Array<object>} allTeams Array of all teams.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {HTMLElement} Placement card element.
 */
export function createPlacementCardElement(placement, placementIndex, allTeams, allPhases, blocksByPhase) {
  const card = document.createElement("div");
  card.className = "placement-card";
  card.dataset.placementId = placement.id || `new-${placementIndex}`;

  // Header with label
  const header = document.createElement("div");
  header.className = "placement-card-header";

  const labelInput = document.createElement("input");
  labelInput.type = "text";
  labelInput.className = "placement-label-input";
  labelInput.value = placement.position_label || `Place ${placementIndex + 1}`;
  labelInput.placeholder = `Platzierung ${placementIndex + 1}`;

  header.appendChild(labelInput);
  card.appendChild(header);

  // Entry slots container
  const slotsContainer = document.createElement("div");
  slotsContainer.className = "placement-slots-container";

  // Add a single slot for now (user can add more via UI in future)
  try {
    const slot = createPlacementSlotElement(
      placement.entries && placement.entries[0] ? placement.entries[0] : {},
      0,
      allTeams || [],
      allPhases || [],
      blocksByPhase || new Map()
    );
    slotsContainer.appendChild(slot);
  } catch (error) {
    const errorDiv = document.createElement("div");
    errorDiv.textContent = `Fehler beim Erstellen des Slots: ${error.message}`;
    errorDiv.style.color = "red";
    slotsContainer.appendChild(errorDiv);
  }

  card.appendChild(slotsContainer);

  return card;
}

/**
 * Creates a placement entry slot element.
 * @param {object} entry Entry object or empty object.
 * @param {number} slotIndex Index of the slot.
 * @param {Array<object>} allTeams Array of all teams.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {HTMLElement} Slot element.
 */
export function createPlacementSlotElement(entry, slotIndex, allTeams, allPhases, blocksByPhase) {
  const slot = document.createElement("div");
  slot.className = "placement-slot";
  slot.dataset.slotIndex = slotIndex;

  // Entry type selector
  const typeLabel = document.createElement("label");
  typeLabel.textContent = "Quelle:";
  typeLabel.className = "placement-slot-label";

  const typeSelect = document.createElement("select");
  typeSelect.className = "placement-entry-type-select";
  typeSelect.dataset.slotIndex = slotIndex;
  typeSelect.innerHTML = `
    <option value="team">Team (direkt)</option>
    <option value="group_rank">Gruppe Position</option>
    <option value="match_winner">Match Gewinner</option>
    <option value="match_loser">Match Verlierer</option>
  `;
  typeSelect.value = entry.entry_type || "team";

  slot.appendChild(typeLabel);
  slot.appendChild(typeSelect);

  // Additional selectors based on type
  const optionsContainer = document.createElement("div");
  optionsContainer.className = "placement-slot-options";

  function updateOptions() {
    optionsContainer.innerHTML = "";

    const selectedType = typeSelect.value;

    if (selectedType === "team") {
      const teamLabel = document.createElement("label");
      teamLabel.textContent = "Team:";

      const teamSelect = document.createElement("select");
      teamSelect.className = "placement-team-select";
      teamSelect.innerHTML = '<option value="">-- Team auswählen --</option>';
      for (const team of allTeams) {
        const opt = document.createElement("option");
        opt.value = team.name;
        opt.textContent = team.name;
        if (entry.entry_team_name === team.name) opt.selected = true;
        teamSelect.appendChild(opt);
      }

      optionsContainer.appendChild(teamLabel);
      optionsContainer.appendChild(teamSelect);
    } else if (selectedType === "group_rank" || selectedType.includes("match")) {
      const phaseLabel = document.createElement("label");
      phaseLabel.textContent = "Phase:";

      const phaseSelect = document.createElement("select");
      phaseSelect.className = "placement-phase-select";
      phaseSelect.innerHTML = '<option value="">-- Phase auswählen --</option>';
      const groupPhases = getGroupPhaseOptions(allPhases, blocksByPhase);
      const matchPhases = getMatchPhaseOptions(allPhases, blocksByPhase);
      for (const phase of selectedType === "group_rank" ? groupPhases : matchPhases) {
        const opt = document.createElement("option");
        opt.value = phase.id;
        opt.textContent = phase.name;
        if (Number(entry.entry_source_phase_id) === phase.id) opt.selected = true;
        phaseSelect.appendChild(opt);
      }

      optionsContainer.appendChild(phaseLabel);
      optionsContainer.appendChild(phaseSelect);

      if (selectedType === "group_rank") {
        const groupLabel = document.createElement("label");
        groupLabel.textContent = "Gruppe:";

        const groupSelect = document.createElement("select");
        groupSelect.className = "placement-group-select";

        const positionLabel = document.createElement("label");
        positionLabel.textContent = "Position:";

        const positionSelect = document.createElement("select");
        positionSelect.className = "placement-group-position-select";

        const populatePositions = () => {
          positionSelect.innerHTML = '<option value="">-- Position wählen --</option>';
          const selectedGroupId = Number(groupSelect.value);
          const selectedPhaseId = Number(phaseSelect.value);
          const groupBlocks = getGroupBlocksForPhase(selectedPhaseId, blocksByPhase);
          const selectedGroup = groupBlocks.find((block) => Number(block.id) === selectedGroupId);
          const slotCount = Math.max(2, Number(selectedGroup?.teams_per_group) || 4);

          for (let position = 1; position <= slotCount; position += 1) {
            const option = document.createElement("option");
            option.value = String(position);
            option.textContent = `Platz ${position}`;
            if (Number(entry.entry_group_position) === position) {
              option.selected = true;
            }
            positionSelect.appendChild(option);
          }
        };

        const populateGroups = () => {
          groupSelect.innerHTML = '<option value="">-- Gruppe wählen --</option>';
          const selectedPhaseId = Number(phaseSelect.value);
          const groupBlocks = getGroupBlocksForPhase(selectedPhaseId, blocksByPhase);

          groupBlocks.forEach((groupBlock, groupIndex) => {
            const option = document.createElement("option");
            option.value = String(groupBlock.id);
            option.textContent = getGroupDisplayName(groupBlock, groupIndex);
            if (Number(entry.entry_source_id) === Number(groupBlock.id)) {
              option.selected = true;
            }
            groupSelect.appendChild(option);
          });

          populatePositions();
        };

        phaseSelect.addEventListener("change", populateGroups);
        groupSelect.addEventListener("change", populatePositions);

        populateGroups();

        optionsContainer.appendChild(groupLabel);
        optionsContainer.appendChild(groupSelect);
        optionsContainer.appendChild(positionLabel);
        optionsContainer.appendChild(positionSelect);
      } else if (selectedType === "match_winner" || selectedType === "match_loser") {
        const matchLabel = document.createElement("label");
        matchLabel.textContent = "Match:";

        const matchSelect = document.createElement("select");
        matchSelect.className = "placement-match-select";

        const populateMatches = () => {
          matchSelect.innerHTML = '<option value="">-- Match wählen --</option>';
          const selectedPhaseId = Number(phaseSelect.value);
          const matchBlocks = getMatchBlocksForPhase(selectedPhaseId, blocksByPhase);

          for (const matchBlock of matchBlocks) {
            const option = document.createElement("option");
            option.value = String(matchBlock.id);
            option.textContent = matchBlock.block_name || `Match ${matchBlock.id}`;
            if (Number(entry.entry_source_id) === Number(matchBlock.id)) {
              option.selected = true;
            }
            matchSelect.appendChild(option);
          }
        };

        phaseSelect.addEventListener("change", populateMatches);
        populateMatches();

        optionsContainer.appendChild(matchLabel);
        optionsContainer.appendChild(matchSelect);
      }
    }
  }

  typeSelect.addEventListener("change", updateOptions);
  updateOptions();

  slot.appendChild(optionsContainer);

  return slot;
}

/**
 * Renders the placements management interface.
 * @param {HTMLElement} mountPoint Mount point for the UI.
 * @param {Array<object>} placements Array of placements.
 * @param {number} teamCount Total number of teams.
 * @param {Array<object>} allTeams Array of all teams.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 */
export function renderPlacementsUI(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase = new Map()) {
  return renderPlacementsUIWithBlocks(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase);
}

/**
 * Renders the placements management interface with access to phase blocks.
 * @param {HTMLElement} mountPoint Mount point for the UI.
 * @param {Array<object>} placements Array of placements.
 * @param {number} teamCount Total number of teams.
 * @param {Array<object>} allTeams Array of all teams.
 * @param {Array<object>} allPhases Array of all phases.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {{container: HTMLElement|null}} Rendered UI controls.
 */
export function renderPlacementsUIWithBlocks(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase) {
  mountPoint.innerHTML = "";

  // Summary section
  const summary = document.createElement("div");
  summary.className = "placements-summary";
  summary.innerHTML = `
    <p>Teams: <strong>${teamCount}</strong> | Platzierungen: <strong>${placements.length}</strong></p>
  `;
  mountPoint.appendChild(summary);

  const overview = createPlacementsOverview(placements, allTeams, allPhases, blocksByPhase);
  mountPoint.appendChild(overview);

  const tableBody = overview.querySelector("tbody");

  return { container: tableBody };
}

/**
 * Reads placement data from the rendered UI.
 * @param {HTMLElement} container Placements container element.
 * @returns {Array<object>} Array of placement objects with entries.
 */
export function readPlacementsFromUI(container) {
  const placementRows = container?.querySelectorAll(".placements-overview-row") || [];
  const placements = [];

  for (const row of placementRows) {
    const labelInput = row.querySelector(".placement-label-input");
    const typeSelect = row.querySelector(".placement-entry-type-select");
    const entryType = typeSelect?.value || "team";

    const entry = {
      entry_type: entryType,
    };

    if (entryType === "team") {
      const teamSelect = row.querySelector(".placement-team-select");
      if (teamSelect?.value) {
        entry.entry_team_name = teamSelect.value;
      }
    } else if (entryType === "group_rank" || entryType.includes("match")) {
      const phaseSelect = row.querySelector(".placement-phase-select");
      if (phaseSelect?.value) {
        entry.entry_source_phase_id = Number(phaseSelect.value);
      }

      if (entryType === "group_rank") {
        const groupSelect = row.querySelector(".placement-group-select");
        const positionSelect = row.querySelector(".placement-group-position-select");

        if (groupSelect?.value) {
          entry.entry_source_id = Number(groupSelect.value);
          const selectedGroupLabel = groupSelect.options[groupSelect.selectedIndex]?.textContent;
          if (selectedGroupLabel) {
            entry.entry_group_name = selectedGroupLabel;
          }
        }

        if (positionSelect?.value) {
          entry.entry_group_position = Number(positionSelect.value);
        }
      } else {
        const matchSelect = row.querySelector(".placement-match-select");

        if (matchSelect?.value) {
          entry.entry_source_id = Number(matchSelect.value);
          const selectedMatchLabel = matchSelect.options[matchSelect.selectedIndex]?.textContent;
          if (selectedMatchLabel) {
            entry.entry_match_name = selectedMatchLabel;
          }
        }
      }
    }

    placements.push({
      position_label: labelInput?.value || `Place ${placements.length + 1}`,
      entries: [entry],
    });
  }

  return placements;
}

/**
 * Creates a placements overview table showing all placements and their sources.
 * @param {Array<object>} placements Array of placements.
 * @param {Array<object>} allTeams Array of all teams.
 * @param {Array<object>} allPhases Array of all phases (with blocks data).
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {HTMLElement} Overview table element.
 */
export function createPlacementsOverview(placements, allTeams, allPhases, blocksByPhase) {
  const overview = document.createElement("div");
  overview.className = "placements-overview";

  const title = document.createElement("h3");
  title.textContent = "Platzierungen Übersicht";
  overview.appendChild(title);

  const table = document.createElement("table");
  table.className = "placements-overview-table";

  // Header
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headerRow.innerHTML = `
    <th>Platzierung</th>
    <th>Quelle</th>
    <th>Team/Phase</th>
    <th>Gruppe/Match</th>
    <th>Position</th>
  `;
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
    const placement = placements[placementIndex];
    const entry = placement.entries && placement.entries.length > 0 ? placement.entries[0] : {};
    const row = document.createElement("tr");
    row.className = "placements-overview-row";

    const labelCell = document.createElement("td");
    labelCell.className = "placement-label-cell";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "placement-label-input";
    labelInput.placeholder = `Platzierung ${placementIndex + 1}`;
    labelInput.value = placement.position_label || `Place ${placementIndex + 1}`;
    labelCell.appendChild(labelInput);

    const sourceCell = document.createElement("td");
    sourceCell.className = "placement-source-cell";
    const typeSelect = document.createElement("select");
    typeSelect.className = "placement-entry-type-select";
    typeSelect.innerHTML = `
      <option value="team">Team (direkt)</option>
      <option value="group_rank">Gruppe Position</option>
      <option value="match_winner">Match Gewinner</option>
      <option value="match_loser">Match Verlierer</option>
    `;
    typeSelect.value = entry.entry_type || "team";
    sourceCell.appendChild(typeSelect);

    const teamPhaseCell = document.createElement("td");
    teamPhaseCell.className = "placement-variant-cell";

    const groupMatchCell = document.createElement("td");
    groupMatchCell.className = "placement-variant-cell";

    const positionCell = document.createElement("td");
    positionCell.className = "placement-variant-cell";

    /**
     * Clears a variant cell and shows an empty placeholder.
     * @param {HTMLTableCellElement} cell Table cell to reset.
     * @returns {void}
     */
    function setEmptyCell(cell) {
      cell.innerHTML = "";
      const placeholder = document.createElement("span");
      placeholder.className = "placement-empty-cell";
      placeholder.textContent = "-";
      cell.appendChild(placeholder);
    }

    /**
     * Renders variant-specific selectors for one placement row.
     * @returns {void}
     */
    function renderVariantControls() {
      teamPhaseCell.innerHTML = "";
      groupMatchCell.innerHTML = "";
      positionCell.innerHTML = "";

      const selectedType = typeSelect.value;

      if (selectedType === "team") {
        const teamSelect = document.createElement("select");
        teamSelect.className = "placement-team-select";
        teamSelect.innerHTML = '<option value="">-- Team --</option>';

        for (const team of allTeams) {
          const option = document.createElement("option");
          option.value = team.name;
          option.textContent = team.name;
          if (entry.entry_team_name === team.name) {
            option.selected = true;
          }
          teamSelect.appendChild(option);
        }

        teamPhaseCell.appendChild(teamSelect);
        setEmptyCell(groupMatchCell);
        setEmptyCell(positionCell);
        return;
      }

      const phaseSelect = document.createElement("select");
      phaseSelect.className = "placement-phase-select";
      phaseSelect.innerHTML = '<option value="">-- Phase --</option>';

      const phases = selectedType === "group_rank"
        ? getGroupPhaseOptions(allPhases, blocksByPhase)
        : getMatchPhaseOptions(allPhases, blocksByPhase);

      for (const phase of phases) {
        const option = document.createElement("option");
        option.value = String(phase.id);
        option.textContent = phase.name;
        if (Number(entry.entry_source_phase_id) === phase.id) {
          option.selected = true;
        }
        phaseSelect.appendChild(option);
      }

      teamPhaseCell.appendChild(phaseSelect);

      if (selectedType === "group_rank") {
        const groupSelect = document.createElement("select");
        groupSelect.className = "placement-group-select";

        const positionSelect = document.createElement("select");
        positionSelect.className = "placement-group-position-select";

        const populatePositions = () => {
          positionSelect.innerHTML = '<option value="">-- Pos --</option>';
          const selectedGroupId = Number(groupSelect.value);
          const selectedPhaseId = Number(phaseSelect.value);
          const groupBlocks = getGroupBlocksForPhase(selectedPhaseId, blocksByPhase);
          const selectedGroup = groupBlocks.find((block) => Number(block.id) === selectedGroupId);
          const slotCount = Math.max(2, Number(selectedGroup?.teams_per_group) || 4);

          for (let position = 1; position <= slotCount; position += 1) {
            const option = document.createElement("option");
            option.value = String(position);
            option.textContent = String(position);
            if (Number(entry.entry_group_position) === position) {
              option.selected = true;
            }
            positionSelect.appendChild(option);
          }
        };

        const populateGroups = () => {
          groupSelect.innerHTML = '<option value="">-- Gruppe --</option>';
          const selectedPhaseId = Number(phaseSelect.value);
          const groupBlocks = getGroupBlocksForPhase(selectedPhaseId, blocksByPhase);

          groupBlocks.forEach((groupBlock, groupIndex) => {
            const option = document.createElement("option");
            option.value = String(groupBlock.id);
            option.textContent = getGroupDisplayName(groupBlock, groupIndex);
            if (Number(entry.entry_source_id) === Number(groupBlock.id)) {
              option.selected = true;
            }
            groupSelect.appendChild(option);
          });

          populatePositions();
        };

        phaseSelect.addEventListener("change", populateGroups);
        groupSelect.addEventListener("change", populatePositions);

        populateGroups();

        groupMatchCell.appendChild(groupSelect);
        positionCell.appendChild(positionSelect);
        return;
      }

      const matchSelect = document.createElement("select");
      matchSelect.className = "placement-match-select";

      const populateMatches = () => {
        matchSelect.innerHTML = '<option value="">-- Match --</option>';
        const selectedPhaseId = Number(phaseSelect.value);
        const matchBlocks = getMatchBlocksForPhase(selectedPhaseId, blocksByPhase);

        for (const matchBlock of matchBlocks) {
          const option = document.createElement("option");
          option.value = String(matchBlock.id);
          option.textContent = matchBlock.block_name || `Match ${matchBlock.id}`;
          if (Number(entry.entry_source_id) === Number(matchBlock.id)) {
            option.selected = true;
          }
          matchSelect.appendChild(option);
        }
      };

      phaseSelect.addEventListener("change", populateMatches);
      populateMatches();

      groupMatchCell.appendChild(matchSelect);
      setEmptyCell(positionCell);
    }

    typeSelect.addEventListener("change", renderVariantControls);
    renderVariantControls();

    row.appendChild(labelCell);
    row.appendChild(sourceCell);
    row.appendChild(teamPhaseCell);
    row.appendChild(groupMatchCell);
    row.appendChild(positionCell);
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  overview.appendChild(table);

  return overview;
}
