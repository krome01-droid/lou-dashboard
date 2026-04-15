// ─── Charte graphique AutoEcoleMagazine.fr ────────────────────────
// Couleur primaire  : #e31e44 (rouge marque — newsletters B2C)
// Rouge foncé       : #ba0031 (hover, titres sections)
// Fond sombre       : #1a1c1c (footer newsletter)
// Fond email body   : #f4f4f5
// Fond contenu      : #ffffff
// Fond accent rose  : #fdf2f4 (encart article principal)
// Texte principal   : #1a1c1c
// Texte secondaire  : #474747 / #666666
// Police logo       : Impact, 'Arial Black', Arial (uppercase)
// Police corps      : Arial, 'Helvetica Neue', Helvetica
// Slogan B2B        : "Le nouveau média du Permis de conduire"

export type TemplateName =
  | "newsletter_hebdomadaire"
  | "newsletter_actualite"
  | "bienvenue"
  | "sequence_j1"
  | "sequence_j3"
  | "sequence_j7"
  | "b2b_prospection"
  | "b2b_partenariat"
  | "b2b_reengagement"

export interface EmailTemplate {
  name: TemplateName
  label: string
  subject_example: string
  description: string
  variables: { name: string; description: string }[]
  html: string
}

// ─── Blocs réutilisables ──────────────────────────────────────────

const HEADER = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1D2E">
  <tr>
    <td align="center" style="padding: 28px 20px 20px;">
      <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: 900; font-style: italic; line-height: 1;">
        <span style="color: #C73B2A;">AUTO-ECOLE</span><span style="color: #FFFFFF;">MAG</span>
      </div>
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #8B92A8; letter-spacing: 2px; text-transform: uppercase; margin-top: 6px;">
        autoecolemagazine.fr
      </div>
    </td>
  </tr>
</table>
`.trim()

const FOOTER = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1D2E">
  <tr>
    <td align="center" style="padding: 28px 20px;">
      <div style="font-family: Georgia, serif; font-size: 16px; font-weight: 900; font-style: italic; margin-bottom: 12px;">
        <span style="color: #C73B2A;">AUTO-ECOLE</span><span style="color: #FFFFFF;">MAG</span>
      </div>
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #8B92A8; line-height: 1.8;">
        <a href="https://autoecolemagazine.fr" style="color: #C73B2A; text-decoration: none;">autoecolemagazine.fr</a>
        &nbsp;·&nbsp; Le comparateur de 9 800+ auto-écoles en France<br>
        contact@autoecolemagazine.fr<br><br>
        <span style="font-size: 11px; color: #555E7A;">
          Vous recevez cet email car vous êtes inscrit(e) sur AutoEcoleMagazine.fr.<br>
          <a href="{unsubscribe}" style="color: #8B92A8; text-decoration: underline;">Se désinscrire</a>
        </span>
      </div>
    </td>
  </tr>
</table>
`.trim()

const FOOTER_B2B = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1D2E">
  <tr>
    <td align="center" style="padding: 28px 20px;">
      <div style="font-family: Georgia, serif; font-size: 16px; font-weight: 900; font-style: italic; margin-bottom: 4px;">
        <span style="color: #C73B2A;">AUTO-ECOLE</span><span style="color: #FFFFFF;">MAG</span>
      </div>
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #8B92A8; margin-bottom: 12px; letter-spacing: 1px;">
        Le nouveau média du Permis de conduire
      </div>
      <div style="font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #555E7A; line-height: 1.8;">
        <a href="https://autoecolemagazine.fr" style="color: #C73B2A; text-decoration: none;">autoecolemagazine.fr</a>
        &nbsp;·&nbsp; contact@autoecolemagazine.fr<br>
        <a href="{unsubscribe}" style="color: #555E7A; font-size: 11px;">Se désinscrire</a>
      </div>
    </td>
  </tr>
</table>
`.trim()

function wrapEmail(header: string, body: string, footer: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>AutoEcoleMagazine.fr</title>
</head>
<body style="margin:0; padding:0; background-color:#F5F5F0; font-family: Arial, Helvetica, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
          <tr><td>${header}</td></tr>
          <!-- BODY -->
          <tr>
            <td bgcolor="#FFFFFF" style="border-left: 1px solid #E8E8E0; border-right: 1px solid #E8E8E0;">
              ${body}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr><td>${footer}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ─── Templates ────────────────────────────────────────────────────

export const EMAIL_TEMPLATES: Record<TemplateName, EmailTemplate> = {

  // ── 1. Newsletter hebdomadaire ────────────────────────────────
  newsletter_hebdomadaire: {
    name: "newsletter_hebdomadaire",
    label: "Newsletter hebdomadaire",
    subject_example: "Permis, actus, conseils — votre newsletter Auto-Ecole Magazine",
    description: "Template officiel de la newsletter hebdomadaire. 1 article à la une + 4 articles secondaires avec vignettes. Compatible Outlook via VML.",
    variables: [
      { name: "{{preheader}}", description: "Texte d'aperçu visible dans la boîte mail avant ouverture (1 phrase, max 90 car.)" },
      { name: "{{article_1_url}}", description: "URL complète de l'article à la une" },
      { name: "{{article_1_image_url}}", description: "URL de l'image principale (520×250 px recommandé)" },
      { name: "{{article_1_image_alt}}", description: "Texte alternatif de l'image principale" },
      { name: "{{article_1_categorie}}", description: "Catégorie de l'article à la une (ex: Actualités, Financement du permis…)" },
      { name: "{{article_1_titre}}", description: "Titre de l'article à la une" },
      { name: "{{article_1_extrait}}", description: "Extrait de l'article à la une (2-3 phrases)" },
      { name: "{{article_2_url}}", description: "URL de l'article 2" },
      { name: "{{article_2_thumb_url}}", description: "URL de la vignette 90×90 px de l'article 2" },
      { name: "{{article_2_categorie}}", description: "Catégorie de l'article 2" },
      { name: "{{article_2_titre}}", description: "Titre de l'article 2" },
      { name: "{{article_2_extrait}}", description: "Extrait court de l'article 2 (1-2 phrases)" },
      { name: "{{article_3_url}}", description: "URL de l'article 3" },
      { name: "{{article_3_thumb_url}}", description: "URL de la vignette 90×90 px de l'article 3" },
      { name: "{{article_3_categorie}}", description: "Catégorie de l'article 3" },
      { name: "{{article_3_titre}}", description: "Titre de l'article 3" },
      { name: "{{article_3_extrait}}", description: "Extrait court de l'article 3" },
      { name: "{{article_4_url}}", description: "URL de l'article 4" },
      { name: "{{article_4_thumb_url}}", description: "URL de la vignette 90×90 px de l'article 4" },
      { name: "{{article_4_categorie}}", description: "Catégorie de l'article 4" },
      { name: "{{article_4_titre}}", description: "Titre de l'article 4" },
      { name: "{{article_4_extrait}}", description: "Extrait court de l'article 4" },
      { name: "{{article_5_url}}", description: "URL de l'article 5 (dernier de la liste)" },
      { name: "{{article_5_thumb_url}}", description: "URL de la vignette 90×90 px de l'article 5" },
      { name: "{{article_5_categorie}}", description: "Catégorie de l'article 5" },
      { name: "{{article_5_titre}}", description: "Titre de l'article 5" },
      { name: "{{article_5_extrait}}", description: "Extrait court de l'article 5" },
    ],
    html: `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Newsletter — Auto-Ecole Magazine</title>
    <!--[if !mso]><!-- -->
    <style type="text/css">
        #outlook a { padding: 0; }
        body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        p { display: block; margin: 0; }
        a { color: #e31e44; text-decoration: underline; }
        @media only screen and (max-width: 620px) {
            .email-container { width: 100% !important; }
            .stack-column { display: block !important; width: 100% !important; }
            .stack-column-center { text-align: center !important; }
            .mobile-padding { padding-left: 20px !important; padding-right: 20px !important; }
            .article-thumb { width: 80px !important; height: 80px !important; }
        }
    </style>
    <!--<![endif]-->
    <!--[if mso]>
    <xml>
        <o:OfficeDocumentSettings>
            <o:AllowPNG/>
            <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
    </xml>
    <style type="text/css">
        table { border-collapse: collapse; }
    </style>
    <![endif]-->
</head>
<body style="background-color: #f4f4f5; margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; color: #1a1c1c;">
    <!-- Pre-header -->
    <div style="display:none;font-size:1px;color:#f4f4f5;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        {{preheader}}
    </div>

    <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5;">
        <tr><td align="center" style="padding: 30px 10px;">

            <!-- Email container 600px -->
            <table class="email-container" width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden;">

                <!-- HEADER -->
                <tr>
                    <td align="center" style="padding: 28px 40px; border-bottom: 3px solid #e31e44; background-color: #ffffff;">
                        <h1 style="margin: 0; font-size: 30px; letter-spacing: -0.5px; font-family: Impact, 'Arial Black', Arial, sans-serif; text-transform: uppercase; line-height: 1.2;">
                            <span style="color: #e31e44; font-style: italic;">AUTO-ECOLE</span><span style="color: #1a1c1c; font-style: italic;">MAGAZINE</span>
                        </h1>
                        <p style="margin: 8px 0 0 0; font-size: 12px; color: #888888; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 2px;">La Newsletter</p>
                    </td>
                </tr>

                <!-- ACCROCHE PERSONNALISÉE -->
                <tr>
                    <td class="mobile-padding" style="padding: 30px 40px 10px 40px;">
                        <p style="font-size: 16px; line-height: 1.6; margin: 0; color: #1a1c1c; font-family: Arial, sans-serif;">
                            Bonjour <strong>{{contact.first_name}}</strong>,
                        </p>
                        <p style="font-size: 15px; line-height: 1.6; margin: 10px 0 0 0; color: #474747; font-family: Arial, sans-serif;">
                            Voici les dernières actus du permis et de la conduite. Bonne lecture !
                        </p>
                    </td>
                </tr>

                <!-- ARTICLE PRINCIPAL (À la Une) -->
                <tr>
                    <td class="mobile-padding" style="padding: 25px 40px 10px 40px;">
                        <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 15px;">
                            <tr>
                                <td style="background-color: #e31e44; color: #ffffff; font-size: 11px; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.5px; padding: 5px 14px; border-radius: 3px;">
                                    &#9733; À la une
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                <tr>
                    <td class="mobile-padding" style="padding: 0 40px;">
                        <a href="{{article_1_url}}" target="_blank" style="text-decoration: none;">
                            <!--[if mso]>
                            <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:520px;height:250px;">
                            <v:fill type="frame" src="{{article_1_image_url}}" />
                            </v:rect>
                            <![endif]-->
                            <!--[if !mso]><!-- -->
                            <img src="{{article_1_image_url}}" alt="{{article_1_image_alt}}" width="520" style="width: 100%; max-width: 520px; height: auto; border-radius: 8px 8px 0 0; display: block;">
                            <!--<![endif]-->
                        </a>
                    </td>
                </tr>
                <tr>
                    <td class="mobile-padding" style="padding: 0 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="background-color: #fdf2f4; padding: 22px 25px; border-radius: 0 0 8px 8px;">
                                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #e31e44; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1px;">
                                        {{article_1_categorie}}
                                    </p>
                                    <h2 style="margin: 0 0 10px 0; font-size: 22px; line-height: 1.3; font-family: Arial, sans-serif;">
                                        <a href="{{article_1_url}}" target="_blank" style="color: #1a1c1c; text-decoration: none;"><!--[if mso]><font color="#1a1c1c"><![endif]-->
                                            {{article_1_titre}}
                                        <!--[if mso]></font><![endif]--></a>
                                    </h2>
                                    <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #474747; font-family: Arial, sans-serif;">
                                        {{article_1_extrait}}
                                    </p>
                                    <table border="0" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="border-radius: 6px; background-color: #e31e44;">
                                                <!--[if mso]>
                                                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{article_1_url}}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="14%" strokecolor="#ba0031" fillcolor="#e31e44">
                                                <w:anchorlock/>
                                                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">LIRE L'ARTICLE</center>
                                                </v:roundrect>
                                                <![endif]-->
                                                <!--[if !mso]><!-- -->
                                                <a href="{{article_1_url}}" target="_blank" style="font-size: 14px; font-family: Arial, sans-serif; color: #ffffff; text-decoration: none; border-radius: 6px; padding: 12px 28px; display: inline-block; font-weight: bold; background-color: #e31e44;">LIRE L'ARTICLE</a>
                                                <!--<![endif]-->
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- SÉPARATEUR -->
                <tr>
                    <td class="mobile-padding" style="padding: 30px 40px 10px 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr><td style="border-bottom: 2px solid #f4f4f5;">&nbsp;</td></tr>
                        </table>
                    </td>
                </tr>

                <!-- SECTION : NOS DERNIERS ARTICLES -->
                <tr>
                    <td class="mobile-padding" style="padding: 15px 40px 5px 40px;">
                        <h3 style="margin: 0; font-size: 18px; color: #ba0031; font-family: Arial, sans-serif;">Nos derniers articles</h3>
                        <p style="margin: 6px 0 0 0; font-size: 13px; color: #888888; font-family: Arial, sans-serif;">À lire aussi sur le blog</p>
                    </td>
                </tr>

                <!-- ARTICLE 2 -->
                <tr>
                    <td class="mobile-padding" style="padding: 15px 40px 0 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                            <tr>
                                <td width="90" valign="top" style="padding-right: 15px;">
                                    <a href="{{article_2_url}}" target="_blank" style="text-decoration: none;">
                                        <img class="article-thumb" src="{{article_2_thumb_url}}" alt="" width="90" height="90" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; display: block;">
                                    </a>
                                </td>
                                <td valign="top">
                                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #e31e44; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                                        {{article_2_categorie}}
                                    </p>
                                    <h4 style="margin: 0 0 6px 0; font-size: 15px; line-height: 1.3; font-family: Arial, sans-serif;">
                                        <a href="{{article_2_url}}" target="_blank" style="color: #1a1c1c; text-decoration: none;"><!--[if mso]><font color="#1a1c1c"><![endif]-->
                                            {{article_2_titre}}
                                        <!--[if mso]></font><![endif]--></a>
                                    </h4>
                                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #666666; font-family: Arial, sans-serif;">
                                        {{article_2_extrait}}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- ARTICLE 3 -->
                <tr>
                    <td class="mobile-padding" style="padding: 15px 40px 0 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                            <tr>
                                <td width="90" valign="top" style="padding-right: 15px;">
                                    <a href="{{article_3_url}}" target="_blank" style="text-decoration: none;">
                                        <img class="article-thumb" src="{{article_3_thumb_url}}" alt="" width="90" height="90" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; display: block;">
                                    </a>
                                </td>
                                <td valign="top">
                                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #e31e44; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                                        {{article_3_categorie}}
                                    </p>
                                    <h4 style="margin: 0 0 6px 0; font-size: 15px; line-height: 1.3; font-family: Arial, sans-serif;">
                                        <a href="{{article_3_url}}" target="_blank" style="color: #1a1c1c; text-decoration: none;"><!--[if mso]><font color="#1a1c1c"><![endif]-->
                                            {{article_3_titre}}
                                        <!--[if mso]></font><![endif]--></a>
                                    </h4>
                                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #666666; font-family: Arial, sans-serif;">
                                        {{article_3_extrait}}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- ARTICLE 4 -->
                <tr>
                    <td class="mobile-padding" style="padding: 15px 40px 0 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                            <tr>
                                <td width="90" valign="top" style="padding-right: 15px;">
                                    <a href="{{article_4_url}}" target="_blank" style="text-decoration: none;">
                                        <img class="article-thumb" src="{{article_4_thumb_url}}" alt="" width="90" height="90" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; display: block;">
                                    </a>
                                </td>
                                <td valign="top">
                                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #e31e44; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                                        {{article_4_categorie}}
                                    </p>
                                    <h4 style="margin: 0 0 6px 0; font-size: 15px; line-height: 1.3; font-family: Arial, sans-serif;">
                                        <a href="{{article_4_url}}" target="_blank" style="color: #1a1c1c; text-decoration: none;"><!--[if mso]><font color="#1a1c1c"><![endif]-->
                                            {{article_4_titre}}
                                        <!--[if mso]></font><![endif]--></a>
                                    </h4>
                                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #666666; font-family: Arial, sans-serif;">
                                        {{article_4_extrait}}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- ARTICLE 5 -->
                <tr>
                    <td class="mobile-padding" style="padding: 15px 40px 0 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td width="90" valign="top" style="padding-right: 15px;">
                                    <a href="{{article_5_url}}" target="_blank" style="text-decoration: none;">
                                        <img class="article-thumb" src="{{article_5_thumb_url}}" alt="" width="90" height="90" style="width: 90px; height: 90px; object-fit: cover; border-radius: 6px; display: block;">
                                    </a>
                                </td>
                                <td valign="top">
                                    <p style="margin: 0 0 4px 0; font-size: 11px; color: #e31e44; font-weight: bold; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.5px;">
                                        {{article_5_categorie}}
                                    </p>
                                    <h4 style="margin: 0 0 6px 0; font-size: 15px; line-height: 1.3; font-family: Arial, sans-serif;">
                                        <a href="{{article_5_url}}" target="_blank" style="color: #1a1c1c; text-decoration: none;"><!--[if mso]><font color="#1a1c1c"><![endif]-->
                                            {{article_5_titre}}
                                        <!--[if mso]></font><![endif]--></a>
                                    </h4>
                                    <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #666666; font-family: Arial, sans-serif;">
                                        {{article_5_extrait}}
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- SÉPARATEUR -->
                <tr>
                    <td class="mobile-padding" style="padding: 25px 40px 10px 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr><td style="border-bottom: 2px solid #f4f4f5;">&nbsp;</td></tr>
                        </table>
                    </td>
                </tr>

                <!-- CTA COMPARATEUR -->
                <tr>
                    <td class="mobile-padding" style="padding: 10px 40px 30px 40px;">
                        <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                                <td style="background-color: #fdf2f4; border-left: 4px solid #e31e44; border-radius: 0 6px 6px 0; padding: 18px 20px;">
                                    <p style="margin: 0 0 6px 0; font-size: 15px; color: #ba0031; font-weight: bold; font-family: Arial, sans-serif;">Vous n'avez pas encore choisi votre auto-école ?</p>
                                    <p style="margin: 0 0 14px 0; font-size: 14px; color: #656464; line-height: 1.5; font-family: Arial, sans-serif;">Comparez les tarifs, avis et taux de réussite de plus de 9 800 auto-écoles en France.</p>
                                    <a href="https://autoecolemagazine.fr/recherche-auto-ecoles/" target="_blank" style="font-size: 14px; font-family: Arial, sans-serif; color: #e31e44; text-decoration: none; font-weight: bold;"><!--[if mso]><font color="#e31e44"><![endif]-->Trouver mon auto-école &rarr;<!--[if mso]></font><![endif]--></a>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                    <td align="center" style="background-color: #1a1c1c; padding: 25px 40px;">
                        <p style="margin: 0 0 10px 0; font-size: 14px; font-family: Arial, sans-serif;">
                            <a href="https://autoecolemagazine.fr" style="color: #ffffff; text-decoration: none; margin: 0 8px;"><!--[if mso]><font color="#ffffff"><![endif]-->Notre site<!--[if mso]></font><![endif]--></a>
                            <span style="color: #555555;">|</span>
                            <a href="https://autoecolemagazine.fr/blog-accueil/" style="color: #ffffff; text-decoration: none; margin: 0 8px;"><!--[if mso]><font color="#ffffff"><![endif]-->Blog<!--[if mso]></font><![endif]--></a>
                            <span style="color: #555555;">|</span>
                            <a href="https://autoecolemagazine.fr/contact/" style="color: #ffffff; text-decoration: none; margin: 0 8px;"><!--[if mso]><font color="#ffffff"><![endif]-->Contact<!--[if mso]></font><![endif]--></a>
                            <span style="color: #555555;">|</span>
                            <a href="{unsubscribe}" style="color: #ffffff; text-decoration: none; margin: 0 8px;"><!--[if mso]><font color="#ffffff"><![endif]-->Se désinscrire<!--[if mso]></font><![endif]--></a>
                        </p>
                        <p style="margin: 0; font-size: 12px; color: #888888; line-height: 1.5; font-family: Arial, sans-serif;">
                            &copy; 2026 Auto-Ecole Magazine. Tous droits réservés.
                        </p>
                    </td>
                </tr>

            </table>
        </td></tr>
    </table>
</body>
</html>`,
  },

  // ── 2. Newsletter actualité flash ──────────────────────────────
  newsletter_actualite: {
    name: "newsletter_actualite",
    label: "Newsletter actualité flash",
    subject_example: "🚨 [SUJET] — Ce que ça change pour votre permis",
    description: "Email court pour une actualité importante (nouvelle réglementation, changement d'examen, etc.).",
    variables: [
      { name: "{{titre_actu}}", description: "Titre de l'actualité" },
      { name: "{{chapeau}}", description: "Résumé en 1-2 phrases (l'essentiel)" },
      { name: "{{contenu_principal}}", description: "Corps de l'email (3-4 paragraphes max)" },
      { name: "{{url_article}}", description: "URL de l'article complet sur le site" },
      { name: "{{tag_categorie}}", description: "Ex: Réglementation, Examen, Formation..." },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Tag catégorie -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 24px 32px 0;">
            <span style="display: inline-block; background-color: #FFF0EE; color: #C73B2A; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 10px; border-radius: 3px;">
              {{tag_categorie}}
            </span>
          </td>
        </tr>
      </table>

      <!-- Titre -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 16px 32px 0;">
            <div style="font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-weight: bold; color: #1A1D2E; line-height: 1.25;">
              {{titre_actu}}
            </div>
          </td>
        </tr>
      </table>

      <!-- Chapeau -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 16px 32px; border-left: 0; border-right: 0;">
            <div style="font-family: Arial, sans-serif; font-size: 16px; color: #555555; line-height: 1.6; font-style: italic; border-left: 3px solid #C73B2A; padding-left: 16px;">
              {{chapeau}}
            </div>
          </td>
        </tr>
      </table>

      <!-- Contenu -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px; font-family: Arial, sans-serif; font-size: 15px; color: #333333; line-height: 1.8;">
            {{contenu_principal}}
          </td>
        </tr>
      </table>

      <!-- CTA article -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 32px;">
            <a href="{{url_article}}" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 4px;">
              Lire l'article complet →
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER,
    ),
  },

  // ── 3. Email de bienvenue ─────────────────────────────────────
  bienvenue: {
    name: "bienvenue",
    label: "Email de bienvenue (J+0)",
    subject_example: "Bienvenue sur AutoEcoleMagazine.fr 👋",
    description: "Premier email envoyé immédiatement après inscription. Présentation du site et du comparateur.",
    variables: [],
    html: wrapEmail(
      HEADER,
      `
      <!-- Accroche -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 36px 32px 20px;">
            <div style="font-size: 36px; margin-bottom: 12px;">👋</div>
            <div style="font-family: Georgia, serif; font-size: 26px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              Bienvenue sur<br>AutoEcoleMagazine.fr
            </div>
          </td>
        </tr>
      </table>

      <!-- Texte intro -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px; font-family: Arial, sans-serif; font-size: 15px; color: #555555; line-height: 1.8;">
            Bonjour {{contact.first_name}},<br><br>
            Merci de rejoindre la communauté AutoEcoleMagazine.fr — le site de référence pour préparer votre permis de conduire en France.<br><br>
            Chaque semaine, nous publions des guides pratiques, des comparatifs d'auto-écoles et des actualités réglementaires pour vous aider à obtenir votre permis <strong>au meilleur prix et dans les meilleures conditions</strong>.
          </td>
        </tr>
      </table>

      <!-- 3 promesses -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0" style="border-radius: 4px;">
              <tr>
                <td style="padding: 20px 24px;">
                  <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 2;">
                    ✅&nbsp; <strong>9 800+ auto-écoles</strong> comparées en France<br>
                    ✅&nbsp; <strong>Prix transparents</strong> et taux de réussite réels<br>
                    ✅&nbsp; <strong>Guides officiels</strong> mis à jour en temps réel
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA principal -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 12px;">
            <a href="https://autoecolemagazine.fr/comparateur" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 4px; width: 240px; text-align: center;">
              Comparer les auto-écoles près de moi
            </a>
          </td>
        </tr>
      </table>

      <!-- CTA secondaire -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 8px 32px 32px;">
            <a href="https://autoecolemagazine.fr/guides" style="font-family: Arial, sans-serif; font-size: 13px; color: #C73B2A; text-decoration: none;">
              Voir tous les guides gratuits →
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER,
    ),
  },

  // ── 4. Séquence J+1 ──────────────────────────────────────────
  sequence_j1: {
    name: "sequence_j1",
    label: "Séquence bienvenue — J+1",
    subject_example: "Comment choisir la bonne auto-école ? (Les 5 critères clés)",
    description: "Envoyé le lendemain de l'inscription. Apporte de la valeur avec un guide pratique.",
    variables: [
      { name: "{{url_guide_choisir}}", description: "URL du guide 'comment choisir son auto-école'" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Intro personnelle -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 32px 32px 16px; font-family: Arial, sans-serif; font-size: 15px; color: #555555; line-height: 1.8;">
            Bonjour {{contact.first_name}},<br><br>
            Hier, vous avez rejoint AutoEcoleMagazine.fr. Aujourd'hui, je vous partage quelque chose d'utile.
          </td>
        </tr>
      </table>

      <!-- Titre guide -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 16px;">
            <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              Choisir une auto-école :<br>les 5 critères qui font toute la différence
            </div>
          </td>
        </tr>
      </table>

      <!-- Contenu -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.8;">
            Beaucoup de candidats choisissent leur auto-école par défaut — celle du quartier, celle que recommande un ami. Résultat : prix trop élevés, taux de réussite médiocre, mauvaise ambiance.<br><br>
            Voici les 5 critères à vérifier <strong>avant de vous engager</strong> :
          </td>
        </tr>
      </table>

      <!-- Liste critères -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #F0EEE8; font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
                  <strong style="color: #C73B2A;">1.</strong>&nbsp; Le taux de réussite à l'examen pratique
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #F0EEE8; font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
                  <strong style="color: #C73B2A;">2.</strong>&nbsp; Le prix total de la formation (pas le prix de la leçon)
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #F0EEE8; font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
                  <strong style="color: #C73B2A;">3.</strong>&nbsp; La disponibilité des moniteurs et des créneaux d'examen
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-bottom: 1px solid #F0EEE8; font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
                  <strong style="color: #C73B2A;">4.</strong>&nbsp; L'agrément de l'établissement (vérifiable sur data.gouv.fr)
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-family: Arial, sans-serif; font-size: 14px; color: #333333;">
                  <strong style="color: #C73B2A;">5.</strong>&nbsp; Les avis vérifiés des anciens candidats
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 32px;">
            <a href="{{url_guide_choisir}}" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 13px 26px; border-radius: 4px;">
              Lire le guide complet →
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER,
    ),
  },

  // ── 5. Séquence J+3 ──────────────────────────────────────────
  sequence_j3: {
    name: "sequence_j3",
    label: "Séquence bienvenue — J+3",
    subject_example: "Quel est le prix moyen du permis près de chez vous ?",
    description: "J+3 après l'inscription. Focus sur les prix et l'utilisation du comparateur.",
    variables: [
      { name: "{{url_comparateur}}", description: "URL du comparateur (avec paramètre ville si possible)" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Accroche -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 32px 32px 8px; font-family: Arial, sans-serif; font-size: 15px; color: #555555; line-height: 1.8;">
            Bonjour {{contact.first_name}},
          </td>
        </tr>
      </table>

      <!-- Titre -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 8px 32px 16px;">
            <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              Combien coûte vraiment le permis de conduire en France ?
            </div>
          </td>
        </tr>
      </table>

      <!-- Stats -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.8;">
            Selon les dernières données de la Sécurité Routière, le coût moyen du permis B en France est de <strong>1 800 €</strong>. Mais selon les villes et les établissements, les prix varient de <strong>900 € à plus de 3 000 €</strong>.
          </td>
        </tr>
      </table>

      <!-- Chiffres clés -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="33%" align="center" bgcolor="#FFF0EE" style="padding: 16px 8px; border-radius: 4px; margin-right: 8px;">
                  <div style="font-family: Georgia, serif; font-size: 26px; font-weight: bold; color: #C73B2A;">1 800 €</div>
                  <div style="font-family: Arial, sans-serif; font-size: 11px; color: #555555; margin-top: 4px;">Coût moyen</div>
                </td>
                <td width="4%"></td>
                <td width="29%" align="center" bgcolor="#F5F5F0" style="padding: 16px 8px; border-radius: 4px;">
                  <div style="font-family: Georgia, serif; font-size: 26px; font-weight: bold; color: #1A1D2E;">35 h</div>
                  <div style="font-family: Arial, sans-serif; font-size: 11px; color: #555555; margin-top: 4px;">Heures moyennes</div>
                </td>
                <td width="4%"></td>
                <td width="30%" align="center" bgcolor="#F5F5F0" style="padding: 16px 8px; border-radius: 4px;">
                  <div style="font-family: Georgia, serif; font-size: 26px; font-weight: bold; color: #1A1D2E;">58 %</div>
                  <div style="font-family: Arial, sans-serif; font-size: 11px; color: #555555; margin-top: 4px;">Taux de réussite</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Texte -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.8;">
            Avec notre comparateur gratuit, vous pouvez voir en quelques secondes les prix et taux de réussite des auto-écoles près de chez vous — et économiser plusieurs centaines d'euros.
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 32px;">
            <a href="{{url_comparateur}}" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 4px;">
              Comparer les prix près de moi
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER,
    ),
  },

  // ── 6. Séquence J+7 ──────────────────────────────────────────
  sequence_j7: {
    name: "sequence_j7",
    label: "Séquence bienvenue — J+7",
    subject_example: "3 erreurs à éviter quand on choisit son auto-école",
    description: "J+7 après l'inscription. Contenu fort à valeur ajoutée + CTA chatbot.",
    variables: [
      { name: "{{url_chatbot}}", description: "URL du chatbot conseil auto-école" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Intro -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 32px 32px 16px; font-family: Arial, sans-serif; font-size: 15px; color: #555555; line-height: 1.8;">
            Bonjour {{contact.first_name}},<br><br>
            Cette semaine, je vous partage les 3 erreurs les plus fréquentes — et comment les éviter.
          </td>
        </tr>
      </table>

      <!-- Titre -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px;">
            <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              3 erreurs classiques (et coûteuses) à éviter
            </div>
          </td>
        </tr>
      </table>

      <!-- Erreur 1 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFF0EE" style="border-radius: 4px;">
              <tr>
                <td style="padding: 16px 20px;">
                  <div style="font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #C73B2A; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Erreur n°1</div>
                  <div style="font-family: Georgia, serif; font-size: 15px; font-weight: bold; color: #1A1D2E; margin-bottom: 8px;">Choisir l'auto-école la moins chère</div>
                  <div style="font-family: Arial, sans-serif; font-size: 13px; color: #555555; line-height: 1.7;">Une auto-école bon marché avec un mauvais taux de réussite peut vous coûter plus cher au final : chaque repassage d'examen représente 100 à 150 € supplémentaires.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Erreur 2 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 8px 32px 4px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0" style="border-radius: 4px;">
              <tr>
                <td style="padding: 16px 20px;">
                  <div style="font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #8B92A8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Erreur n°2</div>
                  <div style="font-family: Georgia, serif; font-size: 15px; font-weight: bold; color: #1A1D2E; margin-bottom: 8px;">Ne pas vérifier le délai avant l'examen</div>
                  <div style="font-family: Arial, sans-serif; font-size: 13px; color: #555555; line-height: 1.7;">Certaines auto-écoles affichent des délais d'attente de 6 à 8 mois pour passer l'examen. Vérifiez toujours ce délai avant de vous inscrire.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Erreur 3 -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 8px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0" style="border-radius: 4px;">
              <tr>
                <td style="padding: 16px 20px;">
                  <div style="font-family: Arial, sans-serif; font-size: 12px; font-weight: bold; color: #8B92A8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Erreur n°3</div>
                  <div style="font-family: Georgia, serif; font-size: 15px; font-weight: bold; color: #1A1D2E; margin-bottom: 8px;">Payer en une seule fois sans conditions</div>
                  <div style="font-family: Arial, sans-serif; font-size: 13px; color: #555555; line-height: 1.7;">Exigez toujours un contrat de formation conforme (obligation légale depuis 2020) et un mode de paiement qui vous protège en cas de fermeture de l'établissement.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA chatbot -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px; font-family: Arial, sans-serif; font-size: 14px; color: #555555; line-height: 1.8; text-align: center;">
            Vous avez des questions spécifiques sur votre situation ?<br>
            <strong>Notre conseiller IA répond en moins de 30 secondes.</strong>
          </td>
        </tr>
      </table>

      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 16px 32px 32px;">
            <a href="{{url_chatbot}}" style="display: inline-block; background-color: #1A1D2E; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 13px 26px; border-radius: 4px;">
              Poser ma question au conseiller IA →
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER,
    ),
  },

  // ── 7. Email B2B prospection (auto-écoles) ────────────────────
  b2b_prospection: {
    name: "b2b_prospection",
    label: "B2B — Prospection auto-école",
    subject_example: "Votre auto-école est-elle visible par les 18-25 ans ?",
    description: "Email de prospection froide pour les directeurs d'auto-écoles. Présente l'offre de référencement.",
    variables: [
      { name: "{{nom_autoecole}}", description: "Nom de l'auto-école" },
      { name: "{{ville}}", description: "Ville de l'auto-école" },
      { name: "{{url_inscription}}", description: "URL d'inscription partenaire" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Badge slogan -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 20px 32px 8px;">
            <span style="display: inline-block; background-color: #1A1D2E; color: #8B92A8; font-family: Arial, sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; padding: 5px 12px; border-radius: 20px;">
              Le nouveau média du Permis de conduire
            </span>
          </td>
        </tr>
      </table>

      <!-- Titre -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 12px 32px 24px;">
            <div style="font-family: Georgia, serif; font-size: 24px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              {{nom_autoecole}}, vos futurs candidats<br>nous cherchent tous les jours.
            </div>
          </td>
        </tr>
      </table>

      <!-- Contenu principal -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.9;">
            Bonjour,<br><br>
            AutoEcoleMagazine.fr est le comparateur de référence pour les 17-25 ans qui cherchent une auto-école à <strong>{{ville}}</strong>. Chaque mois, des milliers de candidats consultent notre plateforme avant de prendre leur décision.<br><br>
            Aujourd'hui, votre établissement n'apparaît pas encore dans nos résultats. Cela signifie que vous passez à côté de candidats qui cherchent exactement ce que vous proposez.
          </td>
        </tr>
      </table>

      <!-- Chiffres plateforme -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#1A1D2E" style="border-radius: 4px;">
              <tr>
                <td style="padding: 20px 24px;">
                  <div style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #C73B2A; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px;">La plateforme en chiffres</div>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="33%" align="center">
                        <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #FFFFFF;">9 800+</div>
                        <div style="font-family: Arial, sans-serif; font-size: 11px; color: #8B92A8; margin-top: 4px;">Auto-écoles référencées</div>
                      </td>
                      <td width="33%" align="center">
                        <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #FFFFFF;">50K+</div>
                        <div style="font-family: Arial, sans-serif; font-size: 11px; color: #8B92A8; margin-top: 4px;">Visiteurs/mois</div>
                      </td>
                      <td width="33%" align="center">
                        <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #FFFFFF;">17-25</div>
                        <div style="font-family: Arial, sans-serif; font-size: 11px; color: #8B92A8; margin-top: 4px;">Âge moyen visiteurs</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Ce qu'on propose -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.8;">
            En référençant votre auto-école sur notre plateforme, vous bénéficiez :<br><br>
            <span style="color: #C73B2A;">→</span>&nbsp; D'une fiche établissement complète (horaires, tarifs, taux de réussite)<br>
            <span style="color: #C73B2A;">→</span>&nbsp; D'une visibilité auprès des candidats de {{ville}}<br>
            <span style="color: #C73B2A;">→</span>&nbsp; D'un accès aux leads qualifiés (candidats en recherche active)
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 32px;">
            <a href="{{url_inscription}}" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 14px 28px; border-radius: 4px;">
              Référencer mon auto-école gratuitement
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER_B2B,
    ),
  },

  // ── 8. Email B2B partenariat ──────────────────────────────────
  b2b_partenariat: {
    name: "b2b_partenariat",
    label: "B2B — Partenariat éditorial",
    subject_example: "Collaboration éditoriale — AutoEcoleMagazine.fr × {{nom_partenaire}}",
    description: "Email pour proposer un partenariat éditorial (article sponsorisé, interview, étude de cas).",
    variables: [
      { name: "{{nom_contact}}", description: "Nom du contact chez le partenaire" },
      { name: "{{nom_partenaire}}", description: "Nom de l'entreprise partenaire" },
      { name: "{{type_partenariat}}", description: "Ex: article sponsorisé, interview dirigeant, étude de cas..." },
      { name: "{{angle_propose}}", description: "Angle éditorial proposé pour le contenu commun" },
      { name: "{{url_media_kit}}", description: "URL du media kit / page partenaires" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Slogan -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 20px 32px 8px;">
            <span style="display: inline-block; font-family: Arial, sans-serif; font-size: 10px; color: #8B92A8; letter-spacing: 2px; text-transform: uppercase;">
              Le nouveau média du Permis de conduire
            </span>
          </td>
        </tr>
      </table>

      <!-- Titre -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 12px 32px 24px;">
            <div style="font-family: Georgia, serif; font-size: 22px; font-weight: bold; color: #1A1D2E; line-height: 1.3;">
              Proposition de partenariat éditorial
            </div>
          </td>
        </tr>
      </table>

      <!-- Corps -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.9;">
            Bonjour {{nom_contact}},<br><br>
            Je suis Laurent, éditeur d'AutoEcoleMagazine.fr — le comparateur de référence pour les candidats au permis de conduire en France (9 800+ auto-écoles, 50 000+ visiteurs/mois).<br><br>
            Je vous contacte pour vous proposer un <strong>{{type_partenariat}}</strong> autour de l'angle suivant :<br><br>
            <em style="color: #555555; border-left: 3px solid #C73B2A; padding-left: 12px; display: block;">
              {{angle_propose}}
            </em><br>
            Ce format permettrait à {{nom_partenaire}} de toucher directement une audience de futurs conducteurs en phase de décision active.
          </td>
        </tr>
      </table>

      <!-- Prochaine étape -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F5F0" style="border-radius: 4px;">
              <tr>
                <td style="padding: 16px 20px; font-family: Arial, sans-serif; font-size: 14px; color: #333333; line-height: 1.8;">
                  <strong>Prochaine étape :</strong><br>
                  Un appel de 20 minutes pour aligner nos objectifs et confirmer le format. Vous pouvez consulter notre media kit pour les détails techniques et tarifaires.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding: 0 32px 32px;">
            <a href="{{url_media_kit}}" style="display: inline-block; background-color: #1A1D2E; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 13px 26px; border-radius: 4px;">
              Consulter le media kit →
            </a>
          </td>
        </tr>
      </table>
      `,
      FOOTER_B2B,
    ),
  },

  // ── 9. Email B2B réengagement ─────────────────────────────────
  b2b_reengagement: {
    name: "b2b_reengagement",
    label: "B2B — Réengagement lead froid",
    subject_example: "{{nom_autoecole}} — une question rapide",
    description: "Email court de réengagement pour un lead B2B qui n'a pas répondu depuis +30 jours.",
    variables: [
      { name: "{{nom_autoecole}}", description: "Nom de l'auto-école" },
      { name: "{{prenom_contact}}", description: "Prénom du contact" },
      { name: "{{url_prise_rdv}}", description: "URL de prise de rendez-vous (Calendly ou autre)" },
    ],
    html: wrapEmail(
      HEADER,
      `
      <!-- Corps minimaliste -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 36px 32px; font-family: Arial, sans-serif; font-size: 15px; color: #333333; line-height: 1.9;">
            Bonjour {{prenom_contact}},<br><br>
            Je me permets de revenir vers vous concernant le référencement de <strong>{{nom_autoecole}}</strong> sur AutoEcoleMagazine.fr.<br><br>
            Une seule question : est-ce que l'acquisition de nouveaux candidats est toujours dans vos priorités pour ce trimestre ?<br><br>
            Si oui, je vous réserve 15 minutes cette semaine pour vous montrer concrètement comment notre plateforme génère des contacts qualifiés pour les auto-écoles de votre zone.<br><br>
            Si ce n'est plus d'actualité, un simple mot suffit — je ne vous recontacte plus.
          </td>
        </tr>
      </table>

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="padding: 0 32px 36px;">
            <a href="{{url_prise_rdv}}" style="display: inline-block; background-color: #C73B2A; color: #FFFFFF; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 4px;">
              Réserver 15 minutes →
            </a>
            <span style="display: inline-block; margin-left: 16px; font-family: Arial, sans-serif; font-size: 13px; color: #8B92A8; line-height: 44px;">
              Cordialement, Laurent — AutoEcoleMagazine.fr
            </span>
          </td>
        </tr>
      </table>
      `,
      FOOTER_B2B,
    ),
  },
}

export function getTemplate(name: TemplateName): EmailTemplate {
  const template = EMAIL_TEMPLATES[name]
  if (!template) throw new Error(`Template inconnu : ${name}`)
  return template
}

export function listTemplates(): { name: TemplateName; label: string; description: string }[] {
  return Object.values(EMAIL_TEMPLATES).map((t) => ({
    name: t.name,
    label: t.label,
    description: t.description,
  }))
}
