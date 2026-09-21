import { query } from "@/lib/db/connection"

// L'annuaire des auto-écoles d'autoecolemagazine.fr, lu pour les guides de ville.
//
// Le site porte 20 081 fiches `auto-ecole` (type de contenu WordPress) avec
// adresse, note et avis Google, formations, agrément, taux de réussite au
// permis B, label qualité, partenariat « permis à 1 €/jour ». C'est ce qui
// fait la valeur d'un guide comme « Auto-école Le Mans (72) — Comparatif 32
// établissements » : les chiffres viennent de l'annuaire, pas du modèle.
//
// ── Deux orthographes par ville ──────────────────────────────────────────────
// Deux imports ont peuplé l'annuaire : l'un écrit « Paris » avec le département
// « Paris », l'autre « 75 » ; l'un « Clermont-Ferrand (63) », l'autre « Clermont
// Ferrand (Puy De Dome) ». Le Mans compte 33 fiches d'un côté et 26 de l'autre.
// Une ville est donc un GROUPE de graphies, réuni par une clé normalisée (sans
// accent, sans tiret, en minuscules) ; le nom affiché est la graphie la plus
// soignée du groupe (celle qui porte des accents ou des tirets).

/** Sous ce nombre de fiches, un guide n'a pas assez de matière pour comparer. */
export const MIN_AUTO_ECOLES = 12

export interface VilleAnnuaire {
  /** Clé normalisée, sert d'identité : « lemans », « clermontferrand ». */
  cle: string
  /** Nom d'affichage : « Le Mans », « Clermont-Ferrand ». */
  nom: string
  /** Slug pour l'URL : « le-mans ». Celui de l'annuaire quand il existe. */
  slug: string
  /** Numéro de département : « 72 », « 2A », « 974 ». */
  dept: string
  /** Toutes les graphies rencontrées dans `ville` : ce par quoi on interroge. */
  graphies: string[]
  nb: number
  outreMer: boolean
}

export interface FicheAutoEcole {
  id: number
  nom: string
  url: string
  adresse: string
  codePostal: string
  note: number | null
  nbAvis: number
  formations: string[]
  agrement: string
  tauxReussiteB: number | null
  presentationsB: number
  labelQualite: boolean
  permisUnEuro: boolean
  recapAvis: string
}

export interface DossierVille {
  ville: VilleAnnuaire
  fiches: FicheAutoEcole[]
  nb: number
  nbAgreees: number
  nbNotees: number
  noteMoyenne: number | null
  partExcellentes: number
  nbAvisTotal: number
  /** Taux de réussite B médian, sur les établissements ayant ≥ 20 présentations. */
  tauxReussiteMedian: number | null
  nbAvecTaux: number
  nbLabelQualite: number
  nbPermisUnEuro: number
  /** Formation → nombre d'établissements qui la proposent. */
  formations: { libelle: string; nb: number }[]
  /** Les mieux notées, avec au moins 10 avis. */
  meilleuresNotes: FicheAutoEcole[]
  /** Les meilleurs taux de réussite B, avec au moins 20 présentations. */
  meilleursTaux: FicheAutoEcole[]
  /** L'adresse de la liste complète sur le comparateur du site. */
  urlAnnuaire: string
}

export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

export function slugifier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Une graphie « soignée » porte des accents ou des tirets : on la préfère pour l'affichage. */
function soin(graphie: string): number {
  let s = 0
  if (/[À-ÿ]/.test(graphie)) s += 2
  if (graphie.includes("-")) s += 1
  if (/^[A-ZÀ-Ý][a-zà-ÿ]/.test(graphie)) s += 1
  if (graphie === graphie.toUpperCase()) s -= 2
  return s
}

const DEPARTEMENTS: Record<string, string> = {
  ain: "01", aisne: "02", allier: "03", alpesdehauteprovence: "04", hautesalpes: "05",
  alpesmaritimes: "06", ardeche: "07", ardennes: "08", ariege: "09", aube: "10", aude: "11",
  aveyron: "12", bouchesdurhone: "13", calvados: "14", cantal: "15", charente: "16",
  charentemaritime: "17", cher: "18", correze: "19", corsedusud: "2A", hautecorse: "2B",
  cotedor: "21", cotesdarmor: "22", creuse: "23", dordogne: "24", doubs: "25", drome: "26",
  eure: "27", eureetloir: "28", finistere: "29", gard: "30", hautegaronne: "31", gers: "32",
  gironde: "33", herault: "34", illeetvilaine: "35", indre: "36", indreetloire: "37",
  isere: "38", jura: "39", landes: "40", loiretcher: "41", loire: "42", hauteloire: "43",
  loireatlantique: "44", loiret: "45", lot: "46", lotetgaronne: "47", lozere: "48",
  maineetloire: "49", manche: "50", marne: "51", hautemarne: "52", mayenne: "53",
  meurtheetmoselle: "54", meuse: "55", morbihan: "56", moselle: "57", nievre: "58", nord: "59",
  oise: "60", orne: "61", pasdecalais: "62", puydedome: "63", pyreneesatlantiques: "64",
  hautespyrenees: "65", pyreneesorientales: "66", basrhin: "67", hautrhin: "68", rhone: "69",
  hautesaone: "70", saoneetloire: "71", sarthe: "72", savoie: "73", hautesavoie: "74",
  paris: "75", seinemaritime: "76", seineetmarne: "77", yvelines: "78", deuxsevres: "79",
  somme: "80", tarn: "81", tarnetgaronne: "82", var: "83", vaucluse: "84", vendee: "85",
  vienne: "86", hautevienne: "87", vosges: "88", yonne: "89", territoiredebelfort: "90",
  essonne: "91", hautsdeseine: "92", seinesaintdenis: "93", valdemarne: "94", valdoise: "95",
  guadeloupe: "971", martinique: "972", guyane: "973", lareunion: "974", reunion: "974",
  mayotte: "976", nordpasdecalais: "59",
}

function codeDept(departement: string, codePostal: string): string | null {
  const brut = (departement ?? "").trim()
  if (/^(2A|2B|\d{2,3})$/i.test(brut)) return brut.toUpperCase()
  const n = normaliser(brut)
  if (DEPARTEMENTS[n]) return DEPARTEMENTS[n]
  const cp = (codePostal ?? "").trim()
  if (/^97\d{3}$/.test(cp)) return cp.slice(0, 3)
  if (/^\d{5}$/.test(cp)) return cp.slice(0, 2)
  return null
}

/**
 * Les villes de l'annuaire, groupées par graphie normalisée, les plus fournies
 * d'abord. `dept` vient de la fiche majoritaire ; une ville sans département
 * identifiable est écartée (on ne saurait pas bâtir son URL d'annuaire).
 */
export async function listerVilles(min = MIN_AUTO_ECOLES): Promise<VilleAnnuaire[]> {
  const lignes = await query<{ ville: string; departement: string | null; cp: string | null; slug: string | null; n: number }>(`
    SELECT v.meta_value ville, d.meta_value departement,
           MIN(c.meta_value) cp, MIN(s.meta_value) slug, COUNT(*) n
    FROM wp_posts p
    JOIN wp_postmeta v ON v.post_id = p.ID AND v.meta_key = 'ville'
    LEFT JOIN wp_postmeta d ON d.post_id = p.ID AND d.meta_key = 'departement'
    LEFT JOIN wp_postmeta c ON c.post_id = p.ID AND c.meta_key = 'code_postal'
    LEFT JOIN wp_postmeta s ON s.post_id = p.ID AND s.meta_key = 'ville_slug'
    WHERE p.post_type = 'auto-ecole' AND p.post_status = 'publish' AND v.meta_value <> ''
    GROUP BY v.meta_value, d.meta_value
    HAVING COUNT(*) >= 3
  `)

  const groupes = new Map<string, VilleAnnuaire & { poids: Map<string, number> }>()
  for (const l of lignes) {
    const graphie = String(l.ville).trim()
    const cle = normaliser(graphie)
    if (!cle) continue
    const dept = codeDept(l.departement ?? "", l.cp ?? "")
    const n = Number(l.n)
    // Deux villes homonymes de départements différents (Saint-Denis 93 / 974)
    // sont deux villes : la clé porte le département.
    const cleComplete = dept ? `${cle}|${dept}` : cle
    let g = groupes.get(cleComplete)
    if (!g) {
      g = {
        cle: cleComplete, nom: graphie, slug: l.slug?.trim() || slugifier(graphie), dept: dept ?? "",
        graphies: [], nb: 0, outreMer: /^97/.test(dept ?? ""), poids: new Map(),
      }
      groupes.set(cleComplete, g)
    }
    if (!g.graphies.includes(graphie)) g.graphies.push(graphie)
    g.nb += n
    g.poids.set(graphie, (g.poids.get(graphie) ?? 0) + n)
    if (soin(graphie) > soin(g.nom)) g.nom = graphie
    if (!g.slug && l.slug) g.slug = l.slug.trim()
  }

  return [...groupes.values()]
    .filter((g) => g.dept && g.nb >= min)
    .map(({ poids: _p, ...g }) => g)
    .sort((a, b) => b.nb - a.nb || a.nom.localeCompare(b.nom, "fr"))
}

function nombre(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** « Permis B – boîte manuelle|| Permis A1 » ou « Permis B, AAC » → libellés propres. */
function lireFormations(brut: string): string[] {
  return brut
    .split(/\|\||,/)
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter(Boolean)
}

/**
 * Le dossier d'une ville : toutes ses fiches, et les chiffres qu'un guide peut
 * citer. Une seule requête pivot — les ~20 clés meta d'une fiche reviennent
 * en colonnes — puis l'agrégation ici, où elle se lit.
 */
export async function dossierVille(ville: VilleAnnuaire): Promise<DossierVille> {
  const graphies = ville.graphies.map((g) => `'${g.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`).join(",")
  const meta = (k: string) => `MAX(CASE WHEN m.meta_key = '${k}' THEN m.meta_value END)`
  const lignes = await query<Record<string, unknown>>(`
    SELECT p.ID id, p.post_title titre, p.post_name slug,
      ${meta("adresse")} adresse, ${meta("code_postal")} cp, ${meta("dept_code")} dept_code,
      ${meta("departement")} departement,
      ${meta("note")} note, ${meta("note_gmb")} note_gmb,
      ${meta("Nb_avis")} nb_avis, ${meta("nb_avis_gmb")} nb_avis_gmb,
      ${meta("formations")} formations, ${meta("raf_numero")} agrement,
      ${meta("taux_reussite_b_xpra")} taux_b, ${meta("nombre_presentations_b")} presentations_b,
      ${meta("label_qualite")} label_qualite, ${meta("partenaire_permis1euro")} permis_1euro,
      ${meta("recap_avis")} recap_avis, ${meta("ville_slug")} ville_slug
    FROM wp_posts p
    JOIN wp_postmeta m ON m.post_id = p.ID
    WHERE p.post_type = 'auto-ecole' AND p.post_status = 'publish'
      AND p.ID IN (SELECT post_id FROM wp_postmeta WHERE meta_key = 'ville' AND meta_value IN (${graphies}))
    GROUP BY p.ID, p.post_title, p.post_name
  `)

  // Le nom ne suffit pas : Saint-Denis (93) et Saint-Denis (974) partagent la
  // même graphie. On ne garde que les fiches du département de la ville — et
  // celles dont le département est inconnu, faute de pouvoir les départager.
  const duDepartement = lignes.filter((l) => {
    const d = String(l.dept_code ?? "").trim() || codeDept(String(l.departement ?? ""), String(l.cp ?? ""))
    return !d || d === ville.dept
  })

  const brutes: FicheAutoEcole[] = duDepartement.map((l) => {
    const noteGmb = nombre(l.note_gmb)
    const note = noteGmb ?? nombre(l.note)
    const nbAvis = Math.max(Number(l.nb_avis_gmb ?? 0) || 0, Number(l.nb_avis ?? 0) || 0)
    const dept = String(l.dept_code ?? "").trim() || ville.dept
    const slugVille = String(l.ville_slug ?? "").trim() || ville.slug
    return {
      id: Number(l.id),
      nom: nomFiche(String(l.titre ?? "")),
      // Le permalien des fiches : /auto-ecoles/{dept}/{ville}/{slug}/ — vérifié le
      // 21/09/2026 sur l'API REST du site.
      url: `https://autoecolemagazine.fr/auto-ecoles/${dept}/${slugVille}/${String(l.slug ?? "")}/`,
      adresse: String(l.adresse ?? "").trim(),
      codePostal: String(l.cp ?? "").trim(),
      note: note !== null && note > 0 ? note : null,
      nbAvis,
      formations: lireFormations(String(l.formations ?? "")),
      agrement: String(l.agrement ?? "").trim(),
      tauxReussiteB: (() => { const t = nombre(l.taux_b); return t !== null && t > 0 ? t : null })(),
      presentationsB: Number(l.presentations_b ?? 0) || 0,
      labelQualite: String(l.label_qualite ?? "") === "1",
      permisUnEuro: /^oui$/i.test(String(l.permis_1euro ?? "")),
      recapAvis: String(l.recap_avis ?? "").trim(),
    }
  })

  const fiches = dedoublonner(brutes)

  const notees = fiches.filter((f) => f.note !== null && f.nbAvis >= 3)
  const noteMoyenne = notees.length
    ? Math.round((notees.reduce((s, f) => s + (f.note ?? 0) * f.nbAvis, 0) / notees.reduce((s, f) => s + f.nbAvis, 0)) * 10) / 10
    : null
  const avecTaux = fiches.filter((f) => f.tauxReussiteB !== null && f.presentationsB >= 20)
  const tauxTries = avecTaux.map((f) => f.tauxReussiteB as number).sort((a, b) => a - b)
  const tauxReussiteMedian = tauxTries.length
    ? tauxTries[Math.floor(tauxTries.length / 2)]
    : null

  const compte = new Map<string, number>()
  for (const f of fiches) {
    for (const fo of new Set(f.formations.map(libelleFormation))) compte.set(fo, (compte.get(fo) ?? 0) + 1)
  }

  return {
    ville,
    fiches,
    nb: fiches.length,
    nbAgreees: fiches.filter((f) => /^E\d{8,}/i.test(f.agrement)).length,
    nbNotees: notees.length,
    noteMoyenne,
    partExcellentes: notees.length ? Math.round((notees.filter((f) => (f.note ?? 0) >= 4.5).length / notees.length) * 100) : 0,
    nbAvisTotal: fiches.reduce((s, f) => s + f.nbAvis, 0),
    tauxReussiteMedian,
    nbAvecTaux: avecTaux.length,
    nbLabelQualite: fiches.filter((f) => f.labelQualite).length,
    nbPermisUnEuro: fiches.filter((f) => f.permisUnEuro).length,
    formations: [...compte.entries()].map(([libelle, nb]) => ({ libelle, nb })).sort((a, b) => b.nb - a.nb),
    meilleuresNotes: [...fiches].filter((f) => f.note !== null && f.nbAvis >= 10).sort((a, b) => (b.note ?? 0) - (a.note ?? 0) || b.nbAvis - a.nbAvis).slice(0, 10),
    meilleursTaux: [...avecTaux].sort((a, b) => (b.tauxReussiteB ?? 0) - (a.tauxReussiteB ?? 0) || b.presentationsB - a.presentationsB).slice(0, 5),
    urlAnnuaire: `https://autoecolemagazine.fr/auto-ecoles/${ville.dept}/${ville.slug}/`,
  }
}

/**
 * Le nom d'un établissement, tiré du titre de sa fiche (« Auto-école Petit
 * Plus à Le Mans »). Le préfixe « Auto-école » ne tombe que s'il précède un
 * nom propre : « Auto-école des Batignolles » reste entier, sinon il ne
 * resterait que « des Batignolles ».
 */
function nomFiche(titre: string): string {
  const sansVille = titre.replace(/\s+à\s+[^,]+$/i, "").trim()
  const m = sansVille.match(/^Auto-?[ée]cole\s+(.+)$/i)
  if (m && /^[A-ZÀ-Ý0-9]/.test(m[1]) && !/^(De|Des|Du|La|Le|Les|L')\b/i.test(m[1])) return m[1].trim()
  return sansVille || titre
}

/**
 * Deux imports ont peuplé l'annuaire, et l'enrichissement Google a parfois
 * rattaché la MÊME fiche Google à deux établissements : à Paris, « des
 * Batignolles » et « Mercure Formation » portaient tous deux 4,6/5 et 1 826
 * avis. Deux fiches avec exactement la même note et le même nombre d'avis
 * (dès qu'il est significatif) sont la même fiche Google : on garde celle qui
 * a l'adresse la plus complète.
 */
function dedoublonner(fiches: FicheAutoEcole[]): FicheAutoEcole[] {
  const vues = new Map<string, FicheAutoEcole>()
  const gardees: FicheAutoEcole[] = []
  const completude = (f: FicheAutoEcole) => (/\b\d{5}\b/.test(f.adresse) ? 2 : 0) + (f.agrement ? 1 : 0) + Math.min(f.formations.length, 3) / 10
  for (const f of fiches) {
    if (f.note === null || f.nbAvis < 30) { gardees.push(f); continue }
    const cle = `${f.note}|${f.nbAvis}`
    const deja = vues.get(cle)
    if (!deja) { vues.set(cle, f); gardees.push(f); continue }
    if (completude(f) > completude(deja)) {
      gardees[gardees.indexOf(deja)] = f
      vues.set(cle, f)
    }
  }
  return gardees
}

/** Ramène les deux vocabulaires d'import à un libellé commun. */
function libelleFormation(f: string): string {
  const n = normaliser(f)
  if (n.includes("boiteautomatique") || n.includes("automatique")) return "Permis B boîte automatique"
  if (n.startsWith("permisb") || n === "permisb") return "Permis B"
  if (n.includes("aac") || n.includes("conduiteaccompagnee")) return "Conduite accompagnée (AAC)"
  if (n.includes("supervisee")) return "Conduite supervisée"
  if (n.includes("acceler")) return "Formule accélérée"
  if (n.includes("permisa1")) return "Permis A1 (125 cm³)"
  if (n.includes("permisa2")) return "Permis A2"
  if (n.startsWith("permisa") || n.includes("moto")) return "Permis moto (A)"
  if (n.includes("permisam") || n.includes("bsr")) return "Permis AM (BSR)"
  if (n.includes("permisc") || n.includes("poidslourd")) return "Permis poids lourd (C)"
  if (n.includes("permisd")) return "Permis transport en commun (D)"
  if (n.includes("permisbe") || n.includes("remorque") || n.includes("b96")) return "Remorque (B96 / BE)"
  if (n.includes("codeenligne") || n === "code") return "Code en ligne"
  return f
}
