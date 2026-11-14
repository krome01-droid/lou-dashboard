import {
  listAllPosts,
  createPost,
  updatePost,
  uploadMedia,
  findOrCreateCategory,
  type WPPost,
} from "@/lib/wordpress/client"
import {
  requestArticle,
  requestImage,
  attendreImage,
  fetchCatalogue,
  formatArticle,
  isCromeConfigured,
  maillerArticle,
  type ArticleRedige,
  type CandidatLien,
} from "@/lib/crome/client"
import { classerArticle } from "@/lib/wordpress/rubriques"
import { getTopKeywords } from "@/lib/google/search-console"
import { couvertPar, type ArticleConnu } from "@/lib/seo/couverture"
import {
  IndexSujets,
  SEUIL_DOUBLON,
  estGuideDeVille,
  ficheDepuisHtml,
  ficheDepuisRedaction,
  type Fiche,
} from "@/lib/seo/doublons"
import { jugerCouverture, type ArticleDuCatalogue } from "@/lib/seo/jugement"
import { inscrire, lireRegistre, type EntreeRegistre } from "@/lib/seo/registre"
import { construireRepertoire, requeteDeNavigation, type Repertoire } from "@/lib/seo/navigation"
import { listerFichesPourNavigation } from "@/lib/villes/annuaire"
import { query, execute } from "@/lib/db/connection"

// Rédaction d'un article SEO/GEO, puis dépôt sur autoecolemagazine.fr.
//
// Jumelle de la tâche du même nom chez ANGÈLE, et volontairement construite à
// l'identique : CROME OS rédige (règles SEO/GEO, profil éditorial de la marque,
// clé Anthropic) et rend un verdict ; LOU dépose sur WordPress avec ses propres
// identifiants. Le hub n'a aucun accès au site.
//
// Ce que le hub sait de cette marque et que LOU n'a pas à répéter : c'est un
// MÉDIA, pas une auto-école. Le ton est journalistique, jamais promotionnel, et
// le profil éditorial du hub interdit de se présenter comme une auto-école ou de
// promettre un résultat à l'examen. Écrire ces règles ici aussi créerait deux
// vérités qui divergeraient à la première correction.
//
// ── La publication directe, et sa seule exception ────────────────────────────
// Les articles partent publiés. Le hub retient l'article — et lui seul — quand
// le rédacteur a signalé une affirmation « bloquante » (montant, délai, texte de
// loi, éligibilité) ou trop de points mineurs. Dans ce cas il est déposé en
// brouillon, et c'est le HUB qui alerte par Telegram : LOU n'a pas de canal à
// elle (ses envois passent par GoHighLevel, destinés aux abonnés, pas à Armel).
//
// ── Un sujet déjà traité se RÉÉCRIT, il ne se republie pas ───────────────────
// Du 13/09 au 13/11/2026, la voie veille (8h30, tous les jours) a publié 18
// articles sur les ZFE et le Crit'Air, deux fois le même article sur le permis
// dématérialisé, deux sur le protoxyde d'azote, quatre sur le carburant. Elle
// ne passait par AUCUNE garde : `couvertPar` ne servait qu'à la Search Console,
// et la liste de titres confiée au hub — les 60 derniers posts, guides de ville
// compris — ne remontait qu'au 21/10. Chaque actualité sur les ZFE devenait, par
// la consigne même du régime actu, le même article de fond.
//
// Trois étages désormais :
//  1. AVANT la rédaction, un jugement d'intention (`lib/seo/jugement.ts`) sur
//     les idées de veille et les sujets imposés. Une idée déjà traitée fait
//     RÉÉCRIRE l'article existant, à URL constante — sauf s'il a été publié ou
//     réécrit depuis moins de CARENCE_JOURS, auquel cas l'idée est écartée.
//  2. Le hub reçoit les titres des articles de fond (sans les guides), les plus
//     proches du sujet d'abord.
//  3. APRÈS la rédaction, un filet par mots (`lib/seo/doublons.ts`) : un article
//     trop proche d'un existant n'est pas déposé, il est gardé pour relecture.
// Le mot-clé de chaque article est enfin consigné (`lib/seo/registre.ts`).

/** Longueur visée. En deçà, un article se fait mal citer ; au-delà, il se dilue. */
const LONGUEUR = 1300

/**
 * Un article publié ou réécrit depuis moins longtemps n'est pas réécrit à
 * nouveau : sans ce délai, chaque actualité sur les ZFE réécrirait le même
 * article tous les deux jours. L'idée est alors écartée, pas reportée.
 */
const CARENCE_JOURS = 30

/** Titres confiés au hub, qui n'en lit pas davantage. */
const TITRES_HUB = 60

/**
 * La rubrique est choisie par les règles de `lib/wordpress/rubriques.ts`, à
 * partir du titre et du slug de l'article. Verser toute la production dans
 * « Actualités » rendait la navigation par rubrique illisible : un article sur
 * le CPF et un sur les ZFE n'ont pas le même lecteur. « Actualités » reste le
 * défaut quand rien de plus précis ne ressort.
 */

/**
 * Au-delà, une idée de veille n'est plus une actualité : la publier la
 * présenterait comme neuve. À raison de ~6 idées produites par jour pour une
 * seule consommée, le stock grossit vite — sans cette borne, la rédaction
 * quotidienne finirait par puiser dans des nouvelles de plusieurs semaines.
 * Aucune idée fraîche disponible ? La Search Console reprend la main.
 */
const FRAICHEUR_JOURS = 7

/**
 * Nombre d'idées de veille examinées pour en retenir une. Les « high » passent
 * devant les « medium », et à priorité égale la plus récente gagne.
 */
const IDEES_EXAMINEES = 20

interface IdeeVeille {
  id: number
  titre: string
  angle: string
  sourcePrimaire: string | null
  priorite: string
}

/** L'angle est le premier paragraphe, entre l'en-tête et la rubrique suivante. */
function extraireAngle(markdown: string): string {
  const apres = markdown.replace(/^\s*\*\*[^*]*\*\*\s*/, "")
  const fin = apres.search(/\n\s*\*\*/)
  return (fin === -1 ? apres : apres.slice(0, fin)).trim()
}

function metaObjet(v: unknown): Record<string, unknown> {
  if (!v) return {}
  if (typeof v === "object") return v as Record<string, unknown>
  try {
    return JSON.parse(String(v)) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Les idées de veille non encore traitées, de la plus prioritaire à la moins
 * prioritaire. Toutes, et non la première : celle-ci peut être déjà traitée par
 * le site, et c'est le jugement d'intention qui choisit.
 *
 * Le marquage passe par `meta_json` et NON par `status` : cette colonne est un
 * ENUM('draft','review','published','scheduled','failed') et une valeur hors
 * liste serait refusée — ou vidée en silence hors mode strict. Même piège que
 * les CHECK de la table sociale de STAN.
 */
async function ideesVeille(): Promise<IdeeVeille[]> {
  let lignes: { id: number; title: string; content_markdown: string; meta_json: unknown }[]
  try {
    lignes = await query(
      `SELECT id, title, content_markdown, meta_json
       FROM wp_lou_content_log
       WHERE created_by = 'lou-veille'
         AND JSON_EXTRACT(meta_json, '$.traite_le') IS NULL
         AND created_at >= DATE_SUB(NOW(), INTERVAL ${FRAICHEUR_JOURS} DAY)
       ORDER BY created_at DESC
       LIMIT ${IDEES_EXAMINEES}`,
    )
  } catch (e) {
    console.warn(
      "[cron/redaction-seo] veille illisible:",
      e instanceof Error ? e.message.slice(0, 200) : e,
    )
    return []
  }

  const rang = (p: string) => (p === "high" ? 0 : p === "medium" ? 1 : 2)
  const idees = lignes.map((l) => {
    const meta = metaObjet(l.meta_json)
    return {
      id: Number(l.id),
      titre: l.title,
      angle: extraireAngle(l.content_markdown ?? ""),
      sourcePrimaire: (meta.source_primaire as string) ?? null,
      priorite: (meta.priority as string) ?? "low",
    }
  })
  // `sort` est stable : à priorité égale, l'ordre par date reste celui du SELECT.
  idees.sort((a, b) => rang(a.priorite) - rang(b.priorite))
  return idees.filter((i) => i.angle.length > 0)
}

/**
 * Marque l'idée comme traitée, avec ce qu'il en est advenu (`creation:<slug>`,
 * `reecriture:<slug>`, `ecartee:<slug>`, `doublon:<slug>`…). Appelé APRÈS le
 * dépôt : un échec doit pouvoir rejouer.
 */
async function marquerIdeeTraitee(id: number, issue: string): Promise<void> {
  try {
    await execute(
      `UPDATE wp_lou_content_log
       SET meta_json = JSON_SET(COALESCE(meta_json, '{}'), '$.traite_le', ?, '$.issue', ?)
       WHERE id = ?`,
      [new Date().toISOString(), issue, id],
    )
  } catch (e) {
    // Non bloquant, mais bruyant : sans ce marquage la même idée reviendra au
    // prochain passage, et l'article serait écrit deux fois.
    console.error(
      "[cron/redaction-seo] marquage de l'idée de veille échoué:",
      e instanceof Error ? e.message.slice(0, 200) : e,
    )
  }
}

/**
 * La consigne qui accompagne une idée de veille.
 *
 * Le hub n'a AUCUN accès au web : il ne peut pas lire l'article de presse d'où
 * vient le signal, et l'événement est postérieur à ce qu'il connaît. Lui donner
 * un titre d'actualité sans garde-fou, c'est lui demander d'inventer la date
 * d'entrée en vigueur, le montant et le numéro du texte.
 */
function consigneVeille(i: IdeeVeille): string {
  return [
    "Cet article part d'un SIGNAL DE VEILLE, et non d'une source que tu aurais lue : tu n'as aucun accès au web, et l'événement est vraisemblablement postérieur à ce que tu connais.",
    "",
    `Titre de presse repéré : ${i.titre}`,
    `Angle proposé par la veille : ${i.angle}`,
    i.sourcePrimaire ? `Source primaire que le lecteur devra consulter : ${i.sourcePrimaire}` : "",
    "",
    "N'affirme AUCUN détail de cet événement qui ne figure pas ci-dessus : ni date d'entrée en vigueur, ni montant, ni numéro ou intitulé de texte, ni chiffre. Traite le sujet de fond que ce signal ouvre — l'état du droit, ce qui est stable, ce que le lecteur doit vérifier lui-même et où. Toute affirmation engageante que tu conserverais malgré tout doit partir dans « verifications ».",
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * La consigne d'une réécriture. Le hub ne lit pas le site : sans le plan de
 * l'article existant, il écrirait un texte plus étroit que celui qu'il remplace,
 * et le site perdrait ce que l'original couvrait.
 */
function consigneReecriture(titre: string, f: Fiche): string {
  const sections = f.intertitres.filter((h) => !/^(À retenir|Questions fréquentes)$/i.test(h.trim()))
  return [
    `Tu RÉÉCRIS un article déjà publié sur le site, à la même adresse : « ${titre} ». Ton texte le remplacera entièrement.`,
    "Garde son intention et son lecteur. Reprends chacune de ses sections, mises à jour, et intègre ce que le sujet indiqué apporte de neuf. Ne le rends pas plus étroit que l'original.",
    f.reponse ? `Sa réponse directe actuelle : ${f.reponse.slice(0, 600)}` : "",
    sections.length ? `Ses sections actuelles :\n${sections.map((h) => `- ${h}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Publié ou réécrit depuis plus de CARENCE_JOURS ? (`modified` ne sert pas : le maillage le touche.) */
function horsCarence(p: WPPost, registre: Map<string, EntreeRegistre>): boolean {
  const publie = Date.parse(p.date)
  const action = Date.parse((registre.get(p.slug)?.derniere_action ?? "").replace(" ", "T"))
  const derniere = Math.max(Number.isNaN(publie) ? 0 : publie, Number.isNaN(action) ? 0 : action)
  return Date.now() - derniere > CARENCE_JOURS * 24 * 60 * 60 * 1000
}

/**
 * Un texte rédigé mais NON déposé : doublon arrêté par le filet, ou réécriture
 * retenue par le hub. Il ne doit pas être perdu — il a coûté une rédaction — ni
 * devenir un brouillon WordPress, qui compterait ensuite comme un article de
 * plus. Il va dans le journal de LOU, statut `review`, qui l'affiche dans son
 * activité récente.
 */
async function garderPourRelecture(
  titre: string,
  html: string,
  meta: Record<string, unknown>,
): Promise<number | null> {
  try {
    const r = await execute(
      `INSERT INTO wp_lou_content_log (title, type, status, content_markdown, meta_json, created_by)
       VALUES (?, 'article', 'review', ?, ?, 'lou-redaction')`,
      [titre.slice(0, 480), html, JSON.stringify(meta)],
    )
    return r.insertId || null
  } catch (e) {
    console.error(
      "[cron/redaction-seo] texte non déposé ET non conservé :",
      e instanceof Error ? e.message.slice(0, 200) : e,
    )
    return null
  }
}

/**
 * Les titres confiés au hub pour qu'il ne réécrive pas l'existant. Les plus
 * proches du sujet d'abord, puis les plus récents ; jamais les guides de ville,
 * qui prenaient 38 des 60 places au 13/11/2026 ; jamais l'article réécrit, puisque
 * c'est justement lui qu'on demande de retraiter.
 */
function titresPourLeHub(
  articles: WPPost[],
  index: IndexSujets,
  sujet: Fiche | null,
  exclure: string | null,
): string[] {
  const titreDe = new Map(articles.map((p) => [p.slug, texteNu(p.title.rendered)]))
  const ordre = [
    ...(sujet ? index.plusProches(sujet, TITRES_HUB / 2).map((p) => p.slug) : []),
    ...articles.map((p) => p.slug),
  ]
  const vus = new Set<string>()
  const titres: string[] = []
  for (const slug of ordre) {
    if (slug === exclure || vus.has(slug)) continue
    vus.add(slug)
    const t = titreDe.get(slug)
    if (t) titres.push(t)
    if (titres.length >= TITRES_HUB) break
  }
  return titres
}

/**
 * La zone où un mot-clé mérite un article : le site apparaît déjà dessus mais
 * hors des premiers résultats. Écrire sur une requête où l'on est 15e rapporte
 * davantage qu'inventer un sujet sur lequel on n'existe pas.
 */
const POSITION_MIN = 6
const POSITION_MAX = 40
/** En dessous, l'échantillon est trop petit pour dire quoi que ce soit. */
const IMPRESSIONS_MIN = 25

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Retire les balises d'un titre WordPress rendu, entités comprises. */
function texteNu(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/**
 * Les pages publiées du site, dans la forme que le hub de maillage attend.
 * Les brouillons en sont exclus : un lien vers une page qui n'existe pas
 * encore publiquement est un lien mort.
 */
function candidatsMaillage(posts: WPPost[]): CandidatLien[] {
  return posts
    .filter((p) => p.status === "publish" && p.link)
    .map((p) => ({
      url: p.link,
      titre: texteNu(p.title.rendered),
      resume: texteNu(p.excerpt?.rendered ?? "").slice(0, 300) || undefined,
      type: "article",
    }))
}

/**
 * Assemble le HTML déposé dans WordPress.
 *
 * L'ordre n'est pas cosmétique : la réponse directe est en tête parce que c'est
 * le passage qu'un moteur de réponse lèvera tel quel. Placée après le chapô,
 * elle perdrait cette fonction.
 */
function assembler(a: ArticleRedige, jsonld: unknown[]): string {
  const morceaux: string[] = [
    `<p class="reponse-directe"><strong>${echapper(a.reponse_directe)}</strong></p>`,
    `<p>${echapper(a.chapo)}</p>`,
    a.corps_html,
  ]

  if (a.points_cles?.length) {
    morceaux.push(
      "<h2>À retenir</h2>",
      `<ul>${a.points_cles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>`,
    )
  }

  if (a.faq?.length) {
    morceaux.push("<h2>Questions fréquentes</h2>")
    for (const q of a.faq) {
      morceaux.push(`<h3>${echapper(q.question)}</h3>`, `<p>${echapper(q.reponse)}</p>`)
    }
  }

  if (jsonld?.length) {
    // `<` échappé : sans cela, un `</script>` présent dans une réponse de FAQ
    // fermerait la balise et laisserait du JSON en clair dans la page.
    morceaux.push(
      `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>`,
    )
  }

  return morceaux.join("\n\n")
}

/** Une requête écartée parce qu'un article la couvre déjà. */
interface Ecarte {
  mot_cle: string
  position: number
  impressions: number
  slug: string
  par: string
}

/** Une requête écartée parce qu'elle cherche un établissement précis. */
interface RequeteNavigation {
  mot_cle: string
  position: number
  impressions: number
  /** Le nom reconnu (« sebastopol », « plus que permis ») ou la forme (« … photos »). */
  nom: string
  par: "annuaire" | "forme"
  /** La fiche de l'annuaire qui porte ce nom : c'est elle qui répond à la requête. */
  fiche: string | null
}

/**
 * Choisit le mot-clé à viser à partir de la Search Console.
 *
 * Le diagnostic est rendu avec le choix : sans lui, la sélection stratégique se
 * dégrade en choix libre sans que rien ne le signale, et on croit qu'elle
 * fonctionne.
 */
async function choisirMotCle(
  articles: ArticleConnu[],
): Promise<{ motCle: string | null; diagnostic: string; ecartes: Ecarte[]; navigation: RequeteNavigation[] }> {
  let mots: Awaited<ReturnType<typeof getTopKeywords>>
  try {
    mots = await getTopKeywords(200)
  } catch (e) {
    const raison = e instanceof Error ? e.message.slice(0, 200) : "injoignable"
    console.warn("[cron/redaction-seo] Search Console indisponible:", raison)
    return { motCle: null, diagnostic: `Search Console injoignable : ${raison}`, ecartes: [], navigation: [] }
  }

  // L'annuaire, pour reconnaître les requêtes qui cherchent UNE auto-école :
  // plus de six requêtes éligibles sur dix au 14/11/2026. Illisible, il ne
  // laisse pas passer la liste brute — elle donnerait presque à coup sûr un
  // article « comment vérifier l'auto-école X » qui ne répond à personne : le
  // moteur choisit alors son sujet, et le diagnostic le dit.
  let repertoire: Repertoire
  try {
    const fiches = await listerFichesPourNavigation()
    if (fiches.length === 0) throw new Error("zéro fiche auto-école lue")
    repertoire = construireRepertoire(fiches)
  } catch (e) {
    const raison = e instanceof Error ? e.message.slice(0, 200) : "illisible"
    console.error("[cron/redaction-seo] annuaire illisible, requêtes de navigation non filtrables :", raison)
    return {
      motCle: null,
      diagnostic: `annuaire illisible (${raison}) : impossible d'écarter les requêtes qui cherchent un établissement, aucune requête retenue.`,
      ecartes: [],
      navigation: [],
    }
  }

  const eligibles = mots
    .filter(
      (m) =>
        m.position >= POSITION_MIN &&
        m.position <= POSITION_MAX &&
        m.impressions >= IMPRESSIONS_MIN &&
        // Une requête de marque ne se travaille pas par un article.
        !/auto[- ]?école magazine|autoecolemagazine/i.test(m.keyword),
    )
    // Le plus d'impressions d'abord : c'est la demande réelle, pas la position.
    .sort((a, b) => b.impressions - a.impressions)

  // Une requête déjà couverte par un article est écartée, quelle que soit sa
  // position : c'est le cas où la Search Console insiste le plus. L'article
  // existant la fait apparaître hors du podium, elle reste dans la zone « à
  // travailler », et chaque passage en écrivait un de plus.
  //
  // Une requête de navigation est écartée AVANT la couverture : elle n'a
  // aucun article à mettre à jour, et l'article qui la « couvre » est
  // justement celui qui n'aurait pas dû être écrit (`auto-ecole-sebastopol-…`).
  const libres: typeof eligibles = []
  const ecartes: Ecarte[] = []
  const navigation: RequeteNavigation[] = []
  for (const r of eligibles) {
    const n = requeteDeNavigation(r.keyword, repertoire)
    if (n) {
      navigation.push({ mot_cle: r.keyword, position: r.position, impressions: r.impressions, nom: n.nom, par: n.par, fiche: n.fiche })
      continue
    }
    const c = couvertPar(r.keyword, articles)
    if (!c) libres.push(r)
    else ecartes.push({ mot_cle: r.keyword, position: r.position, impressions: r.impressions, slug: c.slug, par: c.par })
  }
  const candidat = libres[0]
  const bilan =
    `${eligibles.length} requêtes éligibles sur ${mots.length}, dont ${navigation.length} de navigation ` +
    `(annuaire de ${repertoire.fiches} fiches) et ${ecartes.length} déjà couvertes`

  if (!candidat) {
    return {
      motCle: null,
      diagnostic: `${bilan} : aucune requête libre entre la ${POSITION_MIN}e et la ${POSITION_MAX}e place avec ${IMPRESSIONS_MIN}+ impressions.`,
      ecartes,
      navigation,
    }
  }
  return {
    motCle: candidat.keyword,
    diagnostic: `${bilan} ; retenue : position ${candidat.position}, ${candidat.impressions} impressions.`,
    ecartes,
    navigation,
  }
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  // `?dry_run=1` : tout se déroule, rien n'est déposé sur WordPress. C'est
  // l'outil de vérification, jamais un réglage du cron.
  const dryRun = params.get("dry_run") === "1"
  const sujetImpose = params.get("sujet") ?? undefined
  const motCleImpose = params.get("mot_cle") ?? undefined
  // `?doublon=1` : écrit un NOUVEL article même si le site couvre déjà le sujet.
  // Il lève toutes les gardes : le refus du mot-clé ou du sujet imposé, le
  // jugement d'intention sur la veille, le filet après rédaction.
  const accepterDoublon = params.get("doublon") === "1"
  // `?remplacer=<slug>` : réécrit cet article publié, à URL constante — même
  // geste que chez STAN. Combinable avec `sujet` ou `mot_cle` pour orienter la
  // réécriture ; c'est l'outil des fusions de doublons.
  const remplacer = params.get("remplacer") ?? undefined
  const forcerRelecture = params.get("relire") === "1"
  // `?source=veille` : partir de la meilleure idée de veille non traitée plutôt
  // que de la Search Console. C'est l'autre voie éditoriale — l'actualité —
  // là où la Search Console sert le fond. Si aucune idée n'est disponible, on
  // retombe silencieusement sur la Search Console : un passage doit toujours
  // produire un article.
  const sourceVeille = params.get("source") === "veille"

  try {
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    // Ce que le site contient déjà sert trois fois : le jugement d'intention, la
    // liste confiée au hub (deux articles proches se cannibalisent et perdent
    // leur classement TOUS LES DEUX) et le filet après rédaction.
    // « publish,draft » et non « publish » : un article retenu pour relecture
    // reste en brouillon, parfois des jours. L'omettre a fait réécrire deux fois
    // le même titre à deux passages d'affilée — exactement la cannibalisation
    // que cette liste sert à éviter.
    // Une lecture qui échoue ARRÊTE la route, comme chez `guide-ville` : sans
    // elle, chaque garde voit un site vide et laisse tout passer.
    const existants = await listAllPosts("publish,draft").catch(() => [] as WPPost[])
    if (existants.length === 0) {
      return Response.json(
        {
          status: "error",
          step: "lecture_wordpress",
          error: "WordPress a rendu zéro article : impossible de savoir ce qui est déjà traité.",
        },
        { status: 502 },
      )
    }
    const registre = await lireRegistre()
    // Les articles de fond : les guides de ville ont leur propre tâche et leur
    // propre garde, et n'ont rien à faire dans une comparaison de sujets.
    const articles = existants.filter((p) => !estGuideDeVille(p.slug))
    const index = new IndexSujets(
      articles.map((p) => ficheDepuisHtml(p.slug, p.title.rendered, p.content?.rendered ?? "")),
    )
    const catalogue: ArticleDuCatalogue[] = articles.map((p) => ({
      slug: p.slug,
      titre: texteNu(p.title.rendered),
    }))
    // Les publiés d'abord : à couverture égale, l'article désigné comme « déjà
    // là » doit être un article en ligne, pas un brouillon. Les guides restent
    // ici : « auto école pau » est bien couvert par le guide de Pau.
    const connus: ArticleConnu[] = [...existants]
      .sort((x, y) => Number(y.status === "publish") - Number(x.status === "publish"))
      .map((p) => ({
        titre: texteNu(p.title.rendered),
        slug: p.slug,
        mot_cle: registre.get(p.slug)?.mot_cle ?? null,
      }))

    // `?remplacer=` : l'article à réécrire, vérifié AVANT de payer la rédaction.
    let cible: WPPost | null = null
    let motifCible: string | null = null
    if (remplacer) {
      cible = existants.find((p) => p.slug === remplacer && p.status === "publish") ?? null
      if (!cible) {
        return Response.json(
          { status: "error", step: "remplacer", error: `Aucun article publié n'a le slug « ${remplacer} ».` },
          { status: 404 },
        )
      }
      motifCible = "réécriture demandée par l'appelant"
    }

    const conseil = (slug: string) =>
      `Réécrire l'article existant avec ?remplacer=${slug} plutôt que d'en écrire un second — ou forcer un nouvel article avec ?doublon=1.`

    // Un mot-clé imposé passe la même garde que celui de la Search Console :
    // les rattrapages du 15/10/2026 ont republié des sujets déjà en ligne.
    if (motCleImpose && !accepterDoublon && !cible) {
      const deja = couvertPar(motCleImpose, connus)
      if (deja) {
        return Response.json(
          {
            status: "error",
            step: "cannibalisation",
            error: `« ${motCleImpose} » est déjà couvert par « ${deja.titre} » (${deja.slug}, reconnu par ${deja.par}).`,
            existant: deja.slug,
            conseil: conseil(deja.slug),
          },
          { status: 409 },
        )
      }
    }

    // Un sujet imposé passe le jugement d'intention : c'est par cette voie que
    // les rattrapages manuels republiaient des sujets déjà en ligne.
    let jugement: string | null = null
    if (sujetImpose && !accepterDoublon && !cible) {
      const j = await jugerCouverture([{ titre: sujetImpose, angle: sujetImpose }], catalogue)
      if (!j.ok) {
        console.error("[cron/redaction-seo] jugement d'intention indisponible :", j.erreur)
        jugement = `indisponible (${j.erreur}) : sujet imposé non vérifié, seul le filet après rédaction jouera`
      } else if (j.decisions[0]?.couvertPar) {
        const slug = j.decisions[0].couvertPar
        return Response.json(
          {
            status: "error",
            step: "cannibalisation",
            error: `« ${sujetImpose} » est déjà traité par « ${catalogue.find((a) => a.slug === slug)?.titre ?? slug} » (${slug}).`,
            raison: j.decisions[0].raison,
            existant: slug,
            conseil: conseil(slug),
          },
          { status: 409 },
        )
      } else {
        jugement = `sujet imposé jugé neuf (${j.modele}) : ${j.decisions[0]?.raison ?? ""}`
      }
    }

    // L'angle vient, par ordre de priorité : du paramètre, de la veille, puis
    // de la Search Console. Une idée de veille déjà traitée par le site fait
    // réécrire l'article qui la traite, ou est écartée s'il est trop récent.
    let idee: IdeeVeille | null = null
    const ideesEcartees: { id: number; titre: string; couvert_par: string; raison: string }[] = []
    if (sourceVeille && !sujetImpose && !motCleImpose && !cible) {
      const idees = await ideesVeille()
      if (idees.length > 0 && accepterDoublon) {
        idee = idees[0]
        jugement = "levé par ?doublon=1"
      } else if (idees.length > 0) {
        const j = await jugerCouverture(
          idees.map((i) => ({ titre: i.titre, angle: i.angle })),
          catalogue,
        )
        if (!j.ok) {
          // Échec ouvert, et bruyant : l'idée passe, le filet par mots reste.
          // Muet, il ferait croire pendant des semaines que la garde tourne.
          console.error("[cron/redaction-seo] jugement d'intention indisponible :", j.erreur)
          idee = idees[0]
          jugement = `indisponible (${j.erreur}) : idée retenue sans vérification d'intention`
        } else {
          jugement = `${idees.length} idées jugées (${j.modele})`
          for (const [n, i] of idees.entries()) {
            const d = j.decisions[n]
            if (!d?.couvertPar) {
              idee = i
              break
            }
            const art = existants.find((p) => p.slug === d.couvertPar) ?? null
            if (art && art.status === "publish" && horsCarence(art, registre)) {
              idee = i
              cible = art
              motifCible = d.raison
              break
            }
            ideesEcartees.push({
              id: i.id,
              titre: i.titre,
              couvert_par: d.couvertPar,
              raison:
                art?.status === "publish"
                  ? `déjà traité, article publié ou réécrit il y a moins de ${CARENCE_JOURS} jours — ${d.raison}`
                  : `déjà traité par un brouillon — ${d.raison}`,
            })
          }
        }
      }
      // Une idée écartée ne doit pas revenir au passage suivant. Rien n'est
      // écrit en `dry_run`.
      if (!dryRun) {
        for (const e of ideesEcartees) await marquerIdeeTraitee(e.id, `ecartee:${e.couvert_par}`)
      }
    }

    const ficheCible = cible
      ? ficheDepuisHtml(cible.slug, cible.title.rendered, cible.content?.rendered ?? "")
      : null
    const sujet = sujetImpose ?? (idee ? idee.titre : undefined) ?? (ficheCible ? ficheCible.titre : undefined)
    const note =
      [
        ficheCible ? consigneReecriture(ficheCible.titre, ficheCible) : "",
        idee ? consigneVeille(idee) : "",
      ]
        .filter(Boolean)
        .join("\n\n") || undefined

    // Un mot-clé, un sujet imposé, une idée de veille ou une réécriture
    // court-circuitent la Search Console : l'angle est déjà décidé.
    const choix =
      motCleImpose || sujet
        ? {
            motCle: null,
            diagnostic: idee
              ? `idée de veille #${idee.id} (priorité ${idee.priorite})`
              : cible && !sujetImpose
                ? `réécriture de ${cible.slug}`
                : "angle imposé par l'appelant",
            ecartes: [] as Ecarte[],
            navigation: [] as RequeteNavigation[],
          }
        : await choisirMotCle(connus)
    // Une réécriture garde le mot-clé que l'article visait, quand on le connaît.
    const motCle =
      motCleImpose ?? choix.motCle ?? (cible ? registre.get(cible.slug)?.mot_cle : null) ?? undefined
    // La requête la plus vue parmi celles qu'un article couvre déjà : c'est
    // l'article à mettre à jour si l'on veut gagner des places dessus.
    const miseAJourSuggeree = choix.ecartes[0] ?? null
    const mode: "creation" | "reecriture" = cible ? "reecriture" : "creation"
    const sujetFiche: Fiche | null =
      sujet || motCle
        ? { slug: "", titre: sujet ?? motCle ?? "", reponse: idee?.angle ?? motCle ?? "", intertitres: [] }
        : null

    // Le catalogue du studio se lit AVANT la rédaction, et son résultat sert
    // deux fois : le rédacteur choisit la scène qui montre ce dont il parle, et
    // l'illustration réclame ensuite un format que la marque possède vraiment.
    // Lu après, comme il l'était, `scene_visuel` ne pouvait que revenir vide et
    // chaque article de la marque recevait la même scène par défaut.
    const { scenes, formats } = await fetchCatalogue()

    const rendu = await requestArticle({
      sujet,
      note,
      // Un article issu de la veille relève du régime ACTUALITÉ : sans lui, la
      // moindre règle de droit citée le retiendrait, et la voie actu ne
      // publierait jamais rien.
      regime: idee ? "actu" : undefined,
      mot_cle: motCle,
      // Le hub plafonne à 60 : les plus proches du sujet d'abord.
      titres_existants: titresPourLeHub(articles, index, sujetFiche, cible?.slug ?? null),
      longueur: LONGUEUR,
      forcer_relecture: forcerRelecture,
      scenes,
    })

    if (rendu.error || !rendu.article || !rendu.publication) {
      console.error("[cron/redaction-seo] rédaction:", rendu.error ?? rendu.reason)
      return Response.json(
        { status: "error", step: "crome_redaction", error: rendu.error ?? rendu.reason },
        { status: 502 },
      )
    }

    const article = rendu.article
    const verdict = rendu.publication
    const angleSource = idee ? "veille" : sujetImpose ? "paramètre" : cible ? "réécriture" : motCle ? "search-console" : "moteur"
    const motCleSource = motCleImpose ? "paramètre" : motCle ? (choix.motCle ? "search-console" : "registre") : "moteur"
    const commun = {
      mode,
      cible: cible ? { slug: cible.slug, wp_id: cible.id, motif: motifCible } : null,
      jugement,
      idees_ecartees: ideesEcartees,
      titre: article.titre,
      mot_cle: article.mot_cle_principal,
      mot_cle_source: motCleSource,
      mot_cle_diagnostic: choix.diagnostic,
      mots_cles_ecartes: choix.ecartes.slice(0, 10),
      // Les requêtes qui cherchent UN établissement : la fiche de l'annuaire y
      // répond, un article ne le peut pas.
      requetes_navigation: choix.navigation.slice(0, 10),
      mise_a_jour_suggeree: miseAJourSuggeree,
      angle_source: angleSource,
      veille_id: idee?.id ?? null,
      statut_conseille: verdict.statut_conseille,
      // La scène retenue par le rédacteur. Vide = scène par défaut de la marque :
      // c'est le signal que le catalogue n'a pas été lu ou qu'aucune scène ne
      // collait, et non un détail cosmétique.
      scene: article.scene_visuel || null,
      motif: verdict.motif,
      bloquants: verdict.bloquants,
      mineurs: verdict.mineurs,
    }

    // Le filet, sur une création seulement : l'article rédigé est-il un
    // doublon de l'existant ? Il se compare comme les articles du site entre eux
    // — même rédacteur, même style —, ce qui rend le score par mots fiable ici
    // alors qu'il ne l'est pas sur un titre de presse. Placé AVANT le maillage
    // et l'image : un doublon arrêté ne doit rien coûter de plus.
    if (mode === "creation" && !accepterDoublon) {
      const [proche] = index.plusProches(ficheDepuisRedaction(article), 1)
      const parMotCle = article.mot_cle_principal
        ? couvertPar(article.mot_cle_principal, connus.filter((c) => c.mot_cle))
        : null
      const doublon =
        parMotCle?.par === "mot_cle"
          ? { slug: parMotCle.slug, titre: parMotCle.titre, par: "mot_cle" as const, score: proche?.slug === parMotCle.slug ? proche.score : null }
          : proche && proche.score >= SEUIL_DOUBLON
            ? { slug: proche.slug, titre: proche.titre, par: "contenu" as const, score: proche.score }
            : null
      if (doublon) {
        const html = assembler(article, rendu.jsonld ?? [])
        const conserve = dryRun
          ? null
          : await garderPourRelecture(article.titre, html, {
              motif: "doublon",
              doublon_de: doublon.slug,
              par: doublon.par,
              score: doublon.score,
              slug_propose: article.slug,
              mot_cle: article.mot_cle_principal,
              veille_id: idee?.id ?? null,
            })
        if (idee && !dryRun) await marquerIdeeTraitee(idee.id, `doublon:${doublon.slug}`)
        console.warn(`[cron/redaction-seo] doublon de ${doublon.slug} (${doublon.par}) : non déposé`)
        return Response.json({
          status: "ok",
          dry_run: dryRun || undefined,
          publie: false,
          ...commun,
          mode: "doublon_evite",
          doublon: { ...doublon, seuil: SEUIL_DOUBLON },
          conserve_pour_relecture: conserve,
          conseil: conseil(doublon.slug),
        })
      }
    }

    // Le maillage interne, AVANT l'assemblage : seul le corps rédigé reçoit des
    // liens, pas la FAQ ni le bloc « À retenir ». Le hub choisit des ancres dans
    // le texte existant et pose les liens ; il ne réécrit rien d'autre.
    // Non bloquant : un article sans lien reste un article, et le rattrapage
    // quotidien (`maillage-interne`) y reviendra de toute façon.
    // Un article réécrit ne se lie pas à lui-même.
    const maillage = await maillerArticle({
      article: { titre: article.titre, contenu: article.corps_html, format: "html" },
      candidats: candidatsMaillage(existants).filter((c) => !cible || c.url !== cible.link),
    })
    if (maillage.ok && maillage.contenu) article.corps_html = maillage.contenu
    else if (maillage.error) console.warn("[cron/redaction-seo] maillage non appliqué:", maillage.error)
    const rapportMaillage = {
      liens: maillage.liens?.length ?? 0,
      cibles: (maillage.liens ?? []).map((l) => l.url),
      ecartes: maillage.ecartes?.length ?? 0,
      motif: maillage.motif ?? maillage.error ?? null,
    }
    const statut: "publish" | "draft" =
      verdict.statut_conseille === "publier" ? "publish" : "draft"

    // Le visuel. Non bloquant : un article sans vignette reste un article, et la
    // rédaction a déjà coûté plusieurs minutes de modèle. Une réécriture garde
    // la couverture de l'article : elle a déjà passé le contrôle de réalisme.
    let imageUrl: string | null = null
    let mediaId: number | undefined
    let imageErreur: string | undefined
    if (!dryRun && mode === "creation") {
      const scene = scenes.some((s) => s.key === article.scene_visuel)
        ? article.scene_visuel
        : undefined
      // 3:2 est le format « Blog/Article » — un 1:1 serait rogné en vignette et
      // un 9:16 illisible en tête d'article. Mais on ne le demande que si la
      // marque l'a : c'est en réclamant un 3:2 que cette marque n'avait pas que
      // le premier article de LOU est sorti sans vignette.
      // Seules la scène et le format sont fixés. La lumière, le style et le lieu
      // sont laissés au studio, qui les tire au sort parmi ceux que la scène
      // accepte. Cinq couvertures identiques du 10 au 14/09/2026 : la scène
      // `driving` était choisie chaque jour et fixait tout son décor — corrigé
      // côté studio (axe lieu, six scènes de plus pour les sujets du magazine).
      let media = await requestImage({
        scene,
        format: formatArticle(formats),
        destination: "couverture_article",
      })
      // L'attente du studio est bornée à 45 s et le 3:2 la dépasse presque
      // toujours : sans cette reprise, l'image aboutissait quelques secondes
      // après qu'on l'ait déclarée perdue.
      if (!media.image_url && media.generation_id && media.status !== "error") {
        media = await attendreImage(media.generation_id)
      }
      if (media.image_url) {
        imageUrl = media.image_url
        const extension = media.image_url.toLowerCase().includes(".png") ? "png" : "jpg"
        const id = await uploadMedia(media.image_url, `${article.slug}.${extension}`)
        if (id) mediaId = id
        else imageErreur = "médiathèque WordPress : téléversement refusé"
      } else {
        imageErreur = media.error ?? media.reason ?? `studio : ${media.status ?? "sans réponse"}`
      }
      if (imageErreur) console.warn("[cron/redaction-seo] pas de vignette:", imageErreur)
    }

    const contenu = assembler(article, rendu.jsonld ?? [])

    if (dryRun) {
      return Response.json({
        status: "ok",
        dry_run: true,
        publie: false,
        ...commun,
        slug: cible ? cible.slug : article.slug,
        longueur_html: contenu.length,
        nb_faq: article.faq?.length ?? 0,
        maillage: rapportMaillage,
      })
    }

    // ── Réécriture : le contenu change, l'adresse non ──────────────────────────
    // Slug, date de publication, rubrique et couverture sont conservés ; titre,
    // corps et extrait sont remplacés. WordPress garde l'ancienne version dans
    // ses révisions : la réécriture se défait depuis l'éditeur.
    if (cible) {
      if (statut === "draft") {
        // Le hub a retenu le texte. L'article en ligne n'est PAS touché — on ne
        // remplace pas un texte vérifié par un texte à vérifier. Le hub a déjà
        // sonné ; le texte attend dans le journal de LOU.
        const conserve = await garderPourRelecture(article.titre, contenu, {
          motif: "reecriture_retenue",
          cible: cible.slug,
          cible_id: cible.id,
          bloquants: verdict.bloquants,
          mot_cle: article.mot_cle_principal,
          veille_id: idee?.id ?? null,
        })
        if (idee) await marquerIdeeTraitee(idee.id, `reecriture_retenue:${cible.slug}`)
        return Response.json({
          status: "ok",
          publie: false,
          ...commun,
          url: cible.link,
          conserve_pour_relecture: conserve,
          alerte_relecture: rendu.alerte?.envoyee
            ? "Telegram, envoyée par le hub (aucun brouillon WordPress : le texte est dans le journal de LOU)"
            : `NON ENVOYÉE — ${rendu.alerte?.erreur ?? "le hub n'a pas alerté"}`,
          maillage: rapportMaillage,
        })
      }
      const maj = await updatePost(cible.id, {
        title: article.titre,
        content: contenu,
        excerpt: article.meta_description,
      })
      if (idee) await marquerIdeeTraitee(idee.id, `reecriture:${cible.slug}`)
      await inscrire({
        wp_id: cible.id,
        slug: cible.slug,
        action: "reecriture",
        mot_cle: article.mot_cle_principal,
        titre: article.titre,
        source: angleSource,
        veille_id: idee?.id ?? null,
      })
      return Response.json({
        status: "ok",
        publie: true,
        ...commun,
        wp_id: maj.id,
        url: maj.link ?? cible.link,
        ancien_titre: texteNu(cible.title.rendered),
        jsonld_conserve: (maj.content?.rendered ?? "").includes("application/ld+json"),
        maillage: rapportMaillage,
      })
    }

    // Une catégorie absente ne doit pas coûter l'article : on dépose sans.
    // Mais on ne se tait pas non plus — c'est un `.catch(() => null)` muet qui a
    // laissé 13 articles partir en « Non classé » pendant tout septembre 2026,
    // sans que rien nulle part n'en porte la trace.
    const classement = classerArticle({
      titre: article.titre,
      slug: article.slug,
      extrait: article.meta_description,
    })
    let categorie: number | null = null
    let categorieErreur: string | undefined
    try {
      categorie = await findOrCreateCategory(classement.rubrique)
    } catch (e) {
      categorieErreur = e instanceof Error ? e.message : String(e)
      console.error(
        `[cron/redaction-seo] rubrique « ${classement.rubrique} » introuvable :`,
        categorieErreur,
      )
    }

    const depose = await createPost({
      title: article.titre,
      slug: article.slug,
      content: contenu,
      excerpt: article.meta_description,
      status: statut,
      ...(categorie ? { categories: [categorie] } : {}),
      ...(mediaId ? { featured_media: mediaId } : {}),
    })

    // L'idée n'est marquée qu'ici, une fois l'article réellement déposé : un
    // échec en amont doit pouvoir rejouer la même idée au passage suivant.
    if (idee) await marquerIdeeTraitee(idee.id, `creation:${depose.slug ?? article.slug}`)
    await inscrire({
      wp_id: depose.id,
      slug: depose.slug ?? article.slug,
      action: "creation",
      mot_cle: article.mot_cle_principal,
      titre: article.titre,
      source: angleSource,
      veille_id: idee?.id ?? null,
    })

    // WordPress retire les balises `<script>` pour les comptes sans le droit
    // `unfiltered_html`. Le dire plutôt que laisser croire aux données
    // structurées : une FAQ non balisée ne remonte pas dans les aperçus IA.
    const jsonldConserve = (depose.content?.rendered ?? "").includes("application/ld+json")

    // Le hub a déjà alerté (ou non) au moment du verdict. On rapporte ce qu'il
    // dit, pour qu'un « retenu » sans alerte partie se voie.
    const alerte =
      statut === "publish"
        ? "sans objet (article publié)"
        : rendu.alerte?.envoyee
          ? "Telegram, envoyée par le hub"
          : `NON ENVOYÉE — ${rendu.alerte?.erreur ?? "le hub n'a pas alerté"}`
    if (statut === "draft" && !rendu.alerte?.envoyee) {
      console.error("[cron/redaction-seo] brouillon retenu sans alerte :", rendu.alerte?.erreur)
    }

    return Response.json({
      status: "ok",
      publie: statut === "publish",
      ...commun,
      wp_id: depose.id,
      url: depose.link,
      jsonld_conserve: jsonldConserve,
      rubrique: {
        nom: classement.rubrique,
        id: categorie,
        score: classement.score,
        second: classement.second?.rubrique ?? null,
        // Comme `image_error` : dire pourquoi l'article part sans rubrique
        // plutôt que de laisser un `null` qu'aucun journal ne relèvera.
        erreur: categorieErreur,
      },
      maillage: rapportMaillage,
      image_url: imageUrl,
      // Distinct d'un `null` muet : dire pourquoi il n'y a pas de vignette.
      image_error: mediaId ? undefined : imageErreur,
      alerte_relecture: alerte,
    })
  } catch (err) {
    console.error("[cron/redaction-seo]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur rédaction" },
      { status: 500 },
    )
  }
}
