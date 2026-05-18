(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // public/calculations.js
  function sanitizeString(value) {
    return String(value ?? "").trim();
  }
  function sanitizeDate(value) {
    const normalized = sanitizeString(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
  }
  function sanitizeTime(value) {
    const normalized = sanitizeString(value);
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : "";
  }
  function sanitizeNumber(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, Math.round(parsed));
  }
  function getDefaultTournamentSettings() {
    return structuredClone(DEFAULT_SETTINGS);
  }
  function normalizeTournamentSettings(rawSettings) {
    const incoming = rawSettings || {};
    const lunchBreak = incoming.lunch_break || {};
    return {
      tournament_name: sanitizeString(incoming.tournament_name),
      logo: sanitizeString(incoming.logo),
      tournament_date: sanitizeDate(incoming.tournament_date),
      tournament_time: sanitizeTime(incoming.tournament_time),
      fields: sanitizeNumber(incoming.fields, DEFAULT_SETTINGS.fields),
      sets_per_match: sanitizeNumber(incoming.sets_per_match, DEFAULT_SETTINGS.sets_per_match),
      minutes_per_set: sanitizeNumber(incoming.minutes_per_set, DEFAULT_SETTINGS.minutes_per_set),
      minutes_between_sets: sanitizeNumber(
        incoming.minutes_between_sets,
        DEFAULT_SETTINGS.minutes_between_sets
      ),
      pause_between_matches: sanitizeNumber(
        incoming.pause_between_matches,
        DEFAULT_SETTINGS.pause_between_matches
      ),
      lunch_break: {
        time: sanitizeTime(lunchBreak.time),
        duration: sanitizeNumber(lunchBreak.duration, DEFAULT_SETTINGS.lunch_break.duration)
      }
    };
  }
  function areTournamentSettingsEqual(a, b) {
    const left = normalizeTournamentSettings(a);
    const right = normalizeTournamentSettings(b);
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function getDefaultTeams() {
    return [];
  }
  function normalizeTeams(rawTeams) {
    if (!Array.isArray(rawTeams)) {
      return [];
    }
    return rawTeams.map((team) => sanitizeString(team?.name)).filter((name) => name.length > 0).map((name) => ({ name }));
  }
  function areTeamsEqual(a, b) {
    const left = normalizeTeams(a);
    const right = normalizeTeams(b);
    return JSON.stringify(left) === JSON.stringify(right);
  }
  function getDefaultPhases() {
    return [];
  }
  function normalizePhases(rawPhases) {
    if (!Array.isArray(rawPhases)) {
      return [];
    }
    return rawPhases.map((phase) => {
      const idValue = Number(phase?.id);
      const id = Number.isInteger(idValue) && idValue > 0 ? idValue : null;
      const name = sanitizeString(phase?.name);
      const modeType = sanitizeString(phase?.mode_type);
      return {
        id,
        name,
        mode_type: modeType === "gruppe" ? "gruppe" : ""
      };
    }).filter((phase) => phase.name.length > 0);
  }
  var DEFAULT_SETTINGS;
  var init_calculations = __esm({
    "public/calculations.js"() {
      DEFAULT_SETTINGS = {
        tournament_name: "",
        logo: "",
        tournament_date: "",
        tournament_time: "",
        fields: 1,
        sets_per_match: 1,
        minutes_per_set: 10,
        minutes_between_sets: 0,
        pause_between_matches: 0,
        lunch_break: {
          time: "",
          duration: 0
        }
      };
    }
  });

  // public/data-store.js
  async function loadTournamentSettings() {
    const response = await fetch("/api/setup");
    if (!response.ok) {
      throw new Error("Turnier-Einstellungen konnten nicht geladen werden.");
    }
    const payload = await response.json();
    return normalizeTournamentSettings(payload.settings || getDefaultTournamentSettings());
  }
  async function saveTournamentSettings(settings) {
    const normalized = normalizeTournamentSettings(settings);
    const response = await fetch("/api/setup", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ settings: normalized })
    });
    if (!response.ok) {
      throw new Error("Turnier-Einstellungen konnten nicht gespeichert werden.");
    }
    const payload = await response.json();
    return normalizeTournamentSettings(payload.settings || normalized);
  }
  async function loadTeams() {
    const response = await fetch("/api/teams");
    if (!response.ok) {
      throw new Error("Teams konnten nicht geladen werden.");
    }
    const payload = await response.json();
    return normalizeTeams(payload.teams || getDefaultTeams());
  }
  async function saveTeams(teams) {
    const normalized = normalizeTeams(teams);
    const response = await fetch("/api/teams", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ teams: normalized })
    });
    if (!response.ok) {
      throw new Error("Teams konnten nicht gespeichert werden.");
    }
    const payload = await response.json();
    return normalizeTeams(payload.teams || normalized);
  }
  async function loadPhases() {
    const response = await fetch("/api/phases");
    if (!response.ok) {
      throw new Error("Phasen konnten nicht geladen werden.");
    }
    const payload = await response.json();
    return normalizePhases(payload.phases || getDefaultPhases());
  }
  async function savePhases(phases) {
    const normalized = normalizePhases(phases);
    const response = await fetch("/api/phases", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ phases: normalized })
    });
    if (!response.ok) {
      throw new Error("Phasen konnten nicht gespeichert werden.");
    }
    const payload = await response.json();
    return normalizePhases(payload.phases || []);
  }
  var init_data_store = __esm({
    "public/data-store.js"() {
      init_calculations();
    }
  });

  // public/layout.js
  function mountTournamentSettingsLayout(targetElement) {
    targetElement.innerHTML = `
    <article class="settings-card" aria-label="Turnier-Einstellungen">
      <h3>Definition von Eingabefeldern</h3>
      <p class="settings-description">
        Dieser Abschnitt definiert die Turnier-Grundeinstellungen fuer das Turniersetup.
      </p>

      <form id="tournamentSettingsForm" class="settings-form" novalidate>
        <section class="settings-section">
          <h4>Basisdaten</h4>
          <div class="settings-grid">
            <label class="field-row">
              <span>Turniername</span>
              <input name="tournament_name" type="text" autocomplete="off" />
            </label>

            <label class="field-row">
              <span>Logo (Bild-Link)</span>
              <input name="logo" type="url" placeholder="https://..." autocomplete="off" />
            </label>

            <label class="field-row">
              <span>Turnierdatum</span>
              <input name="tournament_date" type="date" />
            </label>

            <label class="field-row">
              <span>Turnierzeit</span>
              <input name="tournament_time" type="time" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h4>Spielparameter</h4>
          <div class="settings-grid">
            <label class="field-row">
              <span>Felder (Anzahl)</span>
              <input name="fields" type="number" min="0" step="1" inputmode="numeric" />
            </label>

            <label class="field-row">
              <span>Sets pro Spiel</span>
              <input name="sets_per_match" type="number" min="0" step="1" inputmode="numeric" />
            </label>

            <label class="field-row">
              <span>Minuten pro Set</span>
              <input name="minutes_per_set" type="number" min="0" step="1" inputmode="numeric" />
            </label>

            <label class="field-row">
              <span>Minuten zwischen Sets</span>
              <input name="minutes_between_sets" type="number" min="0" step="1" inputmode="numeric" />
            </label>

            <label class="field-row">
              <span>Pause zwischen Spielen</span>
              <input name="pause_between_matches" type="number" min="0" step="1" inputmode="numeric" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h4>Mittagspause</h4>
          <div class="settings-grid">
            <label class="field-row">
              <span>Uhrzeit</span>
              <input name="lunch_break_time" type="time" />
            </label>

            <label class="field-row">
              <span>Dauer (Minuten)</span>
              <input name="lunch_break_duration" type="number" min="0" step="1" inputmode="numeric" />
            </label>
          </div>
        </section>

        <footer class="settings-footer">
          <span id="saveStatus" class="save-status" aria-live="polite">Keine Aenderungen</span>
          <button id="saveSettingsBtn" class="save-btn" type="submit" disabled>Speichern</button>
        </footer>
      </form>
    </article>
  `;
    return {
      form: targetElement.querySelector("#tournamentSettingsForm"),
      saveButton: targetElement.querySelector("#saveSettingsBtn"),
      saveStatus: targetElement.querySelector("#saveStatus")
    };
  }
  function setNumberValue(form, fieldName, value) {
    const input = form.elements.namedItem(fieldName);
    if (input) {
      input.value = String(value ?? 0);
    }
  }
  function writeTournamentSettingsToForm(form, settings) {
    form.elements.namedItem("tournament_name").value = settings.tournament_name || "";
    form.elements.namedItem("logo").value = settings.logo || "";
    form.elements.namedItem("tournament_date").value = settings.tournament_date || "";
    form.elements.namedItem("tournament_time").value = settings.tournament_time || "";
    setNumberValue(form, "fields", settings.fields);
    setNumberValue(form, "sets_per_match", settings.sets_per_match);
    setNumberValue(form, "minutes_per_set", settings.minutes_per_set);
    setNumberValue(form, "minutes_between_sets", settings.minutes_between_sets);
    setNumberValue(form, "pause_between_matches", settings.pause_between_matches);
    form.elements.namedItem("lunch_break_time").value = settings.lunch_break?.time || "";
    setNumberValue(form, "lunch_break_duration", settings.lunch_break?.duration);
  }
  function readNumber(form, fieldName) {
    const input = form.elements.namedItem(fieldName);
    return input ? Number(input.value) : 0;
  }
  function readTournamentSettingsFromForm(form) {
    return {
      tournament_name: form.elements.namedItem("tournament_name")?.value || "",
      logo: form.elements.namedItem("logo")?.value || "",
      tournament_date: form.elements.namedItem("tournament_date")?.value || "",
      tournament_time: form.elements.namedItem("tournament_time")?.value || "",
      fields: readNumber(form, "fields"),
      sets_per_match: readNumber(form, "sets_per_match"),
      minutes_per_set: readNumber(form, "minutes_per_set"),
      minutes_between_sets: readNumber(form, "minutes_between_sets"),
      pause_between_matches: readNumber(form, "pause_between_matches"),
      lunch_break: {
        time: form.elements.namedItem("lunch_break_time")?.value || "",
        duration: readNumber(form, "lunch_break_duration")
      }
    };
  }
  function setSaveButtonState(saveButton, enabled) {
    saveButton.disabled = !enabled;
  }
  function setSaveStatus(saveStatusElement, message, isError = false) {
    saveStatusElement.textContent = message;
    saveStatusElement.classList.toggle("is-error", isError);
  }
  function mountTeamsLayout(targetElement) {
    targetElement.innerHTML = `
    <article class="settings-card" aria-label="Team-Einstellungen">
      <h3>Teamverwaltung</h3>
      <p class="settings-description">
        Variable Teamliste. Die Team-ID wird nur intern in der Datenbank vergeben.
      </p>

      <form id="teamsForm" class="settings-form" novalidate>
        <section class="settings-section">
          <h4>Teams</h4>
          <div id="teamRows" class="team-rows"></div>
          <button id="addTeamBtn" class="add-team-btn" type="button">+ Team hinzufuegen</button>
        </section>

        <footer class="settings-footer">
          <span id="teamsSaveStatus" class="save-status" aria-live="polite">Keine Aenderungen</span>
          <button id="saveTeamsBtn" class="save-btn" type="submit" disabled>Speichern</button>
        </footer>
      </form>
    </article>
  `;
    return {
      form: targetElement.querySelector("#teamsForm"),
      rowsContainer: targetElement.querySelector("#teamRows"),
      addButton: targetElement.querySelector("#addTeamBtn"),
      saveButton: targetElement.querySelector("#saveTeamsBtn"),
      saveStatus: targetElement.querySelector("#teamsSaveStatus")
    };
  }
  function createTeamRowElement(value = "") {
    const row = document.createElement("div");
    row.className = "team-row";
    const label = document.createElement("span");
    label.className = "team-row-label";
    label.textContent = "Teamname";
    const input = document.createElement("input");
    input.className = "team-name-input";
    input.type = "text";
    input.name = "team_name";
    input.autocomplete = "off";
    input.value = value;
    const removeButton = document.createElement("button");
    removeButton.className = "team-remove-btn";
    removeButton.type = "button";
    removeButton.textContent = "Entfernen";
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(removeButton);
    return row;
  }
  function renderTeamsRows(rowsContainer, teams) {
    rowsContainer.innerHTML = "";
    const source = Array.isArray(teams) && teams.length > 0 ? teams : [{ name: "" }];
    source.forEach((team) => {
      rowsContainer.appendChild(createTeamRowElement(team.name || ""));
    });
  }
  function addTeamRow(rowsContainer) {
    const row = createTeamRowElement("");
    rowsContainer.appendChild(row);
    return row;
  }
  function readTeamsFromRows(rowsContainer) {
    const inputs = [...rowsContainer.querySelectorAll(".team-name-input")];
    return inputs.map((input) => ({ name: input.value || "" }));
  }
  function mountPhaseConfigLayout(targetElement) {
    targetElement.innerHTML = `
    <div class="phases-toolbar">
      <button id="addPhaseBtn" class="add-phase-btn" type="button">+ Phase hinzufuegen</button>
      <select id="blockPhaseSelect" class="phase-block-toolbar-select" aria-label="Phase fuer Baustein">
        <option value="">Phase waehlen</option>
      </select>
      <select id="blockTypeSelect" class="phase-block-toolbar-select" aria-label="Baustein-Typ">
        <option value="gruppe">Gruppe</option>
        <option value="einzelspiel">Einzelspiel</option>
      </select>
      <button id="addBlockBtn" class="add-phase-btn" type="button">+ Baustein hinzufuegen</button>
      <span id="phasesSaveStatus" class="save-status" aria-live="polite"></span>
    </div>
    <div class="phases-form">
      <div id="phaseColumns" class="phase-columns"></div>
    </div>
  `;
    return {
      columnsContainer: targetElement.querySelector("#phaseColumns"),
      addButton: targetElement.querySelector("#addPhaseBtn"),
      addBlockButton: targetElement.querySelector("#addBlockBtn"),
      blockPhaseSelect: targetElement.querySelector("#blockPhaseSelect"),
      blockTypeSelect: targetElement.querySelector("#blockTypeSelect"),
      saveStatus: targetElement.querySelector("#phasesSaveStatus")
    };
  }
  function createPhaseColumnElement({ id = null, name = "" } = {}) {
    const column = document.createElement("div");
    column.className = "phase-column";
    if (id) {
      column.dataset.phaseId = String(id);
    }
    const header = document.createElement("div");
    header.className = "phase-column-head";
    const title = document.createElement("strong");
    title.className = "phase-name-title";
    title.textContent = (name || "").trim() || "Neue Phase";
    const actions = document.createElement("div");
    actions.className = "phase-icon-actions";
    const renameButton = document.createElement("button");
    renameButton.className = "phase-icon-btn";
    renameButton.type = "button";
    renameButton.dataset.action = "rename";
    renameButton.title = "Phase bearbeiten";
    renameButton.setAttribute("aria-label", "Phase bearbeiten");
    renameButton.textContent = "\u270E";
    const deleteButton = document.createElement("button");
    deleteButton.className = "phase-icon-btn is-danger";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.title = "Phase loeschen";
    deleteButton.setAttribute("aria-label", "Phase loeschen");
    deleteButton.textContent = "\u{1F5D1}";
    const popup = document.createElement("div");
    popup.className = "phase-name-popup";
    const popupInner = document.createElement("div");
    popupInner.className = "phase-name-popup-inner";
    const popupLabel = document.createElement("strong");
    popupLabel.className = "phase-name-popup-title";
    popupLabel.textContent = "Phase bearbeiten";
    const popupInput = document.createElement("input");
    popupInput.className = "phase-name-popup-input";
    popupInput.type = "text";
    popupInput.name = "phase_name";
    popupInput.autocomplete = "off";
    popupInput.value = name;
    popupInput.placeholder = "Phasenname";
    const popupActions = document.createElement("div");
    popupActions.className = "phase-name-popup-actions";
    const cancelEditButton = document.createElement("button");
    cancelEditButton.className = "phase-name-popup-btn";
    cancelEditButton.type = "button";
    cancelEditButton.dataset.action = "cancel-rename";
    cancelEditButton.textContent = "Abbrechen";
    const saveEditButton = document.createElement("button");
    saveEditButton.className = "phase-name-popup-btn is-primary";
    saveEditButton.type = "button";
    saveEditButton.dataset.action = "save-rename";
    saveEditButton.textContent = "Speichern";
    popupActions.appendChild(cancelEditButton);
    popupActions.appendChild(saveEditButton);
    popupInner.appendChild(popupLabel);
    popupInner.appendChild(popupInput);
    popupInner.appendChild(popupActions);
    popup.appendChild(popupInner);
    actions.appendChild(renameButton);
    actions.appendChild(deleteButton);
    header.appendChild(title);
    header.appendChild(actions);
    const blockBody = document.createElement("div");
    blockBody.className = "phase-blocks";
    column.appendChild(header);
    column.appendChild(popup);
    column.appendChild(blockBody);
    return column;
  }
  function renderPhaseColumns(columnsContainer, phases) {
    columnsContainer.innerHTML = "";
    const source = Array.isArray(phases) && phases.length > 0 ? phases : [{ id: null, name: "" }];
    source.forEach((phase) => {
      columnsContainer.appendChild(createPhaseColumnElement(phase));
    });
  }
  function addPhaseColumn(columnsContainer) {
    const column = createPhaseColumnElement({ id: null, name: "" });
    columnsContainer.appendChild(column);
    return column;
  }
  function readPhasesFromColumns(columnsContainer) {
    const columns = [...columnsContainer.querySelectorAll(".phase-column")];
    return columns.map((column) => ({
      id: column.dataset.phaseId ? Number(column.dataset.phaseId) : null,
      name: column.querySelector(".phase-name-popup-input")?.value || ""
    }));
  }
  var init_layout = __esm({
    "public/layout.js"() {
    }
  });

  // public/phase-blocks-store.js
  async function loadPhaseBlocks(phaseId) {
    const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/blocks`);
    if (!response.ok) {
      throw new Error(`Bausteine fuer Phase ${phaseId} konnten nicht geladen werden.`);
    }
    const payload = await response.json();
    return Array.isArray(payload.blocks) ? payload.blocks : [];
  }
  async function savePhaseBlocks(phaseId, blocks) {
    const response = await fetch(`/api/phases/${encodeURIComponent(phaseId)}/blocks`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ blocks })
    });
    if (!response.ok) {
      throw new Error(`Bausteine fuer Phase ${phaseId} konnten nicht gespeichert werden.`);
    }
    const payload = await response.json();
    return Array.isArray(payload.blocks) ? payload.blocks : [];
  }
  var init_phase_blocks_store = __esm({
    "public/phase-blocks-store.js"() {
    }
  });

  // public/phase-blocks-layout.js
  function applySourcePhaseSelectVisibility(sourceTypeSelect, sourcePhaseSelect) {
    const isPhase = sourceTypeSelect.value === "phase" || sourceTypeSelect.value === "match";
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
  function applySourcePhasePlaceholderStyle(sourcePhaseSelect) {
    sourcePhaseSelect.classList.toggle("is-placeholder", sourcePhaseSelect.value === "");
  }
  function toggleBlockConfigPopup(popup, isOpen) {
    popup.classList.toggle("is-open", isOpen);
  }
  function normalizeBlockName(value, position) {
    const normalized = String(value || "").trim();
    return normalized.length > 0 ? normalized : `Gruppe ${position + 1}`;
  }
  function getSourceKey(block) {
    if (block.source_type === "phase") {
      const sourcePhaseId = Number(block.source_phase_id);
      return Number.isInteger(sourcePhaseId) && sourcePhaseId > 0 ? `phase:${sourcePhaseId}` : "phase:none";
    }
    if (block.source_type === "match") {
      const sourcePhaseId = Number(block.source_phase_id);
      return Number.isInteger(sourcePhaseId) && sourcePhaseId > 0 ? `match:${sourcePhaseId}` : "match:none";
    }
    return "teams";
  }
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
            label: `${sourceBlockName} Platz ${rank}`
          });
        }
      });
      return options;
    }
    if (block.source_type === "match" && Number.isInteger(Number(block.source_phase_id))) {
      const sourcePhaseId = Number(block.source_phase_id);
      const sourceBlocks = (blocksByPhase.get(sourcePhaseId) || []).filter(
        (sb) => sb.block_type === "einzelspiel"
      );
      const options = [];
      sourceBlocks.forEach((sourceBlock, gameIndex) => {
        const sourceName = normalizeBlockName(sourceBlock.block_name, gameIndex);
        options.push(
          { value: `match-winner:${sourceBlock.id}`, label: `${sourceName} Gewinner` },
          { value: `match-loser:${sourceBlock.id}`, label: `${sourceName} Verlierer` }
        );
      });
      return options;
    }
    return teams.map((team) => ({
      value: `team:${team.name}`,
      label: team.name
    }));
  }
  function syncSlotSelectOptionsInBlock(blockCard) {
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
  function renderPhaseBlocks(container, phaseId, blocks, phases, teams, blocksByPhase) {
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
      card.dataset.blockType = block.block_type;
      const isEinzelspiel = block.block_type === "einzelspiel";
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
      editBtn.textContent = "\u270E";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "phase-block-icon-btn is-danger phase-block-delete";
      removeBtn.dataset.action = "delete-block";
      removeBtn.title = "Baustein loeschen";
      removeBtn.setAttribute("aria-label", "Baustein loeschen");
      removeBtn.textContent = "\u{1F5D1}";
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
      sourceTypeSelect.innerHTML = isEinzelspiel ? `
        <option value="teams">Quelle: Teams</option>
        <option value="phase">Quelle: Platzierungen aus Phase</option>
        <option value="match">Quelle: Spiele aus Phase</option>
      ` : `
        <option value="teams">Quelle: Teams</option>
        <option value="phase">Quelle: Platzierungen aus Phase</option>
      `;
      sourceTypeSelect.value = ["phase", "match"].includes(block.source_type) ? block.source_type : "teams";
      const sourcePhaseSelect = document.createElement("select");
      sourcePhaseSelect.className = "phase-block-source-phase";
      sourcePhaseSelect.disabled = !["phase", "match"].includes(sourceTypeSelect.value);
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
      sourcePhaseSelect.value = ["phase", "match"].includes(sourceTypeSelect.value) && Number.isInteger(Number(block.source_phase_id)) ? String(block.source_phase_id) : "";
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
      if (!isEinzelspiel) {
        popupInner.appendChild(teamsPerGroupLabel);
      }
      popupInner.appendChild(popupActions);
      popup.appendChild(popupInner);
      const slotsWrap = document.createElement("div");
      slotsWrap.className = "phase-block-slots";
      const currentBlock = {
        ...block,
        source_type: sourceTypeSelect.value,
        source_phase_id: (sourceTypeSelect.value === "phase" || sourceTypeSelect.value === "match") && sourcePhaseSelect.value ? Number(sourcePhaseSelect.value) : null,
        teams_per_group: isEinzelspiel ? 2 : Math.max(2, Number(teamsPerGroupInput.value) || 4)
      };
      const sourcePool = buildSourceOptions(currentBlock, teams, blocksByPhase);
      const sourceKey = getSourceKey(currentBlock);
      const usedByOthers = new Set(
        blocks.filter((other) => other !== block && getSourceKey(other) === sourceKey).flatMap((other) => Array.isArray(other.slots) ? other.slots : []).map((slot) => slot?.entry_value).filter((value) => typeof value === "string" && value.length > 0)
      );
      const localSourcePool = sourcePool.filter((entry) => !usedByOthers.has(entry.value));
      card.dataset.sourceOptions = JSON.stringify(localSourcePool);
      for (let slotIndex = 0; slotIndex < currentBlock.teams_per_group; slotIndex += 1) {
        const row = document.createElement("div");
        row.className = "phase-block-slot";
        if (isEinzelspiel) {
          const slotLabel = document.createElement("span");
          slotLabel.className = "phase-block-slot-label";
          slotLabel.textContent = slotIndex === 0 ? "Heim" : "Gast";
          row.appendChild(slotLabel);
        }
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
        card.dispatchEvent(new CustomEvent("phase-block-config-save", { bubbles: true }));
      });
      syncSlotSelectOptionsInBlock(card);
    });
  }
  function readPhaseBlocksFromContainer(container) {
    const cards = [...container.querySelectorAll(".phase-block")];
    return cards.map((card, position) => {
      const blockName = normalizeBlockName(
        card.querySelector(".phase-block-name-input")?.value,
        position
      );
      const blockType = card.dataset.blockType || "gruppe";
      const rawSourceType = card.querySelector(".phase-block-source-type")?.value || "teams";
      const sourceType = ["phase", "match"].includes(rawSourceType) ? rawSourceType : "teams";
      const sourcePhaseValue = card.querySelector(".phase-block-source-phase")?.value || "";
      const sourcePhaseId = (sourceType === "phase" || sourceType === "match") && sourcePhaseValue ? Number(sourcePhaseValue) : null;
      const teamsPerGroup = blockType === "einzelspiel" ? 2 : Math.max(2, Number(card.querySelector(".phase-block-teams-per-group")?.value) || 4);
      const slots = Array.from({ length: teamsPerGroup }, (_, slotIndex) => {
        const select = card.querySelector(`.phase-block-slot-select[data-slot-index="${slotIndex}"]`);
        return {
          slot_index: slotIndex,
          entry_value: select?.value ? select.value : null
        };
      });
      return {
        id: card.dataset.blockId ? Number(card.dataset.blockId) : null,
        block_name: blockName,
        block_type: blockType,
        source_type: sourceType,
        source_phase_id: sourcePhaseId,
        teams_per_group: teamsPerGroup,
        position,
        slots
      };
    });
  }
  function createDefaultPhaseBlock() {
    return {
      id: null,
      block_name: "",
      block_type: "gruppe",
      source_type: "teams",
      source_phase_id: null,
      teams_per_group: 4,
      position: 0,
      slots: []
    };
  }
  function createDefaultEinzelspielBlock() {
    return {
      id: null,
      block_name: "",
      block_type: "einzelspiel",
      source_type: "teams",
      source_phase_id: null,
      teams_per_group: 2,
      position: 0,
      slots: []
    };
  }
  var init_phase_blocks_layout = __esm({
    "public/phase-blocks-layout.js"() {
    }
  });

  // public/placements-store.js
  async function loadPlacements() {
    const response = await fetch("/api/placements");
    if (!response.ok) {
      throw new Error("Failed to load placements");
    }
    const data = await response.json();
    return data.placements || [];
  }
  async function getPlacementSuggestions() {
    const response = await fetch("/api/placements/suggestions");
    if (!response.ok) {
      throw new Error("Failed to load placement suggestions");
    }
    return response.json();
  }
  async function savePlacements(teamCount, placements) {
    const response = await fetch("/api/placements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_count: teamCount, placements })
    });
    if (!response.ok) {
      throw new Error("Failed to save placements");
    }
    const data = await response.json();
    return data.placements || [];
  }
  var init_placements_store = __esm({
    "public/placements-store.js"() {
    }
  });

  // public/placements-layout.js
  function getGroupPhaseOptions(allPhases, blocksByPhase) {
    return allPhases.filter((phase) => {
      const blocks = blocksByPhase.get(phase.id) || [];
      return blocks.some((block) => block.block_type === "gruppe");
    });
  }
  function getGroupBlocksForPhase(phaseId, blocksByPhase) {
    const blocks = blocksByPhase.get(phaseId) || [];
    return blocks.filter((block) => block.block_type === "gruppe");
  }
  function getGroupDisplayName(groupBlock, indexInPhase) {
    const explicitName = String(groupBlock?.block_name || "").trim();
    if (explicitName) {
      return explicitName;
    }
    return `Gruppe ${indexInPhase + 1}`;
  }
  function getMatchPhaseOptions(allPhases, blocksByPhase) {
    return allPhases.filter((phase) => {
      const blocks = blocksByPhase.get(phase.id) || [];
      return blocks.some((block) => block.block_type === "einzelspiel");
    });
  }
  function getMatchBlocksForPhase(phaseId, blocksByPhase) {
    const blocks = blocksByPhase.get(phaseId) || [];
    return blocks.filter((block) => block.block_type === "einzelspiel");
  }
  function renderPlacementsUI(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase = /* @__PURE__ */ new Map()) {
    return renderPlacementsUIWithBlocks(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase);
  }
  function renderPlacementsUIWithBlocks(mountPoint, placements, teamCount, allTeams, allPhases, blocksByPhase) {
    mountPoint.innerHTML = "";
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
  function readPlacementsFromUI(container) {
    const placementRows = container?.querySelectorAll(".placements-overview-row") || [];
    const placements = [];
    for (const row of placementRows) {
      const labelInput = row.querySelector(".placement-label-input");
      const typeSelect = row.querySelector(".placement-entry-type-select");
      const entryType = typeSelect?.value || "team";
      const entry = {
        entry_type: entryType
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
        entries: [entry]
      });
    }
    return placements;
  }
  function createPlacementsOverview(placements, allTeams, allPhases, blocksByPhase) {
    const overview = document.createElement("div");
    overview.className = "placements-overview";
    const title = document.createElement("h3");
    title.textContent = "Platzierungen \xDCbersicht";
    overview.appendChild(title);
    const table = document.createElement("table");
    table.className = "placements-overview-table";
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
    const tbody = document.createElement("tbody");
    for (let placementIndex = 0; placementIndex < placements.length; placementIndex += 1) {
      let setEmptyCell = function(cell) {
        cell.innerHTML = "";
        const placeholder = document.createElement("span");
        placeholder.className = "placement-empty-cell";
        placeholder.textContent = "-";
        cell.appendChild(placeholder);
      }, renderVariantControls = function() {
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
        const phases = selectedType === "group_rank" ? getGroupPhaseOptions(allPhases, blocksByPhase) : getMatchPhaseOptions(allPhases, blocksByPhase);
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
      };
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
  var init_placements_layout = __esm({
    "public/placements-layout.js"() {
    }
  });

  // public/tournament-planning-layout.js
  function mountTournamentPlanningLayout(mount) {
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
      gridArea
    };
  }
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
  function renderTournamentPlanningPhases(phaseSelect, phases) {
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
  function renderTournamentPlanningGroups(groupSelect, selectedPhaseIds, phaseBlocksByPhase, phases) {
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
      placeholder.textContent = selectedPhaseIds.length === 0 ? "Zuerst Phase auswaehlen" : "Keine Bausteine in ausgewaehlten Phasen";
      groupSelect.appendChild(placeholder);
    }
  }
  function renderTournamentPlanningFields(fieldSelect, maxFields) {
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
  function readSelectedPhaseIds(phaseSelect) {
    return [...phaseSelect.selectedOptions].map((o) => Number(o.value));
  }
  function renderMatchGrid(gridArea, matches, phases, teamsWithIds) {
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
      button.textContent = `${phaseName} l\xF6schen`;
      bar.appendChild(button);
    });
    return bar;
  }
  function buildGlobalBoard(matches, fields, timeSlots, teamNameById, phaseNameById) {
    const board = document.createElement("div");
    board.className = "tp-field-columns";
    board.style.setProperty("--tp-field-count", String(fields.length));
    const matchLookup = /* @__PURE__ */ new Map();
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
  function resolveTeamLabel(teamId, teamRef, teamNameById) {
    if (teamId) {
      return teamNameById.get(teamId) || `Team #${teamId}`;
    }
    return teamRef || "?";
  }
  var init_tournament_planning_layout = __esm({
    "public/tournament-planning-layout.js"() {
    }
  });

  // public/tournament-planning-store.js
  async function loadTeamsWithIds() {
    const response = await fetch("/api/teams/with-ids");
    if (!response.ok) {
      throw new Error("Teams konnten nicht geladen werden.");
    }
    const payload = await response.json();
    return Array.isArray(payload.teams) ? payload.teams : [];
  }
  async function loadMatches() {
    const response = await fetch("/api/matches");
    if (!response.ok) {
      throw new Error("Matches konnten nicht geladen werden.");
    }
    const payload = await response.json();
    return Array.isArray(payload.matches) ? payload.matches : [];
  }
  async function saveMatchesForPhase(phaseId, matches) {
    const response = await fetch(`/api/matches/phase/${encodeURIComponent(phaseId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches })
    });
    if (!response.ok) {
      throw new Error(`Matches fuer Phase ${phaseId} konnten nicht gespeichert werden.`);
    }
    const payload = await response.json();
    return Array.isArray(payload.matches) ? payload.matches : [];
  }
  async function deleteMatchesForPhase(phaseId) {
    const response = await fetch(`/api/matches/phase/${encodeURIComponent(phaseId)}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error(`Matches fuer Phase ${phaseId} konnten nicht geloescht werden.`);
    }
  }
  var init_tournament_planning_store = __esm({
    "public/tournament-planning-store.js"() {
    }
  });

  // public/tournament-planning-calculations.js
  function addMinutes(timeStr, minutes) {
    const parts = (timeStr || "09:00").split(":");
    const totalMinutes = (Number(parts[0] || 0) * 60 + Number(parts[1] || 0) + minutes) % 1440;
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function resolveSlot(slot, teamsByName, phaseBlocksByPhase, debugContext) {
    if (!slot || !slot.entry_value) {
      if (debugContext) {
        console.log(`        resolveSlot(${debugContext}): slot is empty/null, returning null`);
      }
      return null;
    }
    const val = slot.entry_value;
    if (debugContext) {
      console.log(`        resolveSlot(${debugContext}): entry_value="${val}"`);
    }
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
  function findBlockName(blockId, phaseBlocksByPhase) {
    for (const blocks of phaseBlocksByPhase.values()) {
      const found = blocks.find((b) => b.id === blockId);
      if (found) {
        return found.block_name || `Block ${blockId}`;
      }
    }
    return `Block ${blockId}`;
  }
  function generateRoundRobin(teamEntries) {
    if (teamEntries.length < 2) {
      return [];
    }
    const teams = [...teamEntries];
    if (teams.length % 2 !== 0) {
      teams.push(null);
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
        if (t1 !== null && t2 !== null) {
          matches.push({ round, team1: t1, team2: t2 });
        }
      }
      rotating.unshift(rotating.pop());
    }
    return matches;
  }
  function assignFieldsToBlocks(blocks, fields) {
    const assignment = /* @__PURE__ */ new Map();
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
  function buildScheduledMatches(selectedBlockRefs, phaseBlocksByPhase, teamsByName, selectedFieldNumbers, setup, existingMatches = []) {
    const setsPerMatch = Math.max(1, Number(setup.sets_per_match) || 1);
    const minutesPerSet = Math.max(1, Number(setup.minutes_per_set) || 10);
    const minutesBetweenSets = Math.max(0, Number(setup.minutes_between_sets) || 0);
    const pauseBetweenMatches = Math.max(0, Number(setup.pause_between_matches) || 0);
    const matchDuration = setsPerMatch * minutesPerSet + Math.max(0, setsPerMatch - 1) * minutesBetweenSets;
    const slotDuration = matchDuration + pauseBetweenMatches;
    const startTime = setup.tournament_time || "09:00";
    const fields = selectedFieldNumbers.length > 0 ? selectedFieldNumbers : [1];
    const getSlotIndexFromTime = (time) => {
      const [startH, startM] = startTime.split(":").map((v) => Number(v || 0));
      const [h, m] = String(time || "").split(":").map((v) => Number(v || 0));
      const startMinutes = startH * 60 + startM;
      const minutes = h * 60 + m;
      const diff = Math.max(0, minutes - startMinutes);
      return Math.floor(diff / Math.max(1, slotDuration));
    };
    const phaseOrder = [];
    const refsByPhase = /* @__PURE__ */ new Map();
    for (const ref of selectedBlockRefs) {
      if (!refsByPhase.has(ref.phaseId)) {
        refsByPhase.set(ref.phaseId, []);
        phaseOrder.push(ref.phaseId);
      }
      refsByPhase.get(ref.phaseId).push(ref);
    }
    console.log("DEBUG buildScheduledMatches: phaseOrder:", phaseOrder);
    console.log("DEBUG buildScheduledMatches: refsByPhase:", refsByPhase);
    const allMatches = [];
    let position = 0;
    const fieldSlotIndex = new Map(fields.map((f) => [f, 0]));
    existingMatches.filter((m) => fields.includes(Number(m.field_number))).forEach((m) => {
      const field = Number(m.field_number);
      const idx = getSlotIndexFromTime(m.start_time) + 1;
      const prev = fieldSlotIndex.get(field) || 0;
      fieldSlotIndex.set(field, Math.max(prev, idx));
    });
    for (const phaseId of phaseOrder) {
      const blockRefs = refsByPhase.get(phaseId);
      const phaseBlocks = phaseBlocksByPhase.get(phaseId) || [];
      const matchesBefore = allMatches.length;
      console.log(`DEBUG buildScheduledMatches: Phase ${phaseId}:`);
      console.log(`  - blockRefs:`, blockRefs);
      console.log(`  - phaseBlocks available:`, phaseBlocks.length, phaseBlocks.map((b) => ({ id: b.id, name: b.block_name })));
      const blocks = blockRefs.map((ref) => {
        const found = phaseBlocks.find((b) => b.id === ref.blockId);
        console.log(`  - Looking for blockId ${ref.blockId}: ${found ? "FOUND" : "NOT FOUND"}`);
        return found;
      }).filter(Boolean);
      console.log(`  - Resolved blocks: ${blocks.length}`);
      if (blocks.length === 0) {
        console.log(`  - Skipping phase ${phaseId}: no blocks found`);
        continue;
      }
      const blockMatchSets = blocks.map((block) => {
        const isEinzelspiel = block.block_type === "einzelspiel";
        const slots = Array.isArray(block.slots) ? block.slots : [];
        console.log(`    - Block ${block.id} (${block.block_name}): type=${block.block_type}, slots=${slots.length}`);
        let rawPairs;
        if (isEinzelspiel) {
          const t1 = resolveSlot(slots[0], teamsByName, phaseBlocksByPhase, `slot1`);
          const t2 = resolveSlot(slots[1], teamsByName, phaseBlocksByPhase, `slot2`);
          rawPairs = t1 && t2 ? [{ round: 0, team1: t1, team2: t2 }] : [];
        } else {
          const teamEntries = slots.map((s, idx) => resolveSlot(s, teamsByName, phaseBlocksByPhase, `slot${idx}`)).filter(Boolean);
          console.log(`      - Teams resolved: ${teamEntries.length}`);
          rawPairs = generateRoundRobin(teamEntries);
        }
        console.log(`      - Pairs generated: ${rawPairs.length}`);
        return { block, pairs: rawPairs };
      });
      const fieldAssignment = assignFieldsToBlocks(blocks, fields);
      const maxRound = Math.max(
        0,
        ...blockMatchSets.map(
          ({ pairs }) => pairs.length > 0 ? Math.max(...pairs.map((p) => p.round)) : 0
        )
      );
      console.log(`  - blockMatchSets: ${blockMatchSets.length} blocks`);
      console.log(`  - maxRound: ${maxRound}`);
      for (let round = 0; round <= maxRound; round += 1) {
        for (const { block, pairs } of blockMatchSets) {
          const roundPairs = pairs.filter((p) => p.round === round);
          if (roundPairs.length === 0) {
            continue;
          }
          console.log(`    - Round ${round}, Block ${block.id}: ${roundPairs.length} pairs`);
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
              position: position++
            });
          });
        }
      }
      console.log(`  - Phase ${phaseId} done: ${allMatches.length - matchesBefore} matches added (total so far: ${allMatches.length})`);
    }
    return allMatches;
  }
  var init_tournament_planning_calculations = __esm({
    "public/tournament-planning-calculations.js"() {
    }
  });

  // public/app.js
  var require_app = __commonJS({
    "public/app.js"() {
      init_calculations();
      init_data_store();
      init_layout();
      init_phase_blocks_store();
      init_phase_blocks_layout();
      init_placements_store();
      init_placements_layout();
      init_tournament_planning_layout();
      init_tournament_planning_store();
      init_tournament_planning_calculations();
      init_tournament_planning_layout();
      var appLayout = document.getElementById("appLayout");
      var navToggle = document.getElementById("navToggle");
      var sidebarBackdrop = document.getElementById("sidebarBackdrop");
      var menuGroups = [...document.querySelectorAll(".menu-group")];
      var levelOneButtons = [...document.querySelectorAll(".menu-btn.level-1")];
      var menuButtons = [...document.querySelectorAll(".menu-btn.level-2")];
      var sections = [...document.querySelectorAll(".content-section")];
      var settingsMount = document.getElementById("tournamentSettingsMount");
      var teamsMount = document.getElementById("teamsMount");
      var phaseConfigMount = document.getElementById("phaseConfigMount");
      var placementsMount = document.getElementById("placementsMount");
      var tournamentPlanningMount = document.getElementById("tournamentPlanningMount");
      var mobileQuery = window.matchMedia("(max-width: 880px)");
      var settingsUi = mountTournamentSettingsLayout(settingsMount);
      var teamsUi = mountTeamsLayout(teamsMount);
      var phasesUi = mountPhaseConfigLayout(phaseConfigMount);
      var tournamentPlanningUi = mountTournamentPlanningLayout(tournamentPlanningMount);
      var teamsWithIds = [];
      var persistedMatches = [];
      var persistedSettings = getDefaultTournamentSettings();
      var persistedTeams = getDefaultTeams();
      var persistedPhases = getDefaultPhases();
      var persistedPlacements = [];
      var placementsUI = {};
      var placementsAutosaveTimer = null;
      var placementsSaveInFlight = false;
      var placementsSaveQueued = false;
      var phaseBlocksByPhase = /* @__PURE__ */ new Map();
      function isMobile() {
        return mobileQuery.matches;
      }
      function syncBackdrop() {
        const showBackdrop = isMobile() && appLayout.classList.contains("is-open-mobile");
        sidebarBackdrop.hidden = !showBackdrop;
      }
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
      function toggleMenuGroup(button) {
        const group = button.closest(".menu-group");
        if (!group) {
          return;
        }
        const isOpen = group.classList.toggle("is-open");
        button.setAttribute("aria-expanded", String(isOpen));
      }
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
      function showPhasesStatus(message, isError = false) {
        setSaveStatus(phasesUi.saveStatus, message, isError);
        setTimeout(() => setSaveStatus(phasesUi.saveStatus, ""), 2500);
      }
      async function savePhasesNow() {
        const draft = readPhasesFromColumns(phasesUi.columnsContainer);
        const saved = await savePhases(draft);
        persistedPhases = saved;
        renderPhaseColumns(phasesUi.columnsContainer, saved);
        refreshBlockPhaseSelectOptions();
        await loadAllPhaseBlocks();
        renderAllPhaseBlocks();
      }
      function getVisiblePhasesDraft() {
        const draftPhases = readPhasesFromColumns(phasesUi.columnsContainer);
        if (draftPhases.length === 0) {
          return persistedPhases.map((phase) => ({
            id: Number.isInteger(phase.id) && phase.id > 0 ? phase.id : null,
            name: phase.name || ""
          }));
        }
        return draftPhases.map((phase) => ({
          id: Number.isInteger(phase.id) && phase.id > 0 ? phase.id : null,
          name: phase.name || ""
        }));
      }
      function getVisibleSavedPhases() {
        return getVisiblePhasesDraft().filter((phase) => Number.isInteger(phase.id) && phase.id > 0);
      }
      function refreshBlockPhaseSelectOptions() {
        const currentValue = phasesUi.blockPhaseSelect.value;
        const phases = getVisiblePhasesDraft();
        const savedPhases = phases.filter((phase) => Number.isInteger(phase.id) && phase.id > 0);
        phasesUi.blockPhaseSelect.innerHTML = '<option value="">Phase waehlen</option>';
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
      async function loadAllPhaseBlocks() {
        const phases = persistedPhases.filter((phase) => Number.isInteger(phase.id) && phase.id > 0);
        const entries = await Promise.all(
          phases.map(async (phase) => [phase.id, await loadPhaseBlocks(phase.id)])
        );
        phaseBlocksByPhase = new Map(entries);
      }
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
          phaseBlocksByPhase = /* @__PURE__ */ new Map();
          showPhasesStatus("Laden fehlgeschlagen", true);
        }
      }
      function showPlacementsStatus(message, isError = false) {
        if (!placementsUI.statusDisplay) {
          placementsUI.statusDisplay = document.createElement("div");
          placementsUI.statusDisplay.className = "status-display";
          placementsMount.appendChild(placementsUI.statusDisplay);
        }
        placementsUI.statusDisplay.textContent = message;
        placementsUI.statusDisplay.className = `status-display ${isError ? "is-error" : ""}`;
      }
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
      function schedulePlacementsAutosave() {
        if (placementsAutosaveTimer) {
          clearTimeout(placementsAutosaveTimer);
        }
        showPlacementsStatus("Speichern...");
        placementsAutosaveTimer = setTimeout(() => {
          persistPlacementsNow();
        }, 350);
      }
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
      async function initializePlacements() {
        try {
          const loaded = await loadPlacements();
          const teamCount = persistedTeams.length;
          const placementsForCurrentTeamCount = loaded.filter((placement) => Number(placement.team_count) === teamCount).sort((a, b) => Number(a.position_index) - Number(b.position_index));
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
      function refreshTournamentPlanningGroups() {
        const selectedPhaseIds = readSelectedPhaseIds(tournamentPlanningUi.phaseSelect);
        renderTournamentPlanningGroups(
          tournamentPlanningUi.groupSelect,
          selectedPhaseIds,
          phaseBlocksByPhase,
          persistedPhases
        );
      }
      function renderAllMatchGrid() {
        renderMatchGrid(
          tournamentPlanningUi.gridArea,
          persistedMatches,
          persistedPhases,
          teamsWithIds
        );
      }
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
      function getSelectedBlockRefs() {
        const allPhaseOptions = [...tournamentPlanningUi.phaseSelect.options].map((o) => ({
          value: o.value,
          text: o.text,
          selected: o.selected,
          disabled: o.disabled
        }));
        console.log("DEBUG: All phases in phaseSelect:", allPhaseOptions);
        const selectedGroupRefs = [...tournamentPlanningUi.groupSelect.selectedOptions].map((o) => {
          const dashIdx = o.value.indexOf("-");
          return {
            phaseId: Number(o.value.slice(0, dashIdx)),
            blockId: Number(o.value.slice(dashIdx + 1))
          };
        }).filter((ref) => ref.phaseId > 0 && ref.blockId > 0);
        console.log("DEBUG: getSelectedBlockRefs - selectedGroupRefs (explicit):", selectedGroupRefs);
        const selectedPhaseIds = new Set(readSelectedPhaseIds(tournamentPlanningUi.phaseSelect));
        console.log("DEBUG: getSelectedBlockRefs - selectedPhaseIds:", Array.from(selectedPhaseIds));
        const phasesWithSelectedGroups = new Set(selectedGroupRefs.map((ref) => ref.phaseId));
        console.log("DEBUG: getSelectedBlockRefs - phasesWithSelectedGroups:", Array.from(phasesWithSelectedGroups));
        let result = [...selectedGroupRefs];
        selectedPhaseIds.forEach((phaseId) => {
          if (!phasesWithSelectedGroups.has(phaseId)) {
            const blocks = phaseBlocksByPhase.get(phaseId) || [];
            console.log(`DEBUG: getSelectedBlockRefs - Adding all blocks for phase ${phaseId}:`, blocks.map((b) => ({ id: b.id, name: b.block_name })));
            blocks.forEach((block) => {
              const blockId = Number(block.id);
              if (Number.isInteger(blockId) && blockId > 0) {
                result.push({ phaseId, blockId });
              }
            });
          }
        });
        console.log("DEBUG: getSelectedBlockRefs - final result:", result);
        return result;
      }
      function getSelectedFieldNumbers() {
        const selected = [...tournamentPlanningUi.fieldSelect.selectedOptions].map((o) => Number(o.value));
        if (selected.length > 0) {
          return selected;
        }
        return [...tournamentPlanningUi.fieldSelect.options].map((o) => Number(o.value)).filter((value) => Number.isInteger(value) && value > 0);
      }
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
      function addMinutesToTime(baseTime, minutes) {
        const [h, m] = String(baseTime || "00:00").split(":").map((v) => Number(v || 0));
        const total = (h * 60 + m + minutes) % 1440;
        const hh = Math.floor(total / 60);
        const mm = total % 60;
        return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      }
      function getMatchSlotDurationMinutes() {
        const setsPerMatch = Math.max(1, Number(persistedSettings.sets_per_match) || 1);
        const minutesPerSet = Math.max(1, Number(persistedSettings.minutes_per_set) || 10);
        const minutesBetweenSets = Math.max(0, Number(persistedSettings.minutes_between_sets) || 0);
        const pauseBetweenMatches = Math.max(0, Number(persistedSettings.pause_between_matches) || 0);
        return setsPerMatch * minutesPerSet + Math.max(0, setsPerMatch - 1) * minutesBetweenSets + pauseBetweenMatches;
      }
      function resolvePlanningOrder(blockRefs) {
        const phaseNameById = new Map(persistedPhases.map((phase) => [Number(phase.id), phase.name]));
        const phaseIndexById = new Map(persistedPhases.map((phase, index) => [Number(phase.id), index]));
        const plannedPhaseIds = new Set(
          persistedMatches.map((match) => Number(match.phase_id)).filter((phaseId) => Number.isInteger(phaseId) && phaseId > 0)
        );
        const selectedPhaseIds = new Set(blockRefs.map((ref) => Number(ref.phaseId)));
        const dependenciesByPhase = /* @__PURE__ */ new Map();
        selectedPhaseIds.forEach((phaseId) => dependenciesByPhase.set(phaseId, /* @__PURE__ */ new Set()));
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
            message: `Planung nicht erlaubt:
- ${issues.join("\n- ")}`,
            orderedBlockRefs: []
          };
        }
        const inDegree = /* @__PURE__ */ new Map();
        const outgoing = /* @__PURE__ */ new Map();
        selectedPhaseIds.forEach((phaseId) => {
          inDegree.set(phaseId, 0);
          outgoing.set(phaseId, /* @__PURE__ */ new Set());
        });
        dependenciesByPhase.forEach((deps, phaseId) => {
          deps.forEach((depId) => {
            inDegree.set(phaseId, (inDegree.get(phaseId) || 0) + 1);
            outgoing.get(depId).add(phaseId);
          });
        });
        const queue = [...selectedPhaseIds].filter((phaseId) => (inDegree.get(phaseId) || 0) === 0).sort((a, b) => (phaseIndexById.get(a) || 0) - (phaseIndexById.get(b) || 0));
        const orderedPhaseIds = [];
        while (queue.length > 0) {
          const current = queue.shift();
          orderedPhaseIds.push(current);
          const nextSet = outgoing.get(current) || /* @__PURE__ */ new Set();
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
            orderedBlockRefs: []
          };
        }
        const orderIndexByPhase = new Map(orderedPhaseIds.map((phaseId, index) => [phaseId, index]));
        const orderedBlockRefs = [...blockRefs].sort(
          (a, b) => (orderIndexByPhase.get(Number(a.phaseId)) || 0) - (orderIndexByPhase.get(Number(b.phaseId)) || 0)
        );
        return {
          isValid: true,
          message: "",
          orderedBlockRefs
        };
      }
      async function handleGenerateMatches() {
        let blockRefs = getSelectedBlockRefs();
        console.log("DEBUG: Initial blockRefs from getSelectedBlockRefs():", blockRefs);
        if (blockRefs.length === 0) {
          console.warn("DEBUG: No block refs selected");
          return;
        }
        blockRefs = expandBlockRefsWithSelectedSources(blockRefs);
        console.log("DEBUG: After expandBlockRefsWithSelectedSources:", blockRefs);
        const fieldNumbers = getSelectedFieldNumbers();
        if (fieldNumbers.length === 0) {
          return;
        }
        try {
          teamsWithIds = await loadTeamsWithIds();
        } catch {
        }
        const existingBlockIds = new Set(
          persistedMatches.filter((m) => Number.isInteger(m.block_id)).map((m) => m.block_id)
        );
        const newBlockRefs = blockRefs.filter((ref) => !existingBlockIds.has(ref.blockId));
        console.log("DEBUG: existingBlockIds:", existingBlockIds);
        console.log("DEBUG: newBlockRefs (after filtering out already planned):", newBlockRefs);
        if (newBlockRefs.length === 0) {
          return;
        }
        const planningOrder = resolvePlanningOrder(newBlockRefs);
        if (!planningOrder.isValid) {
          window.alert(planningOrder.message);
          return;
        }
        console.log("DEBUG: Planning order valid. orderedBlockRefs:", planningOrder.orderedBlockRefs);
        const teamsByName = new Map(teamsWithIds.map((t) => [t.name, t]));
        const newMatches = buildScheduledMatches(
          planningOrder.orderedBlockRefs,
          phaseBlocksByPhase,
          teamsByName,
          fieldNumbers,
          persistedSettings,
          persistedMatches
        );
        console.log("DEBUG: newMatches generated:", newMatches.length, "matches");
        console.log("DEBUG: newMatches by phase:", newMatches.map((m) => ({ phase_id: m.phase_id, team1: m.team1, team2: m.team2 })));
        if (newMatches.length === 0) {
          console.warn("DEBUG: No new matches generated!");
          return;
        }
        const phaseOrder = [];
        const newMatchesByPhase = /* @__PURE__ */ new Map();
        newMatches.forEach((m) => {
          if (!newMatchesByPhase.has(m.phase_id)) {
            newMatchesByPhase.set(m.phase_id, []);
            phaseOrder.push(m.phase_id);
          }
          newMatchesByPhase.get(m.phase_id).push(m);
        });
        console.log("DEBUG: phaseOrder to save:", phaseOrder);
        console.log("DEBUG: newMatchesByPhase keys:", Array.from(newMatchesByPhase.keys()));
        for (const phaseId of phaseOrder) {
          const newPhaseMatches = newMatchesByPhase.get(phaseId) || [];
          const existingPhaseMatches = persistedMatches.filter((m) => m.phase_id === phaseId);
          const combined = [...existingPhaseMatches, ...newPhaseMatches].map((m, i) => ({
            ...m,
            position: i
          }));
          console.log(`DEBUG: Saving phase ${phaseId}: ${newPhaseMatches.length} new matches, ${existingPhaseMatches.length} existing, ${combined.length} total`);
          try {
            const saved = await saveMatchesForPhase(phaseId, combined);
            console.log(`DEBUG: Phase ${phaseId} saved successfully. Received ${saved.length} matches back.`);
            persistedMatches = persistedMatches.filter((m) => m.phase_id !== phaseId).concat(saved);
          } catch (err) {
            console.error(`DEBUG: Error saving phase ${phaseId}:`, err);
          }
        }
        console.log("DEBUG: handleGenerateMatches complete. Total persistedMatches:", persistedMatches.length);
        renderAllMatchGrid();
      }
      function orderPhaseMatchesForSave(phaseMatches) {
        return [...phaseMatches].sort((a, b) => {
          const timeCmp = String(a.start_time || "").localeCompare(String(b.start_time || ""));
          if (timeCmp !== 0) {
            return timeCmp;
          }
          const fieldCmp = Number(a.field_number || 0) - Number(b.field_number || 0);
          if (fieldCmp !== 0) {
            return fieldCmp;
          }
          return Number(a.id || 0) - Number(b.id || 0);
        }).map((match, index) => ({
          ...match,
          position: index
        }));
      }
      async function persistPhaseMatches(phaseId) {
        const phaseMatches = persistedMatches.filter((match) => match.phase_id === phaseId);
        const ordered = orderPhaseMatchesForSave(phaseMatches);
        const saved = await saveMatchesForPhase(phaseId, ordered);
        persistedMatches = persistedMatches.filter((match) => match.phase_id !== phaseId).concat(saved);
      }
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
          start_time: targetTime
        };
        const slotDuration = getMatchSlotDurationMinutes();
        const fieldMatches = persistedMatches.filter(
          (m) => Number(m.field_number) === targetField && Number(m.id) !== Number(movingMatch.id)
        );
        function toMinutes(time) {
          const [h, m] = String(time || "00:00").split(":").map((v) => Number(v || 0));
          return h * 60 + m;
        }
        const candidates = fieldMatches.map((m) => ({ ...m, _desired: String(m.start_time || "00:00") })).concat({ ...movingMatch, _desired: targetTime });
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
        const occupied = /* @__PURE__ */ new Set();
        const updatedById = /* @__PURE__ */ new Map();
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
              start_time: t
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
        tournamentPlanningUi.gridArea.querySelectorAll(".tp-drop-slot.is-drop-target").forEach((slot) => slot.classList.remove("is-drop-target"));
      });
      tournamentPlanningUi.gridArea.addEventListener("dragover", (event) => {
        const slot = event.target.closest(".tp-drop-slot");
        if (!slot) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        tournamentPlanningUi.gridArea.querySelectorAll(".tp-drop-slot.is-drop-target").forEach((el) => {
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
        const confirmed = window.confirm(`Alle geplanten Matches f\xFCr "${phaseName}" wirklich l\xF6schen?`);
        if (!confirmed) {
          return;
        }
        try {
          await deleteMatchesForPhase(phaseId);
          persistedMatches = persistedMatches.filter((m) => m.phase_id !== phaseId);
          renderAllMatchGrid();
        } catch {
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
        const defaultBlock = blockType === "einzelspiel" ? createDefaultEinzelspielBlock() : createDefaultPhaseBlock();
        const currentBlocks = phaseBlocksByPhase.get(phaseId) || [];
        const draftBlocks = [...currentBlocks, defaultBlock].map((block, index) => ({
          ...block,
          position: index
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
      initializeTeams().then(() => initializePhases()).then(() => initializePlacements()).then(() => initializeTournamentPlanning());
      menuGroups.forEach((group) => {
        const button = group.querySelector(".menu-btn.level-1");
        if (!button) {
          return;
        }
        const isOpen = group.classList.contains("is-open");
        button.setAttribute("aria-expanded", String(isOpen));
      });
    }
  });
  require_app();
})();
