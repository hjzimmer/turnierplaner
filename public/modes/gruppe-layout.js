/**
 * Mounts the Gruppe mode editor into a container element, rendering group cards
 * with assignable team slots. Mode select changes and slot assignments auto-save via events.
 * @param {HTMLElement} container Phase mode body element to render into.
 * @param {{teamsPerGroup: number, groups: Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>}} config Current Gruppe config.
 * @param {string[]} allTeamNames All team names available in the tournament.
 * @returns {void}
 */
export function mountGruppeEditor(container, config, allTeamNames) {
  container.innerHTML = "";
  container.dataset.mode = "gruppe";

  const tpgRow = document.createElement("div");
  tpgRow.className = "gruppe-tpg-row";

  const tpgLabel = document.createElement("span");
  tpgLabel.className = "gruppe-tpg-label";
  tpgLabel.textContent = "Teams/Gruppe:";
  tpgRow.appendChild(tpgLabel);

  const tpgInput = document.createElement("input");
  tpgInput.type = "number";
  tpgInput.min = "2";
  tpgInput.max = "20";
  tpgInput.step = "1";
  tpgInput.className = "gruppe-tpg-input";
  tpgInput.value = String(config.teamsPerGroup);
  tpgRow.appendChild(tpgInput);

  container.appendChild(tpgRow);

  const groupsEl = document.createElement("div");
  groupsEl.className = "gruppe-groups";
  container.appendChild(groupsEl);

  renderGroupCards(groupsEl, config.teamsPerGroup, config.groups, allTeamNames);

  // Single delegated listener on the groups container — safe across re-renders.
  groupsEl.addEventListener("change", (event) => {
    if (!event.target.classList.contains("gruppe-slot-select")) return;
    event.target.dataset.value = event.target.value;
    rebuildAllSelects(groupsEl, allTeamNames);
    dispatchGruppeChange(container);
  });

  tpgInput.addEventListener("change", () => {
    const newVal = Math.max(2, Math.round(Number(tpgInput.value) || 4));
    tpgInput.value = String(newVal);
    const currentGroups = readGroupsFromEl(groupsEl);
    renderGroupCards(groupsEl, newVal, currentGroups, allTeamNames);
    dispatchGruppeChange(container);
  });
}

/**
 * Renders group cards into the groups container, one card per group, preserving existing assignments.
 * @param {HTMLElement} groupsEl Groups container element.
 * @param {number} teamsPerGroup Number of slots per group.
 * @param {Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>} existingGroups Previously assigned groups.
 * @param {string[]} allTeamNames All team names for populating selects.
 * @returns {void}
 */
function renderGroupCards(groupsEl, teamsPerGroup, existingGroups, allTeamNames) {
  groupsEl.innerHTML = "";
  const groupCount = allTeamNames.length > 0 ? Math.ceil(allTeamNames.length / teamsPerGroup) : 1;

  for (let g = 0; g < groupCount; g++) {
    const existing = existingGroups.find((gr) => gr.groupIndex === g) || { slots: [] };

    const groupEl = document.createElement("div");
    groupEl.className = "gruppe-group";
    groupEl.dataset.groupIndex = String(g);

    const head = document.createElement("div");
    head.className = "gruppe-group-head";
    head.textContent = `Gruppe ${g + 1}`;
    groupEl.appendChild(head);

    for (let s = 0; s < teamsPerGroup; s++) {
      const existingSlot = existing.slots.find((sl) => sl.slotIndex === s);
      const slotEl = document.createElement("div");
      slotEl.className = "gruppe-slot";

      const select = document.createElement("select");
      select.className = "gruppe-slot-select";
      select.dataset.slotIndex = String(s);
      // Store current value as data attribute so rebuildAllSelects can read it
      select.dataset.value = existingSlot?.teamName ?? "";

      slotEl.appendChild(select);
      groupEl.appendChild(slotEl);
    }

    groupsEl.appendChild(groupEl);
  }

  rebuildAllSelects(groupsEl, allTeamNames);
}

/**
 * Rebuilds all slot select option lists to reflect current assignments across groups.
 * Each select shows only unassigned teams plus its own current value.
 * @param {HTMLElement} groupsEl Groups container element.
 * @param {string[]} allTeamNames Complete list of team names.
 * @returns {void}
 */
function rebuildAllSelects(groupsEl, allTeamNames) {
  const selects = [...groupsEl.querySelectorAll(".gruppe-slot-select")];
  const assignedNames = selects.map((s) => s.dataset.value).filter((v) => v !== "");

  selects.forEach((select) => {
    const currentValue = select.dataset.value || "";
    select.innerHTML = "";

    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "–";
    select.appendChild(emptyOpt);

    allTeamNames.forEach((name) => {
      if (!assignedNames.includes(name) || name === currentValue) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
    });

    select.value = currentValue;
  });
}

/**
 * Reads current group assignments from the rendered groups element.
 * @param {HTMLElement} groupsEl Groups container element.
 * @returns {Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>} Current group data.
 */
function readGroupsFromEl(groupsEl) {
  return [...groupsEl.querySelectorAll(".gruppe-group")].map((groupEl) => {
    const groupIndex = Number(groupEl.dataset.groupIndex);
    const slots = [...groupEl.querySelectorAll(".gruppe-slot-select")].map((select) => ({
      slotIndex: Number(select.dataset.slotIndex),
      teamName: select.dataset.value || null,
    }));
    return { groupIndex, slots };
  });
}

/**
 * Reads the full Gruppe configuration from a mounted editor container.
 * @param {HTMLElement} container Mode body element with a mounted gruppe editor.
 * @returns {{teamsPerGroup: number, groups: Array<{groupIndex: number, slots: Array<{slotIndex: number, teamName: string|null}>}>}} Current editor config.
 */
export function readGruppeFromContainer(container) {
  const tpgInput = container.querySelector(".gruppe-tpg-input");
  const teamsPerGroup = Math.max(2, Math.round(Number(tpgInput?.value) || 4));
  const groupsEl = container.querySelector(".gruppe-groups");
  const groups = groupsEl ? readGroupsFromEl(groupsEl) : [];
  return { teamsPerGroup, groups };
}

/**
 * Dispatches a bubbling 'gruppe-change' custom event on the given element.
 * @param {HTMLElement} element Element to dispatch the event on.
 * @returns {void}
 */
function dispatchGruppeChange(element) {
  element.dispatchEvent(new CustomEvent("gruppe-change", { bubbles: true }));
}
