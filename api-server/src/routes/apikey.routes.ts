import { Router, Request, Response } from 'express';
import * as apikeyController from '../controllers/apikey.controller';

const router = Router();

/**
 * 创建 API Key
 * POST /api/apikeys
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }

    const { name, description, expiresAt, ipWhitelist, rateLimitPerHour, rateLimitPerDay } = req.body;
    const result = await apikeyController.createApiKey(userId, {
      name,
      description,
      expiresAt,
      ipWhitelist,
      rateLimitPerHour,
      rateLimitPerDay,
    });

    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: {
        message: error.message,
        type: error.type || 'internal_error',
        code: error.code,
      },
    });
  }
});

/**
 * 列出 API Keys
 * GET /api/apikeys
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }

    const result = await apikeyController.listApiKeys(userId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: {
        message: error.message,
        type: error.type || 'internal_error',
        code: error.code,
      },
    });
  }
});

/**
 * 获取 API Key 详情
 * GET /api/apikeys/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }

    const { id } = req.params;
    const result = await apikeyController.getApiKeyInfo(userId, id);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: {
        message: error.message,
        type: error.type || 'internal_error',
        code: error.code,
      },
    });
  }
});

/**
 * 撤销 API Key
 * DELETE /api/apikeys/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }

    const { id } = req.params;
    const result = await apikeyController.revokeApiKey(userId, id);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      error: {
        message: error.message,
        type: error.type || 'internal_error',
        code: error.code,
      },
    });
  }
});

export const apikeyRoutes = router;
