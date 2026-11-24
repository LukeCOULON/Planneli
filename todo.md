# Planning familial — feuille de route

Application web familiale, en français, conçue d’abord pour le téléphone. Trois espaces accessibles depuis l’accueil : **Mon planning**, **Mes événements** et **Notes**. Un backend Python héberge l’application, sans création de compte.

## 1. Démarrage et conservation des données

- [x] Créer `start.py` comme point d’entrée unique. Au premier lancement, créer un environnement virtuel, installer les dépendances, initialiser le dossier de données et démarrer le serveur. Aux lancements suivants, réutiliser l’environnement et appliquer les migrations nécessaires.
- [x] Charger `planning_config_starter.json` depuis le dossier de `start.py`, quel que soit le répertoire courant. Valider la configuration avant d’ouvrir une base ou de démarrer le serveur. En cas de fichier absent ou invalide, indiquer le chemin du fichier et le réglage à corriger. Si le port est occupé, l’indiquer et s’arrêter.
- [x] Appliquer les réglages suivants au redémarrage de l’application.

| Clé JSON | Valeur initiale | Comportement attendu |
| --- | --- | --- |
| `mode` | `"normal"` | `"normal"` utilise la base persistante. `"bench"` démarre avec une base vide dans un dossier temporaire dédié au lancement. |
| `host` | `"127.0.0.1"` | Accès depuis la machine hôte. Utiliser `"0.0.0.0"` pour écouter sur le réseau et se connecter depuis le téléphone via l’adresse IP de la machine. |
| `port` | `8000` | Port HTTP, entier compris entre 1 et 65535. |
| `data_dir` | `null` | Utilise le dossier utilisateur par défaut. Un chemin absolu permet de choisir un autre dossier hors du projet en mode normal. |

- [x] En mode bench, ignorer `data_dir` et isoler toutes les données de l’application dans le dossier temporaire. Autoriser les essais en écriture pendant la session et supprimer le dossier à l’arrêt normal. Chaque nouveau lancement repart à vide, y compris pour la configuration des parents.
- [x] Retenir SQLite comme base locale. Sous Linux, utiliser `${XDG_DATA_HOME:-$HOME/.local/share}/planning-familial/`. Prévoir un chemin adapté au dossier utilisateur sur les autres systèmes et une option pour choisir un autre emplacement.
- [x] Séparer le dossier de données du code. Vérifier qu’une mise à jour, un redémarrage ou un lancement depuis un autre répertoire conserve les données.
- [x] Afficher l’adresse de connexion et documenter l’accès depuis un téléphone sur le même Wi-Fi. Écouter sur la boucle locale par défaut et rendre l’accès réseau configurable. Comme l’application est sans compte, réserver cet accès à un réseau de confiance.
- [x] Prévoir une sauvegarde et une restauration documentées, avec un essai de restauration sur une base de test.
- [x] Traiter les dates civiles indépendamment des heures. Utiliser le fuseau configuré pour les rendez-vous et rappels.

## 2. Accueil et navigation mobile

- [x] Afficher trois cartes empilées dans cet ordre : **Mon planning**, **Mes événements**, **Notes**.
- [x] Au toucher, agrandir la carte jusqu’à remplir la fenêtre, puis afficher la page correspondante. Prévoir une transition de retour et faire fonctionner le bouton Retour du navigateur.
- [x] Créer une interface d’inspiration iOS avec surfaces translucides, flou d’arrière-plan, ombres douces et angles arrondis. Garder les textes lisibles sur tous les fonds.
- [x] Donner un retour visuel aux appuis, changements de vue et ouvertures de formulaires. Respecter la préférence de mouvement réduit et conserver une navigation utilisable au clavier.
- [x] Vérifier la disposition sur petits écrans et prendre en compte les zones sûres. Garder les actions fréquentes faciles à atteindre au pouce.
- [ ] Vérifier le clavier virtuel et les zones sûres sur des téléphones physiques.

## 3. Mon planning

### Mise en route et calcul

- [x] Au premier lancement, demander le prénom ou libellé des deux parents, leurs couleurs, la semaine de référence et le parent qui commence cette semaine. Ramener la date choisie au lundi correspondant et enregistrer la configuration.
- [x] Calculer l’alternance par semaines civiles, du lundi au dimanche, avant comme après la semaine de référence. Vérifier le passage de décembre à janvier.
- [x] Permettre de modifier les libellés et couleurs des parents depuis les réglages. Afficher un libellé en plus de la couleur.

### Attributions et gardes

- [x] Permettre d’attribuer une journée ou une période, bornes incluses, à l’un des parents. Permettre également d’inverser les attributions parentales sur une période.
- [x] Afficher un aperçu avant une modification de période. Permettre de retirer une exception pour retrouver l’attribution calculée.
- [x] Ajouter des personnes de garde et les associer à un ou plusieurs jours de la semaine. Afficher la garde récurrente séparément du parent responsable et permettre de la suspendre.
- [x] Ajouter dans les réglages une bascule par année pour inverser tous les samedis et dimanches compris dans cette année. Afficher l’état de la bascule et permettre de revenir à l’alternance habituelle.
- [x] Appliquer la règle proposée suivante : calculer l’alternance, appliquer l’inversion des week-ends de l’année, puis appliquer les exceptions de date. Une inversion de période se calcule à partir des attributions affichées au moment de la validation.

### Calendrier et notes journalières

- [x] Construire les vues semaine, mois et année. Ajouter Précédent, Suivant et Aujourd’hui, ainsi qu’un balayage horizontal du calendrier. Préserver le défilement vertical sur téléphone.
- [x] Permettre de passer d’une année à un mois, puis d’ouvrir le détail d’une journée. Afficher le parent, une éventuelle personne de garde et les notes.
- [x] Créer, modifier et supprimer plusieurs notes sur une journée, avec auteur et case à cocher facultative. Enregistrer l’état de chaque case après rechargement.

## 4. Mes événements

- [x] Créer, modifier et supprimer des événements et rendez-vous. Prévoir un titre, une date, des heures, un lieu, une note attachée et une couleur personnalisable. Permettre un événement sans heure.
- [x] Afficher les événements dans les vues semaine, mois et année. Réutiliser les commandes du calendrier du planning et ouvrir le détail depuis chaque vue.
- [x] Permettre d’activer un rappel et de choisir son délai. Demander la permission du navigateur à la suite d’une action explicite, afficher son état et éviter les rappels en double.
- [x] Documenter HTTPS sur le réseau local et afficher un rappel dans l’application en cas de refus ou d’incompatibilité.
- [ ] Tester les notifications système sur les téléphones visés.
- [x] Documenter le périmètre des rappels avec l’application ouverte.
- [ ] Valider la réception après fermeture sur les appareils ciblés selon la prise en charge de Web Push, les conditions d’installation et l’accès au réseau.

## 5. Notes

- [x] Afficher les notes dans un bloc-notes. Permettre de les créer, ouvrir, modifier et supprimer.
- [x] Enregistrer le titre, le contenu, les dates de création et de modification, ainsi qu’une couleur personnalisable. Prévoir une date associée, des personnes et un lieu en champs facultatifs.
- [x] Préserver les retours à la ligne et les accents. Trier les notes par dernière modification et prévoir une confirmation avant suppression.

## 6. Tâches de réalisation

La complexité est relative au projet. **Faible** correspond à une modification ciblée, **moyenne** à une fonction impliquant plusieurs composants, **élevée** à des règles métier délicates ou à des essais sur plusieurs appareils. Les dépendances indiquent les tâches à terminer avant de valider la suivante.

### Socle Python et accueil

| Tâche | Complexité | Dépend de | Terminée quand… |
| --- | --- | --- | --- |
| [x] T01 · Créer le socle web Python | Faible | — | Une route d’accueil répond et charge les ressources CSS et JS du projet. |
| [x] T02 · Charger et valider le JSON de lancement | Faible | — | Les quatre réglages sont validés et les erreurs indiquent le fichier et la clé concernés. |
| [x] T03 · Installer et lancer via `start.py` | Moyenne | T01, T02 | Une installation vierge démarre avec une commande. Un second lancement réutilise l’environnement, respecte le port et affiche l’adresse de connexion. |
| [x] T04 · Initialiser SQLite et les migrations | Moyenne | T01, T02 | Le chemin de données est résolu hors du projet et une migration préserve les enregistrements existants. |
| [x] T05 · Isoler le mode bench | Moyenne | T03, T04 | Chaque lancement bench part d’une base vide, permet les écritures et nettoie son dossier à l’arrêt normal. |
| [x] T06 · Construire l’accueil mobile et les styles | Moyenne | T01 | Les trois cartes empilées ouvrent leur page. Le flou, les ombres et les arrondis restent lisibles sur petit écran. |
| [x] T07 · Animer l’ouverture et le retour | Moyenne | T06 | La carte s’étend avant l’ouverture. Le retour navigateur et le mouvement réduit fonctionnent. |

### Calendrier et planning familial

| Tâche | Complexité | Dépend de | Terminée quand… |
| --- | --- | --- | --- |
| [x] T08 · Construire le calendrier commun | Élevée | T06 | Les vues semaine, mois et année naviguent par boutons et balayage, avec retour à aujourd’hui et défilement vertical utilisable. |
| [x] T09 · Configurer les deux parents | Moyenne | T04, T06 | Le formulaire initial enregistre les libellés, couleurs, lundi de référence et parent de départ. Les libellés et couleurs se modifient ensuite dans les réglages. |
| [x] T10 · Calculer et afficher l’alternance | Moyenne | T08, T09 | Chaque date affiche le parent attendu, y compris avant l’ancrage et lors d’un changement d’année. |
| [x] T11 · Basculer les week-ends par année | Moyenne | T10 | Activer ou désactiver la bascule recalcule les samedis et dimanches de l’année choisie. |
| [x] T12 · Gérer les exceptions de date et de période | Élevée | T11 | L’attribution et l’inversion ont un aperçu, sont enregistrées en une transaction et suivent la priorité définie au §3. Le retrait d’une exception restaure le calcul. |
| [x] T13 · Gérer les gardes récurrentes | Moyenne | T10 | Une personne peut être associée à plusieurs jours, puis suspendue. La garde et le parent restent identifiables dans le détail du jour. |
| [x] T14 · Gérer les notes journalières | Moyenne | T10 | Plusieurs notes avec auteur peuvent être ajoutées, modifiées et supprimées. Les cases facultatives conservent leur état après rechargement. |

### Événements, bloc-notes et rappels

| Tâche | Complexité | Dépend de | Terminée quand… |
| --- | --- | --- | --- |
| [x] T15 · Créer les formulaires d’événements | Moyenne | T04, T06 | Un rendez-vous peut être créé, modifié et supprimé avec ou sans heure, et conserve son lieu, sa note et sa couleur. |
| [x] T16 · Afficher les événements dans le calendrier | Moyenne | T08, T15 | Les trois vues affichent les événements du créneau courant et donnent accès à leur détail. |
| [x] T17 · Construire le bloc-notes | Moyenne | T04, T06 | Une note conserve ses champs, accents et retours à la ligne. Les notes sont triées par modification et la suppression demande confirmation. |
| [x] T18 · Programmer les rappels avec la page ouverte | Élevée | T15 | Le délai et le fuseau sont pris en compte, chaque rappel se déclenche une fois et un message dans l’application couvre le refus ou l’incompatibilité. |
| [ ] T19 · Vérifier les rappels après fermeture | Élevée | T18 | Les essais sur iOS et Android documentent la faisabilité avec HTTPS et Web Push, ainsi que les prérequis sur chaque appareil. |
| [ ] T20 · Implémenter les rappels après fermeture selon les résultats | Élevée | T19 | Si la cible est compatible, un rappel est reçu après fermeture dans les conditions documentées. Sinon, la limite constatée est consignée. |

### Livraison et validation

| Tâche | Complexité | Dépend de | Terminée quand… |
| --- | --- | --- | --- |
| [x] T21 · Documenter l’accès local et réseau | Faible | T03 | Les instructions permettent de lancer le serveur, modifier le JSON et accéder au site depuis un téléphone sur le même Wi-Fi. |
| [x] T22 · Préparer la sauvegarde et la restauration | Moyenne | T04 | Une sauvegarde réalisée selon la procédure est restaurée sur une base de test et ses données sont vérifiées. |
| [ ] T23 · Valider la première version sur téléphone | Élevée | T05, T07, T12, T13, T14, T16, T17, T18, T21, T22 | Les vérifications du §7 passent et les parcours sont utilisables sur Safari iOS et Chrome Android. |

Les tâches T19 et T20 forment un chantier distinct de la première version, comme prévu au §4. Les prérequis Web Push sont documentés dans le [README](README.md#rappels-et-https). T23 reste à valider sur téléphone physique.

## 7. Vérifications avant la première version

- [x] Changer le port dans le JSON et lancer `start.py` depuis un autre dossier. Vérifier que le port choisi est utilisé et qu’une valeur invalide produit un message explicite.
- [x] Créer des données en mode normal, démarrer deux fois en mode bench et vérifier que chaque session démarre à vide. Revenir au mode normal et vérifier que les données d’origine sont intactes.

- [x] Sur une installation vierge, lancer `python3 start.py`, vérifier l’accès via l’adresse réseau et terminer la configuration des parents en émulation mobile.
- [x] Vérifier une semaine antérieure et une semaine postérieure au lundi de référence, un changement d’année et une inversion de week-ends aux limites de l’année choisie.
- [x] Vérifier qu’une exception individuelle reste prioritaire après une inversion annuelle, et qu’une période d’un seul jour applique la même règle qu’une attribution individuelle.
- [x] Créer une note journalière, un événement et une note libre. Redémarrer puis mettre à jour le code. Vérifier les données, les couleurs et l’état de la case.
- [x] Tester les trois vues sur Chromium et WebKit en émulation mobile, dont le balayage tactile sur Chromium. Vérifier le refus et l’autorisation des notifications dans Chromium et les rappels avec la page ouverte.
- [ ] Vérifier sur Safari iOS et Chrome Android physiques l’accès sur le même Wi-Fi, les trois vues, le balayage, les formulaires avec clavier virtuel et les notifications avec HTTPS.
