import { Router, Request, Response } from 'express';
import * as conversationController from '../controllers/conversation.controller';

const router = Router();

/**
 * 获取所有会话
 * GET /api/conversations
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const { includeArchived, page, pageSize } = req.query;
    const result = await conversationController.getUserConversations(userId, {
      includeArchived: includeArchived === 'true',
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取会话详情
 * GET /api/conversations/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const conversation = await conversationController.getConversationById(id, userId);
    return res.json(conversation);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 创建会话
 * POST /api/conversations
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const conversationData = req.body;
    const conversation = await conversationController.createConversation(userId, conversationData);
    return res.status(201).json(conversation);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 更新会话
 * PUT /api/conversations/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const updates = req.body;
    const conversation = await conversationController.updateConversation(id, userId, updates);
    return res.json(conversation);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 归档/取消归档会话
 * PATCH /api/conversations/:id/archive
 */
router.patch('/:id/archive', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const conversation = await conversationController.toggleArchiveConversation(id, userId);
    return res.json(conversation);
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 删除会话
 * DELETE /api/conversations/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    await conversationController.deleteConversation(id, userId);
    return res.json({ message: '会话已删除' });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 清空所有会话
 * DELETE /api/conversations
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    await conversationController.clearAllConversations(userId);
    return res.json({ message: '所有会话已清空' });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

export default router;
