import json

from .rules import InputError


HOME_CATEGORIES = (
    {"id": "famille", "title": "Famille", "apps": (
        {"path": "/planning", "name": "Planning de garde", "description": "Gardes et passations",
         "symbol": "calendar", "tone": "tone-planning"},
        {"path": "/evenements", "name": "Agenda familial", "description": "Rendez-vous et rappels",
         "symbol": "event", "tone": "tone-events"},
    )},
    {"id": "organisation", "title": "Organisation", "apps": (
        {"path": "/a-faire", "name": "Liste de tâches", "description": "Échéances et suivi",
         "symbol": "task", "tone": "tone-tasks"},
        {"path": "/notes", "name": "Bloc-notes", "description": "Notes à partager",
         "symbol": "note", "tone": "tone-notes"},
    )},
    {"id": "ecole", "title": "École", "apps": (
        {"path": "/cours", "name": "Bibliothèque de cours", "description": "Fiches et quiz de révision",
         "symbol": "book", "tone": "tone-courses"},
    )},
    {"id": "outils", "title": "Outils et loisirs", "apps": (
        {"path": "/navigateur", "name": "Navigateur intégré", "description": None,
         "symbol": "search", "tone": "tone-events"},
        {"path": "/jeux", "name": "Mini-jeux", "description": "Blocs, fusion et mémoire",
         "symbol": "games", "tone": "tone-games"},
    )},
)
APP_PATHS = {app["path"] for category in HOME_CATEGORIES for app in category["apps"]}
AGENDA_VIEWS = {"week", "month", "year"}


def home_preferences(data):
    preferences = {}
    for name in ("hidden", "favorites"):
        paths = data.get(name)
        if not isinstance(paths, list) or len(paths) > len(APP_PATHS) or any(
            not isinstance(path, str) or path not in APP_PATHS for path in paths
        ) or len(set(paths)) != len(paths):
            raise InputError("Choisissez les applications de l’accueil sans doublons.")
        preferences[name] = paths
    if set(preferences["hidden"]).intersection(preferences["favorites"]):
        raise InputError("Un favori doit être affiché sur l’accueil.")
    if "agenda_view" in data:
        view = data["agenda_view"]
        if not isinstance(view, str) or view not in AGENDA_VIEWS:
            raise InputError("Choisissez une vue d’agenda valide.")
        preferences["agenda_view"] = view
    return preferences


def home_configuration(stored):
    settings = json.loads(stored) if stored else {}
    hidden = [path for path in settings.get("hidden", []) if path in APP_PATHS]
    favorites = [path for path in settings.get("favorites", []) if path in APP_PATHS and path not in hidden]
    return {
        "categories": HOME_CATEGORIES, "hidden": hidden, "favorites": favorites,
        "agenda_view": settings.get("agenda_view", "month"),
    }
