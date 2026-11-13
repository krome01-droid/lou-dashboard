-- Le registre des articles que LOU a rédigés : le mot-clé visé, et chaque
-- réécriture.
--
-- Créé le 13/11/2026, sur le modèle de `blog_articles.mot_cle` chez STAN
-- (stan-dashboard, migration 0003). WordPress ne garde que le titre et le slug,
-- tous deux écrits par le modèle et reformulés à chaque passage ; la seule trace
-- qui ne dépende pas de la formulation est le mot-clé visé au moment d'écrire.
-- Le hub le connaît (`orchestrator_actions.detail.mot_cle`), LOU l'oubliait.
--
-- C'est un JOURNAL, en ajout seul : une ligne par création, une ligne par
-- réécriture. La dernière ligne d'un slug donne son mot-clé courant et la date
-- de sa dernière réécriture — d'où le délai de carence, qui empêche de réécrire
-- le même article à chaque actualité de son sujet. La date `modified` de
-- WordPress ne peut pas servir : le maillage interne la touche tous les jours.
--
-- La table se crée d'elle-même au premier passage (`lib/seo/registre.ts`, par
-- le proxy PHP de `lib/db/connection`, qui admet `CREATE TABLE IF NOT EXISTS`).
-- Ce fichier est la référence versionnée : le schéma écrit dans le code doit
-- rester identique à celui-ci.
--
-- Il part VIDE : les articles d'avant le 13/11/2026 n'y figurent pas, et la
-- garde les reconnaît par leur titre, leur slug et leur contenu. Leurs mots-clés
-- pourraient être repris de `orchestrator_actions` du hub (projet
-- lrutxrgpgmayqjepqoed, `detail->>'mot_cle'` des actions `rediger_article` de
-- l'agent `lou`) ; ce rattrapage n'est pas fait ici.

CREATE TABLE IF NOT EXISTS wp_lou_articles (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  wp_id bigint(20) unsigned NOT NULL,
  slug varchar(200) NOT NULL,
  -- `creation` : un nouvel article. `reecriture` : le contenu d'un article
  -- existant remplacé, à URL constante.
  action enum('creation', 'reecriture') NOT NULL,
  -- Le mot-clé principal rendu par le hub (`mot_cle_principal`).
  mot_cle varchar(300) DEFAULT NULL,
  titre text DEFAULT NULL,
  -- D'où venait l'angle : veille, search-console, parametre, moteur.
  source varchar(40) DEFAULT NULL,
  veille_id bigint(20) unsigned DEFAULT NULL,
  cree_le datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_lou_articles_slug (slug, cree_le),
  KEY idx_lou_articles_cree_le (cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
