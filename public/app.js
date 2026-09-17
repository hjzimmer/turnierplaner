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
  loadAccessPasswordStatus,
  changeAccessPassword,
  loadScoringMode,
  loadTeams,
  loadTournamentSettings,
  savePhases,
  setAccessPassword,
  saveScoringMode,
  saveTeams,
  saveTournamentSettings,
  verifyAccessPassword,
} from "./data-store.js";
import {
  addPhaseColumn,
  addTeamRow,
  mountPhaseConfigLayout,
  mountScoringModeLayout,
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
  mountTournamentMatchesLayout,
  readSelectedPhaseIds,
  renderTournamentPlanningFields,
  renderTournamentPlanningGroups,
  renderTournamentPlanningPhases,
  renderTournamentMatchesPhaseControl,
  renderTournamentMatchesTable,
} from "./tournament-planning-layout.js";
import {
  mountTournamentResultsLayout,
  renderTournamentResultsOverview,
} from "./tournament-results-layout.js";
import { loadTournamentResultsOverview } from "./tournament-results-store.js";
import {
  loadTeamsWithIds,
  loadMatches,
  saveMatchesForPhase,
  deleteMatchesForPhase,
  loadStartedMatchPhasesState,
  saveStartedMatchPhasesState,
  loadMatchSets,
  saveMatchSets,
  deleteMatchSets,
} from "./tournament-planning-store.js";
import { buildScheduledMatches } from "./tournament-planning-calculations.js";
import { renderMatchGrid } from "./tournament-planning-layout.js";

const appLayout = document.getElementById("appLayout");
const navToggle = document.getElementById("navToggle");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const topbarLogo = document.getElementById("topbarLogo");
const topbarLogoImage = document.getElementById("topbarLogoImage");
const topbarTitle = document.querySelector(".title-block h1");
const topbarSubtitle = document.querySelector(".title-block p");
const menuGroups = [...document.querySelectorAll(".menu-group")];
const levelOneButtons = [...document.querySelectorAll(".menu-btn.level-1")].filter(
  (button) => button.dataset.action !== "login"
);
const menuButtons = [...document.querySelectorAll(".menu-btn.level-2")];
const sections = [...document.querySelectorAll(".content-section")];
const loginMenuGroup = document.getElementById("loginMenuGroup");
const loginMenuButton = document.getElementById("loginMenuButton");
const protectedMenuGroups = menuGroups.filter(
  (group) => group.id !== "resultsMenuGroup" && group.id !== "loginMenuGroup"
);
const LAST_ACTIVE_VIEW_STORAGE_KEY = "turnierplaner-active-view";
const settingsMount = document.getElementById("tournamentSettingsMount");
const teamsMount = document.getElementById("teamsMount");
const phaseConfigMount = document.getElementById("phaseConfigMount");
const scoringModeMount = document.getElementById("scoringModeMount");
const placementsMount = document.getElementById("placementsMount");
const tournamentPlanningMount = document.getElementById("tournamentPlanningMount");
const tournamentOverviewMount = document.getElementById("tournamentOverviewMount");
const tournamentMatchesMount = document.getElementById("tournamentMatchesMount");
const tournamentResultsMount = document.getElementById("tournamentResultsMount");

const mobileQuery = window.matchMedia("(max-width: 880px)");

const settingsUi = mountTournamentSettingsLayout(settingsMount);
const teamsUi = mountTeamsLayout(teamsMount);
const phasesUi = mountPhaseConfigLayout(phaseConfigMount);
const scoringModeUi = mountScoringModeLayout(scoringModeMount);
const tournamentPlanningUi = mountTournamentPlanningLayout(tournamentPlanningMount, {
  placeholderText: "Spielplanung wird hier angezeigt",
});
const tournamentOverviewUi = mountTournamentPlanningLayout(tournamentOverviewMount, {
  placeholderText: "Spielplan wird hier angezeigt",
  readOnly: true,
});
const tournamentPlanningUis = [tournamentPlanningUi, tournamentOverviewUi];
const editableTournamentPlanningUis = [tournamentPlanningUi];
const tournamentMatchesUi = mountTournamentMatchesLayout(tournamentMatchesMount);
const tournamentResultsUi = mountTournamentResultsLayout(tournamentResultsMount);
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
let startedMatchPhaseIds = new Set();
let activeStartedMatchPhaseId = null;
let startedPhaseStateSaveInFlight = false;
let startedPhaseStateSaveQueued = false;
let activeMatchResultDialog = null;
let persistedScoringModeKey = "vereinfachter_turniermodus";

const UNPROTECTED_VIEW_NAMES = new Set(["turnierergebnisse", "turnieruebersicht"]);
const PROTECTED_ACCESS_STORAGE_KEY = "turnierplaner-protected-access";
const PROTECTED_ACCESS_COOKIE_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;

// Initialized from a cookie so a reload or browser restart keeps the login unlocked for its validity period.
let hasUnlockedProtectedViews = loadProtectedAccessFlag();

/**
 * Iterates over all mounted tournament planning views.
 * @param {(ui: object) => void} callback Callback for each mounted planning UI.
 * @returns {void}
 */
function forEachTournamentPlanningUi(callback) {
  tournamentPlanningUis.forEach(callback);
}

/**
 * Iterates over all editable tournament planning views.
 * @param {(ui: object) => void} callback Callback for each editable planning UI.
 * @returns {void}
 */
function forEachEditableTournamentPlanningUi(callback) {
  editableTournamentPlanningUis.forEach(callback);
}

/**
 * Returns current started-phase state payload for persistence.
 * @returns {{ startedPhaseIds: Array<number>, activePhaseId: number|null }} Serializable state payload.
 */
function getStartedMatchPhaseStatePayload() {
  return {
    startedPhaseIds: [...startedMatchPhaseIds]
      .map((phaseId) => Number(phaseId))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0),
    activePhaseId:
      Number.isInteger(activeStartedMatchPhaseId) && activeStartedMatchPhaseId > 0
        ? Number(activeStartedMatchPhaseId)
        : null,
  };
}

/**
 * Persists started-phase state for the "Alle Matches" page in the backend.
 * Sequentializes concurrent saves and runs one queued save afterwards if needed.
 * @returns {Promise<void>} Resolves when save flow is complete.
 */
async function persistStartedMatchPhaseState() {
  if (startedPhaseStateSaveInFlight) {
    startedPhaseStateSaveQueued = true;
    return;
  }

  startedPhaseStateSaveInFlight = true;
  try {
    const payload = getStartedMatchPhaseStatePayload();
    await saveStartedMatchPhasesState(payload.startedPhaseIds, payload.activePhaseId);
  } catch {
    // Keep runtime state if persistence fails.
  } finally {
    startedPhaseStateSaveInFlight = false;
    if (startedPhaseStateSaveQueued) {
      startedPhaseStateSaveQueued = false;
      await persistStartedMatchPhaseState();
    }
  }
}

/**
 * Restores started-phase state for the "Alle Matches" page from backend.
 * @returns {Promise<void>} Resolves when restore flow is complete.
 */
async function restoreStartedMatchPhaseState() {
  try {
    const state = await loadStartedMatchPhasesState();
    startedMatchPhaseIds = new Set(state.startedPhaseIds || []);
    activeStartedMatchPhaseId = Number.isInteger(Number(state.activePhaseId)) && Number(state.activePhaseId) > 0
      ? Number(state.activePhaseId)
      : null;
  } catch {
    startedMatchPhaseIds = new Set();
    activeStartedMatchPhaseId = null;
  }
}

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
 * Updates the topbar logo from tournament settings.
 * @param {object} settings Settings object that may contain logo and tournament_name.
 * @returns {void}
 */
function updateTopbarLogo(settings) {
  if (!topbarLogo || !topbarLogoImage) {
    return;
  }

  const logoUrl = String(settings?.logo || "").trim();
  if (!logoUrl) {
    topbarLogo.hidden = true;
    topbarLogoImage.removeAttribute("src");
    topbarLogoImage.removeAttribute("alt");
    return;
  }

  const tournamentName = String(settings?.tournament_name || "").trim();
  topbarLogoImage.alt = tournamentName ? `Logo: ${tournamentName}` : "Turnierlogo";
  topbarLogoImage.src = logoUrl;
  topbarLogo.hidden = false;
}

/**
 * Updates the topbar title from tournament settings.
 * @param {object} settings Settings object that may contain tournament_name.
 * @returns {void}
 */
function updateTopbarTitle(settings) {
  if (!topbarTitle) {
    return;
  }

  const tournamentName = String(settings?.tournament_name || "").trim();
  topbarTitle.textContent = tournamentName || "Turnier";
}

/**
 * Converts an ISO date string (YYYY-MM-DD) to a German display date.
 * @param {string} isoDateValue ISO date value.
 * @returns {string} Formatted date or "-" if invalid.
 */
function formatGermanDate(isoDateValue) {
  const value = String(isoDateValue || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "-";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return "-";
  }
  return `${day}.${month}.${year}`;
}

/**
 * Updates the subtitle under the topbar title with date and start time.
 * @param {object} settings Settings object that may contain tournament_date and tournament_time.
 * @returns {void}
 */
function updateTopbarSubtitle(settings) {
  if (!topbarSubtitle) {
    return;
  }

  const dateLabel = formatGermanDate(settings?.tournament_date);
  const timeValue = String(settings?.tournament_time || "").trim();
  const timeLabel = timeValue || "-";
  topbarSubtitle.textContent = `${dateLabel} | ${timeLabel}`;
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
 * Returns all currently available view names from menu buttons and screen sections.
 * @returns {Set<string>} Set with valid view names.
 */
function getAvailableViewNames() {
  const names = new Set();

  menuButtons.forEach((button) => {
    const viewName = String(button.dataset.view || "").trim();
    if (viewName) {
      names.add(viewName);
    }
  });

  sections.forEach((section) => {
    const screenName = String(section.dataset.screen || "").trim();
    if (screenName) {
      names.add(screenName);
    }
  });

  return names;
}

/**
 * Returns the default fallback view name.
 * @returns {string} Default view name.
 */
function getDefaultViewName() {
  return "turnierergebnisse";
}

/**
 * Resolves a candidate view name to a valid existing view.
 * @param {string} candidateViewName Candidate view name.
 * @returns {string} Valid resolved view name.
 */
function resolveViewName(candidateViewName) {
  const normalizedCandidate = String(candidateViewName || "").trim();
  const availableViews = getAvailableViewNames();
  if (availableViews.has(normalizedCandidate)) {
    return normalizedCandidate;
  }
  return getDefaultViewName();
}

/**
 * Persists the active view name in local storage.
 * @param {string} viewName Active view name to persist.
 * @returns {void}
 */
function persistActiveViewName(viewName) {
  try {
    window.localStorage.setItem(LAST_ACTIVE_VIEW_STORAGE_KEY, String(viewName || ""));
  } catch {
    // Ignore storage errors (private mode, disabled storage, etc.).
  }
}

/**
 * Loads the last persisted active view name from local storage.
 * @returns {string|null} Persisted view name or null when unavailable.
 */
function loadPersistedActiveViewName() {
  try {
    const storedView = window.localStorage.getItem(LAST_ACTIVE_VIEW_STORAGE_KEY);
    return storedView ? String(storedView) : null;
  } catch {
    return null;
  }
}

/**
 * Returns whether one view requires password authorization.
 * @param {string} viewName View name to inspect.
 * @returns {boolean} True when the view is password-protected.
 */
function isProtectedViewName(viewName) {
  const normalizedViewName = String(viewName || "").trim();
  return normalizedViewName.length > 0 && !UNPROTECTED_VIEW_NAMES.has(normalizedViewName);
}

/**
 * Reads one cookie value by name from document.cookie.
 * @param {string} name Cookie name.
 * @returns {string|null} Cookie value or null when not present.
 */
function getCookieValue(name) {
  const cookiePrefix = `${encodeURIComponent(name)}=`;
  const cookieEntries = document.cookie ? document.cookie.split("; ") : [];
  const match = cookieEntries.find((entry) => entry.startsWith(cookiePrefix));
  return match ? decodeURIComponent(match.slice(cookiePrefix.length)) : null;
}

/**
 * Writes or clears one cookie with an optional max-age in seconds.
 * @param {string} name Cookie name.
 * @param {string} value Cookie value.
 * @param {number} maxAgeSeconds Cookie lifetime in seconds; use 0 to delete.
 * @returns {void}
 */
function setCookieValue(name, value, maxAgeSeconds) {
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

/**
 * Loads a persisted protected-access unlock flag from a 3-day cookie.
 * @returns {boolean} True when protected access is already unlocked.
 */
function loadProtectedAccessFlag() {
  try {
    return getCookieValue(PROTECTED_ACCESS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persists the protected-access unlock flag in a cookie valid for 3 days, or clears it.
 * @param {boolean} value Unlock state to persist.
 * @returns {void}
 */
function persistProtectedAccessFlag(value) {
  try {
    if (value) {
      setCookieValue(PROTECTED_ACCESS_STORAGE_KEY, "1", PROTECTED_ACCESS_COOKIE_MAX_AGE_SECONDS);
      return;
    }
    setCookieValue(PROTECTED_ACCESS_STORAGE_KEY, "", 0);
  } catch {
    // Ignore cookie write errors.
  }
}

/**
 * Shows protected menu groups and hides the Login entry once unlocked, or the reverse when locked.
 * @returns {void}
 */
function updateProtectedMenuVisibility() {
  protectedMenuGroups.forEach((group) => {
    group.hidden = !hasUnlockedProtectedViews;
  });
  if (loginMenuGroup) {
    loginMenuGroup.hidden = hasUnlockedProtectedViews;
  }
}

/**
 * Applies one resolved view to menu and section visibility state.
 * @param {string} targetViewName Resolved target view identifier.
 * @returns {void}
 */
function applyActiveView(targetViewName) {
  menuButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === targetViewName);
  });

  sections.forEach((section) => {
    const isVisible = section.dataset.screen === targetViewName;
    section.hidden = !isVisible;
  });

  persistActiveViewName(targetViewName);

  if (targetViewName === "turnierplanung-matches") {
    renderAllTournamentMatchesTable();
  }

  if (targetViewName === "turnierergebnisse") {
    loadAndRenderTournamentResultsOverview();
  }

  if (isMobile()) {
    appLayout.classList.remove("is-open-mobile");
    syncBackdrop();
  }
}

/**
 * Shows one password input dialog inside the app shell.
 * @param {{title: string, message: string, confirmText?: string, cancelText?: string}} options Dialog configuration.
 * @returns {Promise<string|null>} Entered password or null when cancelled.
 */
function showPasswordDialog(options) {
  const title = String(options?.title || "Passwort");
  const message = String(options?.message || "Bitte Passwort eingeben.");
  const confirmText = String(options?.confirmText || "OK");
  const cancelText = String(options?.cancelText || "Abbrechen");

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.background = "rgba(0, 0, 0, 0.45)";
    backdrop.style.display = "flex";
    backdrop.style.alignItems = "center";
    backdrop.style.justifyContent = "center";
    backdrop.style.zIndex = "9999";

    const card = document.createElement("div");
    card.style.width = "min(460px, calc(100vw - 2rem))";
    card.style.background = "#fff";
    card.style.borderRadius = "12px";
    card.style.padding = "1rem";
    card.style.boxShadow = "0 16px 40px rgba(0, 0, 0, 0.25)";

    const heading = document.createElement("h3");
    heading.textContent = title;
    heading.style.margin = "0 0 0.5rem";

    const text = document.createElement("p");
    text.textContent = message;
    text.style.margin = "0 0 0.75rem";

    const input = document.createElement("input");
    input.type = "password";
    input.autocomplete = "new-password";
    input.style.width = "100%";
    input.style.border = "1px solid #c7cfdd";
    input.style.borderRadius = "8px";
    input.style.padding = "0.55rem 0.65rem";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";
    actions.style.gap = "0.5rem";
    actions.style.marginTop = "0.85rem";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = cancelText;

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.textContent = confirmText;

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    card.appendChild(heading);
    card.appendChild(text);
    card.appendChild(input);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    let isClosed = false;

    /**
     * Closes and removes the password dialog.
     * @param {string|null} value Dialog result value.
     * @returns {void}
     */
    function closeDialog(value) {
      if (isClosed) {
        return;
      }
      isClosed = true;
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      resolve(value);
    }

    /**
     * Handles keyboard shortcuts for the password dialog.
     * @param {KeyboardEvent} event Keyboard event.
     * @returns {void}
     */
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog(null);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        closeDialog(String(input.value || ""));
      }
    }

    document.addEventListener("keydown", onKeyDown);
    cancelButton.addEventListener("click", () => closeDialog(null));
    confirmButton.addEventListener("click", () => closeDialog(String(input.value || "")));

    requestAnimationFrame(() => {
      input.focus();
    });
  });
}

/**
 * Guides the user through creating an initial app password.
 * @returns {Promise<boolean>} True when password setup is completed.
 */
async function ensureInitialPasswordIsSet() {
  while (true) {
    const firstInput = await showPasswordDialog({
      title: "Passwort festlegen",
      message: "Kein Passwort gesetzt. Bitte jetzt ein Passwort vergeben.",
      confirmText: "Speichern",
    });
    if (firstInput === null) {
      return false;
    }

    const password = String(firstInput);
    if (password.length === 0) {
      window.alert("Passwort darf nicht leer sein.");
      continue;
    }

    const confirmInput = await showPasswordDialog({
      title: "Passwort bestaetigen",
      message: "Bitte Passwort erneut eingeben.",
      confirmText: "Bestaetigen",
    });
    if (confirmInput === null) {
      return false;
    }

    if (String(confirmInput) !== password) {
      window.alert("Passwoerter stimmen nicht ueberein.");
      continue;
    }

    try {
      await setAccessPassword(password);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Passwort konnte nicht gespeichert werden.");
      return false;
    }
  }
}

/**
 * Prompts until a valid password is entered or the user cancels.
 * @returns {Promise<boolean>} True when password verification succeeded.
 */
async function verifyPasswordWithPromptLoop() {
  while (true) {
    const input = await showPasswordDialog({
      title: "Passwort erforderlich",
      message: "Bitte Passwort eingeben, um fortzufahren.",
      confirmText: "Pruefen",
    });
    if (input === null) {
      return false;
    }

    const password = String(input);
    if (password.length === 0) {
      window.alert("Passwort darf nicht leer sein.");
      continue;
    }

    try {
      const result = await verifyAccessPassword(password);
      if (result.ok) {
        return true;
      }
      window.alert("Falsches Passwort.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Passwort konnte nicht geprueft werden.");
      return false;
    }
  }
}

/**
 * Ensures protected views can only be opened after successful password setup/verification.
 * @returns {Promise<boolean>} True when protected access is unlocked.
 */
async function ensureProtectedAccessGranted() {
  if (hasUnlockedProtectedViews) {
    return true;
  }

  const unlockedFromSession = loadProtectedAccessFlag();
  if (unlockedFromSession) {
    hasUnlockedProtectedViews = true;
    updateProtectedMenuVisibility();
    return true;
  }

  let status;
  try {
    status = await loadAccessPasswordStatus();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Passwort-Status konnte nicht geladen werden.");
    return false;
  }

  if (!status.is_set) {
    const wasSet = await ensureInitialPasswordIsSet();
    if (!wasSet) {
      return false;
    }
  }

  const isVerified = await verifyPasswordWithPromptLoop();
  if (!isVerified) {
    return false;
  }

  hasUnlockedProtectedViews = true;
  persistProtectedAccessFlag(true);
  updateProtectedMenuVisibility();
  return true;
}

/**
 * Activates one content view and updates active menu styling.
 * @param {string} viewName Target view identifier.
 * @returns {Promise<boolean>} True when the view was opened.
 */
async function openView(viewName) {
  const targetViewName = resolveViewName(viewName);
  const requiresAccess = isProtectedViewName(targetViewName);

  if (requiresAccess) {
    let isGranted = false;
    try {
      isGranted = await ensureProtectedAccessGranted();
    } catch {
      isGranted = false;
    }
    if (!isGranted) {
      applyActiveView("turnierergebnisse");
      return false;
    }
  }

  applyActiveView(targetViewName);
  return true;
}

/**
 * Returns the currently visible content view key.
 * @returns {string|null} Active view key or null when none is visible.
 */
function getActiveViewName() {
  const activeSection = sections.find((section) => !section.hidden);
  return activeSection ? String(activeSection.dataset.screen || "") : null;
}

/**
 * Loads and renders the tournament results overview page.
 * @returns {Promise<void>} Resolves after render attempt.
 */
async function loadAndRenderTournamentResultsOverview() {
  if (!tournamentResultsUi?.content) {
    return;
  }

  tournamentResultsUi.content.innerHTML = "";
  const loading = document.createElement("div");
  loading.className = "placeholder-box";
  loading.textContent = "Turnierergebnisse werden geladen...";
  tournamentResultsUi.content.appendChild(loading);

  try {
    const overview = await loadTournamentResultsOverview();
    renderTournamentResultsOverview(tournamentResultsUi.content, overview);
  } catch (error) {
    tournamentResultsUi.content.innerHTML = "";
    const errorBox = document.createElement("div");
    errorBox.className = "placeholder-box";
    errorBox.textContent = error instanceof Error
      ? error.message
      : "Turnierergebnisse konnten nicht geladen werden.";
    tournamentResultsUi.content.appendChild(errorBox);
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
    updateTopbarTitle(loaded);
    updateTopbarSubtitle(loaded);
    updateTopbarLogo(loaded);
    setSaveStatus(settingsUi.saveStatus, "Einstellungen geladen");
    updateDirtyState();
  } catch (error) {
    persistedSettings = getDefaultTournamentSettings();
    writeTournamentSettingsToForm(settingsUi.form, persistedSettings);
    updateTopbarTitle(persistedSettings);
    updateTopbarSubtitle(persistedSettings);
    updateTopbarLogo(persistedSettings);
    setSaveStatus(settingsUi.saveStatus, "Standardwerte geladen", true);
    updateDirtyState();
  }
}

/**
 * Reads the currently selected scoring mode from the scoring mode form.
 * @returns {"vereinfachter_turniermodus"|"offizieller_modus"} Selected scoring mode key.
 */
function readSelectedScoringModeKey() {
  const value = new FormData(scoringModeUi.form).get("mode_key");
  return value === "offizieller_modus" ? "offizieller_modus" : "vereinfachter_turniermodus";
}

/**
 * Applies a scoring mode key selection to the scoring mode form.
 * @param {"vereinfachter_turniermodus"|"offizieller_modus"} modeKey Scoring mode key to apply.
 * @returns {void}
 */
function writeScoringModeToForm(modeKey) {
  const normalizedMode = modeKey === "offizieller_modus" ? "offizieller_modus" : "vereinfachter_turniermodus";
  const radio = scoringModeUi.form.querySelector(`input[name="mode_key"][value="${normalizedMode}"]`);
  if (radio) {
    radio.checked = true;
  }
}

/**
 * Updates save-state UI for the scoring mode page.
 * @returns {void}
 */
function updateScoringModeDirtyState() {
  const draftMode = readSelectedScoringModeKey();
  const isDirty = draftMode !== persistedScoringModeKey;
  setSaveButtonState(scoringModeUi.saveButton, isDirty);
  if (isDirty) {
    setSaveStatus(scoringModeUi.saveStatus, "Ungespeicherte Aenderungen");
  } else {
    setSaveStatus(scoringModeUi.saveStatus, "Keine Aenderungen");
  }
}

/**
 * Loads persisted scoring mode and initializes page state.
 * @returns {Promise<void>} Resolves once scoring mode has been initialized.
 */
async function initializeScoringMode() {
  try {
    const loaded = await loadScoringMode();
    persistedScoringModeKey = loaded.mode_key;
    writeScoringModeToForm(persistedScoringModeKey);
    setSaveStatus(scoringModeUi.saveStatus, "Wertungsmodus geladen");
    updateScoringModeDirtyState();
  } catch (error) {
    persistedScoringModeKey = "vereinfachter_turniermodus";
    writeScoringModeToForm(persistedScoringModeKey);
    setSaveStatus(scoringModeUi.saveStatus, "Standardwert geladen", true);
    updateScoringModeDirtyState();
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

  refreshTournamentPlanningGroups();
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
  forEachEditableTournamentPlanningUi((ui) => {
    const selectedPhaseIds = readSelectedPhaseIds(ui.phaseSelect);
    renderTournamentPlanningGroups(ui.groupSelect, selectedPhaseIds, phaseBlocksByPhase, persistedPhases);
  });
}

/**
 * Re-renders the match grid with current persisted planning data.
 * @returns {void}
 */
function renderAllMatchGrid() {
  forEachTournamentPlanningUi((ui) => {
    renderMatchGrid(ui.gridArea, persistedMatches, persistedPhases, teamsWithIds, {
      readOnly: ui.readOnly === true,
    });
  });
  renderAllTournamentMatchesTable();
}

/**
 * Returns phase ids that currently have planned matches in persisted phase order.
 * @returns {Array<number>} Ordered phase ids with matches.
 */
function getPlannedPhaseIdsInOrder() {
  const phaseIndexById = new Map(persistedPhases.map((phase, index) => [Number(phase.id), index]));
  const phaseIds = [...new Set(
    persistedMatches
      .map((match) => Number(match.phase_id))
      .filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
  )];

  return phaseIds.sort(
    (leftId, rightId) =>
      (phaseIndexById.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
      (phaseIndexById.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  );
}

/**
 * Synchronizes local started-phase state with currently planned phase ids.
 * @param {Array<number>} plannedPhaseIds Ordered phase ids with matches.
 * @returns {void}
 */
function syncStartedMatchPhaseState(plannedPhaseIds) {
  const beforeStarted = [...startedMatchPhaseIds].sort((a, b) => a - b).join(",");
  const beforeActive = Number.isInteger(activeStartedMatchPhaseId) ? Number(activeStartedMatchPhaseId) : null;

  const plannedSet = new Set(plannedPhaseIds);
  startedMatchPhaseIds = new Set(
    [...startedMatchPhaseIds].filter((phaseId) => plannedSet.has(Number(phaseId)))
  );

  if (!Number.isInteger(activeStartedMatchPhaseId) || !plannedSet.has(Number(activeStartedMatchPhaseId))) {
    activeStartedMatchPhaseId = null;
  }

  if (activeStartedMatchPhaseId === null && startedMatchPhaseIds.size > 0) {
    activeStartedMatchPhaseId = plannedPhaseIds.find((phaseId) => startedMatchPhaseIds.has(phaseId)) || null;
  }

  const afterStarted = [...startedMatchPhaseIds].sort((a, b) => a - b).join(",");
  const afterActive = Number.isInteger(activeStartedMatchPhaseId) ? Number(activeStartedMatchPhaseId) : null;
  if (beforeStarted !== afterStarted || beforeActive !== afterActive) {
    void persistStartedMatchPhaseState();
  }
}

/**
 * Returns the next not-yet-started phase id from planned phase order.
 * @param {Array<number>} plannedPhaseIds Ordered phase ids with matches.
 * @returns {number|null} Next phase id to start or null.
 */
function getNextNotStartedPhaseId(plannedPhaseIds) {
  return plannedPhaseIds.find((phaseId) => !startedMatchPhaseIds.has(phaseId)) || null;
}

/**
 * Starts a phase for result entry and marks it active.
 * @param {number|null} phaseId Phase id to start.
 * @returns {Promise<boolean>} True when start was applied.
 */
async function startPhaseForResults(phaseId) {
  const numericPhaseId = Number(phaseId);
  if (!Number.isInteger(numericPhaseId) || numericPhaseId <= 0) {
    return false;
  }

  const refereeCheck = await ensurePhaseRefereesBeforeStart(numericPhaseId);
  if (!refereeCheck.ok) {
    if (refereeCheck.reason === "missing-referee-pool") {
      window.alert("Phase kann nicht gestartet werden: Keine Teams als Schiedsrichter markiert.");
    } else if (refereeCheck.reason === "persist-failed") {
      window.alert("Phase kann nicht gestartet werden: Schiedsrichterzuweisungen konnten nicht gespeichert werden.");
    }
    return false;
  }

  startedMatchPhaseIds.add(numericPhaseId);
  activeStartedMatchPhaseId = numericPhaseId;
  await persistStartedMatchPhaseState();
  renderAllMatchGrid();

  if (refereeCheck.unassignedCount > 0) {
    window.alert(
      `Hinweis: In ${refereeCheck.unassignedCount} Spiel(en) der gestarteten Phase konnte kein Schiedsrichter zugewiesen werden.`
    );
  }

  return true;
}

/**
 * Returns whether all non-pause matches of a phase are completed.
 * @param {number|null} phaseId Phase id to evaluate.
 * @returns {boolean} True when every real match in the phase is finished.
 */
function isPhaseCompleted(phaseId) {
  const numericPhaseId = Number(phaseId);
  if (!Number.isInteger(numericPhaseId) || numericPhaseId <= 0) {
    return false;
  }

  const phaseMatches = persistedMatches.filter(
    (match) =>
      Number(match.phase_id) === numericPhaseId &&
      String(match.entry_type || "match") !== "pause"
  );
  if (phaseMatches.length === 0) {
    return false;
  }

  return phaseMatches.every((match) => Number(match.is_finished) > 0);
}

/**
 * Returns display name for a phase id.
 * @param {number|null} phaseId Phase id.
 * @returns {string} Display name.
 */
function getPhaseDisplayName(phaseId) {
  const numericPhaseId = Number(phaseId);
  const phaseName = persistedPhases.find((phase) => Number(phase.id) === numericPhaseId)?.name;
  const trimmedPhaseName = String(phaseName || "").trim();
  if (trimmedPhaseName) {
    return trimmedPhaseName.replace(/^phase\s+/i, "").trim();
  }
  return String(numericPhaseId);
}

/**
 * Returns whether result actions are allowed for the given phase.
 * Only the currently active started phase can be edited.
 * @param {number|null} phaseId Phase id to check.
 * @returns {boolean} True when result actions are allowed.
 */
function canEditPhaseResults(phaseId) {
  const numericPhaseId = Number(phaseId);
  const activePhaseId = Number(activeStartedMatchPhaseId);
  return (
    Number.isInteger(numericPhaseId) &&
    numericPhaseId > 0 &&
    Number.isInteger(activePhaseId) &&
    activePhaseId > 0 &&
    numericPhaseId === activePhaseId
  );
}

/**
 * Returns whether match schedule changes are locked for a phase.
 * @param {number} phaseId Phase id to check.
 * @returns {boolean} True when phase has been started and schedule is locked.
 */
function isPhaseScheduleLocked(phaseId) {
  return startedMatchPhaseIds.has(Number(phaseId));
}

/**
 * Resolves a readable team label for one id.
 * @param {number|null} teamId Team id to resolve.
 * @param {string|null|undefined} teamRef Team reference fallback.
 * @param {Map<number, string>} teamNameById Team lookup map.
 * @returns {string} Display label.
 */
function getTeamNameLabel(teamId, teamRef, teamNameById) {
  const numericId = Number(teamId);
  if (Number.isInteger(numericId) && numericId > 0) {
    return teamNameById.get(numericId) || `Team #${numericId}`;
  }
  const fallbackRef = String(teamRef || "").trim();
  if (fallbackRef) {
    return fallbackRef;
  }
  return "?";
}

/**
 * Builds available referee option entries for one match and time slot.
 * @param {object} match Match to edit.
 * @param {Map<number, string>} teamNameById Team id to display name lookup.
 * @returns {Array<{id: number, name: string, unavailable: boolean}>} Dropdown options.
 */
function getRefereeOptionsForMatch(match, teamNameById) {
  if (!isRefereeAssignableMatch(match)) {
    return [];
  }

  const matchId = Number(match.id);
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
  const eligibleRefereeIds = getEligibleRefereeTeamIds();

  const availableIds = [...eligibleRefereeIds]
    .filter((teamId) => !blockedTeamIds.has(teamId) && !blockedRefereeIds.has(teamId))
    .sort((leftId, rightId) => {
      const leftName = teamNameById.get(leftId) || `Team #${leftId}`;
      const rightName = teamNameById.get(rightId) || `Team #${rightId}`;
      return leftName.localeCompare(rightName, "de");
    });

  const options = availableIds.map((teamId) => ({
    id: teamId,
    name: teamNameById.get(teamId) || `Team #${teamId}`,
    unavailable: false,
  }));

  const currentRefereeId = Number(match.referee_id);
  if (
    Number.isInteger(currentRefereeId) &&
    currentRefereeId > 0 &&
    !availableIds.includes(currentRefereeId)
  ) {
    options.unshift({
      id: currentRefereeId,
      name: teamNameById.get(currentRefereeId) || `Team #${currentRefereeId}`,
      unavailable: true,
    });
  }

  return options;
}

/**
 * Builds temporary fairness overview rows for referee assignments across the tournament.
 * @param {Map<number, string>} teamNameById Team id to display name lookup.
 * @returns {{rows: Array<{teamName: string, assignments: number, target: number, delta: number, conflicts: number}>, averageAssignments: number}} Overview payload.
 */
function buildTemporaryRefereeLoadRows(teamNameById) {
  const eligibleRefereeIds = [...getEligibleRefereeTeamIds()];
  if (eligibleRefereeIds.length === 0) {
    return { rows: [], averageAssignments: 0 };
  }

  const countsByTeam = new Map(eligibleRefereeIds.map((teamId) => [teamId, 0]));
  const conflictsByTeam = new Map(eligibleRefereeIds.map((teamId) => [teamId, 0]));
  let totalAssignments = 0;

  persistedMatches.forEach((match) => {
    if (!isRefereeAssignableMatch(match)) {
      return;
    }

    const refereeId = Number(match.referee_id);
    if (!countsByTeam.has(refereeId)) {
      return;
    }

    totalAssignments += 1;
    countsByTeam.set(refereeId, (countsByTeam.get(refereeId) || 0) + 1);

    const startTime = String(match.start_time || "");
    const sameSlotPlayingTeamIds = getPlayingTeamIdsAtTime(startTime);
    if (sameSlotPlayingTeamIds.has(refereeId)) {
      conflictsByTeam.set(refereeId, (conflictsByTeam.get(refereeId) || 0) + 1);
    }

    const sameSlotAssignments = persistedMatches.filter((entry) => {
      if (!isRefereeAssignableMatch(entry)) {
        return false;
      }
      if (String(entry.start_time || "") !== startTime) {
        return false;
      }
      return Number(entry.referee_id) === refereeId;
    }).length;
    if (sameSlotAssignments > 1) {
      conflictsByTeam.set(refereeId, (conflictsByTeam.get(refereeId) || 0) + 1);
    }
  });

  const averageAssignments = totalAssignments / eligibleRefereeIds.length;
  const rows = eligibleRefereeIds
    .map((teamId) => {
      const assignments = countsByTeam.get(teamId) || 0;
      const conflicts = conflictsByTeam.get(teamId) || 0;
      const delta = assignments - averageAssignments;
      return {
        teamName: teamNameById.get(teamId) || `Team #${teamId}`,
        assignments,
        target: averageAssignments,
        delta,
        conflicts,
      };
    })
    .sort((left, right) => {
      if (left.assignments !== right.assignments) {
        return left.assignments - right.assignments;
      }
      return left.teamName.localeCompare(right.teamName, "de");
    });

  return { rows, averageAssignments };
}

/**
 * Renders the tabular all-matches page in tournament planning.
 * @returns {void}
 */
function renderAllTournamentMatchesTable() {
  if (!tournamentMatchesUi?.tableArea) {
    return;
  }

  const plannedPhaseIds = getPlannedPhaseIdsInOrder();
  syncStartedMatchPhaseState(plannedPhaseIds);

  const activePhaseId = Number(activeStartedMatchPhaseId);
  const hasActivePhase = Number.isInteger(activePhaseId) && activePhaseId > 0;
  const activePhaseCompleted = hasActivePhase ? isPhaseCompleted(activePhaseId) : false;
  const nextPhaseId = getNextNotStartedPhaseId(plannedPhaseIds);
  const hasMatches = plannedPhaseIds.length > 0;

  let controlMode = "done";
  let controlPhaseId = null;
  let controlHint = "";
  let controlButtonText = "";
  let showNextPhaseButton = false;
  let nextPhaseButtonText = "";
  let nextPhaseControlId = null;

  if (!hasMatches) {
    controlMode = "done";
  } else if (hasActivePhase) {
    if (activePhaseCompleted && Number.isInteger(nextPhaseId) && nextPhaseId > 0) {
      controlMode = "reset";
      controlPhaseId = activePhaseId;
      controlButtonText = `⏹ ${getPhaseDisplayName(activePhaseId)} stoppen`;
      controlHint = `Phase ${getPhaseDisplayName(activePhaseId)} ist abgeschlossen. Du kannst jetzt die Folgephase starten oder die aktuelle Phase noch stoppen.`;
      showNextPhaseButton = true;
      nextPhaseControlId = nextPhaseId;
      nextPhaseButtonText = `▶ ${getPhaseDisplayName(nextPhaseId)} starten`;
    } else if (activePhaseCompleted) {
      controlMode = "reset";
      controlPhaseId = activePhaseId;
      controlButtonText = `⏹ ${getPhaseDisplayName(activePhaseId)} stoppen`;
      controlHint = `Phase ${getPhaseDisplayName(activePhaseId)} ist abgeschlossen. Keine weitere Folgephase vorhanden.`;
    } else {
      controlMode = "reset";
      controlPhaseId = activePhaseId;
      controlButtonText = `⏹ ${getPhaseDisplayName(activePhaseId)} stoppen`;
      controlHint = "Zuruecksetzen betrifft die aktuell gestartete Phase.";
    }
  } else if (Number.isInteger(nextPhaseId) && nextPhaseId > 0) {
    controlMode = "start";
    controlPhaseId = nextPhaseId;
    controlButtonText = `▶ ${getPhaseDisplayName(nextPhaseId)} starten`;
    controlHint = "Spielaktionen bleiben gesperrt, bis die Phase gestartet wurde.";
  }

  renderTournamentMatchesPhaseControl(
    tournamentMatchesUi.phaseToggleButton,
    tournamentMatchesUi.nextPhaseStartButton,
    tournamentMatchesUi.phaseToggleHint,
    {
      mode: controlMode,
      phaseName: controlPhaseId ? getPhaseDisplayName(controlPhaseId) : "",
      hasMatches,
      buttonText: controlButtonText,
      hintText: controlHint,
      showNextPhaseButton,
      nextPhaseButtonText,
      nextPhaseId: nextPhaseControlId,
    }
  );

  const teamNameById = new Map(
    teamsWithIds
      .map((team) => [Number(team.id), team.name])
      .filter(([teamId]) => Number.isInteger(teamId) && teamId > 0)
  );

  const phaseNameById = new Map(
    persistedPhases
      .map((phase) => [Number(phase.id), String(phase.name || "")])
      .filter(([phaseId]) => Number.isInteger(phaseId) && phaseId > 0)
  );

  const sortedMatches = [...persistedMatches].sort((left, right) => {
    const timeCmp = toMinutes(String(left.start_time || "00:00")) - toMinutes(String(right.start_time || "00:00"));
    if (timeCmp !== 0) {
      return timeCmp;
    }
    const fieldCmp = Number(left.field_number || 0) - Number(right.field_number || 0);
    if (fieldCmp !== 0) {
      return fieldCmp;
    }
    return Number(left.id || 0) - Number(right.id || 0);
  });

  const rows = sortedMatches.map((match, index) => {
    const isPause = String(match.entry_type || "match") === "pause";
    const team1Label = getTeamNameLabel(match.team1_id, match.team1_ref, teamNameById);
    const team2Label = getTeamNameLabel(match.team2_id, match.team2_ref, teamNameById);
    const teamsLabel = isPause
      ? `Pause (${Math.max(1, Number(match.duration_minutes) || 0)} min)`
      : `${team1Label} - ${team2Label}`;

    const refereeId = Number(match.referee_id);
    const refereeLabel = Number.isInteger(refereeId) && refereeId > 0
      ? teamNameById.get(refereeId) || `Team #${refereeId}`
      : "-- Kein Schiedsrichter --";

    const isFinished = Number(match.is_finished) > 0;
    const team1Id = Number(match.team1_id);
    const team2Id = Number(match.team2_id);
    const winnerId = Number(match.winner_id);
    const loserId = Number(match.loser_id);
    let team1OutcomeClass = "";
    let team2OutcomeClass = "";

    if (!isPause && isFinished) {
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

    return {
      matchId: Number(match.id),
      phaseId: Number(match.phase_id),
      startTime: String(match.start_time || "--:--"),
      fieldNumber: Number(match.field_number || 0),
      number: index + 1,
      roundLabel: String(match.block_name || phaseNameById.get(Number(match.phase_id)) || "Match"),
      teamsLabel,
      team1Label,
      team2Label,
      team1OutcomeClass,
      team2OutcomeClass,
      isPause,
      refereeId,
      refereeLabel,
      refereeOptions: getRefereeOptionsForMatch(match, teamNameById),
      isFinished,
      setResultsText: String(match.set_results_text || "").trim(),
      canEditReferee: !isPause && isRefereeAssignableMatch(match),
      showActions: !isPause,
      actionsEnabled: canEditPhaseResults(match.phase_id),
    };
  });

  const refereeOverview = buildTemporaryRefereeLoadRows(teamNameById);

  renderTournamentMatchesTable(tournamentMatchesUi.tableArea, rows, {
    title: "Temporaere Schiedsrichter-Uebersicht",
    averageLabel: "Soll je Team",
    averageAssignments: refereeOverview.averageAssignments,
    rows: refereeOverview.rows,
  });
}

/**
 * Closes and removes the active match result dialog if present.
 * @returns {void}
 */
function closeActiveMatchResultDialog() {
  if (!activeMatchResultDialog) {
    return;
  }

  activeMatchResultDialog.remove();
  activeMatchResultDialog = null;
}

/**
 * Converts persisted set rows into a fixed-length editable draft.
 * @param {Array<object>} persistedSets Persisted set rows.
 * @param {number} setCount Number of configured sets per match.
 * @returns {Array<{setIndex: number, team1Score: string, team2Score: string}>} Editable set draft.
 */
function buildSetDraftsForDialog(persistedSets, setCount) {
  const bySetIndex = new Map();
  (persistedSets || []).forEach((entry) => {
    const setIndex = Number(entry.set_index);
    if (!Number.isInteger(setIndex) || setIndex <= 0) {
      return;
    }
    bySetIndex.set(setIndex, entry);
  });

  const drafts = [];
  for (let setIndex = 1; setIndex <= setCount; setIndex += 1) {
    const existing = bySetIndex.get(setIndex);
    drafts.push({
      setIndex,
      team1Score: Number.isInteger(Number(existing?.team1_score)) ? String(existing.team1_score) : "",
      team2Score: Number.isInteger(Number(existing?.team2_score)) ? String(existing.team2_score) : "",
    });
  }
  return drafts;
}

/**
 * Parses one score input value to number-or-null for persistence.
 * @param {string} value Raw input value.
 * @returns {number|null} Parsed non-negative integer or null.
 */
function parseSetScoreValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.round(parsed));
}

/**
 * Reloads matches from backend and re-renders planning views.
 * @returns {Promise<void>} Resolves when reload and render are complete.
 */
async function reloadMatchesAndRender() {
  persistedMatches = await loadMatches();
  renderAllMatchGrid();
  if (getActiveViewName() === "turnierergebnisse") {
    await loadAndRenderTournamentResultsOverview();
  }
}

/**
 * Builds random set payload for one match according to configured set count.
 * @param {number} setCount Configured set count per match.
 * @returns {Array<{set_index: number, team1_score: number, team2_score: number, is_finished: boolean}>} Random set payload.
 */
function buildRandomSetPayload(setCount) {
  const totalSets = Math.max(1, Number(setCount) || 1);
  const payload = [];
  for (let setIndex = 1; setIndex <= totalSets; setIndex += 1) {
    payload.push({
      set_index: setIndex,
      team1_score: 1 + Math.floor(Math.random() * 10),
      team2_score: 1 + Math.floor(Math.random() * 10),
      is_finished: true,
    });
  }
  return payload;
}

/**
 * Fills random set results for all eligible matches in the currently running phase.
 * Matches without fixed teams are ignored.
 * @returns {Promise<{updatedMatches: number}>} Number of matches that were updated.
 */
async function fillRandomResultsForActivePhase() {
  const activePhaseId = Number(activeStartedMatchPhaseId);
  if (!Number.isInteger(activePhaseId) || activePhaseId <= 0) {
    return { updatedMatches: 0 };
  }

  const setCount = Math.max(1, Number(persistedSettings.sets_per_match) || 1);
  const phaseMatchesOrdered = persistedMatches
    .filter(
      (match) =>
        Number(match.phase_id) === activePhaseId &&
        String(match.entry_type || "match") !== "pause"
    )
    .sort((left, right) => {
      const timeCmp = toMinutes(String(left.start_time || "00:00")) - toMinutes(String(right.start_time || "00:00"));
      if (timeCmp !== 0) {
        return timeCmp;
      }
      const fieldCmp = Number(left.field_number || 0) - Number(right.field_number || 0);
      if (fieldCmp !== 0) {
        return fieldCmp;
      }
      return Number(left.id || 0) - Number(right.id || 0);
    });

  const protectedLastTwoIds = new Set(
    phaseMatchesOrdered
      .slice(-2)
      .map((match) => Number(match.id))
      .filter((matchId) => Number.isInteger(matchId) && matchId > 0)
  );

  const phaseMatches = phaseMatchesOrdered.filter(
    (match) =>
      !protectedLastTwoIds.has(Number(match.id)) &&
      isRefereeAssignableMatch(match)
  );

  let updatedMatches = 0;
  for (const match of phaseMatches) {
    const matchId = Number(match.id);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      continue;
    }

    const setsPayload = buildRandomSetPayload(setCount);
    await saveMatchSets(matchId, setsPayload);
    updatedMatches += 1;
  }

  return { updatedMatches };
}

/**
 * Opens the match result dialog for one match and persists entered set values.
 * Existing set rows are loaded and can be modified.
 * @param {number} matchId Target match id.
 * @returns {Promise<void>} Resolves when open flow has completed.
 */
async function openMatchResultDialog(matchId) {
  const match = persistedMatches.find((entry) => Number(entry.id) === Number(matchId));
  if (!match) {
    return;
  }

  const setCount = Math.max(1, Number(persistedSettings.sets_per_match) || 1);
  const teamNameById = new Map(
    teamsWithIds
      .map((team) => [Number(team.id), team.name])
      .filter(([teamId]) => Number.isInteger(teamId) && teamId > 0)
  );
  const team1Label = getTeamNameLabel(match.team1_id, match.team1_ref, teamNameById);
  const team2Label = getTeamNameLabel(match.team2_id, match.team2_ref, teamNameById);

  let persistedSets = [];
  try {
    persistedSets = await loadMatchSets(matchId);
  } catch {
    window.alert("Satzdaten konnten nicht geladen werden.");
    return;
  }

  const setDrafts = buildSetDraftsForDialog(persistedSets, setCount);

  closeActiveMatchResultDialog();

  const backdrop = document.createElement("div");
  backdrop.className = "tmr-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "tmr-dialog";
  dialog.innerHTML = `
    <div class="tmr-header">
      <h3 class="tmr-title">Match #${Number(match.id)} - ${String(match.block_name || "Match")}</h3>
      <button type="button" class="tmr-close-btn" data-action="close-dialog" aria-label="Dialog schliessen">×</button>
    </div>
    <div class="tmr-content">
      <p class="tmr-teams">${team1Label} - ${team2Label}</p>
      <div class="tmr-sets"></div>
      <div class="tmr-info-box">
        Der Gewinner wird automatisch ermittelt. Bei Bedarf werden nachfolgende Finalrunden-Matches aktualisiert.
      </div>
    </div>
    <div class="tmr-footer">
      <button type="button" class="tmr-btn tmr-btn-cancel" data-action="close-dialog">Abbrechen</button>
      <button type="button" class="tmr-btn tmr-btn-save" data-action="save-dialog">Speichern</button>
    </div>
  `;

  const setsContainer = dialog.querySelector(".tmr-sets");
  setDrafts.forEach((setEntry) => {
    const row = document.createElement("div");
    row.className = "tmr-set-row";
    row.dataset.setIndex = String(setEntry.setIndex);
    row.innerHTML = `
      <label class="tmr-set-label">Satz ${setEntry.setIndex}</label>
      <div class="tmr-score-row">
        <input class="tmr-score-input" data-side="team1" type="number" min="0" step="1" value="${setEntry.team1Score}" />
        <span class="tmr-score-sep">:</span>
        <input class="tmr-score-input" data-side="team2" type="number" min="0" step="1" value="${setEntry.team2Score}" />
      </div>
    `;
    setsContainer.appendChild(row);
  });

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  activeMatchResultDialog = backdrop;

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeActiveMatchResultDialog();
    }
  });

  dialog.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-action='close-dialog']");
    if (closeButton) {
      closeActiveMatchResultDialog();
      return;
    }

    const saveButton = event.target.closest("[data-action='save-dialog']");
    if (!saveButton) {
      return;
    }

    const setRows = [...dialog.querySelectorAll(".tmr-set-row")];
    const setsPayload = setRows.map((row) => {
      const setIndex = Number(row.dataset.setIndex);
      const team1Value = row.querySelector(".tmr-score-input[data-side='team1']")?.value || "";
      const team2Value = row.querySelector(".tmr-score-input[data-side='team2']")?.value || "";
      const team1Score = parseSetScoreValue(team1Value);
      const team2Score = parseSetScoreValue(team2Value);
      const isFinished = Number.isInteger(team1Score) && Number.isInteger(team2Score);

      return {
        set_index: setIndex,
        team1_score: team1Score,
        team2_score: team2Score,
        is_finished: isFinished,
      };
    });

    try {
      await saveMatchSets(matchId, setsPayload);
      closeActiveMatchResultDialog();
      await reloadMatchesAndRender();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Satzdaten konnten nicht gespeichert werden.");
    }
  });
}

/**
 * Populates planning controls and loads persisted match rows for the grid.
 * @returns {Promise<void>} Resolves when initialization is complete.
 */
async function initializeTournamentPlanning() {
  forEachEditableTournamentPlanningUi((ui) => {
    renderTournamentPlanningPhases(ui.phaseSelect, persistedPhases);
    renderTournamentPlanningGroups(ui.groupSelect, [], phaseBlocksByPhase, persistedPhases);
    renderTournamentPlanningFields(ui.fieldSelect, persistedSettings.fields);
  });

  try {
    teamsWithIds = await loadTeamsWithIds();
    persistedMatches = await loadMatches();
  } catch {
    persistedMatches = [];
  }

  await restoreStartedMatchPhaseState();

  refreshTournamentPlanningGroups();
  renderAllMatchGrid();
}

/**
 * Returns selected group refs from the group multi-select.
 * @param {object} ui Tournament planning view instance.
 * @returns {Array<{phaseId: number, blockId: number}>} Selected phase/block refs.
 */
function getSelectedBlockRefs(ui) {
  const selectedGroupRefs = [...ui.groupSelect.selectedOptions]
    .map((o) => {
      const dashIdx = o.value.indexOf("-");
      return {
        phaseId: Number(o.value.slice(0, dashIdx)),
        blockId: Number(o.value.slice(dashIdx + 1)),
      };
    })
    .filter((ref) => ref.phaseId > 0 && ref.blockId > 0);
  const selectedPhaseIds = new Set(readSelectedPhaseIds(ui.phaseSelect));
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
 * @param {object} ui Tournament planning view instance.
 * @returns {Array<number>} Selected field numbers.
 */
function getSelectedFieldNumbers(ui) {
  const selected = [...ui.fieldSelect.selectedOptions].map((o) => Number(o.value));
  if (selected.length > 0) {
    return selected;
  }
  return [...ui.fieldSelect.options]
    .map((o) => Number(o.value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

/**
 * Expands selected block refs with required source-phase blocks when both phases are selected.
 * If a selected block depends on another selected phase, all blocks of that source phase are
 * added to the planning set so the source phase is generated first.
 * @param {object} ui Tournament planning view instance.
 * @param {Array<{phaseId: number, blockId: number}>} blockRefs Initially selected block refs.
 * @returns {Array<{phaseId: number, blockId: number}>} Expanded unique block refs.
 */
function expandBlockRefsWithSelectedSources(ui, blockRefs) {
  const selectedPhaseIds = new Set(readSelectedPhaseIds(ui.phaseSelect));
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
 * @param {object} ui Tournament planning view instance.
 * @returns {Promise<void>} Resolves when generation flow is complete.
 */
async function handleGenerateMatches(ui) {
  let blockRefs = getSelectedBlockRefs(ui);

  if (blockRefs.length === 0) {
    return;
  }

  blockRefs = expandBlockRefsWithSelectedSources(ui, blockRefs);

  const slotValidation = validatePlanningBlockSlots(blockRefs);
  if (!slotValidation.isValid) {
    window.alert(slotValidation.message);
    return;
  }

  const fieldNumbers = getSelectedFieldNumbers(ui);
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

  const lockedPhaseIdsInSelection = [...new Set(newBlockRefs.map((ref) => Number(ref.phaseId)))].filter(
    (phaseId) => isPhaseScheduleLocked(phaseId)
  );
  if (lockedPhaseIdsInSelection.length > 0) {
    const lockedLabel = lockedPhaseIdsInSelection.map((phaseId) => getPhaseDisplayName(phaseId)).join(", ");
    window.alert(`Planung nicht moeglich: gestartete Phase(n) sind gesperrt (${lockedLabel}).`);
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
 * Recovers match state after a persistence failure by reloading from backend,
 * re-rendering the grid, and informing the user.
 * @param {string} userMessage Message shown in alert.
 * @returns {Promise<void>} Resolves when recovery flow is complete.
 */
async function recoverMatchesAfterPersistenceFailure(userMessage) {
  try {
    persistedMatches = await loadMatches();
  } catch {
    // Keep in-memory state when backend reload fails.
  }
  renderAllMatchGrid();
  window.alert(userMessage);
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
 * Validates a proposed schedule for hard DnD conflicts.
 * Rejects if two entries share the same field/time or if one team appears in
 * multiple matches in the same time slot on different fields.
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
      const matchA = timeMatches[index];
      for (let compareIndex = index + 1; compareIndex < timeMatches.length; compareIndex += 1) {
        const matchB = timeMatches[compareIndex];
        if (String(matchA.id) === String(matchB.id)) {
          continue;
        }
        if (Number(matchA.field_number) !== Number(matchB.field_number) && entriesShareTeam(matchA, matchB)) {
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
 * Finds one match occupying a specific field/time slot.
 * @param {Array<object>} matches Match list to search in.
 * @param {number} fieldNumber Target field number.
 * @param {string} startTime Target start time (HH:mm).
 * @param {number|null} [excludeMatchId=null] Match id to exclude from lookup.
 * @returns {object|null} Found match or null.
 */
function findMatchAtSlot(matches, fieldNumber, startTime, excludeMatchId = null) {
  return (
    matches.find((match) => {
      if (excludeMatchId !== null && Number(match.id) === Number(excludeMatchId)) {
        return false;
      }
      return (
        Number(match.field_number) === Number(fieldNumber) &&
        String(match.start_time || "") === String(startTime || "")
      );
    }) || null
  );
}

/**
 * Checks whether one match conflicts with other matches in the same time slot.
 * A conflict exists when at least one team appears in two matches at equal time
 * on different fields.
 * @param {Array<object>} proposedMatches Proposed full match list.
 * @param {object} match Match to validate.
 * @param {Set<number>} ignoredMatchIds Match ids to skip while checking.
 * @returns {boolean} True if a parallel-team conflict exists.
 */
function hasParallelTeamConflictForMatch(proposedMatches, match, ignoredMatchIds) {
  const startTime = String(match.start_time || "");
  const fieldNumber = Number(match.field_number);

  return proposedMatches.some((other) => {
    const otherId = Number(other.id);
    if (Number(otherId) === Number(match.id)) {
      return false;
    }
    if (ignoredMatchIds.has(otherId)) {
      return false;
    }
    if (String(other.start_time || "") !== startTime) {
      return false;
    }
    if (Number(other.field_number) === fieldNumber) {
      return false;
    }
    return entriesShareTeam(match, other);
  });
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
  const sourcePhaseId = Number(source.phase_id);
  if (isPhaseScheduleLocked(sourcePhaseId)) {
    window.alert(`Spielplan der gestarteten Phase ${getPhaseDisplayName(sourcePhaseId)} kann nicht mehr geaendert werden.`);
    return;
  }

  if (Number(source.field_number) === targetField && String(source.start_time) === targetTime) {
    return;
  }

  const proposedMatches = cloneMatchesForProposal(persistedMatches);
  const proposedMovingMatch = proposedMatches.find((match) => Number(match.id) === Number(matchId));
  if (!proposedMovingMatch) {
    return;
  }

  const sourceField = Number(source.field_number);
  const sourceTime = String(source.start_time || "");
  const targetMatch = findMatchAtSlot(proposedMatches, targetField, targetTime, matchId);

  if (targetMatch) {
    const targetPhaseId = Number(targetMatch.phase_id);
    if (isPhaseScheduleLocked(targetPhaseId)) {
      window.alert(`Spielplan der gestarteten Phase ${getPhaseDisplayName(targetPhaseId)} kann nicht mehr geaendert werden.`);
      return;
    }
  }

  if (targetMatch) {
    // Always swap source and target match positions directly.
    proposedMovingMatch.field_number = targetField;
    proposedMovingMatch.start_time = targetTime;
    targetMatch.field_number = sourceField;
    targetMatch.start_time = sourceTime;

    const movedAcrossDifferentTimes = sourceTime !== String(targetTime || "");
    if (movedAcrossDifferentTimes) {
      const ignoredForMoving = new Set([Number(targetMatch.id)]);
      const ignoredForTarget = new Set([Number(proposedMovingMatch.id)]);
      const movingHasConflict = hasParallelTeamConflictForMatch(
        proposedMatches,
        proposedMovingMatch,
        ignoredForMoving
      );
      const targetHasConflict = hasParallelTeamConflictForMatch(
        proposedMatches,
        targetMatch,
        ignoredForTarget
      );

      if (movingHasConflict || targetHasConflict) {
        window.alert("Verschieben nicht moeglich: Ein Team wuerde gleichzeitig auf zwei Feldern spielen.");
        return;
      }
    }
  } else {
    // Empty target slot: move one match and validate only the new target slot impact.
    proposedMovingMatch.field_number = targetField;
    proposedMovingMatch.start_time = targetTime;

    const movingHasConflict = hasParallelTeamConflictForMatch(proposedMatches, proposedMovingMatch, new Set());
    if (movingHasConflict) {
      window.alert("Verschieben nicht moeglich: Ein Team wuerde gleichzeitig auf zwei Feldern spielen.");
      return;
    }
  }

  const validation = validateDnDProposal(proposedMatches);
  if (!validation.isValid) {
    window.alert(validation.message);
    return;
  }

  const matchesBeforeMove = cloneMatchesForProposal(persistedMatches);
  persistedMatches = proposedMatches;

  const dependencyChangedPhaseIds = recalculatePhaseTimingAfterDnD();
  const lockedShiftedPhaseIds = [...dependencyChangedPhaseIds].filter((phaseId) => isPhaseScheduleLocked(phaseId));
  if (lockedShiftedPhaseIds.length > 0) {
    persistedMatches = matchesBeforeMove;
    const lockedLabel = lockedShiftedPhaseIds.map((phaseId) => getPhaseDisplayName(phaseId)).join(", ");
    window.alert(
      `Verschieben nicht moeglich: gesperrte Phase(n) wuerden zeitlich verschoben (${lockedLabel}).`
    );
    return;
  }

  try {
    teamsWithIds = await loadTeamsWithIds();
  } catch {
    // Keep existing in-memory team map when backend read fails.
  }

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
    await recoverMatchesAfterPersistenceFailure(
      "Speichern fehlgeschlagen. Spielplan wurde aus der Datenbank neu geladen."
    );
    return;
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
 * Returns target fields for global pause insertion.
 * The requested behavior is to always apply pauses to both fields.
 * @returns {Array<number>} Ordered list of target field numbers.
 */
function getPauseTargetFields() {
  return [1, 2];
}

/**
 * Inserts one pause across both fields at a shared time slot and shifts all
 * later matches on these fields by the pause duration.
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

  const allFields = getPauseTargetFields();

  const fallbackPhaseId = Number(
    persistedMatches.find((match) => Number.isInteger(Number(match.phase_id)) && Number(match.phase_id) > 0)?.phase_id || 0
  );

  // Determine which phase to assign each pause to (first phase found on that field).
  const phaseByField = new Map();
  allFields.forEach((field) => {
    const match = [...persistedMatches]
      .filter(
        (m) => Number(m.field_number) === field && Number.isInteger(Number(m.phase_id)) && Number(m.phase_id) > 0
      )
      .sort((left, right) => toMinutes(String(left.start_time || "00:00")) - toMinutes(String(right.start_time || "00:00")))[0];
    if (match) {
      phaseByField.set(field, Number(match.phase_id));
      return;
    }
    phaseByField.set(field, fallbackPhaseId);
  });

  // Shift all matches at or after pauseStart on affected fields by pauseDuration.
  const affectedFields = new Set(allFields);
  const updatedById = new Map();
  persistedMatches
    .filter(
      (m) =>
        affectedFields.has(Number(m.field_number)) &&
        toMinutes(String(m.start_time || "")) >= toMinutes(pauseStart)
    )
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
    await recoverMatchesAfterPersistenceFailure(
      "Pause konnte nicht gespeichert werden. Spielplan wurde aus der Datenbank neu geladen."
    );
    return;
  }

  renderAllMatchGrid();
}

/**
 * Deletes all pause entries that share the same time slot as the clicked pause,
 * then shifts all later matches on the affected fields back by the pause duration.
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
  const removedPauseEntries = persistedMatches.filter(
    (match) =>
      String(match.entry_type || "match") === "pause" &&
      String(match.start_time || "") === pauseStart
  );

  // Collect ids of all pause entries on this time slot (all fields).
  const pauseIdsOnSlot = new Set(removedPauseEntries.map((match) => Number(match.id)));
  const affectedFields = new Set(removedPauseEntries.map((match) => Number(match.field_number)));

  // Shift all non-pause matches that start strictly after the pause slot.
  const updatedById = new Map();
  persistedMatches
    .filter(
      (match) =>
        !pauseIdsOnSlot.has(Number(match.id)) &&
        affectedFields.has(Number(match.field_number)) &&
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
  removedPauseEntries.forEach((removedPause) => changedPhaseIds.add(Number(removedPause.phase_id)));
  changedPhaseIds.add(Number(pauseMatch.phase_id));

  try {
    for (const phaseId of changedPhaseIds) {
      if (phaseId > 0) {
        await persistPhaseMatches(phaseId);
      }
    }
  } catch {
    await recoverMatchesAfterPersistenceFailure(
      "Pause konnte nicht geloescht werden. Spielplan wurde aus der Datenbank neu geladen."
    );
    return;
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
 * Ensures referee assignments of one phase satisfy assignment rules before phase start.
 * Rebuilds assignments for the phase, persists updates, and reports hard/soft issues.
 * @param {number} phaseId Phase id that is about to be started.
 * @returns {Promise<{ok: boolean, reason: "missing-referee-pool"|"persist-failed"|null, unassignedCount: number}>} Start readiness result.
 */
async function ensurePhaseRefereesBeforeStart(phaseId) {
  const numericPhaseId = Number(phaseId);
  if (!Number.isInteger(numericPhaseId) || numericPhaseId <= 0) {
    return { ok: true, reason: null, unassignedCount: 0 };
  }

  try {
    teamsWithIds = await loadTeamsWithIds();
  } catch {
    // Keep existing in-memory team map when backend read fails.
  }

  const plannableMatches = persistedMatches.filter(
    (match) => Number(match.phase_id) === numericPhaseId && isRefereeAssignableMatch(match)
  );
  if (plannableMatches.length === 0) {
    return { ok: true, reason: null, unassignedCount: 0 };
  }

  const result = assignRefereesForPhases([numericPhaseId]);
  if (result.missingRefereePool) {
    return { ok: false, reason: "missing-referee-pool", unassignedCount: 0 };
  }

  try {
    await persistPhaseMatches(numericPhaseId);
  } catch {
    return { ok: false, reason: "persist-failed", unassignedCount: 0 };
  }

  return {
    ok: true,
    reason: null,
    unassignedCount: Math.max(0, result.plannableCount - result.assignedCount),
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
 * @param {object} ui Tournament planning view instance.
 * @returns {Promise<void>} Resolves when assignment and persistence are complete.
 */
async function handleAssignRefereesForSelectedPhase(ui) {
  const selectedPhaseIds = readSelectedPhaseIds(ui.phaseSelect);
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

forEachEditableTournamentPlanningUi((planningUi) => {
  planningUi.phaseSelect.addEventListener("change", () => {
    refreshTournamentPlanningGroups();
  });

  planningUi.generateButton.addEventListener("click", () => handleGenerateMatches(planningUi));
  planningUi.pauseButton.addEventListener("click", insertPauseSlot);
  planningUi.assignRefereesButton.addEventListener("click", () => handleAssignRefereesForSelectedPhase(planningUi));

  planningUi.gridArea.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".tp-match-card");
    if (!card) {
      return;
    }

    const matchId = card.dataset.matchId || "";
    event.dataTransfer.setData("text/plain", matchId);
    event.dataTransfer.effectAllowed = "move";
    card.classList.add("is-dragging");
  });

  planningUi.gridArea.addEventListener("dragend", (event) => {
    const card = event.target.closest(".tp-match-card");
    if (card) {
      card.classList.remove("is-dragging");
    }

    planningUi.gridArea
      .querySelectorAll(".tp-drop-slot.is-drop-target")
      .forEach((slot) => slot.classList.remove("is-drop-target"));
  });

  planningUi.gridArea.addEventListener("dragover", (event) => {
    const slot = event.target.closest(".tp-drop-slot");
    if (!slot) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    planningUi.gridArea
      .querySelectorAll(".tp-drop-slot.is-drop-target")
      .forEach((el) => {
        if (el !== slot) {
          el.classList.remove("is-drop-target");
        }
      });
    slot.classList.add("is-drop-target");
  });

  planningUi.gridArea.addEventListener("drop", async (event) => {
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

  planningUi.gridArea.addEventListener("click", async (event) => {
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
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      return;
    }

    const phaseName = String(deleteBtn.dataset.phaseName || `Phase ${phaseId}`);
    const confirmed = window.confirm(`Alle Matches in ${phaseName} wirklich loeschen?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteMatchesForPhase(phaseId);
      persistedMatches = persistedMatches.filter((match) => Number(match.phase_id) !== phaseId);
      startedMatchPhaseIds.delete(phaseId);
      if (Number(activeStartedMatchPhaseId) === phaseId) {
        activeStartedMatchPhaseId = null;
      }
      await persistStartedMatchPhaseState();
      await reloadMatchesAndRender();
    } catch {
      // Keep in-memory state when reload fails.
    }
  });
});
tournamentMatchesUi.tableArea.addEventListener("change", async (event) => {
  const select = event.target.closest(".tm-ref-select");
  if (!select) {
    return;
  }

  const matchId = Number(select.dataset.matchId);
  const phaseId = Number(select.dataset.phaseId);
  if (!Number.isInteger(matchId) || matchId <= 0 || !Number.isInteger(phaseId) || phaseId <= 0) {
    return;
  }

  const targetMatch = persistedMatches.find((match) => Number(match.id) === matchId);
  if (!targetMatch) {
    return;
  }

  const nextRefereeId = Number(select.value);
  targetMatch.referee_id = Number.isInteger(nextRefereeId) && nextRefereeId > 0 ? nextRefereeId : null;

  try {
    await persistPhaseMatches(phaseId);
  } catch {
    await recoverMatchesAfterPersistenceFailure(
      "Schiedsrichter konnte nicht gespeichert werden. Spielplan wurde aus der Datenbank neu geladen."
    );
    return;
  }

  renderAllMatchGrid();
});

tournamentMatchesUi.tableArea.addEventListener("click", async (event) => {
  const entryButton = event.target.closest("[data-action='match-entry']");
  if (entryButton) {
    const matchId = Number(entryButton.dataset.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return;
    }

    const match = persistedMatches.find((entry) => Number(entry.id) === matchId);
    if (!match || !canEditPhaseResults(match.phase_id)) {
      window.alert("Ergebnisse koennen nur in der aktuell gestarteten Phase geaendert werden.");
      return;
    }

    await openMatchResultDialog(matchId);
    return;
  }

  const deleteButton = event.target.closest("[data-action='match-delete']");
  if (deleteButton) {
    const matchId = Number(deleteButton.dataset.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return;
    }

    const match = persistedMatches.find((entry) => Number(entry.id) === matchId);
    if (!match || !canEditPhaseResults(match.phase_id)) {
      window.alert("Ergebnisse koennen nur in der aktuell gestarteten Phase geloescht werden.");
      return;
    }

    const confirmed = window.confirm("Alle Satzdaten fuer dieses Match wirklich loeschen?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteMatchSets(matchId);
      await reloadMatchesAndRender();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Satzdaten konnten nicht geloescht werden.");
    }
  }
});

/**
 * Resets all result data for one phase by deleting all persisted set rows of its matches.
 * Also unlocks the phase in started-phase state.
 * @param {number} phaseId Target phase id.
 * @returns {Promise<void>} Resolves when reset flow has completed.
 */
async function resetStartedPhaseResults(phaseId) {
  const numericPhaseId = Number(phaseId);
  const phaseMatches = persistedMatches.filter((match) => Number(match.phase_id) === numericPhaseId);

  for (const match of phaseMatches) {
    const matchId = Number(match.id);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      continue;
    }
    await deleteMatchSets(matchId);
  }

  await reloadMatchesAndRender();

  startedMatchPhaseIds.delete(numericPhaseId);
  if (Number(activeStartedMatchPhaseId) === numericPhaseId) {
    activeStartedMatchPhaseId = null;
  }
  await persistStartedMatchPhaseState();
  renderAllTournamentMatchesTable();
}

tournamentMatchesUi.phaseToggleButton.addEventListener("click", async () => {
  const mode = String(tournamentMatchesUi.phaseToggleButton.dataset.mode || "");
  if (mode === "start") {
    const plannedPhaseIds = getPlannedPhaseIdsInOrder();
    const nextPhaseId = getNextNotStartedPhaseId(plannedPhaseIds);
    if (!Number.isInteger(nextPhaseId) || nextPhaseId <= 0) {
      renderAllTournamentMatchesTable();
      return;
    }

    await startPhaseForResults(nextPhaseId);
    return;
  }

  if (mode === "reset") {
    const phaseId = Number(activeStartedMatchPhaseId);
    if (!Number.isInteger(phaseId) || phaseId <= 0) {
      return;
    }

    const phaseName = getPhaseDisplayName(activeStartedMatchPhaseId);
    const confirmed = window.confirm(
      `Alle Match-Ergebnisse von Phase ${phaseName} wirklich loeschen und Spiele zuruecksetzen?`
    );
    if (!confirmed) {
      return;
    }

    try {
      await resetStartedPhaseResults(phaseId);
    } catch {
      window.alert("Phase konnte nicht zurueckgesetzt werden.");
      try {
        await reloadMatchesAndRender();
      } catch {
        // Keep in-memory state when reload fails.
      }
    }
  }
});

tournamentMatchesUi.nextPhaseStartButton.addEventListener("click", async () => {
  const nextPhaseId = Number(tournamentMatchesUi.nextPhaseStartButton.dataset.phaseId);
  if (!Number.isInteger(nextPhaseId) || nextPhaseId <= 0) {
    return;
  }

  await startPhaseForResults(nextPhaseId);
});

tournamentMatchesUi.helperFillButton.addEventListener("click", async () => {
  const activePhaseId = Number(activeStartedMatchPhaseId);
  if (!Number.isInteger(activePhaseId) || activePhaseId <= 0) {
    window.alert("Keine laufende Phase aktiv. Bitte zuerst eine Phase starten.");
    return;
  }

  const phaseName = getPhaseDisplayName(activePhaseId);
  const confirmed = window.confirm(
    `Temporaere Funktion: Alle Spiele mit festen Teams in Phase ${phaseName} mit Zufalls-Satzergebnissen fuellen?`
  );
  if (!confirmed) {
    return;
  }

  try {
    const result = await fillRandomResultsForActivePhase();
    await reloadMatchesAndRender();
    window.alert(`Zufalls-Ergebnisse gespeichert: ${result.updatedMatches} Matches aktualisiert.`);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Zufalls-Ergebnisse konnten nicht gespeichert werden.");
  }
});

navToggle.addEventListener("click", toggleNavigation);
sidebarBackdrop.addEventListener("click", () => {
  appLayout.classList.remove("is-open-mobile");
  syncBackdrop();
});

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    void openView(button.dataset.view);
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
    updateTopbarTitle(saved);
    updateTopbarSubtitle(saved);
    updateTopbarLogo(saved);
    setSaveStatus(settingsUi.saveStatus, "Gespeichert");
    updateDirtyState();
    forEachEditableTournamentPlanningUi((ui) => {
      renderTournamentPlanningFields(ui.fieldSelect, persistedSettings.fields);
    });
  } catch (error) {
    setSaveStatus(settingsUi.saveStatus, "Speichern fehlgeschlagen", true);
    updateDirtyState();
  }
});

settingsUi.changePasswordButton.addEventListener("click", async () => {
  const currentPassword = String(settingsUi.passwordCurrentInput?.value || "");
  const newPassword = String(settingsUi.passwordNewInput?.value || "");
  const confirmPassword = String(settingsUi.passwordConfirmInput?.value || "");

  if (newPassword.length === 0) {
    setSaveStatus(settingsUi.changePasswordStatus, "Neues Passwort darf nicht leer sein.", true);
    settingsUi.passwordNewInput?.focus();
    return;
  }

  if (newPassword !== confirmPassword) {
    setSaveStatus(settingsUi.changePasswordStatus, "Passwort-Bestaetigung stimmt nicht ueberein.", true);
    settingsUi.passwordConfirmInput?.focus();
    return;
  }

  setSaveStatus(settingsUi.changePasswordStatus, "Passwort wird geaendert...");
  settingsUi.changePasswordButton.disabled = true;

  try {
    const result = await changeAccessPassword(currentPassword, newPassword);
    if (!result.ok) {
      throw new Error("Passwort konnte nicht geaendert werden.");
    }

    settingsUi.passwordCurrentInput.value = "";
    settingsUi.passwordNewInput.value = "";
    settingsUi.passwordConfirmInput.value = "";
    setSaveStatus(settingsUi.changePasswordStatus, "Passwort geaendert");
  } catch (error) {
    setSaveStatus(
      settingsUi.changePasswordStatus,
      error instanceof Error ? error.message : "Passwort konnte nicht geaendert werden.",
      true
    );
  } finally {
    settingsUi.changePasswordButton.disabled = false;
  }
});

settingsUi.logoutProtectedViewsButton.addEventListener("click", async () => {
  hasUnlockedProtectedViews = false;
  persistProtectedAccessFlag(false);
  updateProtectedMenuVisibility();
  setSaveStatus(settingsUi.changePasswordStatus, "Abgemeldet. Geschuetzte Menues sind wieder gesperrt.");
  await openView("turnierergebnisse");
});

topbarLogoImage?.addEventListener("error", () => {
  if (topbarLogo) {
    topbarLogo.hidden = true;
  }
});

scoringModeUi.form.addEventListener("change", () => {
  updateScoringModeDirtyState();
});

scoringModeUi.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setSaveButtonState(scoringModeUi.saveButton, false);
  setSaveStatus(scoringModeUi.saveStatus, "Speichern...");

  try {
    const selectedMode = readSelectedScoringModeKey();
    const savedState = await saveScoringMode(selectedMode);
    persistedScoringModeKey = savedState.mode_key;
    writeScoringModeToForm(persistedScoringModeKey);
    setSaveStatus(scoringModeUi.saveStatus, "Gespeichert");
    updateScoringModeDirtyState();
  } catch (error) {
    setSaveStatus(scoringModeUi.saveStatus, "Speichern fehlgeschlagen", true);
    updateScoringModeDirtyState();
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
      refreshTournamentPlanningGroups();
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
      refreshTournamentPlanningGroups();
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

loginMenuButton?.addEventListener("click", async () => {
  await ensureProtectedAccessGranted();
});

mobileQuery.addEventListener("change", () => {
  appLayout.classList.remove("is-open-mobile");
  syncBackdrop();
});

updateProtectedMenuVisibility();
void openView(loadPersistedActiveViewName() || getDefaultViewName());
initializeTournamentSettings();
initializeScoringMode();
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
