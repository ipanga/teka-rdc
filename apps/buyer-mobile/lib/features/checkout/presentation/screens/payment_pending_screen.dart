import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/utils/price_formatter.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../orders/data/orders_repository.dart';
import '../../data/models/checkout_model.dart';

class PaymentPendingScreen extends ConsumerStatefulWidget {
  final List<CheckoutOrderModel> orders;

  const PaymentPendingScreen({
    super.key,
    required this.orders,
  });

  @override
  ConsumerState<PaymentPendingScreen> createState() =>
      _PaymentPendingScreenState();
}

enum _PaymentPollStatus { polling, confirmed, failed, timeout }

class _PaymentPendingScreenState extends ConsumerState<PaymentPendingScreen> {
  Timer? _pollTimer;
  Timer? _timeoutTimer;
  _PaymentPollStatus _status = _PaymentPollStatus.polling;
  static const _pollInterval = Duration(seconds: 5);
  static const _timeoutDuration = Duration(minutes: 5);

  @override
  void initState() {
    super.initState();
    _startPolling();
    _startTimeout();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _timeoutTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(_pollInterval, (_) => _checkPaymentStatus());
  }

  void _startTimeout() {
    _timeoutTimer = Timer(_timeoutDuration, () {
      if (mounted && _status == _PaymentPollStatus.polling) {
        _pollTimer?.cancel();
        setState(() {
          _status = _PaymentPollStatus.timeout;
        });
      }
    });
  }

  Future<void> _checkPaymentStatus() async {
    if (_status != _PaymentPollStatus.polling || widget.orders.isEmpty) return;

    try {
      final repository = ref.read(ordersRepositoryProvider);
      final order = await repository.getOrderById(widget.orders.first.id);
      final paymentStatus = order.paymentStatus.toUpperCase();

      if (!mounted) return;

      if (paymentStatus == 'COMPLETED' || paymentStatus == 'PAID') {
        _pollTimer?.cancel();
        _timeoutTimer?.cancel();
        setState(() {
          _status = _PaymentPollStatus.confirmed;
        });
        // Navigate to success after brief delay
        Future.delayed(const Duration(seconds: 2), () {
          if (mounted) {
            context.go('/checkout/success', extra: {
              'orders': widget.orders,
            });
          }
        });
      } else if (paymentStatus == 'FAILED') {
        _pollTimer?.cancel();
        _timeoutTimer?.cancel();
        setState(() {
          _status = _PaymentPollStatus.failed;
        });
      }
    } catch (_) {
      // Silently ignore polling errors - will retry on next interval
    }
  }

  void _retry() {
    setState(() {
      _status = _PaymentPollStatus.polling;
    });
    _startPolling();
    _startTimeout();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.paymentPendingTitle),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: _buildContent(l10n),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(AppLocalizations l10n) {
    switch (_status) {
      case _PaymentPollStatus.polling:
        return _buildPolling(l10n);
      case _PaymentPollStatus.confirmed:
        return _buildConfirmed(l10n);
      case _PaymentPollStatus.failed:
        return _buildFailed(l10n);
      case _PaymentPollStatus.timeout:
        return _buildTimeout(l10n);
    }
  }

  Widget _buildPolling(AppLocalizations l10n) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(
          width: 64,
          height: 64,
          child: CircularProgressIndicator(
            color: TekaColors.tekaRed,
            strokeWidth: 3,
          ),
        ),
        const SizedBox(height: 24),
        Text(
          l10n.paymentPendingTitle,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: TekaColors.muted,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.info_outline,
                color: TekaColors.mutedForeground,
                size: 20,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  l10n.paymentPendingInstructions,
                  style: const TextStyle(
                    color: TekaColors.foreground,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        _buildOrderSummary(l10n),
        const SizedBox(height: 16),
        Text(
          l10n.paymentPendingChecking,
          style: const TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 13,
          ),
        ),
      ],
    );
  }

  Widget _buildConfirmed(AppLocalizations l10n) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.check_circle,
          color: TekaColors.success,
          size: 80,
        ),
        const SizedBox(height: 24),
        Text(
          l10n.paymentConfirmed,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.success,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        _buildOrderSummary(l10n),
      ],
    );
  }

  Widget _buildFailed(AppLocalizations l10n) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.error_outline,
          color: TekaColors.destructive,
          size: 80,
        ),
        const SizedBox(height: 24),
        Text(
          l10n.paymentFailed,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.destructive,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        _buildOrderSummary(l10n),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _retry,
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              padding: const EdgeInsets.symmetric(vertical: 14),
              textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Text(l10n.paymentRetry),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: () => context.go('/orders'),
            style: OutlinedButton.styleFrom(
              foregroundColor: TekaColors.foreground,
              side: const BorderSide(color: TekaColors.border),
              padding: const EdgeInsets.symmetric(vertical: 14),
              textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Text(l10n.checkoutViewOrders),
          ),
        ),
      ],
    );
  }

  Widget _buildTimeout(AppLocalizations l10n) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(
          Icons.timer_off_outlined,
          color: TekaColors.warning,
          size: 80,
        ),
        const SizedBox(height: 24),
        Text(
          l10n.paymentTimeout,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: TekaColors.foreground,
              ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          l10n.paymentTimeoutMessage,
          style: const TextStyle(
            color: TekaColors.mutedForeground,
            fontSize: 14,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        _buildOrderSummary(l10n),
        const SizedBox(height: 32),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: () => context.go('/orders'),
            style: FilledButton.styleFrom(
              backgroundColor: TekaColors.tekaRed,
              padding: const EdgeInsets.symmetric(vertical: 14),
              textStyle: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: Text(l10n.checkoutViewOrders),
          ),
        ),
      ],
    );
  }

  Widget _buildOrderSummary(AppLocalizations l10n) {
    if (widget.orders.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: TekaColors.muted,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: widget.orders
            .map(
              (order) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '#${order.orderNumber}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: TekaColors.foreground,
                      ),
                    ),
                    Text(
                      formatCDF(order.totalCDF),
                      style: const TextStyle(
                        color: TekaColors.tekaRed,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}
