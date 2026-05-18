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
import {
  loadTeamsWithIds,
  loadMatches,
  saveMatchesForPhase,
  deleteMatchesForPhase,
} from "./tournament-planning-store.js";
import { buildScheduledMatches } from "./tournament-planning-calculations.js";
import { renderMatchGrid } from "./tournament-planning-layout.js";

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
let teamsWithIds = [];
let persistedMatches = [];
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
 * Re-renders the match grid with current persisted planning data.
 * @returns {void}
 */
function renderAllMatchGrid() {
  renderMatchGrid(
    tournamentPlanningUi.gridArea,
    persistedMatches,
    persistedPhases,
    teamsWithIds
  );
}

/**
 * Populates planning controls and loads persisted match rows for the grid.
 * @returns {Promise<void>} Resolves when initialization is complete.
 */
async function initializeTournamentPlanning() {
  renderTournamentPlanningPhases(tournamentPlanningUi.phaseSelect, persistedPhases);
  renderTournamentPlanningGroups(
    tournamentPlanningUi.groupSelect,
    [],
    phaseBlocksByPhase,
    persistedPhases
  );
  renderTournamentPlanningFields(tournamentPlanningUi.fieldSelect, persistedSettings.fields);

  try {
    teamsWithIds = await loadTeamsWithIds();
    persistedMatches = await loadMatches();
  } catch {
    persistedMatches = [];
  }

  renderAllMatchGrid();
}

/**
 * Returns selected group refs from the group multi-select.
 * @returns {Array<{phaseId: number, blockId: number}>} Selected phase/block refs.
 */
function getSelectedBlockRefs() {
  const selectedGroupRefs = [...tournamentPlanningUi.groupSelect.selectedOptions]
    .map((o) => {
      const dashIdx = o.value.indexOf("-");
      return {
        phaseId: Number(o.value.slice(0, dashIdx)),
        blockId: Number(o.value.slice(dashIdx + 1)),
      };
    })
    .filter((ref) => ref.phaseId > 0 && ref.blockId > 0);
  const selectedPhaseIds = new Set(readSelectedPhaseIds(tournamentPlanningUi.phaseSelect));
  const phasesWithSelectedGroups = new Set(selectedGroupRefs.map((ref) => ref.phaseId));

  let result = [...selectedGroupRefs];

  selectedPhaseIds.forEach((phaseId) => {
    if (!phasesWithSelectedGroups.has(phaseId)) {
      const blocks = phaseBlocksByPhase.get(phaseId) || [];
      blocks.forEach((block) => {
        const blockId = Number(block.id);
        if (Number.isInteger(blockId) && blockId > 0) {
          result.push({ phaseId, blockId });
        }
      });
    }
  });

  return result;
}

/**
 * Returns selected field numbers from the field multi-select.
 * Falls back to all available fields when none are selected.
 * @returns {Array<number>} Selected field numbers.
 */
function getSelectedFieldNumbers() {
  const selected = [...tournamentPlanningUi.fieldSelect.selectedOptions].map((o) => Number(o.value));
  if (selected.length > 0) {
    return selected;
  }
  return [...tournamentPlanningUi.fieldSelect.options]
    .map((o) => Number(o.value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/**
 * Expands selected block refs with required source-phase blocks when both phases are selected.
 * If a selected block depends on another selected phase, all blocks of that source phase are
 * added to the planning set so the source phase is generated first.
 * @param {Array<{phaseId: number, blockId: number}>} blockRefs Initially selected block refs.
 * @returns {Array<{phaseId: number, blockId: number}>} Expanded unique block refs.
 */
function expandBlockRefsWithSelectedSources(blockRefs) {
  const selectedPhaseIds = new Set(readSelectedPhaseIds(tournamentPlanningUi.phaseSelect));
  const keyOf = (ref) => `${ref.phaseId}-${ref.blockId}`;
  const included = new Set(blockRefs.map((ref) => keyOf(ref)));
  const result = [...blockRefs];

  const queue = [...blockRefs];
  while (queue.length > 0) {
    const current = queue.shift();
    const phaseBlocks = phaseBlocksByPhase.get(current.phaseId) || [];
    const block = phaseBlocks.find((entry) => Number(entry.id) === Number(current.blockId));
    if (!block) {
      continue;
    }

    const dependsOnPhase = block.source_type === "phase" || block.source_type === "match";
    const sourcePhaseId = Number(block.source_phase_id);
    if (!dependsOnPhase || !Number.isInteger(sourcePhaseId) || sourcePhaseId <= 0) {
      continue;
    }

    if (!selectedPhaseIds.has(sourcePhaseId)) {
      continue;
    }

    const sourceBlocks = phaseBlocksByPhase.get(sourcePhaseId) || [];
    sourceBlocks.forEach((sourceBlock) => {
      const sourceBlockId = Number(sourceBlock.id);
      if (!Number.isInteger(sourceBlockId) || sourceBlockId <= 0) {
        return;
      }

      const ref = { phaseId: sourcePhaseId, blockId: sourceBlockId };
      const key = keyOf(ref);
      if (included.has(key)) {
        return;
      }

      included.add(key);
      result.push(ref);
      queue.push(ref);
    });
  }

  return result;
}

/**
 * Validates that selected planning blocks contain configured slot entries.
 * Aborts planning early when one or more selected blocks are empty/incomplete.
 * @param {Array<{phaseId: number, blockId: number}>} blockRefs Selected block refs to validate.
 * @returns {{isValid: boolean, message: string}} Validation state and user-facing message.
 */
function validatePlanningBlockSlots(blockRefs) {
  const phaseNameById = new Map(persistedPhases.map((phase) => [Number(phase.id), phase.name]));
  const issues = [];

  blockRefs.forEach((ref) => {
    const phaseId = Number(ref.phaseId);
    const blockId = Number(ref.blockId);
    const phaseBlocks = phaseBlocksByPhase.get(phaseId) || [];
    const block = phaseBlocks.find((entry) => Number(entry.id) === blockId);
    if (!block) {
      return;
    }

    const slots = Array.isArray(block.slots) ? block.slots : [];
    const filledSlots = slots.filter(
      (slot) => slot && typeof slot.entry_value === "string" && slot.entry_value.trim() !== ""
    ).length;

    const minSlots = 2;
    if (filledSlots === 0) {
      const phaseName = phaseNameById.get(phaseId) || `Phase ${phaseId}`;
      const blockName = block.block_name || `Block ${blockId}`;
      issues.push(`${phaseName} / ${blockName}: keine Slot-Eintraege konfiguriert.`);
      return;
    }

    if (filledSlots < minSlots) {
      const phaseName = phaseNameById.get(phaseId) || `Phase ${phaseId}`;
      const blockName = block.block_name || `Block ${blockId}`;
      issues.push(`${phaseName} / ${blockName}: zu wenige Slot-Eintraege (${filledSlots}/${minSlots}).`);
    }
  });

  if (issues.length > 0) {
    return {
      isValid: false,
      message:
        "Planung abgebrochen: Ausgewaehlte Gruppen/Matches sind im Phasensetup nicht vollstaendig konfiguriert.\n- " +
        issues.join("\n- "),
    };
  }

  return {
    isValid: true,
    message: "",
  };
}

/**
 * Adds minutes to a HH:mm time string.
 * @param {string} baseTime Start time in HH:mm format.
 * @param {number} minutes Minutes to add.
 * @returns {string} Resulting time in HH:mm.
 */
function addMinutesToTime(baseTime, minutes) {
  const [h, m] = String(baseTime || "00:00").split(":").map((v) => Number(v || 0));
  const total = (h * 60 + m + minutes) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Returns configured duration of one match slot in minutes.
 * @returns {number} Slot duration in minutes.
 */
function getMatchSlotDurationMinutes() {
  const setsPerMatch = Math.max(1, Number(persistedSettings.sets_per_match) || 1);
  const minutesPerSet = Math.max(1, Number(persistedSettings.minutes_per_set) || 10);
  const minutesBetweenSets = Math.max(0, Number(persistedSettings.minutes_between_sets) || 0);
  const pauseBetweenMatches = Math.max(0, Number(persistedSettings.pause_between_matches) || 0);
  return (
    setsPerMatch * minutesPerSet +
    Math.max(0, setsPerMatch - 1) * minutesBetweenSets +
    pauseBetweenMatches
  );
}

/**
 * Validates dependencies and returns a dependency-safe phase order.
 * If a selected phase depends on another selected phase, the source phase
 * is planned first automatically.
 * @param {Array<{phaseId: number, blockId: number}>} blockRefs Blocks to plan now.
 * @returns {{isValid: boolean, message: string, orderedBlockRefs: Array<{phaseId: number, blockId: number}>}} Validation and ordered refs.
 */
function resolvePlanningOrder(blockRefs) {
  const phaseNameById = new Map(persistedPhases.map((phase) => [Number(phase.id), phase.name]));
  const phaseIndexById = new Map(persistedPhases.map((phase, index) => [Number(phase.id), index]));
  const plannedPhaseIds = new Set(
    persistedMatches
      .map((match) => Number(match.phase_id))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
  );
  const selectedPhaseIds = new Set(blockRefs.map((ref) => Number(ref.phaseId)));

  const dependenciesByPhase = new Map();
  selectedPhaseIds.forEach((phaseId) => dependenciesByPhase.set(phaseId, new Set()));

  const issues = [];

  blockRefs.forEach((ref) => {
    const phaseId = Number(ref.phaseId);
    const phaseBlocks = phaseBlocksByPhase.get(phaseId) || [];
    const block = phaseBlocks.find((entry) => Number(entry.id) === Number(ref.blockId));
    if (!block) {
      return;
    }

    const dependsOnPhase = block.source_type === "phase" || block.source_type === "match";
    const sourcePhaseId = Number(block.source_phase_id);
    if (!dependsOnPhase || !Number.isInteger(sourcePhaseId) || sourcePhaseId <= 0) {
      return;
    }

    const sourceAlreadyPlanned = plannedPhaseIds.has(sourcePhaseId);
    const sourceSelectedNow = selectedPhaseIds.has(sourcePhaseId);

    if (!sourceAlreadyPlanned && !sourceSelectedNow) {
      const targetPhaseName = phaseNameById.get(phaseId) || `Phase ${phaseId}`;
      const sourcePhaseName = phaseNameById.get(sourcePhaseId) || `Phase ${sourcePhaseId}`;
      issues.push(`${targetPhaseName} baut auf ${sourcePhaseName} auf, diese Phase ist noch nicht geplant.`);
      return;
    }

    if (sourceSelectedNow && sourcePhaseId !== phaseId) {
      dependenciesByPhase.get(phaseId).add(sourcePhaseId);
    }
  });

  if (issues.length > 0) {
    return {
      isValid: false,
      message: `Planung nicht erlaubt:\n- ${issues.join("\n- ")}`,
      orderedBlockRefs: [],
    };
  }

  const inDegree = new Map();
  const outgoing = new Map();
  selectedPhaseIds.forEach((phaseId) => {
    inDegree.set(phaseId, 0);
    outgoing.set(phaseId, new Set());
  });

  dependenciesByPhase.forEach((deps, phaseId) => {
    deps.forEach((depId) => {
      inDegree.set(phaseId, (inDegree.get(phaseId) || 0) + 1);
      outgoing.get(depId).add(phaseId);
    });
  });

  const queue = [...selectedPhaseIds]
    .filter((phaseId) => (inDegree.get(phaseId) || 0) === 0)
    .sort((a, b) => (phaseIndexById.get(a) || 0) - (phaseIndexById.get(b) || 0));

  const orderedPhaseIds = [];
  while (queue.length > 0) {
    const current = queue.shift();
    orderedPhaseIds.push(current);

    const nextSet = outgoing.get(current) || new Set();
    nextSet.forEach((nextPhaseId) => {
      const nextDegree = (inDegree.get(nextPhaseId) || 0) - 1;
      inDegree.set(nextPhaseId, nextDegree);
      if (nextDegree === 0) {
        queue.push(nextPhaseId);
        queue.sort((a, b) => (phaseIndexById.get(a) || 0) - (phaseIndexById.get(b) || 0));
      }
    });
  }

  if (orderedPhaseIds.length !== selectedPhaseIds.size) {
    return {
      isValid: false,
      message: "Planung nicht erlaubt: zyklische Abhaengigkeit zwischen ausgewaehlten Phasen.",
      orderedBlockRefs: [],
    };
  }

  const orderIndexByPhase = new Map(orderedPhaseIds.map((phaseId, index) => [phaseId, index]));
  const orderedBlockRefs = [...blockRefs].sort(
    (a, b) =>
      (orderIndexByPhase.get(Number(a.phaseId)) || 0) -
      (orderIndexByPhase.get(Number(b.phaseId)) || 0)
  );

  return {
    isValid: true,
    message: "",
    orderedBlockRefs,
  };
}

/**
 * Handles planning generation and persists matches phase-by-phase.
 * @returns {Promise<void>} Resolves when generation flow is complete.
 */
async function handleGenerateMatches() {
  let blockRefs = getSelectedBlockRefs();

  if (blockRefs.length === 0) {
    return;
  }

  blockRefs = expandBlockRefsWithSelectedSources(blockRefs);

  const slotValidation = validatePlanningBlockSlots(blockRefs);
  if (!slotValidation.isValid) {
    window.alert(slotValidation.message);
    return;
  }

  const fieldNumbers = getSelectedFieldNumbers();
  if (fieldNumbers.length === 0) {
    return;
  }

  try {
    teamsWithIds = await loadTeamsWithIds();
  } catch {
    // Keep existing in-memory team map when backend read fails.
  }

  const existingBlockIds = new Set(
    persistedMatches.filter((m) => Number.isInteger(m.block_id)).map((m) => m.block_id)
  );
  const newBlockRefs = blockRefs.filter((ref) => !existingBlockIds.has(ref.blockId));

  if (newBlockRefs.length === 0) {
    return;
  }

  const planningOrder = resolvePlanningOrder(newBlockRefs);
  if (!planningOrder.isValid) {
    window.alert(planningOrder.message);
    return;
  }

  const teamsByName = new Map(teamsWithIds.map((t) => [t.name, t]));
  const newMatches = buildScheduledMatches(
    planningOrder.orderedBlockRefs,
    phaseBlocksByPhase,
    teamsByName,
    fieldNumbers,
    persistedSettings,
    persistedMatches
  );

  if (newMatches.length === 0) {
    return;
  }

  const phaseOrder = [];
  const newMatchesByPhase = new Map();
  newMatches.forEach((m) => {
    if (!newMatchesByPhase.has(m.phase_id)) {
      newMatchesByPhase.set(m.phase_id, []);
      phaseOrder.push(m.phase_id);
    }
    newMatchesByPhase.get(m.phase_id).push(m);
  });

  for (const phaseId of phaseOrder) {
    const newPhaseMatches = newMatchesByPhase.get(phaseId) || [];
    const existingPhaseMatches = persistedMatches.filter((m) => m.phase_id === phaseId);
    const combined = [...existingPhaseMatches, ...newPhaseMatches].map((m, i) => ({
      ...m,
      position: i,
    }));

    try {
      const saved = await saveMatchesForPhase(phaseId, combined);
      persistedMatches = persistedMatches.filter((m) => m.phase_id !== phaseId).concat(saved);
    } catch {
      // Continue processing remaining phases.
    }
  }

  renderAllMatchGrid();
}

/**
 * Builds a stable ordering for one phase before persistence.
 * @param {Array<object>} phaseMatches Match list for one phase.
 * @returns {Array<object>} Ordered and position-indexed matches.
 */
function orderPhaseMatchesForSave(phaseMatches) {
  return [...phaseMatches]
    .sort((a, b) => {
      const timeCmp = String(a.start_time || "").localeCompare(String(b.start_time || ""));
      if (timeCmp !== 0) {
        return timeCmp;
      }
      const fieldCmp = Number(a.field_number || 0) - Number(b.field_number || 0);
      if (fieldCmp !== 0) {
        return fieldCmp;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    })
    .map((match, index) => ({
      ...match,
      position: index,
    }));
}

/**
 * Persists all matches of one phase and refreshes local match state.
 * @param {number} phaseId Target phase id.
 * @returns {Promise<void>} Resolves when save is complete.
 */
async function persistPhaseMatches(phaseId) {
  const phaseMatches = persistedMatches.filter((match) => match.phase_id === phaseId);
  const ordered = orderPhaseMatchesForSave(phaseMatches);
  const saved = await saveMatchesForPhase(phaseId, ordered);
  persistedMatches = persistedMatches.filter((match) => match.phase_id !== phaseId).concat(saved);
}

/**
 * Handles moving one match card to another field/time slot and resolves collisions.
 * Ensures only one match exists per field/time by pushing conflicting matches down.
 * @param {number} matchId Match id being moved.
 * @param {number} targetField Destination field number.
 * @param {string} targetTime Destination start time.
 * @returns {Promise<void>} Resolves when move and persistence are complete.
 */
async function moveMatchToSlot(matchId, targetField, targetTime) {
  const index = persistedMatches.findIndex((match) => Number(match.id) === matchId);
  if (index < 0) {
    return;
  }

  const source = persistedMatches[index];
  if (Number(source.field_number) === targetField && String(source.start_time) === targetTime) {
    return;
  }

  const movingMatch = {
    ...source,
    field_number: targetField,
    start_time: targetTime,
  };

  const slotDuration = getMatchSlotDurationMinutes();
  const fieldMatches = persistedMatches.filter(
    (m) => Number(m.field_number) === targetField && Number(m.id) !== Number(movingMatch.id)
  );

  /**
   * Converts a HH:mm time string into minute-of-day value.
   * @param {string} time Time string in HH:mm format.
   * @returns {number} Minute-of-day value.
   */
  function toMinutes(time) {
    const [h, m] = String(time || "00:00").split(":").map((v) => Number(v || 0));
    return h * 60 + m;
  }

  const candidates = fieldMatches
    .map((m) => ({ ...m, _desired: String(m.start_time || "00:00") }))
    .concat({ ...movingMatch, _desired: targetTime });

  candidates.sort((a, b) => {
    const timeCmp = toMinutes(a._desired) - toMinutes(b._desired);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    if (Number(a.id) === Number(matchId)) {
      return -1;
    }
    if (Number(b.id) === Number(matchId)) {
      return 1;
    }
    return Number(a.id || 0) - Number(b.id || 0);
  });

  const occupied = new Set();
  const updatedById = new Map();
  candidates.forEach((candidate) => {
    let t = String(candidate._desired);
    while (occupied.has(`${targetField}|${t}`)) {
      t = addMinutesToTime(t, slotDuration);
    }
    occupied.add(`${targetField}|${t}`);
    if (Number.isInteger(Number(candidate.id))) {
      const { _desired, ...rest } = candidate;
      updatedById.set(Number(candidate.id), {
        ...rest,
        field_number: targetField,
        start_time: t,
      });
    }
  });

  persistedMatches = persistedMatches.map((match) => {
    const updated = updatedById.get(Number(match.id));
    return updated ? { ...match, ...updated } : match;
  });

  const changedPhaseIds = new Set(
    [...updatedById.values()].map((m) => Number(m.phase_id)).filter((id) => id > 0)
  );

  try {
    for (const phaseId of changedPhaseIds) {
      await persistPhaseMatches(phaseId);
    }
  } catch {
    // Ignore save errors and keep UI responsive.
  }

  renderAllMatchGrid();
}

tournamentPlanningUi.phaseSelect.addEventListener("change", () => {
  refreshTournamentPlanningGroups();
});

tournamentPlanningUi.generateButton.addEventListener("click", handleGenerateMatches);

tournamentPlanningUi.gridArea.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".tp-match-card");
  if (!card) {
    return;
  }

  const matchId = card.dataset.matchId || "";
  event.dataTransfer.setData("text/plain", matchId);
  event.dataTransfer.effectAllowed = "move";
  card.classList.add("is-dragging");
});

tournamentPlanningUi.gridArea.addEventListener("dragend", (event) => {
  const card = event.target.closest(".tp-match-card");
  if (card) {
    card.classList.remove("is-dragging");
  }

  tournamentPlanningUi.gridArea
    .querySelectorAll(".tp-drop-slot.is-drop-target")
    .forEach((slot) => slot.classList.remove("is-drop-target"));
});

tournamentPlanningUi.gridArea.addEventListener("dragover", (event) => {
  const slot = event.target.closest(".tp-drop-slot");
  if (!slot) {
    return;
  }

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  tournamentPlanningUi.gridArea
    .querySelectorAll(".tp-drop-slot.is-drop-target")
    .forEach((el) => {
      if (el !== slot) {
        el.classList.remove("is-drop-target");
      }
    });
  slot.classList.add("is-drop-target");
});

tournamentPlanningUi.gridArea.addEventListener("drop", async (event) => {
  const slot = event.target.closest(".tp-drop-slot");
  if (!slot) {
    return;
  }

  event.preventDefault();
  slot.classList.remove("is-drop-target");

  const matchId = Number(event.dataTransfer.getData("text/plain"));
  const targetField = Number(slot.dataset.field);
  const targetTime = String(slot.dataset.time || "");

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return;
  }
  if (!Number.isInteger(targetField) || targetField <= 0) {
    return;
  }
  if (!targetTime) {
    return;
  }

  await moveMatchToSlot(matchId, targetField, targetTime);
});

tournamentPlanningUi.gridArea.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("[data-action='delete-phase']");
  if (!deleteBtn) {
    return;
  }

  const phaseId = Number(deleteBtn.dataset.phaseId);
  if (!phaseId) {
    return;
  }

  const phaseName = deleteBtn.dataset.phaseName || "diese Phase";
  const confirmed = window.confirm(`Alle geplanten Matches für "${phaseName}" wirklich löschen?`);
  if (!confirmed) {
    return;
  }

  try {
    await deleteMatchesForPhase(phaseId);
    persistedMatches = persistedMatches.filter((m) => m.phase_id !== phaseId);
    renderAllMatchGrid();
  } catch {
    // no-op
  }
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
    renderTournamentPlanningFields(tournamentPlanningUi.fieldSelect, persistedSettings.fields);
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
