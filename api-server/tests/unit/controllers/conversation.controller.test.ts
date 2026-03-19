import * as conversationController from '../../../src/controllers/conversation.controller';
import { mockPool } from '../../helpers/setup';
import {
  mockUser,
  mockConversation,
  mockMessages,
  mockArchivedConversation,
} from '../../helpers/fixtures';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-001' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Conversation Controller', () => {
  describe('getUserConversations', () => {
    it('默认不包含归档会话', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '2' }], rowCount: 1 };
        }
        return { rows: [mockConversation], rowCount: 1 };
      });

      const result = await conversationController.getUserConversations('user-001', {});

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination.total).toBe(2);
    });

    it('includeArchived=true 时包含归档会话', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '3' }], rowCount: 1 };
        }
        return { rows: [mockConversation, mockArchivedConversation], rowCount: 2 };
      });

      const result = await conversationController.getUserConversations('user-001', {
        includeArchived: true,
      });

      expect(result.data).toHaveLength(2);
    });

    it('分页参数正确传递', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '100' }], rowCount: 1 };
        }
        // 验证 LIMIT 和 OFFSET
        expect(sql).toMatch(/LIMIT.*OFFSET/);
        return { rows: [], rowCount: 0 };
      });

      await conversationController.getUserConversations('user-001', { page: 2, pageSize: 10 });
    });
  });

  describe('getConversationById', () => {
    it('成功返回会话详情（含消息）', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.id') && !sql.includes('conversation_messages')) {
          return { rows: [mockConversation], rowCount: 1 };
        }
        if (sql.includes('conversation_messages')) {
          return { rows: mockMessages, rowCount: 3 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await conversationController.getConversationById('conv-001', 'user-001');

      expect(result.id).toBe('conv-001');
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe('user');
    });

    it('会话不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(conversationController.getConversationById('nonexistent', 'user-001'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });

    it('无消息时返回空消息列表', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT c.id') && !sql.includes('conversation_messages')) {
          return { rows: [mockConversation], rowCount: 1 };
        }
        if (sql.includes('conversation_messages')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await conversationController.getConversationById('conv-001', 'user-001');

      expect(result.messages).toHaveLength(0);
    });
  });

  describe('createConversation', () => {
    it('成功创建会话', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'conv-new', title: '新对话', model_id: 'model-001', created_at: new Date().toISOString() }],
        rowCount: 1,
      });

      const result = await conversationController.createConversation('user-001', {
        title: '新对话',
        modelId: 'model-001',
      });

      expect(result.title).toBe('新对话');
      expect(result.model_id).toBe('model-001');
    });

    it('默认标题为"新对话"', async () => {
      mockPool.query.mockImplementation(async (_sql: string, params: any[]) => {
        expect(params[2]).toBe('新对话');
        return {
          rows: [{ id: 'conv-new', title: '新对话', model_id: null, created_at: new Date().toISOString() }],
          rowCount: 1,
        };
      });

      await conversationController.createConversation('user-001', {});
    });
  });

  describe('updateConversation', () => {
    it('成功更新会话标题', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockConversation, title: '更新后标题' }],
        rowCount: 1,
      });

      const result = await conversationController.updateConversation('conv-001', 'user-001', {
        title: '更新后标题',
      });

      expect(result.title).toBe('更新后标题');
    });

    it('会话不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        conversationController.updateConversation('nonexistent', 'user-001', { title: 'test' })
      ).rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('toggleArchiveConversation', () => {
    it('成功归档会话', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockConversation, is_archived: true }],
        rowCount: 1,
      });

      const result = await conversationController.toggleArchiveConversation('conv-001', 'user-001');

      expect(result.is_archived).toBe(true);
    });

    it('取消归档', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockArchivedConversation, is_archived: false }],
        rowCount: 1,
      });

      const result = await conversationController.toggleArchiveConversation('conv-002', 'user-001');

      expect(result.is_archived).toBe(false);
    });

    it('会话不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        conversationController.toggleArchiveConversation('nonexistent', 'user-001')
      ).rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('deleteConversation', () => {
    it('成功删除会话', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 'conv-001' }], rowCount: 1 });

      const result = await conversationController.deleteConversation('conv-001', 'user-001');

      expect(result.message).toBe('会话已删除');
    });

    it('会话不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(
        conversationController.deleteConversation('nonexistent', 'user-001')
      ).rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('clearAllConversations', () => {
    it('成功清空所有会话', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 5 });

      const result = await conversationController.clearAllConversations('user-001');

      expect(result.message).toContain('5');
    });

    it('无会话时返回 0', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await conversationController.clearAllConversations('user-001');

      expect(result.message).toContain('0');
    });
  });

  describe('addMessage', () => {
    it('成功添加用户消息', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('MAX(order_index)')) {
          return { rows: [{ max_order: 3 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO conversation_messages')) {
          return {
            rows: [{
              id: 'msg-new',
              role: 'user',
              content: '新消息',
              tokens: 10,
              order_index: 4,
              created_at: new Date().toISOString(),
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('UPDATE conversations')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await conversationController.addMessage('conv-001', {
        role: 'user',
        content: '新消息',
        tokens: 10,
      });

      expect(result.role).toBe('user');
      expect(result.content).toBe('新消息');
      expect(result.order_index).toBe(4);
    });

    it('缺少角色应抛出 400', async () => {
      await expect(
        conversationController.addMessage('conv-001', { content: 'test' })
      ).rejects.toMatchObject({ status: 400, message: '角色和内容为必填项' });
    });

    it('无效角色应抛出 400', async () => {
      await expect(
        conversationController.addMessage('conv-001', { role: 'invalid', content: 'test' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('无效的消息角色') });
    });

    it('第一条消息 order_index 为 1', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('MAX(order_index)')) {
          return { rows: [{ max_order: null }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO conversation_messages')) {
          return {
            rows: [{ id: 'msg-first', role: 'user', content: '第一条', tokens: 5, order_index: 1 }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      });

      const result = await conversationController.addMessage('conv-001', {
        role: 'user',
        content: '第一条',
        tokens: 5,
      });

      expect(result.order_index).toBe(1);
    });

    it('添加消息时更新会话 token 计数', async () => {
      let updateCalled = false;
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('MAX(order_index)')) {
          return { rows: [{ max_order: 0 }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO conversation_messages')) {
          return {
            rows: [{ id: 'msg-tok', role: 'assistant', content: 'response', tokens: 500, order_index: 1 }],
            rowCount: 1,
          };
        }
        if (sql.includes('UPDATE conversations')) {
          updateCalled = true;
          // 验证 tokens 参数
          expect(sql).toContain('$2');
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await conversationController.addMessage('conv-001', {
        role: 'assistant',
        content: 'response',
        tokens: 500,
      });

      expect(updateCalled).toBe(true);
    });
  });
});
