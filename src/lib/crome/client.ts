/**
 * Le pont vers CROME OS : proposer, jamais publier.
 *
 * L'agent ne décide pas de ce qui part sur les réseaux. Il soumet un texte, et
 * CROME OS applique la politique — palier d'autonomie, quotas journalier et
 * hebdomadaire, fenêtre calme, canaux réellement branchés à Postiz — puis
 * publie ou met en file de validation. C'est la raison d'être du secret
 * d'ingestion : il permet de proposer, il ne permet pas d'exécuter. L'agent ne
 * choisit d'ailleurs jamais l'identifiant du post, donc il ne peut pas
 * réclamer la publication d'un post arbitraire.
 *
 * Ce fichier est le même dans les dashboards de LOU, IRIS et ANGÈLE, comme
 * `lib/ghl/social-planner.ts` qu'il remplace ici. Seul `AGENT_ID` change.
 * Il reprend la routine de STAN, éprouvée de bout en bout le 2 août 2026.
 */

/** L'identité de cet agent dans le registre CROME OS. */
const AGENT_ID = "lou"

const CROME_URL = process.env.CROME_INGEST_URL
const CROME_SECRET = process.env.CROME_INGEST_SECRET

// Même hub, même secret : le studio d'images est derrière CROME OS, pas à côté.
// L'agent ne détient donc aucune clé de fournisseur d'images, et son quota de
// génération est appliqué côté studio.
const CROME_MEDIA_URL = CROME_URL?.replace(/\/submit-post$/, "/generate-media")

export interface Scene {
  key: string
  label: string
  /** Ce que la scène montre — c'est là-dessus qu'un modèle choisit, pas sur la clé. */
  depicts: string
}

export interface MediaResult {
  ok?: boolean
  image_url?: string | null
  /** `processing` quand l'attente du studio a expiré sans que l'image échoue. */
  status?: "processing" | "done" | "error"
  /** Permet de reprendre une génération que l'attente n'a pas vue aboutir. */
  generation_id?: string
  refused?: boolean
  reason?: string
  error?: string
  /**
   * Le détail rendu par le studio. Sans lui, un refus arrive sous la forme
   * « studio_erreur », qui ne dit pas quoi corriger : LOU a perdu la vignette de
   * son premier article sur un « Format inconnu » que ce champ portait déjà.
   */
  detail?: unknown
}

export interface SubmitResult {
  ok?: boolean
  post_id?: string
  published?: boolean
  queued?: boolean
  duplicate?: boolean
  /** Le motif quand rien n'est parti : quota, fenêtre calme, palier d'autonomie… */
  reason?: string
  /** Plateformes demandées mais non branchées, écartées par le hub. */
  dropped?: string[]
  platforms?: string[]
  error?: string
}

export function isCromeConfigured(): boolean {
  return Boolean(CROME_URL && CROME_SECRET)
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", "x-ingest-secret": CROME_SECRET! }
}

/**
 * Les scènes disponibles pour la marque de cet agent, telles que le studio les
 * définit. On les lit à chaque passage plutôt que d'en garder une copie ici :
 * une direction artistique corrigée au studio doit parvenir à l'agent sans
 * qu'on redéploie quoi que ce soit.
 *
 * Injoignable, la liste est vide : le studio appliquera sa scène par défaut.
 */
export async function fetchCatalogue(): Promise<{ scenes: Scene[]; formats: string[] }> {
  if (!CROME_MEDIA_URL || !CROME_SECRET) return { scenes: [], formats: [] }
  try {
    const res = await fetch(CROME_MEDIA_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ agent_id: AGENT_ID, mode: "catalog" }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return { scenes: [], formats: [] }
    const body = await res.json()
    return {
      scenes: (body.scenes ?? []) as Scene[],
      // Les formats ne sont pas les mêmes d'une marque à l'autre. Demander un
      // format qu'elle n'a pas fait échouer la génération entière — c'est ce qui
      // a privé de vignette le premier article de LOU.
      formats: (body.formats ?? []) as string[],
    }
  } catch {
    return { scenes: [], formats: [] }
  }
}

export async function fetchScenes(): Promise<Scene[]> {
  return (await fetchCatalogue()).scenes
}

/**
 * Le format à demander pour une vignette d'article, parmi ceux que la marque
 * possède réellement.
 *
 * 3:2 est le format « Blog/Article » du catalogue ; 16:9 le remplace faute de
 * mieux, et les cinq marques l'ont. Ne rend jamais `undefined` : `requestImage`
 * retomberait sur son défaut 1:1, qui serait rogné en vignette d'article.
 */
export function formatArticle(formats: string[]): string {
  for (const voulu of ["3:2", "16:9"]) {
    if (formats.includes(voulu)) return voulu
  }
  return formats[0] ?? "16:9"
}

/**
 * Demande un visuel de marque. Une image manquante ne doit jamais empêcher un
 * post de partir : l'appelant traite le résultat comme un bonus.
 *
 * On ne transmet aucune consigne libre tirée de l'article : le prompt de marque
 * proscrit déjà le texte lisible dans l'image, et y réinjecter un titre
 * ferait réapparaître les lettrages inventés que cette contrainte élimine.
 */
export async function requestImage(scene?: string, format = "1:1"): Promise<MediaResult> {
  if (!CROME_MEDIA_URL || !CROME_SECRET) return { error: "CROME_INGEST_URL absent" }
  try {
    const res = await fetch(CROME_MEDIA_URL, {
      method: "POST",
      headers: headers(),
      // `wait` : on veut l'URL avant de soumettre le post, sinon il partirait
      // sans son image et rien ne viendrait la raccrocher ensuite.
      body: JSON.stringify({ agent_id: AGENT_ID, scene, format, wait: true }),
      signal: AbortSignal.timeout(90_000),
    })
    const body = (await res.json().catch(() => ({}))) as MediaResult
    if (!res.ok) {
      // Le motif du studio vaut mieux que le code d'erreur du hub : « Format
      // inconnu : 3:2 » se corrige, « studio_erreur » ne s'explique pas.
      const precision = typeof body.detail === "object" && body.detail !== null
        ? (body.detail as { error?: string }).error
        : typeof body.detail === "string"
          ? body.detail
          : undefined
      const base = body.error ?? `http_${res.status}`
      return { ...body, error: precision ? `${base} — ${precision}` : base }
    }
    return body
  } catch (e) {
    return { error: e instanceof Error ? e.message : "injoignable" }
  }
}

/**
 * Reprend une génération que l'attente du studio n'a pas vue aboutir.
 *
 * `wait` est borné à 45 secondes côté studio, et certains formats dépassent
 * cette limite — le 3:2 des articles, notamment. Sans cette reprise, l'image
 * était déclarée perdue alors qu'elle aboutissait quelques secondes plus tard,
 * et l'article sortait sans vignette.
 */
export async function attendreImage(
  generationId: string,
  maxAttenteMs = 150_000,
  intervalleMs = 10_000,
): Promise<MediaResult> {
  if (!CROME_MEDIA_URL || !CROME_SECRET) return { error: "CROME_INGEST_URL absent" }
  const fin = Date.now() + maxAttenteMs
  let dernier: MediaResult = { status: "processing" }
  while (Date.now() < fin) {
    await new Promise((r) => setTimeout(r, intervalleMs))
    try {
      const res = await fetch(CROME_MEDIA_URL, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ agent_id: AGENT_ID, mode: "status", generation_id: generationId }),
        signal: AbortSignal.timeout(30_000),
      })
      dernier = (await res.json().catch(() => ({}))) as MediaResult
      if (dernier.image_url) return dernier
      if (dernier.status === "error") return dernier
    } catch (e) {
      dernier = { error: e instanceof Error ? e.message : "injoignable" }
    }
  }
  return { ...dernier, reason: dernier.reason ?? "image toujours en cours au terme de l'attente" }
}

/**
 * Soumet le post au hub.
 *
 * `platforms` est volontairement omis : l'agent ne choisit pas ses canaux.
 * CROME OS détient la carte des intégrations Postiz réellement connectées et
 * route vers celles de sa marque — un canal listé mais jamais branché ferait
 * échouer la publication en donnant à l'agent l'illusion d'avoir publié.
 *
 * `reviewOnly` force la file de validation même si le palier autorise la
 * publication : c'est l'outil qui permet d'éprouver la chaîne entière sans
 * rien rendre public, la seule étape irréversible restant un geste humain.
 */
export async function submitPost(
  content: string,
  mediaUrls: string[],
  reviewOnly = false,
): Promise<SubmitResult> {
  if (!CROME_URL || !CROME_SECRET) {
    return { error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" }
  }
  try {
    const res = await fetch(CROME_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        agent_id: AGENT_ID,
        content,
        media_urls: mediaUrls,
        ...(reviewOnly ? { review_only: true } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const body = (await res.json().catch(() => ({}))) as SubmitResult
    if (!res.ok) return { ...body, error: body.error ?? `http_${res.status}` }
    return body
  } catch (e) {
    return { error: e instanceof Error ? e.message : "injoignable" }
  }
}

// ── Rédaction d'articles ─────────────────────────────────────────────────────
//
// Même frontière que le studio d'images : l'agent dit de quoi il veut parler,
// le hub sait comment on écrit ici. Les règles SEO/GEO, le profil éditorial de
// la marque et la clé Anthropic vivent dans CROME OS — corriger la discipline
// rédactionnelle se fait à un seul endroit et les quatre marques en héritent.
//
// Le hub ne dépose RIEN : il rend un article et un verdict. C'est ce fichier
// qui, ensuite, le publie sur WordPress avec les identifiants de l'agent. Le
// hub n'a aucun accès à inris-formations.com, et c'est volontaire.

const CROME_REDACTION_URL = CROME_URL?.replace(/\/submit-post$/, "/rediger-article")

/**
 * Une affirmation que le rédacteur a gardée dans le corps sans pouvoir la
 * garantir. `bloquant` désigne ce qui engage la marque — montant, délai, texte
 * de loi, éligibilité à un financement, périmètre d'une certification.
 */
export interface Verification {
  affirmation: string
  gravite: "bloquant" | "mineur"
}

export interface ArticleRedige {
  titre: string
  slug: string
  meta_description: string
  reponse_directe: string
  chapo: string
  corps_html: string
  points_cles: string[]
  faq: { question: string; reponse: string }[]
  mot_cle_principal: string
  mots_cles_secondaires: string[]
  liens_internes: { ancre: string; intention: string }[]
  verifications: Verification[]
  scene_visuel: string
}

/**
 * Le verdict de publication, calculé par le hub et non ici : la règle doit être
 * la même pour les quatre marques, et corrigible sans redéployer quatre
 * dashboards. L'agent le traduit dans son CMS, il ne le rejoue pas.
 */
export interface VerdictPublication {
  statut_conseille: "publier" | "relire"
  motif: string | null
  bloquants: string[]
  mineurs: string[]
}

export interface RedactionResult {
  ok?: boolean
  marque?: string
  article?: ArticleRedige
  publication?: VerdictPublication
  jsonld?: unknown[]
  /**
   * Ce que le hub a fait de l'alerte Telegram. Elle part de LÀ-BAS : le hub est
   * le seul à connaître le verdict, et une seule implémentation y sert les
   * quatre marques, dont deux n'ont aucun moyen d'envoyer quoi que ce soit.
   */
  alerte?: { envoyee: boolean; erreur?: string }
  reason?: string
  error?: string
}

export interface DemandeArticle {
  /** Sujet imposé. Absent, l'angle est choisi à partir du mot-clé ou du vide. */
  sujet?: string
  mot_cle?: string
  /** Titres déjà en ligne : le hub s'en sert pour ne pas cannibaliser l'existant. */
  titres_existants?: string[]
  longueur?: number
  note?: string
  /** Ne peut que resserrer : force la relecture même si le verdict l'autorisait. */
  forcer_relecture?: boolean
  /**
   * Les scènes que le studio propose pour cette marque. Sans elles, le rédacteur
   * n'a rien sur quoi choisir et `scene_visuel` revient vide : l'article reçoit
   * alors la scène PAR DÉFAUT de la marque, la même à chaque fois.
   *
   * Le catalogue se lit donc AVANT la rédaction, pas après : c'est le rédacteur
   * qui sait de quoi parle l'article, pas le code qui l'illustre.
   */
  scenes?: Scene[]
}

/**
 * Demande un article au hub.
 *
 * Délai large à dessein : un article de 1 200 mots écrit par Opus avec un effort
 * élevé prend plusieurs minutes. Couper à 60 s ferait payer la rédaction sans en
 * récupérer le résultat.
 */
export async function requestArticle(demande: DemandeArticle): Promise<RedactionResult> {
  if (!CROME_REDACTION_URL || !CROME_SECRET) {
    return { error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" }
  }
  try {
    const res = await fetch(CROME_REDACTION_URL, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ agent_id: AGENT_ID, ...demande }),
      signal: AbortSignal.timeout(300_000),
    })
    const body = (await res.json().catch(() => ({}))) as RedactionResult
    if (!res.ok) return { ...body, error: body.error ?? `http_${res.status}` }
    return body
  } catch (e) {
    return { error: e instanceof Error ? e.message : "injoignable" }
  }
}
