// Local-only earnings fixtures (Seller UX PR E). No network, tokens or
// analytics. The repository answers from in-memory rows and records what
// the screens asked; failures are switched per endpoint.
import 'package:dio/dio.dart';
import 'package:seller_mobile/features/earnings/data/earnings_repository.dart';
import 'package:seller_mobile/features/earnings/data/models/earning_model.dart';

DioException apiError(String path, int status, String message) => DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.badResponse,
      response: Response(
        requestOptions: RequestOptions(path: path),
        statusCode: status,
        data: {
          'success': false,
          'error': {'status': status, 'message': message},
        },
      ),
    );

DioException networkError(String path) => DioException(
      requestOptions: RequestOptions(path: path),
      type: DioExceptionType.connectionError,
    );

SellerWallet wallet({
  int availableFc = 63000,
  int pendingFc = 0,
  int grossFc = 250000,
  int commissionFc = 25000,
}) =>
    SellerWallet(
      balanceCDF: '${availableFc * 100}',
      pendingCDF: '${pendingFc * 100}',
      totalEarnedCDF: '${grossFc * 100}',
      totalCommissionCDF: '${commissionFc * 100}',
      pendingPayoutCDF: '${availableFc * 100}',
    );

SellerEarningModel earning({
  String id = 'earning-1',
  String orderNumber = 'TK-20260901-000210',
  int grossFc = 50000,
  int commissionFc = 5000,
  String rate = '0.1',
  String state = 'AVAILABLE',
}) =>
    SellerEarningModel(
      id: id,
      orderId: 'order-$id',
      grossAmountCDF: '${grossFc * 100}',
      commissionCDF: '${commissionFc * 100}',
      netAmountCDF: '${(grossFc - commissionFc) * 100}',
      commissionRate: rate,
      isPaid: state == 'PAID',
      state: state,
      orderNumber: orderNumber,
      createdAt: '2026-09-01T09:00:00.000Z',
    );

PayoutModel payout({
  String id = 'payout-1',
  int amountFc = 63000,
  String status = 'REQUESTED',
  String method = 'M_PESA',
  String phone = '+243970000001',
  String? reason,
  String? reference,
  String? approvedAt,
  String? processingAt,
  String? processedAt,
  String? rejectedAt,
}) =>
    PayoutModel(
      id: id,
      amountCDF: '${amountFc * 100}',
      status: status,
      payoutMethod: method,
      payoutPhone: phone,
      rejectionReason: reason,
      externalReference: reference,
      requestedAt: '2026-09-02T08:00:00.000Z',
      approvedAt: approvedAt,
      processingAt: processingAt,
      processedAt: processedAt,
      rejectedAt: rejectedAt,
      createdAt: '2026-09-02T08:00:00.000Z',
    );

class FixtureEarningsRepository extends EarningsRepository {
  FixtureEarningsRepository({
    SellerWallet? wallet,
    this.earnings = const [],
    this.payouts = const [],
    this.saved = const SellerPayoutMethod(),
  })  : walletRow = wallet,
        super(Dio());

  SellerWallet? walletRow;
  List<SellerEarningModel> earnings;
  List<PayoutModel> payouts;
  SellerPayoutMethod saved;

  /// When set, every read waits for it — for asserting loading states.
  Future<void>? hold;

  bool failWallet = false;
  bool failEarnings = false;
  bool failPayouts = false;

  /// Answer for the next POST /v1/sellers/payouts; null = success.
  DioException? nextRequestError;

  /// What the fixture does once a request is accepted (default: reserve
  /// the whole balance in a REQUESTED payout, like the API).
  int walletCalls = 0;
  int earningsCalls = 0;
  int payoutsCalls = 0;
  final requested = <Map<String, String>>[];
  final savedDestinations = <Map<String, String>>[];

  @override
  Future<SellerWallet> getWallet() async {
    walletCalls++;
    if (hold != null) await hold;
    if (failWallet) throw networkError('/v1/sellers/wallet');
    return walletRow!;
  }

  @override
  Future<PaginatedEarningsResponse> getEarnings(
      {int page = 1, int limit = 20}) async {
    earningsCalls++;
    if (hold != null) await hold;
    if (failEarnings) throw networkError('/v1/sellers/earnings');
    return PaginatedEarningsResponse(
        items: earnings, total: earnings.length, page: page, limit: limit);
  }

  @override
  Future<PaginatedPayoutsResponse> getPayouts(
      {int page = 1, int limit = 20}) async {
    payoutsCalls++;
    if (hold != null) await hold;
    if (failPayouts) throw networkError('/v1/sellers/payouts');
    return PaginatedPayoutsResponse(
        items: payouts, total: payouts.length, page: page, limit: limit);
  }

  @override
  Future<PayoutModel> getPayout(String payoutId) async {
    if (hold != null) await hold;
    final match = payouts.where((p) => p.id == payoutId).firstOrNull;
    if (match == null) {
      throw apiError('/v1/sellers/payouts/$payoutId', 404,
          'Ce virement est introuvable ou ne vous appartient pas.');
    }
    return match;
  }

  @override
  Future<SellerPayoutMethod> getPayoutMethod() async => saved;

  @override
  Future<SellerPayoutMethod> updatePayoutMethod(
      {required String payoutMethod, required String payoutPhone}) async {
    savedDestinations.add({'method': payoutMethod, 'phone': payoutPhone});
    saved = SellerPayoutMethod(payoutMethod: payoutMethod, payoutPhone: payoutPhone);
    return saved;
  }

  @override
  Future<PayoutModel> requestPayout(
      {required String payoutMethod, required String payoutPhone}) async {
    requested.add({'method': payoutMethod, 'phone': payoutPhone});
    if (hold != null) await hold;
    final err = nextRequestError;
    if (err != null) {
      nextRequestError = null;
      throw err;
    }
    final amount = walletRow?.balanceCDFDisplay ?? 0;
    final row = payout(
        id: 'payout-new',
        amountFc: amount,
        method: payoutMethod,
        phone: payoutPhone);
    payouts = [row, ...payouts];
    earnings = [
      for (final e in earnings)
        e.effectiveState == 'AVAILABLE'
            ? earning(
                id: e.id,
                orderNumber: e.orderNumber ?? '',
                grossFc: e.grossAmountCDFDisplay,
                commissionFc: e.commissionCDFDisplay,
                rate: e.commissionRate,
                state: 'RESERVED')
            : e
    ];
    walletRow = wallet(
      availableFc: 0,
      pendingFc: walletRow?.pendingCDFDisplay ?? 0,
      grossFc: walletRow?.totalEarnedCDFDisplay ?? 0,
      commissionFc: walletRow?.totalCommissionCDFDisplay ?? 0,
    );
    return row;
  }
}
