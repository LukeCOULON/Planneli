import { api, copyText, errorBlock, escapeHtml, field, formError, input, sheet, submitForm, toast } from "./ui.js";

window.addEventListener("pageshow", event => {
    if (event.persisted) location.reload();
});

const authForm = document.querySelector("[data-account-form]");
if (authForm) {
    const switchMode = document.querySelector("[data-switch-account]");
    const submit = authForm.querySelector('[type="submit"]');
    const invitation = Boolean(authForm.elements.namedItem("code"));
    const custodyChoice = authForm.querySelector("[data-register-custody]");
    const custody = authForm.elements.custody_enabled;
    let register = invitation;
    switchMode?.addEventListener("click", () => {
        register = !register;
        const title = register ? "Créer un compte" : "Se connecter";
        document.querySelector("#auth-title").textContent = title;
        document.querySelector("[data-account-prompt]").textContent = register ? "Déjà un compte ?" : "Première visite ?";
        authForm.elements.password.value = "";
        authForm.elements.password.autocomplete = register ? "new-password" : "current-password";
        document.querySelector("[data-password-hint]").hidden = !register;
        custodyChoice.hidden = !register;
        custody.disabled = !register;
        authForm.querySelector("[data-error]").hidden = true;
        submit.textContent = title;
        switchMode.textContent = register ? "Se connecter" : "Créer un compte";
        authForm.elements.username.focus();
    });
    submitForm(authForm, async data => {
        if (switchMode) switchMode.disabled = true;
        try {
            if (register && custody) data.custody_enabled = custody.checked;
            await api(register ? "/account/register" : "/account/login", "POST", data);
            if (invitation) location.replace("/");
            else location.reload();
        } finally {
            if (switchMode) switchMode.disabled = false;
        }
    });
}

function joinWorkspace() {
    const content = sheet("Rejoindre une session", `<form class="stack">
        ${field("Code de connexion", '<input name="code" required minlength="8" maxlength="8" autocapitalize="characters" autocomplete="off" spellcheck="false">')}
        ${formError}
        <div class="sheet-actions"><button class="button primary" type="submit">Rejoindre</button></div>
    </form>`, "Les accès dépendent du code que le titulaire vous a transmis.");
    submitForm(content.querySelector("form"), async data => {
        await api("/account/join", "POST", data);
        location.reload();
    });
}

function bindAccountActions(section) {
    const actions = [["share", "/reglages"], ["leave", "/"], ["logout", "/"]];
    const errorOutput = section.querySelector("[data-error]");
    for (const [action, destination] of actions) {
        const button = section.querySelector(`[data-${action}]`);
        if (!button) continue;
        button.onclick = async () => {
            const controls = [...section.querySelectorAll("button:enabled")];
            controls.forEach(control => { control.disabled = true; });
            errorOutput.hidden = true;
            try {
                await api(`/account/${action}`, "POST");
                location.replace(destination);
            } catch (error) {
                errorOutput.textContent = error.message;
                errorOutput.hidden = false;
                controls.forEach(control => { control.disabled = false; });
            }
        };
    }
    section.querySelector("[data-join]")?.addEventListener("click", joinWorkspace);
}

const sessionChoice = document.querySelector("[data-session-choice], [data-viewer-actions]");
if (sessionChoice) bindAccountActions(sessionChoice);

async function showInvitationQr(code, readOnly = false) {
    const title = readOnly ? "Partager le planning en lecture seule" : "Partager la session";
    const query = new URLSearchParams({ code });
    let link;
    try {
        ({ url: link } = await api(`/account/invitation?${query}`));
    } catch (error) {
        sheet(title, errorBlock(error));
        return;
    }
    const content = sheet(title, `<div class="stack">
        <img class="session-qr" alt="QR code du lien d’inscription à la session">
        <p class="error" role="alert" data-qr-error hidden>Le QR code est indisponible. Vous pouvez copier le lien.</p>
        ${field("Lien d’invitation", input("invitation", link, 'readonly spellcheck="false"'))}
        <div class="sheet-actions"><button class="button primary" type="button" data-copy-link>Copier le lien</button></div>
    </div>`, readOnly ? "Le QR code ouvre une inscription pour consulter le planning."
        : "Scannez le QR code pour créer un compte et rejoindre la session.");
    const image = content.querySelector("img");
    image.addEventListener("error", () => {
        image.hidden = true;
        content.querySelector("[data-qr-error]").hidden = false;
    });
    image.src = `/api/account/invitation-qr.png?${query}`;
    content.querySelector("[data-copy-link]").onclick = async () => {
        const copied = await copyText(content.querySelector('input[name="invitation"]'));
        toast(copied ? "Lien copié." : "Sélectionnez Copier pour récupérer le lien.");
    };
}

export function renderAccountSettings(host, account, page) {
    if (page === "profil") {
        const initials = Array.from(account.username).slice(0, 2).join("").toLocaleUpperCase("fr");
        host.innerHTML = `<div class="settings-profile">
            <span class="settings-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div><p class="muted small">Nom d’utilisateur</p><strong>${escapeHtml(account.username)}</strong></div>
        </div>
        ${formError}
        <div><button class="button secondary" type="button" data-logout>Se déconnecter</button></div>`;
        bindAccountActions(host);
        return;
    }

    if (page === "apparence") {
        host.innerHTML = `<form class="stack">
            ${field("Nom affiché du site", input("name", account.site_name, 'maxlength="40"'))}
            <p class="muted small">Ce nom apparaît dans votre en-tête et dans l’onglet du navigateur. Videz le champ pour rétablir ${escapeHtml(document.body.dataset.defaultSiteName)}.</p>
            ${formError}
            <div><button class="button primary" type="submit">Enregistrer le nom</button></div>
        </form>`;
        submitForm(host.querySelector("form"), async ({ name }) => {
            await api("/account/site-name", "PUT", { name });
            location.reload();
        });
        return;
    }

    if (!account.code) {
        host.innerHTML = `<p class="muted">Quitter la session vous ramènera à l’écran de choix des sessions.</p>
            ${formError}
            <div><button class="button secondary" type="button" data-leave>Quitter la session</button></div>`;
        bindAccountActions(host);
        return;
    }

    host.innerHTML = `<div class="settings-invitation field">
        <label for="session-code">Code de connexion</label>
        <div class="settings-code-actions">
            <input id="session-code" class="session-code" value="${escapeHtml(account.code)}" readonly spellcheck="false">
            <button class="button primary" type="button" data-copy>Copier le code</button>
        </div>
        <div class="flow"><button class="button secondary" type="button" data-invitation-qr>Afficher le QR code</button></div>
    </div>
    <p class="muted small">Ce code permet de consulter et de modifier les données de la session.</p>
    <div class="settings-invitation field">
        <h3>Planning en lecture seule</h3>
        <p class="muted small">Cet accès est limité au calendrier des gardes.</p>
        ${account.read_only_code ? `<label for="read-only-code">Code de lecture seule</label>
            <div class="settings-code-actions">
                <input id="read-only-code" class="session-code" value="${escapeHtml(account.read_only_code)}" readonly spellcheck="false">
                <button class="button primary" type="button" data-copy-read-only>Copier le code de lecture</button>
            </div>
            <div class="flow"><button class="button secondary" type="button" data-read-only-qr>Afficher le QR de lecture seule</button></div>`
            : `${formError}<div><button class="button secondary" type="button" data-create-read-only>Créer un code de lecture seule</button></div>`}
    </div>`;
    host.querySelector("[data-copy]").onclick = async () => {
        const copied = await copyText(host.querySelector("#session-code"));
        toast(copied ? "Code copié." : "Sélectionnez Copier pour récupérer le code.");
    };
    host.querySelector("[data-invitation-qr]").onclick = () => showInvitationQr(account.code);
    if (account.read_only_code) {
        host.querySelector("[data-copy-read-only]").onclick = async () => {
            const copied = await copyText(host.querySelector("#read-only-code"));
            toast(copied ? "Code de lecture copié." : "Sélectionnez Copier pour récupérer le code.");
        };
        host.querySelector("[data-read-only-qr]").onclick = () => showInvitationQr(account.read_only_code, true);
    } else {
        host.querySelector("[data-create-read-only]").onclick = async event => {
            const button = event.currentTarget;
            const errorOutput = host.querySelector("[data-error]");
            button.disabled = true;
            errorOutput.hidden = true;
            try {
                await api("/account/read-only-invitation", "POST");
                const session = await api("/session");
                if (host.isConnected) renderAccountSettings(host, session.account, page);
            } catch (error) {
                errorOutput.textContent = error.message;
                errorOutput.hidden = false;
                button.disabled = false;
            }
        };
    }
}
