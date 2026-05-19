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
 * Returns teams that are flagged as playable for matches and groups.
 * @returns {Array<{name: string, available_as_team: boolean, available_as_referee: boolean}>} Playable teams.
 */
function getPlayableTeams() {
  return persistedTeams.filter((team) => team.available_as_team !== false);
}

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
  const playableTeams = getPlayableTeams();
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
    renderPhaseBlocks(
      blockContainer,
      phase.id,
      blocks,
      phases,
      playableTeams,
      phaseBlocksByPhase,
      persistedPlacements
    );
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
    const teamCount = getPlayableTeams().length;
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
    const playableTeams = getPlayableTeams();
    const loaded = await loadPlacements();
    const teamCount = playableTeams.length;
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
      playableTeams,
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
      getPlayableTeams().length,
      getPlayableTeams(),
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
 * Converts HH:mm time to minute-of-day number.
 * @param {string} time Time string in HH:mm format.
 * @returns {number} Minute-of-day value.
 */
function toMinutes(time) {
  const [h, m] = String(time || "00:00").split(":").map((v) => Number(v || 0));
  return h * 60 + m;
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
 * Returns effective duration in minutes for one match entry.
 * @param {object} match Match or pause entry.
 * @param {number} defaultSlotDuration Fallback slot duration for normal matches.
 * @returns {number} Effective duration in minutes.
 */
function getEntryDurationMinutes(match, defaultSlotDuration) {
  const isPause = String(match.entry_type || "match") === "pause";
  if (isPause) {
    return Math.max(1, Number(match.duration_minutes) || 0);
  }
  return Math.max(1, Number(defaultSlotDuration) || 1);
}

/**
 * Returns normalized team identity keys for collision checks.
 * Uses only concrete team ids to avoid false conflicts on placeholder refs.
 * @param {object} match Match entry to inspect.
 * @returns {Array<string>} Unique normalized identity keys.
 */
function getTeamIdentityKeys(match) {
  const keys = [];

  const team1Id = Number(match.team1_id);
  const team2Id = Number(match.team2_id);
  if (Number.isInteger(team1Id) && team1Id > 0) {
    keys.push(`id:${team1Id}`);
  }

  if (Number.isInteger(team2Id) && team2Id > 0) {
    keys.push(`id:${team2Id}`);
  }

  return [...new Set(keys)];
}

/**
 * Checks whether two match entries share at least one team identity.
 * @param {object} first First match entry.
 * @param {object} second Second match entry.
 * @returns {boolean} True if both entries contain the same team identity.
 */
function entriesShareTeam(first, second) {
  const firstKeys = getTeamIdentityKeys(first);
  if (firstKeys.length === 0) {
    return false;
  }
  const secondKeys = new Set(getTeamIdentityKeys(second));
  return firstKeys.some((key) => secondKeys.has(key));
}

/**
 * Computes start and end minute bounds for each phase currently containing matches.
 * @param {Array<object>} matches All persisted matches.
 * @param {number} defaultSlotDuration Fallback slot duration for normal matches.
 * @returns {Map<number, {start: number, end: number}>} Phase timing bounds.
 */
function computePhaseBounds(matches, defaultSlotDuration) {
  const boundsByPhase = new Map();

  matches.forEach((match) => {
    const phaseId = Number(match.phase_id);
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      return;
    }

    const start = toMinutes(String(match.start_time || "00:00"));
    const duration = getEntryDurationMinutes(match, defaultSlotDuration);
    const end = start + duration;

    if (!boundsByPhase.has(phaseId)) {
      boundsByPhase.set(phaseId, { start, end });
      return;
    }

    const current = boundsByPhase.get(phaseId);
    current.start = Math.min(current.start, start);
    current.end = Math.max(current.end, end);
  });

  return boundsByPhase;
}

/**
 * Builds dependency edges sourcePhase -> targetPhase based on phase blocks.
 * Only phases with currently planned matches are considered.
 * @param {Set<number>} plannedPhaseIds Phase IDs that currently have matches.
 * @returns {{ incomingByPhase: Map<number, Set<number>>, outgoingByPhase: Map<number, Set<number>> }} Dependency maps.
 */
function buildPhaseDependencyGraph(plannedPhaseIds) {
  const incomingByPhase = new Map();
  const outgoingByPhase = new Map();

  plannedPhaseIds.forEach((phaseId) => {
    incomingByPhase.set(phaseId, new Set());
    outgoingByPhase.set(phaseId, new Set());
  });

  plannedPhaseIds.forEach((targetPhaseId) => {
    const blocks = phaseBlocksByPhase.get(targetPhaseId) || [];
    blocks.forEach((block) => {
      const dependsOnPhase = block.source_type === "phase" || block.source_type === "match";
      const sourcePhaseId = Number(block.source_phase_id);
      if (!dependsOnPhase || !Number.isInteger(sourcePhaseId) || sourcePhaseId <= 0) {
        return;
      }
      if (sourcePhaseId === targetPhaseId) {
        return;
      }
      if (!plannedPhaseIds.has(sourcePhaseId)) {
        return;
      }

      incomingByPhase.get(targetPhaseId).add(sourcePhaseId);
      outgoingByPhase.get(sourcePhaseId).add(targetPhaseId);
    });
  });

  return { incomingByPhase, outgoingByPhase };
}

/**
 * Topologically orders phases by dependency, with persisted phase order as tie-breaker.
 * Falls back to persisted phase order if cycles are detected.
 * @param {Set<number>} plannedPhaseIds Phase IDs to order.
 * @param {Map<number, Set<number>>} incomingByPhase Incoming dependency edges.
 * @param {Map<number, Set<number>>} outgoingByPhase Outgoing dependency edges.
 * @returns {Array<number>} Ordered phase IDs.
 */
function getDependencyOrderedPhases(plannedPhaseIds, incomingByPhase, outgoingByPhase) {
  const phaseIndexById = new Map(persistedPhases.map((phase, index) => [Number(phase.id), index]));
  const inDegree = new Map();

  plannedPhaseIds.forEach((phaseId) => {
    inDegree.set(phaseId, (incomingByPhase.get(phaseId) || new Set()).size);
  });

  const queue = [...plannedPhaseIds]
    .filter((phaseId) => (inDegree.get(phaseId) || 0) === 0)
    .sort((a, b) => (phaseIndexById.get(a) ?? 9999) - (phaseIndexById.get(b) ?? 9999));

  const ordered = [];
  while (queue.length > 0) {
    const current = queue.shift();
    ordered.push(current);

    const outgoing = outgoingByPhase.get(current) || new Set();
    outgoing.forEach((nextPhaseId) => {
      const nextDegree = (inDegree.get(nextPhaseId) || 0) - 1;
      inDegree.set(nextPhaseId, nextDegree);
      if (nextDegree === 0) {
        queue.push(nextPhaseId);
        queue.sort((a, b) => (phaseIndexById.get(a) ?? 9999) - (phaseIndexById.get(b) ?? 9999));
      }
    });
  }

  if (ordered.length !== plannedPhaseIds.size) {
    return [...plannedPhaseIds].sort(
      (a, b) => (phaseIndexById.get(a) ?? 9999) - (phaseIndexById.get(b) ?? 9999)
    );
  }

  return ordered;
}

/**
 * Compacts regular matches of one phase across its planned fields from a given start time.
 * This keeps fields utilized and removes avoidable gaps after dependency-based shifts.
 * @param {number} phaseId Target phase id.
 * @param {number} phaseStartMinute Earliest allowed phase start in minutes-of-day.
 * @param {number} defaultSlotDuration Fallback slot duration for regular matches.
 * @returns {boolean} True when at least one match time/field was changed.
 */
function compactPhaseMatchesAcrossFields(phaseId, phaseStartMinute, defaultSlotDuration) {
  const phaseMatches = persistedMatches
    .filter(
      (match) =>
        Number(match.phase_id) === phaseId &&
        String(match.entry_type || "match") !== "pause" &&
        Number(match.field_number) > 0
    )
    .sort((a, b) => {
      const timeCmp = toMinutes(String(a.start_time || "00:00")) - toMinutes(String(b.start_time || "00:00"));
      if (timeCmp !== 0) {
        return timeCmp;
      }
      const fieldCmp = Number(a.field_number || 0) - Number(b.field_number || 0);
      if (fieldCmp !== 0) {
        return fieldCmp;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    });

  if (phaseMatches.length <= 1) {
    return false;
  }

  const plannedFields = [...new Set(phaseMatches.map((match) => Number(match.field_number)).filter((f) => f > 0))]
    .sort((a, b) => a - b);
  if (plannedFields.length <= 1) {
    return false;
  }

  const fieldNextByNumber = new Map(plannedFields.map((field) => [field, phaseStartMinute]));
  const updatesById = new Map();
  let changed = false;

  /**
   * Returns the effective match state including tentative compaction updates.
   * @param {object} match Base persisted match.
   * @returns {object} Effective match state.
   */
  function getEffectivePhaseMatch(match) {
    return updatesById.get(Number(match.id)) || match;
  }

  /**
   * Checks whether assigning a match to field/time would conflict by field occupancy.
   * @param {object} match Match that is being scheduled.
   * @param {number} field Target field number.
   * @param {string} startTime Target HH:mm time.
   * @returns {boolean} True when the field is already occupied at that time.
   */
  function isFieldOccupiedAtTime(match, field, startTime) {
    return persistedMatches.some((other) => {
      if (Number(other.id) === Number(match.id)) {
        return false;
      }
      const effective = getEffectivePhaseMatch(other);
      return Number(effective.field_number) === field && String(effective.start_time || "") === startTime;
    });
  }

  /**
   * Checks whether assigning a match to a time would cause simultaneous team usage.
   * @param {object} match Match that is being scheduled.
   * @param {string} startTime Target HH:mm time.
   * @returns {boolean} True when one of the teams is already playing at that time.
   */
  function hasTeamConflictAtTime(match, startTime) {
    return persistedMatches.some((other) => {
      if (Number(other.id) === Number(match.id)) {
        return false;
      }
      const effective = getEffectivePhaseMatch(other);
      if (String(effective.start_time || "") !== startTime) {
        return false;
      }
      return entriesShareTeam(match, effective);
    });
  }

  phaseMatches.forEach((match) => {
    const originalField = Number(match.field_number);
    let selectedField = plannedFields[0];
    let selectedNext = Number.MAX_SAFE_INTEGER;

    plannedFields.forEach((field) => {
      let candidateNext = Math.max(phaseStartMinute, fieldNextByNumber.get(field) || phaseStartMinute);
      let safety = 0;

      while (safety < 400) {
        safety += 1;
        const candidateTime = addMinutesToTime("00:00", candidateNext);
        const blockedByField = isFieldOccupiedAtTime(match, field, candidateTime);
        const blockedByTeam = hasTeamConflictAtTime(match, candidateTime);
        if (!blockedByField && !blockedByTeam) {
          break;
        }
        candidateNext += defaultSlotDuration;
      }

      const isBetterTime = candidateNext < selectedNext;
      const isSameTimePreferOriginalField =
        candidateNext === selectedNext && field === originalField && selectedField !== originalField;
      const isSameTimeFallbackLowerField =
        candidateNext === selectedNext && field !== originalField && selectedField !== originalField && field < selectedField;

      if (isBetterTime || isSameTimePreferOriginalField || isSameTimeFallbackLowerField) {
        selectedField = field;
        selectedNext = candidateNext;
      }
    });

    const nextStartTime = addMinutesToTime("00:00", selectedNext);
    const duration = getEntryDurationMinutes(match, defaultSlotDuration);
    fieldNextByNumber.set(selectedField, selectedNext + duration);

    if (Number(match.field_number) !== selectedField || String(match.start_time || "") !== nextStartTime) {
      changed = true;
      updatesById.set(Number(match.id), {
        ...match,
        field_number: selectedField,
        start_time: nextStartTime,
      });
    }
  });

  if (!changed) {
    return false;
  }

  persistedMatches = persistedMatches.map((match) => {
    const updated = updatesById.get(Number(match.id));
    return updated ? { ...match, ...updated } : match;
  });
  return true;
}

/**
 * Recalculates phase timing after DnD so dependent phases cannot start before
 * all source phases are finished. Returns phase ids that were shifted.
 * @returns {Set<number>} Changed phase ids caused by dependency timing shifts.
 */
function recalculatePhaseTimingAfterDnD() {
  const defaultSlotDuration = getMatchSlotDurationMinutes();
  const tournamentStartMinute = toMinutes(
    String(persistedSettings.tournament_time || "09:00")
  );
  const plannedPhaseIds = new Set(
    persistedMatches
      .map((match) => Number(match.phase_id))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
  );
  if (plannedPhaseIds.size === 0) {
    return new Set();
  }

  const { incomingByPhase, outgoingByPhase } = buildPhaseDependencyGraph(plannedPhaseIds);
  const orderedPhases = getDependencyOrderedPhases(plannedPhaseIds, incomingByPhase, outgoingByPhase);
  let phaseBounds = computePhaseBounds(persistedMatches, defaultSlotDuration);
  const changedPhaseIds = new Set();

  orderedPhases.forEach((phaseId) => {
    const bounds = phaseBounds.get(phaseId);
    if (!bounds) {
      return;
    }

    const requiredStart = Math.max(
      tournamentStartMinute,
      ...[...(incomingByPhase.get(phaseId) || new Set())]
        .map((depPhaseId) => phaseBounds.get(depPhaseId)?.end ?? 0)
    );
    let phaseChanged = false;

    if (bounds.start < requiredStart) {
      const shiftMinutes = requiredStart - bounds.start;
      persistedMatches = persistedMatches.map((match) => {
        if (Number(match.phase_id) !== phaseId) {
          return match;
        }
        return {
          ...match,
          start_time: addMinutesToTime(String(match.start_time || "00:00"), shiftMinutes),
        };
      });
      phaseChanged = true;
      phaseBounds = computePhaseBounds(persistedMatches, defaultSlotDuration);
    }

    const compacted = compactPhaseMatchesAcrossFields(phaseId, requiredStart, defaultSlotDuration);
    if (compacted) {
      phaseChanged = true;
      phaseBounds = computePhaseBounds(persistedMatches, defaultSlotDuration);
    }

    if (phaseChanged) {
      changedPhaseIds.add(phaseId);
    }
  });

  return changedPhaseIds;
}

/**
 * Creates a shallow-cloned match list so DnD can be calculated on a proposal first.
 * @param {Array<object>} matches Current persisted match list.
 * @returns {Array<object>} Cloned match list.
 */
function cloneMatchesForProposal(matches) {
  return matches.map((match) => ({ ...match }));
}

/**
 * Returns a proposed field schedule after inserting one moved match.
 * On cross-field moves, existing target-field matches keep priority on equal desired time.
 * On same-field moves, the moved match may claim the earlier target slot and pushes later
 * matches down by slot duration.
 * @param {Array<object>} proposedMatches Proposed full match list.
 * @param {object} movedMatch Match already updated with target field/time.
 * @param {number} sourceField Original field number of the moved match.
 * @param {number} slotDuration Duration of one regular slot in minutes.
 * @returns {Map<number, string>} Match id to proposed HH:mm start time on target field.
 */
function buildTargetFieldProposal(proposedMatches, movedMatch, sourceField, slotDuration) {
  const targetField = Number(movedMatch.field_number);
  const movedMatchId = Number(movedMatch.id);
  const preferMovedOnEqualTime = Number(sourceField) === targetField;
  const candidates = proposedMatches
    .filter((match) => Number(match.field_number) === targetField && Number(match.id) !== movedMatchId)
    .map((match) => ({ ...match, _desired: String(match.start_time || "00:00") }))
    .concat({ ...movedMatch, _desired: String(movedMatch.start_time || "00:00") });

  candidates.sort((a, b) => {
    const timeCmp = toMinutes(a._desired) - toMinutes(b._desired);
    if (timeCmp !== 0) {
      return timeCmp;
    }
    if (Number(a.id) === movedMatchId) {
      return preferMovedOnEqualTime ? -1 : 1;
    }
    if (Number(b.id) === movedMatchId) {
      return preferMovedOnEqualTime ? 1 : -1;
    }
    return Number(a.id || 0) - Number(b.id || 0);
  });

  const nextTimeById = new Map();
  let previousTime = "";
  candidates.forEach((candidate) => {
    let nextTime = String(candidate._desired || "00:00");
    if (previousTime && toMinutes(nextTime) <= toMinutes(previousTime)) {
      nextTime = addMinutesToTime(previousTime, slotDuration);
    }
    nextTimeById.set(Number(candidate.id), nextTime);
    previousTime = nextTime;
  });

  return nextTimeById;
}

/**
 * Compacts one field in a proposed schedule forward to close the gap left by a moved match.
 * Only matches strictly after the removed start time are pulled forward.
 * @param {Array<object>} proposedMatches Proposed full match list.
 * @param {number} fieldNumber Field to compact.
 * @param {string} gapStartTime Free HH:mm slot to fill.
 * @returns {void}
 */
function compactFieldGapInProposal(proposedMatches, fieldNumber, gapStartTime) {
  const fieldMatches = proposedMatches
    .filter((match) => Number(match.field_number) === Number(fieldNumber))
    .sort((a, b) => {
      const timeCmp = toMinutes(String(a.start_time || "00:00")) - toMinutes(String(b.start_time || "00:00"));
      if (timeCmp !== 0) {
        return timeCmp;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    });

  let currentGap = String(gapStartTime || "");
  while (currentGap) {
    const nextMatch = fieldMatches.find(
      (match) => toMinutes(String(match.start_time || "00:00")) > toMinutes(currentGap)
    );
    if (!nextMatch) {
      return;
    }

    const previousTime = String(nextMatch.start_time || "00:00");
    nextMatch.start_time = currentGap;
    currentGap = previousTime;
  }
}

/**
 * Validates a proposed schedule for hard DnD conflicts.
 * Rejects if two entries share the same field/time or if one team appears in
 * multiple matches in the same time slot.
 * @param {Array<object>} proposedMatches Proposed full match list.
 * @returns {{ isValid: boolean, message: string }} Validation result.
 */
function validateDnDProposal(proposedMatches) {
  const fieldTimeKeys = new Set();
  const matchesByTime = new Map();

  for (const match of proposedMatches) {
    const field = Number(match.field_number);
    const time = String(match.start_time || "");
    if (!Number.isInteger(field) || field <= 0 || !time) {
      continue;
    }

    const fieldTimeKey = `${field}|${time}`;
    if (fieldTimeKeys.has(fieldTimeKey)) {
      return {
        isValid: false,
        message: "Verschieben nicht moeglich: Ein Feld waere doppelt belegt.",
      };
    }
    fieldTimeKeys.add(fieldTimeKey);

    if (!matchesByTime.has(time)) {
      matchesByTime.set(time, []);
    }
    matchesByTime.get(time).push(match);
  }

  for (const timeMatches of matchesByTime.values()) {
    for (let index = 0; index < timeMatches.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < timeMatches.length; compareIndex += 1) {
        if (entriesShareTeam(timeMatches[index], timeMatches[compareIndex])) {
          return {
            isValid: false,
            message: "Verschieben nicht moeglich: Ein Team wuerde gleichzeitig auf zwei Feldern spielen.",
          };
        }
      }
    }
  }

  return { isValid: true, message: "" };
}

/**
 * Handles moving one match card by first building a proposed copied schedule,
 * validating it for hard conflicts, and only then applying it.
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

  const slotDuration = getMatchSlotDurationMinutes();
  const proposedMatches = cloneMatchesForProposal(persistedMatches);
  const proposedMovingMatch = proposedMatches.find((match) => Number(match.id) === Number(matchId));
  if (!proposedMovingMatch) {
    return;
  }

  const sourceField = Number(source.field_number);
  const sourceTime = String(source.start_time || "");
  proposedMovingMatch.field_number = targetField;
  proposedMovingMatch.start_time = targetTime;

  const targetFieldProposal = buildTargetFieldProposal(
    proposedMatches,
    proposedMovingMatch,
    sourceField,
    slotDuration
  );
  proposedMatches.forEach((match) => {
    if (targetFieldProposal.has(Number(match.id))) {
      match.field_number = targetField;
      match.start_time = targetFieldProposal.get(Number(match.id)) || match.start_time;
    }
  });

  if (sourceField !== targetField) {
    compactFieldGapInProposal(proposedMatches, sourceField, sourceTime);
  }

  const validation = validateDnDProposal(proposedMatches);
  if (!validation.isValid) {
    window.alert(validation.message);
    return;
  }

  persistedMatches = proposedMatches;

  const dependencyChangedPhaseIds = recalculatePhaseTimingAfterDnD();
  const refereeRecheckResult = recheckRefereesAfterDnD();

  const changedPhaseIds = new Set(
    [Number(source.phase_id), Number(proposedMovingMatch.phase_id)].filter((id) => id > 0)
  );
  dependencyChangedPhaseIds.forEach((phaseId) => changedPhaseIds.add(phaseId));
  refereeRecheckResult.changedPhaseIds.forEach((phaseId) => changedPhaseIds.add(phaseId));

  try {
    for (const phaseId of changedPhaseIds) {
      await persistPhaseMatches(phaseId);
    }
  } catch {
    // Ignore save errors and keep UI responsive.
  }

  renderAllMatchGrid();
}

/**
 * Collects all distinct time slots across all persisted matches, sorted ascending.
 * @returns {Array<string>} Sorted unique HH:mm time slot strings.
 */
function getAllTimeSlots() {
  return [...new Set(
    persistedMatches
      .map((m) => String(m.start_time || "").trim())
      .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
  )].sort((a, b) => toMinutes(a) - toMinutes(b));
}

/**
 * Snaps a requested start time to the nearest existing time slot at or after
 * the requested time. Falls back to the requested time when no slots exist yet.
 * @param {string} requestedTime HH:mm string requested by the user.
 * @returns {string} Aligned HH:mm time slot string.
 */
function snapToNearestSlot(requestedTime) {
  const slots = getAllTimeSlots();
  if (slots.length === 0) {
    return requestedTime;
  }
  const reqMin = toMinutes(requestedTime);
  const aligned = slots.find((s) => toMinutes(s) >= reqMin);
  return aligned || slots[slots.length - 1];
}

/**
 * Inserts one pause across all fields at a shared time slot and shifts all
 * later matches on every field by the pause duration.
 * The requested start time is aligned to the nearest existing time slot.
 * No phase selection is required.
 * @returns {Promise<void>} Resolves when insertion and persistence are complete.
 */
async function insertPauseSlot() {
  if (persistedMatches.length === 0) {
    window.alert("Es sind noch keine Matches geplant. Bitte zuerst Matches generieren.");
    return;
  }

  const slotDuration = getMatchSlotDurationMinutes();

  // Suggest the first time slot as default.
  const slots = getAllTimeSlots();
  const defaultStart = slots[0] || persistedSettings.tournament_time || "09:00";

  const inputStart = window.prompt("Startzeit der Pause (HH:mm) – wird auf nächsten Slot alignt", defaultStart);
  if (inputStart === null) {
    return;
  }
  const rawStart = String(inputStart).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(rawStart)) {
    window.alert("Ungueltige Startzeit. Bitte HH:mm verwenden.");
    return;
  }

  const pauseStart = snapToNearestSlot(rawStart);

  const durationDefault = Math.max(1, slotDuration);
  const inputDuration = window.prompt(
    `Pausenlaenge in Minuten (Slot bei ${pauseStart} wird blockiert)`,
    String(durationDefault)
  );
  if (inputDuration === null) {
    return;
  }
  const pauseDuration = Math.max(1, Number(inputDuration) || 0);
  if (!Number.isFinite(pauseDuration) || pauseDuration <= 0) {
    window.alert("Ungueltige Pausenlaenge.");
    return;
  }

  // Collect all field numbers present in persisted matches.
  const allFields = [...new Set(persistedMatches.map((m) => Number(m.field_number)).filter((f) => f > 0))].sort(
    (a, b) => a - b
  );

  // Determine which phase to assign each pause to (first phase found on that field).
  const phaseByField = new Map();
  allFields.forEach((field) => {
    const match = persistedMatches.find((m) => Number(m.field_number) === field);
    if (match) {
      phaseByField.set(field, Number(match.phase_id));
    }
  });

  // Shift all matches at or after pauseStart on every field by pauseDuration.
  const updatedById = new Map();
  persistedMatches
    .filter((m) => toMinutes(String(m.start_time || "")) >= toMinutes(pauseStart))
    .forEach((match) => {
      updatedById.set(Number(match.id), {
        ...match,
        start_time: addMinutesToTime(String(match.start_time || pauseStart), pauseDuration),
      });
    });

  persistedMatches = persistedMatches.map((match) => {
    const updated = updatedById.get(Number(match.id));
    return updated ? { ...match, ...updated } : match;
  });

  // Insert one pause entry per field at the aligned slot.
  allFields.forEach((field) => {
    const phaseId = phaseByField.get(field) || 0;
    persistedMatches.push({
      id: null,
      phase_id: phaseId,
      block_id: null,
      block_name: "Pause",
      team1_id: null,
      team2_id: null,
      team1_ref: null,
      team2_ref: null,
      referee_id: null,
      field_number: field,
      start_time: pauseStart,
      is_finished: 0,
      winner_id: null,
      loser_id: null,
      position: 0,
      entry_type: "pause",
      duration_minutes: pauseDuration,
    });
  });

  const changedPhaseIds = new Set(
    [...updatedById.values(), ...allFields.map((f) => ({ phase_id: phaseByField.get(f) || 0 }))]
      .map((m) => Number(m.phase_id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );

  try {
    for (const changedPhaseId of changedPhaseIds) {
      await persistPhaseMatches(changedPhaseId);
    }
  } catch {
    // Ignore save errors and keep UI responsive.
  }

  renderAllMatchGrid();
}

/**
 * Deletes all pause entries that share the same time slot as the clicked pause,
 * then shifts all later matches across every field back by the pause duration.
 * @param {number} pauseMatchId Id of one of the pause entries on the target slot.
 * @returns {Promise<void>} Resolves when deletion and persistence are complete.
 */
async function deletePauseSlot(pauseMatchId) {
  if (!Number.isInteger(pauseMatchId) || pauseMatchId <= 0) {
    return;
  }

  const pauseMatch = persistedMatches.find(
    (match) => Number(match.id) === pauseMatchId && String(match.entry_type || "match") === "pause"
  );
  if (!pauseMatch) {
    return;
  }

  const pauseDuration = Math.max(1, Number(pauseMatch.duration_minutes) || 0);
  const pauseStart = String(pauseMatch.start_time || "");

  // Collect ids of all pause entries on this time slot (all fields).
  const pauseIdsOnSlot = new Set(
    persistedMatches
      .filter(
        (match) =>
          String(match.entry_type || "match") === "pause" &&
          String(match.start_time || "") === pauseStart
      )
      .map((match) => Number(match.id))
  );

  // Shift all non-pause matches that start strictly after the pause slot.
  const updatedById = new Map();
  persistedMatches
    .filter(
      (match) =>
        !pauseIdsOnSlot.has(Number(match.id)) &&
        toMinutes(String(match.start_time || "")) > toMinutes(pauseStart)
    )
    .forEach((match) => {
      updatedById.set(Number(match.id), {
        ...match,
        start_time: addMinutesToTime(String(match.start_time || pauseStart), -pauseDuration),
      });
    });

  persistedMatches = persistedMatches
    .filter((match) => !pauseIdsOnSlot.has(Number(match.id)))
    .map((match) => {
      const updated = updatedById.get(Number(match.id));
      return updated ? { ...match, ...updated } : match;
    });

  const changedPhaseIds = new Set(
    [...updatedById.values()].map((match) => Number(match.phase_id)).filter((phaseId) => phaseId > 0)
  );
  // Include phases from removed pause entries.
  pauseIdsOnSlot.forEach((pauseId) => {
    const removed = persistedMatches.find((m) => Number(m.id) === pauseId);
    if (removed) {
      changedPhaseIds.add(Number(removed.phase_id));
    }
  });
  changedPhaseIds.add(Number(pauseMatch.phase_id));

  try {
    for (const phaseId of changedPhaseIds) {
      if (phaseId > 0) {
        await persistPhaseMatches(phaseId);
      }
    }
  } catch {
    // Ignore save errors and keep UI responsive.
  }

  renderAllMatchGrid();
}

/**
 * Checks whether one match is eligible for referee assignment.
 * Only non-pause matches with both concrete teams are assignable.
 * @param {object} match Match entry to validate.
 * @returns {boolean} True when referee assignment is possible.
 */
function isRefereeAssignableMatch(match) {
  if (String(match.entry_type || "match") === "pause") {
    return false;
  }

  const team1Id = Number(match.team1_id);
  const team2Id = Number(match.team2_id);
  return Number.isInteger(team1Id) && team1Id > 0 && Number.isInteger(team2Id) && team2Id > 0;
}

/**
 * Returns a set of team ids that are flagged as available referees.
 * Team flags come from persisted team config and ids from teamsWithIds.
 * @returns {Set<number>} Eligible referee team ids.
 */
function getEligibleRefereeTeamIds() {
  const refereeFlagByName = new Map(
    persistedTeams.map((team) => [String(team.name || "").trim(), team.available_as_referee === true])
  );

  const ids = teamsWithIds
    .filter((team) => refereeFlagByName.get(String(team.name || "").trim()) === true)
    .map((team) => Number(team.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return new Set(ids);
}

/**
 * Returns all currently playing team ids for one exact start time.
 * @param {string} startTime HH:mm time slot.
 * @param {number|null} [excludeMatchId=null] Match id to exclude from lookup.
 * @returns {Set<number>} Team ids playing at that time.
 */
function getPlayingTeamIdsAtTime(startTime, excludeMatchId = null) {
  const playingTeamIds = new Set();

  persistedMatches.forEach((match) => {
    if (excludeMatchId !== null && Number(match.id) === Number(excludeMatchId)) {
      return;
    }
    if (!isRefereeAssignableMatch(match)) {
      return;
    }
    if (String(match.start_time || "") !== startTime) {
      return;
    }

    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    if (Number.isInteger(team1Id) && team1Id > 0) {
      playingTeamIds.add(team1Id);
    }
    if (Number.isInteger(team2Id) && team2Id > 0) {
      playingTeamIds.add(team2Id);
    }
  });

  return playingTeamIds;
}

/**
 * Returns all already assigned referee team ids for one exact start time.
 * @param {string} startTime HH:mm time slot.
 * @param {number|null} [excludeMatchId=null] Match id to exclude from lookup.
 * @returns {Set<number>} Referee team ids used at that time.
 */
function getRefereeingTeamIdsAtTime(startTime, excludeMatchId = null) {
  const refereeTeamIds = new Set();

  persistedMatches.forEach((match) => {
    if (excludeMatchId !== null && Number(match.id) === Number(excludeMatchId)) {
      return;
    }
    if (String(match.start_time || "") !== startTime) {
      return;
    }

    const refereeId = Number(match.referee_id);
    if (Number.isInteger(refereeId) && refereeId > 0) {
      refereeTeamIds.add(refereeId);
    }
  });

  return refereeTeamIds;
}

/**
 * Builds a lookup map for block id to block type within one phase.
 * @param {number} phaseId Target phase id.
 * @returns {Map<number, string>} Block id to block type.
 */
function getBlockTypeByIdForPhase(phaseId) {
  const blockTypeById = new Map();
  const blocks = phaseBlocksByPhase.get(Number(phaseId)) || [];

  blocks.forEach((block) => {
    const blockId = Number(block.id);
    if (!Number.isInteger(blockId) || blockId <= 0) {
      return;
    }
    blockTypeById.set(blockId, String(block.block_type || ""));
  });

  return blockTypeById;
}

/**
 * Builds a lookup map for one phase: block id to team ids present in that block.
 * @param {number} phaseId Target phase id.
 * @returns {Map<number, Set<number>>} Block id to team id set.
 */
function getGroupTeamIdsByBlockForPhase(phaseId) {
  const teamsByBlock = new Map();

  persistedMatches
    .filter((match) => Number(match.phase_id) === Number(phaseId) && isRefereeAssignableMatch(match))
    .forEach((match) => {
      const blockId = Number(match.block_id);
      if (!Number.isInteger(blockId) || blockId <= 0) {
        return;
      }

      if (!teamsByBlock.has(blockId)) {
        teamsByBlock.set(blockId, new Set());
      }

      const teamIds = teamsByBlock.get(blockId);
      const team1Id = Number(match.team1_id);
      const team2Id = Number(match.team2_id);
      if (Number.isInteger(team1Id) && team1Id > 0) {
        teamIds.add(team1Id);
      }
      if (Number.isInteger(team2Id) && team2Id > 0) {
        teamIds.add(team2Id);
      }
    });

  return teamsByBlock;
}

/**
 * Returns minute difference to the next own match for one team after a slot start.
 * Infinity means no later match exists.
 * @param {number} teamId Team id to inspect.
 * @param {string} slotStart HH:mm start time of the current match.
 * @returns {number} Minutes to the next match or Infinity.
 */
function getMinutesUntilNextPlay(teamId, slotStart) {
  const startMinutes = toMinutes(slotStart);
  let nextOffset = Infinity;

  persistedMatches.forEach((match) => {
    if (!isRefereeAssignableMatch(match)) {
      return;
    }

    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    if (team1Id !== teamId && team2Id !== teamId) {
      return;
    }

    const matchMinutes = toMinutes(String(match.start_time || "00:00"));
    const offset = matchMinutes - startMinutes;
    if (offset > 0 && offset < nextOffset) {
      nextOffset = offset;
    }
  });

  return nextOffset;
}

/**
 * Chooses one referee from candidate ids using deterministic tie-breaking.
 * Preference order: same-group (if available), no immediate next-play, fair load.
 * @param {Array<number>} candidateIds Eligible candidates.
 * @param {Set<number>} preferredIds Preferred candidates (same group) when available.
 * @param {Map<number, number>} refereeCountByTeam Current assignment count per team.
 * @param {string} matchStartTime HH:mm start time of target match.
 * @param {number} slotDurationMinutes Slot length used for next-play check.
 * @returns {number|null} Selected referee team id or null.
 */
function chooseRefereeTeamId(
  candidateIds,
  preferredIds,
  refereeCountByTeam,
  matchStartTime,
  slotDurationMinutes
) {
  const preferredCandidates = candidateIds.filter((teamId) => preferredIds.has(teamId));
  const effectiveCandidates = preferredCandidates.length > 0 ? preferredCandidates : candidateIds;

  if (effectiveCandidates.length === 0) {
    return null;
  }

  const sorted = [...effectiveCandidates].sort((leftId, rightId) => {
    const leftCount = refereeCountByTeam.get(leftId) || 0;
    const rightCount = refereeCountByTeam.get(rightId) || 0;

    const leftNext = getMinutesUntilNextPlay(leftId, matchStartTime);
    const rightNext = getMinutesUntilNextPlay(rightId, matchStartTime);
    const leftImmediatePenalty = leftNext <= slotDurationMinutes ? 1 : 0;
    const rightImmediatePenalty = rightNext <= slotDurationMinutes ? 1 : 0;

    if (leftImmediatePenalty !== rightImmediatePenalty) {
      return leftImmediatePenalty - rightImmediatePenalty;
    }
    if (leftCount !== rightCount) {
      return leftCount - rightCount;
    }
    return leftId - rightId;
  });

  return sorted[0] || null;
}

/**
 * Assigns referees for all provided phases using the configured rules.
 * Only matches with fixed team ids are assigned.
 * @param {Array<number>} phaseIds Target phase ids.
 * @returns {{changedPhaseIds: Set<number>, assignedCount: number, plannableCount: number, missingRefereePool: boolean}} Assignment result.
 */
function assignRefereesForPhases(phaseIds) {
  const targetPhaseIds = [...new Set(phaseIds.map((id) => Number(id)).filter((id) => id > 0))];
  const changedPhaseIds = new Set();
  if (targetPhaseIds.length === 0) {
    return { changedPhaseIds, assignedCount: 0, plannableCount: 0, missingRefereePool: false };
  }

  const targetPhaseIdSet = new Set(targetPhaseIds);
  const eligibleRefereeTeamIds = getEligibleRefereeTeamIds();
  if (eligibleRefereeTeamIds.size === 0) {
    return { changedPhaseIds, assignedCount: 0, plannableCount: 0, missingRefereePool: true };
  }

  const slotDurationMinutes = getMatchSlotDurationMinutes();
  const phaseOrderIndexById = new Map(persistedPhases.map((phase, index) => [Number(phase.id), index]));
  const blockTypeLookupByPhase = new Map();
  const groupTeamIdsLookupByPhase = new Map();

  targetPhaseIds.forEach((phaseId) => {
    blockTypeLookupByPhase.set(phaseId, getBlockTypeByIdForPhase(phaseId));
    groupTeamIdsLookupByPhase.set(phaseId, getGroupTeamIdsByBlockForPhase(phaseId));
  });

  const refereeCountByTeam = new Map();
  persistedMatches.forEach((match) => {
    const phaseId = Number(match.phase_id);
    if (targetPhaseIdSet.has(phaseId)) {
      return;
    }
    if (!isRefereeAssignableMatch(match)) {
      return;
    }

    const refereeId = Number(match.referee_id);
    if (!Number.isInteger(refereeId) || refereeId <= 0) {
      return;
    }
    refereeCountByTeam.set(refereeId, (refereeCountByTeam.get(refereeId) || 0) + 1);
  });

  persistedMatches = persistedMatches.map((match) => {
    const phaseId = Number(match.phase_id);
    if (!targetPhaseIdSet.has(phaseId)) {
      return match;
    }

    const hadReferee = Number(match.referee_id) > 0;
    if (hadReferee) {
      changedPhaseIds.add(phaseId);
    }
    return { ...match, referee_id: null };
  });

  const targetMatches = persistedMatches
    .filter((match) => targetPhaseIdSet.has(Number(match.phase_id)) && isRefereeAssignableMatch(match))
    .sort((a, b) => {
      const timeCmp = toMinutes(String(a.start_time || "00:00")) - toMinutes(String(b.start_time || "00:00"));
      if (timeCmp !== 0) {
        return timeCmp;
      }
      const phaseCmp =
        (phaseOrderIndexById.get(Number(a.phase_id)) ?? 9999) -
        (phaseOrderIndexById.get(Number(b.phase_id)) ?? 9999);
      if (phaseCmp !== 0) {
        return phaseCmp;
      }
      const fieldCmp = Number(a.field_number || 0) - Number(b.field_number || 0);
      if (fieldCmp !== 0) {
        return fieldCmp;
      }
      return Number(a.id || 0) - Number(b.id || 0);
    });

  let assignedCount = 0;

  targetMatches.forEach((match) => {
    const matchId = Number(match.id);
    const phaseId = Number(match.phase_id);
    const startTime = String(match.start_time || "");

    const blockedTeamIds = getPlayingTeamIdsAtTime(startTime, matchId);
    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    if (Number.isInteger(team1Id) && team1Id > 0) {
      blockedTeamIds.add(team1Id);
    }
    if (Number.isInteger(team2Id) && team2Id > 0) {
      blockedTeamIds.add(team2Id);
    }

    const blockedRefereeIds = getRefereeingTeamIdsAtTime(startTime, matchId);

    const candidateIds = [...eligibleRefereeTeamIds].filter(
      (teamId) => !blockedTeamIds.has(teamId) && !blockedRefereeIds.has(teamId)
    );

    const blockId = Number(match.block_id);
    const blockTypeById = blockTypeLookupByPhase.get(phaseId) || new Map();
    const blockType = String(blockTypeById.get(blockId) || "");
    const groupTeamIdsByBlock = groupTeamIdsLookupByPhase.get(phaseId) || new Map();
    const sameGroupPreferredIds =
      blockType === "gruppe" && groupTeamIdsByBlock.has(blockId)
        ? groupTeamIdsByBlock.get(blockId)
        : new Set();

    const refereeId = chooseRefereeTeamId(
      candidateIds,
      sameGroupPreferredIds,
      refereeCountByTeam,
      startTime,
      slotDurationMinutes
    );

    if (!Number.isInteger(refereeId) || refereeId <= 0) {
      return;
    }

    match.referee_id = refereeId;
    refereeCountByTeam.set(refereeId, (refereeCountByTeam.get(refereeId) || 0) + 1);
    assignedCount += 1;
    changedPhaseIds.add(phaseId);
  });

  return {
    changedPhaseIds,
    assignedCount,
    plannableCount: targetMatches.length,
    missingRefereePool: false,
  };
}

/**
 * Re-validates referee assignments after DnD for all phases that already use referees.
 * @returns {{changedPhaseIds: Set<number>, assignedCount: number, plannableCount: number, missingRefereePool: boolean}} Re-assignment result.
 */
function recheckRefereesAfterDnD() {
  const phasesWithReferees = [...new Set(
    persistedMatches
      .filter((match) => Number(match.referee_id) > 0)
      .map((match) => Number(match.phase_id))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
  )];

  if (phasesWithReferees.length === 0) {
    return {
      changedPhaseIds: new Set(),
      assignedCount: 0,
      plannableCount: 0,
      missingRefereePool: false,
    };
  }

  return assignRefereesForPhases(phasesWithReferees);
}

/**
 * Starts referee assignment for exactly one selected phase.
 * @returns {Promise<void>} Resolves when assignment and persistence are complete.
 */
async function handleAssignRefereesForSelectedPhase() {
  const selectedPhaseIds = readSelectedPhaseIds(tournamentPlanningUi.phaseSelect);
  if (selectedPhaseIds.length !== 1) {
    window.alert("Bitte genau eine Phase auswaehlen, um Schiedsrichter zuzuweisen.");
    return;
  }

  try {
    teamsWithIds = await loadTeamsWithIds();
  } catch {
    // Keep existing in-memory team map when backend read fails.
  }

  const targetPhaseId = Number(selectedPhaseIds[0]);
  const plannedPhaseMatches = persistedMatches.filter(
    (match) => Number(match.phase_id) === targetPhaseId && isRefereeAssignableMatch(match)
  );

  if (plannedPhaseMatches.length === 0) {
    window.alert("In der ausgewaehlten Phase sind keine Matches mit festen Teams vorhanden.");
    return;
  }

  const result = assignRefereesForPhases([targetPhaseId]);
  if (result.missingRefereePool) {
    window.alert("Keine Teams als Schiedsrichter markiert. Bitte zuerst in der Teamverwaltung markieren.");
    return;
  }

  try {
    await persistPhaseMatches(targetPhaseId);
  } catch {
    // Keep local state and still refresh UI.
  }

  renderAllMatchGrid();

  const phaseName =
    persistedPhases.find((phase) => Number(phase.id) === targetPhaseId)?.name ||
    `Phase ${targetPhaseId}`;
  window.alert(`Schiedsrichter zugewiesen: ${phaseName} (${result.assignedCount}/${result.plannableCount}).`);
}

tournamentPlanningUi.phaseSelect.addEventListener("change", () => {
  refreshTournamentPlanningGroups();
});

tournamentPlanningUi.generateButton.addEventListener("click", handleGenerateMatches);
tournamentPlanningUi.pauseButton.addEventListener("click", insertPauseSlot);
tournamentPlanningUi.assignRefereesButton.addEventListener("click", handleAssignRefereesForSelectedPhase);

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
  const deletePauseBtn = event.target.closest("[data-action='delete-pause']");
  if (deletePauseBtn) {
    const pauseMatchId = Number(deletePauseBtn.dataset.matchId);
    if (!Number.isInteger(pauseMatchId) || pauseMatchId <= 0) {
      return;
    }

    const confirmed = window.confirm("Diese Pause wirklich loeschen?");
    if (!confirmed) {
      return;
    }

    await deletePauseSlot(pauseMatchId);
    return;
  }

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

teamsUi.rowsContainer.addEventListener("change", () => {
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
    await initializePlacements();
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
