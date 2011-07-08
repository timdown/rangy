<?php

$fp = fopen('clientlog.txt', 'a');
fwrite($fp, $_POST['message'] . "\r\n");
fclose($fp);

//$logs = json_decode($POST['data']);
echo 1;
?>