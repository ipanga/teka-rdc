import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../l10n/app_localizations.dart';
import '../providers/messaging_provider.dart';
import '../widgets/conversation_tile.dart';

class ConversationsScreen extends ConsumerWidget {
  const ConversationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final messagingState = ref.watch(messagingProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.messagesTitle),
      ),
      body: messagingState.isLoading
          ? const Center(
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : messagingState.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          size: 48,
                          color: TekaColors.mutedForeground,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          messagingState.error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: TekaColors.mutedForeground,
                          ),
                        ),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () =>
                              ref.read(messagingProvider.notifier).refresh(),
                          style: FilledButton.styleFrom(
                            backgroundColor: TekaColors.tekaRed,
                          ),
                          child: Text(l10n.backToHome),
                        ),
                      ],
                    ),
                  ),
                )
              : messagingState.conversations.isEmpty
                  ? _EmptyConversationsView(l10n: l10n)
                  : RefreshIndicator(
                      color: TekaColors.tekaRed,
                      onRefresh: () =>
                          ref.read(messagingProvider.notifier).refresh(),
                      child: ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: messagingState.conversations.length,
                        separatorBuilder: (_, __) => const Divider(
                          height: 1,
                          color: TekaColors.border,
                          indent: 72,
                        ),
                        itemBuilder: (context, index) {
                          final conversation =
                              messagingState.conversations[index];
                          return ConversationTile(
                            conversation: conversation,
                            onTap: () =>
                                context.push('/messages/${conversation.id}'),
                          );
                        },
                      ),
                    ),
    );
  }
}

class _EmptyConversationsView extends StatelessWidget {
  final AppLocalizations l10n;

  const _EmptyConversationsView({required this.l10n});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: TekaColors.mutedForeground,
            ),
            const SizedBox(height: 16),
            Text(
              l10n.noConversations,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: TekaColors.mutedForeground,
                    fontWeight: FontWeight.w600,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
