<?php

$postData = json_decode(file_get_contents('php://input'), true);
$deviceId = $postData['deviceId'];

if (preg_match('/^(D[A-F0-9]{16})|(G[A-F0-9]{18})$/',  $deviceId)) {
	echo 'Saving data from device ' . $deviceId;
	
	$folder = 'data/' . $deviceId;
	$file = $folder . '/' . time() . '-' . mt_rand(10000, 99999) . '.json';

	mkdir($folder, 0777, true);

	file_put_contents($file, json_encode($postData, JSON_PRETTY_PRINT));
}
