import { execute, query } from "@/lib/db/connection"

// ──────────────────── Registre des articles : la mémoire de LOU ───────────────────
//
// Le mot-clé visé par chaque article, et la date de chaque réécriture. Schéma et
// raisons : `db/wp_lou_articles.sql`.

const SCHEMA = `CREATE TABLE IF NOT EXISTS wp_lou_articles (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  wp_id bigint(20) unsigned NOT NULL,
  slug varchar(200) NOT NULL,
  action enum('creation', 'reecriture') NOT NULL,
  mot_cle varchar(300) DEFAULT NULL,
  titre text DEFAULT NULL,
  source varchar(40) DEFAULT NULL,
  veille_id bigint(20) unsigned DEFAULT NULL,
  cree_le datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_lou_articles_slug (slug, cree_le),
  KEY idx_lou_articles_cree_le (cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`

let pret: Promise<void> | null = null

/** Crée la table au premier usage du processus. Un échec est rejoué au suivant. */
function assurerTable(): Promise<void> {
  pret ??= execute(SCHEMA).then(
    () => undefined,
    (e) => {
      pret = null
      throw e
    },
  )
  return pret
}

export interface EntreeRegistre {
  /** Le mot-clé de la dernière ligne qui en porte un. */
  mot_cle: string | null
  /** La dernière création ou réécriture, au format MySQL (`2026-11-13 08:35:00`). */
  derniere_action: string
}

/**
 * L'état courant de chaque slug. Une base illisible rend une carte VIDE, sans
 * lever : la garde se rabat alors sur les titres, et le journal le dit.
 */
export async function lireRegistre(): Promise<Map<string, EntreeRegistre>> {
  const carte = new Map<string, EntreeRegistre>()
  try {
    await assurerTable()
    const lignes = await query<{ slug: string; mot_cle: string | null; cree_le: string }>(
      `SELECT slug, mot_cle, cree_le FROM wp_lou_articles ORDER BY cree_le ASC, id ASC`,
    )
    for (const l of lignes) {
      const avant = carte.get(l.slug)
      carte.set(l.slug, {
        mot_cle: l.mot_cle || avant?.mot_cle || null,
        derniere_action: String(l.cree_le),
      })
    }
  } catch (e) {
    console.error("[wp_lou_articles] lecture:", e instanceof Error ? e.message : e)
  }
  return carte
}

/**
 * Consigne une création ou une réécriture. Appelée APRÈS le dépôt réussi.
 * Un échec ne remonte pas — l'article est en ligne — mais il se voit : sans
 * cette ligne, le délai de carence ne joue plus pour cet article.
 */
export async function inscrire(e: {
  wp_id: number
  slug: string
  action: "creation" | "reecriture"
  mot_cle?: string | null
  titre?: string | null
  source?: string | null
  veille_id?: number | null
}): Promise<void> {
  try {
    await assurerTable()
    await execute(
      `INSERT INTO wp_lou_articles (wp_id, slug, action, mot_cle, titre, source, veille_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        e.wp_id,
        e.slug,
        e.action,
        e.mot_cle ?? null,
        e.titre ?? null,
        e.source ?? null,
        e.veille_id ?? null,
      ],
    )
  } catch (err) {
    console.error("[wp_lou_articles] écriture:", err instanceof Error ? err.message : err)
  }
}
