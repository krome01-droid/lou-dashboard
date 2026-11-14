// Une requête Search Console cherche-t-elle UN établissement précis ?
//
// autoecolemagazine.fr porte un annuaire de 20 081 fiches `auto-ecole` : la
// plupart des requêtes qui l'amènent sont des requêtes de NAVIGATION — le nom
// d'une auto-école, avec ou sans sa ville. Sur les 200 premières requêtes du
// 17/10 au 14/11/2026, 57 des 89 que `choisirMotCle` jugeait « à travailler »
// (6e à 40e place, 25+ impressions) en sont. Un article de fond ne peut pas y
// répondre : celui qui tape « auto école sebastopol » veut l'adresse, le
// téléphone et les avis de CETTE auto-école, pas un guide pour vérifier une
// école de conduite. Du 06/10 au 10/11/2026, cinq passages du mardi en ont
// pourtant rédigé un : « auto école chris », « auto école sebastopol »,
// « ad permis », « plus que permis haguenau », « auto école de la gare ». La
// page qui répond à ces requêtes existe déjà : c'est la fiche de l'annuaire.
//
// Deux règles :
//   1. la requête contient le NOM d'un établissement de l'annuaire ;
//   2. la requête termine par « photos » ou commence par « avis sur » : c'est
//      la forme des requêtes nées d'une fiche d'établissement dans Google.
// Une troisième a été mesurée et écartée : « auto école » suivi d'un mot qui
// n'est pas une ville. Elle ne reconnaît qu'une navigation de plus sur les 89
// (« auto école montabo », un quartier de Cayenne absent de l'annuaire) et
// prend 31 des 115 requêtes d'information d'essai (« auto école pas cher »,
// « auto école quel âge »…) : en minuscules, rien ne distingue un nom propre.
//
// Le nom d'une fiche se lit dans son titre (« Auto-école Auto Ecole De La
// Gare à Compiegne », « ECF Bourlier - L'Argentière-La Bessée », « Plus que
// Permis ») : on retire les mots « auto-école » et la ville, il reste
// « de la gare », « ecf bourlier », « plus que permis ». Les précautions qui
// tiennent la règle loin des requêtes d'information — zéro des 115 requêtes
// d'essai, deux des 187 titres d'articles de fond, qui sont justement deux
// des articles de navigation :
//   - un nom fait uniquement de mots du métier n'est pas un nom : l'annuaire
//     porte une fiche « Permis de Conduire », et « prix permis de conduire »
//     deviendrait une navigation ;
//   - un nom qui est une ville (« Auto-école Rethel ») n'en est pas un non
//     plus : « auto école rethel » cherche les auto-écoles de Rethel, ce que
//     ce module ne tranche pas ; et un nom pris dans une ville de la requête
//     ne compte pas (« denis » dans « auto école saint denis ») ;
//   - un nom d'un seul mot (« Olivier », « Deguisne ») ne compte que si la
//     requête parle d'auto-école ou ne contient rien d'autre que lui, une
//     ville et des mots du métier : « olivier » seul, « a2e rosporden » ou
//     « auto école olivier », oui ; un mot courant dans une phrase, non ;
//   - un réseau national nommé sans ville (« stych avis », « ecf ») se
//     travaille : le magazine en fait la critique. Avec une ville, c'est une
//     agence.

/** Mots qui ne portent pas de nom, élisions comprises. */
const VIDES = new Set([
  "a", "au", "aux", "avec", "c", "chez", "d", "dans", "de", "des", "du", "en",
  "et", "j", "l", "la", "le", "les", "m", "n", "ou", "par", "pour", "s", "sa",
  "sans", "ses", "son", "sur", "t", "un", "une", "y", "qu", "se", "ce", "ces",
  "cet", "cette", "ma", "mes", "mon", "ta", "tes", "ton", "nos", "notre", "vos",
  "votre", "leur", "leurs", "il", "elle", "on", "nous", "ils", "elles",
])

/**
 * Le vocabulaire du métier, de la route et des requêtes d'information. Un nom
 * fait uniquement de ces mots n'identifie aucun établissement : l'annuaire
 * porte une fiche « Permis de Conduire », une « Auto-école du Rond-Point »,
 * une « l'Essentiel », et sans cette liste « prix permis de conduire » ou
 * « rond point priorité » deviendraient des navigations. Elle est volontairement
 * large : un mot de trop laisse passer une requête de navigation ; un mot de
 * moins fait d'une vraie question une navigation, que le site ne travaille
 * plus jamais.
 */
const METIER = new Set([
  // ce que désigne l'établissement
  "auto", "autos", "moto", "motos", "ecole", "ecoles", "autoecole", "autoecoles",
  "conduite", "conduites", "conduire", "permis", "code", "route", "routes",
  "routiere", "routier", "formation", "formations", "centre", "centres", "agence",
  "agences", "cours", "academie", "institut", "service", "services", "club",
  "association",
  // la route
  "rond", "giratoire", "priorite", "carrefour", "panneau", "panneaux", "feux",
  "autoroute", "creneau", "manoeuvre", "manoeuvres", "stationnement", "voie",
  "voies", "ville", "campagne", "pluie", "neige",
  // ce que cherche une requête d'information
  "examen", "examens", "stage", "stages", "lecon", "lecons", "heure", "heures",
  "moniteur", "monitrice", "moniteurs", "enseignant", "ecsr", "titre",
  "professionnel", "metier", "salaire", "inscription", "inscrire", "candidat",
  "libre", "prix", "tarif", "tarifs", "cout", "couts", "cher", "pas", "moins",
  "low", "cost", "promo", "pack", "forfait", "formule", "offre", "gratuit",
  "gratuite", "euro", "euros", "jour", "financement", "aide", "aides", "cpf",
  "avis", "photos", "photo", "proximite", "pres", "autour", "moi", "ici", "ligne",
  "online", "internet", "domicile", "navette", "accelere", "acceleree", "rapide",
  "express", "intensif", "intensive", "accompagnee", "accompagne", "supervisee",
  "aac", "boite", "automatique", "manuelle", "voiture", "voitures", "vehicule",
  "scooter", "camion", "poids", "lourd", "lourds", "bus", "remorque", "bateau",
  "cotier", "fluvial", "points", "point", "recuperation", "securite",
  "sensibilisation", "theorique", "pratique", "reussite", "taux", "resultat",
  "resultats", "meilleur", "meilleure", "meilleurs", "meilleures", "top",
  "classement", "comparatif", "liste", "annuaire", "agree", "agreee", "agrement",
  "label", "qualite", "solidaire", "sociale", "social", "associative",
  "independante", "independant", "franchise", "reseau", "ouverte", "ouvert",
  "samedi", "dimanche", "soir", "nuit", "senior", "seniors", "jeune", "jeunes",
  "handicap", "adapte", "adaptee", "neph", "ants", "dossier", "demande",
  "echange", "renouvellement", "visite", "medicale", "alcool", "vitesse",
  "probatoire", "zfe", "critair", "electrique", "hybride", "simulateur", "test",
  "tests", "question", "questions", "serie", "series", "nouveau", "nouvelle",
  "france", "francaise", "national", "nationale", "contact", "telephone",
  "adresse", "horaires", "horaire", "numero", "rendez", "vous", "date", "dates",
  "age", "ans", "mois", "semaine", "semaines", "temps", "delai", "delais",
  "duree", "droit", "regle", "regles", "loi", "guide", "conseil", "conseils",
  "astuce", "astuces", "erreur", "erreurs", "piege", "pieges", "essentiel",
  "nouveaute", "nouveautes", "fonctionnement", "demarche", "demarches", "etape",
  "etapes", "condition", "conditions", "comment", "combien", "pourquoi", "quand",
  "quel", "quelle", "quels", "quelles", "faut", "peut", "doit", "faire", "passer",
  "obtenir", "apprendre", "choisir", "trouver", "devenir", "ouvrir", "reprendre",
  "pro", "solution", "solutions", "b", "a1", "a2", "am", "be", "b96", "bsr",
  "asr", "assr",
])

/**
 * Des mots courants qui ne nomment rien quand ils sont seuls : « Auto-école
 * Plus » existe, mais « permis plus rapide » n'est pas une navigation. Dans un
 * nom de plusieurs mots ils comptent : « plus que permis » est un nom.
 */
const COURANTS = new Set([
  "plus", "est", "sud", "nord", "ouest", "bon", "bonne", "bien", "tout", "tous",
  "toute", "tres", "mieux", "vite", "facile", "simple", "oui", "non", "que",
  "qui", "quoi", "new",
])

/**
 * Réseaux nationaux et auto-écoles en ligne : nommés SANS ville, ils se
 * travaillent par un article — leurs avis, leurs prix —, et le magazine en a
 * fait la critique (`stych-auto-ecole-avis-prix-pieges`, `ecf-auto-ecole-guide-complet`…).
 * Avec une ville (« ecf cesson »), c'est une agence : navigation.
 */
const RESEAUX = new Set([ // clés, voir `cle()`
  "stych", "ornikar", "envoituresimone", "voituresimone", "lepermislibre", "codeclic", "packweb",
  "ecf", "cer", "leclerc", "vroomvroom", "inris",
])

/** Les mots d'un texte, dans l'ordre, sans accents ni ponctuation. */
export function mots(texte: string): string[] {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Clé d'une ville : ses mots collés (« saint-astier » → « saintastier »). */
function cleVille(m: string[]): string {
  return m.join("")
}

/** « Le Blanc-Mesnil » se cherche aussi « blanc mesnil » : les deux clés. */
function clesVille(m: string[]): string[] {
  const cles = [cleVille(m)]
  if (m.length > 1 && ["le", "la", "les", "l"].includes(m[0])) cles.push(cleVille(m.slice(1)))
  return cles
}

/** Les suites de mots qui disent « auto-école » sans rien nommer. */
const MARQUES_GENERIQUES = [
  ["auto", "moto", "ecole"],
  ["ecole", "de", "conduite"],
  ["ecole", "conduite"],
  ["auto", "ecole"],
  ["moto", "ecole"],
  ["autoecole"],
]

function retirerGeneriques(m: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < m.length; ) {
    const g = MARQUES_GENERIQUES.find((s) => s.every((x, k) => m[i + k] === x))
    if (g) i += g.length
    else out.push(m[i++])
  }
  return out
}

/** Les mots qui nomment vraiment quelque chose. */
function porteurs(m: string[]): string[] {
  return m.filter((x) => !VIDES.has(x) && !METIER.has(x) && !/^20\d\d$/.test(x))
}

export interface Fiche {
  titre: string
  ville: string | null
}

export interface Repertoire {
  /** Clé d'un nom (« delagare », « plusquepermis ») → la fiche qui le porte. */
  noms: Map<string, { titre: string; mots: number }>
  /** Clés de ville de l'annuaire (« saintastier »). */
  villes: Set<string>
  /** Le nom le plus long, en mots : borne la recherche dans une requête. */
  longueurMax: number
  fiches: number
}

/**
 * La clé d'un nom : ses mots collés. La requête écrit « jzup » ce que la
 * fiche écrit « J-Zup », « 3 m conduite » ce qu'elle écrit « 3M Conduite ».
 * Les mots vides restent : « de la poste » est un nom, « poste » n'en est pas
 * un (« code la poste »).
 */
function cle(m: string[]): string {
  return m.join("")
}

/** Un nom assez distinctif pour désigner un établissement (voir l'en-tête). */
function distinctif(m: string[], villes: Set<string>): boolean {
  if (m.length === 0 || VIDES.has(m[m.length - 1])) return false
  const p = porteurs(m)
  if (p.length === 0) return false
  if (villes.has(cleVille(p)) || villes.has(cle(m))) return false
  if (m.length === 1 && COURANTS.has(m[0])) return false
  // « Solid'aire » collé fait « solidaire » : un mot de requête, pas un nom.
  if (METIER.has(cle(m)) || COURANTS.has(cle(m)) || VIDES.has(cle(m))) return false
  // « gdn », « a2e », « amw » sont des noms ; « mc », « ae » ne désignent rien.
  return cle(m).length >= 3
}

/** Les entités que WordPress laisse dans les titres (« Bonnie &amp; Clyde »). */
function decoder(t: string): string {
  return t
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;|&#8212;|&ndash;|&mdash;/g, "-")
}

/**
 * Les noms d'établissement que porte le titre d'une fiche — plusieurs
 * graphies, car la requête n'en reprend souvent qu'une partie —, ou aucun
 * s'il n'en porte pas de distinctif. Rendus sous forme de clé.
 */
export function nomsEtablissement(titre: string, ville: string | null, villes: Set<string>): string[][] {
  const v = mots(ville ?? "")
  // « … à Compiegne » ; « ECF Bourlier - L'Argentière-La Bessée » quand le
  // morceau après le tiret est la ville de la fiche.
  let t = decoder(titre).replace(/\s+à\s+[^,]+$/i, "")
  const tiret = t.match(/^(.*\S)\s+[-–—]\s+(.+)$/)
  if (tiret && v.length && cleVille(mots(tiret[2])) === cleVille(v)) t = tiret[1]
  const base = retirerGeneriques(mots(t))

  const variantes: string[][] = [base]
  const ajouter = (fn: (m: string[]) => string[] | null) => {
    for (const m of [...variantes]) {
      const r = fn(m)
      if (r && r.length && r.length < m.length) variantes.push(r)
    }
  }
  // « Auto-école Bruno Pegomas », fiche de Pegomas → « bruno ».
  ajouter((m) => (v.length && m.length > v.length && m.slice(-v.length).join(" ") === v.join(" ") ? m.slice(0, -v.length) : null))
  // « Balata 2000 » → « balata » ; « Forma + 06 » → « forma ».
  ajouter((m) => {
    let k = m.length
    while (k > 1 && /^\d+$/.test(m[k - 1])) k--
    return m.slice(0, k)
  })
  // « Mayana Permis », « Triskell Auto-moto » → « mayana », « triskell » :
  // la requête dit « auto école mayana ».
  ajouter((m) => {
    let k = m.length
    while (k > 1 && METIER.has(m[k - 1])) k--
    return m.slice(0, k)
  })
  // « du Bas-Bugey » → « bas bugey », que la requête écrit sans article. Pas
  // jusqu'à un seul mot : « de la Poste » ne doit pas devenir « poste ».
  ajouter((m) => {
    let k = 0
    while (k < m.length && VIDES.has(m[k])) k++
    return m.length - k >= 2 ? m.slice(k) : null
  })
  return variantes.filter((m) => distinctif(m, villes))
}

export function construireRepertoire(fiches: Fiche[]): Repertoire {
  const villes = new Set<string>()
  for (const f of fiches) {
    const v = mots(f.ville ?? "")
    if (v.length) for (const c of clesVille(v)) villes.add(c)
  }
  const noms = new Map<string, { titre: string; mots: number }>()
  let longueurMax = 0
  for (const f of fiches) {
    for (const m of nomsEtablissement(f.titre, f.ville, villes)) {
      const k = cle(m)
      // À clé égale, le nom de plus de mots gagne : il protège moins (voir
      // plus bas), et la requête qui l'écrit en un mot reste reconnue.
      if ((noms.get(k)?.mots ?? 0) >= m.length) continue
      noms.set(k, { titre: decoder(f.titre), mots: m.length })
      longueurMax = Math.max(longueurMax, m.length)
    }
  }
  return { noms, villes, longueurMax: Math.min(longueurMax, 8), fiches: fiches.length }
}

/**
 * Les mots de la requête qui forment un nom de ville de l'annuaire, la plus
 * longue d'abord : `[début, fin)` pour chaque ville trouvée.
 */
function villesDe(m: string[], villes: Set<string>): [number, number][] {
  const pris = new Array<boolean>(m.length).fill(false)
  const spans: [number, number][] = []
  for (let n = Math.min(6, m.length); n >= 1; n--) {
    for (let i = 0; i + n <= m.length; i++) {
      if (pris.slice(i, i + n).some(Boolean)) continue
      if (!villes.has(cleVille(m.slice(i, i + n)))) continue
      // Ligne (44), Mer (41), Eu (76) sont des communes : « en ligne » n'en
      // est pas une.
      if (n === 1 && (m[i].length < 3 || METIER.has(m[i]) || VIDES.has(m[i]) || COURANTS.has(m[i]))) continue
      spans.push([i, i + n])
      for (let k = i; k < i + n; k++) pris[k] = true
    }
  }
  return spans
}

export interface Navigation {
  /** Ce qui l'a reconnue : le nom d'une fiche, ou la forme de la requête. */
  par: "annuaire" | "forme"
  /** Le nom reconnu, ou la forme (« … photos », « avis sur … »). */
  nom: string
  /** Le titre de la fiche qui porte ce nom, quand c'est l'annuaire. */
  fiche: string | null
}

/** Une requête qui parle d'auto-école : « auto école », « autoecole », « conduite ». */
function parleAutoEcole(m: string[]): boolean {
  return m.includes("autoecole") || m.includes("conduite") || (m.includes("auto") && m.includes("ecole"))
}

/**
 * La requête cherche-t-elle un établissement précis ? Renvoie ce qui l'a
 * reconnue, ou null pour une requête qu'un article peut travailler.
 */
export function requeteDeNavigation(requete: string, rep: Repertoire): Navigation | null {
  const m = mots(requete)
  if (m.length === 0) return null

  if (m[m.length - 1] === "photos" && m.length > 1) return { par: "forme", nom: "… photos", fiche: null }
  if (m[0] === "avis" && m[1] === "sur" && m.length > 2) return { par: "forme", nom: "avis sur …", fiche: null }

  const villes = villesDe(m, rep.villes)
  const dansUneVille = (k: number) => villes.some(([a, b]) => a <= k && k < b)

  // Le nom le plus long d'abord : « plus que permis » avant « permis ».
  for (let n = Math.min(rep.longueurMax, m.length); n >= 1; n--) {
    for (let i = 0; i + n <= m.length; i++) {
      const bout = m.slice(i, i + n)
      const nom = cle(bout)
      const trouve = rep.noms.get(nom)
      if (!trouve) continue
      // « b ce » collé fait « bce », une fiche de Schiltigheim : un nom d'un
      // seul mot ne se reconnaît que dans un seul mot de la requête.
      if (trouve.mots === 1 && n > 1) continue
      // « auto école saint denis » : « denis » est un prénom de l'annuaire,
      // mais ici un morceau de ville.
      if (villes.some(([a, b]) => a <= i && i + n <= b && b - a > n)) continue
      if (RESEAUX.has(nom) && villes.length === 0) continue
      if (n === 1 && !parleAutoEcole(m)) {
        // Un mot seul, sans « auto école » autour : il faut qu'il ne reste
        // rien d'autre qu'une ville et des mots du métier (« a2e rosporden »,
        // « olivier permis »), sinon c'est un mot courant dans une question.
        const reste = m.filter((_, k) => (k < i || k >= i + n) && !dansUneVille(k))
        if (porteurs(reste).length > 0) continue
      }
      return { par: "annuaire", nom: bout.join(" "), fiche: trouve.titre }
    }
  }
  return null
}
