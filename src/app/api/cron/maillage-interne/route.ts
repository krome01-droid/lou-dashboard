import { listAllPosts, getPostRaw, updatePost, type WPPost } from "@/lib/wordpress/client"
import { maillerArticle, isCromeConfigured, type CandidatLien } from "@/lib/crome/client"

// Maillage interne des articles déjà en ligne sur autoecolemagazine.fr.
//
// Branchée le 12/09/2026. Le constat : les articles rédigés par la machine
// depuis août ne contenaient AUCUN lien vers le reste du site — le hub rendait
// des suggestions de liens que cette tâche jumelle (`redaction-seo`) jetait.
// Et les articles plus anciens n'en avaient pas davantage. Un blog dont aucune
// page ne conduit à une autre distribue son autorité à personne, et retient le
// lecteur une page.
//
// Deux mouvements, chacun à sa place :
//  - `redaction-seo` maille désormais chaque NOUVEL article avant de le déposer ;
//  - cette tâche repasse sur l'EXISTANT, quelques articles par jour, en donnant
//    la priorité à ceux qui ont le moins de liens. Elle sert aussi le sens
//    inverse : un article d'hier ne peut pas pointer vers celui de demain, et
//    c'est ce passage-là qui, plus tard, fera pointer les anciens vers les
//    nouveaux.
//
// Ce que fait le hub, et ce qu'il ne fait pas : il choisit des ancres DANS le
// texte existant et pose les liens ; il ne change pas un mot d'autre, et le
// prouve avant de rendre. C'est ce qui autorise à modifier un article publié
// depuis des mois sans le relire.
//
// Le contenu modifié est celui qui est STOCKÉ (`content.raw`), pas celui qui
// est rendu : réécrire le rendu figerait les filtres du thème dans la base.

/** Articles traités par passage. Trois, c'est ~1 min de modèle, et ~90 articles par mois. */
const MAX_PAR_PASSAGE = 3
/** Un article qui a déjà ce nombre de liens internes n'est pas prioritaire. */
const LIENS_SUFFISANTS = 2
const HOTE = /^https?:\/\/(www\.)?autoecolemagazine\.fr/i

function texteNu(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/** Cibles internes distinctes d'un contenu : chemin relatif ou domaine de la marque. */
function nbLiensInternes(html: string): number {
  const cibles = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)]
    .map((m) => m[1].trim())
    .filter((h) => (h.startsWith("/") && !h.startsWith("//")) || HOTE.test(h))
    .map((h) => h.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase())
  return new Set(cibles).size
}

function candidats(posts: WPPost[]): CandidatLien[] {
  return posts
    .filter((p) => p.status === "publish" && p.link)
    .map((p) => ({
      url: p.link,
      titre: texteNu(p.title.rendered),
      resume: texteNu(p.excerpt?.rendered ?? "").slice(0, 300) || undefined,
      type: "article",
    }))
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  // `?dry_run=1` : le hub travaille, rien n'est réécrit dans WordPress.
  const dryRun = params.get("dry_run") === "1"
  // `?slug=` : un article précis, quel que soit son nombre de liens.
  const slugImpose = params.get("slug") ?? undefined
  const max = Math.min(Math.max(Number(params.get("max") ?? MAX_PAR_PASSAGE) || MAX_PAR_PASSAGE, 1), 10)
  const seuil = Math.max(Number(params.get("min") ?? LIENS_SUFFISANTS) || LIENS_SUFFISANTS, 1)

  try {
    if (!isCromeConfigured()) {
      return Response.json(
        { status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" },
        { status: 500 },
      )
    }

    // Seuls les articles publiés sont lus ET liés : un brouillon n'a pas
    // d'adresse publique, et le lier ferait un lien mort.
    const publies = (await listAllPosts("publish")).filter((p) => p.link)
    const pages = candidats(publies)

    // L'état du maillage sur tout le site : c'est aussi ce que la réponse
    // rapporte, pour qu'on voie le rattrapage avancer d'un passage à l'autre.
    const etat = publies.map((p) => ({ p, liens: nbLiensInternes(p.content?.rendered ?? "") }))
    const enRetard = etat.filter((x) => x.liens < seuil)

    const aTraiter = slugImpose
      ? etat.filter((x) => x.p.slug === slugImpose)
      : [...enRetard]
        .sort((a, b) => a.liens - b.liens || b.p.date.localeCompare(a.p.date))
        .slice(0, max)

    if (slugImpose && aTraiter.length === 0) {
      return Response.json({ status: "error", error: `Aucun article publié sous le slug « ${slugImpose} ».` }, { status: 404 })
    }

    const traites: Record<string, unknown>[] = []
    for (const { p, liens } of aTraiter) {
      const brut = await getPostRaw(p.id)
      const resultat = await maillerArticle({
        article: { titre: brut.title, url: brut.link, contenu: brut.raw, format: "html" },
        candidats: pages,
      })

      const rapport: Record<string, unknown> = {
        wp_id: p.id,
        slug: p.slug,
        url: p.link,
        liens_avant: liens,
        liens_poses: resultat.liens?.length ?? 0,
        cibles: (resultat.liens ?? []).map((l) => ({ ancre: l.ancre, url: l.url })),
        ecartes: resultat.ecartes ?? [],
        motif: resultat.motif ?? resultat.error ?? null,
        ecrit: false,
      }

      if (resultat.error || !resultat.ok) {
        console.warn("[cron/maillage-interne]", p.slug, ":", resultat.error ?? resultat.reason)
        traites.push(rapport)
        continue
      }
      if (resultat.modifie && resultat.contenu && !dryRun) {
        await updatePost(p.id, { content: resultat.contenu })
        rapport.ecrit = true
      }
      traites.push(rapport)
    }

    return Response.json({
      status: "ok",
      dry_run: dryRun,
      publies: publies.length,
      seuil,
      // Combien restaient sous le seuil AVANT ce passage : la file du rattrapage.
      en_retard: enRetard.length,
      traites,
    })
  } catch (err) {
    console.error("[cron/maillage-interne]", err instanceof Error ? err.message : err)
    return Response.json(
      { status: "error", error: err instanceof Error ? err.message : "Erreur maillage" },
      { status: 500 },
    )
  }
}
