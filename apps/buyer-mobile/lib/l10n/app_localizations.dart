import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('fr'),
    Locale('en')
  ];

  /// No description provided for @appName.
  ///
  /// In fr, this message translates to:
  /// **'Teka RDC'**
  String get appName;

  /// No description provided for @home.
  ///
  /// In fr, this message translates to:
  /// **'Accueil'**
  String get home;

  /// No description provided for @search.
  ///
  /// In fr, this message translates to:
  /// **'Rechercher'**
  String get search;

  /// No description provided for @login.
  ///
  /// In fr, this message translates to:
  /// **'Se connecter'**
  String get login;

  /// No description provided for @register.
  ///
  /// In fr, this message translates to:
  /// **'S\'inscrire'**
  String get register;

  /// No description provided for @welcome.
  ///
  /// In fr, this message translates to:
  /// **'Bienvenue sur Teka RDC'**
  String get welcome;

  /// No description provided for @subtitle.
  ///
  /// In fr, this message translates to:
  /// **'Votre marketplace en ligne en RD Congo'**
  String get subtitle;

  /// No description provided for @authPhoneLabel.
  ///
  /// In fr, this message translates to:
  /// **'Numero de telephone'**
  String get authPhoneLabel;

  /// No description provided for @authPhoneHint.
  ///
  /// In fr, this message translates to:
  /// **'09XX XXX XXX'**
  String get authPhoneHint;

  /// No description provided for @authPhoneRequired.
  ///
  /// In fr, this message translates to:
  /// **'Veuillez entrer votre numero de telephone'**
  String get authPhoneRequired;

  /// No description provided for @authPhoneInvalid.
  ///
  /// In fr, this message translates to:
  /// **'Numero de telephone invalide'**
  String get authPhoneInvalid;

  /// No description provided for @authSendCode.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer le code'**
  String get authSendCode;

  /// No description provided for @authVerification.
  ///
  /// In fr, this message translates to:
  /// **'Verification'**
  String get authVerification;

  /// No description provided for @authVerificationTitle.
  ///
  /// In fr, this message translates to:
  /// **'Code de verification'**
  String get authVerificationTitle;

  /// No description provided for @authVerificationSubtitle.
  ///
  /// In fr, this message translates to:
  /// **'Un code a 6 chiffres a ete envoye au {phone}'**
  String authVerificationSubtitle(String phone);

  /// No description provided for @authResendCode.
  ///
  /// In fr, this message translates to:
  /// **'Renvoyer le code'**
  String get authResendCode;

  /// No description provided for @authResendIn.
  ///
  /// In fr, this message translates to:
  /// **'Renvoyer le code dans {seconds} s'**
  String authResendIn(int seconds);

  /// No description provided for @authInvalidCode.
  ///
  /// In fr, this message translates to:
  /// **'Code invalide. Veuillez reessayer.'**
  String get authInvalidCode;

  /// No description provided for @authCreateAccount.
  ///
  /// In fr, this message translates to:
  /// **'Creer mon compte'**
  String get authCreateAccount;

  /// No description provided for @authCreateAccountTitle.
  ///
  /// In fr, this message translates to:
  /// **'Creer un compte'**
  String get authCreateAccountTitle;

  /// No description provided for @authNoAccount.
  ///
  /// In fr, this message translates to:
  /// **'Pas de compte ?'**
  String get authNoAccount;

  /// No description provided for @authHasAccount.
  ///
  /// In fr, this message translates to:
  /// **'Deja un compte ?'**
  String get authHasAccount;

  /// No description provided for @authFirstName.
  ///
  /// In fr, this message translates to:
  /// **'Prenom'**
  String get authFirstName;

  /// No description provided for @authFirstNameHint.
  ///
  /// In fr, this message translates to:
  /// **'Entrez votre prenom'**
  String get authFirstNameHint;

  /// No description provided for @authFirstNameRequired.
  ///
  /// In fr, this message translates to:
  /// **'Veuillez entrer votre prenom'**
  String get authFirstNameRequired;

  /// No description provided for @authLastName.
  ///
  /// In fr, this message translates to:
  /// **'Nom'**
  String get authLastName;

  /// No description provided for @authLastNameHint.
  ///
  /// In fr, this message translates to:
  /// **'Entrez votre nom'**
  String get authLastNameHint;

  /// No description provided for @authLastNameRequired.
  ///
  /// In fr, this message translates to:
  /// **'Veuillez entrer votre nom'**
  String get authLastNameRequired;

  /// No description provided for @authStep1.
  ///
  /// In fr, this message translates to:
  /// **'Etape 1 : Verifier votre numero'**
  String get authStep1;

  /// No description provided for @authStep2.
  ///
  /// In fr, this message translates to:
  /// **'Etape 2 : Vos informations'**
  String get authStep2;

  /// No description provided for @authNumberVerified.
  ///
  /// In fr, this message translates to:
  /// **'Numero verifie'**
  String get authNumberVerified;

  /// No description provided for @authEnterSmsCode.
  ///
  /// In fr, this message translates to:
  /// **'Entrez le code recu par SMS'**
  String get authEnterSmsCode;

  /// No description provided for @authSendError.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d\'envoyer le code. Veuillez reessayer.'**
  String get authSendError;

  /// No description provided for @authGenericError.
  ///
  /// In fr, this message translates to:
  /// **'Une erreur est survenue. Veuillez reessayer.'**
  String get authGenericError;

  /// No description provided for @authCreateError.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de creer le compte. Veuillez reessayer.'**
  String get authCreateError;

  /// No description provided for @authLogout.
  ///
  /// In fr, this message translates to:
  /// **'Se deconnecter'**
  String get authLogout;

  /// No description provided for @authProfile.
  ///
  /// In fr, this message translates to:
  /// **'Mon profil'**
  String get authProfile;

  /// No description provided for @catalogTitle.
  ///
  /// In fr, this message translates to:
  /// **'Catalogue'**
  String get catalogTitle;

  /// No description provided for @categories.
  ///
  /// In fr, this message translates to:
  /// **'Categories'**
  String get categories;

  /// No description provided for @allCategories.
  ///
  /// In fr, this message translates to:
  /// **'Toutes les categories'**
  String get allCategories;

  /// No description provided for @popularProducts.
  ///
  /// In fr, this message translates to:
  /// **'Produits populaires'**
  String get popularProducts;

  /// No description provided for @newestProducts.
  ///
  /// In fr, this message translates to:
  /// **'Nouveautes'**
  String get newestProducts;

  /// No description provided for @productPrice.
  ///
  /// In fr, this message translates to:
  /// **'Prix'**
  String get productPrice;

  /// No description provided for @productSeller.
  ///
  /// In fr, this message translates to:
  /// **'Vendeur'**
  String get productSeller;

  /// No description provided for @productConditionNew.
  ///
  /// In fr, this message translates to:
  /// **'Neuf'**
  String get productConditionNew;

  /// No description provided for @productConditionUsed.
  ///
  /// In fr, this message translates to:
  /// **'Occasion'**
  String get productConditionUsed;

  /// No description provided for @productOutOfStock.
  ///
  /// In fr, this message translates to:
  /// **'Rupture de stock'**
  String get productOutOfStock;

  /// No description provided for @productLowStock.
  ///
  /// In fr, this message translates to:
  /// **'Stock limite'**
  String get productLowStock;

  /// No description provided for @productLoadMore.
  ///
  /// In fr, this message translates to:
  /// **'Charger plus'**
  String get productLoadMore;

  /// No description provided for @productNoResults.
  ///
  /// In fr, this message translates to:
  /// **'Aucun produit trouve'**
  String get productNoResults;

  /// No description provided for @searchPlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Rechercher un produit...'**
  String get searchPlaceholder;

  /// No description provided for @searchNoResults.
  ///
  /// In fr, this message translates to:
  /// **'Aucun resultat pour votre recherche'**
  String get searchNoResults;

  /// No description provided for @searchResults.
  ///
  /// In fr, this message translates to:
  /// **'Resultats'**
  String get searchResults;

  /// No description provided for @filterAll.
  ///
  /// In fr, this message translates to:
  /// **'Tous'**
  String get filterAll;

  /// No description provided for @filterNew.
  ///
  /// In fr, this message translates to:
  /// **'Neuf'**
  String get filterNew;

  /// No description provided for @filterUsed.
  ///
  /// In fr, this message translates to:
  /// **'Occasion'**
  String get filterUsed;

  /// No description provided for @filterSort.
  ///
  /// In fr, this message translates to:
  /// **'Trier et filtrer'**
  String get filterSort;

  /// No description provided for @filterSortNewest.
  ///
  /// In fr, this message translates to:
  /// **'Plus recents'**
  String get filterSortNewest;

  /// No description provided for @filterSortPriceLow.
  ///
  /// In fr, this message translates to:
  /// **'Prix croissant'**
  String get filterSortPriceLow;

  /// No description provided for @filterSortPriceHigh.
  ///
  /// In fr, this message translates to:
  /// **'Prix decroissant'**
  String get filterSortPriceHigh;

  /// No description provided for @filterSortPopular.
  ///
  /// In fr, this message translates to:
  /// **'Popularite'**
  String get filterSortPopular;

  /// No description provided for @filterApply.
  ///
  /// In fr, this message translates to:
  /// **'Appliquer'**
  String get filterApply;

  /// No description provided for @filterReset.
  ///
  /// In fr, this message translates to:
  /// **'Reinitialiser'**
  String get filterReset;

  /// No description provided for @filterPrice.
  ///
  /// In fr, this message translates to:
  /// **'Etat'**
  String get filterPrice;

  /// No description provided for @filterMinPrice.
  ///
  /// In fr, this message translates to:
  /// **'Prix min'**
  String get filterMinPrice;

  /// No description provided for @filterMaxPrice.
  ///
  /// In fr, this message translates to:
  /// **'Prix max'**
  String get filterMaxPrice;

  /// No description provided for @addToCart.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter au panier'**
  String get addToCart;

  /// No description provided for @specifications.
  ///
  /// In fr, this message translates to:
  /// **'Caracteristiques'**
  String get specifications;

  /// No description provided for @productDetail.
  ///
  /// In fr, this message translates to:
  /// **'Details du produit'**
  String get productDetail;

  /// No description provided for @backToHome.
  ///
  /// In fr, this message translates to:
  /// **'Reessayer'**
  String get backToHome;

  /// No description provided for @cart.
  ///
  /// In fr, this message translates to:
  /// **'Panier'**
  String get cart;

  /// No description provided for @cartEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Votre panier est vide'**
  String get cartEmpty;

  /// No description provided for @cartEmptyAction.
  ///
  /// In fr, this message translates to:
  /// **'Decouvrir nos produits'**
  String get cartEmptyAction;

  /// No description provided for @cartCheckout.
  ///
  /// In fr, this message translates to:
  /// **'Passer la commande'**
  String get cartCheckout;

  /// No description provided for @cartTotal.
  ///
  /// In fr, this message translates to:
  /// **'Total'**
  String get cartTotal;

  /// No description provided for @cartRemove.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer'**
  String get cartRemove;

  /// No description provided for @checkoutTitle.
  ///
  /// In fr, this message translates to:
  /// **'Passer la commande'**
  String get checkoutTitle;

  /// No description provided for @checkoutSelectAddress.
  ///
  /// In fr, this message translates to:
  /// **'Adresse de livraison'**
  String get checkoutSelectAddress;

  /// No description provided for @checkoutNoAddresses.
  ///
  /// In fr, this message translates to:
  /// **'Aucune adresse enregistree'**
  String get checkoutNoAddresses;

  /// No description provided for @checkoutPaymentMethod.
  ///
  /// In fr, this message translates to:
  /// **'Mode de paiement'**
  String get checkoutPaymentMethod;

  /// No description provided for @checkoutCOD.
  ///
  /// In fr, this message translates to:
  /// **'Paiement a la livraison'**
  String get checkoutCOD;

  /// No description provided for @checkoutMobileMoney.
  ///
  /// In fr, this message translates to:
  /// **'Mobile Money'**
  String get checkoutMobileMoney;

  /// No description provided for @checkoutReview.
  ///
  /// In fr, this message translates to:
  /// **'Recapitulatif'**
  String get checkoutReview;

  /// No description provided for @checkoutDeliveryFee.
  ///
  /// In fr, this message translates to:
  /// **'Frais de livraison'**
  String get checkoutDeliveryFee;

  /// No description provided for @checkoutPlaceOrder.
  ///
  /// In fr, this message translates to:
  /// **'Confirmer la commande'**
  String get checkoutPlaceOrder;

  /// No description provided for @checkoutProcessing.
  ///
  /// In fr, this message translates to:
  /// **'Traitement en cours...'**
  String get checkoutProcessing;

  /// No description provided for @checkoutNote.
  ///
  /// In fr, this message translates to:
  /// **'Note pour le vendeur'**
  String get checkoutNote;

  /// No description provided for @checkoutSuccess.
  ///
  /// In fr, this message translates to:
  /// **'Commande confirmee !'**
  String get checkoutSuccess;

  /// No description provided for @checkoutSuccessMessage.
  ///
  /// In fr, this message translates to:
  /// **'Votre commande a ete passee avec succes.'**
  String get checkoutSuccessMessage;

  /// No description provided for @checkoutViewOrders.
  ///
  /// In fr, this message translates to:
  /// **'Voir mes commandes'**
  String get checkoutViewOrders;

  /// No description provided for @checkoutContinueShopping.
  ///
  /// In fr, this message translates to:
  /// **'Continuer mes achats'**
  String get checkoutContinueShopping;

  /// No description provided for @ordersTitle.
  ///
  /// In fr, this message translates to:
  /// **'Mes commandes'**
  String get ordersTitle;

  /// No description provided for @ordersEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Vous n\'avez aucune commande'**
  String get ordersEmpty;

  /// No description provided for @ordersAll.
  ///
  /// In fr, this message translates to:
  /// **'Toutes'**
  String get ordersAll;

  /// No description provided for @ordersPending.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get ordersPending;

  /// No description provided for @ordersConfirmed.
  ///
  /// In fr, this message translates to:
  /// **'Confirmees'**
  String get ordersConfirmed;

  /// No description provided for @ordersShipped.
  ///
  /// In fr, this message translates to:
  /// **'Expediees'**
  String get ordersShipped;

  /// No description provided for @ordersDelivered.
  ///
  /// In fr, this message translates to:
  /// **'Livrees'**
  String get ordersDelivered;

  /// No description provided for @ordersCancelled.
  ///
  /// In fr, this message translates to:
  /// **'Annulees'**
  String get ordersCancelled;

  /// No description provided for @orderNumber.
  ///
  /// In fr, this message translates to:
  /// **'Commande {number}'**
  String orderNumber(String number);

  /// No description provided for @orderTotal.
  ///
  /// In fr, this message translates to:
  /// **'Total'**
  String get orderTotal;

  /// No description provided for @orderItems.
  ///
  /// In fr, this message translates to:
  /// **'{count} article(s)'**
  String orderItems(int count);

  /// No description provided for @orderSeller.
  ///
  /// In fr, this message translates to:
  /// **'Vendeur'**
  String get orderSeller;

  /// No description provided for @orderCancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler la commande'**
  String get orderCancel;

  /// No description provided for @orderCancelConfirm.
  ///
  /// In fr, this message translates to:
  /// **'Voulez-vous annuler cette commande ?'**
  String get orderCancelConfirm;

  /// No description provided for @orderCancelReason.
  ///
  /// In fr, this message translates to:
  /// **'Raison (optionnel)'**
  String get orderCancelReason;

  /// No description provided for @orderCancelSuccess.
  ///
  /// In fr, this message translates to:
  /// **'Commande annulee'**
  String get orderCancelSuccess;

  /// No description provided for @orderDeliveryAddress.
  ///
  /// In fr, this message translates to:
  /// **'Adresse de livraison'**
  String get orderDeliveryAddress;

  /// No description provided for @orderDeliveryFee.
  ///
  /// In fr, this message translates to:
  /// **'Frais de livraison'**
  String get orderDeliveryFee;

  /// No description provided for @orderSubtotal.
  ///
  /// In fr, this message translates to:
  /// **'Sous-total'**
  String get orderSubtotal;

  /// No description provided for @orderTimeline.
  ///
  /// In fr, this message translates to:
  /// **'Suivi'**
  String get orderTimeline;

  /// No description provided for @orderStatusPENDING.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get orderStatusPENDING;

  /// No description provided for @orderStatusCONFIRMED.
  ///
  /// In fr, this message translates to:
  /// **'Confirmee'**
  String get orderStatusCONFIRMED;

  /// No description provided for @orderStatusPROCESSING.
  ///
  /// In fr, this message translates to:
  /// **'En preparation'**
  String get orderStatusPROCESSING;

  /// No description provided for @orderStatusSHIPPED.
  ///
  /// In fr, this message translates to:
  /// **'Expediee'**
  String get orderStatusSHIPPED;

  /// No description provided for @orderStatusOUT_FOR_DELIVERY.
  ///
  /// In fr, this message translates to:
  /// **'En livraison'**
  String get orderStatusOUT_FOR_DELIVERY;

  /// No description provided for @orderStatusDELIVERED.
  ///
  /// In fr, this message translates to:
  /// **'Livree'**
  String get orderStatusDELIVERED;

  /// No description provided for @orderStatusCANCELLED.
  ///
  /// In fr, this message translates to:
  /// **'Annulee'**
  String get orderStatusCANCELLED;

  /// No description provided for @orderStatusRETURNED.
  ///
  /// In fr, this message translates to:
  /// **'Retournee'**
  String get orderStatusRETURNED;

  /// No description provided for @checkoutSelectProvider.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez votre operateur'**
  String get checkoutSelectProvider;

  /// No description provided for @checkoutMpesa.
  ///
  /// In fr, this message translates to:
  /// **'M-Pesa (Vodacom)'**
  String get checkoutMpesa;

  /// No description provided for @checkoutAirtelMoney.
  ///
  /// In fr, this message translates to:
  /// **'Airtel Money'**
  String get checkoutAirtelMoney;

  /// No description provided for @checkoutOrangeMoney.
  ///
  /// In fr, this message translates to:
  /// **'Orange Money'**
  String get checkoutOrangeMoney;

  /// No description provided for @checkoutPayerPhone.
  ///
  /// In fr, this message translates to:
  /// **'Numero Mobile Money'**
  String get checkoutPayerPhone;

  /// No description provided for @checkoutPayerPhoneHint.
  ///
  /// In fr, this message translates to:
  /// **'+243...'**
  String get checkoutPayerPhoneHint;

  /// No description provided for @paymentPendingTitle.
  ///
  /// In fr, this message translates to:
  /// **'Paiement en attente'**
  String get paymentPendingTitle;

  /// No description provided for @paymentPendingInstructions.
  ///
  /// In fr, this message translates to:
  /// **'Vous allez recevoir une notification USSD sur votre telephone. Entrez votre code PIN pour confirmer.'**
  String get paymentPendingInstructions;

  /// No description provided for @paymentPendingChecking.
  ///
  /// In fr, this message translates to:
  /// **'Verification du paiement...'**
  String get paymentPendingChecking;

  /// No description provided for @paymentConfirmed.
  ///
  /// In fr, this message translates to:
  /// **'Paiement confirme !'**
  String get paymentConfirmed;

  /// No description provided for @paymentFailed.
  ///
  /// In fr, this message translates to:
  /// **'Le paiement a echoue'**
  String get paymentFailed;

  /// No description provided for @paymentRetry.
  ///
  /// In fr, this message translates to:
  /// **'Reessayer'**
  String get paymentRetry;

  /// No description provided for @paymentTimeout.
  ///
  /// In fr, this message translates to:
  /// **'Le delai de paiement a expire'**
  String get paymentTimeout;

  /// No description provided for @paymentTimeoutMessage.
  ///
  /// In fr, this message translates to:
  /// **'Vous pouvez reessayer depuis vos commandes.'**
  String get paymentTimeoutMessage;

  /// No description provided for @orderPaymentStatus.
  ///
  /// In fr, this message translates to:
  /// **'Statut du paiement'**
  String get orderPaymentStatus;

  /// No description provided for @paymentStatusPending.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get paymentStatusPending;

  /// No description provided for @paymentStatusCompleted.
  ///
  /// In fr, this message translates to:
  /// **'Paye'**
  String get paymentStatusCompleted;

  /// No description provided for @paymentStatusFailed.
  ///
  /// In fr, this message translates to:
  /// **'Echoue'**
  String get paymentStatusFailed;

  /// No description provided for @next.
  ///
  /// In fr, this message translates to:
  /// **'Suivant'**
  String get next;

  /// No description provided for @previous.
  ///
  /// In fr, this message translates to:
  /// **'Precedent'**
  String get previous;

  /// No description provided for @step.
  ///
  /// In fr, this message translates to:
  /// **'Etape {number}'**
  String step(int number);

  /// No description provided for @reviewsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Avis'**
  String get reviewsTitle;

  /// No description provided for @writeReview.
  ///
  /// In fr, this message translates to:
  /// **'Ecrire un avis'**
  String get writeReview;

  /// No description provided for @noReviews.
  ///
  /// In fr, this message translates to:
  /// **'Aucun avis pour le moment'**
  String get noReviews;

  /// No description provided for @reviewSubmitted.
  ///
  /// In fr, this message translates to:
  /// **'Avis soumis avec succes'**
  String get reviewSubmitted;

  /// No description provided for @reviewDeleted.
  ///
  /// In fr, this message translates to:
  /// **'Avis supprime'**
  String get reviewDeleted;

  /// No description provided for @outOf5.
  ///
  /// In fr, this message translates to:
  /// **'sur 5'**
  String get outOf5;

  /// No description provided for @verifiedBuyer.
  ///
  /// In fr, this message translates to:
  /// **'Acheteur verifie'**
  String get verifiedBuyer;

  /// No description provided for @alreadyReviewed.
  ///
  /// In fr, this message translates to:
  /// **'Vous avez deja donne votre avis'**
  String get alreadyReviewed;

  /// No description provided for @mustBeDelivered.
  ///
  /// In fr, this message translates to:
  /// **'La commande doit etre livree pour donner un avis'**
  String get mustBeDelivered;

  /// No description provided for @reviewPlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Partagez votre experience avec ce produit...'**
  String get reviewPlaceholder;

  /// No description provided for @submitReview.
  ///
  /// In fr, this message translates to:
  /// **'Soumettre l\'avis'**
  String get submitReview;

  /// No description provided for @deleteReview.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer l\'avis'**
  String get deleteReview;

  /// No description provided for @confirmDeleteReview.
  ///
  /// In fr, this message translates to:
  /// **'Voulez-vous supprimer votre avis ?'**
  String get confirmDeleteReview;

  /// No description provided for @seeAllReviews.
  ///
  /// In fr, this message translates to:
  /// **'Voir tous les avis'**
  String get seeAllReviews;

  /// No description provided for @yourRating.
  ///
  /// In fr, this message translates to:
  /// **'Votre note'**
  String get yourRating;

  /// No description provided for @stars.
  ///
  /// In fr, this message translates to:
  /// **'etoiles'**
  String get stars;

  /// No description provided for @wishlistTitle.
  ///
  /// In fr, this message translates to:
  /// **'Mes favoris'**
  String get wishlistTitle;

  /// No description provided for @wishlistEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucun favori'**
  String get wishlistEmpty;

  /// No description provided for @wishlistEmptyDesc.
  ///
  /// In fr, this message translates to:
  /// **'Ajoutez des produits a vos favoris pour les retrouver facilement'**
  String get wishlistEmptyDesc;

  /// No description provided for @addedToWishlist.
  ///
  /// In fr, this message translates to:
  /// **'Ajoute aux favoris'**
  String get addedToWishlist;

  /// No description provided for @removedFromWishlist.
  ///
  /// In fr, this message translates to:
  /// **'Retire des favoris'**
  String get removedFromWishlist;

  /// No description provided for @browseProducts.
  ///
  /// In fr, this message translates to:
  /// **'Decouvrir les produits'**
  String get browseProducts;

  /// No description provided for @removeFromWishlist.
  ///
  /// In fr, this message translates to:
  /// **'Retirer des favoris'**
  String get removeFromWishlist;

  /// No description provided for @messagesTitle.
  ///
  /// In fr, this message translates to:
  /// **'Messages'**
  String get messagesTitle;

  /// No description provided for @conversations.
  ///
  /// In fr, this message translates to:
  /// **'Conversations'**
  String get conversations;

  /// No description provided for @noConversations.
  ///
  /// In fr, this message translates to:
  /// **'Aucune conversation'**
  String get noConversations;

  /// No description provided for @noMessages.
  ///
  /// In fr, this message translates to:
  /// **'Aucun message. Commencez la conversation !'**
  String get noMessages;

  /// No description provided for @typePlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Ecrivez votre message...'**
  String get typePlaceholder;

  /// No description provided for @sendMessage.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer'**
  String get sendMessage;

  /// No description provided for @contactSeller.
  ///
  /// In fr, this message translates to:
  /// **'Contacter le vendeur'**
  String get contactSeller;

  /// No description provided for @you.
  ///
  /// In fr, this message translates to:
  /// **'Vous'**
  String get you;

  /// No description provided for @loadOlderMessages.
  ///
  /// In fr, this message translates to:
  /// **'Charger les messages precedents'**
  String get loadOlderMessages;

  /// No description provided for @unreadMessages.
  ///
  /// In fr, this message translates to:
  /// **'Messages non lus'**
  String get unreadMessages;

  /// No description provided for @flashDeals.
  ///
  /// In fr, this message translates to:
  /// **'Ventes Flash'**
  String get flashDeals;

  /// No description provided for @endsIn.
  ///
  /// In fr, this message translates to:
  /// **'Se termine dans'**
  String get endsIn;

  /// No description provided for @discount.
  ///
  /// In fr, this message translates to:
  /// **'Reduction'**
  String get discount;

  /// No description provided for @originalPrice.
  ///
  /// In fr, this message translates to:
  /// **'Prix original'**
  String get originalPrice;

  /// No description provided for @seeAllDeals.
  ///
  /// In fr, this message translates to:
  /// **'Voir toutes les offres'**
  String get seeAllDeals;

  /// No description provided for @faq.
  ///
  /// In fr, this message translates to:
  /// **'FAQ'**
  String get faq;

  /// No description provided for @termsAndConditions.
  ///
  /// In fr, this message translates to:
  /// **'Conditions generales'**
  String get termsAndConditions;

  /// No description provided for @privacyPolicy.
  ///
  /// In fr, this message translates to:
  /// **'Politique de confidentialite'**
  String get privacyPolicy;

  /// No description provided for @helpCenter.
  ///
  /// In fr, this message translates to:
  /// **'Centre d\'aide'**
  String get helpCenter;

  /// No description provided for @aboutUs.
  ///
  /// In fr, this message translates to:
  /// **'A propos'**
  String get aboutUs;

  /// No description provided for @pageNotFound.
  ///
  /// In fr, this message translates to:
  /// **'Page non trouvee'**
  String get pageNotFound;

  /// No description provided for @contentPages.
  ///
  /// In fr, this message translates to:
  /// **'Pages'**
  String get contentPages;

  /// No description provided for @shopNow.
  ///
  /// In fr, this message translates to:
  /// **'Acheter maintenant'**
  String get shopNow;

  /// No description provided for @learnMore.
  ///
  /// In fr, this message translates to:
  /// **'En savoir plus'**
  String get learnMore;

  /// No description provided for @selectCity.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez votre ville'**
  String get selectCity;

  /// No description provided for @selectCityDescription.
  ///
  /// In fr, this message translates to:
  /// **'Pour voir les produits disponibles'**
  String get selectCityDescription;

  /// No description provided for @currentCity.
  ///
  /// In fr, this message translates to:
  /// **'Ville'**
  String get currentCity;

  /// No description provided for @changeCity.
  ///
  /// In fr, this message translates to:
  /// **'Changer'**
  String get changeCity;

  /// No description provided for @addAddress.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter une adresse'**
  String get addAddress;

  /// No description provided for @newAddress.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelle adresse'**
  String get newAddress;

  /// No description provided for @cityLabel.
  ///
  /// In fr, this message translates to:
  /// **'Ville'**
  String get cityLabel;

  /// No description provided for @cityPlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Selectionnez une ville'**
  String get cityPlaceholder;

  /// No description provided for @communeLabel.
  ///
  /// In fr, this message translates to:
  /// **'Commune'**
  String get communeLabel;

  /// No description provided for @communePlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Selectionnez une commune'**
  String get communePlaceholder;

  /// No description provided for @loadingCities.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des villes...'**
  String get loadingCities;

  /// No description provided for @loadingCommunes.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des communes...'**
  String get loadingCommunes;

  /// No description provided for @avenueLabel.
  ///
  /// In fr, this message translates to:
  /// **'Avenue / Rue'**
  String get avenueLabel;

  /// No description provided for @avenueHint.
  ///
  /// In fr, this message translates to:
  /// **'Ex: Av. Lumumba n24'**
  String get avenueHint;

  /// No description provided for @referenceLabel.
  ///
  /// In fr, this message translates to:
  /// **'Point de repere'**
  String get referenceLabel;

  /// No description provided for @referenceHint.
  ///
  /// In fr, this message translates to:
  /// **'Ex: En face de la pharmacie'**
  String get referenceHint;

  /// No description provided for @recipientNameLabel.
  ///
  /// In fr, this message translates to:
  /// **'Nom du destinataire'**
  String get recipientNameLabel;

  /// No description provided for @recipientNameHint.
  ///
  /// In fr, this message translates to:
  /// **'Nom complet'**
  String get recipientNameHint;

  /// No description provided for @recipientPhoneLabel.
  ///
  /// In fr, this message translates to:
  /// **'Telephone du destinataire'**
  String get recipientPhoneLabel;

  /// No description provided for @recipientPhoneHint.
  ///
  /// In fr, this message translates to:
  /// **'+243...'**
  String get recipientPhoneHint;

  /// No description provided for @saveAddress.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrer'**
  String get saveAddress;

  /// No description provided for @savingAddress.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrement...'**
  String get savingAddress;

  /// No description provided for @addressSaved.
  ///
  /// In fr, this message translates to:
  /// **'Adresse enregistree'**
  String get addressSaved;

  /// No description provided for @addressError.
  ///
  /// In fr, this message translates to:
  /// **'Erreur lors de l\'enregistrement'**
  String get addressError;

  /// No description provided for @cityRequired.
  ///
  /// In fr, this message translates to:
  /// **'Selectionnez une ville'**
  String get cityRequired;

  /// No description provided for @communeRequired.
  ///
  /// In fr, this message translates to:
  /// **'Selectionnez une commune'**
  String get communeRequired;

  /// No description provided for @cancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler'**
  String get cancel;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
