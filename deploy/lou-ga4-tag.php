<?php
/**
 * Plugin Name: Lou - Google Analytics 4
 * Description: Injecte la balise GA4 (G-LDSJPBLEL4) dans le head du site.
 */

add_action('wp_head', function () {
    ?>
    <!-- Google tag (gtag.js) - GA4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-LDSJPBLEL4"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-LDSJPBLEL4');
    </script>
    <?php
}, 1);
