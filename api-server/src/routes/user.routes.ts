import { Router, Request, Response } from 'express';
import * as userController from '../controllers/user.controller';

const router = Router();

/**
 * 获取当前用户信息
 * GET /api/user/info
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const user = await userController.getUserInfo(userId);
    res.json(user);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 更新用户信息
 * PUT /api/user/info
 */
router.put('/info', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const updates = req.body;
    const user = await userController.updateUser(userId, updates);
    res.json(user);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取用户配额
 * GET /api/user/quota
 */
router.get('/quota', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      return res.status(401).json({ error: { message: '未授权', type: 'unauthorized' } });
    }
    const quota = await userController.getUserQuota(userId);
    res.json(quota);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：获取用户列表
 * GET /api/user/list
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const { page, pageSize, search, department, isActive, sortBy, sortOrder } = req.query;
    const result = await userController.listUsers({
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 20,
      search: search as string,
      department: department as string,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as string,
    });
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：更新用户状态
 * PUT /api/user/:id/status
 */
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const adminUserId = req.headers['x-user-id'] as string;
    const { id } = req.params;
    const { isActive } = req.body;
    const result = await userController.updateUserStatus(adminUserId, id, isActive);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：设置用户角色
 * PUT /api/user/:id/role
 */
router.put('/:id/role', async (req: Request, res: Response) => {
  try {
    const adminUserId = req.headers['x-user-id'] as string;
    const { id } = req.params;
    const { isAdmin } = req.body;
    const result = await userController.setUserRole(adminUserId, id, isAdmin);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：设置用户配额
 * PUT /api/user/:id/quota
 */
router.put('/:id/quota', async (req: Request, res: Response) => {
  try {
    const adminUserId = req.headers['x-user-id'] as string;
    const { id } = req.params;
    const { quotaType, limits } = req.body;
    const result = await userController.setUserQuota(adminUserId, id, quotaType, limits);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 管理员：删除用户
 * DELETE /api/user/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const adminUserId = req.headers['x-user-id'] as string;
    const { id } = req.params;
    const result = await userController.deleteUser(adminUserId, id);
    res.json(result);
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

/**
 * 获取部门列表
 * GET /api/user/departments
 */
router.get('/departments', async (_req: Request, res: Response) => {
  try {
    const departments = await userController.getDepartments();
    res.json({ data: departments });
  } catch (error: any) {
    res.status(error.status || 500).json({ error: { message: error.message, type: error.type || 'internal_error' } });
  }
});

export default router;
