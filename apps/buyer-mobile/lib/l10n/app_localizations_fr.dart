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
  String get authCreateAccount => 'Creer mon compte';

  @override
  String get authCreateAccountTitle => 'Creer un compte';

  @override
  String get authNoAccount => 'Pas de compte ?';

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
  String get catalogTitle => 'Catalogue';

  @override
  String get categories => 'Categories';

  @override
  String get allCategories => 'Toutes les categories';

  @override
  String get popularProducts => 'Produits populaires';

  @override
  String get newestProducts => 'Nouveautes';

  @override
  String get productPrice => 'Prix';

  @override
  String get productSeller => 'Vendeur';

  @override
  String get productConditionNew => 'Neuf';

  @override
  String get productConditionUsed => 'Occasion';

  @override
  String get productOutOfStock => 'Rupture de stock';

  @override
  String get productLowStock => 'Stock limite';

  @override
  String get productLoadMore => 'Charger plus';

  @override
  String get productNoResults => 'Aucun produit trouve';

  @override
  String get searchPlaceholder => 'Rechercher un produit...';

  @override
  String get searchNoResults => 'Aucun resultat pour votre recherche';

  @override
  String get searchResults => 'Resultats';

  @override
  String get filterAll => 'Tous';

  @override
  String get filterNew => 'Neuf';

  @override
  String get filterUsed => 'Occasion';

  @override
  String get filterSort => 'Trier et filtrer';

  @override
  String get filterSortNewest => 'Plus recents';

  @override
  String get filterSortPriceLow => 'Prix croissant';

  @override
  String get filterSortPriceHigh => 'Prix decroissant';

  @override
  String get filterSortPopular => 'Popularite';

  @override
  String get filterApply => 'Appliquer';

  @override
  String get filterReset => 'Reinitialiser';

  @override
  String get filterPrice => 'Etat';

  @override
  String get filterMinPrice => 'Prix min';

  @override
  String get filterMaxPrice => 'Prix max';

  @override
  String get addToCart => 'Ajouter au panier';

  @override
  String get specifications => 'Caracteristiques';

  @override
  String get productDetail => 'Details du produit';

  @override
  String get backToHome => 'Reessayer';

  @override
  String get cart => 'Panier';

  @override
  String get cartEmpty => 'Votre panier est vide';

  @override
  String get cartEmptyAction => 'Decouvrir nos produits';

  @override
  String get cartCheckout => 'Passer la commande';

  @override
  String get cartTotal => 'Total';

  @override
  String get cartRemove => 'Supprimer';

  @override
  String get checkoutTitle => 'Passer la commande';

  @override
  String get checkoutSelectAddress => 'Adresse de livraison';

  @override
  String get checkoutNoAddresses => 'Aucune adresse enregistree';

  @override
  String get checkoutPaymentMethod => 'Mode de paiement';

  @override
  String get checkoutCOD => 'Paiement a la livraison';

  @override
  String get checkoutMobileMoney => 'Mobile Money';

  @override
  String get checkoutReview => 'Recapitulatif';

  @override
  String get checkoutDeliveryFee => 'Frais de livraison';

  @override
  String get checkoutPlaceOrder => 'Confirmer la commande';

  @override
  String get checkoutProcessing => 'Traitement en cours...';

  @override
  String get checkoutNote => 'Note pour le vendeur';

  @override
  String get checkoutSuccess => 'Commande confirmee !';

  @override
  String get checkoutSuccessMessage => 'Votre commande a ete passee avec succes.';

  @override
  String get checkoutViewOrders => 'Voir mes commandes';

  @override
  String get checkoutContinueShopping => 'Continuer mes achats';

  @override
  String get ordersTitle => 'Mes commandes';

  @override
  String get ordersEmpty => 'Vous n\'avez aucune commande';

  @override
  String get ordersAll => 'Toutes';

  @override
  String get ordersPending => 'En attente';

  @override
  String get ordersConfirmed => 'Confirmees';

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
  String get orderTotal => 'Total';

  @override
  String orderItems(int count) {
    return '$count article(s)';
  }

  @override
  String get orderSeller => 'Vendeur';

  @override
  String get orderCancel => 'Annuler la commande';

  @override
  String get orderCancelConfirm => 'Voulez-vous annuler cette commande ?';

  @override
  String get orderCancelReason => 'Raison (optionnel)';

  @override
  String get orderCancelSuccess => 'Commande annulee';

  @override
  String get orderDeliveryAddress => 'Adresse de livraison';

  @override
  String get orderDeliveryFee => 'Frais de livraison';

  @override
  String get orderSubtotal => 'Sous-total';

  @override
  String get orderTimeline => 'Suivi';

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
  String get checkoutSelectProvider => 'Choisissez votre operateur';

  @override
  String get checkoutMpesa => 'M-Pesa (Vodacom)';

  @override
  String get checkoutAirtelMoney => 'Airtel Money';

  @override
  String get checkoutOrangeMoney => 'Orange Money';

  @override
  String get checkoutPayerPhone => 'Numero Mobile Money';

  @override
  String get checkoutPayerPhoneHint => '+243...';

  @override
  String get paymentPendingTitle => 'Paiement en attente';

  @override
  String get paymentPendingInstructions =>
      'Vous allez recevoir une notification USSD sur votre telephone. Entrez votre code PIN pour confirmer.';

  @override
  String get paymentPendingChecking => 'Verification du paiement...';

  @override
  String get paymentConfirmed => 'Paiement confirme !';

  @override
  String get paymentFailed => 'Le paiement a echoue';

  @override
  String get paymentRetry => 'Reessayer';

  @override
  String get paymentTimeout => 'Le delai de paiement a expire';

  @override
  String get paymentTimeoutMessage =>
      'Vous pouvez reessayer depuis vos commandes.';

  @override
  String get orderPaymentStatus => 'Statut du paiement';

  @override
  String get paymentStatusPending => 'En attente';

  @override
  String get paymentStatusCompleted => 'Paye';

  @override
  String get paymentStatusFailed => 'Echoue';

  @override
  String get next => 'Suivant';

  @override
  String get previous => 'Precedent';

  @override
  String step(int number) {
    return 'Etape $number';
  }

  @override
  String get reviewsTitle => 'Avis';

  @override
  String get writeReview => 'Ecrire un avis';

  @override
  String get noReviews => 'Aucun avis pour le moment';

  @override
  String get reviewSubmitted => 'Avis soumis avec succes';

  @override
  String get reviewDeleted => 'Avis supprime';

  @override
  String get outOf5 => 'sur 5';

  @override
  String get verifiedBuyer => 'Acheteur verifie';

  @override
  String get alreadyReviewed => 'Vous avez deja donne votre avis';

  @override
  String get mustBeDelivered =>
      'La commande doit etre livree pour donner un avis';

  @override
  String get reviewPlaceholder =>
      'Partagez votre experience avec ce produit...';

  @override
  String get submitReview => 'Soumettre l\'avis';

  @override
  String get deleteReview => 'Supprimer l\'avis';

  @override
  String get confirmDeleteReview => 'Voulez-vous supprimer votre avis ?';

  @override
  String get seeAllReviews => 'Voir tous les avis';

  @override
  String get yourRating => 'Votre note';

  @override
  String get stars => 'etoiles';

  @override
  String get wishlistTitle => 'Mes favoris';

  @override
  String get wishlistEmpty => 'Aucun favori';

  @override
  String get wishlistEmptyDesc =>
      'Ajoutez des produits a vos favoris pour les retrouver facilement';

  @override
  String get addedToWishlist => 'Ajoute aux favoris';

  @override
  String get removedFromWishlist => 'Retire des favoris';

  @override
  String get browseProducts => 'Decouvrir les produits';

  @override
  String get removeFromWishlist => 'Retirer des favoris';

  @override
  String get messagesTitle => 'Messages';

  @override
  String get conversations => 'Conversations';

  @override
  String get noConversations => 'Aucune conversation';

  @override
  String get noMessages => 'Aucun message. Commencez la conversation !';

  @override
  String get typePlaceholder => 'Ecrivez votre message...';

  @override
  String get sendMessage => 'Envoyer';

  @override
  String get contactSeller => 'Contacter le vendeur';

  @override
  String get you => 'Vous';

  @override
  String get loadOlderMessages => 'Charger les messages precedents';

  @override
  String get unreadMessages => 'Messages non lus';

  @override
  String get flashDeals => 'Ventes Flash';

  @override
  String get endsIn => 'Se termine dans';

  @override
  String get discount => 'Reduction';

  @override
  String get originalPrice => 'Prix original';

  @override
  String get seeAllDeals => 'Voir toutes les offres';

  @override
  String get faq => 'FAQ';

  @override
  String get termsAndConditions => 'Conditions generales';

  @override
  String get privacyPolicy => 'Politique de confidentialite';

  @override
  String get helpCenter => 'Centre d\'aide';

  @override
  String get aboutUs => 'A propos';

  @override
  String get pageNotFound => 'Page non trouvee';

  @override
  String get contentPages => 'Pages';

  @override
  String get shopNow => 'Acheter maintenant';

  @override
  String get learnMore => 'En savoir plus';
}
