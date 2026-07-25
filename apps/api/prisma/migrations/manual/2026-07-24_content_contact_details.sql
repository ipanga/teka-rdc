-- Correct CMS content pages: canonical contact (+243991427171 / contact@teka.cd,
-- tappable links), COD-only payment (was Mobile Money), push/email + WhatsApp OTP
-- notifications (was SMS), no Google login, 2-day return window (was 7), single
-- contact email. Generated from prisma/seed.ts (seedPlatformBaseline).
--
-- SAFE + idempotent: each page is swapped only WHERE its content still equals the
-- exact seeded baseline, so admin-edited pages are never clobbered and re-running
-- is a no-op (content already == new).

BEGIN;

-- faq
UPDATE content_pages
SET content = $content$## Comment passer une commande ?

Parcourez nos produits, ajoutez-les à votre panier et suivez le processus de commande en 4 étapes : panier, adresse de livraison, confirmation, validation.

## Quel est le mode de paiement ?

Le paiement se fait **à la livraison, en espèces** : vous réglez votre commande au moment de la réception. C'est le seul mode de paiement actuellement disponible — les paiements par carte ou Mobile Money ne sont pas encore supportés.

## Quel est le délai de livraison ?

La livraison se fait généralement sous **24 à 72 heures** selon votre quartier. Une **notification** vous avertit à chaque étape (confirmée, préparée, en cours de livraison, livrée).

## Comment retourner un produit ?

Vous disposez de **2 jours** après réception pour signaler un problème. Contactez le service client par WhatsApp ou email, et nous organisons le retour avec le vendeur.

## Comment devenir vendeur ?

Créez votre compte, puis demandez l'accès vendeur depuis votre profil. Voir la page [Comment vendre](/pages/how-to-sell) pour les détails.

## Comment contacter le service client ?

Par WhatsApp au [+243 991 427 171](https://wa.me/243991427171), par email à [contact@teka.cd](mailto:contact@teka.cd), ou via le [formulaire de contact](/pages/contact).

Horaires : lundi à samedi, 8h à 18h.$content$
WHERE slug = 'faq'
  AND content = $content$## Comment passer une commande ?

Parcourez nos produits, ajoutez-les à votre panier et suivez le processus de commande en 4 étapes : panier, adresse de livraison, paiement, confirmation.

## Quels sont les modes de paiement acceptés ?

Nous acceptons :

- **Mobile Money** — M-Pesa (Vodacom), Airtel Money, Orange Money
- **Paiement à la livraison** (espèces) — disponible à Lubumbashi et Kolwezi

Les paiements par carte ne sont pas encore supportés.

## Quel est le délai de livraison ?

La livraison se fait généralement sous **24 à 72 heures** selon votre quartier. Une notification SMS vous avertit à chaque étape (confirmé, expédié, en cours de livraison, livré).

## Comment retourner un produit ?

Vous disposez de **7 jours** après réception pour signaler un problème. Contactez le service client par WhatsApp ou email, et nous organisons le retour avec le vendeur.

## Mon paiement Mobile Money a échoué, que faire ?

Vérifiez d'abord que votre numéro est bien actif et que vous avez un solde suffisant. Si le problème persiste, contactez-nous avec votre numéro de commande — nous pouvons relancer la transaction ou basculer en paiement à la livraison.

## Comment devenir vendeur ?

Créez votre compte acheteur, puis demandez l'accès vendeur depuis votre profil. Voir la page [Comment vendre](/pages/how-to-sell) pour les détails.

## Comment contacter le service client ?

Par WhatsApp au **+243 999 000 000**, par email à **support@teka.cd**, ou via le [formulaire de contact](/pages/contact).

Horaires : lundi à samedi, 8h à 18h.$content$;

-- terms
UPDATE content_pages
SET content = $content$## 1. Acceptation des conditions

En accédant à la plateforme Teka RDC (teka.cd), vous acceptez sans réserve les présentes conditions générales d'utilisation. Si vous n'êtes pas d'accord, n'utilisez pas la plateforme.

## 2. Inscription et compte

- L'inscription est ouverte à toute personne physique **majeure** (18 ans minimum) résidant en République Démocratique du Congo.
- Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée avec votre compte.
- Teka RDC se réserve le droit de suspendre tout compte en cas de fraude, usurpation d'identité, ou violation des présentes conditions.

## 3. Rôles

- **Acheteur** : passe des commandes auprès des vendeurs inscrits sur la plateforme.
- **Vendeur** : publie des produits et gère les commandes reçues. Soumis à une vérification préalable de Teka RDC.
- Teka RDC agit exclusivement en tant qu'intermédiaire technique entre acheteurs et vendeurs.

## 4. Commandes et paiements

Toute commande confirmée constitue un contrat de vente entre l'acheteur et le vendeur. Teka RDC collecte le paiement au nom du vendeur et lui verse ses revenus déduction faite de la commission plateforme (10 % par défaut, sauf accord particulier).

## 5. Livraison

Les délais de livraison annoncés sont indicatifs. Les vendeurs sont responsables de la préparation et de la remise des colis aux livreurs.

## 6. Retours et remboursements

Les retours sont acceptés dans un **délai de 2 jours** après réception si le produit est non conforme, défectueux, ou endommagé. Les frais de retour sont à la charge du vendeur si la faute lui est imputable.

## 7. Contenu publié

Les vendeurs garantissent détenir tous les droits sur les images et descriptions qu'ils publient. Teka RDC peut retirer tout contenu qui viole les droits de tiers, la loi applicable, ou les règles de la plateforme.

## 8. Propriété intellectuelle

La marque Teka RDC, le logo, le design et le code de la plateforme sont la propriété exclusive de Teka RDC SAS. Toute reproduction non autorisée est interdite.

## 9. Limitation de responsabilité

Teka RDC ne peut être tenu responsable des préjudices indirects résultant de l'utilisation de la plateforme. En cas de litige entre acheteur et vendeur, Teka RDC peut intervenir en médiation mais n'est pas partie au contrat de vente.

## 10. Droit applicable

Les présentes conditions sont régies par le droit congolais. Tout litige est soumis aux juridictions compétentes de Lubumbashi.

## 11. Modifications

Teka RDC peut modifier ces conditions à tout moment. La version en vigueur est celle publiée sur cette page. Les utilisateurs actifs sont informés des changements substantiels par email ou notification dans l'application.

_Dernière mise à jour : avril 2026._$content$
WHERE slug = 'terms'
  AND content = $content$## 1. Acceptation des conditions

En accédant à la plateforme Teka RDC (teka.cd), vous acceptez sans réserve les présentes conditions générales d'utilisation. Si vous n'êtes pas d'accord, n'utilisez pas la plateforme.

## 2. Inscription et compte

- L'inscription est ouverte à toute personne physique **majeure** (18 ans minimum) résidant en République Démocratique du Congo.
- Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée avec votre compte.
- Teka RDC se réserve le droit de suspendre tout compte en cas de fraude, usurpation d'identité, ou violation des présentes conditions.

## 3. Rôles

- **Acheteur** : passe des commandes auprès des vendeurs inscrits sur la plateforme.
- **Vendeur** : publie des produits et gère les commandes reçues. Soumis à une vérification préalable de Teka RDC.
- Teka RDC agit exclusivement en tant qu'intermédiaire technique entre acheteurs et vendeurs.

## 4. Commandes et paiements

Toute commande confirmée constitue un contrat de vente entre l'acheteur et le vendeur. Teka RDC collecte le paiement au nom du vendeur et lui verse ses revenus déduction faite de la commission plateforme (10 % par défaut, sauf accord particulier).

## 5. Livraison

Les délais de livraison annoncés sont indicatifs. Les vendeurs sont responsables de la préparation et de la remise des colis aux livreurs.

## 6. Retours et remboursements

Les retours sont acceptés dans un **délai de 7 jours** après réception si le produit est non conforme, défectueux, ou endommagé. Les frais de retour sont à la charge du vendeur si la faute lui est imputable.

## 7. Contenu publié

Les vendeurs garantissent détenir tous les droits sur les images et descriptions qu'ils publient. Teka RDC peut retirer tout contenu qui viole les droits de tiers, la loi applicable, ou les règles de la plateforme.

## 8. Propriété intellectuelle

La marque Teka RDC, le logo, le design et le code de la plateforme sont la propriété exclusive de Teka RDC SAS. Toute reproduction non autorisée est interdite.

## 9. Limitation de responsabilité

Teka RDC ne peut être tenu responsable des préjudices indirects résultant de l'utilisation de la plateforme. En cas de litige entre acheteur et vendeur, Teka RDC peut intervenir en médiation mais n'est pas partie au contrat de vente.

## 10. Droit applicable

Les présentes conditions sont régies par le droit congolais. Tout litige est soumis aux juridictions compétentes de Lubumbashi.

## 11. Modifications

Teka RDC peut modifier ces conditions à tout moment. La version en vigueur est celle publiée sur cette page. Les utilisateurs actifs sont informés des changements substantiels par SMS ou email.

_Dernière mise à jour : avril 2026._$content$;

-- privacy
UPDATE content_pages
SET content = $content$## Qui nous sommes

Teka RDC SAS, société immatriculée en République Démocratique du Congo, exploite la plateforme e-commerce teka.cd. Nous sommes responsables du traitement des données personnelles collectées sur nos sites web et applications mobiles.

## Données que nous collectons

Nous ne collectons que les données strictement nécessaires au fonctionnement de la plateforme :

- **Identité** : prénom, nom
- **Contact** : numéro de téléphone (obligatoire), email (optionnel)
- **Livraison** : adresses (ville, commune, avenue, référence)
- **Commandes** : historique d'achats et de ventes
- **Techniques** : adresse IP, type d'appareil, langue du navigateur

## Comment nous utilisons vos données

- Traiter et livrer vos commandes
- Vous authentifier de manière sécurisée (code WhatsApp à usage unique pour les acheteurs, email et mot de passe pour les vendeurs)
- Vous envoyer des notifications transactionnelles (confirmation de commande, suivi de livraison, reçu de paiement)
- Détecter et prévenir la fraude
- Améliorer nos services (analyses agrégées et anonymisées)

Nous n'utilisons **pas** vos données à des fins publicitaires sans votre consentement explicite.

## Partage avec des tiers

Vos données peuvent être partagées uniquement avec :

- **Le vendeur** concerné par votre commande (nom, adresse de livraison, numéro de téléphone)
- **Nos prestataires de messagerie** (Resend pour l'email, Gupshup pour WhatsApp, Firebase pour les notifications push) pour vous avertir
- **Les autorités** légales sur réquisition judiciaire uniquement

## Sécurité

- Les mots de passe sont hashés avec bcrypt (rounds ≥ 12)
- Les tokens de session sont stockés dans des cookies httpOnly
- Les communications sont chiffrées en HTTPS/TLS 1.2+
- Les secrets (clés API, JWT) sont stockés hors du code source

## Vos droits

Conformément à la réglementation, vous avez le droit de :

- **Accéder** à vos données personnelles
- **Rectifier** des informations incorrectes
- **Supprimer** votre compte et vos données
- **Retirer** votre consentement à tout moment
- **Portabilité** : recevoir une copie de vos données dans un format lisible

Pour exercer ces droits, écrivez à **contact@teka.cd** avec une pièce d'identité.

## Conservation

Vos données sont conservées pendant la durée de votre compte actif. En cas de suppression, nous conservons certains registres (commandes, factures, paiements) pendant **10 ans** pour respecter nos obligations comptables et fiscales.

## Cookies

Nous utilisons des cookies strictement nécessaires (authentification, préférences de langue, panier). Aucun cookie de traçage publicitaire n'est déposé sans votre consentement.

## Contact

Questions sur la vie privée : **contact@teka.cd**

_Dernière mise à jour : avril 2026._$content$
WHERE slug = 'privacy'
  AND content = $content$## Qui nous sommes

Teka RDC SAS, société immatriculée en République Démocratique du Congo, exploite la plateforme e-commerce teka.cd. Nous sommes responsables du traitement des données personnelles collectées sur nos sites web et applications mobiles.

## Données que nous collectons

Nous ne collectons que les données strictement nécessaires au fonctionnement de la plateforme :

- **Identité** : prénom, nom
- **Contact** : numéro de téléphone (obligatoire), email (optionnel)
- **Livraison** : adresses (ville, commune, avenue, référence)
- **Commandes** : historique d'achats et de ventes
- **Techniques** : adresse IP, type d'appareil, langue du navigateur

## Comment nous utilisons vos données

- Traiter et livrer vos commandes
- Vous authentifier de manière sécurisée (OTP SMS, mot de passe, Google OAuth)
- Vous envoyer des notifications transactionnelles (confirmation de commande, suivi de livraison, reçu de paiement)
- Détecter et prévenir la fraude
- Améliorer nos services (analyses agrégées et anonymisées)

Nous n'utilisons **pas** vos données à des fins publicitaires sans votre consentement explicite.

## Partage avec des tiers

Vos données peuvent être partagées uniquement avec :

- **Le vendeur** concerné par votre commande (nom, adresse de livraison, numéro de téléphone)
- **Les prestataires de paiement** (Flexpay, Orange Money, etc.) pour exécuter les transactions
- **Les prestataires SMS et email** (Orange DRC, Resend) pour les notifications
- **Les autorités** légales sur réquisition judiciaire uniquement

## Sécurité

- Les mots de passe sont hashés avec bcrypt (rounds ≥ 12)
- Les tokens de session sont stockés dans des cookies httpOnly
- Les communications sont chiffrées en HTTPS/TLS 1.2+
- Les secrets (clés API, JWT) sont stockés hors du code source

## Vos droits

Conformément à la réglementation, vous avez le droit de :

- **Accéder** à vos données personnelles
- **Rectifier** des informations incorrectes
- **Supprimer** votre compte et vos données
- **Retirer** votre consentement à tout moment
- **Portabilité** : recevoir une copie de vos données dans un format lisible

Pour exercer ces droits, écrivez à **privacy@teka.cd** avec une pièce d'identité.

## Conservation

Vos données sont conservées pendant la durée de votre compte actif. En cas de suppression, nous conservons certains registres (commandes, factures, paiements) pendant **10 ans** pour respecter nos obligations comptables et fiscales.

## Cookies

Nous utilisons des cookies strictement nécessaires (authentification, préférences de langue, panier). Aucun cookie de traçage publicitaire n'est déposé sans votre consentement.

## Contact

Questions sur la vie privée : **privacy@teka.cd**

_Dernière mise à jour : avril 2026._$content$;

-- help
UPDATE content_pages
SET content = $content$## Nous sommes là pour vous aider

Notre équipe support est disponible **du lundi au samedi, 8h à 18h**.

### Nous contacter

- **WhatsApp** : [+243 991 427 171](https://wa.me/243991427171)
- **Téléphone** : [+243 991 427 171](tel:+243991427171)
- **Email** : [contact@teka.cd](mailto:contact@teka.cd)
- **Formulaire de contact** : [cliquez ici](/pages/contact)
- **Adresse** : Avenue Lumumba, Lubumbashi, Haut-Katanga, RDC

### Questions fréquentes

Pour les questions les plus courantes, consultez notre [FAQ](/pages/faq). Vous y trouverez les réponses sur :

- La procédure de commande
- Les modes de paiement
- Les délais de livraison
- Les retours et remboursements

### Guides

- [Comment acheter sur Teka RDC](/pages/how-to-buy)
- [Comment vendre sur Teka RDC](/pages/how-to-sell)

### Problème avec une commande ?

Munissez-vous de votre **numéro de commande** (format `TK-XXXXXXXX`, visible sur votre page Commandes) avant de nous contacter. Cela nous permettra d'agir beaucoup plus vite.

### Problème de connexion ?

- **Acheteur** : demandez un nouveau code de connexion WhatsApp depuis l'écran de connexion.
- **Vendeur** : utilisez « Mot de passe oublié » ou le lien « Configurer mon compte vendeur » sur la page de connexion pour migrer votre compte.
- **Administrateur** : contactez-nous directement via email.$content$
WHERE slug = 'help'
  AND content = $content$## Nous sommes là pour vous aider

Notre équipe support est disponible **du lundi au samedi, 8h à 18h**.

### Nous contacter

- **WhatsApp** : [+243 999 000 000](https://wa.me/243999000000)
- **Email** : support@teka.cd
- **Formulaire de contact** : [cliquez ici](/pages/contact)
- **Adresse** : Avenue Lumumba, Lubumbashi, Haut-Katanga, RDC

### Questions fréquentes

Pour les questions les plus courantes, consultez notre [FAQ](/pages/faq). Vous y trouverez les réponses sur :

- La procédure de commande
- Les modes de paiement
- Les délais de livraison
- Les retours et remboursements

### Guides

- [Comment acheter sur Teka RDC](/pages/how-to-buy)
- [Comment vendre sur Teka RDC](/pages/how-to-sell)

### Problème avec une commande ?

Munissez-vous de votre **numéro de commande** (format `TK-XXXXXXXX`, visible sur votre page Commandes) avant de nous contacter. Cela nous permettra d'agir beaucoup plus vite.

### Problème de connexion ?

- **Acheteur** : utilisez « Mot de passe oublié » ou demandez un nouveau code OTP SMS.
- **Vendeur** : utilisez le lien « Configurer mon compte vendeur » sur la page de connexion pour migrer votre compte.
- **Administrateur** : contactez-nous directement via email.$content$;

-- about
UPDATE content_pages
SET content = $content$## Qui sommes-nous

**Teka RDC** est une place de marché en ligne dédiée à la République Démocratique du Congo. Notre mission est de **connecter acheteurs et vendeurs locaux** avec une expérience adaptée aux réalités du pays : connexions 2G/3G fréquentes, paiement à la livraison, livraison par coursiers locaux, contenu en français d'abord.

## Nos valeurs

- **Local d'abord** — vendeurs vérifiés, catalogues adaptés aux besoins congolais, prix en francs congolais (CDF)
- **Simple et rapide** — pages légères qui chargent même en 3G, paiement à la livraison en espèces, suivi de commande en temps réel
- **Transparent** — commission annoncée dès l'inscription (10 % par défaut), aucun frais caché pour l'acheteur, retours acceptés sous 2 jours

## Où nous opérons

Nous lançons à **Lubumbashi** (Haut-Katanga) et **Kolwezi** (Lualaba) — les deux pôles économiques du sud du pays. Notre architecture permet d'ajouter de nouvelles villes sans refonte technique ; la roadmap inclut Likasi, Goma, Bukavu, Kinshasa.

## Équipe

Une équipe congolaise basée à Lubumbashi, avec l'appui de développeurs à distance.

## Contact

- **Email** : [contact@teka.cd](mailto:contact@teka.cd)
- **WhatsApp** : [+243 991 427 171](https://wa.me/243991427171)
- **Téléphone** : [+243 991 427 171](tel:+243991427171)
- **Adresse** : Avenue Lumumba, Lubumbashi, Haut-Katanga, RDC$content$
WHERE slug = 'about'
  AND content = $content$## Qui sommes-nous

**Teka RDC** est une place de marché en ligne dédiée à la République Démocratique du Congo. Notre mission est de **connecter acheteurs et vendeurs locaux** avec une expérience adaptée aux réalités du pays : connexions 2G/3G fréquentes, paiements Mobile Money, livraison par coursiers locaux, contenu en français d'abord.

## Nos valeurs

- **Local d'abord** — vendeurs vérifiés, catalogues adaptés aux besoins congolais, prix en francs congolais (CDF)
- **Simple et rapide** — pages légères qui chargent même en 3G, paiements Mobile Money en un clic, suivi de commande en temps réel par SMS
- **Transparent** — commission annoncée dès l'inscription (10 % par défaut), aucun frais caché pour l'acheteur, retours acceptés sous 7 jours

## Où nous opérons

Nous lançons à **Lubumbashi** (Haut-Katanga) et **Kolwezi** (Lualaba) — les deux pôles économiques du sud du pays. Notre architecture permet d'ajouter de nouvelles villes sans refonte technique ; la roadmap inclut Likasi, Goma, Bukavu, Kinshasa.

## Équipe

Une équipe congolaise basée à Lubumbashi, avec l'appui de développeurs à distance. Nous recrutons — postulez par email à **careers@teka.cd**.

## Contact

- **Email général** : hello@teka.cd
- **Support client** : support@teka.cd
- **Partenariats** : partnerships@teka.cd
- **Presse** : press@teka.cd$content$;

-- contact
UPDATE content_pages
SET content = $content$## Envoyez-nous un message

Utilisez le formulaire ci-dessous, ou joignez-nous directement :

- **WhatsApp** : [+243 991 427 171](https://wa.me/243991427171)
- **Téléphone** : [+243 991 427 171](tel:+243991427171)
- **Email** : [contact@teka.cd](mailto:contact@teka.cd)
- **Adresse** : Avenue Lumumba, Lubumbashi, Haut-Katanga, RDC
- **Horaires** : lundi – samedi, 8h à 18h

Pour un traitement plus rapide, incluez votre **numéro de commande** s'il s'agit d'un problème de livraison ou de paiement.$content$
WHERE slug = 'contact'
  AND content = $content$## Envoyez-nous un message

Utilisez le formulaire ci-dessous, ou joignez-nous directement :

- **WhatsApp** : [+243 999 000 000](https://wa.me/243999000000)
- **Email** : support@teka.cd
- **Adresse** : Avenue Lumumba, Lubumbashi, Haut-Katanga, RDC
- **Horaires** : lundi – samedi, 8h à 18h

Pour un traitement plus rapide, incluez votre **numéro de commande** s'il s'agit d'un problème de livraison ou de paiement.$content$;

-- how-to-buy
UPDATE content_pages
SET content = $content$## Acheter sur Teka RDC en 5 étapes

### 1. Choisissez votre ville

Au premier lancement, sélectionnez **Lubumbashi** ou **Kolwezi** — vous ne verrez que les produits disponibles localement. Vous pouvez changer de ville à tout moment depuis l'en-tête.

### 2. Parcourez le catalogue

- Utilisez la **barre de recherche** pour chercher un produit précis.
- Naviguez par **catégorie** depuis la page d'accueil.
- Filtrez par prix, état (neuf / occasion), ou note vendeur.

### 3. Ajoutez au panier

Sur la fiche produit, choisissez la quantité et cliquez sur **« Ajouter au panier »**. Le panier se synchronise entre vos appareils si vous êtes connecté.

### 4. Passez commande

Depuis le panier, cliquez sur **« Passer la commande »**. Vous serez guidé à travers :

1. Adresse de livraison (ville, commune, avenue, repère)
2. Récapitulatif de la commande
3. Confirmation

Le **paiement se fait à la livraison, en espèces** : vous réglez au moment de la réception.

### 5. Recevez votre commande

Vous recevez une **notification à chaque étape** (confirmée, préparée, en cours de livraison, livrée). Le livreur vous appelle avant d'arriver. Livraison généralement sous **24–72 heures**.

### Après la livraison

Laissez une **note de 1 à 5 étoiles** et un commentaire sur le produit et le vendeur — vous aidez les autres acheteurs à mieux choisir.

Un souci ? Vous avez **2 jours** pour signaler un problème via le service client.$content$
WHERE slug = 'how-to-buy'
  AND content = $content$## Acheter sur Teka RDC en 5 étapes

### 1. Choisissez votre ville

Au premier lancement, sélectionnez **Lubumbashi** ou **Kolwezi** — vous ne verrez que les produits disponibles localement. Vous pouvez changer de ville à tout moment depuis l'en-tête.

### 2. Parcourez le catalogue

- Utilisez la **barre de recherche** pour chercher un produit précis.
- Naviguez par **catégorie** depuis la page d'accueil.
- Filtrez par prix, état (neuf / occasion), ou note vendeur.

### 3. Ajoutez au panier

Sur la fiche produit, choisissez la quantité et cliquez sur **« Ajouter au panier »**. Le panier se synchronise entre vos appareils si vous êtes connecté.

### 4. Passez commande

Depuis le panier, cliquez sur **« Passer la commande »**. Vous serez guidé à travers :

1. Adresse de livraison (ville, commune, avenue, repère)
2. Mode de paiement :
   - **Mobile Money** — saisissez votre numéro, vous recevez une pop-up USSD à valider
   - **Paiement à la livraison** (espèces uniquement)
3. Récapitulatif + confirmation

### 5. Recevez votre commande

Vous recevez un **SMS à chaque étape** (confirmée, expédiée, en cours de livraison, livrée). Le livreur vous appelle avant d'arriver. Livraison généralement sous **24–72 heures**.

### Après la livraison

Laissez une **note de 1 à 5 étoiles** et un commentaire sur le produit et le vendeur — vous aidez les autres acheteurs à mieux choisir.

Un souci ? Vous avez **7 jours** pour signaler un problème via le service client.$content$;

-- how-to-sell
UPDATE content_pages
SET content = $content$## Vendre sur Teka RDC en 5 étapes

### 1. Créez votre compte vendeur

Inscrivez-vous sur [seller.teka.cd](https://seller.teka.cd) avec votre email et un mot de passe.

### 2. Remplissez votre profil vendeur

Fournissez :

- **Nom commercial** et type d'activité (particulier / société)
- **Pièce d'identité** (carte nationale, passeport, ou RCCM)
- **Numéro de téléphone** de contact
- **Adresse** de votre boutique ou entrepôt
- **Description** courte de ce que vous vendez

### 3. Attendez l'approbation

Notre équipe vérifie votre profil **sous 24–48 heures**. Vous recevez un email et une notification dès la décision.

### 4. Publiez vos produits

Une fois approuvé, accédez à votre tableau de bord et ajoutez des produits :

- **Titre** et description en français (l'anglais est optionnel)
- **Catégorie** et attributs dynamiques (marque, taille, couleur, etc.)
- **Photos** (jusqu'à 8, la première est l'image principale)
- **Prix en francs congolais** (CDF), stock disponible
- **État** : neuf ou occasion

Chaque produit passe par une **modération** (généralement < 24h) avant d'être visible sur teka.cd.

### 5. Gérez vos commandes et encaissez

- Recevez une notification **push + email** à chaque nouvelle commande.
- **Confirmez** la commande sous 24h, préparez le colis, remettez-le au coursier.
- **Validez la livraison** — le paiement acheteur est libéré sur votre portefeuille Teka.
- **Demandez un virement** vers votre Mobile Money à tout moment depuis la page Revenus.

## Commission

Teka prélève une **commission de 10 %** sur chaque vente. Le taux peut être ajusté par catégorie ou négocié pour les grands volumes — contactez-nous à [contact@teka.cd](mailto:contact@teka.cd).

## Besoin d'aide ?

Notre équipe est joignable à [contact@teka.cd](mailto:contact@teka.cd) ou WhatsApp au [+243 991 427 171](https://wa.me/243991427171).$content$
WHERE slug = 'how-to-sell'
  AND content = $content$## Vendre sur Teka RDC en 5 étapes

### 1. Créez votre compte vendeur

Inscrivez-vous sur [seller.teka.cd](https://seller.teka.cd) avec votre email et un mot de passe. Vous pouvez aussi vous connecter avec Google.

### 2. Remplissez votre profil vendeur

Fournissez :

- **Nom commercial** et type d'activité (particulier / société)
- **Pièce d'identité** (carte nationale, passeport, ou RCCM)
- **Numéro de téléphone** de contact
- **Adresse** de votre boutique ou entrepôt
- **Description** courte de ce que vous vendez

### 3. Attendez l'approbation

Notre équipe vérifie votre profil **sous 24–48 heures**. Vous recevez un SMS et un email dès la décision.

### 4. Publiez vos produits

Une fois approuvé, accédez à votre tableau de bord et ajoutez des produits :

- **Titre** et description en français (l'anglais est optionnel)
- **Catégorie** et attributs dynamiques (marque, taille, couleur, etc.)
- **Photos** (jusqu'à 8, la première est l'image principale)
- **Prix en francs congolais** (CDF), stock disponible
- **État** : neuf ou occasion

Chaque produit passe par une **modération** (généralement < 24h) avant d'être visible sur teka.cd.

### 5. Gérez vos commandes et encaissez

- Recevez une notification **SMS + email** à chaque nouvelle commande.
- **Confirmez** la commande sous 24h, préparez le colis, remettez-le au coursier.
- **Validez la livraison** — le paiement acheteur est libéré sur votre portefeuille Teka.
- **Demandez un virement** vers votre Mobile Money à tout moment depuis la page Revenus.

## Commission

Teka prélève une **commission de 10 %** sur chaque vente. Le taux peut être ajusté par catégorie ou négocié pour les grands volumes — contactez **partnerships@teka.cd**.

## Besoin d'aide ?

Notre équipe vendeur est joignable à **sellers@teka.cd** ou WhatsApp **+243 999 000 000**.$content$;

COMMIT;
