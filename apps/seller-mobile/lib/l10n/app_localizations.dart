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
  /// **'Creer mon compte vendeur'**
  String get authCreateAccount;

  /// No description provided for @authCreateAccountTitle.
  ///
  /// In fr, this message translates to:
  /// **'Creer un compte vendeur'**
  String get authCreateAccountTitle;

  /// No description provided for @authNoAccount.
  ///
  /// In fr, this message translates to:
  /// **'Pas de compte vendeur ?'**
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

  /// No description provided for @authSellerSpace.
  ///
  /// In fr, this message translates to:
  /// **'Espace Vendeur'**
  String get authSellerSpace;

  /// No description provided for @authWrongRoleTitle.
  ///
  /// In fr, this message translates to:
  /// **'Compte acheteur detecte'**
  String get authWrongRoleTitle;

  /// No description provided for @authWrongRoleMessage.
  ///
  /// In fr, this message translates to:
  /// **'Votre compte est enregistre en tant qu\'acheteur. Cette application est reservee aux vendeurs.'**
  String get authWrongRoleMessage;

  /// No description provided for @authCreateSellerAccount.
  ///
  /// In fr, this message translates to:
  /// **'Creer un compte vendeur'**
  String get authCreateSellerAccount;

  /// No description provided for @authSellerAccountNote.
  ///
  /// In fr, this message translates to:
  /// **'Votre compte sera cree en tant que vendeur.'**
  String get authSellerAccountNote;

  /// No description provided for @productsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Produits'**
  String get productsTitle;

  /// No description provided for @newProduct.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau produit'**
  String get newProduct;

  /// No description provided for @editProduct.
  ///
  /// In fr, this message translates to:
  /// **'Modifier le produit'**
  String get editProduct;

  /// No description provided for @productCreated.
  ///
  /// In fr, this message translates to:
  /// **'Produit cree avec succes'**
  String get productCreated;

  /// No description provided for @productUpdated.
  ///
  /// In fr, this message translates to:
  /// **'Produit mis a jour'**
  String get productUpdated;

  /// No description provided for @productArchived.
  ///
  /// In fr, this message translates to:
  /// **'Produit archive'**
  String get productArchived;

  /// No description provided for @productSubmitted.
  ///
  /// In fr, this message translates to:
  /// **'Produit soumis pour revision'**
  String get productSubmitted;

  /// No description provided for @statusDraft.
  ///
  /// In fr, this message translates to:
  /// **'Brouillon'**
  String get statusDraft;

  /// No description provided for @statusPendingReview.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get statusPendingReview;

  /// No description provided for @statusActive.
  ///
  /// In fr, this message translates to:
  /// **'Actif'**
  String get statusActive;

  /// No description provided for @statusRejected.
  ///
  /// In fr, this message translates to:
  /// **'Rejete'**
  String get statusRejected;

  /// No description provided for @statusArchived.
  ///
  /// In fr, this message translates to:
  /// **'Archive'**
  String get statusArchived;

  /// No description provided for @allStatuses.
  ///
  /// In fr, this message translates to:
  /// **'Tous'**
  String get allStatuses;

  /// No description provided for @filterByStatus.
  ///
  /// In fr, this message translates to:
  /// **'Filtrer par statut'**
  String get filterByStatus;

  /// No description provided for @titleFr.
  ///
  /// In fr, this message translates to:
  /// **'Titre (francais)'**
  String get titleFr;

  /// No description provided for @titleEn.
  ///
  /// In fr, this message translates to:
  /// **'Titre (anglais)'**
  String get titleEn;

  /// No description provided for @descriptionFr.
  ///
  /// In fr, this message translates to:
  /// **'Description (francais)'**
  String get descriptionFr;

  /// No description provided for @descriptionEn.
  ///
  /// In fr, this message translates to:
  /// **'Description (anglais)'**
  String get descriptionEn;

  /// No description provided for @priceCDF.
  ///
  /// In fr, this message translates to:
  /// **'Prix CDF'**
  String get priceCDF;

  /// No description provided for @priceUSD.
  ///
  /// In fr, this message translates to:
  /// **'Prix USD'**
  String get priceUSD;

  /// No description provided for @quantity.
  ///
  /// In fr, this message translates to:
  /// **'Quantite'**
  String get quantity;

  /// No description provided for @condition.
  ///
  /// In fr, this message translates to:
  /// **'Etat'**
  String get condition;

  /// No description provided for @conditionNew.
  ///
  /// In fr, this message translates to:
  /// **'Neuf'**
  String get conditionNew;

  /// No description provided for @conditionUsed.
  ///
  /// In fr, this message translates to:
  /// **'Occasion'**
  String get conditionUsed;

  /// No description provided for @category.
  ///
  /// In fr, this message translates to:
  /// **'Categorie'**
  String get category;

  /// No description provided for @selectCategory.
  ///
  /// In fr, this message translates to:
  /// **'Selectionner une categorie'**
  String get selectCategory;

  /// No description provided for @images.
  ///
  /// In fr, this message translates to:
  /// **'Images'**
  String get images;

  /// No description provided for @uploadImage.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter'**
  String get uploadImage;

  /// No description provided for @deleteImage.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer l\'image'**
  String get deleteImage;

  /// No description provided for @maxImagesReached.
  ///
  /// In fr, this message translates to:
  /// **'Maximum atteint'**
  String get maxImagesReached;

  /// No description provided for @imageUploaded.
  ///
  /// In fr, this message translates to:
  /// **'Image ajoutee'**
  String get imageUploaded;

  /// No description provided for @imageDeleted.
  ///
  /// In fr, this message translates to:
  /// **'Image supprimee'**
  String get imageDeleted;

  /// No description provided for @imagesCount.
  ///
  /// In fr, this message translates to:
  /// **'{current}/{max} images'**
  String imagesCount(int current, int max);

  /// No description provided for @submitForReview.
  ///
  /// In fr, this message translates to:
  /// **'Soumettre pour revision'**
  String get submitForReview;

  /// No description provided for @confirmSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Voulez-vous soumettre ce produit pour revision ? Il sera examine par notre equipe.'**
  String get confirmSubmit;

  /// No description provided for @confirmArchive.
  ///
  /// In fr, this message translates to:
  /// **'Voulez-vous archiver ce produit ? Il ne sera plus visible par les acheteurs.'**
  String get confirmArchive;

  /// No description provided for @archive.
  ///
  /// In fr, this message translates to:
  /// **'Archiver'**
  String get archive;

  /// No description provided for @rejectionReason.
  ///
  /// In fr, this message translates to:
  /// **'Motif du rejet'**
  String get rejectionReason;

  /// No description provided for @specifications.
  ///
  /// In fr, this message translates to:
  /// **'Specifications'**
  String get specifications;

  /// No description provided for @save.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrer'**
  String get save;

  /// No description provided for @cancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler'**
  String get cancel;

  /// No description provided for @noProducts.
  ///
  /// In fr, this message translates to:
  /// **'Aucun produit pour le moment'**
  String get noProducts;

  /// No description provided for @loadMore.
  ///
  /// In fr, this message translates to:
  /// **'Reessayer'**
  String get loadMore;

  /// No description provided for @totalProducts.
  ///
  /// In fr, this message translates to:
  /// **'Total produits'**
  String get totalProducts;

  /// No description provided for @activeProducts.
  ///
  /// In fr, this message translates to:
  /// **'Actifs'**
  String get activeProducts;

  /// No description provided for @pendingProducts.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get pendingProducts;

  /// No description provided for @draftProducts.
  ///
  /// In fr, this message translates to:
  /// **'Brouillons'**
  String get draftProducts;

  /// No description provided for @dashboard.
  ///
  /// In fr, this message translates to:
  /// **'Accueil'**
  String get dashboard;

  /// No description provided for @products.
  ///
  /// In fr, this message translates to:
  /// **'Produits'**
  String get products;

  /// No description provided for @profile.
  ///
  /// In fr, this message translates to:
  /// **'Profil'**
  String get profile;

  /// No description provided for @ordersTitle.
  ///
  /// In fr, this message translates to:
  /// **'Commandes'**
  String get ordersTitle;

  /// No description provided for @ordersEmpty.
  ///
  /// In fr, this message translates to:
  /// **'Aucune commande'**
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

  /// No description provided for @ordersProcessing.
  ///
  /// In fr, this message translates to:
  /// **'En preparation'**
  String get ordersProcessing;

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

  /// No description provided for @orderBuyer.
  ///
  /// In fr, this message translates to:
  /// **'Acheteur'**
  String get orderBuyer;

  /// No description provided for @orderPhone.
  ///
  /// In fr, this message translates to:
  /// **'Telephone'**
  String get orderPhone;

  /// No description provided for @orderDate.
  ///
  /// In fr, this message translates to:
  /// **'Date'**
  String get orderDate;

  /// No description provided for @orderItems.
  ///
  /// In fr, this message translates to:
  /// **'{count} article(s)'**
  String orderItems(int count);

  /// No description provided for @orderTotal.
  ///
  /// In fr, this message translates to:
  /// **'Total'**
  String get orderTotal;

  /// No description provided for @orderSubtotal.
  ///
  /// In fr, this message translates to:
  /// **'Sous-total'**
  String get orderSubtotal;

  /// No description provided for @orderDeliveryFee.
  ///
  /// In fr, this message translates to:
  /// **'Frais de livraison'**
  String get orderDeliveryFee;

  /// No description provided for @orderDeliveryAddress.
  ///
  /// In fr, this message translates to:
  /// **'Adresse de livraison'**
  String get orderDeliveryAddress;

  /// No description provided for @orderBuyerNote.
  ///
  /// In fr, this message translates to:
  /// **'Note de l\'acheteur'**
  String get orderBuyerNote;

  /// No description provided for @orderTimeline.
  ///
  /// In fr, this message translates to:
  /// **'Historique'**
  String get orderTimeline;

  /// No description provided for @orderConfirm.
  ///
  /// In fr, this message translates to:
  /// **'Confirmer'**
  String get orderConfirm;

  /// No description provided for @orderReject.
  ///
  /// In fr, this message translates to:
  /// **'Rejeter'**
  String get orderReject;

  /// No description provided for @orderProcess.
  ///
  /// In fr, this message translates to:
  /// **'Preparer'**
  String get orderProcess;

  /// No description provided for @orderShip.
  ///
  /// In fr, this message translates to:
  /// **'Expedier'**
  String get orderShip;

  /// No description provided for @orderOutForDelivery.
  ///
  /// In fr, this message translates to:
  /// **'En livraison'**
  String get orderOutForDelivery;

  /// No description provided for @orderDeliver.
  ///
  /// In fr, this message translates to:
  /// **'Livrer'**
  String get orderDeliver;

  /// No description provided for @orderRejectReason.
  ///
  /// In fr, this message translates to:
  /// **'Raison du rejet'**
  String get orderRejectReason;

  /// No description provided for @orderRejectHint.
  ///
  /// In fr, this message translates to:
  /// **'Expliquez la raison...'**
  String get orderRejectHint;

  /// No description provided for @orderActionConfirm.
  ///
  /// In fr, this message translates to:
  /// **'Confirmer cette action ?'**
  String get orderActionConfirm;

  /// No description provided for @orderActionSuccess.
  ///
  /// In fr, this message translates to:
  /// **'Action effectuee'**
  String get orderActionSuccess;

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
  // ignore: non_constant_identifier_names
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

  /// No description provided for @earningsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Revenus'**
  String get earningsTitle;

  /// No description provided for @earningsWalletBalance.
  ///
  /// In fr, this message translates to:
  /// **'Solde disponible'**
  String get earningsWalletBalance;

  /// No description provided for @earningsTotalEarned.
  ///
  /// In fr, this message translates to:
  /// **'Revenus totaux'**
  String get earningsTotalEarned;

  /// No description provided for @earningsTotalCommission.
  ///
  /// In fr, this message translates to:
  /// **'Commission prelevee'**
  String get earningsTotalCommission;

  /// No description provided for @earningsRequestPayout.
  ///
  /// In fr, this message translates to:
  /// **'Demander un virement'**
  String get earningsRequestPayout;

  /// No description provided for @earningsTabEarnings.
  ///
  /// In fr, this message translates to:
  /// **'Gains'**
  String get earningsTabEarnings;

  /// No description provided for @earningsTabPayouts.
  ///
  /// In fr, this message translates to:
  /// **'Virements'**
  String get earningsTabPayouts;

  /// No description provided for @earningsNoEarnings.
  ///
  /// In fr, this message translates to:
  /// **'Aucun revenu pour le moment'**
  String get earningsNoEarnings;

  /// No description provided for @earningsNoPayouts.
  ///
  /// In fr, this message translates to:
  /// **'Aucun virement pour le moment'**
  String get earningsNoPayouts;

  /// No description provided for @earningsAvailable.
  ///
  /// In fr, this message translates to:
  /// **'Disponible'**
  String get earningsAvailable;

  /// No description provided for @earningsPaid.
  ///
  /// In fr, this message translates to:
  /// **'Paye'**
  String get earningsPaid;

  /// No description provided for @payoutFormTitle.
  ///
  /// In fr, this message translates to:
  /// **'Demande de virement'**
  String get payoutFormTitle;

  /// No description provided for @payoutSelectOperator.
  ///
  /// In fr, this message translates to:
  /// **'Operateur Mobile Money'**
  String get payoutSelectOperator;

  /// No description provided for @payoutPhone.
  ///
  /// In fr, this message translates to:
  /// **'Numero de reception'**
  String get payoutPhone;

  /// No description provided for @payoutPhoneHint.
  ///
  /// In fr, this message translates to:
  /// **'+243...'**
  String get payoutPhoneHint;

  /// No description provided for @payoutCurrentBalance.
  ///
  /// In fr, this message translates to:
  /// **'Solde actuel'**
  String get payoutCurrentBalance;

  /// No description provided for @payoutSubmit.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer la demande'**
  String get payoutSubmit;

  /// No description provided for @payoutMinimumBalance.
  ///
  /// In fr, this message translates to:
  /// **'Solde minimum: 5 000 CDF'**
  String get payoutMinimumBalance;

  /// No description provided for @payoutSuccess.
  ///
  /// In fr, this message translates to:
  /// **'Demande envoyee avec succes'**
  String get payoutSuccess;

  /// No description provided for @payoutStatusRequested.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get payoutStatusRequested;

  /// No description provided for @payoutStatusApproved.
  ///
  /// In fr, this message translates to:
  /// **'Approuve'**
  String get payoutStatusApproved;

  /// No description provided for @payoutStatusProcessing.
  ///
  /// In fr, this message translates to:
  /// **'En traitement'**
  String get payoutStatusProcessing;

  /// No description provided for @payoutStatusCompleted.
  ///
  /// In fr, this message translates to:
  /// **'Complete'**
  String get payoutStatusCompleted;

  /// No description provided for @payoutStatusRejected.
  ///
  /// In fr, this message translates to:
  /// **'Rejete'**
  String get payoutStatusRejected;

  /// No description provided for @orderPaymentMethod.
  ///
  /// In fr, this message translates to:
  /// **'Mode de paiement'**
  String get orderPaymentMethod;

  /// No description provided for @orderPaymentStatus.
  ///
  /// In fr, this message translates to:
  /// **'Statut du paiement'**
  String get orderPaymentStatus;

  /// No description provided for @paymentCOD.
  ///
  /// In fr, this message translates to:
  /// **'Paiement a la livraison'**
  String get paymentCOD;

  /// No description provided for @paymentMobileMoney.
  ///
  /// In fr, this message translates to:
  /// **'Mobile Money'**
  String get paymentMobileMoney;

  /// No description provided for @paymentPending.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get paymentPending;

  /// No description provided for @paymentCompleted.
  ///
  /// In fr, this message translates to:
  /// **'Paye'**
  String get paymentCompleted;

  /// No description provided for @paymentFailed.
  ///
  /// In fr, this message translates to:
  /// **'Echoue'**
  String get paymentFailed;

  /// No description provided for @reviewsTitle.
  ///
  /// In fr, this message translates to:
  /// **'Avis clients'**
  String get reviewsTitle;

  /// No description provided for @averageRating.
  ///
  /// In fr, this message translates to:
  /// **'Note moyenne'**
  String get averageRating;

  /// No description provided for @totalReviews.
  ///
  /// In fr, this message translates to:
  /// **'avis'**
  String get totalReviews;

  /// No description provided for @recentReviews.
  ///
  /// In fr, this message translates to:
  /// **'Avis recents'**
  String get recentReviews;

  /// No description provided for @noReviews.
  ///
  /// In fr, this message translates to:
  /// **'Aucun avis'**
  String get noReviews;

  /// No description provided for @noReviewsDesc.
  ///
  /// In fr, this message translates to:
  /// **'Ce produit n\'a pas encore recu d\'avis de la part des acheteurs.'**
  String get noReviewsDesc;

  /// No description provided for @filterByProduct.
  ///
  /// In fr, this message translates to:
  /// **'Filtrer par produit'**
  String get filterByProduct;

  /// No description provided for @allProducts.
  ///
  /// In fr, this message translates to:
  /// **'Tous les produits'**
  String get allProducts;

  /// No description provided for @stars.
  ///
  /// In fr, this message translates to:
  /// **'etoiles'**
  String get stars;

  /// No description provided for @star.
  ///
  /// In fr, this message translates to:
  /// **'etoile'**
  String get star;

  /// No description provided for @outOf5.
  ///
  /// In fr, this message translates to:
  /// **'sur 5'**
  String get outOf5;

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

  /// No description provided for @noConversationsDesc.
  ///
  /// In fr, this message translates to:
  /// **'Les messages des acheteurs concernant vos produits apparaitront ici.'**
  String get noConversationsDesc;

  /// No description provided for @noMessages.
  ///
  /// In fr, this message translates to:
  /// **'Aucun message'**
  String get noMessages;

  /// No description provided for @typePlaceholder.
  ///
  /// In fr, this message translates to:
  /// **'Ecrire un message...'**
  String get typePlaceholder;

  /// No description provided for @sendMessage.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer'**
  String get sendMessage;

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

  /// No description provided for @promotionPromotions.
  ///
  /// In fr, this message translates to:
  /// **'Promotions'**
  String get promotionPromotions;

  /// No description provided for @promotionMyPromotions.
  ///
  /// In fr, this message translates to:
  /// **'Mes promotions'**
  String get promotionMyPromotions;

  /// No description provided for @promotionCreate.
  ///
  /// In fr, this message translates to:
  /// **'Creer une promotion'**
  String get promotionCreate;

  /// No description provided for @promotionType.
  ///
  /// In fr, this message translates to:
  /// **'Type de promotion'**
  String get promotionType;

  /// No description provided for @promotionPromotion.
  ///
  /// In fr, this message translates to:
  /// **'Promotion'**
  String get promotionPromotion;

  /// No description provided for @promotionFlashDeal.
  ///
  /// In fr, this message translates to:
  /// **'Vente Flash'**
  String get promotionFlashDeal;

  /// No description provided for @promotionDiscountType.
  ///
  /// In fr, this message translates to:
  /// **'Type de reduction'**
  String get promotionDiscountType;

  /// No description provided for @promotionDiscountPercent.
  ///
  /// In fr, this message translates to:
  /// **'Pourcentage de reduction'**
  String get promotionDiscountPercent;

  /// No description provided for @promotionDiscountAmount.
  ///
  /// In fr, this message translates to:
  /// **'Montant fixe (CDF)'**
  String get promotionDiscountAmount;

  /// No description provided for @promotionSelectProduct.
  ///
  /// In fr, this message translates to:
  /// **'Selectionner un produit'**
  String get promotionSelectProduct;

  /// No description provided for @promotionStartDate.
  ///
  /// In fr, this message translates to:
  /// **'Date de debut'**
  String get promotionStartDate;

  /// No description provided for @promotionEndDate.
  ///
  /// In fr, this message translates to:
  /// **'Date de fin'**
  String get promotionEndDate;

  /// No description provided for @promotionPendingApproval.
  ///
  /// In fr, this message translates to:
  /// **'En attente d\'approbation'**
  String get promotionPendingApproval;

  /// No description provided for @promotionApproved.
  ///
  /// In fr, this message translates to:
  /// **'Approuvee'**
  String get promotionApproved;

  /// No description provided for @promotionRejected.
  ///
  /// In fr, this message translates to:
  /// **'Refusee'**
  String get promotionRejected;

  /// No description provided for @promotionExpired.
  ///
  /// In fr, this message translates to:
  /// **'Expiree'**
  String get promotionExpired;

  /// No description provided for @promotionCancelled.
  ///
  /// In fr, this message translates to:
  /// **'Annulee'**
  String get promotionCancelled;

  /// No description provided for @promotionCancel.
  ///
  /// In fr, this message translates to:
  /// **'Annuler la promotion'**
  String get promotionCancel;

  /// No description provided for @promotionConfirmCancel.
  ///
  /// In fr, this message translates to:
  /// **'Etes-vous sur de vouloir annuler cette promotion ?'**
  String get promotionConfirmCancel;

  /// No description provided for @promotionCreated.
  ///
  /// In fr, this message translates to:
  /// **'Promotion creee avec succes'**
  String get promotionCreated;

  /// No description provided for @promotionNoPromotions.
  ///
  /// In fr, this message translates to:
  /// **'Aucune promotion'**
  String get promotionNoPromotions;

  /// No description provided for @promotionCreateFirst.
  ///
  /// In fr, this message translates to:
  /// **'Creez votre premiere promotion pour augmenter vos ventes'**
  String get promotionCreateFirst;

  /// No description provided for @promotionRejectionReason.
  ///
  /// In fr, this message translates to:
  /// **'Raison du refus'**
  String get promotionRejectionReason;

  /// No description provided for @promotionSubmitForApproval.
  ///
  /// In fr, this message translates to:
  /// **'Soumettre pour approbation'**
  String get promotionSubmitForApproval;
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
