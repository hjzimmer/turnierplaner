<?php
/**
 * Get Upcoming Matches API
 * Holt die naechsten Spiele read-only aus der Node-API.
 */

header('Content-Type: application/json');

$baseUrl = getenv('TURNIERPLANER_INTERNAL_API_BASE_URL');
if (!is_string($baseUrl) || trim($baseUrl) === '') {
    $baseUrl = 'http://localhost:3000';
}

$url = rtrim($baseUrl, '/') . '/api/timer/upcoming-matches?limit=4';
$responseBody = false;
$httpCode = 502;

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 4,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_FAILONERROR => false,
    ]);
    $responseBody = curl_exec($ch);
    $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 4,
            'ignore_errors' => true,
        ],
    ]);
    $responseBody = @file_get_contents($url, false, $context);
    if (isset($http_response_header[0])) {
        if (preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
            $httpCode = (int) $matches[1];
        }
    }
}

if ($responseBody === false || $responseBody === null || $responseBody === '') {
    http_response_code(502);
    echo json_encode([
        'error' => 'Node-API nicht erreichbar',
        'apiUrl' => $url,
    ]);
    exit;
}

$decoded = json_decode($responseBody, true);
if (!is_array($decoded) || !isset($decoded['matches']) || !is_array($decoded['matches'])) {
    http_response_code($httpCode >= 400 ? $httpCode : 502);
    echo json_encode([
        'error' => 'Ungueltige API-Antwort',
        'apiUrl' => $url,
    ]);
    exit;
}

http_response_code($httpCode >= 200 && $httpCode < 300 ? 200 : $httpCode);
echo json_encode($decoded['matches']);
