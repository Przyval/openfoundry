import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Conversation {
  rid: string;
  title: string;
  userRid: string | null;
  ontologyRid: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  rid: string;
  conversationRid: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreateConversationInput {
  title?: string;
  userRid?: string;
  ontologyRid?: string;
}

export interface AddMessageInput {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ConversationStore — in-memory
// ---------------------------------------------------------------------------

export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, ConversationMessage[]>();

  createConversation(input: CreateConversationInput): Conversation {
    const now = new Date().toISOString();
    const rid = generateRid("aip", "conversation").toString();
    const conv: Conversation = {
      rid,
      title: input.title ?? "New conversation",
      userRid: input.userRid ?? null,
      ontologyRid: input.ontologyRid ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(rid, conv);
    this.messages.set(rid, []);
    return conv;
  }

  getConversation(rid: string): Conversation {
    const conv = this.conversations.get(rid);
    if (!conv) {
      throw notFound("Conversation", rid);
    }
    return conv;
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  addMessage(conversationRid: string, input: AddMessageInput): ConversationMessage {
    this.getConversation(conversationRid); // ensure exists
    const now = new Date().toISOString();
    const rid = generateRid("aip", "message").toString();
    const msg: ConversationMessage = {
      rid,
      conversationRid,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: now,
    };

    const msgs = this.messages.get(conversationRid)!;
    msgs.push(msg);

    // Update conversation timestamp
    const conv = this.conversations.get(conversationRid)!;
    this.conversations.set(conversationRid, { ...conv, updatedAt: now });

    return msg;
  }

  getMessages(conversationRid: string): ConversationMessage[] {
    this.getConversation(conversationRid); // ensure exists
    return this.messages.get(conversationRid) ?? [];
  }

  deleteConversation(rid: string): void {
    if (!this.conversations.has(rid)) {
      throw notFound("Conversation", rid);
    }
    this.conversations.delete(rid);
    this.messages.delete(rid);
  }
}
