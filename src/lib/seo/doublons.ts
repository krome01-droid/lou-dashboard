// Deux articles du site traitent-ils le même sujet ?
//
// `couverture.ts` répond à une autre question : une REQUÊTE de quelques mots
// est-elle couverte par un titre ? Elle convient à la Search Console, pas à la
// veille. Du 13/09 au 13/11/2026, la rédaction quotidienne (`?source=veille`)
// n'est jamais passée par elle, et le magazine a publié 18 articles sur les ZFE
// et le Crit'Air, deux fois le même article sur le permis dématérialisé (même
// titre, 28/09 et 24/10), deux sur le protoxyde d'azote à deux jours d'écart,
// quatre sur le carburant et le prix du permis.
//
// Ici on compare deux ARTICLES entiers : titre, slug, réponse directe et
// intertitres, pondérés par la rareté de chaque mot dans le catalogue (TF-IDF,
// similarité cosinus). Un mot présent partout (« droit », « vérifier », la
// signature du rédacteur du hub) pèse peu ; « protoxyde » ou « dématérialisé »
// pèsent lourd.
//
// Ce score sert de FILET après rédaction, pas de juge d'intention : sur un titre
// de presse de dix mots, il se trompe trop souvent (mesuré, voir SEUIL_DOUBLON).
// Le jugement d'intention est dans `jugement.ts`.

/**
 * Au-delà, l'article qui vient d'être rédigé est un doublon de l'existant.
 *
 * Calibré le 13/11/2026 en rejouant les 50 articles du 13/09 au 13/11 dans
 * l'ordre de publication, chacun face à tout ce qui le précédait — c'est-à-dire
 * exactement ce que la garde aurait vu ce jour-là :
 *  - 0,40 arrête 13 des 20 doublons identifiés à la main (protoxyde 0,56,
 *    permis dématérialisé 0,55, Crit'Air moto 0,55, vignette et trajet 0,53,
 *    carburant 0,48 et 0,44, permis à vie 0,44, Crit'Air 3 ×5, ZFE ×1) ;
 *  - aucun article d'un AUTRE sujet ne le dépasse. Trois articles ZFE y passent
 *    face à un autre article ZFE (dont la ZFE de Strasbourg face au calendrier
 *    Crit'Air 3, 0,59) : même famille, décision défendable.
 *  - à 0,38, la mortalité routière passe face aux cyclistes tués (0,39) : deux
 *    sujets voisins mais distincts. Le seuil s'arrête donc juste au-dessus.
 * Les sept doublons qui restent sous le seuil (abrogation des ZFE face à leur
 * suppression 0,24, visite médicale des seniors 0,22…) sont affaire de jugement :
 * voir `jugement.ts`. Ce filet ne doit arrêter que l'évident.
 */
export const SEUIL_DOUBLON = 0.4

/**
 * Mots qui ne portent pas de sujet, élisions comprises. Même liste que
 * `couverture.ts`, recopiée et non importée : ce module-là est synchronisé à la
 * main entre quatre dépôts, celui-ci n'existe que chez LOU.
 */
const VIDES = new Set([
  "c", "d", "j", "l", "m", "n", "s", "t", "y",
  "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "en", "et",
  "la", "le", "les", "leur", "leurs", "ma", "mes", "mon", "ou", "par", "pour",
  "qu", "que", "qui", "sa", "sans", "se", "ses", "son", "sur", "ta", "tes",
  "ton", "un", "une", "vos", "votre",
])

/** Intertitres posés par l'assemblage, identiques dans tous les articles. */
const INTERTITRES_FIXES = /^(a retenir|questions frequentes)$/

const ENTITES: Record<string, string> = {
  amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">",
  rsquo: "'", lsquo: "'", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—",
}

/** Texte d'un fragment HTML de WordPress, entités décodées. */
export function texteHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITES[n.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim()
}

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // « Crit'Air » dans un titre, « critair » dans un slug : un seul mot.
    .replace(/crit\W*air/g, "critair")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
}

/** Les mots porteurs, AVEC répétitions : la fréquence compte ici. */
export function mots(texte: string): string[] {
  return normaliser(texte)
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 0 && !VIDES.has(m))
    .map((m) => (m.length > 3 ? m.replace(/[sx]$/, "") : m))
}

/** Ce qu'on compare d'un article. */
export interface Fiche {
  slug: string
  titre: string
  /** La réponse directe, à défaut le début du texte. */
  reponse: string
  intertitres: string[]
}

/** La fiche d'un article déjà déposé, à partir de son HTML rendu. */
export function ficheDepuisHtml(slug: string, titre: string, html: string): Fiche {
  const rd = html.match(/<p class="reponse-directe">([\s\S]*?)<\/p>/)
  const intertitres = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => texteHtml(m[1]))
  return {
    slug,
    titre: texteHtml(titre),
    // Les articles d'avant le moteur n'ont pas de réponse directe : leur
    // premier paragraphe en tient lieu.
    reponse: rd ? texteHtml(rd[1]) : texteHtml(html).slice(0, 600),
    intertitres,
  }
}

/** La fiche d'un article qui vient d'être rédigé, avant tout dépôt. */
export function ficheDepuisRedaction(a: {
  slug: string
  titre: string
  reponse_directe: string
  corps_html: string
}): Fiche {
  return {
    slug: a.slug,
    titre: a.titre,
    reponse: a.reponse_directe,
    intertitres: [...a.corps_html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => texteHtml(m[1])),
  }
}

function sac(f: Fiche): string[] {
  const titre = mots(f.titre)
  const inter = f.intertitres.filter((h) => !INTERTITRES_FIXES.test(normaliser(h).trim()))
  return [
    // Le titre compte double : c'est lui qui porte l'intention.
    ...titre,
    ...titre,
    ...mots(f.slug.replace(/-/g, " ")),
    ...mots(f.reponse),
    ...mots(inter.join(" ")),
  ]
}

export interface Proche {
  slug: string
  titre: string
  score: number
}

/** Le catalogue, prêt à être comparé. Construit une fois par passage. */
export class IndexSujets {
  private readonly vecteurs = new Map<string, Map<string, number>>()
  private readonly titres = new Map<string, string>()
  private readonly idf = new Map<string, number>()
  private readonly idfInconnu: number

  constructor(fiches: Fiche[]) {
    const sacs = fiches.map((f) => [f, sac(f)] as const)
    const n = sacs.length
    const df = new Map<string, number>()
    for (const [, s] of sacs) for (const m of new Set(s)) df.set(m, (df.get(m) ?? 0) + 1)
    for (const [m, c] of df) this.idf.set(m, Math.log((1 + n) / (1 + c)) + 1)
    this.idfInconnu = Math.log(1 + n) + 1
    for (const [f, s] of sacs) {
      this.vecteurs.set(f.slug, this.vecteur(s))
      this.titres.set(f.slug, f.titre)
    }
  }

  private vecteur(s: string[]): Map<string, number> {
    const tf = new Map<string, number>()
    for (const m of s) tf.set(m, (tf.get(m) ?? 0) + 1)
    const v = new Map<string, number>()
    let norme = 0
    for (const [m, c] of tf) {
      const x = (1 + Math.log(c)) * (this.idf.get(m) ?? this.idfInconnu)
      v.set(m, x)
      norme += x * x
    }
    norme = Math.sqrt(norme) || 1
    for (const [m, x] of v) v.set(m, x / norme)
    return v
  }

  get taille(): number {
    return this.vecteurs.size
  }

  /** Les articles du catalogue les plus proches de `fiche`, du plus proche au moins proche. */
  plusProches(fiche: Fiche, combien: number, exclure: string[] = []): Proche[] {
    const q = this.vecteur(sac(fiche))
    const resultats: Proche[] = []
    for (const [slug, v] of this.vecteurs) {
      if (slug === fiche.slug || exclure.includes(slug)) continue
      let score = 0
      for (const [m, x] of q) score += x * (v.get(m) ?? 0)
      resultats.push({ slug, titre: this.titres.get(slug) ?? slug, score })
    }
    return resultats.sort((a, b) => b.score - a.score).slice(0, combien)
  }
}

/** Les guides de ville ne sont pas des articles de fond : même règle que `guide-ville`. */
export function estGuideDeVille(slug: string): boolean {
  return /^(les-)?auto-ecoles-/.test(slug)
}
