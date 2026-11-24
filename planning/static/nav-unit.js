import { api, errorBlock, pageHeading } from "./ui.js";

export function renderNavUnit(view) {
    view.innerHTML = pageHeading("Navigateur intégré", "search", "tone-events")
        + '<section id="integrated-browser" class="section-panel panel stack" aria-label="Navigateur intégré"></section>';
    const content = view.querySelector("#integrated-browser");

    function startButton(label = "Démarrer le navigateur") {
        content.insertAdjacentHTML("beforeend", `<div><button type="button" class="button primary">${label}</button></div>`);
        content.querySelector("button").onclick = () => refresh("POST");
    }

    async function refresh(method = "GET") {
        if (!view.isConnected) return;
        content.innerHTML = '<p class="muted" role="status">Connexion à Nav Unit…</p>';
        try {
            const status = await api("/nav-unit", method);
            if (!view.isConnected) return;
            if (status.state === "ready") {
                const frame = document.createElement("iframe");
                frame.className = "nav-unit-frame";
                frame.title = "Navigateur Nav Unit";
                frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
                frame.src = status.url;
                content.replaceChildren(frame);
            } else if (status.state === "starting") {
                content.innerHTML = '<p class="muted" role="status">Démarrage de Chromium… La première installation peut prendre quelques instants.</p>';
                setTimeout(refresh, 750);
            } else if (status.state === "idle") {
                content.innerHTML = '<p class="muted">Ouvrez Nav Unit pour naviguer depuis cet ordinateur.</p>';
                startButton();
            } else if (status.state === "failed") {
                content.innerHTML = '<p class="error" role="alert">Nav Unit n’a pas démarré. Vérifiez le journal local dans le dossier nav_unit.</p>';
                startButton("Réessayer");
            } else {
                content.innerHTML = '<p class="muted">Nav Unit est disponible en accès local sur l’ordinateur qui héberge Planneli.</p>';
            }
        } catch (error) {
            if (!view.isConnected) return;
            content.innerHTML = errorBlock(error);
            startButton("Réessayer");
        }
    }

    refresh();
}
