// Un mot-clé est-il déjà couvert par un article du site ?
//
// La garde d'origine cherchait la requête Search Console, telle quelle, dans les
// titres existants (`titre.includes(requete)`). Elle ne pouvait pas marcher : le
// hub interdit au rédacteur de recopier la requête dans le titre — elle est
// souvent tronquée ou agrammaticale —, si bien que « auto école » devenait
// « Auto-école : comment bien la choisir » et ne se retrouvait jamais. Chez STAN,
// une requête bloquée en 16e position a produit sept articles du 27/09 au
// 15/10/2026 ; ici, « auto école » est revenu quatre fois.
//
// On compare donc des MOTS, pas des chaînes : sans accents, sans mots vides,
// singulier et pluriel confondus, lettres et chiffres collés séparés
// (« assr1 » = « ASSR 1 »). Une requête est couverte quand tous ses mots
// figurent dans le titre ou le slug d'un article. L'inclusion ne joue que dans ce
// sens : « auto école » est couvert par « Auto-école : comment choisir », mais
// « auto école lyon » ne l'est pas — c'est une autre intention, qui mérite sa page.
//
// Même module que chez STAN (stan-dashboard, `lib/seo/couverture.ts`), qui
// enregistre en plus le mot-clé visé dans sa base : une correction ici se
// reporte là-bas.

/**
 * Mots qui ne portent pas l'intention d'une requête, élisions comprises
 * (« l' », « d' »…). Les autres lettres isolées restent : « e moniteur » n'est
 * pas « moniteur », et le traiter comme tel l'aurait déclaré couvert par
 * n'importe quel article sur le métier.
 */
const VIDES = new Set([
  "c", "d", "j", "l", "m", "n", "s", "t", "y",
  "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "en", "et",
  "la", "le", "les", "leur", "leurs", "ma", "mes", "mon", "ou", "par", "pour",
  "qu", "que", "qui", "sa", "sans", "se", "ses", "son", "sur", "ta", "tes",
  "ton", "un", "une", "vos", "votre",
])

/** Singulier et pluriel confondus, sans prétendre à une vraie racinisation. */
function racine(mot: string): string {
  return mot.length > 3 ? mot.replace(/[sx]$/, "") : mot
}

/** Les mots porteurs d'un texte, normalisés. */
export function jetons(texte: string): Set<string> {
  return new Set(
    texte
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/([a-z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-z])/g, "$1 $2")
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length > 0 && !VIDES.has(m))
      .map(racine),
  )
}

export interface ArticleConnu {
  titre: string
  slug: string
  /** Le mot-clé visé à la rédaction, quand le site le garde. */
  mot_cle?: string | null
}

export interface Couverture {
  slug: string
  titre: string
  /** Ce qui a reconnu l'article : le plus sûr d'abord. */
  par: "mot_cle" | "titre" | "slug"
}

function contenu(requete: Set<string>, dans: Set<string>): boolean {
  for (const m of requete) if (!dans.has(m)) return false
  return true
}

/**
 * L'article qui couvre déjà `motCle`, ou null. Le mot-clé enregistré passe
 * avant le titre : c'est la seule trace qui ne dépende pas de la formulation
 * choisie par le rédacteur. L'ordre de `articles` départage : mettre les
 * articles publiés devant, pour que l'article désigné soit un article en ligne.
 */
export function couvertPar(motCle: string, articles: ArticleConnu[]): Couverture | null {
  const requete = jetons(motCle)
  if (requete.size === 0) return null

  for (const a of articles) {
    if (a.mot_cle && contenu(requete, jetons(a.mot_cle))) {
      return { slug: a.slug, titre: a.titre, par: "mot_cle" }
    }
  }
  for (const a of articles) {
    if (contenu(requete, jetons(a.titre))) return { slug: a.slug, titre: a.titre, par: "titre" }
  }
  for (const a of articles) {
    if (contenu(requete, jetons(a.slug))) return { slug: a.slug, titre: a.titre, par: "slug" }
  }
  return null
}
