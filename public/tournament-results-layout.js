/**
 * Mounts the tournament results overview layout.
 * @param {HTMLElement} targetElement Mount node for the results page.
 * @returns {{content: HTMLElement}} References to key result UI elements.
 */
export function mountTournamentResultsLayout(targetElement) {
  targetElement.innerHTML = "";

  const card = document.createElement("article");
  card.className = "tr-card";

  const content = document.createElement("div");
  content.className = "tr-content";

  const placeholder = document.createElement("div");
  placeholder.className = "placeholder-box";
  placeholder.textContent = "Ergebnisdaten werden geladen...";
  content.appendChild(placeholder);

  card.appendChild(content);
  targetElement.appendChild(card);

  return { content };
}

/**
 * Renders the complete tournament results overview.
 * @param {HTMLElement} content Target container element.
 * @param {{scoring_mode: string, phases: Array<object>, overall_placements: Array<object>}} overview Overview payload.
 * @returns {void}
 */
export function renderTournamentResultsOverview(content, overview) {
  content.innerHTML = "";

  const modeInfo = document.createElement("div");
  modeInfo.className = "tr-mode-info";
  modeInfo.textContent =
    overview.scoring_mode === "offizieller_modus"
      ? "Wertungsmodus: Offizieller Modus"
      : "Wertungsmodus: Vereinfachter Turniermodus";
  content.appendChild(modeInfo);

  if (!Array.isArray(overview.phases) || overview.phases.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "placeholder-box";
    placeholder.textContent = "Noch keine Phasen mit Ergebnissen vorhanden.";
    content.appendChild(placeholder);
  } else {
    overview.phases.forEach((phase) => {
      content.appendChild(createPhaseResultCard(phase));
    });
  }

  content.appendChild(createOverallPlacementsCard(overview.overall_placements || []));
}

/**
 * Creates one phase result card including all group and match blocks.
 * @param {{phase_name?: string, blocks?: Array<object>}} phase Phase result payload.
 * @returns {HTMLElement} Phase card element.
 */
function createPhaseResultCard(phase) {
  const card = document.createElement("section");
  card.className = "tr-phase-card";

  const title = document.createElement("h3");
  title.className = "tr-phase-title";
  title.textContent = String(phase?.phase_name || "Phase");
  card.appendChild(title);

  const blocks = Array.isArray(phase?.blocks) ? phase.blocks : [];
  if (blocks.length === 0) {
    const placeholder = document.createElement("div");
    placeholder.className = "tr-block-empty";
    placeholder.textContent = "Keine Bloecke in dieser Phase.";
    card.appendChild(placeholder);
    return card;
  }

  const groupBlocks = blocks.filter((block) => String(block?.block_type || "") === "gruppe");
  const matchBlocks = blocks.filter((block) => String(block?.block_type || "") !== "gruppe");

  if (groupBlocks.length > 0) {
    const groupGrid = document.createElement("div");
    groupGrid.className = "tr-group-grid";
    groupBlocks.forEach((block) => {
      groupGrid.appendChild(createGroupBlockResult(block));
    });
    card.appendChild(groupGrid);
  }

  matchBlocks.forEach((block) => {
    card.appendChild(createMatchBlockResult(block));
  });

  return card;
}

/**
 * Creates one group block result section with completion marker and standings table.
 * @param {{block_name?: string, expected_match_count?: number, finished_match_count?: number, is_completed?: boolean, groups?: Array<object>}} block Group block payload.
 * @returns {HTMLElement} Group result element.
 */
function createGroupBlockResult(block) {
  const section = document.createElement("div");
  section.className = "tr-block tr-block-group";

  const header = document.createElement("div");
  header.className = "tr-block-head";

  const title = document.createElement("h4");
  title.className = "tr-block-title";
  title.textContent = String(block?.block_name || "Gruppe");

  const marker = document.createElement("span");
  marker.className = `tr-completion-marker ${block?.is_completed ? "is-complete" : "is-open"}`;
  marker.textContent = block?.is_completed
    ? "Alle Gruppenspiele abgeschlossen"
    : `Offen (${Number(block?.finished_match_count || 0)}/${Number(block?.expected_match_count || 0)})`;

  header.appendChild(title);
  header.appendChild(marker);
  section.appendChild(header);

  const rows = Array.isArray(block?.groups) ? block.groups : [];
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tr-block-empty";
    empty.textContent = "Noch keine Tabellenwerte vorhanden.";
    section.appendChild(empty);
    return section;
  }

  const table = document.createElement("table");
  table.className = "tr-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Pl.</th>
        <th>Team</th>
        <th>Sp</th>
        <th>Pkt</th>
        <th>S+</th>
        <th>S=</th>
        <th>S-</th>
        <th>Satzpkt</th>
        <th>Diff</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const setPointsText = `${Number(row.points_scored || 0)}:${Number(row.points_allowed || 0)}`;
    const diffValue = Number(row.point_diff || 0);
    const diffText = formatSignedNumber(diffValue);
    const diffClass = diffValue > 0 ? "tr-positive" : diffValue < 0 ? "tr-negative" : "";
    tr.innerHTML = `
      <td>${Number(row.rank || 0)}</td>
      <td>${escapeHtml(String(row.team_name || "-"))}</td>
      <td>${Number(row.matches_played || 0)}</td>
      <td>${Number(row.ranking_points || 0)}</td>
      <td>${Number(row.sets_won || 0)}</td>
      <td>${Number(row.sets_drawn || 0)}</td>
      <td>${Number(row.sets_lost || 0)}</td>
      <td>${setPointsText}</td>
      <td class="${diffClass}">${diffText}</td>
    `;
    tbody.appendChild(tr);
  });

  section.appendChild(table);
  return section;
}

/**
 * Creates one match block result section with direct match rows.
 * @param {{block_name?: string, matches?: Array<object>}} block Match block payload.
 * @returns {HTMLElement} Match block result element.
 */
function createMatchBlockResult(block) {
  const section = document.createElement("div");
  section.className = "tr-block tr-block-match";

  const title = document.createElement("h4");
  title.className = "tr-block-title";
  title.textContent = String(block?.block_name || "Match");
  section.appendChild(title);

  const rows = Array.isArray(block?.matches) ? block.matches : [];
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tr-block-empty";
    empty.textContent = "Noch keine Matches in diesem Block vorhanden.";
    section.appendChild(empty);
    return section;
  }

  const table = document.createElement("table");
  table.className = "tr-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Zeit</th>
        <th>Feld</th>
        <th>Match</th>
        <th>Status</th>
        <th>Ergebnis</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const statusText = row?.is_finished ? "Abgeschlossen" : "Offen";
    const statusClass = row?.is_finished ? "is-finished" : "is-open";
    const winnerSuffix = row?.winner_label ? ` | Sieger: ${String(row.winner_label)}` : "";

    const team1Label = String(row.team1_label || "?");
    const team2Label = String(row.team2_label || "?");
    let team1OutcomeClass = "";
    let team2OutcomeClass = "";

    if (row?.is_finished) {
      if (row?.winner_label) {
        const winnerLabel = String(row.winner_label);
        if (winnerLabel === team1Label) {
          team1OutcomeClass = "is-winner";
          team2OutcomeClass = "is-loser";
        } else if (winnerLabel === team2Label) {
          team1OutcomeClass = "is-loser";
          team2OutcomeClass = "is-winner";
        }
      }

      if (!team1OutcomeClass && !team2OutcomeClass) {
        team1OutcomeClass = "is-draw";
        team2OutcomeClass = "is-draw";
      }
    }

    const teamsHtml = `
      <span class="tr-team ${team1OutcomeClass}">${escapeHtml(team1Label)}</span>
      <span class="tr-team-sep"> - </span>
      <span class="tr-team ${team2OutcomeClass}">${escapeHtml(team2Label)}</span>
    `;

    tr.innerHTML = `
      <td>${escapeHtml(String(row.start_time || "--:--"))}</td>
      <td>${Number(row.field_number || 0)}</td>
      <td>${teamsHtml}</td>
      <td><span class="tr-status ${statusClass}">${statusText}</span></td>
      <td>${escapeHtml(String(row.set_results_text || "-"))}${escapeHtml(winnerSuffix)}</td>
    `;
    tbody.appendChild(tr);
  });

  section.appendChild(table);
  return section;
}

/**
 * Creates the overall placement overview card shown at the end.
 * @param {Array<object>} placements Resolved overall placements.
 * @returns {HTMLElement} Overall placement section.
 */
function createOverallPlacementsCard(placements) {
  const section = document.createElement("section");
  section.className = "tr-overall-card";

  const title = document.createElement("h3");
  title.className = "tr-overall-title";
  title.textContent = "Gesamtplatzierungsuebersicht";
  section.appendChild(title);

  if (!Array.isArray(placements) || placements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "tr-block-empty";
    empty.textContent = "Keine Gesamtplatzierungen konfiguriert.";
    section.appendChild(empty);
    return section;
  }

  const table = document.createElement("table");
  table.className = "tr-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Platzierung</th>
        <th>Ermitteltes Team</th>
        <th>Quelle</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  placements.forEach((placement) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(String(placement.position_label || "-"))}</td>
      <td>${escapeHtml(String(placement.resolved_team || "-"))}</td>
      <td>${escapeHtml(String(placement.source_label || "-"))}</td>
    `;
    tbody.appendChild(tr);
  });

  section.appendChild(table);
  return section;
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

/**
 * Formats signed values with explicit plus sign for positive numbers.
 * @param {number} value Numeric value.
 * @returns {string} Signed number string.
 */
function formatSignedNumber(value) {
  const numeric = Number(value) || 0;
  if (numeric > 0) {
    return `+${numeric}`;
  }
  return String(numeric);
}
