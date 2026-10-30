# Privacy policy

*Last updated: 2026-10-30. [Version française plus bas](#politique-de-confidentialité).*

Sombre is a browser extension that turns websites dark. It has no account, no analytics, no
advertising and no server of its own. **No browsing data leaves your browser.**

## What Sombre stores, on your device only

Everything is kept in the extension's local storage (`chrome.storage.local`). It is not
synchronized between devices and is deleted when you uninstall the extension.

- **Your settings**: default mode, contrast level, the sites you set to "Dark" or "Never".
- **Your fixes**: the elements you corrected with "Fix an element", by site.
- **Sites with their own dark theme**: the hostnames where Sombre detected one, so it can
  keep that theme on your next visit.
- **A per-site cache** of the dark styles Sombre generated for the stylesheets and icons of the
  sites you visit, so they display dark immediately on your next visit. It holds stylesheet and
  image addresses and the generated styles, for at most 200 sites and 20 MB; the least recently
  visited sites are removed first.
- **The shared fix list** (see below).

## Network requests

Sombre makes two kinds of requests. Neither includes your browsing history or anything you type.

1. **The shared fix list**, once a day, from
   `https://raw.githubusercontent.com/juliencastera/sombre/main/fixes/fixes.signed.json`. It is
   a list of corrections for specific websites, signed by the developer: Sombre ignores it if
   the signature does not match. GitHub receives this request like any web request (your IP
   address, under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)).
2. **Stylesheets and images of the page you are viewing.** A web page cannot read the styles
   and icons it loads from other domains, so Sombre downloads them again, from the same
   addresses the page already uses, in order to compute their dark version. Requests to other
   domains are sent **without your cookies**; stylesheets of the site itself are requested the
   way the page requests them. Most are answered by your browser's cache. Addresses on your local
   network are only fetched when the page itself comes from them.

## "Report this site"

The button opens a pre-filled issue on the project's GitHub page in a new tab. It contains the
site's domain name (never the full address), Sombre's version, your contrast level, the site's
state and your browser's version. Nothing is sent unless you submit the issue yourself on
GitHub, where it becomes public.

## When you uninstall Sombre

Chrome opens a short feedback form on Google Forms. Nothing is sent unless you fill it in and
submit it; your answers, and your e-mail address only if you choose to give it, are then received
by the developer through Google, under [Google's privacy policy](https://policies.google.com/privacy).

After two weeks of use, the popup offers once to leave a review on the Chrome Web Store. The
link only opens the store page.

## Permissions

| Permission | Why |
|---|---|
| Access to all websites | Apply the dark theme on any site you visit, and download the page's stylesheets and images to compute their dark version. |
| `scripting` | Inject the dark base layer before a page first paints, so it never flashes white, and the element picker when you click "Fix an element". |
| `storage`, `unlimitedStorage` | Keep your settings, fixes and the per-site cache (bounded at 20 MB) on your device. |
| `alarms` | Refresh the shared fix list once a day. |

## Contact

Questions and requests: [open an issue](https://github.com/juliencastera/sombre/issues). If this
policy changes, the new version is published in this file with a new date.

---

# Politique de confidentialité

*Dernière mise à jour : 30 octobre 2026.*

Sombre est une extension de navigateur qui passe les sites web en sombre. Elle n'a ni compte, ni
statistiques, ni publicité, ni serveur. **Aucune donnée de navigation ne quitte votre
navigateur.**

## Ce que Sombre enregistre, uniquement sur votre appareil

Tout est conservé dans le stockage local de l'extension (`chrome.storage.local`). Rien n'est
synchronisé entre appareils, et tout est supprimé quand vous désinstallez l'extension.

- **Vos réglages** : mode par défaut, niveau de contraste, sites réglés sur « Sombre » ou « Jamais ».
- **Vos corrections** : les éléments corrigés avec « Corriger un élément », par site.
- **Les sites qui ont leur propre thème sombre** : les noms de domaine où Sombre en a détecté
  un, pour le conserver à la visite suivante.
- **Un cache par site** des styles sombres générés pour les feuilles de style et les icônes des
  sites visités, pour qu'ils s'affichent en sombre immédiatement à la visite suivante. Il
  contient des adresses de feuilles de style et d'images et les styles générés, pour 200 sites et
  20 Mo au maximum ; les sites visités le moins récemment sont retirés en premier.
- **La liste de corrections partagée** (voir plus bas).

## Requêtes réseau

Sombre fait deux types de requêtes. Aucune ne contient votre historique ni ce que vous tapez.

1. **La liste de corrections partagée**, une fois par jour, depuis
   `https://raw.githubusercontent.com/juliencastera/sombre/main/fixes/fixes.signed.json`. C'est
   une liste de corrections pour certains sites, signée par le développeur : Sombre l'ignore si
   la signature ne correspond pas. GitHub reçoit cette requête comme toute requête web (votre
   adresse IP, selon la [déclaration de confidentialité de GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)).
2. **Les feuilles de style et les images de la page consultée.** Une page web ne peut pas lire
   les styles et les icônes qu'elle charge depuis d'autres domaines : Sombre les télécharge donc à
   nouveau, aux mêmes adresses que la page, pour calculer leur version sombre. Les requêtes vers
   d'autres domaines sont envoyées **sans vos cookies** ; les feuilles de style du site lui-même
   sont demandées comme la page les demande. La plupart sont servies par le cache du navigateur.
   Les adresses de votre réseau local ne sont contactées que si la page elle-même en provient.

## « Signaler ce site »

Le bouton ouvre dans un nouvel onglet un ticket pré-rempli sur la page GitHub du projet. Il
contient le nom de domaine du site (jamais l'adresse complète), la version de Sombre, votre
niveau de contraste, l'état du site et la version de votre navigateur. Rien n'est envoyé tant
que vous ne publiez pas vous-même le ticket sur GitHub, où il devient public.

## Quand vous désinstallez Sombre

Chrome ouvre un court formulaire de retour sur Google Forms. Rien n'est envoyé tant que vous ne le
remplissez pas et ne l'envoyez pas ; vos réponses, et votre adresse e-mail seulement si vous
choisissez de la donner, sont alors reçues par le développeur via Google, selon les
[règles de confidentialité de Google](https://policies.google.com/privacy?hl=fr).

Après deux semaines d'utilisation, le popup propose une fois de laisser un avis sur le Chrome Web
Store. Le lien ouvre seulement la page du store.

## Autorisations

| Autorisation | Pourquoi |
|---|---|
| Accès à tous les sites | Appliquer le thème sombre sur les sites visités, et télécharger les feuilles de style et images de la page pour calculer leur version sombre. |
| `scripting` | Injecter la couche sombre de base avant le premier affichage, pour qu'aucune page ne flashe en blanc, et l'outil de sélection quand vous cliquez sur « Corriger un élément ». |
| `storage`, `unlimitedStorage` | Conserver vos réglages, vos corrections et le cache par site (limité à 20 Mo) sur votre appareil. |
| `alarms` | Mettre à jour la liste de corrections partagée une fois par jour. |

## Contact

Questions et demandes : [ouvrez un ticket](https://github.com/juliencastera/sombre/issues). Si
cette politique change, la nouvelle version est publiée dans ce fichier avec une nouvelle date.
