import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get or create a conversation between two users.
   * Checks both directions since the schema has a unique [buyerId, sellerId] constraint
   * but we need to figure out who is the buyer and who is the seller.
   */
  async getOrCreateConversation(userId: string, otherUserId: string) {
    // Check if a conversation already exists between these two users in either direction
    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { buyerId: userId, sellerId: otherUserId },
          { buyerId: otherUserId, sellerId: userId },
        ],
      },
    });

    if (existing) {
      return existing;
    }

    // Determine who is buyer and who is seller by checking roles
    const [user, otherUser] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: otherUserId },
        select: { id: true, role: true },
      }),
    ]);

    if (!user || !otherUser) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Determine buyer/seller assignment:
    // If one is SELLER and the other is BUYER, assign accordingly.
    // If both have the same role, use the user who initiated as buyer and the other as seller.
    let buyerId: string;
    let sellerId: string;

    if (otherUser.role === 'SELLER') {
      buyerId = userId;
      sellerId = otherUserId;
    } else if (user.role === 'SELLER') {
      buyerId = otherUserId;
      sellerId = userId;
    } else {
      // Fallback: the initiator is the buyer
      buyerId = userId;
      sellerId = otherUserId;
    }

    return this.prisma.conversation.create({
      data: {
        buyerId,
        sellerId,
      },
    });
  }

  /**
   * Send a message within a conversation (existing or new).
   */
  async sendMessage(senderId: string, dto: SendMessageDto) {
    let conversationId = dto.conversationId;

    if (conversationId) {
      // Validate that the sender is a participant
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });

      if (!conversation) {
        throw new NotFoundException('Conversation non trouvée');
      }

      if (conversation.buyerId !== senderId && conversation.sellerId !== senderId) {
        throw new ForbiddenException("Vous n'êtes pas un participant de cette conversation");
      }
    } else if (dto.sellerId) {
      if (dto.sellerId === senderId) {
        throw new BadRequestException('Vous ne pouvez pas démarrer une conversation avec vous-même');
      }

      const conversation = await this.getOrCreateConversation(senderId, dto.sellerId);
      conversationId = conversation.id;
    } else {
      throw new BadRequestException(
        'Vous devez fournir soit conversationId soit sellerId',
      );
    }

    // Create the message and update conversation.lastMessageAt in a transaction
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId: conversationId!,
          senderId,
          content: dto.content,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId! },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    this.logger.log(
      `Message sent by ${senderId} in conversation ${conversationId}`,
    );

    return {
      ...message,
      conversationId: conversationId!,
    };
  }

  /**
   * List all conversations for a user with last message, other party info, and unread count.
   */
  async getConversations(userId: string, query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        include: {
          buyer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
              sellerProfile: {
                select: { businessName: true },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              senderId: true,
              createdAt: true,
              readAt: true,
            },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);

    // Compute unread counts for each conversation
    const conversationIds = conversations.map((c) => c.id);

    // Get unread counts in bulk using groupBy
    const unreadCounts = conversationIds.length
      ? await this.prisma.message.groupBy({
          by: ['conversationId'],
          where: {
            conversationId: { in: conversationIds },
            senderId: { not: userId },
            readAt: null,
          },
          _count: true,
        })
      : [];

    const unreadMap = new Map(
      unreadCounts.map((uc) => [uc.conversationId, uc._count]),
    );

    // Transform conversations to include otherParty and unreadCount
    const data = conversations.map((conv) => {
      const isBuyer = conv.buyerId === userId;
      const otherParty = isBuyer ? conv.seller : conv.buyer;
      const lastMessage = conv.messages[0] ?? null;

      return {
        id: conv.id,
        otherParty: {
          id: otherParty.id,
          firstName: otherParty.firstName,
          lastName: otherParty.lastName,
          avatar: otherParty.avatar,
          businessName: otherParty.sellerProfile?.businessName ?? null,
        },
        lastMessage,
        unreadCount: unreadMap.get(conv.id) ?? 0,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
      };
    });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get messages for a conversation with cursor-based pagination.
   */
  async getMessages(
    userId: string,
    conversationId: string,
    query: MessagesQueryDto,
  ) {
    // Validate the user is a participant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException(
        "Vous n'êtes pas un participant de cette conversation",
      );
    }

    const limit = query.limit ?? 30;

    // Build cursor condition
    let cursorCondition = {};
    if (query.before) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.before },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        cursorCondition = {
          createdAt: { lt: cursorMessage.createdAt },
        };
      }
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...cursorCondition,
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;

    return {
      data,
      hasMore,
    };
  }

  /**
   * Mark all unread messages in a conversation as read (messages sent by the other party).
   */
  async markAsRead(userId: string, conversationId: string) {
    // Validate the user is a participant
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation non trouvée');
    }

    if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
      throw new ForbiddenException(
        "Vous n'êtes pas un participant de cette conversation",
      );
    }

    const result = await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { markedCount: result.count };
  }

  /**
   * Get total unread message count across all conversations for a user.
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: {
        conversation: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
        },
        senderId: { not: userId },
        readAt: null,
      },
    });

    return { count };
  }
}
