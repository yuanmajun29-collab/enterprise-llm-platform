import { v4 as uuidv4 } from 'uuid';
import { query, insert, update, remove, queryOne } from '../config/database';

/**
 * 获取用户的所有会话
 */
export async function getUserConversations(userId: string, options?: any) {
  const { includeArchived = false, page = 1, pageSize = 20 } = options || {};
  const offset = (page - 1) * pageSize;

  let whereClause = 'WHERE c.user_id = $1';
  const params: any[] = [userId];
  let paramIndex = 2;

  if (!includeArchived) {
    whereClause += ` AND c.is_archived = false`;
  }

  // 总数
  const countResult = await queryOne(`
    SELECT COUNT(*) as total FROM conversations c ${whereClause}
  `, params);

  const total = parseInt(countResult?.total || '0');

  // 查询列表
  const conversations = await query(`
    SELECT c.id, c.title, c.model_id, c.is_archived, c.total_tokens, c.created_at, c.updated_at,
           m.name as model_name, m.display_name as model_display_name
    FROM conversations c
    LEFT JOIN models m ON c.model_id = m.id
    ${whereClause}
    ORDER BY c.updated_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, pageSize, offset]);

  return {
    data: conversations,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * 获取会话详情（包含消息）
 */
export async function getConversationById(conversationId: string, userId: string) {
  const conversation = await queryOne(`
    SELECT c.id, c.title, c.model_id, c.is_archived, c.total_tokens, c.created_at, c.updated_at,
           m.name as model_name, m.display_name as model_display_name
    FROM conversations c
    LEFT JOIN models m ON c.model_id = m.id
    WHERE c.id = $1 AND c.user_id = $2
  `, [conversationId, userId]);

  if (!conversation) {
    throw { status: 404, message: '会话不存在', type: 'not_found' };
  }

  // 获取消息
  const messages = await query(`
    SELECT id, role, content, tokens, order_index, created_at
    FROM conversation_messages
    WHERE conversation_id = $1
    ORDER BY order_index ASC
  `, [conversationId]);

  return {
    ...conversation,
    messages,
  };
}

/**
 * 创建新会话
 */
export async function createConversation(userId: string, conversationData: any) {
  const { title, modelId } = conversationData;

  const conversation = await insert(`
    INSERT INTO conversations (id, user_id, title, model_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, title, model_id, created_at
  `, [uuidv4(), userId, title || '新对话', modelId || null]);

  return conversation;
}

/**
 * 更新会话
 */
export async function updateConversation(conversationId: string, userId: string, updates: any) {
  const { title, modelId } = updates;

  const conversation = await queryOne(`
    UPDATE conversations
    SET title = COALESCE($2, title),
        model_id = COALESCE($3, model_id),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $4
    RETURNING id, title, model_id, updated_at
  `, [conversationId, title, modelId, userId]);

  if (!conversation) {
    throw { status: 404, message: '会话不存在', type: 'not_found' };
  }

  return conversation;
}

/**
 * 归档/取消归档会话
 */
export async function toggleArchiveConversation(conversationId: string, userId: string) {
  const conversation = await queryOne(`
    UPDATE conversations
    SET is_archived = NOT is_archived, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND user_id = $2
    RETURNING id, title, is_archived, updated_at
  `, [conversationId, userId]);

  if (!conversation) {
    throw { status: 404, message: '会话不存在', type: 'not_found' };
  }

  return conversation;
}

/**
 * 删除会话
 */
export async function deleteConversation(conversationId: string, userId: string) {
  const result = await queryOne(`
    DELETE FROM conversations
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `, [conversationId, userId]);

  if (!result) {
    throw { status: 404, message: '会话不存在', type: 'not_found' };
  }

  return { message: '会话已删除' };
}

/**
 * 清空所有会话
 */
export async function clearAllConversations(userId: string) {
  const count = await remove(`
    DELETE FROM conversations WHERE user_id = $1
  `, [userId]);

  return { message: `已清空 ${count} 个会话` };
}

/**
 * 添加消息到会话
 */
export async function addMessage(conversationId: string, messageData: any) {
  const { role, content, tokens } = messageData;

  if (!role || !content) {
    throw { status: 400, message: '角色和内容为必填项', type: 'validation_error' };
  }

  const validRoles = ['system', 'user', 'assistant'];
  if (!validRoles.includes(role)) {
    throw { status: 400, message: `无效的消息角色: ${role}`, type: 'validation_error' };
  }

  // 获取当前最大 order_index
  const maxOrder = await queryOne(`
    SELECT MAX(order_index) as max_order
    FROM conversation_messages
    WHERE conversation_id = $1
  `, [conversationId]);

  const nextOrder = (maxOrder?.max_order || 0) + 1;

  const message = await insert(`
    INSERT INTO conversation_messages (id, conversation_id, role, content, tokens, order_index)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, role, content, tokens, order_index, created_at
  `, [uuidv4(), conversationId, role, content, tokens || 0, nextOrder]);

  // 更新会话的总 token 数和更新时间
  await update(`
    UPDATE conversations
    SET total_tokens = COALESCE(total_tokens, 0) + $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `, [conversationId, tokens || 0]);

  return message;
}
