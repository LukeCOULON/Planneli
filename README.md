# Installer et lancer Planneli

```sh
git clone https://github.com/LukeCOULON/Planneli
cd Planneli
python start.py
```

Il faut Git et Python 3.10 ou une version plus récente. Si votre système utilise la commande `python3`, lancez `python3 start.py`. Au premier démarrage, Planneli installe ses dépendances et initialise une base SQLite vide. Une connexion Internet est nécessaire à cette étape.

Ouvrez l’adresse affichée dans le terminal. Par défaut, Planneli est disponible sur [http://localhost:2229](http://localhost:2229). Pour arrêter le serveur, appuyez sur **Ctrl+C** dans le terminal.

Le kit de déploiement web est fourni séparément de ce clone.

## Premiers pas

1. Créez un compte avec un mot de passe d’au moins huit caractères.
2. Créez une session ou rejoignez-en une avec un code de connexion.
3. Sur l’accueil, choisissez **Configurer le planning** pour définir les parents et la semaine de départ.

Le fichier [planning_config_starter.json](planning_config_starter.json) contient les réglages du serveur. Les données sont enregistrées dans le dossier local `.planneli-data/`.

## Mises à jour

Dans **Réglages → Données → Maintenance**, saisissez le code de maintenance affiché dans le terminal, puis choisissez **Vérifier les mises à jour**. Relancez `python start.py` après la préparation d’une mise à jour. Le journal des versions est consultable dans la maintenance et dans [version.json](version.json).
