// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Teka RDC';

  @override
  String get home => 'Home';

  @override
  String get search => 'Search';

  @override
  String get login => 'Log in';

  @override
  String get register => 'Sign up';

  @override
  String get welcome => 'Welcome to Teka RDC';

  @override
  String get subtitle => 'Your online marketplace in DR Congo';

  @override
  String get authPhoneLabel => 'Phone number';

  @override
  String get authPhoneHint => '09XX XXX XXX';

  @override
  String get authPhoneRequired => 'Please enter your phone number';

  @override
  String get authPhoneInvalid => 'Invalid phone number';

  @override
  String get authSendCode => 'Send code';

  @override
  String get authVerification => 'Verification';

  @override
  String get authVerificationTitle => 'Verification code';

  @override
  String authVerificationSubtitle(String phone) {
    return 'A 6-digit code has been sent to $phone';
  }

  @override
  String get authResendCode => 'Resend code';

  @override
  String authResendIn(int seconds) {
    return 'Resend code in $seconds s';
  }

  @override
  String get authInvalidCode => 'Invalid code. Please try again.';

  @override
  String get authCreateAccount => 'Create my seller account';

  @override
  String get authCreateAccountTitle => 'Create a seller account';

  @override
  String get authNoAccount => 'No seller account?';

  @override
  String get authHasAccount => 'Already have an account?';

  @override
  String get authFirstName => 'First name';

  @override
  String get authFirstNameHint => 'Enter your first name';

  @override
  String get authFirstNameRequired => 'Please enter your first name';

  @override
  String get authLastName => 'Last name';

  @override
  String get authLastNameHint => 'Enter your last name';

  @override
  String get authLastNameRequired => 'Please enter your last name';

  @override
  String get authStep1 => 'Step 1: Verify your number';

  @override
  String get authStep2 => 'Step 2: Your information';

  @override
  String get authNumberVerified => 'Number verified';

  @override
  String get authEnterSmsCode => 'Enter the code received by SMS';

  @override
  String get authSendError => 'Could not send code. Please try again.';

  @override
  String get authGenericError => 'An error occurred. Please try again.';

  @override
  String get authCreateError => 'Could not create account. Please try again.';

  @override
  String get authLogout => 'Log out';

  @override
  String get authProfile => 'My profile';

  @override
  String get authSellerSpace => 'Seller Space';

  @override
  String get authWrongRoleTitle => 'Buyer account detected';

  @override
  String get authWrongRoleMessage =>
      'Your account is registered as a buyer. This app is for sellers only.';

  @override
  String get authCreateSellerAccount => 'Create a seller account';

  @override
  String get authSellerAccountNote =>
      'Your account will be created as a seller.';

  @override
  String get productsTitle => 'Products';

  @override
  String get newProduct => 'New product';

  @override
  String get editProduct => 'Edit product';

  @override
  String get productCreated => 'Product created successfully';

  @override
  String get productUpdated => 'Product updated';

  @override
  String get productArchived => 'Product archived';

  @override
  String get productSubmitted => 'Product submitted for review';

  @override
  String get statusDraft => 'Draft';

  @override
  String get statusPendingReview => 'Pending';

  @override
  String get statusActive => 'Active';

  @override
  String get statusRejected => 'Rejected';

  @override
  String get statusArchived => 'Archived';

  @override
  String get allStatuses => 'All';

  @override
  String get filterByStatus => 'Filter by status';

  @override
  String get titleFr => 'Title (French)';

  @override
  String get titleEn => 'Title (English)';

  @override
  String get descriptionFr => 'Description (French)';

  @override
  String get descriptionEn => 'Description (English)';

  @override
  String get priceCDF => 'Price CDF';

  @override
  String get priceUSD => 'Price USD';

  @override
  String get quantity => 'Quantity';

  @override
  String get condition => 'Condition';

  @override
  String get conditionNew => 'New';

  @override
  String get conditionUsed => 'Used';

  @override
  String get category => 'Category';

  @override
  String get selectCategory => 'Select a category';

  @override
  String get images => 'Images';

  @override
  String get uploadImage => 'Add';

  @override
  String get deleteImage => 'Delete image';

  @override
  String get maxImagesReached => 'Maximum reached';

  @override
  String get imageUploaded => 'Image added';

  @override
  String get imageDeleted => 'Image deleted';

  @override
  String imagesCount(int current, int max) {
    return '$current/$max images';
  }

  @override
  String get submitForReview => 'Submit for review';

  @override
  String get confirmSubmit =>
      'Do you want to submit this product for review? It will be examined by our team.';

  @override
  String get confirmArchive =>
      'Do you want to archive this product? It will no longer be visible to buyers.';

  @override
  String get archive => 'Archive';

  @override
  String get rejectionReason => 'Rejection reason';

  @override
  String get specifications => 'Specifications';

  @override
  String get save => 'Save';

  @override
  String get cancel => 'Cancel';

  @override
  String get noProducts => 'No products yet';

  @override
  String get loadMore => 'Retry';

  @override
  String get totalProducts => 'Total products';

  @override
  String get activeProducts => 'Active';

  @override
  String get pendingProducts => 'Pending';

  @override
  String get draftProducts => 'Drafts';

  @override
  String get dashboard => 'Home';

  @override
  String get products => 'Products';

  @override
  String get profile => 'Profile';

  @override
  String get ordersTitle => 'Orders';

  @override
  String get ordersEmpty => 'No orders';

  @override
  String get ordersAll => 'All';

  @override
  String get ordersPending => 'Pending';

  @override
  String get ordersConfirmed => 'Confirmed';

  @override
  String get ordersProcessing => 'Processing';

  @override
  String get ordersShipped => 'Shipped';

  @override
  String get ordersDelivered => 'Delivered';

  @override
  String get ordersCancelled => 'Cancelled';

  @override
  String orderNumber(String number) {
    return 'Order $number';
  }

  @override
  String get orderBuyer => 'Buyer';

  @override
  String get orderPhone => 'Phone';

  @override
  String get orderDate => 'Date';

  @override
  String orderItems(int count) {
    return '$count item(s)';
  }

  @override
  String get orderTotal => 'Total';

  @override
  String get orderSubtotal => 'Subtotal';

  @override
  String get orderDeliveryFee => 'Delivery fee';

  @override
  String get orderDeliveryAddress => 'Delivery address';

  @override
  String get orderBuyerNote => 'Buyer note';

  @override
  String get orderTimeline => 'Timeline';

  @override
  String get orderConfirm => 'Confirm';

  @override
  String get orderReject => 'Reject';

  @override
  String get orderProcess => 'Process';

  @override
  String get orderShip => 'Ship';

  @override
  String get orderOutForDelivery => 'Out for delivery';

  @override
  String get orderDeliver => 'Deliver';

  @override
  String get orderRejectReason => 'Rejection reason';

  @override
  String get orderRejectHint => 'Explain the reason...';

  @override
  String get orderActionConfirm => 'Confirm this action?';

  @override
  String get orderActionSuccess => 'Action completed';

  @override
  String get orderStatusPENDING => 'Pending';

  @override
  String get orderStatusCONFIRMED => 'Confirmed';

  @override
  String get orderStatusPROCESSING => 'Processing';

  @override
  String get orderStatusSHIPPED => 'Shipped';

  @override
  String get orderStatusOUT_FOR_DELIVERY => 'Out for delivery';

  @override
  String get orderStatusDELIVERED => 'Delivered';

  @override
  String get orderStatusCANCELLED => 'Cancelled';

  @override
  String get orderStatusRETURNED => 'Returned';

  @override
  String get earningsTitle => 'Earnings';

  @override
  String get earningsWalletBalance => 'Available balance';

  @override
  String get earningsTotalEarned => 'Total earned';

  @override
  String get earningsTotalCommission => 'Commission charged';

  @override
  String get earningsRequestPayout => 'Request payout';

  @override
  String get earningsTabEarnings => 'Earnings';

  @override
  String get earningsTabPayouts => 'Payouts';

  @override
  String get earningsNoEarnings => 'No earnings yet';

  @override
  String get earningsNoPayouts => 'No payouts yet';

  @override
  String get earningsAvailable => 'Available';

  @override
  String get earningsPaid => 'Paid';

  @override
  String get payoutFormTitle => 'Payout request';

  @override
  String get payoutSelectOperator => 'Mobile Money operator';

  @override
  String get payoutPhone => 'Receiving number';

  @override
  String get payoutPhoneHint => '+243...';

  @override
  String get payoutCurrentBalance => 'Current balance';

  @override
  String get payoutSubmit => 'Submit request';

  @override
  String get payoutMinimumBalance => 'Minimum balance: 5,000 CDF';

  @override
  String get payoutSuccess => 'Request submitted successfully';

  @override
  String get payoutStatusRequested => 'Pending';

  @override
  String get payoutStatusApproved => 'Approved';

  @override
  String get payoutStatusProcessing => 'Processing';

  @override
  String get payoutStatusCompleted => 'Completed';

  @override
  String get payoutStatusRejected => 'Rejected';

  @override
  String get orderPaymentMethod => 'Payment method';

  @override
  String get orderPaymentStatus => 'Payment status';

  @override
  String get paymentCOD => 'Cash on delivery';

  @override
  String get paymentMobileMoney => 'Mobile Money';

  @override
  String get paymentPending => 'Pending';

  @override
  String get paymentCompleted => 'Paid';

  @override
  String get paymentFailed => 'Failed';

  @override
  String get reviewsTitle => 'Customer Reviews';

  @override
  String get averageRating => 'Average rating';

  @override
  String get totalReviews => 'reviews';

  @override
  String get recentReviews => 'Recent reviews';

  @override
  String get noReviews => 'No reviews';

  @override
  String get noReviewsDesc =>
      'This product has not received any reviews from buyers yet.';

  @override
  String get filterByProduct => 'Filter by product';

  @override
  String get allProducts => 'All products';

  @override
  String get stars => 'stars';

  @override
  String get star => 'star';

  @override
  String get outOf5 => 'out of 5';

  @override
  String get messagesTitle => 'Messages';

  @override
  String get conversations => 'Conversations';

  @override
  String get noConversations => 'No conversations';

  @override
  String get noConversationsDesc =>
      'Messages from buyers about your products will appear here.';

  @override
  String get noMessages => 'No messages';

  @override
  String get typePlaceholder => 'Write a message...';

  @override
  String get sendMessage => 'Send';

  @override
  String get you => 'You';

  @override
  String get loadOlderMessages => 'Load older messages';

  @override
  String get unreadMessages => 'Unread messages';

  @override
  String get promotionPromotions => 'Promotions';

  @override
  String get promotionMyPromotions => 'My promotions';

  @override
  String get promotionCreate => 'Create a promotion';

  @override
  String get promotionType => 'Promotion type';

  @override
  String get promotionPromotion => 'Promotion';

  @override
  String get promotionFlashDeal => 'Flash Deal';

  @override
  String get promotionDiscountType => 'Discount type';

  @override
  String get promotionDiscountPercent => 'Discount percentage';

  @override
  String get promotionDiscountAmount => 'Fixed amount (CDF)';

  @override
  String get promotionSelectProduct => 'Select a product';

  @override
  String get promotionStartDate => 'Start date';

  @override
  String get promotionEndDate => 'End date';

  @override
  String get promotionPendingApproval => 'Pending approval';

  @override
  String get promotionApproved => 'Approved';

  @override
  String get promotionRejected => 'Rejected';

  @override
  String get promotionExpired => 'Expired';

  @override
  String get promotionCancelled => 'Cancelled';

  @override
  String get promotionCancel => 'Cancel promotion';

  @override
  String get promotionConfirmCancel =>
      'Are you sure you want to cancel this promotion?';

  @override
  String get promotionCreated => 'Promotion created successfully';

  @override
  String get promotionNoPromotions => 'No promotions';

  @override
  String get promotionCreateFirst =>
      'Create your first promotion to boost your sales';

  @override
  String get promotionRejectionReason => 'Rejection reason';

  @override
  String get promotionSubmitForApproval => 'Submit for approval';
}
