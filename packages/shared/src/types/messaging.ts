export interface Conversation {
  id: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
  otherParty?: ConversationParty;
  lastMessage?: MessagePreview | null;
  unreadCount?: number;
}

export interface ConversationParty {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  sellerProfile?: { businessName?: string | null } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt?: string | null;
  createdAt: string;
}

export interface MessagePreview {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
}

export interface SendMessageRequest {
  conversationId?: string;
  sellerId?: string;
  content: string;
}
