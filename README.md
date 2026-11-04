# Bâtons

**Une petite webapp pour animer des bonhommes bâton, directement dans le navigateur.**

👉 **Essayer : [batons-6b7.pages.dev](https://batons-6b7.pages.dev)**

Pas d'inscription, rien à installer. Tu poses ton bonhomme, tu crées des images clés, et l'appli calcule les mouvements intermédiaires pour que l'animation soit fluide.

---

## Ce qu'on peut faire

- **Poser le bonhomme** en tirant ses articulations (points rouges) à la souris ou au doigt.
- **Déplacer, agrandir et tourner tout le bonhomme** : `Cmd+A` (ou double-clic), puis tirer, ou utiliser les poignées ■ (taille) et ● (rotation).
- **Images clés** : ajouter, supprimer, naviguer dans la frise de miniatures.
- **Lecture fluide** : les poses intermédiaires sont calculées automatiquement (interpolation), avec ralenti sur les poses (« Adoucir ») et lecture en boucle.
- **Pelure d'oignon** : l'image précédente (en gris) et la suivante (en bleu) en transparence.
- **Textes animables** : position, taille, rotation et opacité s'animent ; la réplique et la visibilité changent image par image, pour faire des **dialogues**.
- **Dessin à main levée** :
  - ✏️ **Personnage** : le trait s'accroche au membre le plus proche et le suit (chapeau, épée…).
  - 🖌 **Décor** : le trait reste fixe sur toutes les images.
  - 🧽 Gomme et ↶ Annuler.
- **Sauvegarde automatique** dans le navigateur, et **fichier `.batons.json`** pour enregistrer, rouvrir ou partager une animation.
- **Export vidéo** (MP4 ou WebM selon le navigateur).

### Raccourcis clavier

| Touche | Action |
|---|---|
| `←` `→` | Image précédente / suivante |
| `N` | Nouvelle image (copie de l'actuelle) |
| `Suppr` | Supprimer l'image actuelle |
| `Espace` | Lecture / Stop |
| `O` | Afficher / masquer la pelure d'oignon |
| `T` | Ajouter un texte |
| `V` `P` `D` `E` | Outils Bouger / Personnage / Décor / Gomme |
| `Cmd+A` | Sélectionner tout le bonhomme (`Maj` pendant la rotation : pas de 15°) |
| `Cmd+Z` | Annuler le dernier trait |
| `Cmd+S` | Enregistrer le fichier |
| `Échap` | Désélectionner |

---

## Lancer le projet chez soi

Aucune installation, aucune dépendance, aucune étape de compilation :

```bash
git clone https://github.com/cecileRx/batons.git
cd batons
open index.html        # sur Mac ; sinon, ouvre index.html dans ton navigateur
```

## Comment c'est construit

Tout tient en deux fichiers, en HTML et JavaScript « à la main », sans framework :

- **`index.html`** : la page, les boutons et le style.
- **`app.js`** : toute la logique, découpée en sections commentées (en français).

Les idées principales :

- Le bonhomme est une liste d'**articulations** (des points x, y) reliées par des **os**. Animer, c'est déplacer les points.
- Une **image** contient la pose du bonhomme, sa taille et l'état de chaque texte. La lecture calcule les images intermédiaires avec `lerpFrame` (interpolation linéaire, éventuellement adoucie par `ease`).
- Un trait « personnage » est rangé **dans le repère de son os** (`toLocal`), puis replacé à chaque image (`toWorld`) : c'est pour ça qu'il suit le membre.
- Le dessin se fait sur un `<canvas>`, et l'export vidéo utilise `MediaRecorder`, intégré au navigateur.

---

## Contribuer : les pull requests sont les bienvenues ! 🙌

Ce projet est fait pour **évoluer avec d'autres**. Une idée, un bug, une amélioration ? Propose une pull request, même petite : une faute corrigée, un raccourci en plus, ou une vraie nouvelle fonction.

### Des idées pour commencer

- **Os à longueur fixe** : faire pivoter les membres au lieu de les étirer (cinématique simple).
- **Rotation globale animée** : pour qu'une culbute pivote vraiment au lieu de « tasser » le bonhomme entre deux images.
- **Plusieurs personnages** dans la même scène.
- **Décor animé** : un nuage qui passe, une porte qui s'ouvre.
- **Annuler / rétablir** général (pas seulement les traits).
- **Export GIF**, et choix de la taille ou du fond de la vidéo.
- **Bulles de dialogue** dessinées autour des textes.
- **Réordonner les images** en les glissant dans la frise.
- **Meilleure ergonomie sur téléphone et tablette**.
- **Traduction** de l'interface.

### Comment proposer une modification

1. **Fork** le dépôt (bouton « Fork » en haut à droite sur GitHub).
2. Crée une branche : `git checkout -b ma-super-idee`
3. Fais ta modification et **teste-la dans le navigateur** (ouvre `index.html`).
4. Commit, puis pousse ta branche : `git push origin ma-super-idee`
5. Ouvre une **pull request** en expliquant ce que tu as changé et pourquoi. Une capture d'écran ou un GIF, c'est encore mieux.

Pas sûr·e de toi ? Ouvre d'abord une **issue** pour en discuter, avec plaisir.

### Quelques principes, pour que le projet reste simple

- **Pas de dépendance ni d'étape de compilation** : on doit pouvoir ouvrir `index.html` et que ça marche.
- **Du code lisible et commenté** (en français de préférence), pensé aussi pour les gens qui apprennent.
- **Ne pas casser les animations existantes** : un ancien fichier `.batons.json` doit toujours s'ouvrir.
- Une pull request = un sujet. Plusieurs petites valent mieux qu'une énorme.

En proposant une pull request, tu acceptes que ta contribution soit publiée sous la même licence que le projet.

---

## Licence

[MIT](LICENSE) : tu peux utiliser, copier, modifier et redistribuer ce code librement, y compris dans tes propres projets, à condition de garder la mention de licence et le nom de l'autrice.
