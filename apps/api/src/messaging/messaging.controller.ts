import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessagesQueryDto } from './dto/messages-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Buyer↔seller direct messaging was removed from the product surface on
 * 2026-05-17. Per the new policy, buyers contact Teka RDC customer
 * service instead of the seller directly (cleaner support flow, fewer
 * dispute surfaces, and the existing "Contacter le support" page covers
 * the use case).
 *
 * The controllers below stay registered so any in-flight clients on an
 * old build get a deterministic 410 Gone with a French message rather
 * than a confusing 404. The MessagingService methods, the Prisma
 * Conversation + Message models, and all DB rows are preserved untouched
 * — historical conversations remain readable for audit + support and
 * the feature can be re-enabled by reverting this single file.
 */
const REMOVED_MESSAGE =
  'La messagerie directe acheteur-vendeur a été supprimée. ' +
  'Pour toute question, contactez le support Teka RDC.';

function throwGone(): never {
  throw new HttpException(
    {
      success: false,
      error: {
        status: HttpStatus.GONE,
        code: 'MESSAGING_REMOVED',
        message: REMOVED_MESSAGE,
      },
    },
    HttpStatus.GONE,
  );
}

@Controller('v1/messages')
export class MessagingController {
  // Constructor signature preserved so the DI graph + module wiring don't
  // need to change. The service is dormant; deleting it would touch
  // messaging.module.ts + the export of MessagingService.
  constructor(private messagingService: MessagingService) {
    void this.messagingService;
  }

  @Post()
  sendMessage(
    @CurrentUser('sub') _userId: string,
    @Body() _dto: SendMessageDto,
  ) {
    throwGone();
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('sub') _userId: string) {
    throwGone();
  }
}

@Controller('v1/conversations')
export class ConversationsController {
  constructor(private messagingService: MessagingService) {
    void this.messagingService;
  }

  @Get()
  getConversations(
    @CurrentUser('sub') _userId: string,
    @Query() _query: ConversationQueryDto,
  ) {
    throwGone();
  }

  @Get(':id/messages')
  getMessages(
    @CurrentUser('sub') _userId: string,
    @Param('id', ParseUUIDPipe) _conversationId: string,
    @Query() _query: MessagesQueryDto,
  ) {
    throwGone();
  }

  @Post(':id/read')
  markAsRead(
    @CurrentUser('sub') _userId: string,
    @Param('id', ParseUUIDPipe) _conversationId: string,
  ) {
    throwGone();
  }
}
