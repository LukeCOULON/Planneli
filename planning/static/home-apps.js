import { activeSheet, api, closeSheet, escapeHtml, field, formError, icon, sheet, styleDropdown, submitForm, toast } from "./ui.js";

const shownConfigurations = new WeakMap();

function homeIcon(app) {
    return `<span class="space-icon">${icon(app.symbol)}</span>`;
}

function applicationCard(app) {
    return `<a class="space-card ${app.tone}" href="${app.path}" data-route="${app.path}">
        ${homeIcon(app)}
        <span class="space-text"><strong>${escapeHtml(app.name)}</strong>
            ${app.description ? `<span>${escapeHtml(app.description)}</span>` : ""}</span>
        <span class="space-open">${icon("right")}</span>
    </a>`;
}

export function renderHomeApps(host, configuration) {
    if (shownConfigurations.get(host) === configuration) return;
    shownConfigurations.set(host, configuration);
    const { categories, hidden, favorites } = configuration;
    const appsByPath = new Map(categories.flatMap(category => category.apps.map(app => [app.path, app])));
    const groups = [
        { id: "favoris", title: "Favoris", apps: favorites.map(path => appsByPath.get(path)) },
        ...categories.map(category => ({
            ...category, apps: category.apps.filter(app => !hidden.includes(app.path) && !favorites.includes(app.path)),
        })),
    ].filter(group => group.apps.length);
    host.innerHTML = groups.length ? groups.map(group => `<section class="home-app-group${group.id === "favoris" ? " home-app-group--favorites" : ""}" aria-labelledby="home-group-${group.id}">
        <h3 id="home-group-${group.id}">${group.title}</h3>
        <div class="space-list">${group.apps.map(applicationCard).join("")}</div>
    </section>`).join("") : '<p class="empty panel">Choisissez des applications avec le bouton Personnaliser.</p>';
}

const agendaViews = [["week", "Semaine"], ["month", "Mois"], ["year", "Année"]];

export function renderHomePreferences(host, configuration, onUpdate, onboarding = false) {
    const { categories } = configuration;
    const appsByPath = new Map(categories.flatMap(category => category.apps.map(app => [app.path, app])));
    const hidden = new Set(configuration.hidden);
    const favorites = [...configuration.favorites];
    host.innerHTML = `<form class="stack-lg home-preferences">
        <p class="muted">${onboarding ? "Choisissez les applications à afficher sur votre accueil et la vue de votre agenda."
            : "Choisissez vos applications et vos favoris. Masquer une application masque aussi ses cartes dans le résumé « Aujourd’hui »."}</p>
        ${field("Vue d’agenda par défaut", `<select name="agenda_view">${agendaViews.map(([value, label]) =>
            `<option value="${value}" ${value === configuration.agenda_view ? "selected" : ""}>${label}</option>`).join("")}</select>`)}
        ${categories.map(category => `<fieldset class="home-preferences-group stack">
            <legend>${category.title}</legend>
            ${category.apps.map(app => `<div class="home-preference ${app.tone}">
                <span class="home-preference-name">${homeIcon(app)}<strong>${escapeHtml(app.name)}</strong></span>
                <div class="home-preference-actions">
                    <label><input type="checkbox" data-home-visible value="${app.path}"
                        aria-label="Afficher ${escapeHtml(app.name)}"> Afficher</label>
                    ${onboarding ? "" : `<label><input type="checkbox" data-home-favorite value="${app.path}"
                        aria-label="Marquer ${escapeHtml(app.name)} comme favori"> Favori</label>`}
                </div>
            </div>`).join("")}
        </fieldset>`).join("")}
        <section class="home-favorite-order stack" data-favorite-order aria-label="Ordre des favoris" hidden></section>
        ${formError}
        <div class="flow home-preferences-footer">
            ${onboarding ? '<button class="button secondary" type="submit" data-home-skip>Ignorer cette étape</button>'
                : '<button class="button secondary" type="button" data-home-reset>Rétablir par défaut</button>'}
            <button class="button primary" type="submit">${onboarding ? "Enregistrer et continuer" : "Enregistrer"}</button>
        </div>
    </form>`;
    const form = host.querySelector("form");
    const agenda = form.elements.agenda_view;
    styleDropdown(agenda);
    const order = form.querySelector("[data-favorite-order]");

    function showChoices() {
        for (const control of form.querySelectorAll("[data-home-visible]")) {
            control.checked = !hidden.has(control.value);
        }
        for (const control of form.querySelectorAll("[data-home-favorite]")) {
            control.checked = favorites.includes(control.value);
            control.disabled = hidden.has(control.value);
        }
        order.hidden = favorites.length < 2;
        order.innerHTML = order.hidden ? "" : `<h3>Ordre des favoris</h3>
            <ol>${favorites.map((path, index) => {
                const name = escapeHtml(appsByPath.get(path).name);
                return `<li tabindex="-1">
                    <strong>${name}</strong>
                    <div class="flow">
                        <button type="button" class="icon-button" data-move="-1" data-index="${index}"
                            aria-label="Monter ${name}" ${index === 0 ? "disabled" : ""}>${icon("left")}</button>
                        <button type="button" class="icon-button" data-move="1" data-index="${index}"
                            aria-label="Descendre ${name}" ${index === favorites.length - 1 ? "disabled" : ""}>${icon("right")}</button>
                    </div>
                </li>`;
            }).join("")}</ol>`;
    }

    form.addEventListener("change", ({ target }) => {
        const path = target.value;
        const index = favorites.indexOf(path);
        if (target.matches("[data-home-visible]")) {
            if (target.checked) hidden.delete(path);
            else {
                hidden.add(path);
                if (index >= 0) favorites.splice(index, 1);
            }
        } else if (target.matches("[data-home-favorite]")) {
            if (target.checked && index < 0) favorites.push(path);
            else if (!target.checked && index >= 0) favorites.splice(index, 1);
        } else {
            return;
        }
        showChoices();
    });
    order.addEventListener("click", event => {
        const button = event.target.closest("[data-move]");
        if (!button) return;
        const index = Number(button.dataset.index);
        const step = Number(button.dataset.move);
        const next = index + step;
        [favorites[index], favorites[next]] = [favorites[next], favorites[index]];
        showChoices();
        const moved = order.querySelectorAll("li")[next];
        const control = moved.querySelector(`[data-move="${step}"]:enabled`);
        (control ?? moved).focus({ preventScroll: true });
    });
    form.querySelector("[data-home-reset]")?.addEventListener("click", () => {
        hidden.clear();
        favorites.length = 0;
        agenda.value = "month";
        styleDropdown(agenda);
        showChoices();
    });
    showChoices();
    submitForm(form, async (_data, button) => {
        const preferences = button.hasAttribute("data-home-skip")
            ? { hidden: configuration.hidden, favorites: configuration.favorites, agenda_view: configuration.agenda_view }
            : { hidden: [...hidden], favorites, agenda_view: agenda.value };
        await api("/account/home-preferences", "PUT", preferences);
        toast("Accueil personnalisé.");
        await onUpdate();
    });
}

export function openHomeOnboarding(configuration, onUpdate) {
    const content = sheet("Configurer mon accueil", "<div data-onboarding></div>");
    renderHomePreferences(content.querySelector("[data-onboarding]"), configuration, async () => {
        if (activeSheet(content)) closeSheet();
        await onUpdate();
    }, true);
}
