# Nav Unit V2.7

Moteur Chromium Playwright côté serveur, interface HTML par captures JPEG interactives. Le site distant n'est pas placé dans une iframe : seule l'interface locale l'est. Ne modifie ni l'identité du navigateur ni les politiques de sécurité des sites.

## Installation et démarrage automatique
Python 3.9+ et une connexion Internet au premier lancement sont nécessaires.
Windows : `python start_nav_unit.py` (ou `py start_nav_unit.py`).
Linux : `python3 start_nav_unit.py`.
Depuis le dossier parent, le lanceur crée `nav_unit/.venv`, installe requirements.txt et Chromium dans `nav_unit/.chromium`, puis démarre le serveur et ouvre http://127.0.0.1:8765/. Les installations sont réutilisées. Ctrl+C pour arrêter.
Sur Linux, certaines bibliothèques système ou python-venv peuvent manquer et nécessiter une installation via le gestionnaire de paquets de la distribution. Le script ne demande pas de privilèges administrateur et ne désactive pas le sandbox.

## Intégration
Servir votre page HTML depuis le même serveur local (modifier index.html ou ajouter une route explicite dans browser.py). Ajouter `<iframe src="/browser.html" title="Nav Unit" style="width:100%;height:600px;border:0"></iframe>`.

## Sécurité et limites
Serveur local uniquement, contrôle Host/Origin et jeton de session, pas de CORS, pas de journal des saisies, contexte éphémère, validation TLS par Chromium, sandbox activé. Ne pas exposer sur Internet : un seul navigateur partagé entre les onglets locaux. N'utiliser que sur une machine de confiance. Les sites peuvent toujours refuser Chromium automatisé, les connexions peuvent échouer ; aucune tentative de contournement. Les captures peuvent afficher des informations personnelles ; préférer le navigateur habituel pour les comptes sensibles. Pas de son, téléchargements, fenêtres multiples, glisser-déposer ou saisie IME complète. Ce n'est pas un navigateur de production. 

## Configuration
Modifier `nav_unit/config.json` avant le lancement. `port` : port préféré ; `auto_port` : choisir un port libre si occupé ; `open_browser` : ouverture automatique ; `homepage` : URL de départ ; `jpeg_quality` : qualité de capture ; `navigation_timeout_ms` : délai de navigation. Le port réel est affiché dans le terminal. La sécurité locale reste obligatoire.

## V2.4 — Site de démonstration

- `/index.html` : menu, bouton afficher/masquer, iframe intégrée.
- `/settings.html` : largeur fixe (320–1920 px) ou automatique, hauteur (240–1200 px), aperçu et réinitialisation.
- `demo.css` et `demo.js` : présentation et réglages du site, indépendants du moteur.
- Les dimensions sont enregistrées dans localStorage, par origine (adresse et port), et non dans config.json. La largeur effective est limitée à l’espace disponible. Le viewport Chromium reste à 1280 × 800 ; seul le container HTML change.
- Pour réutiliser l’exemple, servir ces fichiers sur le même serveur que browser.html. Les protections d’origine restent inchangées.

## V2.5 — Fluidité
Rendu JPEG binaire indépendant des commandes, serveur HTTP multithread et moteur asynchrone. `fps` règle la cadence cible (1–30), `jpeg_quality` la compression. La cadence réelle dépend du PC. Les fenêtres secondaires deviennent la page active. Les sites refusant les navigateurs automatisés restent susceptibles de refuser la connexion ; aucune protection n'est désactivée. Les commandes restent ordonnées. 

## V2.6
Cadence cible par défaut : 30 FPS, qualité JPEG 60. Le temps de capture et de transfert est déduit des intervalles respectifs. La cadence réelle dépend du matériel.

## Barre intelligente
Une adresse HTTP(S), un domaine, localhost ou une IP ouvre la page. Les autres saisies lancent une recherche Bing avec encodage des caractères. La cible de rendu reste 30 FPS.
