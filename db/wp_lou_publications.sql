-- La mémoire de ce que LOU a déjà promu.
--
-- Transposée le 16/09/2026 de `maya_publications` (MAYA, commit 830cdaf), qui
-- corrigeait une répétition. LOU, elle, ne se répétait pas — `wp_lou_social_posts`
-- lui servait de garde par article sur 30 jours — mais elle n'avait qu'un
-- registre, les articles, donc le silence dès que la rédaction s'arrêtait :
-- rien du 28/08 au 09/09/2026. `social-auto` fait maintenant tourner deux
-- registres, les articles et les guides des auto-écoles d'une ville. Sans trace
-- de ce qui est déjà parti, aucune rotation n'est possible : c'est cette table.
--
-- Elle sert aussi au visuel : scène, lumière, style et lieu retenus y sont
-- consignés pour que le passage suivant puisse les écarter.
--
-- On n'y consigne QUE ce qui a été soumis au hub, pas ce que le hub en a fait :
-- refusé pour quota ou mis en file de validation, le sujet a quand même été
-- consommé, et le reproposer au passage suivant recréerait la répétition.
--
-- LOU n'a pas de Supabase : c'est le MariaDB de WordPress (o2switch), atteint
-- par le proxy PHP de `lib/db/connection`. Appliquée le 16/09/2026 par ce
-- proxy ; ce fichier est la référence versionnée.

CREATE TABLE IF NOT EXISTS wp_lou_publications (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  -- Le registre dont le sujet a été tiré. Contraint pour qu'un registre ajouté
  -- au code sans être ajouté ici échoue bruyamment plutôt que de fausser la
  -- rotation en silence.
  angle enum('article', 'ville') NOT NULL,
  -- Identifiant stable du sujet : le slug WordPress.
  sujet varchar(200) NOT NULL,
  titre text DEFAULT NULL,
  lien varchar(500) DEFAULT NULL,
  -- Les quatre axes du visuel, tels que retenus au moment de la demande.
  scene varchar(100) DEFAULT NULL,
  lumiere varchar(100) DEFAULT NULL,
  style varchar(100) DEFAULT NULL,
  lieu varchar(100) DEFAULT NULL,
  -- L'identifiant rendu par le hub. Nul si la soumission a échoué.
  post_id varchar(100) DEFAULT NULL,
  cree_le datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (id),
  KEY idx_lou_publications_cree_le (cree_le),
  -- Pour « quand ce sujet est-il parti pour la dernière fois ? », la question
  -- que pose la rotation à chaque passage.
  KEY idx_lou_publications_sujet (angle, sujet, cree_le)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── Amorçage ─────────────────────────────────────────────────────────────────
--
-- L'historique reconstitué depuis `agent_social_posts` du hub CROME OS
-- (projet lrutxrgpgmayqjepqoed), relevé le 16/09/2026 : les 17 soumissions
-- portant un lien depuis le 08/08, refusées comprises. Huit sont déjà des
-- guides de ville — l'ancien registre unique les prenait comme des articles
-- récents. À n'exécuter qu'une fois, sur une table vide.
INSERT INTO wp_lou_publications (angle, sujet, titre, lien, post_id, cree_le) VALUES
  ('article', 'auto-cole-en-ligne-ou-traditionnelle-laquelle-c', 'Auto-école en ligne ou traditionnelle : laquelle choisir en 2026 ?', 'https://autoecolemagazine.fr/auto-cole-en-ligne-ou-traditionnelle-laquelle-c/', 'c6d9f875-109e-4525-8991-a702ed00bb5c', '2026-08-08 00:22:19'),
  ('article', 'permis-de-conduire-et-handicap', 'Permis de conduire et handicap', 'https://autoecolemagazine.fr/permis-de-conduire-et-handicap/', '83b7bc24-5e63-4c24-96e0-179e8c9be524', '2026-08-08 00:22:59'),
  ('ville', 'auto-coles-strasbourg-tarifs-taux-de-russit', 'Auto-écoles à Strasbourg : tarifs, taux de réussite et meilleures adresses en 2026', 'https://autoecolemagazine.fr/auto-coles-strasbourg-tarifs-taux-de-russit/', 'e91710a4-6d56-4c18-98a4-ec7087e5c9e0', '2026-08-08 00:23:38'),
  ('ville', 'auto-coles-toulouse-tarifs-taux-de-russite', 'Auto-écoles à Toulouse : tarifs, taux de réussite et meilleurs établissements en 2026', 'https://autoecolemagazine.fr/auto-coles-toulouse-tarifs-taux-de-russite/', 'ca80ab7e-43a9-410a-ae67-8f8cbea58966', '2026-08-08 00:24:19'),
  ('article', 'comparaison-auto-ecole', 'Comparatif auto-écoles 2026 : comment choisir la meilleure auto-école ?', 'https://autoecolemagazine.fr/comparaison-auto-ecole/', 'e7b17858-d090-47a5-9a90-7b537e42d654', '2026-08-08 00:24:59'),
  ('ville', 'auto-ecoles-le-mans', 'Auto-école Le Mans (72) — Comparatif 32 établissements 2026', 'https://autoecolemagazine.fr/auto-ecoles-le-mans/', '3af32eb4-423c-4ece-a1ed-ae218f73d01d', '2026-08-08 00:25:41'),
  ('article', 'auto-cole-en-ligne-ou-traditionnelle-laquelle-c', 'Auto-école en ligne ou traditionnelle : laquelle choisir en 2026 ?', 'https://autoecolemagazine.fr/auto-cole-en-ligne-ou-traditionnelle-laquelle-c/', 'f35aeca4-f930-470a-9ee1-98635fe2b76d', '2026-08-08 06:47:20'),
  ('article', 'auto-cole-en-ligne-ou-traditionnelle-laquelle-c', 'Auto-école en ligne ou traditionnelle : laquelle choisir en 2026 ?', 'https://autoecolemagazine.fr/auto-cole-en-ligne-ou-traditionnelle-laquelle-c/', 'dc4c2c66-d9c1-4fa9-b7a6-f54c0e393282', '2026-08-10 07:00:21'),
  ('article', 'permis-de-conduire-et-handicap', 'Permis de conduire et handicap', 'https://autoecolemagazine.fr/permis-de-conduire-et-handicap/', 'fc1d28e0-0e38-499e-b0a2-0d8322a07954', '2026-08-11 06:59:19'),
  ('ville', 'auto-coles-strasbourg-tarifs-taux-de-russit', 'Auto-écoles à Strasbourg : tarifs, taux de réussite et meilleures adresses en 2026', 'https://autoecolemagazine.fr/auto-coles-strasbourg-tarifs-taux-de-russit/', 'd01f4230-7e16-4813-b18d-56b304d54bc0', '2026-08-12 07:00:22'),
  ('ville', 'auto-coles-toulouse-tarifs-taux-de-russite', 'Auto-écoles à Toulouse : tarifs, taux de réussite et meilleurs établissements en 2026', 'https://autoecolemagazine.fr/auto-coles-toulouse-tarifs-taux-de-russite/', '79cbd774-478a-433e-8a8b-4182f217cfc5', '2026-08-14 07:00:19'),
  ('article', 'comparaison-auto-ecole', 'Comparatif auto-écoles 2026 : comment choisir la meilleure auto-école ?', 'https://autoecolemagazine.fr/comparaison-auto-ecole/', '7b7a50d8-43da-47d9-b451-869aa60db024', '2026-08-17 07:00:19'),
  ('ville', 'auto-ecoles-le-mans', 'Auto-école Le Mans (72) — Comparatif 32 établissements 2026', 'https://autoecolemagazine.fr/auto-ecoles-le-mans/', 'ab5b5551-db17-486a-9d2c-738018cabb06', '2026-08-19 07:00:20'),
  ('ville', 'auto-ecoles-reims', 'Auto-écoles à Reims (51) — Comparatif 39 établissements 2026', 'https://autoecolemagazine.fr/auto-ecoles-reims/', 'f969f16b-1d8d-4143-b71b-99b7d6afc740', '2026-08-21 07:00:21'),
  ('ville', 'auto-ecoles-angers', 'Auto-écoles à Angers (49) — Comparatif 28 établissements 2026', 'https://autoecolemagazine.fr/auto-ecoles-angers/', '0f9fd05b-671b-47ec-b1a0-d9a37ef18c1c', '2026-08-28 07:00:28'),
  ('article', 'cyclistes-tues-chiffres-officiels-securite-routiere', 'Cyclistes tués : ce que disent vraiment les chiffres officiels', 'https://autoecolemagazine.fr/cyclistes-tues-chiffres-officiels-securite-routiere/', '818f04f0-3d5b-4102-bd67-6f78b3ad602a', '2026-09-09 07:00:19'),
  ('article', 'fermeture-auto-ecole-recours-eleves', 'Fermeture d’une auto-école : quels recours pour les élèves ?', 'https://autoecolemagazine.fr/fermeture-auto-ecole-recours-eleves/', 'f8645796-d89c-4816-97e7-def146237600', '2026-09-11 07:01:13');
