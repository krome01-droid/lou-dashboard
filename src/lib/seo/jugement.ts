import Anthropic from "@anthropic-ai/sdk"
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema"

// Une idée d'article est-elle déjà traitée par le site ?
//
// Question d'INTENTION, pas de vocabulaire. « Lyon repousse l'interdiction des
// Crit'Air 3 » et « Crit'Air 3 en ZFE : comment vérifier le calendrier
// applicable » n'ont presque aucun mot en commun ; c'est pourtant le même
// lecteur, avec la même question. Mesuré le 13/11/2026 sur l'historique : un
// score par mots entre un titre de presse et un article se trompe dans les deux
// sens (à 0,60, 16 doublons sur 26 vus, et 6 sujets distincts pris pour des
// doublons). Seul un lecteur départage, d'où ce jugement par le modèle.
//
// Un seul appel par passage, pour TOUTES les idées candidates à la fois : la
// rédaction prend déjà 5 à 6 minutes sur les 10 que laisse `call-cron.sh`.
//
// Sans réponse exploitable (clé absente, solde épuisé, refus, délai), le
// jugement rend une erreur et l'appelant ne retient rien : l'idée passe, et le
// filet par mots de `doublons.ts` reste en place après la rédaction.

const MODELE = "claude-opus-5-5"

export interface IdeeAJuger {
  titre: string
  angle: string
}

export interface ArticleDuCatalogue {
  slug: string
  titre: string
}

export interface Decision {
  /** Le slug de l'article qui traite déjà ce sujet, ou null. */
  couvertPar: string | null
  raison: string
}

export type Jugement =
  | { ok: true; decisions: Decision[]; modele: string }
  | { ok: false; erreur: string }

const FORMAT = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          idee: { type: "integer", description: "Le numéro de l'idée, tel que listé." },
          couvert_par: {
            type: "string",
            description:
              "Le slug EXACT de l'article existant qui traite déjà ce sujet, tel qu'il figure dans le catalogue. Chaîne vide si aucun.",
          },
          raison: { type: "string", description: "Une phrase : pourquoi." },
        },
        required: ["idee", "couvert_par", "raison"],
        additionalProperties: false,
      },
    },
  },
  required: ["decisions"],
  additionalProperties: false,
})

const SYSTEME = [
  "Tu es le secrétaire de rédaction d'Auto-école Magazine (autoecolemagazine.fr), un média sur le permis de conduire, la sécurité routière et la mobilité.",
  "Tu décides, pour chaque idée d'article, si un article DÉJÀ publié sur le site répond à la même intention de recherche.",
  "",
  "Même intention : le lecteur qui cherche ce que traite l'article existant serait servi par le nouvel article, et inversement — même question, même lecteur. La formulation des titres ne compte pas.",
  "Une actualité sur un sujet déjà traité — une échéance reportée, un vote, une ville de plus qui applique la règle, un chiffre nouveau — n'ouvre PAS une intention nouvelle : elle se fond dans l'article existant, qui sera réécrit pour l'intégrer.",
  "Une intention n'est distincte que si l'idée porte ENTIÈREMENT sur un cas que l'article existant ne traite pas et qu'un lecteur chercherait comme tel : une ville précise, un public précis, un type de véhicule précis.",
  "Quand plusieurs articles couvrent l'idée, désigne celui qui y répond le plus complètement.",
  "Dans le doute, tiens l'idée pour couverte : un article réécrit coûte moins au site qu'un second article qui lui fait concurrence.",
].join("\n")

export async function jugerCouverture(
  idees: IdeeAJuger[],
  catalogue: ArticleDuCatalogue[],
): Promise<Jugement> {
  if (idees.length === 0) return { ok: true, decisions: [], modele: MODELE }
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, erreur: "ANTHROPIC_API_KEY absente" }

  const slugs = new Set(catalogue.map((a) => a.slug))
  const demande = [
    `CATALOGUE — les ${catalogue.length} articles du site (slug — titre) :`,
    ...catalogue.map((a) => `${a.slug} — ${a.titre}`),
    "",
    `IDÉES À JUGER (${idees.length}) :`,
    ...idees.map((i, n) => `${n + 1}. ${i.titre}\n   Angle : ${i.angle}`),
    "",
    "Rends une décision pour chaque idée, numérotée comme ci-dessus.",
  ].join("\n")

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 })
    const reponse = await client.messages.parse(
      {
        model: MODELE,
        max_tokens: 8000,
        // Un tri, pas une rédaction : l'effort bas suffit et tient le délai.
        output_config: { effort: "low", format: FORMAT },
        system: SYSTEME,
        messages: [{ role: "user", content: demande }],
      },
      { timeout: 120_000 },
    )
    if (reponse.stop_reason === "refusal") return { ok: false, erreur: "refus du modèle" }
    if (reponse.stop_reason === "max_tokens") return { ok: false, erreur: "réponse tronquée (max_tokens)" }
    const rendu = reponse.parsed_output
    if (!rendu) return { ok: false, erreur: "réponse illisible" }

    const decisions: Decision[] = idees.map(() => ({ couvertPar: null, raison: "sans décision du modèle" }))
    for (const d of rendu.decisions) {
      const i = d.idee - 1
      if (i < 0 || i >= idees.length) continue
      const slug = d.couvert_par.trim()
      decisions[i] =
        slug && !slugs.has(slug)
          ? // Un slug inventé ne désigne rien qu'on puisse réécrire : on le dit, et
            // l'idée passe — le filet par mots jugera l'article rédigé.
            { couvertPar: null, raison: `slug inconnu rendu par le modèle (« ${slug} ») — ${d.raison}` }
          : { couvertPar: slug || null, raison: d.raison }
    }
    return { ok: true, decisions, modele: MODELE }
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message.slice(0, 200) : "injoignable" }
  }
}
