import { Router, Request, Response } from 'express';
import * as usageController from '../controllers/usage.controller';

const router = Router();

/**
 * 获取使用记录（当前用户）
 * GET /api/usage/records
 */
router.get('/records', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const { limit, offset, startDate, endDate, model, status } = req.query;
    const result = await usageController.getUsageRecords(userId, {
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
      startDate: startDate as string,
      endDate: endDate as string,
      model: model as string,
      status: status as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取每日使用汇总（当前用户）
 * GET /api/usage/daily
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const { days = 30 } = req.query;
    const summary = await usageController.getDailyUsage(userId, Number(days));
    res.json({ data: summary });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取今日使用统计（当前用户）
 * GET /api/usage/today
 */
router.get('/today', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const stats = await usageController.getTodayUsage(userId);
    res.json(stats);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：获取全局使用统计
 * GET /api/usage/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { days, department, model } = req.query;
    const stats = await usageController.getGlobalUsageStats({
      days: Number(days) || 30,
      department: department as string,
      model: model as string,
    });
    res.json(stats);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：获取所有使用记录
 * GET /api/usage/all
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const { limit, offset, startDate, endDate, model, status, userId } = req.query;
    const result = await usageController.getAllUsageRecords({
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
      startDate: startDate as string,
      endDate: endDate as string,
      model: model as string,
      status: status as string,
      userId: userId as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

export default router;
