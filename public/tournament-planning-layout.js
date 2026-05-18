/**
 * Mounts the tournament planning layout into the given container.
 * Creates a two-area layout: a center grid area (placeholder for future game grid)
 * and a right-side control panel with three multi-select controls for
 * phases, groups/matches per phase, and fields.
 * @param {HTMLElement} mount Container element to mount into.
 * @returns {{ phaseSelect: HTMLSelectElement, groupSelect: HTMLSelectElement, fieldSelect: HTMLSelectElement, generateButton: HTMLButtonElement }}
 */
export function mountTournamentPlanningLayout(mount) {
  mount.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "tp-layout";

  const gridArea = document.createElement("div");
  gridArea.className = "tp-grid-area";

  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-box tp-grid-placeholder";
  placeholder.textContent = "Spielplan wird hier angezeigt";
  gridArea.appendChild(placeholder);

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
