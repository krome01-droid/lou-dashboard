<?php
/**
 * LOU Dashboard — MySQL Proxy pour Vercel
 *
 * Ce fichier se place dans wp-content/mu-plugins/ sur o2switch.
 * Il permet au dashboard LOU (Vercel) d'executer des requetes MySQL
 * sur la base WordPress, securise par un token secret.
 *
 * Endpoint: POST https://autoecolemagazine.fr/wp-content/mu-plugins/lou-db-proxy.php
 */

// Bloquer l'accès direct sans token
header('Content-Type: application/json; charset=utf-8');

// CORS pour Vercel
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://com.autoecolemagazine.fr', 'https://ae.autoecolemagazine.fr', 'http://localhost:3000'];
if (in_array($origin, $allowed)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Verifier le token secret
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$expected_token = '48ff093220fd94b5bc2603ac517f2c29fe1e3aaccd275d44';

if ($auth !== "Bearer $expected_token") {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Lire le corps de la requete
$input = json_decode(file_get_contents('php://input'), true);

if (!$input || !isset($input['action'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing action']);
    exit;
}

// Charger WordPress pour $wpdb
$wp_load = dirname(__FILE__) . '/../../wp-load.php';
if (!file_exists($wp_load)) {
    $wp_load = dirname(__FILE__) . '/../../../wp-load.php';
}
if (file_exists($wp_load)) {
    require_once $wp_load;
} else {
    http_response_code(500);
    echo json_encode(['error' => 'wp-load.php not found']);
    exit;
}

global $wpdb;

$action = $input['action'];

try {
    switch ($action) {
        case 'query':
            // SELECT queries
            $sql = $input['sql'] ?? '';
            $params = $input['params'] ?? [];

            // Security: only allow SELECT, INSERT, UPDATE, CREATE TABLE
            $allowed_prefixes = ['SELECT', 'INSERT', 'UPDATE', 'CREATE TABLE IF NOT EXISTS', 'SHOW TABLES'];
            $sql_upper = strtoupper(trim($sql));
            $allowed = false;
            foreach ($allowed_prefixes as $prefix) {
                if (strpos($sql_upper, $prefix) === 0) {
                    $allowed = true;
                    break;
                }
            }

            if (!$allowed) {
                http_response_code(403);
                echo json_encode(['error' => 'Query type not allowed']);
                exit;
            }

            if (!empty($params)) {
                $prepared = $wpdb->prepare($sql, $params);
            } else {
                $prepared = $sql;
            }

            if (strpos($sql_upper, 'SELECT') === 0 || strpos($sql_upper, 'SHOW') === 0) {
                $results = $wpdb->get_results($prepared, ARRAY_A);
                echo json_encode(['success' => true, 'rows' => $results]);
            } else {
                $wpdb->query($prepared);
                echo json_encode([
                    'success' => true,
                    'affected_rows' => $wpdb->rows_affected,
                    'insert_id' => $wpdb->insert_id,
                ]);
            }
            break;

        case 'migrate':
            // Run LOU table migrations
            $tables_created = [];

            $sqls = [
                "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lou_content_log (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(500) NOT NULL,
                    type ENUM('article','social','newsletter','email') DEFAULT 'article',
                    status ENUM('draft','review','published','scheduled','failed') DEFAULT 'draft',
                    wp_post_id BIGINT UNSIGNED DEFAULT NULL,
                    wp_url VARCHAR(500) DEFAULT NULL,
                    ghl_message_id VARCHAR(100) DEFAULT NULL,
                    content_markdown LONGTEXT DEFAULT NULL,
                    meta_json JSON DEFAULT NULL,
                    created_by VARCHAR(100) DEFAULT 'lou',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_type (type),
                    KEY idx_status (status),
                    KEY idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lou_social_posts (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    content_log_id BIGINT UNSIGNED DEFAULT NULL,
                    platform ENUM('facebook','instagram','linkedin','google_business') NOT NULL,
                    ghl_post_id VARCHAR(100) DEFAULT NULL,
                    scheduled_at DATETIME DEFAULT NULL,
                    published_at DATETIME DEFAULT NULL,
                    status ENUM('draft','scheduled','published','failed') DEFAULT 'draft',
                    caption TEXT DEFAULT NULL,
                    media_urls JSON DEFAULT NULL,
                    engagement_json JSON DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_platform (platform),
                    KEY idx_status (status),
                    KEY idx_scheduled_at (scheduled_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lou_seo_reports (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    report_type ENUM('weekly','monthly','audit','geo') DEFAULT 'weekly',
                    period_start DATE DEFAULT NULL,
                    period_end DATE DEFAULT NULL,
                    data_json JSON NOT NULL,
                    summary TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    KEY idx_report_type (report_type),
                    KEY idx_period (period_start, period_end)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lou_editorial_calendar (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(500) NOT NULL,
                    content_type ENUM('article','newsletter','social_campaign','email_sequence') DEFAULT 'article',
                    planned_date DATE NOT NULL,
                    status ENUM('idea','planned','in_progress','review','published','cancelled') DEFAULT 'planned',
                    assigned_to VARCHAR(100) DEFAULT 'lou',
                    content_log_id BIGINT UNSIGNED DEFAULT NULL,
                    tags JSON DEFAULT NULL,
                    notes TEXT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    KEY idx_planned_date (planned_date),
                    KEY idx_status (status),
                    KEY idx_content_type (content_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

                "CREATE TABLE IF NOT EXISTS {$wpdb->prefix}lou_conversations (
                    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) DEFAULT NULL,
                    messages_json LONGTEXT NOT NULL,
                    context_json JSON DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
            ];

            foreach ($sqls as $sql) {
                preg_match('/CREATE TABLE IF NOT EXISTS (\S+)/', $sql, $matches);
                $table_name = $matches[1] ?? 'unknown';

                $result = $wpdb->query($sql);
                if ($result === false) {
                    $tables_created[] = "ERREUR: $table_name — " . $wpdb->last_error;
                } else {
                    $tables_created[] = "OK: $table_name";
                }
            }

            echo json_encode(['success' => true, 'results' => $tables_created]);
            break;

        case 'ping':
            echo json_encode(['success' => true, 'message' => 'pong', 'prefix' => $wpdb->prefix]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: $action"]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
