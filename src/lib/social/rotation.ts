/**
 * Choisir de quoi parler, et à quoi ça ressemblera.
 *
 * ── D'où ça vient ────────────────────────────────────────────────────────────
 * Transposé le 16/09/2026 de `lib/social/rotation.ts` de MAYA (commit 830cdaf),
 * écrit après que MAYA eut relayé quatre fois le même article. LOU, elle, ne
 * se répétait pas : `wp_lou_social_posts` lui servait de garde par article
 * sur 30 jours. Mais elle n'avait qu'un registre, les articles — donc le
 * silence dès que la rédaction s'arrêtait : rien du 28/08 au 09/09/2026.
 *
 * ── Le principe ──────────────────────────────────────────────────────────────
 * Deux registres : les articles éditoriaux et les guides des auto-écoles d'une
 * ville (« auto-ecoles-le-mans »), qui sont ce que les lecteurs du magazine
 * cherchent et ce qui lui rapporte du trafic. La rotation tient la part de
 * chacun sur une fenêtre glissante et sert celui qui est le plus en retard,
 * puis, dans ce registre, le sujet le moins récemment promu.
 *
 * Pas de règle « article frais passe devant », contrairement aux trois autres
 * agents : LOU publie un article PAR JOUR (rédaction à 6 h, veille à 8 h 30)
 * et ne poste que le mercredi et le vendredi. Il y aurait toujours un article
 * de moins de 48 h jamais relayé, et la règle servirait un article à chaque
 * passage — les guides de ville ne partiraient jamais. Le registre article,
 * servi à son tour, prend de toute façon le plus récent jamais relayé.
 *
 * Ce module ne lit rien et n'écrit rien. Il reçoit les candidats et la mémoire,
 * il rend un choix — c'est ce qui le rend vérifiable sans base de données.
 */
import type { AnglePost, Publication } from "@/lib/db/publications"
import type { Axe, Scene } from "@/lib/crome/client"

export interface Candidat {
  angle: AnglePost
  /** Identifiant stable dans son registre : le slug. */
  sujet: string
  titre: string
  lien: string
  /** Les faits transmis au modèle. Rien d'autre ne doit apparaître dans le post. */
  matiere: string
}

/**
 * Part visée par registre, sur une fenêtre glissante.
 *
 * À parts égales : l'article fait la voix du magazine et rapporte du
 * référencement ; le guide de ville est ce qu'un lecteur cherche vraiment, et
 * ce qui amène le trafic. Deux posts par semaine, un de chaque.
 */
const PARTS: Record<AnglePost, number> = {
  article: 0.5,
  ville: 0.5,
}

/**
 * Fenêtre sur laquelle la part est mesurée.
 *
 * Six, et non toute la mémoire : l'historique repris du hub avant correction
 * ne contient que des articles. Mesurée sur toute la mémoire, la part de
 * l'article mettrait des semaines à redescendre. Six, c'est trois semaines de
 * publication à deux posts par semaine (mercredi et vendredi, 9 h).
 */
const FENETRE = 6

function derniereUtilisation(historique: Publication[], angle: AnglePost, sujet: string): number {
  const i = historique.findIndex((h) => h.angle === angle && h.sujet === sujet)
  // Absent de la mémoire : jamais promu, donc prioritaire.
  return i === -1 ? Number.POSITIVE_INFINITY : i
}

/** Le registre à servir : celui qui est le plus en retard sur sa part. */
function choisirAngle(disponibles: Set<AnglePost>, historique: Publication[]): AnglePost | null {
  const fenetre = historique.slice(0, FENETRE)
  const total = fenetre.length || 1

  let meilleur: AnglePost | null = null
  let meilleurEcart = Number.NEGATIVE_INFINITY
  let meilleureAnciennete = -1

  for (const [angle, part] of Object.entries(PARTS) as [AnglePost, number][]) {
    if (!disponibles.has(angle)) continue
    const observee = fenetre.filter((h) => h.angle === angle).length / total
    const ecart = part - observee
    // À égalité d'écart, le registre resté le plus longtemps muet. Sans ce
    // départage, deux registres à zéro se disputeraient indéfiniment le tour et
    // l'ordre des clés de `PARTS` déciderait à leur place.
    const anciennete = historique.findIndex((h) => h.angle === angle)
    const depuis = anciennete === -1 ? Number.POSITIVE_INFINITY : anciennete

    if (ecart > meilleurEcart || (ecart === meilleurEcart && depuis > meilleureAnciennete)) {
      meilleur = angle
      meilleurEcart = ecart
      meilleureAnciennete = depuis
    }
  }
  return meilleur
}

/**
 * Le sujet du prochain post.
 *
 * Rend `null` quand aucun candidat n'est fourni — la tâche ne publie alors
 * rien, ce qui reste préférable à un post « de marque » écrit sans matière.
 */
export function choisirSujet(candidats: Candidat[], historique: Publication[]): Candidat | null {
  if (!candidats.length) return null

  // 1. Le registre le plus en retard sur sa part…
  const disponibles = new Set(candidats.map((c) => c.angle))
  const angle = choisirAngle(disponibles, historique) ?? candidats[0].angle

  // …et dans ce registre, le sujet le moins récemment promu. `sort` est stable
  // en JavaScript : à égalité — deux sujets jamais promus — l'ordre d'arrivée
  // décide, et c'est l'appelant qui le fixe : du plus récent au plus ancien
  // dans les deux registres.
  return (
    [...candidats]
      .filter((c) => c.angle === angle)
      .sort(
        (a, b) =>
          derniereUtilisation(historique, angle, b.sujet) -
          derniereUtilisation(historique, angle, a.sujet),
      )[0] ?? candidats[0]
  )
}

// ─────────────────────────────── Le visuel ───────────────────────────────────

export interface Visuel {
  scene?: string
  light?: string
  style?: string
  place?: string
}

/**
 * Ce que le modèle ne doit PAS reprendre, formulé pour un prompt.
 *
 * LOU fixait la scène et laissait les trois autres axes au studio, qui
 * appliquait le réglage par défaut de la marque : toutes ses images sortaient
 * avec la même lumière, le même style et le même décor.
 */
export function combinaisonsRecentes(historique: Publication[], combien = 4): string {
  const recentes = historique.slice(0, combien).filter((h) => h.scene)
  if (!recentes.length) return ""
  return recentes
    .map(
      (h, i) =>
        `${i === 0 ? "le dernier" : `il y a ${i + 1} posts`} : scène ${h.scene}` +
        (h.lumiere ? `, lumière ${h.lumiere}` : "") +
        (h.style ? `, style ${h.style}` : "") +
        (h.lieu ? `, lieu ${h.lieu}` : ""),
    )
    .join("\n")
}

/**
 * Retient du visuel proposé par le modèle ce qui existe vraiment au catalogue.
 *
 * Une clé inventée fait échouer la génération entière côté studio. Un axe
 * écarté n'est PAS remplacé par une valeur par défaut : laissé vide, le studio
 * le tire au sort, ce qui vaut mieux qu'un réglage figé.
 */
export function visuelValide(
  propose: { scene?: string; lumiere?: string; style?: string; lieu?: string } | null,
  catalogue: { scenes: Scene[]; lights: Axe[]; styles: Axe[]; places: Axe[] },
): Visuel {
  const scene = catalogue.scenes.find((s) => s.key === propose?.scene)
  const light = catalogue.lights.find((l) => l.key === propose?.lumiere)
  const style = catalogue.styles.find((s) => s.key === propose?.style)

  // Le lieu est préfixé au décor de la scène : un lieu que la scène n'accepte
  // pas produit une image qui se contredit — une salle de code sur une rocade.
  const lieuCompatible =
    propose?.lieu != null &&
    catalogue.places.some((p) => p.key === propose.lieu) &&
    (!scene?.places || scene.places.includes(propose.lieu))

  return {
    scene: scene?.key,
    light: light?.key,
    style: style?.key,
    place: lieuCompatible ? propose!.lieu : undefined,
  }
}

/** Le menu d'un axe, tel qu'on le pose dans un prompt. */
export function menu(axes: Axe[]): string {
  return axes.map((a) => `- ${a.key} : ${a.label}`).join("\n")
}
