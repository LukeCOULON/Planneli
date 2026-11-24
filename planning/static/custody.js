import { capitalize, formatDate, parentMarks, parents, renderCalendar, WEEKDAYS } from "./calendar.js";
import {
    activeSheet, api, closeSheet, colorDot, confirmDelete, empty, errorBlock, escapeHtml, field,
    formError, icon, input, pageHeading, safeColor, sheet, styleDropdown, submitForm, textarea, toast,
} from "./ui.js";

const dateAttributes = 'type="date" min="0001-01-01" max="9999-12-31" required';
const parentKeys = ["a", "b"];
const planningSettingsUrl = "/reglages?section=parents";

function parentLegend(list) {
    const marks = parentMarks(list);
    return `<div class="legend" aria-label="Légende">${list.map((item, index) =>
        `<span class="legend-item">${colorDot(item.color)} ${marks[0] === "1" ? `${marks[index]} · ` : ""}${escapeHtml(item.name)}</span>`).join("")}
        <span class="legend-item">${icon("user")} Garde</span>
        <span class="legend-item">${icon("note")} Notes</span></div>`;
}

export function renderPlanning(host, session, position, onSetup) {
    const settings = session.settings;
    const readOnly = session.account.read_only;
    const readOnlyLabel = '<span class="viewer-label">Lecture seule</span>';
    if (!session.custody_enabled) {
        host.innerHTML = pageHeading("Planning de garde", "calendar", "tone-planning") + empty(
            "Planning de garde désactivé",
            "Vous pouvez consulter vos événements dans l’agenda ou réactiver la garde dans les réglages du calendrier.",
            `<div class="flow"><a class="button primary" href="/evenements" data-route="/evenements">Ouvrir l’agenda</a>
                <a class="button secondary" href="/reglages?section=calendrier" data-route="/reglages">Réglages du calendrier</a></div>`,
        );
        return;
    }
    if (!settings) {
        if (readOnly) {
            host.innerHTML = pageHeading("Mon planning", "calendar", "tone-planning", readOnlyLabel)
                + empty("Planning en préparation", "Le calendrier sera visible dès que les parents auront été configurés.");
            return;
        }
        host.innerHTML = pageHeading("Mon planning", "calendar", "tone-planning") + empty(
            "Configurer l’alternance",
            "Choisissez les deux parents, leurs couleurs et la première semaine de garde.",
            '<button type="button" class="button primary" data-setup>Configurer le planning</button>',
        );
        host.querySelector("[data-setup]").onclick = onSetup;
        return;
    }
    host.innerHTML = pageHeading(
        "Mon planning", "calendar", "tone-planning",
        readOnly ? readOnlyLabel : `<div class="flow planning-actions">
            <a class="button secondary" href="${planningSettingsUrl}" data-route="/reglages">${icon("settings")} Réglages</a>
            <button type="button" class="button primary" data-period>${icon("swap")} Modifier une période</button>
        </div>`,
    ) + '<div class="calendar-host"></div>';
    const list = parents(settings);
    const calendar = renderCalendar(host.querySelector(".calendar-host"), "planning", position, {
        today: session.today,
        timezone: settings.timezone,
        parents: list,
        legend: parentLegend(list),
        onDay: day => openDay(day, settings, calendar.refresh, readOnly),
    });
    const period = host.querySelector("[data-period]");
    if (period) period.onclick = () => openAssignment(settings, position.day, { period: true, onDone: calendar.refresh });
}

function parentSettingsForm(session, listId) {
    const settings = session.settings;
    const list = settings ? parents(settings) : [
        { name: "", color: "#9368db" },
        { name: "", color: "#5c9bbb" },
    ];
    const names = list.map((parent, index) => {
        const key = parentKeys[index];
        return `<fieldset class="planning-parent-editor" data-parent-accent="${key}" style="--parent-accent:${safeColor(parent.color)}">
            <legend>Parent ${index + 1}</legend>
            <div class="name-and-color">
                ${field("Nom", input(`name_${key}`, parent.name, 'required maxlength="50" autocomplete="off"'))}
                ${field("Couleur", input(`color_${key}`, safeColor(parent.color), 'type="color" required'))}
            </div>
        </fieldset>`;
    }).join("");
    const rotation = settings ? [settings.first_parent - 1, 2 - settings.first_parent].map((index, position) => {
        const key = parentKeys[index];
        return `<li data-parent-accent="${key}" style="--parent-accent:${safeColor(list[index].color)}">
            <span>${position ? "Semaine suivante" : "Semaine de départ"}</span>
            <strong data-parent-name="${key}">${escapeHtml(list[index].name)}</strong>
        </li>`;
    }).join("") : "";
    return `<form class="stack planning-form">
        ${settings ? `<section class="planning-reference stack">
            <div><h3>Rotation de référence</h3>
                <p class="muted small">Une semaine par parent à partir du <time datetime="${settings.anchor}">${formatDate(settings.anchor, {
                    day: "numeric", month: "long", year: "numeric",
                })}</time>.</p>
            </div>
            <ol class="planning-rotation">${rotation}</ol>
        </section>` : ""}
        <div class="planning-parent-grid">${names}</div>
        ${settings ? "" : `<div class="fields-two">
            ${field("Semaine de référence", input("anchor", session.today, dateAttributes))}
            ${field("Parent qui commence", '<select name="first_parent"><option value="1">Parent 1</option><option value="2">Parent 2</option></select>')}
        </div>
        <p class="muted small">Le planning démarre le lundi de la semaine choisie.</p>`}
        ${field("Fuseau horaire", input("timezone", settings?.timezone || session.timezone || "Europe/Paris",
            `list="${listId}" maxlength="80" required autocomplete="off"`))}
        <datalist id="${listId}">
            <option value="Europe/Paris"><option value="Europe/Brussels"><option value="Europe/Zurich">
            <option value="America/Montreal"><option value="America/Guadeloupe"><option value="Indian/Reunion">
            <option value="UTC">
        </datalist>
        ${formError}
        <div class="planning-save"><button type="submit" class="button primary">${settings ? "Enregistrer" : "Créer le planning"}</button></div>
    </form>`;
}

function bindParentSettings(form, session, onSave) {
    const { settings } = session;
    const { first_parent: select } = form.elements;
    if (select) styleDropdown(select);
    for (const [index, key] of parentKeys.entries()) {
        const name = form.elements[`name_${key}`];
        const color = form.elements[`color_${key}`];
        const previewName = form.querySelector(`[data-parent-name="${key}"]`);
        const accents = form.querySelectorAll(`[data-parent-accent="${key}"]`);
        name.addEventListener("input", () => {
            const label = name.value.trim() || `Parent ${index + 1}`;
            if (select) select.options[index].textContent = label;
            if (previewName) previewName.textContent = label;
        });
        color.addEventListener("input", () => {
            accents.forEach(item => item.style.setProperty("--parent-accent", safeColor(color.value)));
        });
    }
    submitForm(form, async data => {
        if (!settings) data.first_parent = Number(data.first_parent);
        await api("/settings", settings ? "PUT" : "POST", data);
        toast(settings ? "Réglages enregistrés." : "Planning configuré.");
        await onSave();
    });
}

export function openParentSettings(session, onSave) {
    const content = sheet(session.settings ? "Modifier les parents" : "Configurer le planning",
        parentSettingsForm(session, "sheet-timezones"));
    bindParentSettings(content.querySelector("form"), session, async () => {
        if (activeSheet(content)) closeSheet();
        await onSave();
    });
}

function openAssignment(settings, day, { period = false, manual = false, parent = 1, onDone, onCancel }) {
    const people = parents(settings);
    const dateInputs = period ? `<div class="fields-two">
        ${field("Début", input("start", day, dateAttributes))}
        ${field("Fin", input("end", day, dateAttributes))}
    </div>` : `<input type="hidden" name="start" value="${day}"><input type="hidden" name="end" value="${day}">`;
    const content = sheet(period ? "Modifier une période" : "Modifier l’attribution", `<form class="stack">
        ${dateInputs}
        ${field("Action", `<select name="action"><option value="assign">Attribuer à un parent</option>
            <option value="invert">Inverser l’attribution</option>
            ${period || manual ? '<option value="clear">Retirer les exceptions</option>' : ""}</select>`)}
        <div data-parent-field>${field("Parent", `<select name="parent">${people.map(person =>
            `<option value="${person.id}" ${person.id === parent ? "selected" : ""}>${escapeHtml(person.name)}</option>`,
        ).join("")}</select>`)}</div>
        <div class="info-block" data-preview hidden></div>
        ${formError}
        <div class="sheet-actions">
            ${onCancel ? '<button type="button" class="button secondary" data-cancel>Retour</button>' : ""}
            <button type="submit" class="button secondary" data-preview-button>Calculer l’aperçu</button>
            <button type="submit" class="button primary" data-commit hidden>Appliquer</button>
        </div>
    </form>`, period ? "La modification inclut le premier et le dernier jour." : capitalize(formatDate(day)));
    const form = content.querySelector("form");
    const preview = content.querySelector("[data-preview]");
    const commit = content.querySelector("[data-commit]");
    const error = content.querySelector("[data-error]");
    let previewToken = null;
    let revision = 0;
    if (onCancel) content.querySelector("[data-cancel]").onclick = onCancel;

    function invalidate() {
        revision += 1;
        previewToken = null;
        preview.hidden = commit.hidden = true;
        error.hidden = true;
        content.querySelector("[data-parent-field]").hidden = form.elements.action.value !== "assign";
        if (period && form.elements.start.value) form.elements.end.min = form.elements.start.value;
    }

    form.addEventListener("input", invalidate);
    submitForm(form, async (data, button) => {
        data.parent = Number(data.parent);
        if (button === commit) {
            if (!previewToken) throw new Error("Calculez d’abord l’aperçu.");
            try {
                await api("/assignments", "POST", { ...data, token: previewToken });
            } catch (problem) {
                if (problem.status === 409) invalidate();
                throw problem;
            }
            toast(period ? "Période mise à jour." : "Attribution mise à jour.");
            if (activeSheet(content)) {
                if (onCancel) onCancel();
                else closeSheet();
            }
            onDone();
            return;
        }
        invalidate();
        const requestRevision = revision;
        const result = await api("/assignments/preview", "POST", data);
        if (revision !== requestRevision || !activeSheet(content)) return;
        previewToken = result.token;
        const count = result.counts[1] + result.counts[2];
        const summary = people.map(person => `<span class="legend-item">${colorDot(person.color)}
            ${escapeHtml(person.name)} · ${result.counts[person.id]} j</span>`).join("");
        preview.innerHTML = `<p class="detail-subhead">Après modification · ${count} jour${count > 1 ? "s" : ""}</p>
            <div class="legend">${summary}</div>
            <ul class="period-sample">${result.sample.map(item => `<li>
                <span>${formatDate(item.day, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span>${escapeHtml(people[item.after - 1].name)}</span>
            </li>`).join("")}</ul>
            ${count > result.sample.length ? '<p class="muted small">Les sept premiers jours sont affichés.</p>' : ""}`;
        preview.hidden = commit.hidden = false;
        commit.focus();
    });
}

async function openDay(day, settings, refresh, readOnly = false) {
    const title = capitalize(formatDate(day));
    const loading = sheet(title, '<p class="empty">Chargement de la journée…</p>');
    try {
        const [days, notes] = await Promise.all([
            api(`/planning?start=${day}&end=${day}`),
            readOnly ? [] : api(`/day-notes?day=${day}`),
        ]);
        if (!activeSheet(loading)) return;
        const item = days[day];
        const parent = parents(settings)[item.parent - 1];
        const reopen = () => openDay(day, settings, refresh);
        const afterNote = content => {
            refresh();
            if (activeSheet(content)) reopen();
        };
        const content = sheet(title, `<div class="stack-lg">
            <div class="info-block stack">
                <div><p class="muted small">Parent responsable</p>
                    <p class="legend-item">${colorDot(parent.color)} <strong>${escapeHtml(parent.name)}</strong></p>
                    ${item.custom ? '<p class="muted small">Attribution manuelle</p>' : ""}
                </div>
                ${item.carers.length ? `<p class="info-line">${icon("user")} <span>Garde · ${escapeHtml(item.carers.join(", "))}</span></p>` : ""}
                ${readOnly ? "" : `<div><button type="button" class="button secondary" data-assignment>${icon("swap")} Modifier l’attribution</button></div>`}
            </div>
            ${readOnly ? "" : `<div class="stack">
                <h3 class="detail-subhead">Notes de la journée</h3>
                ${notes.length ? notes.map(note => `<div class="detail-note">
                    ${note.checked !== null ? `<input type="checkbox" class="note-check" data-check="${note.id}"
                        aria-label="Cocher la note de ${escapeHtml(note.author)}" ${note.checked ? "checked" : ""}>` : ""}
                    <div class="row-copy"><strong>${escapeHtml(note.author)}</strong>
                        <p class="preformatted">${escapeHtml(note.content)}</p></div>
                    <button type="button" class="icon-button" data-edit="${note.id}" aria-label="Modifier la note de ${escapeHtml(note.author)}">${icon("edit")}</button>
                </div>`).join("") : '<p class="muted">Aucune note pour cette journée.</p>'}
                ${formError}
                <div><button type="button" class="button primary" data-new>${icon("plus")} Ajouter une note</button></div>
            </div>`}
        </div>`);
        if (readOnly) return;
        content.querySelector("[data-assignment]").onclick = () => openAssignment(settings, day, {
            manual: item.custom, parent: item.parent, onDone: refresh, onCancel: reopen,
        });
        content.querySelector("[data-new]").onclick = () => editDayNote(day, settings, null, reopen, afterNote);
        content.querySelectorAll("[data-edit]").forEach(button => {
            button.onclick = () => editDayNote(day, settings, notes.find(note => note.id === Number(button.dataset.edit)), reopen, afterNote);
        });
        content.querySelectorAll("[data-check]").forEach(checkbox => {
            checkbox.onchange = async () => {
                checkbox.disabled = true;
                const error = content.querySelector("[data-error]");
                error.hidden = true;
                try {
                    await api(`/day-notes/${checkbox.dataset.check}`, "PATCH", { checked: checkbox.checked });
                } catch (problem) {
                    checkbox.checked = !checkbox.checked;
                    error.textContent = problem.message;
                    error.hidden = false;
                } finally {
                    checkbox.disabled = false;
                }
            };
        });
    } catch (error) {
        if (activeSheet(loading)) sheet(title, errorBlock(error));
    }
}

function editDayNote(day, settings, note, onCancel, onDone) {
    const content = sheet(note ? "Modifier la note" : "Ajouter une note", `<form class="stack">
        ${field("Auteur", input("author", note?.author, 'required maxlength="80" list="authors"'))}
        <datalist id="authors">${parents(settings).map(parent => `<option value="${escapeHtml(parent.name)}"></option>`).join("")}</datalist>
        ${field("Note", textarea("content", note?.content, 'rows="4" maxlength="16000" required'))}
        <label class="check-line"><input name="checkable" type="checkbox" ${note?.checked != null ? "checked" : ""}> Ajouter une case à cocher</label>
        ${formError}
        <div class="sheet-actions">
            <button type="button" class="button secondary" data-cancel>Retour</button>
            ${note ? '<button type="button" class="button danger" data-delete>Supprimer</button>' : ""}
            <button type="submit" class="button primary">Enregistrer</button>
        </div>
    </form>`, capitalize(formatDate(day)));
    const path = note ? `/day-notes/${note.id}` : "/day-notes";
    content.querySelector("[data-cancel]").onclick = onCancel;
    submitForm(content.querySelector("form"), async data => {
        await api(path, note ? "PUT" : "POST", {
            day, author: data.author, content: data.content, checked: data.checkable ? note?.checked ?? false : null,
        });
        toast("Note enregistrée.");
        onDone(content);
    });
    if (note) content.querySelector("[data-delete]").onclick = () => confirmDelete({
        title: "Supprimer la note",
        message: "Supprimer cette note de la journée ?",
        onCancel: () => editDayNote(day, settings, note, onCancel, onDone),
        onDelete: async confirmation => {
            await api(path, "DELETE");
            toast("Note supprimée.");
            onDone(confirmation);
        },
    });
}

export function renderPlanningSettings(host, session, page, onUpdate) {
    if (page === "calendrier") {
        host.innerHTML = `<form class="stack planning-form">
            ${planningSwitch("custody_enabled", "Afficher le planning de garde",
                "Affiche les gardes et les passations sur ce compte. Vos réglages de garde sont conservés si vous désactivez cette option.",
                session.custody_enabled)}
            ${formError}
            <div class="planning-save"><button type="submit" class="button primary">Enregistrer</button></div>
        </form>`;
        const form = host.querySelector("form");
        submitForm(form, async () => {
            await api("/account/calendar-preferences", "PUT", { custody_enabled: form.elements.custody_enabled.checked });
            toast("Réglages du calendrier enregistrés.");
            await onUpdate();
        });
        return;
    }
    if (page === "parents") {
        host.innerHTML = parentSettingsForm(session, "planning-timezones");
        bindParentSettings(host.querySelector("form"), session, onUpdate);
        return;
    }
    if (!session.settings) {
        host.innerHTML = `<div class="planning-empty stack">
            <p class="muted">Configurez l’alternance pour accéder à ce réglage.</p>
            <div><a class="button primary" href="${planningSettingsUrl}" data-route="/reglages">Configurer l’alternance</a></div>
        </div>`;
        return;
    }
    host.innerHTML = '<p class="muted" role="status">Chargement…</p>';
    if (page === "weekends") {
        loadWeekends(host, Number(session.today.slice(0, 4)));
    } else {
        loadCarers(host);
    }
}

function planningSwitch(name, label, description, checked = false) {
    return `<label class="planning-switch">
        <span><strong>${label}</strong><small id="planning-${name}-hint">${description}</small></span>
        <input type="checkbox" name="${name}" role="switch" aria-label="${label}" aria-describedby="planning-${name}-hint" ${checked ? "checked" : ""}>
        <span class="planning-switch-track" aria-hidden="true"></span>
    </label>`;
}

async function loadWeekends(section, year) {
    try {
        const years = await api("/weekends");
        if (!section.isConnected) return;
        section.innerHTML = `<form class="stack planning-form">
                <fieldset class="stack" data-weekend-controls>
                    <div class="planning-year">
                        <button class="icon-button" type="button" data-step="-1" aria-label="Année précédente">${icon("left")}</button>
                        ${field("Année", input("year", year, 'type="number" min="1" max="9999" step="1" inputmode="numeric" required'))}
                        <button class="icon-button" type="button" data-step="1" aria-label="Année suivante">${icon("right")}</button>
                    </div>
                    ${planningSwitch("enabled", "Inverser les week-ends",
                        "Échange les samedis et dimanches entre les parents. Les attributions manuelles sont prioritaires.")}
                    <div class="planning-year-shortcuts stack" data-years hidden>
                        <p class="muted small">Années avec inversion</p>
                        <div class="flow" data-year-buttons></div>
                    </div>
                </fieldset>
                ${formError}
                <div class="planning-save"><button type="submit" class="button primary">Enregistrer</button></div>
            </form>`;
        const form = section.querySelector("form");
        const selected = form.elements.year;
        const checkbox = form.elements.enabled;
        const controls = form.querySelector("[data-weekend-controls]");
        const yearGroup = form.querySelector("[data-years]");
        const shortcuts = form.querySelector("[data-year-buttons]");
        const steps = [...form.querySelectorAll("[data-step]")];

        function display(value = selected.valueAsNumber) {
            const valid = selected.validity.valid;
            checkbox.checked = years.includes(value);
            checkbox.disabled = !valid;
            steps[0].disabled = !valid || value <= 1;
            steps[1].disabled = !valid || value >= 9999;
            for (const button of shortcuts.children) {
                button.setAttribute("aria-pressed", String(Number(button.value) === value));
            }
        }

        function showYears() {
            yearGroup.hidden = !years.length;
            shortcuts.innerHTML = years.map(value => `<button type="button" class="planning-year-chip" value="${value}">${value}</button>`).join("");
        }

        function selectYear(value) {
            selected.value = value;
            display();
        }

        for (const button of steps) button.onclick = () => selectYear(selected.valueAsNumber + Number(button.dataset.step));
        shortcuts.onclick = event => {
            const shortcut = event.target.closest("button");
            if (shortcut) selectYear(Number(shortcut.value));
        };
        selected.addEventListener("input", () => display());
        showYears();
        display();
        submitForm(form, async data => {
            const value = Number(data.year);
            const enabled = data.enabled === "on";
            controls.disabled = true;
            try {
                await api(`/weekends/${value}`, "PUT", { enabled });
                const index = years.indexOf(value);
                if (enabled && index < 0) years.push(value);
                else if (!enabled && index >= 0) years.splice(index, 1);
                years.sort((a, b) => a - b);
                showYears();
                display(value);
                toast("Réglage des week-ends enregistré.");
            } finally {
                controls.disabled = false;
            }
        });
    } catch (error) {
        section.innerHTML = `${errorBlock(error)}<div><button type="button" class="button secondary">Réessayer</button></div>`;
        section.querySelector("button").onclick = () => loadWeekends(section, year);
    }
}

async function loadCarers(section) {
    try {
        const carers = await api("/carers");
        if (!section.isConnected) return;
        const add = `<button type="button" class="button primary" data-new-carer>${icon("plus")} Ajouter une personne</button>`;
        section.innerHTML = carers.length ? `<div class="planning-carer-toolbar">${add}</div>
            <div class="planning-carers">${carers.map(carer => {
                const state = carer.active ? "Active" : "Suspendue";
                const days = carer.days.map(day => WEEKDAYS[day]).join(", ");
                return `<button type="button" class="planning-carer" data-carer="${carer.id}"
                    aria-label="${escapeHtml(`Modifier ${carer.name} · ${state} · ${days}`)}">
                    <span class="planning-carer-heading">
                        <span class="planning-carer-icon">${icon("user")}</span>
                        <span class="row-copy"><strong>${escapeHtml(carer.name)}</strong>
                            <span class="planning-carer-state" ${carer.active ? "data-active" : ""}>${state}</span>
                        </span>
                        ${icon("right")}
                    </span>
                    <span class="planning-days" aria-hidden="true">${WEEKDAYS.map((day, index) =>
                        `<span ${carer.days.includes(index) ? "data-selected" : ""} title="${day}">${day.slice(0, 3)}</span>`).join("")}</span>
                </button>`;
            }).join("")}</div>` : `<div class="planning-empty stack">
                <span class="planning-carer-icon">${icon("user")}</span>
                <div><h3>Aucune garde récurrente</h3><p class="muted">Ajoutez une personne et choisissez ses jours de garde.</p></div>
                <div>${add}</div>
            </div>`;
        const redraw = () => loadCarers(section);
        section.querySelector("[data-new-carer]").onclick = () => editCarer(null, redraw);
        section.querySelectorAll("[data-carer]").forEach(button => {
            button.onclick = () => editCarer(carers.find(carer => carer.id === Number(button.dataset.carer)), redraw);
        });
    } catch (error) {
        section.innerHTML = `${errorBlock(error)}<div><button type="button" class="button secondary">Réessayer</button></div>`;
        section.querySelector("button").onclick = () => loadCarers(section);
    }
}

function editCarer(carer, refresh) {
    const content = sheet(carer ? "Modifier la personne de garde" : "Ajouter une personne de garde", `<form class="stack planning-form">
        ${field("Nom", input("name", carer?.name, 'required maxlength="80"'))}
        <fieldset><legend>Jours de garde</legend><div class="planning-days planning-day-picker">
            ${WEEKDAYS.map((name, index) => `<label title="${name}">
                <input name="days" type="checkbox" value="${index}" aria-label="${name}" ${carer?.days.includes(index) ? "checked" : ""}>
                <span aria-hidden="true">${name.slice(0, 3)}</span></label>`).join("")}
        </div></fieldset>
        ${planningSwitch("active", "Afficher dans le planning", "Désactivez ce réglage pour suspendre la garde.", carer?.active ?? true)}
        ${formError}
        <div class="sheet-actions">
            ${carer ? '<button type="button" class="button danger" data-delete>Supprimer</button>' : ""}
            <button type="submit" class="button primary">Enregistrer</button>
        </div>
    </form>`);
    const form = content.querySelector("form");
    const path = carer ? `/carers/${carer.id}` : "/carers";
    submitForm(form, async data => {
        await api(path, carer ? "PUT" : "POST", {
            name: data.name, active: data.active === "on", days: new FormData(form).getAll("days").map(Number),
        });
        if (activeSheet(content)) closeSheet();
        toast("Garde enregistrée.");
        refresh();
    });
    if (carer) content.querySelector("[data-delete]").onclick = () => confirmDelete({
        title: "Supprimer la personne de garde",
        message: `Retirer ${carer.name} du planning des gardes ?`,
        onCancel: () => editCarer(carer, refresh),
        onDelete: async confirmation => {
            await api(path, "DELETE");
            if (activeSheet(confirmation)) closeSheet();
            toast("Personne de garde supprimée.");
            refresh();
        },
    });
}
