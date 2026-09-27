import {
  listPosts,
  listCategories,
  updatePost,
  type WPPost,
  type WPTerm,
} from "@/lib/wordpress/client"
import {
  categorieDeRubrique,
  classerArticle,
  RUBRIQUE_PAR_DEFAUT,
} from "@/lib/wordpress/rubriques"

// Rattrapage du classement des articles d'autoecolemagazine.fr.
//
// Créée le 27/09/2026 : la page d'accueil affichait « Non classé » sur quatre
// des cinq derniers articles. Treize articles écrits par la machine entre le
// 1er et le 27 septembre étaient dans ce cas, et la cause n'était pas que la
// rédaction oubliait la catégorie — elle en demandait bien une, mais la
// cherchait par un slug DÉDUIT de son nom (« Actualités » → `actualites`)
// quand le site la range sous `actualites-auto-ecole`. La recherche échouait,
// la création repartait en `term_exists`, et le `.catch(() => null)` de la
// route déposait l'article sans rien. Corrigé dans `findOrCreateCategory` ;
// cette tâche répare ce que ce défaut a laissé derrière lui.
//
// Elle sert aussi de filet permanent : un article sans rubrique est un article
// que le lecteur ne trouve par aucun chemin de navigation, et que le site
// présente comme un déchet. Le passage est idempotent — un article déjà rangé
// n'est pas touché, quelle que soit sa rubrique.
//
// Le classement est fait par des RÈGLES (`lib/wordpress/rubriques.ts`), pas par
// un modèle : il doit se rejouer à l'identique, s'expliquer motif par motif, et
// tourner même quand l'API du hub est en panne — ce qui, en septembre, est
// arrivé six jours d'affilée.

/** La catégorie par défaut de WordPress : c'est elle qu'on vide. */
const NON_CLASSE = 1

/** Articles traités par passage. Aucun appel de modèle : le plafond est celui de WordPress. */
const MAX_PAR_PASSAGE = 25

interface Traite {
  id: number
  slug: string
  titre: string
  statut: string
  rubrique: string
  categorie_id: number | null
  score: number
  second: string | null
  motifs: string[]
  ecrit: boolean
  motif?: string
}

function texteNu(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&eacute;/g, "é")
    .trim()
}

/** Tous les articles rangés en « Non classé », brouillons et programmés compris. */
async function articlesNonClasses(max: number): Promise<WPPost[]> {
  const posts = await listPosts({
    categories: [NON_CLASSE],
    status: "publish,draft,pending,future,private",
    per_page: 100,
    orderby: "date",
    order: "desc",
  })
  return posts.slice(0, max)
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  // `?dry_run=1` : le classement est calculé et rendu, WordPress n'est pas touché.
  const dryRun = params.get("dry_run") === "1"
  // `?slug=` : un article précis, même s'il a déjà une rubrique.
  const slugImpose = params.get("slug") ?? undefined
  // `?rubrique=` : forcer la rubrique, quand la règle se trompe sur un cas.
  const rubriqueImposee = params.get("rubrique") ?? undefined
  const max = Math.min(
    Math.max(Number(params.get("max") ?? MAX_PAR_PASSAGE) || MAX_PAR_PASSAGE, 1),
    100,
  )

  try {
    // Une lecture des catégories qui échoue doit ARRÊTER la tâche : sans la
    // liste, chaque rubrique paraîtrait absente et on les recréerait toutes en
    // doublon — exactement le défaut qu'on répare.
    const categories: WPTerm[] = await listCategories()

    const cibles = slugImpose
      ? await listPosts({
          search: slugImpose,
          status: "publish,draft,pending,future,private",
          per_page: 20,
        }).then((posts) => posts.filter((p) => p.slug === slugImpose))
      : await articlesNonClasses(max)

    const traites: Traite[] = []
    const rubriquesManquantes = new Set<string>()

    for (const post of cibles) {
      const titre = texteNu(post.title?.rendered ?? "")
      const classement = rubriqueImposee
        ? { rubrique: rubriqueImposee, score: -1, motifs: ["imposée par l'appel"], second: null }
        : classerArticle({
            titre,
            slug: post.slug,
            extrait: texteNu(post.excerpt?.rendered ?? ""),
          })

      const categorie = categorieDeRubrique(categories, classement.rubrique)

      // Une rubrique que le site ne porte pas n'est pas créée ici : cette tâche
      // range, elle ne redessine pas la taxonomie. On le dit et on passe.
      if (!categorie) {
        rubriquesManquantes.add(classement.rubrique)
        traites.push({
          id: post.id,
          slug: post.slug,
          titre,
          statut: post.status,
          rubrique: classement.rubrique,
          categorie_id: null,
          score: classement.score,
          second: classement.second?.rubrique ?? null,
          motifs: classement.motifs,
          ecrit: false,
          motif: "rubrique_absente_du_site",
        })
        continue
      }

      // On retire « Non classé » et on garde les autres rubriques déjà posées :
      // un article peut légitimement en porter deux, et ce n'est pas le rôle de
      // ce passage d'en enlever une.
      const autres = (post.categories ?? []).filter((c) => c !== NON_CLASSE)
      const voulues = autres.includes(categorie.id) ? autres : [...autres, categorie.id]

      const dejaBon =
        voulues.length === (post.categories ?? []).length &&
        voulues.every((c) => (post.categories ?? []).includes(c))

      const entree: Traite = {
        id: post.id,
        slug: post.slug,
        titre,
        statut: post.status,
        rubrique: categorie.name,
        categorie_id: categorie.id,
        score: classement.score,
        second: classement.second?.rubrique ?? null,
        motifs: classement.motifs,
        ecrit: false,
      }

      if (dejaBon) {
        entree.motif = "deja_classe"
        traites.push(entree)
        continue
      }

      if (!dryRun) {
        await updatePost(post.id, { categories: voulues })
        entree.ecrit = true
      }
      traites.push(entree)
    }

    // Ce qui reste en « Non classé » après ce passage : c'est le chiffre qui dit
    // si la file avance, et le seul à surveiller dans le journal du cron.
    const restants = dryRun
      ? cibles.length
      : (await listPosts({
          categories: [NON_CLASSE],
          status: "publish,draft,pending,future,private",
          per_page: 100,
        })).length

    return Response.json({
      status: "ok",
      dry_run: dryRun,
      examines: cibles.length,
      classes: traites.filter((t) => t.ecrit).length,
      restants_non_classes: restants,
      par_rubrique: traites.reduce<Record<string, number>>((acc, t) => {
        acc[t.rubrique] = (acc[t.rubrique] ?? 0) + 1
        return acc
      }, {}),
      rubriques_absentes_du_site: [...rubriquesManquantes],
      rubrique_par_defaut: RUBRIQUE_PAR_DEFAUT,
      articles: traites,
    })
  } catch (e) {
    return Response.json(
      { status: "error", error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
