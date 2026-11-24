import { todayIn } from "./calendar.js";
import { renderGames } from "./minigames.js";
import { renderCourses } from "./courses.js";
import { openParentSettings, renderPlanning } from "./custody.js";
import { openHomeOnboarding, renderHomeApps } from "./home-apps.js";
import { renderToday } from "./home.js";
import { renderEvents, renderNotes } from "./records.js";
import { showWelcome } from "./maintenance.js";
import { renderNavUnit } from "./nav-unit.js";
import { startReminders } from "./reminders.js";
import { openSearch } from "./organizer.js";
import { renderSettings } from "./settings.js";
import { renderTasks } from "./tasks.js";
import { api, closeSheet, empty, errorBlock } from "./ui.js";

const main = document.querySelector("#main");
const page = document.querySelector("#page");
const home = page.cloneNode(true);
const builtInZone = "Europe/Paris";
const siteName = document.body.dataset.siteName;
const readOnly = document.body.dataset.readOnly === "yes";
let session = { settings: null, today: todayIn(builtInZone) };
let sessionError;
let ready = false;
let current = location.pathname;
let visit = 0;
let onboardingShown = false;

const positions = {
    "/planning": { day: null, view: "month" },
    "/evenements": { day: null, view: "month" },
};
const titles = {
    "/": "Planning familial",
    "/planning": "Mon planning",
    "/evenements": "Mes événements",
    "/notes": "Notes",
    "/a-faire": "À faire",
    "/cours": "Cours",
    "/jeux": "Mini-jeux",
    "/navigateur": "Navigateur intégré",
    "/reglages": "Réglages",
};

function updateNavigation() {
    document.title = current === "/" ? `${siteName} · Planning familial` : `${titles[current]} · ${siteName}`;
    const planningTab = document.querySelector("[data-planning-tab]");
    if (ready && planningTab) planningTab.hidden = !session.custody_enabled;
    document.querySelectorAll('.tab-bar [data-route], .settings-link').forEach(link => {
        if (link.dataset.route === current) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

function updateHome() {
    const summary = page.querySelector("#home-today");
    if (sessionError) {
        summary.innerHTML = `<div class="today-feedback">${errorBlock(sessionError)}
            <button class="button secondary" type="button">Réessayer</button></div>`;
        summary.querySelector("button").onclick = connect;
    } else if (ready) {
        renderHomeApps(page.querySelector("#home-apps"), session.home, session.custody_enabled);
        void renderToday(summary, page.querySelector("#hero-date"), setupPlanning, session.home.hidden);
    }
}

async function setupPlanning() {
    openParentSettings(session, async () => {
        await loadSession();
        if (current === "/") move("/planning");
        else render();
    });
}

async function loadSession() {
    const previousView = session.home?.agenda_view;
    session = await api("/session");
    const agenda = positions["/evenements"];
    const preferredView = session.home?.agenda_view;
    if (preferredView && (!agenda.day || (previousView && previousView !== preferredView))) agenda.view = preferredView;
    sessionError = undefined;
    ready = true;
}

function selectedRecord(key) {
    const value = Number(new URL(location.href).searchParams.get(key));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function applyCalendarDay(url) {
    const position = positions[url.pathname];
    const day = url.searchParams.get("day");
    if (!position || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "0001-01-01") return;
    const date = new Date(`${day}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day) {
        position.day = day;
        position.view = "week";
    }
}

function render() {
    updateNavigation();
    if (current === "/") {
        if (!page.querySelector(".home-hero")) {
            page.firstElementChild?.dispatchEvent(new Event("tempo:leave"));
            page.replaceChildren(...Array.from(home.children, child => child.cloneNode(true)));
            page.classList.remove("page-enter");
        }
        updateHome();
        return;
    }
    page.firstElementChild?.dispatchEvent(new Event("tempo:leave"));
    const view = document.createElement("div");
    view.className = "page-enter";
    page.replaceChildren(view);
    if (!ready) {
        view.innerHTML = sessionError
            ? `${errorBlock(sessionError)}<button class="button secondary" type="button" data-retry-session>Réessayer</button>`
            : '<p class="empty panel">Chargement…</p>';
        const retry = view.querySelector("[data-retry-session]");
        if (retry) retry.onclick = connect;
        return;
    }
    if (positions[current]) positions[current].day ??= session.today;
    if (current === "/planning") {
        renderPlanning(view, session, positions[current], setupPlanning);
    } else if (current === "/evenements") {
        renderEvents(view, session, positions[current], selectedRecord("event"));
    } else if (current === "/notes") {
        const preferredZone = session.timezone ?? builtInZone;
        let zone = preferredZone;
        try { new Intl.DateTimeFormat("fr-FR", { timeZone: preferredZone }); }
        catch { zone = builtInZone; }
        renderNotes(view, zone, selectedRecord("note"));
    } else if (current === "/a-faire") {
        renderTasks(view, selectedRecord("task"));
    } else if (current === "/cours") {
        renderCourses(view, selectedRecord("course"));
    } else if (current === "/jeux") {
        renderGames(view, new URLSearchParams(location.search).get("jeu"));
    } else if (current === "/navigateur") {
        renderNavUnit(view);
    } else if (current === "/reglages") {
        renderSettings(view, session, new URLSearchParams(location.search).get("section"), async () => {
            await loadSession();
            render();
        });
    } else {
        view.innerHTML = empty("Page introuvable");
    }
}

async function connect() {
    try {
        await loadSession();
    } catch (error) {
        sessionError = error;
    }
    render();
    if (!onboardingShown && session.home?.needs_setup) {
        onboardingShown = true;
        const show = () => openHomeOnboarding(session.home, async () => {
            await loadSession();
            if (current === "/") render();
            else await move("/");
        }, session.custody_enabled);
        const dialog = document.querySelector("#sheet");
        if (dialog.open) dialog.addEventListener("close", show, { once: true });
        else show();
    }
}

function motionEnabled() {
    return typeof Element.prototype.animate === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function transitionCard(card, backwards) {
    const rect = card.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= innerHeight) return null;
    const cover = document.createElement("div");
    cover.className = `space-transition ${[...card.classList].find(name => name.startsWith("tone-"))}`;
    cover.setAttribute("aria-hidden", "true");
    const initial = `inset(${rect.top}px ${innerWidth - rect.right}px ${innerHeight - rect.bottom}px ${rect.left}px round 1.4rem)`;
    const full = "inset(0px 0px 0px 0px round 0rem)";
    document.body.append(cover);
    const sequence = backwards ? [full, initial] : [initial, full];
    const animation = cover.animate(sequence.map(clipPath => ({ clipPath })), {
        duration: backwards ? 245 : 290, easing: "cubic-bezier(.3,.72,.26,1)", fill: "both",
    });
    return { cover, animation };
}

function scrollToTopAndFocus() {
    window.scrollTo(0, 0);
    const settingsTitle = page.querySelector("#settings-pane-title");
    (settingsTitle ?? main).focus({ preventScroll: true });
}

async function move(destination, { card, fromHistory = false } = {}) {
    const target = new URL(destination, location.href);
    const next = target.pathname;
    if (!fromHistory && next === current && target.search === location.search) {
        if (target.search) { closeSheet(); applyCalendarDay(target); render(); }
        return;
    }
    const ticket = ++visit;
    closeSheet();
    const previous = current;
    const animate = motionEnabled();
    const incoming = animate && card ? transitionCard(card, false) : null;
    if (!fromHistory) history.pushState({}, "", target);
    if (incoming) await incoming.animation.finished;
    if (ticket !== visit) {
        incoming?.cover.remove();
        return;
    }
    current = next;
    applyCalendarDay(target);
    render();
    void api("/activity/page", "POST", { path: current }).catch(() => {});
    scrollToTopAndFocus();
    const origin = next === "/" && page.querySelector(`.space-card[data-route="${previous}"]`);
    const returning = animate && origin && !incoming ? transitionCard(origin, true) : null;
    if (returning) {
        await returning.animation.finished;
        returning.cover.remove();
    }
    if (incoming) {
        await incoming.cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 145, fill: "both" }).finished;
        incoming.cover.remove();
    }
}

document.addEventListener("click", event => {
    const link = event.target.closest("[data-route]");
    if (!link || event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const animated = link.matches(".space-card, .tab-bar a");
    move(link.href, { card: animated ? link : null });
});
const searchButton = document.querySelector("[data-search]");
if (searchButton) searchButton.onclick = openSearch;
window.addEventListener("popstate", () => move(location.href, { fromHistory: true }));
window.addEventListener("naoning:data-reset", connect);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && current === "/" && ready) updateHome();
});

applyCalendarDay(new URL(location.href));
render();
connect();
const entrance = page.querySelector("#home-apps");
const landCards = () => entrance?.classList.add("space-list-landing");
if (document.body.dataset.welcome === "yes") {
    document.querySelector("#sheet").addEventListener("close", landCards, { once: true });
    showWelcome();
} else {
    landCards();
}
if (!readOnly) startReminders(id => move(`/evenements?event=${id}`));
