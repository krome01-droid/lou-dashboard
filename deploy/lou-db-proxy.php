<?php
/**
 * LOU Dashboard — MySQL Proxy via WP REST API
 *
 * Ce fichier se place dans wp-content/mu-plugins/ sur o2switch.
 * Il enregistre un endpoint WP REST API sécurisé accessible via :
 *   POST https://autoecolemagazine.fr/wp-json/lou/v1/db
 *
 * Auth : header  X-Lou-Secret: <token>
 */

if (!defined('ABSPATH')) exit;

add_action('rest_api_init', function () {
    register_rest_route('lou/v1', '/db', [
        'methods'             => ['POST', 'OPTIONS'],
        'callback'            => 'lou_db_proxy_handler',
        'permission_callback' => '__return_true', // Auth gérée dans le callback
    ]);
});

function lou_db_proxy_handler(WP_REST_Request $request): WP_REST_Response|WP_Error {
    $expected_secret = '48ff093220fd94b5bc2603ac517f2c29fe1e3aaccd275d44';
    $provided_secret = $request->get_header('X-Lou-Secret');

    if ($provided_secret !== $expected_secret) {
        return new WP_Error('unauthorized', 'Unauthorized', ['status' => 401]);
    }

    global $wpdb;

    $input = $request->get_json_params();
    if (!$input || !isset($input['action'])) {
        return new WP_Error('bad_request', 'Missing action', ['status' => 400]);
    }

    $action = $input['action'];

    switch ($action) {

        // ------------------------------------------------------------------
        case 'ping':
            return rest_ensure_response([
                'success' => true,
                'message' => 'pong',
                'prefix'  => $wpdb->prefix,
            ]);

        // ------------------------------------------------------------------
        case 'migrate':
            $tables_created = [];
            $prefix = $wpdb->prefix;

            $sqls = [
                "CREATE TABLE IF NOT EXISTS {$prefix}lou_content_log (
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

                "CREATE TABLE IF NOT EXISTS {$prefix}lou_social_posts (
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

                "CREATE TABLE IF NOT EXISTS {$prefix}lou_seo_reports (
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

                "CREATE TABLE IF NOT EXISTS {$prefix}lou_editorial_calendar (
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

                "CREATE TABLE IF NOT EXISTS {$prefix}lou_conversations (
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

            return rest_ensure_response(['success' => true, 'results' => $tables_created]);

        // ------------------------------------------------------------------
        case 'query':
            $sql    = $input['sql']    ?? '';
            $params = $input['params'] ?? [];

            // Whitelist des types de requêtes autorisés
            $allowed_prefixes = [
                'SELECT',
                'INSERT',
                'UPDATE',
                'DELETE',
                'CREATE TABLE IF NOT EXISTS',
                'SHOW TABLES',
            ];

            $sql_upper = strtoupper(trim($sql));
            $allowed   = false;

            foreach ($allowed_prefixes as $prefix) {
                if (strpos($sql_upper, $prefix) === 0) {
                    $allowed = true;
                    break;
                }
            }

            if (!$allowed) {
                return new WP_Error('forbidden', 'Query type not allowed', ['status' => 403]);
            }

            $prepared = !empty($params)
                ? $wpdb->prepare($sql, $params)
                : $sql;

            if (strpos($sql_upper, 'SELECT') === 0 || strpos($sql_upper, 'SHOW') === 0) {
                $rows = $wpdb->get_results($prepared, ARRAY_A);
                if ($wpdb->last_error) {
                    return new WP_Error('db_error', $wpdb->last_error, ['status' => 500]);
                }
                return rest_ensure_response(['success' => true, 'rows' => $rows ?? []]);
            }

            $wpdb->query($prepared);

            if ($wpdb->last_error) {
                return new WP_Error('db_error', $wpdb->last_error, ['status' => 500]);
            }

            return rest_ensure_response([
                'success'       => true,
                'affected_rows' => $wpdb->rows_affected,
                'insert_id'     => $wpdb->insert_id,
            ]);

        // ------------------------------------------------------------------
        default:
            return new WP_Error('bad_request', "Unknown action: $action", ['status' => 400]);
    }
}
