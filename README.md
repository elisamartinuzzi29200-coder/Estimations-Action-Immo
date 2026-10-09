# Action Immobilière — Estimations

Application autonome de visite et de création de dossiers d'estimation immobilier, adaptée aux tablettes.

## Utilisation
Ouvrir `index.html` dans un navigateur récent. Remplir les renseignements de visite, enregistrer le dossier localement puis choisir **Générer le dossier PDF**. Dans la boîte d'impression, sélectionner **Enregistrer au format PDF** et les marges « Aucune ».

Les dossiers sont conservés **uniquement dans le stockage local du navigateur** et ne sont pas synchronisés entre appareils. Utiliser **Exporter une sauvegarde JSON** pour sauvegarder régulièrement et **Importer une sauvegarde JSON** pour restaurer.

## Fonctionnalités de cette première version
- Agences Brest / Quimper, vente / location, maison / appartement.
- Date française JJ/MM/AAAA dans le document.
- Architecture, terrain, installations, équipements et travaux détaillés.
- Visite pièce par pièce et points forts / de vigilance.
- Estimation au prix exact ou en fourchette.
- Dossier client de sept pages imprimable en PDF.
- Stockage local de plusieurs dossiers.

## Limites actuelles
Cette première version ne reprend pas automatiquement les dossiers stockés dans Floot. Le logo officiel n'est pas encore chargé dans le dépôt. La cartographie et l'intégration de photographies seront retravaillées dans une prochaine version. Les barèmes et mentions légales doivent être vérifiés avant remise au client (en particulier les plafonds des honoraires locatifs).

## Hébergement
Le fichier HTML fonctionne hors ligne. Pour l'héberger sur GitHub Pages, ouvrir les paramètres du dépôt puis **Pages**, et choisir la branche `main` et le dossier `/(root)`. Attention : publier le site avec GitHub Pages le rend accessible publiquement, même si les dossiers restent stockés localement dans votre navigateur.