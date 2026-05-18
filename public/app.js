import {
  areTeamsEqual,
  getDefaultTeams,
  areTournamentSettingsEqual,
  getDefaultTournamentSettings,
  normalizeTeams,
  normalizeTournamentSettings,
  getDefaultPhases,
} from "./calculations.js";
import {
  loadPhases,
  loadTeams,
  loadTournamentSettings,
  savePhases,
  saveTeams,
  saveTournamentSettings,
} from "./data-store.js";
import {
  addPhaseColumn,
  addTeamRow,
  mountPhaseConfigLayout,
  mountTeamsLayout,
  mountTournamentSettingsLayout,
  readPhasesFromColumns,
  readTeamsFromRows,
  readTournamentSettingsFromForm,
  renderPhaseColumns,
  renderTeamsRows,
  setSaveButtonState,
  setSaveStatus,
  writeTournamentSettingsToForm,
} from "./layout.js";
import { loadPhaseBlocks, savePhaseBlocks } from "./phase-blocks-store.js";
import {
  createDefaultEinzelspielBlock,
  createDefaultPhaseBlock,
  readPhaseBlocksFromContainer,
  renderPhaseBlocks,
  syncSlotSelectOptionsInBlock,
} from "./phase-blocks-layout.js";
import { loadPlacements, getPlacementSuggestions, savePlacements } from "./placements-store.js";
import {
  readPlacementsFromUI,
  renderPlacementsUI,
} from "./placements-layout.js";
import {
  mountTournamentPlanningLayout,
  readSelectedPhaseIds,
  renderTournamentPlanningFields,
  renderTournamentPlanningGroups,
  renderTournamentPlanningPhases,
} from "./tournament-planning-layout.js";

const appLayout = document.getElementById("appLayout");
const navToggle = document.getElementById("navToggle");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const menuGroups = [...document.querySelectorAll(".menu-group")];
const levelOneButtons = [...document.querySelectorAll(".menu-btn.level-1")];
const menuButtons = [...document.querySelectorAll(".menu-btn.level-2")];
const sections = [...document.querySelectorAll(".content-section")];
const settingsMount = document.getElementById("tournamentSettingsMount");
const teamsMount = document.getElementById("teamsMount");
const phaseConfigMount = document.getElementById("phaseConfigMount");
const placementsMount = document.getElementById("placementsMount");
const tournamentPlanningMount = document.getElementById("tournamentPlanningMount");

const mobileQuery = window.matchMedia("(max-width: 880px)");

const settingsUi = mountTournamentSettingsLayout(settingsMount);
const teamsUi = mountTeamsLayout(teamsMount);
const phasesUi = mountPhaseConfigLayout(phaseConfigMount);
const tournamentPlanningUi = mountTournamentPlanningLayout(tournamentPlanningMount);
let persistedSettings = getDefaultTournamentSettings();
let persistedTeams = getDefaultTeams();
let persistedPhases = getDefaultPhases();
let persistedPlacements = [];
let placementsUI = {};
let placementsAutosaveTimer = null;
let placementsSaveInFlight = false;
let placementsSaveQueued = false;
let phaseBlocksByPhase = new Map();

/**
 * Checks whether the current viewport matches mobile breakpoint rules.
 * @returns {boolean} True when mobile layout is active.
 */
function isMobile() {
  return mobileQuery.matches;
}

/**
 * Updates sidebar backdrop visibility according to current navigation state.
 * @returns {void}
 */
function syncBackdrop() {
  const showBackdrop = isMobile() && appLayout.classList.contains("is-open-mobile");
  sidebarBackdrop.hidden = !showBackdrop;
}

/**
 * Toggles the sidebar state for desktop and mobile layouts.
 * @returns {void}
 */
function toggleNavigation() {
  if (isMobile()) {
    appLayout.classList.toggle("is-open-mobile");
    appLayout.classList.remove("is-collapsed");
  } else {
    appLayout.classList.toggle("is-collapsed");
    appLayout.classList.remove("is-open-mobile");
  }

  const expanded = !appLayout.classList.contains("is-collapsed");
  navToggle.setAttribute("aria-expanded", String(expanded));
  syncBackdrop();
}

/**
 * Toggles visibility of a first-level menu group.
 * @param {HTMLButtonElement} button Group toggle button.
 * @returns {void}
 */
function toggleMenuGroup(button) {
  const group = button.closest(".menu-group");
  if (!group) {
    return;
  }

  const isOpen = group.classList.toggle("is-open");
  button.setAttribute("aria-expanded", String(isOpen));
}

/**
 * Activates one content view and updates active menu styling.
 * @param {string} viewName Target view identifier.
 * @returns {void}
 */
function openView(viewName) {
  menuButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewName);
  });

  sections.forEach((section) => {
    const isVisible = section.dataset.screen === viewName;
    section.hidden = !isVisible;
  });

  if (isMobile()) {
    appLayout.classList.remove("is-open-mobile");
    syncBackdrop();
  }
}

/**
 * Computes and applies dirty-state UI for the setup form.
 * @returns {void}
 */
function updateDirtyState() {
  const draft = normalizeTournamentSettings(readTournamentSettingsFromForm(settingsUi.form));
  const isDirty = !areTournamentSettingsEqual(draft, persistedSettings);

  setSaveButtonState(settingsUi.saveButton, isDirty);
  if (isDirty) {
    setSaveStatus(settingsUi.saveStatus, "Ungespeicherte Aenderungen");
  } else {
    setSaveStatus(settingsUi.saveStatus, "Keine Aenderungen");
  }
}

/**
 * Loads setup data, writes it into the form, and initializes status state.
 * @returns {Promise<void>} Resolves when initialization has completed.
 */
async function initializeTournamentSettings() {
  try {
    const loaded = await loadTournamentSettings();
    persistedSettings = loaded;
    writeTournamentSettingsToForm(settingsUi.form, loaded);
    setSaveStatus(settingsUi.saveStatus, "Einstellungen geladen");
    updateDirtyState();
  } catch (error) {
    persistedSettings = getDefaultTournamentSettings();
    writeTournamentSettingsToForm(settingsUi.form, persistedSettings);
    setSaveStatus(settingsUi.saveStatus, "Standardwerte geladen", true);
    updateDirtyState();
  }
}

/**
 * Computes and applies dirty-state UI for the teams editor.
 * @returns {void}
 */
function updateTeamsDirtyState() {
  const draft = normalizeTeams(readTeamsFromRows(teamsUi.rowsContainer));
  const isDirty = !areTeamsEqual(draft, persistedTeams);

  setSaveButtonState(teamsUi.saveButton, isDirty);
  if (isDirty) {
    setSaveStatus(teamsUi.saveStatus, "Ungespeicherte Aenderungen");
  } else {
    setSaveStatus(teamsUi.saveStatus, "Keine Aenderungen");
  }
}

/**
 * Loads teams data, renders rows, and initializes status state.
 * @returns {Promise<void>} Resolves when initialization has completed.
 */
async function initializeTeams() {
  try {
    const loaded = await loadTeams();
    persistedTeams = loaded;
    renderTeamsRows(teamsUi.rowsContainer, loaded);
    setSaveStatus(teamsUi.saveStatus, "Teams geladen");
    updateTeamsDirtyState();
  } catch (error) {
    persistedTeams = getDefaultTeams();
    renderTeamsRows(teamsUi.rowsContainer, persistedTeams);
    setSaveStatus(teamsUi.saveStatus, "Standardwerte geladen", true);
    updateTeamsDirtyState();
  }
}

/**
 * Shows a brief status message in the phases toolbar that fades after a short delay.
 * @param {string} message Message to display.
 * @param {boolean} [isError=false] Whether to show error styling.
 * @returns {void}
 */
function showPhasesStatus(message, isError = false) {
  setSaveStatus(phasesUi.saveStatus, message, isError);
  setTimeout(() => setSaveStatus(phasesUi.saveStatus, ""), 2500);
}

/**
 * Persists the current visible phase list to the backend and refreshes all dependent UI.
 * @returns {Promise<void>}
 */
async function savePhasesNow() {
  const draft = readPhasesFromColumns(phasesUi.columnsContainer);
  const saved = await savePhases(draft);
  persistedPhases = saved;
  renderPhaseColumns(phasesUi.columnsContainer, saved);
  refreshBlockPhaseSelectOptions();
  await loadAllPhaseBlocks();
  renderAllPhaseBlocks();
}

/**
 * Returns all currently visible phases from the UI in their current order.
 * Unsaved phases are included so dependent dropdowns can reflect add/rename changes immediately.
 * @returns {Array<{id: number|null, name: string}>} Ordered visible phases.
 */
function getVisiblePhasesDraft() {
  const draftPhases = readPhasesFromColumns(phasesUi.columnsContainer);

  if (draftPhases.length === 0) {
    return persistedPhases.map((phase) => ({
      id: Number.isInteger(phase.id) && phase.id > 0 ? phase.id : null,
      name: phase.name || "",
    }));
  }

  return draftPhases.map((phase) => ({
    id: Number.isInteger(phase.id) && phase.id > 0 ? phase.id : null,
    name: phase.name || "",
  }));
}

/**
 * Returns all currently visible saved phases from the UI.
 * @returns {Array<{id: number, name: string}>} Ordered visible phases with database ids.
 */
function getVisibleSavedPhases() {
  return getVisiblePhasesDraft().filter((phase) => Number.isInteger(phase.id) && phase.id > 0);
}

/**
 * Updates the independent baustein toolbar phase select options.
 * Unsaved phases stay visible but disabled until the phase list is saved.
 * @returns {void}
 */
function refreshBlockPhaseSelectOptions() {
  const currentValue = phasesUi.blockPhaseSelect.value;
  const phases = getVisiblePhasesDraft();
  const savedPhases = phases.filter((phase) => Number.isInteger(phase.id) && phase.id > 0);

  phasesUi.blockPhaseSelect.innerHTML = "<option value=\"\">Phase waehlen</option>";
  phases.forEach((phase, index) => {
    const option = document.createElement("option");
    const isSaved = Number.isInteger(phase.id) && phase.id > 0;
    option.value = isSaved ? String(phase.id) : `draft-${index}`;
    option.textContent = phase.name || `Neue Phase ${index + 1}`;
    if (!isSaved) {
      option.textContent += " (zuerst speichern)";
      option.disabled = true;
    }
    phasesUi.blockPhaseSelect.appendChild(option);
  });

  if (savedPhases.some((phase) => String(phase.id) === currentValue)) {
    phasesUi.blockPhaseSelect.value = currentValue;
    return;
  }

  if (savedPhases.length > 0) {
    phasesUi.blockPhaseSelect.value = String(savedPhases[0].id);
    return;
  }

  phasesUi.blockPhaseSelect.value = "";
}

/**
 * Loads all phase blocks for all persisted phases into local state.
 * @returns {Promise<void>} Resolves when all phase blocks are loaded.
 */
async function loadAllPhaseBlocks() {
  const phases = persistedPhases.filter((phase) => Number.isInteger(phase.id) && phase.id > 0);
  const entries = await Promise.all(
    phases.map(async (phase) => [phase.id, await loadPhaseBlocks(phase.id)])
  );
  phaseBlocksByPhase = new Map(entries);
}

/**
 * Renders all phase blocks into their corresponding phase columns.
 * @returns {void}
 */
function renderAllPhaseBlocks() {
  const phases = getVisibleSavedPhases();
  phases.forEach((phase) => {
    const column = phasesUi.columnsContainer.querySelector(`[data-phase-id="${phase.id}"]`);
    if (!column) {
      return;
    }

    const blockContainer = column.querySelector(".phase-blocks");
    if (!blockContainer) {
      return;
    }

    const blocks = phaseBlocksByPhase.get(phase.id) || [];
    renderPhaseBlocks(blockContainer, phase.id, blocks, phases, persistedTeams, phaseBlocksByPhase, persistedPlacements);
  });
}

/**
 * Persists all blocks for one phase using the current rendered state of that phase column.
 * @param {number} phaseId Target phase id.
 * @returns {Promise<void>} Resolves when save and re-render are completed.
 */
async function persistBlocksForPhaseFromDom(phaseId) {
  const column = phasesUi.columnsContainer.querySelector(`[data-phase-id="${phaseId}"]`);
  if (!column) {
    return;
  }
  const blockContainer = column.querySelector(".phase-blocks");
  if (!blockContainer) {
    return;
  }

  const draftBlocks = readPhaseBlocksFromContainer(blockContainer);
  const savedBlocks = await savePhaseBlocks(phaseId, draftBlocks);
  phaseBlocksByPhase.set(phaseId, savedBlocks);
  renderAllPhaseBlocks();
}

/**
 * Loads phases, renders columns, mounts any existing mode editors, and initializes status state.
 * @returns {Promise<void>} Resolves when initialization has completed.
 */
async function initializePhases() {
  try {
    const loaded = await loadPhases();
    persistedPhases = loaded;
    renderPhaseColumns(phasesUi.columnsContainer, loaded);
    refreshBlockPhaseSelectOptions();
    await loadAllPhaseBlocks();
    renderAllPhaseBlocks();
    setSaveStatus(phasesUi.saveStatus, "");
  } catch (error) {
    persistedPhases = getDefaultPhases();
    renderPhaseColumns(phasesUi.columnsContainer, persistedPhases);
    refreshBlockPhaseSelectOptions();
    phaseBlocksByPhase = new Map();
    showPhasesStatus("Laden fehlgeschlagen", true);
  }
}

/**
 * Displays a status message for placements operations.
 * @param {string} message Status message.
 * @param {boolean} isError Whether this is an error message.
 */
function showPlacementsStatus(message, isError = false) {
  if (!placementsUI.statusDisplay) {
    placementsUI.statusDisplay = document.createElement("div");
    placementsUI.statusDisplay.className = "status-display";
    placementsMount.appendChild(placementsUI.statusDisplay);
  }
  placementsUI.statusDisplay.textContent = message;
  placementsUI.statusDisplay.className = `status-display ${isError ? "is-error" : ""}`;
}

/**
 * Persists the current placements table state to the backend.
 * @returns {Promise<void>} Resolves when save is done.
 */
async function persistPlacementsNow() {
  if (placementsSaveInFlight) {
    placementsSaveQueued = true;
    return;
  }

  placementsSaveInFlight = true;
  try {
    const draft = readPlacementsFromUI(placementsUI.container);
    const teamCount = persistedTeams.length;
    const saved = await savePlacements(teamCount, draft);
    persistedPlacements = saved;
    showPlacementsStatus("Platzierungen gespeichert");
  } catch (error) {
    showPlacementsStatus("Fehler beim Speichern von Platzierungen", true);
  } finally {
    placementsSaveInFlight = false;
    if (placementsSaveQueued) {
      placementsSaveQueued = false;
      await persistPlacementsNow();
    }
  }
}

/**
 * Schedules a debounced placements auto-save after user edits.
 * @returns {void}
 */
function schedulePlacementsAutosave() {
  if (placementsAutosaveTimer) {
    clearTimeout(placementsAutosaveTimer);
  }
  showPlacementsStatus("Speichern...");
  placementsAutosaveTimer = setTimeout(() => {
    persistPlacementsNow();
  }, 350);
}

/**
 * Wires auto-save handlers for the current placements table body.
 * @returns {void}
 */
function wirePlacementsAutosaveHandlers() {
  if (!placementsUI.container) {
    return;
  }

  placementsUI.container.addEventListener("change", schedulePlacementsAutosave);
  placementsUI.container.addEventListener("input", (event) => {
    if (event.target.matches(".placement-label-input")) {
      schedulePlacementsAutosave();
    }
  });
}

/**
 * Initializes and displays the placements view.
 * @returns {Promise<void>} Resolves when initialization is complete.
 */
async function initializePlacements() {
  try {
    const loaded = await loadPlacements();
    const teamCount = persistedTeams.length;
    const placementsForCurrentTeamCount = loaded
      .filter((placement) => Number(placement.team_count) === teamCount)
      .sort((a, b) => Number(a.position_index) - Number(b.position_index));
    const needsAutoGeneration = placementsForCurrentTeamCount.length !== teamCount;

    if (needsAutoGeneration) {
      const { suggestions } = await getPlacementSuggestions();
      persistedPlacements = suggestions;
    } else {
      persistedPlacements = placementsForCurrentTeamCount;
    }

    placementsUI = renderPlacementsUI(
      placementsMount,
      persistedPlacements,
      teamCount,
      persistedTeams,
      persistedPhases,
      phaseBlocksByPhase
    );

    wirePlacementsAutosaveHandlers();

    if (needsAutoGeneration && teamCount > 0) {
      showPlacementsStatus("Platzierungen automatisch generiert");
      await persistPlacementsNow();
    }

    showPlacementsStatus("");
  } catch (error) {
    persistedPlacements = [];
    renderPlacementsUI(
      placementsMount,
      [],
      persistedTeams.length,
      persistedTeams,
      persistedPhases,
      phaseBlocksByPhase
    );
    showPlacementsStatus("Platzierungen konnten nicht geladen werden", true);
  }
}

/**
 * Refreshes the group/match multi-select based on the current phase selection.
 * @returns {void}
 */
function refreshTournamentPlanningGroups() {
  const selectedPhaseIds = readSelectedPhaseIds(tournamentPlanningUi.phaseSelect);
  renderTournamentPlanningGroups(
    tournamentPlanningUi.groupSelect,
    selectedPhaseIds,
    phaseBlocksByPhase,
    persistedPhases
  );
}

/**
 * Populates all three control selects of the tournament planning view
 * using the current persisted phases, blocks, and setup fields count.
 * @returns {void}
 */
function initializeTournamentPlanning() {
  renderTournamentPlanningPhases(tournamentPlanningUi.phaseSelect, persistedPhases);
  renderTournamentPlanningGroups(
    tournamentPlanningUi.groupSelect,
    [],
    phaseBlocksByPhase,
    persistedPhases
  );
  renderTournamentPlanningFields(tournamentPlanningUi.fieldSelect, persistedSettings.fields);
}

tournamentPlanningUi.phaseSelect.addEventListener("change", () => {
  refreshTournamentPlanningGroups();
});

navToggle.addEventListener("click", toggleNavigation);
sidebarBackdrop.addEventListener("click", () => {
  appLayout.classList.remove("is-open-mobile");
  syncBackdrop();
});

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    openView(button.dataset.view);
  });
});

settingsUi.form.addEventListener("input", () => {
  updateDirtyState();
});

settingsUi.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setSaveButtonState(settingsUi.saveButton, false);
  setSaveStatus(settingsUi.saveStatus, "Speichern...");

  try {
    const draft = normalizeTournamentSettings(readTournamentSettingsFromForm(settingsUi.form));
    const saved = await saveTournamentSettings(draft);
    persistedSettings = saved;
    writeTournamentSettingsToForm(settingsUi.form, saved);
    setSaveStatus(settingsUi.saveStatus, "Gespeichert");
    updateDirtyState();
  } catch (error) {
    setSaveStatus(settingsUi.saveStatus, "Speichern fehlgeschlagen", true);
    updateDirtyState();
  }
});

teamsUi.addButton.addEventListener("click", () => {
  const newRow = addTeamRow(teamsUi.rowsContainer);
  const newInput = newRow.querySelector(".team-name-input");
  if (newInput) {
    newInput.focus();
  }
  updateTeamsDirtyState();
});

teamsUi.rowsContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".team-remove-btn");
  if (!button) {
    return;
  }

  const row = button.closest(".team-row");
  if (!row) {
    return;
  }

  row.remove();
  if (teamsUi.rowsContainer.children.length === 0) {
    addTeamRow(teamsUi.rowsContainer);
  }
  updateTeamsDirtyState();
});

teamsUi.rowsContainer.addEventListener("input", () => {
  updateTeamsDirtyState();
});

teamsUi.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setSaveButtonState(teamsUi.saveButton, false);
  setSaveStatus(teamsUi.saveStatus, "Speichern...");

  try {
    const draft = normalizeTeams(readTeamsFromRows(teamsUi.rowsContainer));
    const saved = await saveTeams(draft);
    persistedTeams = saved;
    renderTeamsRows(teamsUi.rowsContainer, saved);
    renderAllPhaseBlocks();
    setSaveStatus(teamsUi.saveStatus, "Gespeichert");
    updateTeamsDirtyState();
  } catch (error) {
    setSaveStatus(teamsUi.saveStatus, "Speichern fehlgeschlagen", true);
    updateTeamsDirtyState();
  }
});

phasesUi.addButton.addEventListener("click", async () => {
  const newColumn = addPhaseColumn(phasesUi.columnsContainer);
  const popup = newColumn.querySelector(".phase-name-popup");
  const input = newColumn.querySelector(".phase-name-popup-input");
  refreshBlockPhaseSelectOptions();
  renderAllPhaseBlocks();

  if (popup) {
    popup.classList.add("is-open");
  }
  if (input) {
    input.focus();
    input.select();
  }
});

phasesUi.columnsContainer.addEventListener("click", async (event) => {
  const actionButton = event.target.closest(".phase-icon-btn, .phase-name-popup-btn");
  if (!actionButton) {
    return;
  }

  const column = actionButton.closest(".phase-column");
  if (!column) {
    return;
  }

  const popup = column.querySelector(".phase-name-popup");
  const input = column.querySelector(".phase-name-popup-input");
  const title = column.querySelector(".phase-name-title");
  const action = actionButton.dataset.action;

  if (action === "rename") {
    if (popup) {
      popup.classList.add("is-open");
    }
    if (input) {
      input.focus();
      input.select();
    }
    return;
  }

  if (action === "cancel-rename") {
    if (popup) {
      popup.classList.remove("is-open");
    }
    const phaseId = Number(column.dataset.phaseId);
    const currentName = (input?.value || "").trim();
    if (!phaseId && !currentName) {
      column.remove();
      refreshBlockPhaseSelectOptions();
      renderAllPhaseBlocks();
    }
    return;
  }

  if (action === "save-rename") {
    const name = (input?.value || "").trim();
    if (!name) {
      if (input) {
        input.focus();
      }
      showPhasesStatus("Bitte einen Phasennamen eingeben", true);
      return;
    }

    if (title) {
      title.textContent = name;
    }
    if (input) {
      input.value = name;
    }
    if (popup) {
      popup.classList.remove("is-open");
    }

    try {
      await savePhasesNow();
      showPhasesStatus("Phase gespeichert");
    } catch {
      showPhasesStatus("Speichern fehlgeschlagen", true);
    }
    return;
  }

  if (action === "delete") {
    const phaseName = title?.textContent?.trim() || input?.value?.trim() || "diese Phase";
    const confirmed = window.confirm(`"${phaseName}" wirklich loeschen?`);
    if (!confirmed) {
      return;
    }

    const phaseId = Number(column.dataset.phaseId);
    column.remove();

    if (phaseId) {
      phaseBlocksByPhase.delete(phaseId);
    }

    refreshBlockPhaseSelectOptions();
    renderAllPhaseBlocks();

    try {
      await savePhasesNow();
      showPhasesStatus("Phase geloescht");
    } catch {
      showPhasesStatus("Loeschen fehlgeschlagen", true);
    }
  }
});

/**
 * Handles save/reload cycle when a block element changed in one phase column.
 * @param {Event} event Browser event from the phase columns container.
 * @returns {Promise<void>} Resolves after persistence attempt.
 */
async function handlePhaseBlockMutation(event) {
  const block = event.target.closest(".phase-block");
  if (!block) {
    return;
  }

  const isPopupConfigControl = event.target.closest(
    ".phase-block-name-input, .phase-block-source-type, .phase-block-source-phase, .phase-block-teams-per-group"
  );
  if (isPopupConfigControl) {
    return;
  }

  const slotSelect = event.target.closest(".phase-block-slot-select");
  if (slotSelect) {
    syncSlotSelectOptionsInBlock(block);
  }

  const column = block.closest(".phase-column");
  if (!column) {
    return;
  }

  const phaseId = Number(column.dataset.phaseId);
  if (!phaseId) {
    return;
  }

  try {
    await persistBlocksForPhaseFromDom(phaseId);
  } catch (error) {
    showPhasesStatus("Baustein speichern fehlgeschlagen", true);
  }
}

phasesUi.columnsContainer.addEventListener("change", handlePhaseBlockMutation);

phasesUi.columnsContainer.addEventListener("phase-block-config-save", async (event) => {
  const block = event.target.closest(".phase-block");
  if (!block) {
    return;
  }

  const column = block.closest(".phase-column");
  if (!column) {
    return;
  }

  const phaseId = Number(column.dataset.phaseId);
  if (!phaseId) {
    return;
  }

  try {
    await persistBlocksForPhaseFromDom(phaseId);
    showPhasesStatus("Baustein gespeichert");
  } catch (error) {
    showPhasesStatus("Baustein speichern fehlgeschlagen", true);
  }
});

phasesUi.columnsContainer.addEventListener("click", async (event) => {
  const removeBlockButton = event.target.closest(".phase-block-delete");
  if (!removeBlockButton) {
    return;
  }

  const block = removeBlockButton.closest(".phase-block");
  if (!block) {
    return;
  }
  const blockName = block.querySelector(".phase-block-title")?.textContent || "diesen Baustein";
  const confirmed = window.confirm(`${blockName} wirklich loeschen?`);
  if (!confirmed) {
    return;
  }

  const column = removeBlockButton.closest(".phase-column");
  if (!column) {
    return;
  }

  const phaseId = Number(column.dataset.phaseId);
  if (!phaseId) {
    return;
  }

  block.remove();

  try {
    await persistBlocksForPhaseFromDom(phaseId);
    showPhasesStatus("Baustein entfernt");
  } catch (error) {
    showPhasesStatus("Baustein entfernen fehlgeschlagen", true);
  }
});

phasesUi.addBlockButton.addEventListener("click", async () => {
  const phaseId = Number(phasesUi.blockPhaseSelect.value);
  if (!phaseId) {
    setSaveStatus(phasesUi.saveStatus, "Bitte zuerst eine gespeicherte Phase waehlen", true);
    return;
  }

  const blockType = phasesUi.blockTypeSelect.value;
  const defaultBlock =
    blockType === "einzelspiel" ? createDefaultEinzelspielBlock() : createDefaultPhaseBlock();

  const currentBlocks = phaseBlocksByPhase.get(phaseId) || [];
  const draftBlocks = [...currentBlocks, defaultBlock].map((block, index) => ({
    ...block,
    position: index,
  }));

  try {
    const savedBlocks = await savePhaseBlocks(phaseId, draftBlocks);
    phaseBlocksByPhase.set(phaseId, savedBlocks);
    renderAllPhaseBlocks();
    showPhasesStatus("Baustein hinzugefuegt");
  } catch (error) {
    showPhasesStatus("Baustein konnte nicht hinzugefuegt werden", true);
  }
});

levelOneButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleMenuGroup(button);
  });
});

mobileQuery.addEventListener("change", () => {
  appLayout.classList.remove("is-open-mobile");
  syncBackdrop();
});

openView("turniersetup");
initializeTournamentSettings();
// Teams must finish before phases so persistedTeams is available for gruppe editors.
// Placements must finish after both teams and phases.
// Tournament planning runs last as it depends on all persisted state.
initializeTeams().then(() => initializePhases()).then(() => initializePlacements()).then(() => initializeTournamentPlanning());

menuGroups.forEach((group) => {
  const button = group.querySelector(".menu-btn.level-1");
  if (!button) {
    return;
  }

  const isOpen = group.classList.contains("is-open");
  button.setAttribute("aria-expanded", String(isOpen));
});
