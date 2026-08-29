export const LAUNCH_TIPS: string[] = [
  "Vous pouvez modifier les arguments de lancement depuis la page du jeu.",
  "Changez le mode d'affichage de votre bibliothèque (grille, liste, compacte) depuis le bouton en haut de la page Jeux.",
  "Ctrl+Space ouvre la recherche globale n'importe où, même fenêtre réduite.",
  "Vos jeux Steam sont détectés automatiquement, tout comme un dossier \"Games\" à la racine de vos disques.",
  "Ajoutez des favoris dans l'explorateur de fichiers pour y accéder en un clic.",
  "Créez plusieurs profils de lancement par jeu (Vanilla, Modded, Testing...) avec leurs propres mods et arguments.",
  "Le gestionnaire de mods garde toujours une copie de sauvegarde : rien n'est jamais perdu en désactivant un mod.",
  "Le bouton « Covers en masse » applique automatiquement une jaquette à tous les jeux qui n'en ont pas.",
  "Surveillez votre CPU, GPU, RAM et disques en temps réel depuis la page PC.",
  "Personnalisez le thème et la couleur d'accent depuis Paramètres.",
];

export function randomTip(excludeIndex?: number): { tip: string; index: number } {
  let index = Math.floor(Math.random() * LAUNCH_TIPS.length);
  if (LAUNCH_TIPS.length > 1 && index === excludeIndex) {
    index = (index + 1) % LAUNCH_TIPS.length;
  }
  return { tip: LAUNCH_TIPS[index], index };
}
