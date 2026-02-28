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
  String get authCreateAccount => 'Create my account';

  @override
  String get authCreateAccountTitle => 'Create an account';

  @override
  String get authNoAccount => 'No account?';

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
  String get catalogTitle => 'Catalog';

  @override
  String get categories => 'Categories';

  @override
  String get allCategories => 'All categories';

  @override
  String get popularProducts => 'Popular products';

  @override
  String get newestProducts => 'New arrivals';

  @override
  String get productPrice => 'Price';

  @override
  String get productSeller => 'Seller';

  @override
  String get productConditionNew => 'New';

  @override
  String get productConditionUsed => 'Used';

  @override
  String get productOutOfStock => 'Out of stock';

  @override
  String get productLowStock => 'Low stock';

  @override
  String get productLoadMore => 'Load more';

  @override
  String get productNoResults => 'No products found';

  @override
  String get searchPlaceholder => 'Search for a product...';

  @override
  String get searchNoResults => 'No results for your search';

  @override
  String get searchResults => 'Results';

  @override
  String get filterAll => 'All';

  @override
  String get filterNew => 'New';

  @override
  String get filterUsed => 'Used';

  @override
  String get filterSort => 'Sort and filter';

  @override
  String get filterSortNewest => 'Newest';

  @override
  String get filterSortPriceLow => 'Price: low to high';

  @override
  String get filterSortPriceHigh => 'Price: high to low';

  @override
  String get filterSortPopular => 'Popularity';

  @override
  String get filterApply => 'Apply';

  @override
  String get filterReset => 'Reset';

  @override
  String get filterPrice => 'Condition';

  @override
  String get filterMinPrice => 'Min price';

  @override
  String get filterMaxPrice => 'Max price';

  @override
  String get addToCart => 'Add to cart';

  @override
  String get specifications => 'Specifications';

  @override
  String get productDetail => 'Product details';

  @override
  String get backToHome => 'Try again';

  @override
  String get cart => 'Cart';

  @override
  String get cartEmpty => 'Your cart is empty';

  @override
  String get cartEmptyAction => 'Discover our products';

  @override
  String get cartCheckout => 'Checkout';

  @override
  String get cartTotal => 'Total';

  @override
  String get cartRemove => 'Remove';

  @override
  String get checkoutTitle => 'Checkout';

  @override
  String get checkoutSelectAddress => 'Delivery address';

  @override
  String get checkoutNoAddresses => 'No saved addresses';

  @override
  String get checkoutPaymentMethod => 'Payment method';

  @override
  String get checkoutCOD => 'Cash on delivery';

  @override
  String get checkoutMobileMoney => 'Mobile Money';

  @override
  String get checkoutReview => 'Order summary';

  @override
  String get checkoutDeliveryFee => 'Delivery fee';

  @override
  String get checkoutPlaceOrder => 'Place order';

  @override
  String get checkoutProcessing => 'Processing...';

  @override
  String get checkoutNote => 'Note for the seller';

  @override
  String get checkoutSuccess => 'Order confirmed!';

  @override
  String get checkoutSuccessMessage => 'Your order has been placed successfully.';

  @override
  String get checkoutViewOrders => 'View my orders';

  @override
  String get checkoutContinueShopping => 'Continue shopping';

  @override
  String get ordersTitle => 'My orders';

  @override
  String get ordersEmpty => 'You have no orders';

  @override
  String get ordersAll => 'All';

  @override
  String get ordersPending => 'Pending';

  @override
  String get ordersConfirmed => 'Confirmed';

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
  String get orderTotal => 'Total';

  @override
  String orderItems(int count) {
    return '$count item(s)';
  }

  @override
  String get orderSeller => 'Seller';

  @override
  String get orderCancel => 'Cancel order';

  @override
  String get orderCancelConfirm => 'Do you want to cancel this order?';

  @override
  String get orderCancelReason => 'Reason (optional)';

  @override
  String get orderCancelSuccess => 'Order cancelled';

  @override
  String get orderDeliveryAddress => 'Delivery address';

  @override
  String get orderDeliveryFee => 'Delivery fee';

  @override
  String get orderSubtotal => 'Subtotal';

  @override
  String get orderTimeline => 'Tracking';

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
  String get checkoutSelectProvider => 'Choose your provider';

  @override
  String get checkoutMpesa => 'M-Pesa (Vodacom)';

  @override
  String get checkoutAirtelMoney => 'Airtel Money';

  @override
  String get checkoutOrangeMoney => 'Orange Money';

  @override
  String get checkoutPayerPhone => 'Mobile Money number';

  @override
  String get checkoutPayerPhoneHint => '+243...';

  @override
  String get paymentPendingTitle => 'Payment pending';

  @override
  String get paymentPendingInstructions =>
      'You will receive a USSD notification on your phone. Enter your PIN code to confirm.';

  @override
  String get paymentPendingChecking => 'Checking payment status...';

  @override
  String get paymentConfirmed => 'Payment confirmed!';

  @override
  String get paymentFailed => 'Payment failed';

  @override
  String get paymentRetry => 'Retry';

  @override
  String get paymentTimeout => 'Payment timeout expired';

  @override
  String get paymentTimeoutMessage => 'You can retry from your orders.';

  @override
  String get orderPaymentStatus => 'Payment status';

  @override
  String get paymentStatusPending => 'Pending';

  @override
  String get paymentStatusCompleted => 'Paid';

  @override
  String get paymentStatusFailed => 'Failed';

  @override
  String get next => 'Next';

  @override
  String get previous => 'Previous';

  @override
  String step(int number) {
    return 'Step $number';
  }

  @override
  String get reviewsTitle => 'Reviews';

  @override
  String get writeReview => 'Write a review';

  @override
  String get noReviews => 'No reviews yet';

  @override
  String get reviewSubmitted => 'Review submitted successfully';

  @override
  String get reviewDeleted => 'Review deleted';

  @override
  String get outOf5 => 'out of 5';

  @override
  String get verifiedBuyer => 'Verified buyer';

  @override
  String get alreadyReviewed => 'You have already reviewed this product';

  @override
  String get mustBeDelivered =>
      'Order must be delivered to leave a review';

  @override
  String get reviewPlaceholder =>
      'Share your experience with this product...';

  @override
  String get submitReview => 'Submit review';

  @override
  String get deleteReview => 'Delete review';

  @override
  String get confirmDeleteReview => 'Do you want to delete your review?';

  @override
  String get seeAllReviews => 'See all reviews';

  @override
  String get yourRating => 'Your rating';

  @override
  String get stars => 'stars';

  @override
  String get wishlistTitle => 'My wishlist';

  @override
  String get wishlistEmpty => 'No favorites';

  @override
  String get wishlistEmptyDesc =>
      'Add products to your wishlist to find them easily';

  @override
  String get addedToWishlist => 'Added to wishlist';

  @override
  String get removedFromWishlist => 'Removed from wishlist';

  @override
  String get browseProducts => 'Browse products';

  @override
  String get removeFromWishlist => 'Remove from wishlist';

  @override
  String get messagesTitle => 'Messages';

  @override
  String get conversations => 'Conversations';

  @override
  String get noConversations => 'No conversations';

  @override
  String get noMessages => 'No messages. Start the conversation!';

  @override
  String get typePlaceholder => 'Type your message...';

  @override
  String get sendMessage => 'Send';

  @override
  String get contactSeller => 'Contact seller';

  @override
  String get you => 'You';

  @override
  String get loadOlderMessages => 'Load older messages';

  @override
  String get unreadMessages => 'Unread messages';

  @override
  String get flashDeals => 'Flash Deals';

  @override
  String get endsIn => 'Ends in';

  @override
  String get discount => 'Discount';

  @override
  String get originalPrice => 'Original price';

  @override
  String get seeAllDeals => 'See all deals';

  @override
  String get faq => 'FAQ';

  @override
  String get termsAndConditions => 'Terms and conditions';

  @override
  String get privacyPolicy => 'Privacy policy';

  @override
  String get helpCenter => 'Help center';

  @override
  String get aboutUs => 'About us';

  @override
  String get pageNotFound => 'Page not found';

  @override
  String get contentPages => 'Pages';

  @override
  String get shopNow => 'Shop now';

  @override
  String get learnMore => 'Learn more';
}
