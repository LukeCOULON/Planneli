import { activeSheet, api, closeSheet, confirmDelete, errorBlock, escapeHtml, field, formError, icon, sheet, submitForm, toast } from "./ui.js";

const resetActions = {
    planning: {
        label: "Réinitialiser le planning",
        message: "Les parents, l’alternance, les exceptions, les personnes de garde et les notes journalières seront effacés. Le planning devra être configuré à nouveau.",
        done: "Planning réinitialisé.",
    },
    notes: {
        label: "Effacer toutes les notes du bloc-notes",
        message: "Toutes les notes du bloc-notes seront définitivement supprimées.",
        done: "Bloc-notes vidé.",
    },
    events: {
        label: "Effacer tous les événements",
        message: "Tous les événements et leurs rappels seront définitivement supprimés.",
        done: "Événements effacés.",
    },
};
const connectionDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "medium" });
const versionPreparedEvent = "planneli:version-prepared";

function connectionTime(timestamp) {
    return `<time datetime="${escapeHtml(timestamp)}">${connectionDate.format(new Date(timestamp))}</time>`;
}

function releaseNotes(news) {
    return `<ul class="release-notes">${news.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}

function releaseHistory(releases) {
    return releases.map(release => `<div><p class="release-entry-version"><strong>${escapeHtml(release.version)}</strong></p>
        ${releaseNotes(release.news)}</div>`).join("");
}

function versionPanel(info, showUpdateButton = false) {
    const [latest, ...history] = info.releases;
    const prepared = info.pending_version ? `${escapeHtml(info.pending_version)} est prête.` : "Une mise à jour est prête.";
    const status = info.pending
        ? `${prepared} Relancez Planneli pour l’appliquer.`
        : "Aucune mise à jour préparée.";
    return `<section class="maintenance-version stack">
        <header class="maintenance-version-header">
            <h3>Version et mises à jour</h3>
            <p class="maintenance-version-number"><span>Version installée</span><strong>${escapeHtml(info.version ?? "Inconnue")}</strong></p>
        </header>
        ${info.version_error ? `<p class="error" role="alert">${escapeHtml(info.version_error)}</p>`
            : `<p class="maintenance-version-status" ${info.pending ? "data-prepared" : ""}>${icon(info.pending ? "check" : "clock")}<span>${status}</span></p>`}
        ${info.pending_releases.length ? `<div class="release-history stack">
            <h4>Nouveautés à installer</h4>${releaseHistory(info.pending_releases)}
        </div>` : ""}
        ${latest ? `<div class="release-history stack">
            <h4>Nouveautés de la version installée</h4>${releaseNotes(latest.news)}
        </div>` : ""}
        ${history.length ? `<details class="release-history">
            <summary>Historique des versions</summary>
            <div class="stack">${releaseHistory(history)}</div>
        </details>` : ""}
        ${showUpdateButton ? `<form class="stack" data-update-form>
            <p class="muted small" role="status" data-update-status ${info.can_update || info.version_error ? "hidden" : ""}>
                Vérification GitHub disponible en mode normal.
            </p>
            ${formError}
            <div><button type="submit" class="button primary" ${info.can_update && !info.pending ? "" : "disabled"}>Vérifier les mises à jour</button></div>
        </form>` : ""}
    </section>`;
}

export function renderMaintenanceSettings(host) {
    host.innerHTML = `<div data-version-preview></div>
        <div class="stack">
            <p class="muted small">Déverrouillez la maintenance pour vérifier GitHub, consulter les connexions et gérer les données.</p>
            <div><button type="button" class="button primary" data-open-maintenance>Ouvrir la maintenance ${icon("right")}</button></div>
        </div>`;
    const preview = host.querySelector("[data-version-preview]");
    async function refresh() {
        if (!host.isConnected) return;
        preview.innerHTML = '<p class="muted" role="status">Chargement du journal des versions…</p>';
        try {
            const info = await api("/maintenance/version");
            if (host.isConnected) preview.innerHTML = versionPanel(info);
        } catch (error) {
            if (!host.isConnected) return;
            preview.innerHTML = `${errorBlock(error)}<button type="button" class="button secondary">Réessayer</button>`;
            preview.querySelector("button").onclick = refresh;
        }
    }
    const view = new AbortController();
    window.addEventListener(versionPreparedEvent, refresh, { signal: view.signal });
    host.closest(".page-enter")?.addEventListener("tempo:leave", () => view.abort(), { once: true });
    host.querySelector("[data-open-maintenance]").onclick = () => openMaintenance();
    refresh();
}

export function askMaintenanceCode() {
    const content = sheet("Maintenance", `<form class="stack">
        ${field("Code de maintenance", '<input name="code" type="password" inputmode="numeric" required autocomplete="off">')}
        ${formError}
        <div class="sheet-actions"><button type="submit" class="button primary">Déverrouiller</button></div>
    </form>`);
    submitForm(content.querySelector("form"), async ({ code }) => {
        await api("/maintenance/unlock", "POST", { code });
        if (activeSheet(content)) await openMaintenance();
    });
}

export async function openMaintenance({ accountsOpen = false, dataOpen = false } = {}) {
    const loading = sheet("Maintenance", '<p class="empty">Chargement…</p>');
    try {
        const info = await api("/maintenance");
        if (!activeSheet(loading)) return;
        const rows = info.logs.map(row => `<tr>
            <td>${escapeHtml(row.username ?? "—")}</td><td>#${row.visitor_id}</td><td>${escapeHtml(row.ip)}</td>
            <td>${connectionTime(row.connected_at)}</td>
        </tr>`).join("");
        const accounts = info.accounts.map(account => `<li>
            <button type="button" class="record-row" data-maintenance-account="${account.id}">
                ${icon("user")}<span class="row-copy"><strong>${escapeHtml(account.username)}</strong>
                <span class="muted small">Compte #${account.id} · ${account.visitor_count} identifiant${account.visitor_count === 1 ? "" : "s"}</span></span>
                ${icon("right")}
            </button>
        </li>`).join("");
        const content = sheet("Maintenance", `<div class="stack-lg">
            ${versionPanel(info, true)}
            <details class="info-block" data-raw><summary>Données brutes</summary>
                <pre class="raw-data" aria-live="polite"></pre>
            </details>
            <details class="info-block" ${dataOpen ? "open" : ""}>
                <summary>Gestion des données</summary>
                <div class="stack maintenance-data-actions">
                    ${Object.entries(resetActions).map(([scope, action]) => `<button type="button"
                        class="button danger" data-reset="${scope}">${action.label}</button>`).join("")}
                </div>
            </details>
            <details class="info-block" ${accountsOpen ? "open" : ""}><summary>Comptes (${info.accounts.length})</summary>
                ${accounts ? `<ul class="visitor-list row-list">${accounts}</ul>` : '<p class="muted">Aucun compte enregistré.</p>'}
            </details>
            <section class="stack">
                <div class="flow"><h3>Dernières connexions</h3><button type="button" class="button secondary" data-refresh>Actualiser</button></div>
                ${rows ? `<div class="maintenance-scroll" tabindex="0"><table class="maintenance-table">
                    <thead><tr><th scope="col">Compte</th><th scope="col">ID de visite</th><th scope="col">IP</th><th scope="col">Date et heure</th></tr></thead>
                    <tbody>${rows}</tbody></table></div>` : '<p class="muted">Aucune connexion enregistrée.</p>'}
            </section>
            <div><button type="button" class="button secondary" data-lock>Verrouiller</button></div>
        </div>`);
        const form = content.querySelector("[data-update-form]");
        const showData = () => openMaintenance({ dataOpen: true });
        for (const button of content.querySelectorAll("[data-reset]")) {
            const scope = button.dataset.reset;
            const action = resetActions[scope];
            button.onclick = () => confirmDelete({
                title: action.label,
                message: action.message,
                onCancel: showData,
                onDelete: async confirmation => {
                    try {
                        await api(`/maintenance/data/${scope}`, "DELETE");
                        window.dispatchEvent(new Event("naoning:data-reset"));
                        toast(action.done);
                        if (activeSheet(confirmation)) await showData();
                    } catch (error) {
                        if (error.status === 401 && activeSheet(confirmation)) askMaintenanceCode();
                        else throw error;
                    }
                },
            });
        }
        for (const button of content.querySelectorAll("[data-maintenance-account]")) {
            button.onclick = () => openMaintenanceAccount(button.dataset.maintenanceAccount);
        }
        const status = content.querySelector("[data-update-status]");
        submitForm(form, async () => {
            status.hidden = false;
            status.textContent = "Vérification de la version sur GitHub…";
            try {
                const { revision } = await api("/maintenance/update", "POST");
                if (revision) {
                    window.dispatchEvent(new Event(versionPreparedEvent));
                    if (activeSheet(content)) await openMaintenance();
                } else {
                    status.textContent = "Aucune version plus récente sur GitHub.";
                }
            } catch (error) {
                status.hidden = true;
                if (error.status === 401 && activeSheet(content)) askMaintenanceCode();
                else throw error;
            }
        });
        const details = content.querySelector("[data-raw]");
        details.addEventListener("toggle", async () => {
            if (!details.open || details.dataset.loaded) return;
            const output = details.querySelector("pre");
            output.textContent = "Chargement…";
            try {
                const data = await api("/maintenance/data");
                output.textContent = JSON.stringify(data, null, 2);
                details.dataset.loaded = "yes";
            } catch (error) {
                if (error.status === 401 && activeSheet(content)) askMaintenanceCode();
                else output.textContent = error.message;
            }
        });
        content.querySelector("[data-refresh]").onclick = openMaintenance;
        content.querySelector("[data-lock]").onclick = async event => {
            const button = event.currentTarget;
            try {
                await api("/maintenance/lock", "POST");
                if (activeSheet(content)) closeSheet();
            } catch (error) {
                button.insertAdjacentHTML("afterend", errorBlock(error));
            }
        };
    } catch (error) {
        if (!activeSheet(loading)) return;
        if (error.status === 401) askMaintenanceCode();
        else sheet("Maintenance", errorBlock(error));
    }
}

async function openMaintenanceAccount(id) {
    const path = `/maintenance/accounts/${id}`;
    const back = () => openMaintenance({ accountsOpen: true });
    const redraw = () => openMaintenanceAccount(id);
    const backButton = `<button type="button" class="button secondary" data-back>${icon("left")} Retour aux comptes</button>`;
    const loading = sheet("Compte", '<p class="empty">Chargement…</p>');
    try {
        const account = await api(path);
        if (!activeSheet(loading)) return;
        const visitors = account.visitors.map(visitor => `<li class="visitor-row info-block">
            <div><strong>Identifiant #${visitor.id}</strong><p class="muted small">${escapeHtml(visitor.ip)}</p>
                <p class="muted small">Dernière connexion · ${connectionTime(visitor.last_connected_at)}</p></div>
            <button type="button" class="button danger" data-delete-visitor="${visitor.id}"
                aria-label="Supprimer l’identifiant nº ${visitor.id}">${icon("trash")} Supprimer</button>
        </li>`).join("");
        const content = sheet(account.username, `<div class="stack">
            <h3>Identifiants de visite</h3>
            ${visitors ? `<ul class="visitor-list row-list">${visitors}</ul>` : '<p class="muted">Aucun identifiant de visite associé.</p>'}
            <div class="flow">${backButton}
                <button type="button" class="button danger" data-delete-account>${icon("trash")} Supprimer le compte</button>
            </div>
        </div>`, `Compte #${account.id}`);
        content.querySelector("[data-back]").onclick = back;

        async function remove(confirmation, endpoint, done, next) {
            try {
                await api(endpoint, "DELETE");
                toast(done);
                if (account.is_current && endpoint === path) location.replace("/");
                else if (activeSheet(confirmation)) await next();
            } catch (error) {
                if (error.status === 401 && activeSheet(confirmation)) askMaintenanceCode();
                else throw error;
            }
        }

        for (const button of content.querySelectorAll("[data-delete-visitor]")) {
            const visitor = button.dataset.deleteVisitor;
            button.onclick = () => confirmDelete({
                title: `Supprimer l’identifiant nº ${visitor}`,
                message: "Cet identifiant et son historique seront effacés. Un nouvel identifiant sera attribué à la prochaine visite depuis ce navigateur et cette adresse IP.",
                onCancel: redraw,
                onDelete: confirmation => remove(confirmation, `${path}/visitors/${visitor}`, "Identifiant supprimé.", redraw),
            });
        }
        content.querySelector("[data-delete-account]").onclick = () => confirmDelete({
            title: `Supprimer le compte ${account.username}`,
            message: "Le compte, ses identifiants et son historique seront effacés. Ses connexions seront révoquées."
                + (account.hosts_session ? " Le code de la session créée par ce compte restera utilisable." : "")
                + (account.is_current ? " Vous serez déconnecté." : ""),
            onCancel: redraw,
            onDelete: confirmation => remove(confirmation, path, "Compte supprimé.", back),
        });
    } catch (error) {
        if (!activeSheet(loading)) return;
        if (error.status === 401) askMaintenanceCode();
        else {
            const content = sheet("Compte", `<div class="stack">${errorBlock(error)}<div>${backButton}</div></div>`);
            content.querySelector("[data-back]").onclick = back;
        }
    }
}

export function showWelcome() {
    const release = JSON.parse(document.body.dataset.release ?? "null");
    const content = sheet("Bienvenue", `<div class="stack">
        ${release ? `<p class="version-label">${icon("check")} Version actuelle · <strong>${escapeHtml(release.version)}</strong></p>
            ${releaseNotes(release.news)}` : ""}
        <div class="sheet-actions"><button type="button" class="button primary" data-continue>Continuer</button></div>
    </div>`);
    content.querySelector("[data-continue]").onclick = closeSheet;
}
