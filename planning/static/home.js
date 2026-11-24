import { capitalize, formatDate } from "./calendar.js";
import { api, colorDot, escapeHtml, icon } from "./ui.js";

let latestRequest = 0;

function summaryCard({ title, symbol, tone, content, route, href = route }) {
    const label = `${icon(symbol)}<span>${title}</span>`;
    return `<section class="today-card ${tone}">
        <h2>${route ? `<a href="${href}" data-route="${route}">${label}${icon("right")}</a>` : label}</h2>
        ${content}
    </section>`;
}

function parentLabel(parent) {
    return `<p class="today-parent">${colorDot(parent.color)}<strong>${escapeHtml(parent.name)}</strong></p>`;
}

function itemList(items, route, key, detail, emptyMessage) {
    if (!items.length) return `<p class="today-empty">${emptyMessage}</p>`;
    return `<ul class="today-items">${items.map(item => `<li><a href="${route}?${key}=${item.id}" data-route="${route}">
        <strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail(item))}</small>
    </a></li>`).join("")}</ul>`;
}

function overview({ day, custody, handoff, events, more_events, tasks, more_tasks }, hidden) {
    const planning = "/planning";
    const agenda = "/evenements";
    const actions = "/a-faire";
    const cards = [];
    const planningVisible = !hidden.includes(planning);
    if (planningVisible) {
        cards.push(summaryCard({
            title: "Garde du jour", symbol: "user", tone: "tone-planning",
            route: custody ? planning : null, href: `${planning}?day=${day}`,
            content: custody ? parentLabel(custody)
                : '<button type="button" class="today-setup" data-today-setup>Configurer le planning</button>',
        }));
    }
    if (planningVisible && custody) {
        cards.push(summaryCard({
            title: "Prochaine passation", symbol: "swap", tone: "tone-planning",
            route: handoff ? planning : null, href: `${planning}?day=${handoff?.day ?? day}`,
            content: handoff ? `<time class="today-handoff" datetime="${handoff.day}">${capitalize(formatDate(handoff.day, {
                weekday: "short", day: "numeric", month: "short",
            }))}</time>${parentLabel(handoff.parent)}` : '<p class="today-empty">Aucune date prévue</p>',
        }));
    }
    if (!hidden.includes(agenda)) {
        cards.push(summaryCard({
            title: "Rendez-vous", symbol: "event", tone: "tone-events", route: agenda, href: `${agenda}?day=${day}`,
            content: itemList(events, agenda, "event", event => event.start_time ?? "Toute la journée", "Aucun rendez-vous")
                + (more_events ? `<a class="today-more" href="${agenda}?day=${day}" data-route="${agenda}">Voir l’agenda</a>` : ""),
        }));
    }
    if (!hidden.includes(actions)) {
        cards.push(summaryCard({
            title: "Tâches à rendre", symbol: "task", tone: "tone-tasks", route: actions,
            content: itemList(tasks, actions, "task", task => task.due < day ? "En retard" : "Aujourd’hui", "Aucune tâche à rendre")
                + (more_tasks ? `<a class="today-more" href="${actions}" data-route="${actions}">Voir toutes les tâches</a>` : ""),
        }));
    }
    const unconfigured = planningVisible && !custody && cards.length === 3;
    return cards.length ? `<div class="today-grid${unconfigured ? " today-grid--unconfigured" : ""}"
        style="--today-columns:${cards.length}">${cards.join("")}</div>` : "";
}

export async function renderToday(host, date, onSetup, hidden) {
    const revision = ++latestRequest;
    const isCurrent = () => host.isConnected && revision === latestRequest;
    host.setAttribute("aria-busy", "true");
    try {
        const data = await api("/today");
        if (!isCurrent()) return;
        date.dateTime = data.day;
        date.innerHTML = `${icon("calendar")}<span>${capitalize(formatDate(data.day, {
            weekday: "long", day: "numeric", month: "long",
        }))}</span>`;
        date.hidden = false;
        host.innerHTML = overview(data, hidden);
        host.querySelector("[data-today-setup]")?.addEventListener("click", onSetup);
    } catch (error) {
        if (!isCurrent()) return;
        host.innerHTML = `<div class="today-feedback"><p role="alert">${escapeHtml(error.message)}</p>
            <button type="button" class="button secondary">Réessayer</button></div>`;
        host.querySelector("button").onclick = () => renderToday(host, date, onSetup, hidden);
    } finally {
        if (isCurrent()) host.removeAttribute("aria-busy");
    }
}
