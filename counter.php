<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Allow from anywhere, or restrict to own domain

$file = 'counter.txt';

// Check if file exists, if not create it
if (!file_exists($file)) {
    file_put_contents($file, '0');
}

// Read the current count
$count = (int)file_get_contents($file);

// Basic logic to prevent refreshing from incrementing insanely fast
// We'll use a simple session check
session_start();
if (!isset($_SESSION['has_visited'])) {
    $_SESSION['has_visited'] = true;
    $count++;
    file_put_contents($file, $count);
}

echo json_encode(['views' => $count]);
?>
