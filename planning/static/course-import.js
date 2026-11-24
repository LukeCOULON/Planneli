export const coursePrompt = `Crée un fichier Markdown (.md) en UTF-8 destiné à Planneli. Si je n’ai pas indiqué le niveau scolaire, demande-le-moi avant de rédiger. Vérifie les faits et les calculs, adapte le vocabulaire au niveau et évite les répétitions.

Commence par ce bloc, en remplaçant chaque valeur entre chevrons. Choisis une seule difficulté parmi Facile, Intermédiaire et Difficile.

-- INFO SUR LE COURS :
Matière : <matière>
Cours : <titre>
Niveau : <niveau scolaire>
Thème : <thème>
Difficulté : <difficulté>
--

Ajoute un titre « ## Plan du cours » et une liste numérotée. Pour chaque partie, utilise un titre comme « ## 1. Nom de la partie », puis explique la notion, illustre-la avec un exemple si possible et termine par l’essentiel à retenir. Utilise les listes, le gras et les titres de niveau inférieur du Markdown quand ils facilitent la lecture.

Utilise les balises de Planneli suivantes quand elles aident à comprendre ou à réviser.

- [[nombre:1914–1918]] met en évidence une donnée chiffrée complète, comme une période, une fraction ou une mesure. Tu peux aussi écrire [[nombre:3/4]], [[nombre:12,5 %]] ou [[nombre:250 mL]]. Les nombres ordinaires sont déjà mis en valeur dans le texte.
- [[bleu:mot important]], [[vert:résultat]], [[violet:notion]], [[ambre:point clé]] et [[rouge:erreur fréquente]] colorent le texte entre les deux-points et les crochets de fin. Le contenu de ces balises est du texte sur une seule ligne. N’imbrique pas de balises.
- [!DEFINITION] explique un terme.
- [!EXEMPLE] illustre une idée ou un calcul.
- [!RETENIR] résume l’essentiel.
- [!ATTENTION] signale un piège ou une exception.
- [!EXERCICE] présente une consigne à résoudre.
- [!TABLEAU] donne un titre à un tableau Markdown.
- [!QUIZ] présente une question de révision.
- [!CORRECTION] masque la réponse dans un volet à ouvrir.

Pour chaque encadré, commence la première ligne par « > [!TYPE] » et ajoute éventuellement un titre sur la même ligne. Commence chaque ligne du corps par « > », y compris les lignes vides à l’intérieur. Le corps peut contenir du Markdown, comme dans l’exemple ci-dessous.

> [!DEFINITION] Fraction
> Une fraction représente une **partie d’un tout**.

Pour un quiz, écris la question juste après « > [!QUIZ] ». Tu peux ajouter des choix ou un indice dans le corps. Laisse une ligne « > » avant la correction, puis utilise « > > [!CORRECTION] » et commence chaque ligne de réponse par « > > ». Explique la réponse avec du Markdown.

> [!QUIZ] Combien font trois quarts de 20 ?
> Fais le calcul avant d’ouvrir la correction.
>
> > [!CORRECTION]
> > **15**. Divise 20 par 4 pour obtenir 5, puis multiplie par 3.

Les tableaux utilisent les barres verticales du Markdown et une ligne de séparation sous l’en-tête. La balise [!TABLEAU] est facultative. Si tu l’utilises, laisse une ligne « > » entre le titre et le tableau, puis préfixe chaque ligne du tableau par « > ». Place « ---: » dans la ligne de séparation pour aligner une colonne de chiffres à droite, comme dans l’exemple ci-dessous.

> [!TABLEAU] Mesures de volume
>
> | Récipient | Volume (mL) |
> | --- | ---: |
> | Éprouvette | 250 |
> | Bécher | 500 |

Fournis le fichier .md sans ajouter de balises HTML ni entourer tout le document d’un bloc de code.

Sujet du cours : `;

export async function readCourseFile(file) {
    if (!/\.md$/i.test(file.name) || file.size > 200 * 1024) {
        throw new Error("Choisissez un fichier .md de 200 Kio maximum.");
    }
    let markdown;
    try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("Enregistrez le fichier Markdown en UTF-8 avant de l’importer."); }
    if (!markdown.trim()) throw new Error("Le fichier Markdown est vide.");
    if (markdown.length > 50000) throw new Error("Le cours est limité à 50 000 caractères.");
    return markdown;
}
