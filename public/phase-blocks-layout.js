/**
 * Shows or hides the source-phase select depending on the currently selected source type.
 * @param {HTMLSelectElement} sourceTypeSelect Source type select element.
 * @param {HTMLSelectElement} sourcePhaseSelect Source phase select element.
 * @returns {void}
 */
function applySourcePhaseSelectVisibility(sourceTypeSelect, sourcePhaseSelect) {
  const isPhase = sourceTypeSelect.value === "phase";

  // Keep an explicit empty option so the select can always render a stable hint state.
  if (!sourcePhaseSelect.querySelector('option[value=""]')) {
    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Phase waehlen";
    placeholderOption.hidden = true;
    sourcePhaseSelect.insertBefore(placeholderOption, sourcePhaseSelect.firstChild);
  }

  if (!isPhase) {
    sourcePhaseSelect.value = "";
  }

  sourcePhaseSelect.style.display = isPhase ? "" : "none";
  sourcePhaseSelect.disabled = !isPhase;

  if (isPhase && !sourcePhaseSelect.value) {
    sourcePhaseSelect.value = "";
  }
}

/**
 * Applies placeholder styling when no source phase is selected.
 * @param {HTMLSelectElement} sourcePhaseSelect Source phase select element.
 * @returns {void}
 */
function applySourcePhasePlaceholderStyle(sourcePhaseSelect) {
  sourcePhaseSelect.classList.toggle("is-placeholder", sourcePhaseSelect.value === "");
}

/**
 * Opens or closes one block configuration popup.
 * @param {HTMLElement} popup Popup element inside the block card.
 * @param {boolean} isOpen Whether popup should be visible.
 * @returns {void}
 */
function toggleBlockConfigPopup(popup, isOpen) {
  popup.classList.toggle("is-open", isOpen);
}

/**
 * Normalizes one editable block name with fallback.
 * @param {*} value Raw block name value.
 * @param {number} position Zero-based block position.
 * @returns {string} Non-empty block name.
 */
function normalizeBlockName(value, position) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : `Gruppe ${position + 1}`;
}

/**
 * Builds source key for uniqueness checks among slot assignments.
 * @param {{source_type?: string, source_phase_id?: number|null}} block Block object.
 * @returns {string} Source grouping key.
 */
function getSourceKey(block) {
  if (block.source_type === "phase") {
    const sourcePhaseId = Number(block.source_phase_id);
    return Number.isInteger(sourcePhaseId) && sourcePhaseId > 0
      ? `phase:${sourcePhaseId}`
      : "phase:none";
  }
  return "teams";
}

/**
 * Builds selectable entry options for one block source.
 * @param {{source_type: string, source_phase_id: number|null}} block Current block.
 * @param {Array<{name: string}>} teams Team list.
 * @param {Map<number, Array<object>>} blocksByPhase Phase-id indexed blocks.
 * @returns {Array<{value: string, label: string}>} Option list for slot selections.
 */
function buildSourceOptions(block, teams, blocksByPhase) {
  if (block.source_type === "phase" && Number.isInteger(Number(block.source_phase_id))) {
    const sourcePhaseId = Number(block.source_phase_id);
    const sourceBlocks = blocksByPhase.get(sourcePhaseId) || [];
    const options = [];

    sourceBlocks.forEach((sourceBlock, blockIndex) => {
      const slots = Math.max(2, Number(sourceBlock.teams_per_group) || 4);
      const sourceBlockName = normalizeBlockName(sourceBlock.block_name, blockIndex);
      for (let rank = 1; rank <= slots; rank += 1) {
        options.push({
          value: `placement:${sourceBlock.id}:${rank}`,
          label: `${sourceBlockName} Platz ${rank}`,
        });
      }
    });

    return options;
  }

  return teams.map((team) => ({
    value: `team:${team.name}`,
    label: team.name,
  }));
}

/**
 * Rebuilds slot select options inside one block so duplicate assignments are prevented in sibling rows.
 * @param {HTMLElement} blockCard Phase block card element.
 * @returns {void}
 */
export function syncSlotSelectOptionsInBlock(blockCard) {
  const selects = [...blockCard.querySelectorAll(".phase-block-slot-select")];
  if (selects.length === 0) {
    return;
  }

  const allOptions = JSON.parse(blockCard.dataset.sourceOptions || "[]");
  const selectedValues = selects.map((select) => select.value).filter((value) => value);

  selects.forEach((select) => {
    const ownValue = select.value;
    const usedInOtherRows = new Set(selectedValues.filter((value) => value !== ownValue));

    select.innerHTML = "";

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "-";
    select.appendChild(emptyOption);

    allOptions.forEach((entry) => {
      if (!usedInOtherRows.has(entry.value) || entry.value === ownValue) {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        select.appendChild(option);
      }
    });

    select.value = ownValue;
  });
}

/**
 * Renders all bausteine for one phase column.
 * @param {HTMLElement} container Target phase-block container.
 * @param {number} phaseId Current phase id.
 * @param {Array<object>} blocks Blocks assigned to this phase.
 * @param {Array<{id: number, name: string}>} phases Ordered phase list.
 * @param {Array<{name: string}>} teams Team list.
 * @param {Map<number, Array<object>>} blocksByPhase Full blocks map by phase id.
 * @returns {void}
 */
export function renderPhaseBlocks(
  container,
  phaseId,
  blocks,
  phases,
  teams,
  blocksByPhase
) {
  container.innerHTML = "";

  if (!Array.isArray(blocks) || blocks.length === 0) {
    const hint = document.createElement("div");
    hint.className = "phase-blocks-empty";
    hint.textContent = "Noch keine Bausteine";
    container.appendChild(hint);
    return;
  }

  const phaseIndex = phases.findIndex((phase) => phase.id === phaseId);
  const previousPhases = phaseIndex > 0 ? phases.slice(0, phaseIndex) : [];

  blocks.forEach((block, blockIndex) => {
    const card = document.createElement("article");
    card.className = "phase-block";
    card.dataset.blockId = block.id ? String(block.id) : "";

    const header = document.createElement("div");
    header.className = "phase-block-head";

    const title = document.createElement("strong");
    title.className = "phase-block-title";
    title.textContent = normalizeBlockName(block.block_name, blockIndex);

    const actions = document.createElement("div");
    actions.className = "phase-block-icon-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "phase-block-icon-btn";
    editBtn.dataset.action = "edit-block";
    editBtn.title = "Baustein bearbeiten";
    editBtn.setAttribute("aria-label", "Baustein bearbeiten");
    editBtn.textContent = "✎";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "phase-block-icon-btn is-danger phase-block-delete";
    removeBtn.dataset.action = "delete-block";
    removeBtn.title = "Baustein loeschen";
    removeBtn.setAttribute("aria-label", "Baustein loeschen");
    removeBtn.textContent = "🗑";

    actions.appendChild(editBtn);
    actions.appendChild(removeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const popup = document.createElement("div");
    popup.className = "phase-block-config-popup";

    const popupInner = document.createElement("div");
    popupInner.className = "phase-block-config";

    const popupHeading = document.createElement("strong");
    popupHeading.className = "phase-block-config-title";
    popupHeading.textContent = "Baustein konfigurieren";

    const blockNameInput = document.createElement("input");
    blockNameInput.type = "text";
    blockNameInput.className = "phase-block-name-input";
    blockNameInput.autocomplete = "off";
    blockNameInput.placeholder = "Gruppenname";
    blockNameInput.value = normalizeBlockName(block.block_name, blockIndex);

    const sourceTypeSelect = document.createElement("select");
    sourceTypeSelect.className = "phase-block-source-type";
    sourceTypeSelect.innerHTML = `
      <option value="teams">Quelle: Teams</option>
      <option value="phase">Quelle: Platzierungen aus Phase</option>
    `;
    sourceTypeSelect.value = block.source_type === "phase" ? "phase" : "teams";

    const sourcePhaseSelect = document.createElement("select");
    sourcePhaseSelect.className = "phase-block-source-phase";
    sourcePhaseSelect.disabled = sourceTypeSelect.value !== "phase";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Phase waehlen";
    placeholderOption.hidden = true;
    sourcePhaseSelect.appendChild(placeholderOption);

    previousPhases.forEach((phase) => {
      const option = document.createElement("option");
      option.value = String(phase.id);
      option.textContent = phase.name;
      sourcePhaseSelect.appendChild(option);
    });

    sourcePhaseSelect.value =
      sourceTypeSelect.value === "phase" && Number.isInteger(Number(block.source_phase_id))
        ? String(block.source_phase_id)
        : "";

    applySourcePhasePlaceholderStyle(sourcePhaseSelect);

    applySourcePhaseSelectVisibility(sourceTypeSelect, sourcePhaseSelect);

    sourceTypeSelect.addEventListener("change", () => {
      applySourcePhaseSelectVisibility(sourceTypeSelect, sourcePhaseSelect);
      applySourcePhasePlaceholderStyle(sourcePhaseSelect);
    });

    sourcePhaseSelect.addEventListener("change", () => {
      applySourcePhasePlaceholderStyle(sourcePhaseSelect);
    });

    blockNameInput.addEventListener("input", () => {
      title.textContent = normalizeBlockName(blockNameInput.value, blockIndex);
    });

    const teamsPerGroupInput = document.createElement("input");
    teamsPerGroupInput.type = "number";
    teamsPerGroupInput.min = "2";
    teamsPerGroupInput.max = "32";
    teamsPerGroupInput.step = "1";
    teamsPerGroupInput.className = "phase-block-teams-per-group";
    teamsPerGroupInput.value = String(Math.max(2, Number(block.teams_per_group) || 4));

    const teamsPerGroupLabel = document.createElement("label");
    teamsPerGroupLabel.className = "phase-block-teams-label";
    teamsPerGroupLabel.textContent = "Anzahl Teams";
    teamsPerGroupLabel.appendChild(teamsPerGroupInput);

    const popupActions = document.createElement("div");
    popupActions.className = "phase-block-popup-actions";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "phase-block-popup-btn";
    closeBtn.textContent = "Abbrechen";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "phase-block-popup-btn is-primary";
    saveBtn.textContent = "Speichern";

    popupActions.appendChild(closeBtn);
    popupActions.appendChild(saveBtn);

    popupInner.appendChild(popupHeading);
    popupInner.appendChild(blockNameInput);
    popupInner.appendChild(sourceTypeSelect);
    popupInner.appendChild(sourcePhaseSelect);
    popupInner.appendChild(teamsPerGroupLabel);
    popupInner.appendChild(popupActions);
    popup.appendChild(popupInner);

    const slotsWrap = document.createElement("div");
    slotsWrap.className = "phase-block-slots";

    const currentBlock = {
      ...block,
      source_type: sourceTypeSelect.value,
      source_phase_id:
        sourceTypeSelect.value === "phase" && sourcePhaseSelect.value
          ? Number(sourcePhaseSelect.value)
          : null,
      teams_per_group: Math.max(2, Number(teamsPerGroupInput.value) || 4),
    };

    const sourcePool = buildSourceOptions(currentBlock, teams, blocksByPhase);
    const sourceKey = getSourceKey(currentBlock);

    const usedByOthers = new Set(
      blocks
        .filter((other) => other !== block && getSourceKey(other) === sourceKey)
        .flatMap((other) => (Array.isArray(other.slots) ? other.slots : []))
        .map((slot) => slot?.entry_value)
        .filter((value) => typeof value === "string" && value.length > 0)
    );

    const localSourcePool = sourcePool.filter((entry) => !usedByOthers.has(entry.value));
    card.dataset.sourceOptions = JSON.stringify(localSourcePool);

    for (let slotIndex = 0; slotIndex < currentBlock.teams_per_group; slotIndex += 1) {
      const row = document.createElement("div");
      row.className = "phase-block-slot";

      const select = document.createElement("select");
      select.className = "phase-block-slot-select";
      select.dataset.slotIndex = String(slotIndex);

      const currentSlot = (block.slots || []).find((slot) => Number(slot?.slot_index) === slotIndex);
      const currentValue = typeof currentSlot?.entry_value === "string" ? currentSlot.entry_value : "";

      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = "-";
      select.appendChild(emptyOption);

      localSourcePool.forEach((entry) => {
        if (entry.value === currentValue || !usedByOthers.has(entry.value)) {
          const option = document.createElement("option");
          option.value = entry.value;
          option.textContent = entry.label;
          select.appendChild(option);
        }
      });

      select.value = currentValue;
      row.appendChild(select);
      slotsWrap.appendChild(row);
    }

    card.appendChild(header);
    card.appendChild(popup);
    card.appendChild(slotsWrap);
    container.appendChild(card);

    editBtn.addEventListener("click", () => {
      toggleBlockConfigPopup(popup, true);
    });

    closeBtn.addEventListener("click", () => {
      toggleBlockConfigPopup(popup, false);
    });

    saveBtn.addEventListener("click", () => {
      toggleBlockConfigPopup(popup, false);
      // Persist only on explicit popup save to avoid close/re-render while editing.
      card.dispatchEvent(new CustomEvent("phase-block-config-save", { bubbles: true }));
    });

    syncSlotSelectOptionsInBlock(card);
  });
}

/**
 * Reads all blocks from one rendered phase block container.
 * @param {HTMLElement} container Phase block container.
 * @returns {Array<object>} Ordered block payload for persistence.
 */
export function readPhaseBlocksFromContainer(container) {
  const cards = [...container.querySelectorAll(".phase-block")];

  return cards.map((card, position) => {
    const blockName = normalizeBlockName(
      card.querySelector(".phase-block-name-input")?.value,
      position
    );
    const sourceType = card.querySelector(".phase-block-source-type")?.value === "phase" ? "phase" : "teams";
    const sourcePhaseValue = card.querySelector(".phase-block-source-phase")?.value || "";
    const sourcePhaseId = sourceType === "phase" && sourcePhaseValue ? Number(sourcePhaseValue) : null;
    const teamsPerGroup = Math.max(
      2,
      Number(card.querySelector(".phase-block-teams-per-group")?.value) || 4
    );

    const slots = Array.from({ length: teamsPerGroup }, (_, slotIndex) => {
      const select = card.querySelector(`.phase-block-slot-select[data-slot-index="${slotIndex}"]`);
      return {
        slot_index: slotIndex,
        entry_value: select?.value ? select.value : null,
      };
    });

    return {
      id: card.dataset.blockId ? Number(card.dataset.blockId) : null,
      block_name: blockName,
      block_type: "gruppe",
      source_type: sourceType,
      source_phase_id: sourcePhaseId,
      teams_per_group: teamsPerGroup,
      position,
      slots,
    };
  });
}

/**
 * Creates a new default block payload.
 * @returns {object} New unsaved block object.
 */
export function createDefaultPhaseBlock() {
  return {
    id: null,
    block_name: "",
    block_type: "gruppe",
    source_type: "teams",
    source_phase_id: null,
    teams_per_group: 4,
    position: 0,
    slots: [],
  };
}
