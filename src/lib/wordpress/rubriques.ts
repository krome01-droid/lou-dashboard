// Le rubricage des articles d'autoecolemagazine.fr.
//
// Pourquoi ce fichier existe : 13 articles écrits par la machine entre le 1er et
// le 27 septembre 2026 sont arrivés en « Non classé ». Pas parce que la
// catégorie manquait — la rédaction en demandait bien une — mais parce que
// `findOrCreateCategory()` cherchait la catégorie par un slug DÉDUIT du nom
// (« Actualités » → `actualites`) quand le site la range sous
// `actualites-auto-ecole`. La recherche échouait, la création repartait en
// erreur `term_exists`, et le `.catch(() => null)` de la route déposait
// l'article sans catégorie : WordPress lui collait sa catégorie par défaut.
// Le même défaut a fabriqué un doublon `comparatifs` (id 102) à côté de
// `comparatifs-auto-ecole` (id 7).
//
// Deux réponses, toutes les deux ici : on retrouve une catégorie par son NOM
// normalisé (accents et casse mis de côté) autant que par son slug, et on
// choisit la rubrique en fonction du SUJET de l'article plutôt que de tout
// verser dans « Actualités ».
//
// Le classement est volontairement fait par des règles, pas par un modèle :
// il doit pouvoir se rejouer à l'identique, s'expliquer ligne à ligne, et
// tourner même quand l'API du hub est en panne. Les motifs ci-dessous ont été
// calés sur les rubriques telles que le site les emploie DÉJÀ (un retrait de
// points est un « Conseils » chez LOU, pas une « Sécurité routière » ; une
// fraude est une « Actualités »), pas sur une taxonomie idéale.

/** Casse, accents et ponctuation mis de côté : « Sécurité routière » → `securite-routiere`. */
export function normaliserTerme(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

interface Regle {
  /** Poids ajouté à la rubrique quand un motif touche. Le titre compte double. */
  poids: number
  motifs: RegExp[]
}

interface Rubrique {
  /** Le nom tel qu'il doit apparaître dans WordPress. */
  nom: string
  /** Slugs déjà en place sur le site, pour retrouver la catégorie sans la recréer. */
  slugs: string[]
  regles: Regle[]
}

/**
 * Ordre = priorité : à score égal, la rubrique déclarée en premier gagne. Les
 * rubriques spécifiques passent donc devant les fourre-tout (« Guides »,
 * « Actualités »), qui ne doivent attraper que ce que rien d'autre ne réclame.
 */
export const RUBRIQUES: Rubrique[] = [
  {
    nom: "villes",
    slugs: ["villes"],
    regles: [
      {
        // Le seul motif qui ne se confond avec rien : la forme des comparatifs
        // de ville écrits par la machine (« Comparatif 32 établissements »).
        // On ne cherche PAS « auto-école <nom> guide complet » : sur ce site,
        // la moitié de ces titres désigne un établissement (« Auto-école
        // Labussière »), l'autre une ville — le texte seul ne les sépare pas.
        poids: 5,
        motifs: [/comparatif (des )?\d+ etablissements/],
      },
    ],
  },
  {
    nom: "Financement du permis",
    slugs: ["financement-du-permis"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bcpf\b/,
          /compte personnel de formation/,
          /permis (a )?1 euro/,
          /\bfinancement\b/,
          /\bfinancer\b/,
          /\baides?\b/,
          /france travail|pole emploi/,
          /\bbourse\b/,
        ],
      },
      {
        poids: 3,
        motifs: [
          /prix du permis|cout du permis|cout permis|prix permis/,
          /\bfacture\b/,
          /\bbudget\b/,
          /\bcarburant\b/,
          /\bfinancieres?\b/,
        ],
      },
      { poids: 1, motifs: [/\btarifs?\b/, /\bcouts?\b/, /\bprix\b/] },
    ],
  },
  {
    nom: "Métiers",
    slugs: ["metiers-auto-ecole"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bmoniteur/,
          /enseignant de la conduite/,
          /\becsr\b/,
          /\bsalaire\b/,
          /devenir (moniteur|enseignant|formateur)/,
          /gerant|exploitant/,
          /logiciels? auto ecole/,
          /\bfimo\b|\bfco\b/,
          /poids lourd/,
          /\bvtc\b|\btaxi\b/,
          /permis [cde]\b|permis c1\b/,
        ],
      },
    ],
  },
  {
    nom: "Mobilité",
    slugs: ["mobilite"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bzfe\b/,
          /crit ?air/,
          /zones? a faibles emissions/,
          /trottinette/,
          /autopartage|covoiturage/,
          /mobilite urbaine|mobilites?\b/,
          /voiture electrique|borne de recharge/,
          /transports? en commun/,
        ],
      },
      { poids: 2, motifs: [/scooter|\bvelo\b|\bvae\b/] },
    ],
  },
  {
    nom: "Sécurité routière",
    slugs: ["securite-routiere"],
    regles: [
      {
        poids: 5,
        motifs: [
          /\btues?\b|\bmorts?\b|mortalite|\bdeces\b/,
          /accidentalite|accidents? de la route/,
          /bilan (de la )?securite routiere/,
        ],
      },
      {
        poids: 4,
        motifs: [
          /securite routiere/,
          /alcool au volant|alcoolemie|stupefiants|drogue au volant/,
          /telephone au volant|ceinture de securite/,
          /angle mort|distance de securite/,
          /vehicules? prioritaires?/,
          /equipement (moto|obligatoire)/,
          /usagers? de la route/,
        ],
      },
      { poids: 2, motifs: [/\bvitesse\b/, /\bpanneaux?\b/, /priorite a droite/] },
    ],
  },
  {
    nom: "Comparatifs",
    slugs: ["comparatifs-auto-ecole", "comparatifs"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bcomparatif\b|\bcomparaison\b|\bcomparer\b/,
          /meilleures? auto ecoles?/,
          /\bclassement\b/,
          /\bavis\b.*(prix|formation|fiable|efficacite)/,
          /ou traditionnelle|\bversus\b|\bvs\b/,
        ],
      },
      {
        // Le nom d'un réseau ou d'une auto-école en ligne dans le titre dit que
        // l'article parle d'une OFFRE, pas d'un mécanisme : il pèse plus lourd
        // que le « comment ça fonctionne » qui l'accompagne presque toujours.
        poids: 5,
        motifs: [
          /\bstych\b|\bornikar\b|lepermislibre|en voiture simone|codeclic|vroom ?vroom|auto ecole net|\bcer\b|\becf\b|permisecole/,
        ],
      },
      { poids: 2, motifs: [/auto ecoles? en ligne/] },
    ],
  },
  {
    nom: "Conseils",
    slugs: ["conseils-auto-ecole"],
    regles: [
      {
        poids: 5,
        motifs: [
          /suspension de permis|suspension permis/,
          /annulation de permis|annulation permis/,
          /retrait de points|recuperation de points|solde de points/,
          /permis blanc|confiscation/,
          /visite medicale|controle medical/,
        ],
      },
      {
        poids: 3,
        motifs: [
          /\brecours\b/,
          /que faire (si|en cas)/,
          /\bdemarches?\b/,
          /vos droits|quels droits/,
          /bien choisir|comment choisir/,
        ],
      },
      {
        // « conseils », « éviter », « réussir » sont du vocabulaire de titre
        // SEO : ils traînent dans la moitié des articles du site, quel qu'en
        // soit le sujet. Ils départagent une égalité, ils ne décident pas.
        poids: 1,
        motifs: [/\bconseils?\b/, /\beviter\b/, /reussir (son|sa|du|le)/],
      },
    ],
  },
  {
    nom: "Formation",
    slugs: ["formation-auto-ecole"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bmanoeuvres?\b|\bcreneau\b|demi-tour/,
          /voies de circulation/,
          /heures de conduite/,
          /boite automatique/,
          /maitriser/,
        ],
      },
    ],
  },
  {
    nom: "Guides",
    slugs: ["guides-pratiques-du-permis-de-conduire"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bguide\b|guide complet/,
          /tout savoir/,
          /comment (fonctionne|ca marche|se passe)/,
          /\bfonctionnement\b/,
          /\blexique\b|\bvocabulaire\b|\bsigles?\b|\bdefinitions?\b/,
          /mode d emploi|etapes?\b/,
          /conduite accompagnee|\baac\b|conduite supervisee|candidat libre/,
          /\bagrement\b|\bcontrat\b|\binscription\b/,
        ],
      },
      { poids: 3, motifs: [/examen du permis|epreuve (pratique|theorique)/] },
    ],
  },
  {
    nom: "Actualités",
    slugs: ["actualites-auto-ecole"],
    regles: [
      {
        poids: 4,
        motifs: [
          /\bfraude\b|\barnaque\b|escroquerie|\busurpation\b|substitution d identite/,
          /\breforme\b|\bdecret\b|nouvelle (loi|regle)|ce qui change/,
          /\bsanctions?\b.*\bloi\b/,
          /\bdebat\b|\bpolemique\b/,
        ],
      },
    ],
  },
]

/** La rubrique par défaut : un article d'actualité reste une actualité. */
export const RUBRIQUE_PAR_DEFAUT = "Actualités"

export interface Classement {
  /** Nom de la rubrique retenue, tel qu'il doit exister dans WordPress. */
  rubrique: string
  /** Score de la rubrique retenue. 0 = rien n'a touché, c'est le défaut. */
  score: number
  /** Motifs qui ont pesé, pour qu'un classement discutable se relise. */
  motifs: string[]
  /** Le dauphin, quand il existe : c'est là que se logent les cas limites. */
  second: { rubrique: string; score: number } | null
}

/**
 * Classe un article d'après son titre, son slug et son résumé. Le titre compte
 * double : c'est lui qui porte le sujet, le corps parle de tout.
 */
export function classerArticle(entree: {
  titre: string
  slug?: string
  extrait?: string
}): Classement {
  // `normaliserTerme` efface tout ce qui n'est pas alphanumérique : sans cette
  // ligne, « Permis à 1 € par jour » devient « permis a 1 par jour » et le
  // motif du financement ne voit plus l'euro.
  const preparer = (valeur: string) =>
    normaliserTerme(valeur.replace(/€/g, " euro ")).replace(/-/g, " ")

  const titre = preparer(entree.titre)
  const reste = preparer(`${entree.slug ?? ""} ${entree.extrait ?? ""}`)

  const scores: { rubrique: string; score: number; motifs: string[] }[] = []

  for (const rubrique of RUBRIQUES) {
    let score = 0
    const motifs: string[] = []
    for (const regle of rubrique.regles) {
      for (const motif of regle.motifs) {
        const dansTitre = motif.test(titre)
        const dansReste = motif.test(reste)
        if (!dansTitre && !dansReste) continue
        score += dansTitre ? regle.poids * 2 : regle.poids
        motifs.push(`${motif.source}${dansTitre ? " (titre)" : ""}`)
      }
    }
    if (score > 0) scores.push({ rubrique: rubrique.nom, score, motifs })
  }

  // Tri stable : à score égal, l'ordre de déclaration de RUBRIQUES tranche,
  // c'est-à-dire la rubrique la plus spécifique.
  scores.sort((a, b) => b.score - a.score)

  if (scores.length === 0) {
    return { rubrique: RUBRIQUE_PAR_DEFAUT, score: 0, motifs: [], second: null }
  }

  return {
    rubrique: scores[0].rubrique,
    score: scores[0].score,
    motifs: scores[0].motifs,
    second: scores[1]
      ? { rubrique: scores[1].rubrique, score: scores[1].score }
      : null,
  }
}
