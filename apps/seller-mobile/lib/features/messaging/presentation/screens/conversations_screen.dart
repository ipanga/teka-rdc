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
    final state = ref.watch(conversationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.messagesTitle),
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(conversationsProvider.notifier).refresh(),
        child: _buildBody(context, ref, l10n, state),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    ConversationsState state,
  ) {
    if (state.isLoading && state.conversations.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.conversations.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  size: 48, color: TekaColors.destructive),
              const SizedBox(height: 12),
              Text(l10n.authGenericError),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () =>
                    ref.read(conversationsProvider.notifier).loadConversations(),
                child: Text(l10n.loadMore),
              ),
            ],
          ),
        ),
      );
    }

    if (state.conversations.isEmpty) {
      return _buildEmpty(context, l10n);
    }

    return NotificationListener<ScrollNotification>(
      onNotification: (notification) {
        if (notification is ScrollEndNotification &&
            notification.metrics.extentAfter < 200 &&
            state.hasMore &&
            !state.isLoadingMore) {
          ref.read(conversationsProvider.notifier).loadMore();
        }
        return false;
      },
      child: ListView.builder(
        itemCount:
            state.conversations.length + (state.isLoadingMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index == state.conversations.length) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            );
          }
          final conversation = state.conversations[index];
          return ConversationTile(
            conversation: conversation,
            onTap: () => context.push('/messages/${conversation.id}'),
          );
        },
      ),
    );
  }

  Widget _buildEmpty(BuildContext context, AppLocalizations l10n) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.chat_outlined,
              size: 48, color: TekaColors.mutedForeground),
          const SizedBox(height: 12),
          Text(
            l10n.noConversations,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: TekaColors.foreground,
            ),
          ),
          const SizedBox(height: 4),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Text(
              l10n.noConversationsDesc,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13,
                color: TekaColors.mutedForeground,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
