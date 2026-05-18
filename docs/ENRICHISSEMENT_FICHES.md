# Plan d'enrichissement des fiches auto-école

## Contexte
Au 2026-04-23, 11 371 fiches existent sur le site (10 178 publiées historiques + ~9 898 créées en draft). Toutes ont le minimum : raison sociale, adresse, commune, code postal, taux de réussite gouvernemental (permis B), formations proposées, flags label qualité / permis 1€.

Pour maximiser l'attractivité (et donc conversion en leads), il faut enrichir chaque fiche avec :

1. **Note Google + nombre d'avis**
2. **Avis clients** (5-10 par fiche)
3. **Horaires d'ouverture**
4. **Téléphone vérifié** (Google Maps)
5. **Photos** (remplacer l'image générique par la vraie vitrine)
6. **Coordonnées GPS** (pour la carte)
7. **Tarifs** (optionnel — fragile)

## Source recommandée : Apify Google Maps

### Actor 1 — `compass/crawler-google-places`
- **Input** : `raison_sociale, adresse, code_postal commune, France`
- **Output** : place_id, note, nb_avis, horaires, téléphone, lat/long, photos URL, catégories
- **Coût** : ~3,50 $ / 1000 places → **~40 $ pour 11 371**
- **Temps** : 2-4h

### Actor 2 — `compass/google-maps-reviews-scraper`
- **Input** : liste de place_id (issus de l'étape 1)
- **Output** : 10 derniers avis par place (texte, note, auteur, date)
- **Coût** : ~3 $ / 1000 places → **~35 $ pour 11 371**
- **Temps** : 3-5h

### Budget total enrichissement : **~75-100 $ one-shot** (puis ~10-20 $/mois pour les MAJ trimestrielles)

## Architecture d'ingestion (à développer)

### Endpoint WordPress à créer
`POST /wp-json/lou/v1/enrich-from-gmb` — accepte un payload JSON Apify, fait le matching par raf_numero ou (raison_sociale + code_postal) et écrit les metas :

| Meta WP | Source GMB | Exemple |
|---|---|---|
| `note` | rating | `4.7` |
| `Nb_avis` | reviewsCount | `128` |
| `avis` | reviews (JSON) | `[{"author":"...","text":"...","stars":5,"date":"..."}]` |
| `horaires` | openingHours (JSON) | `{"lundi":"08:00-19:00",...}` |
| `telephone` | phone | `01 48 XX XX XX` |
| `lattitude` | location.lat | `48.123` |
| `longitude` | location.lng | `2.456` |
| `photos_gmb` | imageUrls (JSON) | `["url1","url2",...]` |
| `_thumbnail_id` | imageUrls[0] | → sideloadé dans médiathèque |

### Dashboard LOU — UI à ajouter
Dans `lou-dashboard/src/app/admin-lou/enrichissement/page.tsx` :
- Compteur "Fiches à enrichir" (`WHERE meta 'note' vide`)
- Upload fichier JSON résultat Apify
- Trigger via fetch → `/wp-json/lou/v1/enrich-from-gmb`
- Historique runs (qté fiches enrichies, date, coût estimé)

## Roadmap proposée

| Phase | Délai | Livrable |
|---|---|---|
| ✅ **0** | Fait | Création 11 371 fiches + cron publication 500/j |
| **1** | +2j | Lancer Actor 1 Apify sur tout le dataset (1x) → fichier JSON |
| **2** | +1j | Développer endpoint `/lou/v1/enrich-from-gmb` + UI LOU |
| **3** | +1j | Ingestion Actor 1 → 11 371 fiches avec note + horaires + photos |
| **4** | +2j | Actor 2 (reviews) → 11 371 × 10 avis enregistrés |
| **5** | continu | Scheduler trimestriel de re-scraping des 2 000 fiches les plus vues |

## Tarifs — recommandation
Stratégie lead-first plutôt que scraping :
- Sur chaque fiche sans tarifs : CTA **"Demander un devis"** → formulaire GHL prospect
- Bénéfice revenue-positive (lead = chiffre d'affaires direct)
- Pas de risque juridique (scraping tarifs exposerait à litiges)

Scraping tarifs possible en phase 6 si ROI prouvé sur les leads.

## Actions immédiates (post-création)

1. **Vérifier visuellement 3-4 fiches draft** (http://autoecolemagazine.fr/wp-admin/edit.php?post_type=auto-ecole&post_status=draft)
2. **Attendre la première vague de publication** (demain 03h30 Paris, 500 fiches)
3. **Créer un compte Apify + paramétrer actor 1** (faire avec Laurent)
4. **Développer endpoint enrich-from-gmb** (après validation visuelle des fiches)
