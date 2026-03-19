import { Router, Request, Response } from 'express';
import * as modelController from '../controllers/model.controller';

const router = Router();

/**
 * 获取所有模型（管理员，包含已禁用）
 * GET /api/models
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const models = await modelController.getAllModels();
    res.json({ data: models });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取可用模型（普通用户）
 * GET /api/models/available
 */
router.get('/available', async (_req: Request, res: Response) => {
  try {
    const models = await modelController.getAvailableModels();
    res.json({ data: models });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取模型使用统计
 * GET /api/models/usage
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.query;
    const stats = await modelController.getModelUsageStats(modelId as string);
    res.json({ data: stats });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取模型详情
 * GET /api/models/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const model = await modelController.getModelById(id);
    res.json(model);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 创建模型（管理员）
 * POST /api/models
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const modelData = req.body;
    const model = await modelController.createModel(modelData);
    res.status(201).json(model);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 更新模型（管理员）
 * PUT /api/models/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const model = await modelController.updateModel(id, updates);
    res.json(model);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 切换模型启用/禁用状态（管理员）
 * PATCH /api/models/:id/toggle
 */
router.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const model = await modelController.toggleModelStatus(id);
    res.json(model);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 删除模型（管理员）
 * DELETE /api/models/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await modelController.deleteModel(id);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

export default router;
