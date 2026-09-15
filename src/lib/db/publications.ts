import { execute, query } from "@/lib/db/connection"

// ─────────────────────── Publications sociales : mémoire ───────────────────────
//
// Ce que LOU a déjà promu, et avec quel visuel. C'est la seule chose qui
// permette à `social-auto` de tourner entre ses registres au lieu de reprendre
// le même sujet : la déduplication du hub compare le TEXTE exact, or le modèle
// reformule à chaque passage.
//
// Transposé le 16/09/2026 de `maya_publications` (MAYA, commit 830cdaf). Chez
// LOU la garde par article existait déjà — `wp_lou_social_posts` relue sur 30
// jours — et aucune répétition n'a été mesurée. Le défaut était le SILENCE :
// un seul registre, donc rien du 28/08 au 09/09 quand la rédaction s'est tue.
// Le magazine a pourtant un second registre que ses lecteurs cherchent : les
// guides des auto-écoles d'une ville (« auto-ecoles-le-mans »), choisis par
// Armel le 12/09/2026 — l'annuaire d'auto-écoles tierces est écarté.
//
// LOU n'a pas de Supabase : sa base est le MySQL de WordPress, atteint par le
// proxy PHP de `lib/db/connection`. La table est `wp_lou_publications`.

export type AnglePost = "article" | "ville"

export interface Publication {
  angle: AnglePost
  /** Slug WordPress de l'article ou du guide. */
  sujet: string
  titre: string | null
  scene: string | null
  lumiere: string | null
  style: string | null
  lieu: string | null
  cree_le: string
}

/** Les dernières publications, de la plus récente à la plus ancienne. */
export async function getPublicationsRecentes(limit = 40): Promise<Publication[]> {
  try {
    return await query<Publication>(
      `SELECT angle, sujet, titre, scene, lumiere, style, lieu, cree_le
       FROM wp_lou_publications ORDER BY cree_le DESC LIMIT ${Math.max(1, Math.floor(limit))}`,
    )
  } catch (e) {
    // Une mémoire illisible ne doit pas empêcher de publier : on repart d'une
    // ardoise vierge, ce qui donne un post banal, là où lever ferait taire LOU.
    console.error("[wp_lou_publications] lecture:", e instanceof Error ? e.message : e)
    return []
  }
}

/**
 * Consigne un sujet comme consommé.
 *
 * Appelée dès que le post est SOUMIS, pas seulement s'il est publié : refusé
 * pour quota ou mis en file de validation, le sujet a quand même servi, et le
 * reproposer au passage suivant recréerait exactement la répétition qu'on
 * cherche à éviter.
 */
export async function enregistrerPublication(p: {
  angle: AnglePost
  sujet: string
  titre?: string | null
  lien?: string | null
  scene?: string | null
  lumiere?: string | null
  style?: string | null
  lieu?: string | null
  post_id?: string | null
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO wp_lou_publications (angle, sujet, titre, lien, scene, lumiere, style, lieu, post_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.angle,
        p.sujet,
        p.titre ?? null,
        p.lien ?? null,
        p.scene ?? null,
        p.lumiere ?? null,
        p.style ?? null,
        p.lieu ?? null,
        p.post_id ?? null,
      ],
    )
  } catch (e) {
    // Un échec d'écriture se voit dans les journaux et NE remonte pas : le post
    // est déjà parti, lever ici ferait rapporter une erreur pour une
    // publication réussie. Le message nomme la table, pour qu'une table
    // absente se voie.
    console.error("[wp_lou_publications] écriture:", e instanceof Error ? e.message : e)
  }
}
