import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/messages')
export class MessagingController {
  constructor(private messagingService: MessagingService) {}

  /**
   * Send a message. Requires either conversationId or sellerId in body.
   */
  @Post()
  async sendMessage(
    @CurrentUser('sub') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    const data = await this.messagingService.sendMessage(userId, dto);
    return { success: true, data };
  }

  /**
   * Get total unread message count across all conversations.
   * Note: This route is defined before ':id' routes to avoid parameter conflict.
   */
  @Get('unread-count')
  async getUnreadCount(@CurrentUser('sub') userId: string) {
    const data = await this.messagingService.getUnreadCount(userId);
    return { success: true, data };
  }
}

@Controller('v1/conversations')
export class ConversationsController {
  constructor(private messagingService: MessagingService) {}

  /**
   * List all conversations for the logged-in user (paginated).
   */
  @Get()
  async getConversations(
    @CurrentUser('sub') userId: string,
    @Query() query: ConversationQueryDto,
  ) {
    const result = await this.messagingService.getConversations(userId, query);
    return { success: true, ...result };
  }

  /**
   * Get messages for a specific conversation (cursor-paginated).
   */
  @Get(':id/messages')
  async getMessages(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: MessagesQueryDto,
  ) {
    const result = await this.messagingService.getMessages(
      userId,
      conversationId,
      query,
    );
    return { success: true, ...result };
  }

  /**
   * Mark all messages in a conversation as read.
   */
  @Post(':id/read')
  async markAsRead(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ) {
    const data = await this.messagingService.markAsRead(userId, conversationId);
    return { success: true, data };
  }
}
