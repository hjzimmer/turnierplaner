/**
 * Renders the tournament setup form layout into a mount element.
 * @param {HTMLElement} targetElement DOM node where the layout is inserted.
 * @returns {{form: HTMLFormElement, saveButton: HTMLButtonElement, saveStatus: HTMLElement}} References to key setup UI nodes.
 */
export function mountTournamentSettingsLayout(targetElement) {
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
    saveStatus: targetElement.querySelector("#saveStatus"),
  };
}

/**
 * Renders the scoring mode selection layout into a mount element.
 * @param {HTMLElement} targetElement DOM node where the layout is inserted.
 * @returns {{form: HTMLFormElement, saveButton: HTMLButtonElement, saveStatus: HTMLElement}} References to key scoring mode UI nodes.
 */
export function mountScoringModeLayout(targetElement) {
  targetElement.innerHTML = `
    <article class="settings-card" aria-label="Wertungsmodus">
      <h3>Wertungsmodus</h3>
      <p class="settings-description">
        Der Modus steuert die Bewertung der Spielergebnisse in allen Matches.
      </p>

      <form id="scoringModeForm" class="settings-form" novalidate>
        <section class="settings-section scoring-mode-options" aria-label="Auswahl Wertungsmodus">
          <label class="scoring-mode-option">
            <input type="radio" name="mode_key" value="vereinfachter_turniermodus" />
            <div class="scoring-mode-option-content">
              <h4>Vereinfachter Turniermodus</h4>
              <p>
                Fokus auf schnelle und einfache Auswertung. Ergebnisse werden kompakt erfasst
                und direkt als Match-Ausgang gewertet.
              </p>
            </div>
          </label>

          <label class="scoring-mode-option">
            <input type="radio" name="mode_key" value="offizieller_modus" />
            <div class="scoring-mode-option-content">
              <h4>Offizieller Modus</h4>
              <p>
                Vollstaendige Wettkampfwertung mit detaillierter Beruecksichtigung der Satzresultate
                gemaess offiziellen Turnierregeln.
              </p>
            </div>
          </label>
        </section>

        <footer class="settings-footer">
          <span id="scoringModeSaveStatus" class="save-status" aria-live="polite">Keine Aenderungen</span>
          <button id="saveScoringModeBtn" class="save-btn" type="submit" disabled>Speichern</button>
        </footer>
      </form>
    </article>
  `;

  return {
    form: targetElement.querySelector("#scoringModeForm"),
    saveButton: targetElement.querySelector("#saveScoringModeBtn"),
    saveStatus: targetElement.querySelector("#scoringModeSaveStatus"),
  };
}

/**
 * Writes a numeric value into a named form control.
 * @param {HTMLFormElement} form Source form.
 * @param {string} fieldName Name of the form field.
 * @param {number} value Numeric value to render.
 * @returns {void}
 */
function setNumberValue(form, fieldName, value) {
  const input = form.elements.namedItem(fieldName);
  if (input) {
    input.value = String(value ?? 0);
  }
}

/**
 * Fills the setup form with values from a settings object.
 * @param {HTMLFormElement} form Target setup form.
 * @param {object} settings Setup values.
 * @returns {void}
 */
export function writeTournamentSettingsToForm(form, settings) {
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

/**
 * Reads a numeric value from a named form control.
 * @param {HTMLFormElement} form Source form.
 * @param {string} fieldName Name of the form field.
 * @returns {number} Parsed numeric value.
 */
function readNumber(form, fieldName) {
  const input = form.elements.namedItem(fieldName);
  return input ? Number(input.value) : 0;
}

/**
 * Extracts setup values from the form into a plain object.
 * @param {HTMLFormElement} form Source setup form.
 * @returns {object} Raw setup payload.
 */
export function readTournamentSettingsFromForm(form) {
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
      duration: readNumber(form, "lunch_break_duration"),
    },
  };
}

/**
 * Toggles save button enabled state.
 * @param {HTMLButtonElement} saveButton Save action button.
 * @param {boolean} enabled Whether the button should be enabled.
 * @returns {void}
 */
export function setSaveButtonState(saveButton, enabled) {
  saveButton.disabled = !enabled;
}

/**
 * Updates the visible save status text and error styling.
 * @param {HTMLElement} saveStatusElement Status element.
 * @param {string} message Message to display.
 * @param {boolean} [isError=false] Whether to show the error state.
 * @returns {void}
 */
export function setSaveStatus(saveStatusElement, message, isError = false) {
  saveStatusElement.textContent = message;
  saveStatusElement.classList.toggle("is-error", isError);
}

/**
 * Renders the teams editor layout into a mount element.
 * @param {HTMLElement} targetElement DOM node where the layout is inserted.
 * @returns {{form: HTMLFormElement, rowsContainer: HTMLElement, addButton: HTMLButtonElement, saveButton: HTMLButtonElement, saveStatus: HTMLElement}} References to key team UI nodes.
 */
export function mountTeamsLayout(targetElement) {
  targetElement.innerHTML = `
    <article class="settings-card" aria-label="Team-Einstellungen">
      <h3>Teamverwaltung</h3>
      <p class="settings-description">
        Variable Teamliste. Die Team-ID wird nur intern in der Datenbank vergeben.
      </p>

      <form id="teamsForm" class="settings-form" novalidate>
        <section class="settings-section">
          <h4>Teams</h4>
          <table class="teams-table" aria-label="Teamliste">
            <thead>
              <tr>
                <th scope="col">Teamname</th>
                <th scope="col">Spielendes Team</th>
                <th scope="col">Als Schiedsrichter</th>
                <th scope="col">Aktion</th>
              </tr>
            </thead>
            <tbody id="teamRows" class="team-rows"></tbody>
          </table>
          <button id="addTeamBtn" class="add-team-btn" type="button" aria-label="Team hinzufuegen">+</button>
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
    saveStatus: targetElement.querySelector("#teamsSaveStatus"),
  };
}

/**
 * Creates a single editable team row element.
 * @param {string} [value=""] Initial team name value.
 * @param {boolean} [availableAsTeam=true] Whether the team can be used as a playing team.
 * @param {boolean} [availableAsReferee=false] Whether the team can be used as a referee.
 * @returns {HTMLTableRowElement} Team row container element.
 */
function createTeamRowElement(value = "", availableAsTeam = true, availableAsReferee = false) {
  const row = document.createElement("tr");
  row.className = "team-row";

  const nameCell = document.createElement("td");
  nameCell.className = "team-cell team-cell-name";

  const input = document.createElement("input");
  input.className = "team-name-input";
  input.type = "text";
  input.name = "team_name";
  input.autocomplete = "off";
  input.value = value;
  nameCell.appendChild(input);

  const playableCell = document.createElement("td");
  playableCell.className = "team-cell team-cell-playable";

  const playableWrap = document.createElement("div");
  playableWrap.className = "team-role-options";

  const playableLabel = document.createElement("label");
  playableLabel.className = "team-role-option";

  const playableCheckbox = document.createElement("input");
  playableCheckbox.className = "team-playing-checkbox";
  playableCheckbox.type = "checkbox";
  playableCheckbox.name = "team_available_as_team";
  playableCheckbox.checked = Boolean(availableAsTeam);

  const playableText = document.createElement("span");
  playableText.textContent = "Ja";

  playableLabel.appendChild(playableCheckbox);
  playableLabel.appendChild(playableText);
  playableWrap.appendChild(playableLabel);
  playableCell.appendChild(playableWrap);

  const refereeCell = document.createElement("td");
  refereeCell.className = "team-cell team-cell-referee";

  const refereeWrap = document.createElement("div");
  refereeWrap.className = "team-role-options";

  const refereeLabel = document.createElement("label");
  refereeLabel.className = "team-role-option";

  const refereeCheckbox = document.createElement("input");
  refereeCheckbox.className = "team-referee-checkbox";
  refereeCheckbox.type = "checkbox";
  refereeCheckbox.name = "team_available_as_referee";
  refereeCheckbox.checked = Boolean(availableAsReferee);

  const refereeText = document.createElement("span");
  refereeText.textContent = "Ja";

  refereeLabel.appendChild(refereeCheckbox);
  refereeLabel.appendChild(refereeText);
  refereeWrap.appendChild(refereeLabel);
  refereeCell.appendChild(refereeWrap);

  const actionCell = document.createElement("td");
  actionCell.className = "team-cell team-cell-action";

  const removeButton = document.createElement("button");
  removeButton.className = "team-remove-btn";
  removeButton.type = "button";
  removeButton.textContent = "🗑";
  removeButton.setAttribute("aria-label", "Team entfernen");

  actionCell.appendChild(removeButton);

  row.appendChild(nameCell);
  row.appendChild(playableCell);
  row.appendChild(refereeCell);
  row.appendChild(actionCell);
  return row;
}

/**
 * Re-renders all team rows from a team list.
 * @param {HTMLElement} rowsContainer Container for team rows.
 * @param {Array<{name?: string, available_as_team?: boolean, available_as_referee?: boolean}>} teams Team list.
 * @returns {void}
 */
export function renderTeamsRows(rowsContainer, teams) {
  rowsContainer.innerHTML = "";
  const source =
    Array.isArray(teams) && teams.length > 0
      ? teams
      : [{ name: "", available_as_team: true, available_as_referee: false }];

  source.forEach((team) => {
    rowsContainer.appendChild(
      createTeamRowElement(
        team.name || "",
        team.available_as_team !== false,
        team.available_as_referee === true
      )
    );
  });
}

/**
 * Appends one empty team row to the teams container.
 * @param {HTMLElement} rowsContainer Container for team rows.
 * @returns {HTMLDivElement} Newly created team row.
 */
export function addTeamRow(rowsContainer) {
  const row = createTeamRowElement("", true, false);
  rowsContainer.appendChild(row);
  return row;
}

/**
 * Reads all visible team names from the teams container.
 * @param {HTMLElement} rowsContainer Container for team rows.
 * @returns {Array<{name: string, available_as_team: boolean, available_as_referee: boolean}>} Raw team payload from inputs.
 */
export function readTeamsFromRows(rowsContainer) {
  const rows = [...rowsContainer.querySelectorAll(".team-row")];
  return rows.map((row) => ({
    name: row.querySelector(".team-name-input")?.value || "",
    available_as_team: row.querySelector(".team-playing-checkbox")?.checked === true,
    available_as_referee: row.querySelector(".team-referee-checkbox")?.checked === true,
  }));
}

/**
 * Renders the phase configuration layout into a mount element.
 * @param {HTMLElement} targetElement DOM node where the layout is inserted.
 * @returns {{columnsContainer: HTMLElement, addButton: HTMLButtonElement, addBlockButton: HTMLButtonElement, blockPhaseSelect: HTMLSelectElement, blockTypeSelect: HTMLSelectElement, saveStatus: HTMLElement}} References to phase UI nodes.
 */
export function mountPhaseConfigLayout(targetElement) {
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
    saveStatus: targetElement.querySelector("#phasesSaveStatus"),
  };
}

/**
 * Creates one phase column element with name title, edit/delete icon controls, popup editor, and baustein container.
 * @param {{id?: number|null, name?: string}} [phase={}] Phase data.
 * @returns {HTMLDivElement} Phase column element.
 */
function createPhaseColumnElement({ id = null, name = "" } = {}) {
  const column = document.createElement("div");
  column.className = "phase-column";
  if (id) {
    column.dataset.phaseId = String(id);
  }

  // --- Header: name title + action icons ---
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
  renameButton.textContent = "✎";

  const deleteButton = document.createElement("button");
  deleteButton.className = "phase-icon-btn is-danger";
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.title = "Phase loeschen";
  deleteButton.setAttribute("aria-label", "Phase loeschen");
  deleteButton.textContent = "🗑";

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

  // --- Baustein body: phase blocks mount here ---
  const blockBody = document.createElement("div");
  blockBody.className = "phase-blocks";

  column.appendChild(header);
  column.appendChild(popup);
  column.appendChild(blockBody);
  return column;
}

/**
 * Renders all phase columns from the provided phase list.
 * @param {HTMLElement} columnsContainer Container for phase columns.
 * @param {Array<{id?: number|null, name?: string}>} phases Phase definitions.
 * @returns {void}
 */
export function renderPhaseColumns(columnsContainer, phases) {
  columnsContainer.innerHTML = "";
  const source = Array.isArray(phases) && phases.length > 0 ? phases : [{ id: null, name: "" }];

  source.forEach((phase) => {
    columnsContainer.appendChild(createPhaseColumnElement(phase));
  });
}

/**
 * Appends one new empty phase column (no id, mode disabled until saved).
 * @param {HTMLElement} columnsContainer Container for phase columns.
 * @returns {HTMLDivElement} Newly created phase column.
 */
export function addPhaseColumn(columnsContainer) {
  const column = createPhaseColumnElement({ id: null, name: "" });
  columnsContainer.appendChild(column);
  return column;
}

/**
 * Reads all phase name and id values from rendered columns.
 * @param {HTMLElement} columnsContainer Container for phase columns.
 * @returns {Array<{id: number|null, name: string}>} Phase payload from the current DOM state.
 */
export function readPhasesFromColumns(columnsContainer) {
  const columns = [...columnsContainer.querySelectorAll(".phase-column")];
  return columns.map((column) => ({
    id: column.dataset.phaseId ? Number(column.dataset.phaseId) : null,
    name: column.querySelector(".phase-name-popup-input")?.value || "",
  }));
}
