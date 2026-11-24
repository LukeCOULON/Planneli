import { renderAccountSettings } from "./accounts.js";
import { renderPlanningSettings } from "./custody.js";
import { askMaintenanceCode } from "./maintenance.js";
import { openTrash } from "./organizer.js";
import { escapeHtml, icon } from "./ui.js";

const groups = [
    { title: "Compte", symbol: "user", tone: "tone-planning", pages: [
        ["session", "Session"], ["profil", "Profil"], ["apparence", "Apparence"],
    ] },
    { title: "Planning", symbol: "calendar", tone: "tone-events", pages: [
        ["parents", "Alternance", "swap"], ["weekends", "Week-ends", "calendar"], ["gardes", "Gardes", "user"],
    ] },
    { title: "Données", symbol: "task", tone: "tone-notes", pages: [
        ["corbeille", "Corbeille"], ["maintenance", "Maintenance"],
    ] },
];

const dataPages = {
    corbeille: {
        symbol: "trash", label: "Ouvrir la corbeille", action: openTrash,
        description: "Retrouvez les notes, événements, tâches et cours supprimés. Vous pouvez les restaurer ou les effacer définitivement.",
    },
    maintenance: {
        symbol: "settings", label: "Ouvrir la maintenance", action: askMaintenanceCode,
        description: "Consultez les journaux de connexion et gérez les mises à jour ou les données du site. Un code de maintenance est requis.",
    },
};

function settingsLink(page) {
    return `/reglages?section=${page}`;
}

export function renderSettings(host, session, requestedPage, onUpdate) {
    const group = groups.find(item => item.pages.some(([id]) => id === requestedPage)) ?? groups[0];
    const [page, title, symbol] = group.pages.find(([id]) => id === requestedPage) ?? group.pages[0];
    const isPlanning = group === groups[1];
    const sessionLabel = session.account.owner ? `Session de ${session.account.owner}` : "Session partagée";

    host.innerHTML = `<header class="settings-masthead${isPlanning ? " settings-masthead--planning" : ""}">
        ${isPlanning ? "" : `<div class="settings-emblem" aria-hidden="true">${icon("settings")}</div>`}
        <div class="settings-masthead-copy">
            <h1>Réglages</h1>
            <p class="settings-session-label">${icon("user")}<span>${escapeHtml(sessionLabel)}</span></p>
        </div>
        ${isPlanning ? `<a class="button secondary" href="/planning" data-route="/planning">${icon("calendar")} <span>Voir le planning</span></a>` : ""}
    </header>
    <div class="settings-layout">
        <nav class="settings-nav panel" aria-label="Sections des réglages">
            ${groups.map(item => `<div class="settings-nav-group ${item.tone}">
                <a class="settings-category" href="${settingsLink(item.pages[0][0])}" data-route="/reglages"
                    ${item === group ? 'data-active="true"' : ""}>
                    <span class="settings-nav-icon">${icon(item.symbol)}</span><span>${item.title}</span>
                </a>
                ${item === group && !isPlanning ? `<ul class="settings-subnav" aria-label="${item.title}">
                    ${item.pages.map(([id, name]) => `<li><a href="${settingsLink(id)}" data-route="/reglages"
                        ${id === page ? 'aria-current="page"' : ""}>${name}</a></li>`).join("")}
                </ul>` : ""}
            </div>`).join("")}
        </nav>
        <section class="settings-pane panel ${group.tone}${isPlanning ? " settings-pane--planning" : ""}" aria-labelledby="settings-pane-title">
            ${isPlanning ? `<nav class="planning-settings-nav" aria-label="Réglages du planning">
                ${group.pages.map(([id, label, tabIcon]) => `<a href="${settingsLink(id)}" data-route="/reglages"
                    ${id === page ? 'aria-current="page"' : ""}>${icon(tabIcon)}<span>${label}</span></a>`).join("")}
            </nav>` : ""}
            <header class="settings-pane-header">
                <div class="settings-pane-icon">${icon(symbol ?? dataPages[page]?.symbol ?? group.symbol)}</div>
                <h2 id="settings-pane-title" tabindex="-1">${page === "gardes" ? "Personnes de garde" : title}</h2>
            </header>
            <div class="settings-pane-body stack" data-settings-body></div>
        </section>
    </div>`;

    const body = host.querySelector("[data-settings-body]");
    if (group === groups[0]) {
        renderAccountSettings(body, session.account, page);
    } else if (isPlanning) {
        renderPlanningSettings(body, session, page, onUpdate);
    } else {
        const item = dataPages[page];
        body.innerHTML = `<p class="muted">${item.description}</p>
            <div><button type="button" class="button primary">${item.label}${icon("right")}</button></div>`;
        body.querySelector("button").onclick = item.action;
    }
}
