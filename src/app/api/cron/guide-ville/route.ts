import {
  listAllPosts,
  createPost,
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
  maillerArticle,
  isCromeConfigured,
  type ArticleRedige,
  type CandidatLien,
} from "@/lib/crome/client"
import {
  listerVilles,
  dossierVille,
  normaliser,
  slugifier,
  MIN_AUTO_ECOLES,
  type VilleAnnuaire,
  type DossierVille,
  type FicheAutoEcole,
} from "@/lib/villes/annuaire"

// Les guides de ville : « Auto-école Le Mans (72) — Comparatif 32 établissements ».
//
// Demandé par Armel le 21/09/2026 : « ce type d'article fonctionne bien, fais
// des articles comme ça sur toutes les villes importantes en France ». Le
// modèle est le guide du Mans publié en mai — et ce qui le distingue d'un
// article générique, c'est qu'il est ANCRÉ dans l'annuaire du magazine :
// nombre d'établissements, notes et avis Google, formations proposées, taux de
// réussite au permis B, agréments. Ce guide-ci reproduit cette chaîne :
//
//   1. l'annuaire (`lib/villes/annuaire`) fournit le dossier de la ville —
//      chiffres agrégés et fiches ;
//   2. le hub CROME OS rédige à partir de ce dossier, sous ses règles
//      éditoriales et son verdict habituels (`rediger-article`) ;
//   3. le tableau des établissements est bâti ICI, par le code, à partir des
//      fiches — jamais par le modèle, qui pourrait arrondir un chiffre ;
//   4. maillage interne par le hub, couverture par le studio, dépôt dans la
//      catégorie « villes » avec le slug `auto-ecoles-{ville}`.
//
// « Ville importante » = ville de métropole avec au moins `MIN_AUTO_ECOLES`
// fiches dans l'annuaire, non encore couverte. Un passage traite UNE ville, la
// plus fournie qui reste : le wrapper cron coupe à 600 s et une rédaction en
// prend 300 à 400 ; le crontab appelle donc la route plusieurs fois par nuit.
//
// Le slug `les-auto-ecoles-de-{ville}` est réservé : c'est la convention des
// PAGES de l'annuaire, vers lesquelles la recherche du site redirige. Les
// guides prennent `auto-ecoles-{ville}`, la forme de l'article témoin.

const CATEGORIE = "villes"
const LONGUEUR = 1800
/** Établissements dans le tableau : au-delà, il faut le comparateur, qui trie. */
const TABLEAU_MAX = 15

function echapper(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function texteNu(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/**
 * Les villes qui ont déjà leur guide. Un guide se reconnaît à sa catégorie
 * « villes » ou à son slug au PLURIEL (`auto-ecoles-…`, `les-auto-ecoles-de-…`),
 * les deux registres coexistant depuis mai. Le singulier n'en est pas un :
 * « auto-ecole-a-metz-bien-choisir » est un article ancien, pas un comparatif,
 * et le premier essai (21/09/2026) comptait 105 villes couvertes pour cette
 * raison — Caen, Nancy, Metz, Tours en tête.
 *
 * On compare des MOTS de slug, pas des sous-chaînes : « toul » est dans
 * « toulouse », et Toul (54) passait pour couverte par le guide de Toulouse.
 */
function villesCouvertes(posts: WPPost[], categorieId: number | null): string[][] {
  const guides = posts.filter(
    (p) =>
      (categorieId !== null && p.categories?.includes(categorieId)) ||
      /^(les-)?auto-ecoles-/.test(p.slug),
  )
  const empreintes: string[][] = []
  for (const g of guides) {
    empreintes.push(g.slug.split("-").filter(Boolean))
    empreintes.push(slugifier(texteNu(g.title.rendered)).split("-").filter(Boolean))
  }
  return empreintes
}

function contientSequence(mots: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > mots.length) return false
  for (let i = 0; i + sequence.length <= mots.length; i++) {
    let ok = true
    for (let j = 0; j < sequence.length; j++) {
      if (mots[i + j] !== sequence[j]) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

function estCouverte(v: VilleAnnuaire, empreintes: string[][]): boolean {
  const sequence = slugifier(v.nom).split("-").filter(Boolean)
  return empreintes.some((mots) => contientSequence(mots, sequence))
}

function formatNote(f: FicheAutoEcole): string {
  return f.note !== null ? `${String(f.note).replace(".", ",")}/5 (${f.nbAvis} avis)` : "—"
}

/** Le dossier, tel que le rédacteur le lit. Tout chiffre cité vient d'ici. */
function consigne(d: DossierVille): string {
  const v = d.ville
  const top = [...d.fiches]
    .sort((a, b) => b.nbAvis - a.nbAvis || (b.note ?? 0) - (a.note ?? 0))
    .slice(0, 25)
  const lignes = [
    `GUIDE DE VILLE — ${v.nom} (${v.dept}). Ce guide est un COMPARATIF LOCAL ancré dans l'annuaire d'Auto-École Magazine. Les chiffres ci-dessous sont recensés par le magazine : ce sont des FAITS ÉTABLIS, cite-les comme tels (« selon l'annuaire d'Auto-École Magazine », « recensées par le magazine ») et NE LES METS PAS dans « verifications ».`,
    "",
    "CHIFFRES DE LA VILLE",
    `- ${d.nb} auto-écoles recensées à ${v.nom}, dont ${d.nbAgreees} avec un numéro d'agrément préfectoral connu.`,
    d.noteMoyenne !== null
      ? `- Note Google moyenne (pondérée par le nombre d'avis) : ${String(d.noteMoyenne).replace(".", ",")}/5 sur ${d.nbNotees} établissements notés, ${d.nbAvisTotal} avis cumulés ; ${d.partExcellentes} % des établissements notés sont à 4,5/5 ou plus.`
      : "- Notes Google : trop peu d'avis pour une moyenne significative.",
    d.tauxReussiteMedian !== null
      ? `- Taux de réussite au permis B (chiffres officiels, établissements ayant présenté au moins 20 candidats) : médiane ${d.tauxReussiteMedian} % sur ${d.nbAvecTaux} établissements. Les meilleurs : ${d.meilleursTaux.map((f) => `${f.nom} (${f.tauxReussiteB} %, ${f.presentationsB} présentations)`).join(" ; ")}.`
      : "- Taux de réussite au permis B : pas assez de données locales pour une médiane — ne cite aucun taux local.",
    `- ${d.nbLabelQualite} établissements portent le label qualité des écoles de conduite.`,
    `- ${d.nbPermisUnEuro} établissements sont partenaires du permis à 1 € par jour.`,
    `- Formations proposées (nombre d'établissements) : ${d.formations.slice(0, 10).map((f) => `${f.libelle} (${f.nb})`).join(", ")}.`,
    `- La liste complète et filtrable est sur le comparateur : ${d.urlAnnuaire}`,
    "",
    "LES ÉTABLISSEMENTS LES PLUS CONSULTÉS (nom — adresse — note Google — formations) — sers-t'en pour parler des QUARTIERS : regroupe-les par secteur d'après leurs adresses, et cite des noms réels quand tu illustres un quartier.",
    ...top.map((f) => `- ${f.nom} — ${f.adresse || "adresse non renseignée"} — ${formatNote(f)}${f.tauxReussiteB !== null && f.presentationsB >= 20 ? ` — réussite B ${f.tauxReussiteB} %` : ""}${f.formations.length ? ` — ${f.formations.slice(0, 4).join(", ")}` : ""}${f.labelQualite ? " — label qualité" : ""}${f.permisUnEuro ? " — permis à 1 €/jour" : ""}`),
    "",
    "STRUCTURE ATTENDUE DU CORPS (H2, dans cet ordre ; des H3 dedans quand c'est utile) :",
    `1. Pourquoi comparer les auto-écoles à ${v.nom} avant de s'inscrire — avec les chiffres de la ville.`,
    `2. Les quartiers de ${v.nom} et leurs auto-écoles — un H3 par secteur, d'après les adresses ci-dessus ; nomme des établissements réels.`,
    `3. Les formules de formation disponibles à ${v.nom} — permis B, conduite accompagnée (AAC), boîte automatique, formule accélérée, moto : d'après la répartition ci-dessus.`,
    `4. Combien coûte le permis de conduire à ${v.nom} — l'annuaire n'a PAS de tarifs locaux fiables : donne les fourchettes nationales en le disant explicitement, et renvoie au comparateur pour les tarifs affichés par chaque école.`,
    `5. Comment choisir la meilleure auto-école à ${v.nom} — agrément, taux de réussite officiel, avis récents, accueil, qualification des moniteurs.`,
    `6. Financement du permis à ${v.nom} — permis à 1 € par jour (${d.nbPermisUnEuro} partenaires locaux), CPF (avec ses conditions actuelles), aides régionales et locales sans en inventer : dis où le lecteur vérifie.`,
    `7. L'examen du permis à ${v.nom} — n'invente NI centre d'examen NI délai chiffré : explique comment ils se déterminent (préfecture, plateforme RdvPermis) et où se renseigner.`,
    `8. Comparatif des auto-écoles à ${v.nom} : critères de sélection.`,
    "",
    "RÈGLES PROPRES À CE GUIDE",
    "- Ton de comparateur indépendant : le magazine ne vend aucune formation, ne recommande pas un établissement au détriment des autres ; les noms cités illustrent, ils ne classent pas.",
    "- Un tableau des établissements sera ajouté APRÈS ton corps par le magazine : n'en écris pas.",
    `- Le titre commence par « Auto-école ${v.nom} (${v.dept}) » ou « Auto-écoles à ${v.nom} (${v.dept}) » et mentionne le comparatif et le nombre d'établissements (${d.nb}). Le slug sera imposé par le magazine.`,
    "- Réponse directe : le nombre d'établissements recensés, la note moyenne et ce que le lecteur trouvera.",
  ]
  return lignes.join("\n")
}

/** Le tableau des établissements : des données, pas de la prose — donc du code. */
function tableau(d: DossierVille): string {
  const v = d.ville
  const lignes = [...d.fiches]
    .filter((f) => f.nom)
    .sort((a, b) => b.nbAvis - a.nbAvis || (b.note ?? 0) - (a.note ?? 0))
    .slice(0, TABLEAU_MAX)
  const tr = lignes
    .map((f) => {
      const taux = f.tauxReussiteB !== null && f.presentationsB >= 20 ? `${f.tauxReussiteB} %` : "—"
      const formations = f.formations.slice(0, 3).join(", ") || "—"
      return `<tr><td><a href="${echapper(f.url)}">${echapper(f.nom)}</a>${f.labelQualite ? " <em>(label qualité)</em>" : ""}</td><td>${echapper(f.adresse || "—")}</td><td>${echapper(formatNote(f))}</td><td>${taux}</td><td>${echapper(formations)}</td></tr>`
    })
    .join("\n")
  return [
    `<h2>Les auto-écoles de ${echapper(v.nom)} recensées par Auto-École Magazine</h2>`,
    `<p>Les ${d.nb} établissements de ${echapper(v.nom)} figurent dans l'annuaire du magazine. Voici les ${lignes.length} les plus consultés, avec leur note Google et, quand l'établissement a présenté au moins vingt candidats, son taux de réussite officiel au permis B.</p>`,
    `<table class="aem-tableau-villes"><thead><tr><th>Établissement</th><th>Adresse</th><th>Note Google</th><th>Réussite permis B</th><th>Formations</th></tr></thead><tbody>`,
    tr,
    `</tbody></table>`,
    `<p><a href="${echapper(d.urlAnnuaire)}">Voir et filtrer les ${d.nb} auto-écoles de ${echapper(v.nom)} sur le comparateur</a> — par formation, par quartier, par note.</p>`,
  ].join("\n")
}

/** Même assemblage que `redaction-seo`, avec le tableau entre le corps et « À retenir ». */
function assembler(a: ArticleRedige, tableauHtml: string, jsonld: unknown[]): string {
  const morceaux: string[] = [
    `<p class="reponse-directe"><strong>${echapper(a.reponse_directe)}</strong></p>`,
    `<p>${echapper(a.chapo)}</p>`,
    a.corps_html,
    tableauHtml,
  ]
  if (a.points_cles?.length) {
    morceaux.push("<h2>À retenir</h2>", `<ul>${a.points_cles.map((p) => `<li>${echapper(p)}</li>`).join("")}</ul>`)
  }
  if (a.faq?.length) {
    morceaux.push("<h2>Questions fréquentes</h2>")
    for (const q of a.faq) morceaux.push(`<h3>${echapper(q.question)}</h3>`, `<p>${echapper(q.reponse)}</p>`)
  }
  if (jsonld?.length) {
    morceaux.push(`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>`)
  }
  return morceaux.join("\n\n")
}

function candidatsMaillage(posts: WPPost[]): CandidatLien[] {
  return posts
    .filter((p) => p.status === "publish" && p.link)
    .map((p) => ({
      url: p.link,
      titre: texteNu(p.title.rendered),
      resume: texteNu(p.excerpt?.rendered ?? "").slice(0, 300) || undefined,
      type: /^(les-)?auto-ecoles?-/.test(p.slug) ? "guide de ville" : "article",
    }))
}

function slugLibre(voulu: string, pris: Set<string>): string {
  if (!pris.has(voulu)) return voulu
  for (const suffixe of ["-2026", "-comparatif", "-guide"]) {
    if (!pris.has(voulu + suffixe)) return voulu + suffixe
  }
  return `${voulu}-${Date.now()}`
}

export async function GET(req: Request) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  // `?dry_run=1` : rédaction et maillage ont lieu, rien n'est déposé ni illustré.
  const dryRun = params.get("dry_run") === "1"
  // `?ville=le-mans` (slug ou nom) : une ville précise, couverte ou non.
  const villeImposee = params.get("ville")?.trim() || undefined
  // `?outremer=1` : les villes d'outre-mer entrent dans la file.
  const outreMer = params.get("outremer") === "1"
  // `?liste=1` : la file telle qu'elle est, sans rien rédiger. `?brief=1` : le
  // dossier de la prochaine ville, sans rien rédiger — pour lire ce que le
  // rédacteur lira.
  const seulementListe = params.get("liste") === "1"
  const seulementBrief = params.get("brief") === "1"

  try {
    // La liste WordPress est ce qui dit quelles villes ont DÉJÀ leur guide.
    // Illisible, elle ne doit pas se taire : toutes les villes paraîtraient
    // libres et la chaîne réécrirait Paris. Ici, contrairement à
    // `redaction-seo`, un échec de lecture arrête tout.
    let posts: WPPost[]
    try {
      posts = await listAllPosts("publish,draft")
    } catch (e) {
      return Response.json(
        { status: "error", step: "lecture_wordpress", error: e instanceof Error ? e.message.slice(0, 200) : "liste WordPress illisible" },
        { status: 502 },
      )
    }
    if (posts.length === 0) {
      return Response.json({ status: "error", step: "lecture_wordpress", error: "WordPress a rendu zéro article : on ne peut pas savoir quelles villes sont couvertes." }, { status: 502 })
    }
    const [villes, categorieId] = await Promise.all([
      listerVilles(),
      findOrCreateCategory(CATEGORIE).catch(() => null as number | null),
    ])
    const empreintes = villesCouvertes(posts, categorieId)
    const file = villes.filter((v) => (outreMer || !v.outreMer) && !estCouverte(v, empreintes))

    if (seulementListe) {
      return Response.json({
        status: "ok",
        villes_eligibles: villes.length,
        couvertes: villes.filter((v) => estCouverte(v, empreintes)).map((v) => `${v.nom} (${v.dept})`),
        file: file.map((v) => `${v.nom} (${v.dept}) : ${v.nb}`),
      })
    }

    let ville: VilleAnnuaire | undefined
    if (villeImposee) {
      const cle = normaliser(villeImposee)
      ville = villes.find((v) => normaliser(v.nom) === cle || v.slug === villeImposee || v.cle.startsWith(`${cle}|`))
      if (!ville) {
        return Response.json({ status: "error", error: `Ville inconnue de l'annuaire ou sous ${MIN_AUTO_ECOLES} fiches : « ${villeImposee} ».` }, { status: 404 })
      }
    } else {
      ville = file[0]
      if (!ville) {
        return Response.json({ status: "ok", publie: false, motif: "file_vide", message: "Toutes les villes éligibles ont leur guide." })
      }
    }

    const dossier = await dossierVille(ville)
    if (dossier.nb < MIN_AUTO_ECOLES) {
      return Response.json({ status: "error", error: `${ville.nom} : ${dossier.nb} fiches, sous le minimum de ${MIN_AUTO_ECOLES}.` }, { status: 409 })
    }
    const brief = consigne(dossier)
    if (seulementBrief) {
      return Response.json({ status: "ok", ville: ville.nom, dept: ville.dept, deja_couverte: estCouverte(ville, empreintes), restantes: file.length, brief })
    }

    // Le hub n'est requis qu'à partir d'ici : la file et le dossier se lisent
    // sans lui, y compris depuis un poste qui n'a pas ses secrets.
    if (!isCromeConfigured()) {
      return Response.json({ status: "error", error: "CROME_INGEST_URL / CROME_INGEST_SECRET absents" }, { status: 500 })
    }
    const titres = posts.map((p) => texteNu(p.title.rendered)).slice(0, 200)
    const { scenes, formats } = await fetchCatalogue()

    const rendu = await requestArticle({
      sujet: `Auto-école ${ville.nom} (${ville.dept}) : comparatif des ${dossier.nb} établissements recensés en 2026`,
      mot_cle: `auto école ${ville.nom.toLowerCase()}`,
      note: brief,
      titres_existants: titres.slice(0, 60),
      longueur: LONGUEUR,
      scenes,
    })
    if (rendu.error || !rendu.article || !rendu.publication) {
      return Response.json({ status: "error", step: "crome_redaction", ville: ville.nom, error: rendu.error ?? rendu.reason }, { status: 502 })
    }
    const article = rendu.article
    const verdict = rendu.publication
    const statut: "publish" | "draft" = verdict.statut_conseille === "publier" ? "publish" : "draft"

    // Maillage du corps par le hub : vers les autres guides de ville d'abord
    // (le type le dit au modèle), et vers les articles de fond du magazine.
    const maillage = await maillerArticle({
      article: { titre: article.titre, contenu: article.corps_html, format: "html" },
      candidats: candidatsMaillage(posts),
    })
    if (maillage.ok && maillage.contenu) article.corps_html = maillage.contenu
    const rapportMaillage = {
      liens: maillage.liens?.length ?? 0,
      cibles: (maillage.liens ?? []).map((l) => l.url),
      ecartes: maillage.ecartes?.length ?? 0,
      motif: maillage.motif ?? maillage.error ?? null,
    }

    const slugsPris = new Set(posts.map((p) => p.slug))
    const slug = slugLibre(`auto-ecoles-${ville.slug}`, slugsPris)
    const contenu = assembler(article, tableau(dossier), rendu.jsonld ?? [])

    if (dryRun) {
      return Response.json({
        status: "ok", dry_run: true, publie: false,
        ville: ville.nom, dept: ville.dept, restantes: file.length,
        titre: article.titre, slug,
        statut_conseille: verdict.statut_conseille, motif: verdict.motif,
        bloquants: verdict.bloquants, mineurs: verdict.mineurs,
        scene: article.scene_visuel || null,
        maillage: rapportMaillage,
        longueur_html: contenu.length, nb_faq: article.faq?.length ?? 0,
        tableau_lignes: Math.min(dossier.nb, TABLEAU_MAX),
        // Le HTML entier : un essai sert à juger l'article, pas seulement à
        // savoir qu'il existe.
        contenu,
      })
    }

    // La couverture, non bloquante — même reprise qu'en `redaction-seo`.
    let imageUrl: string | null = null
    let mediaId: number | undefined
    let imageErreur: string | undefined
    const scene = scenes.some((s) => s.key === article.scene_visuel) ? article.scene_visuel : undefined
    let media = await requestImage({ scene, format: formatArticle(formats), destination: "couverture_article" })
    if (!media.image_url && media.generation_id && media.status !== "error") {
      media = await attendreImage(media.generation_id)
    }
    if (media.image_url) {
      imageUrl = media.image_url
      const extension = media.image_url.toLowerCase().includes(".png") ? "png" : "jpg"
      const id = await uploadMedia(media.image_url, `${slug}.${extension}`)
      if (id) mediaId = id
      else imageErreur = "médiathèque WordPress : téléversement refusé"
    } else {
      imageErreur = media.error ?? media.reason ?? `studio : ${media.status ?? "sans réponse"}`
    }

    const depose = await createPost({
      title: article.titre,
      slug,
      content: contenu,
      excerpt: article.meta_description,
      status: statut,
      ...(categorieId ? { categories: [categorieId] } : {}),
      ...(mediaId ? { featured_media: mediaId } : {}),
    })

    return Response.json({
      status: "ok",
      publie: statut === "publish",
      ville: ville.nom, dept: ville.dept,
      etablissements: dossier.nb,
      restantes: Math.max(file.length - 1, 0),
      wp_id: depose.id, url: depose.link, titre: article.titre,
      statut_conseille: verdict.statut_conseille, motif: verdict.motif,
      bloquants: verdict.bloquants, mineurs: verdict.mineurs,
      scene: article.scene_visuel || null,
      maillage: rapportMaillage,
      jsonld_conserve: (depose.content?.rendered ?? "").includes("application/ld+json"),
      image_url: imageUrl,
      image_error: mediaId ? undefined : imageErreur,
      alerte_relecture: statut === "publish" ? "sans objet (article publié)" : rendu.alerte?.envoyee ? "Telegram, envoyée par le hub" : `NON ENVOYÉE — ${rendu.alerte?.erreur ?? "le hub n'a pas alerté"}`,
    })
  } catch (err) {
    console.error("[cron/guide-ville]", err instanceof Error ? err.message : err)
    return Response.json({ status: "error", error: err instanceof Error ? err.message : "Erreur guide de ville" }, { status: 500 })
  }
}
