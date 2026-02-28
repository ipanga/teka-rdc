// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appName => 'Teka RDC';

  @override
  String get home => 'Accueil';

  @override
  String get search => 'Rechercher';

  @override
  String get login => 'Se connecter';

  @override
  String get register => 'S\'inscrire';

  @override
  String get welcome => 'Bienvenue sur Teka RDC';

  @override
  String get subtitle => 'Votre marketplace en ligne en RD Congo';

  @override
  String get authPhoneLabel => 'Numero de telephone';

  @override
  String get authPhoneHint => '09XX XXX XXX';

  @override
  String get authPhoneRequired => 'Veuillez entrer votre numero de telephone';

  @override
  String get authPhoneInvalid => 'Numero de telephone invalide';

  @override
  String get authSendCode => 'Envoyer le code';

  @override
  String get authVerification => 'Verification';

  @override
  String get authVerificationTitle => 'Code de verification';

  @override
  String authVerificationSubtitle(String phone) {
    return 'Un code a 6 chiffres a ete envoye au $phone';
  }

  @override
  String get authResendCode => 'Renvoyer le code';

  @override
  String authResendIn(int seconds) {
    return 'Renvoyer le code dans $seconds s';
  }

  @override
  String get authInvalidCode => 'Code invalide. Veuillez reessayer.';

  @override
  String get authCreateAccount => 'Creer mon compte vendeur';

  @override
  String get authCreateAccountTitle => 'Creer un compte vendeur';

  @override
  String get authNoAccount => 'Pas de compte vendeur ?';

  @override
  String get authHasAccount => 'Deja un compte ?';

  @override
  String get authFirstName => 'Prenom';

  @override
  String get authFirstNameHint => 'Entrez votre prenom';

  @override
  String get authFirstNameRequired => 'Veuillez entrer votre prenom';

  @override
  String get authLastName => 'Nom';

  @override
  String get authLastNameHint => 'Entrez votre nom';

  @override
  String get authLastNameRequired => 'Veuillez entrer votre nom';

  @override
  String get authStep1 => 'Etape 1 : Verifier votre numero';

  @override
  String get authStep2 => 'Etape 2 : Vos informations';

  @override
  String get authNumberVerified => 'Numero verifie';

  @override
  String get authEnterSmsCode => 'Entrez le code recu par SMS';

  @override
  String get authSendError =>
      'Impossible d\'envoyer le code. Veuillez reessayer.';

  @override
  String get authGenericError => 'Une erreur est survenue. Veuillez reessayer.';

  @override
  String get authCreateError =>
      'Impossible de creer le compte. Veuillez reessayer.';

  @override
  String get authLogout => 'Se deconnecter';

  @override
  String get authProfile => 'Mon profil';

  @override
  String get authSellerSpace => 'Espace Vendeur';

  @override
  String get authWrongRoleTitle => 'Compte acheteur detecte';

  @override
  String get authWrongRoleMessage =>
      'Votre compte est enregistre en tant qu\'acheteur. Cette application est reservee aux vendeurs.';

  @override
  String get authCreateSellerAccount => 'Creer un compte vendeur';

  @override
  String get authSellerAccountNote =>
      'Votre compte sera cree en tant que vendeur.';

  @override
  String get productsTitle => 'Produits';

  @override
  String get newProduct => 'Nouveau produit';

  @override
  String get editProduct => 'Modifier le produit';

  @override
  String get productCreated => 'Produit cree avec succes';

  @override
  String get productUpdated => 'Produit mis a jour';

  @override
  String get productArchived => 'Produit archive';

  @override
  String get productSubmitted => 'Produit soumis pour revision';

  @override
  String get statusDraft => 'Brouillon';

  @override
  String get statusPendingReview => 'En attente';

  @override
  String get statusActive => 'Actif';

  @override
  String get statusRejected => 'Rejete';

  @override
  String get statusArchived => 'Archive';

  @override
  String get allStatuses => 'Tous';

  @override
  String get filterByStatus => 'Filtrer par statut';

  @override
  String get titleFr => 'Titre (francais)';

  @override
  String get titleEn => 'Titre (anglais)';

  @override
  String get descriptionFr => 'Description (francais)';

  @override
  String get descriptionEn => 'Description (anglais)';

  @override
  String get priceCDF => 'Prix CDF';

  @override
  String get priceUSD => 'Prix USD';

  @override
  String get quantity => 'Quantite';

  @override
  String get condition => 'Etat';

  @override
  String get conditionNew => 'Neuf';

  @override
  String get conditionUsed => 'Occasion';

  @override
  String get category => 'Categorie';

  @override
  String get selectCategory => 'Selectionner une categorie';

  @override
  String get images => 'Images';

  @override
  String get uploadImage => 'Ajouter';

  @override
  String get deleteImage => 'Supprimer l\'image';

  @override
  String get maxImagesReached => 'Maximum atteint';

  @override
  String get imageUploaded => 'Image ajoutee';

  @override
  String get imageDeleted => 'Image supprimee';

  @override
  String imagesCount(int current, int max) {
    return '$current/$max images';
  }

  @override
  String get submitForReview => 'Soumettre pour revision';

  @override
  String get confirmSubmit =>
      'Voulez-vous soumettre ce produit pour revision ? Il sera examine par notre equipe.';

  @override
  String get confirmArchive =>
      'Voulez-vous archiver ce produit ? Il ne sera plus visible par les acheteurs.';

  @override
  String get archive => 'Archiver';

  @override
  String get rejectionReason => 'Motif du rejet';

  @override
  String get specifications => 'Specifications';

  @override
  String get save => 'Enregistrer';

  @override
  String get cancel => 'Annuler';

  @override
  String get noProducts => 'Aucun produit pour le moment';

  @override
  String get loadMore => 'Reessayer';

  @override
  String get totalProducts => 'Total produits';

  @override
  String get activeProducts => 'Actifs';

  @override
  String get pendingProducts => 'En attente';

  @override
  String get draftProducts => 'Brouillons';

  @override
  String get dashboard => 'Accueil';

  @override
  String get products => 'Produits';

  @override
  String get profile => 'Profil';

  @override
  String get ordersTitle => 'Commandes';

  @override
  String get ordersEmpty => 'Aucune commande';

  @override
  String get ordersAll => 'Toutes';

  @override
  String get ordersPending => 'En attente';

  @override
  String get ordersConfirmed => 'Confirmees';

  @override
  String get ordersProcessing => 'En preparation';

  @override
  String get ordersShipped => 'Expediees';

  @override
  String get ordersDelivered => 'Livrees';

  @override
  String get ordersCancelled => 'Annulees';

  @override
  String orderNumber(String number) {
    return 'Commande $number';
  }

  @override
  String get orderBuyer => 'Acheteur';

  @override
  String get orderPhone => 'Telephone';

  @override
  String get orderDate => 'Date';

  @override
  String orderItems(int count) {
    return '$count article(s)';
  }

  @override
  String get orderTotal => 'Total';

  @override
  String get orderSubtotal => 'Sous-total';

  @override
  String get orderDeliveryFee => 'Frais de livraison';

  @override
  String get orderDeliveryAddress => 'Adresse de livraison';

  @override
  String get orderBuyerNote => 'Note de l\'acheteur';

  @override
  String get orderTimeline => 'Historique';

  @override
  String get orderConfirm => 'Confirmer';

  @override
  String get orderReject => 'Rejeter';

  @override
  String get orderProcess => 'Preparer';

  @override
  String get orderShip => 'Expedier';

  @override
  String get orderOutForDelivery => 'En livraison';

  @override
  String get orderDeliver => 'Livrer';

  @override
  String get orderRejectReason => 'Raison du rejet';

  @override
  String get orderRejectHint => 'Expliquez la raison...';

  @override
  String get orderActionConfirm => 'Confirmer cette action ?';

  @override
  String get orderActionSuccess => 'Action effectuee';

  @override
  String get orderStatusPENDING => 'En attente';

  @override
  String get orderStatusCONFIRMED => 'Confirmee';

  @override
  String get orderStatusPROCESSING => 'En preparation';

  @override
  String get orderStatusSHIPPED => 'Expediee';

  @override
  String get orderStatusOUT_FOR_DELIVERY => 'En livraison';

  @override
  String get orderStatusDELIVERED => 'Livree';

  @override
  String get orderStatusCANCELLED => 'Annulee';

  @override
  String get orderStatusRETURNED => 'Retournee';

  @override
  String get earningsTitle => 'Revenus';

  @override
  String get earningsWalletBalance => 'Solde disponible';

  @override
  String get earningsTotalEarned => 'Revenus totaux';

  @override
  String get earningsTotalCommission => 'Commission prelevee';

  @override
  String get earningsRequestPayout => 'Demander un virement';

  @override
  String get earningsTabEarnings => 'Gains';

  @override
  String get earningsTabPayouts => 'Virements';

  @override
  String get earningsNoEarnings => 'Aucun revenu pour le moment';

  @override
  String get earningsNoPayouts => 'Aucun virement pour le moment';

  @override
  String get earningsAvailable => 'Disponible';

  @override
  String get earningsPaid => 'Paye';

  @override
  String get payoutFormTitle => 'Demande de virement';

  @override
  String get payoutSelectOperator => 'Operateur Mobile Money';

  @override
  String get payoutPhone => 'Numero de reception';

  @override
  String get payoutPhoneHint => '+243...';

  @override
  String get payoutCurrentBalance => 'Solde actuel';

  @override
  String get payoutSubmit => 'Envoyer la demande';

  @override
  String get payoutMinimumBalance => 'Solde minimum: 5 000 CDF';

  @override
  String get payoutSuccess => 'Demande envoyee avec succes';

  @override
  String get payoutStatusRequested => 'En attente';

  @override
  String get payoutStatusApproved => 'Approuve';

  @override
  String get payoutStatusProcessing => 'En traitement';

  @override
  String get payoutStatusCompleted => 'Complete';

  @override
  String get payoutStatusRejected => 'Rejete';

  @override
  String get orderPaymentMethod => 'Mode de paiement';

  @override
  String get orderPaymentStatus => 'Statut du paiement';

  @override
  String get paymentCOD => 'Paiement a la livraison';

  @override
  String get paymentMobileMoney => 'Mobile Money';

  @override
  String get paymentPending => 'En attente';

  @override
  String get paymentCompleted => 'Paye';

  @override
  String get paymentFailed => 'Echoue';

  @override
  String get reviewsTitle => 'Avis clients';

  @override
  String get averageRating => 'Note moyenne';

  @override
  String get totalReviews => 'avis';

  @override
  String get recentReviews => 'Avis recents';

  @override
  String get noReviews => 'Aucun avis';

  @override
  String get noReviewsDesc =>
      'Ce produit n\'a pas encore recu d\'avis de la part des acheteurs.';

  @override
  String get filterByProduct => 'Filtrer par produit';

  @override
  String get allProducts => 'Tous les produits';

  @override
  String get stars => 'etoiles';

  @override
  String get star => 'etoile';

  @override
  String get outOf5 => 'sur 5';

  @override
  String get messagesTitle => 'Messages';

  @override
  String get conversations => 'Conversations';

  @override
  String get noConversations => 'Aucune conversation';

  @override
  String get noConversationsDesc =>
      'Les messages des acheteurs concernant vos produits apparaitront ici.';

  @override
  String get noMessages => 'Aucun message';

  @override
  String get typePlaceholder => 'Ecrire un message...';

  @override
  String get sendMessage => 'Envoyer';

  @override
  String get you => 'Vous';

  @override
  String get loadOlderMessages => 'Charger les messages precedents';

  @override
  String get unreadMessages => 'Messages non lus';

  @override
  String get promotionPromotions => 'Promotions';

  @override
  String get promotionMyPromotions => 'Mes promotions';

  @override
  String get promotionCreate => 'Creer une promotion';

  @override
  String get promotionType => 'Type de promotion';

  @override
  String get promotionPromotion => 'Promotion';

  @override
  String get promotionFlashDeal => 'Vente Flash';

  @override
  String get promotionDiscountType => 'Type de reduction';

  @override
  String get promotionDiscountPercent => 'Pourcentage de reduction';

  @override
  String get promotionDiscountAmount => 'Montant fixe (CDF)';

  @override
  String get promotionSelectProduct => 'Selectionner un produit';

  @override
  String get promotionStartDate => 'Date de debut';

  @override
  String get promotionEndDate => 'Date de fin';

  @override
  String get promotionPendingApproval => 'En attente d\'approbation';

  @override
  String get promotionApproved => 'Approuvee';

  @override
  String get promotionRejected => 'Refusee';

  @override
  String get promotionExpired => 'Expiree';

  @override
  String get promotionCancelled => 'Annulee';

  @override
  String get promotionCancel => 'Annuler la promotion';

  @override
  String get promotionConfirmCancel =>
      'Etes-vous sur de vouloir annuler cette promotion ?';

  @override
  String get promotionCreated => 'Promotion creee avec succes';

  @override
  String get promotionNoPromotions => 'Aucune promotion';

  @override
  String get promotionCreateFirst =>
      'Creez votre premiere promotion pour augmenter vos ventes';

  @override
  String get promotionRejectionReason => 'Raison du refus';

  @override
  String get promotionSubmitForApproval => 'Soumettre pour approbation';
}
