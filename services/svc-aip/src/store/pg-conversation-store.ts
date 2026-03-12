import type pg from "pg";
import { generateRid } from "@openfoundry/rid";
import { notFound } from "@openfoundry/errors";
import type {
  Conversation,
  ConversationMessage,
  CreateConversationInput,
  AddMessageInput,
} from "./conversation-store.js";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface ConversationRow {
  rid: string;
  title: string;
  user_rid: string | null;
  ontology_rid: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  rid: string;
  conversation_rid: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Row to domain
// ---------------------------------------------------------------------------

function rowToConversation(row: ConversationRow): Conversation {
  return {
    rid: row.rid,
    title: row.title ?? "New conversation",
    userRid: row.user_rid,
    ontologyRid: row.ontology_rid,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): ConversationMessage {
  return {
    rid: row.rid,
    conversationRid: row.conversation_rid,
    role: row.role as ConversationMessage["role"],
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// PgConversationStore
// ---------------------------------------------------------------------------

export class PgConversationStore {
  constructor(private pool: pg.Pool) {}

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    const rid = generateRid("aip", "conversation").toString();

    const { rows } = await this.pool.query<ConversationRow>({
      text: `INSERT INTO aip_conversations (rid, title, user_rid, ontology_rid)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      values: [
        rid,
        input.title ?? "New conversation",
        input.userRid ?? null,
        input.ontologyRid ?? null,
      ],
    });

    return rowToConversation(rows[0]);
  }

  async getConversation(rid: string): Promise<Conversation> {
    const { rows } = await this.pool.query<ConversationRow>({
      text: `SELECT * FROM aip_conversations WHERE rid = $1`,
      values: [rid],
    });

    if (rows.length === 0) {
      throw notFound("Conversation", rid);
    }
    return rowToConversation(rows[0]);
  }

  async listConversations(): Promise<Conversation[]> {
    const { rows } = await this.pool.query<ConversationRow>({
      text: `SELECT * FROM aip_conversations ORDER BY updated_at DESC`,
    });

    return rows.map(rowToConversation);
  }

  async addMessage(
    conversationRid: string,
    input: AddMessageInput,
  ): Promise<ConversationMessage> {
    await this.getConversation(conversationRid); // ensure exists

    const rid = generateRid("aip", "message").toString();

    const { rows } = await this.pool.query<MessageRow>({
      text: `INSERT INTO aip_messages (rid, conversation_rid, role, content, metadata)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
      values: [
        rid,
        conversationRid,
        input.role,
        input.content,
        JSON.stringify(input.metadata ?? {}),
      ],
    });

    // Touch the conversation's updated_at
    await this.pool.query({
      text: `UPDATE aip_conversations SET updated_at = NOW() WHERE rid = $1`,
      values: [conversationRid],
    });

    return rowToMessage(rows[0]);
  }

  async getMessages(conversationRid: string): Promise<ConversationMessage[]> {
    await this.getConversation(conversationRid); // ensure exists

    const { rows } = await this.pool.query<MessageRow>({
      text: `SELECT * FROM aip_messages WHERE conversation_rid = $1 ORDER BY created_at ASC`,
      values: [conversationRid],
    });

    return rows.map(rowToMessage);
  }

  async deleteConversation(rid: string): Promise<void> {
    const result = await this.pool.query({
      text: `DELETE FROM aip_conversations WHERE rid = $1`,
      values: [rid],
    });

    if (result.rowCount === 0) {
      throw notFound("Conversation", rid);
    }
  }
}
