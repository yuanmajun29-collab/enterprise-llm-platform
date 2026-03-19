import * as userController from '../../../src/controllers/user.controller';
import { mockPool } from '../../helpers/setup';
import {
  mockUser,
  mockAdminUser,
  mockUserQuotas,
  mockDailyUsageSummary,
  mockMonthlyUsageSummary,
} from '../../helpers/fixtures';
import { setupMockRedis, resetRedisMocks } from '../../helpers/mock-redis';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-001' }));

let mockRedisClient: any;

beforeAll(() => {
  mockRedisClient = setupMockRedis();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  resetRedisMocks();
});

describe('User Controller', () => {
  describe('getUserInfo', () => {
    it('成功返回用户信息', async () => {
      mockPool.query.mockResolvedValue({ rows: [mockUser], rowCount: 1 });

      const result = await userController.getUserInfo('user-001');

      expect(result.id).toBe('user-001');
      expect(result.username).toBe('testuser');
      expect(result.email).toBe('test@example.com');
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(userController.getUserInfo('nonexistent'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('updateUser', () => {
    it('成功更新用户信息', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('UPDATE users')) {
          return {
            rows: [{ ...mockUser, display_name: '新名称', department: '产品部' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await userController.updateUser('user-001', {
        displayName: '新名称',
        department: '产品部',
      });

      expect(result.display_name).toBe('新名称');
      expect(result.department).toBe('产品部');
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(userController.updateUser('nonexistent', { displayName: '新名称' }))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('getUserQuota', () => {
    it('成功返回用户配额和使用情况', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT quota_type') && sql.includes('FROM user_quotas')) {
          return { rows: mockUserQuotas, rowCount: 2 };
        }
        if (sql.includes('daily_usage_summary') && sql.includes('CURRENT_DATE')) {
          if (!sql.includes('DATE_TRUNC')) {
            // 今日使用量
            return { rows: [mockDailyUsageSummary], rowCount: 1 };
          }
          // 本月使用量
          return { rows: [mockMonthlyUsageSummary], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await userController.getUserQuota('user-001');

      expect(result.userId).toBe('user-001');
      expect(result.quotas).toHaveProperty('default');
      expect(result.quotas).toHaveProperty('premium');
      expect(result.usage).toHaveProperty('today');
      expect(result.usage).toHaveProperty('month');
    });

    it('无使用记录时返回零值', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM user_quotas')) {
          return { rows: mockUserQuotas, rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await userController.getUserQuota('user-001');

      expect(result.usage.today.tokens).toBe(0);
      expect(result.usage.month.tokens).toBe(0);
    });
  });

  describe('listUsers', () => {
    it('默认参数返回分页用户列表', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '3' }], rowCount: 1 };
        }
        return { rows: [mockUser, mockAdminUser], rowCount: 2 };
      });

      const result = await userController.listUsers({});

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.pagination).toHaveProperty('page');
      expect(result.pagination).toHaveProperty('pageSize');
      expect(result.pagination).toHaveProperty('total');
      expect(result.pagination).toHaveProperty('totalPages');
    });

    it('搜索条件正确传递到 SQL', async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '1' }], rowCount: 1 };
        }
        // 验证搜索参数
        expect(params).toEqual(expect.arrayContaining([expect.stringContaining('test')]));
        return { rows: [mockUser], rowCount: 1 };
      });

      const result = await userController.listUsers({ search: 'test', page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(1);
    });

    it('部门筛选正确传递', async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '0' }], rowCount: 1 };
        }
        expect(params).toEqual(expect.arrayContaining(['技术部']));
        return { rows: [], rowCount: 0 };
      });

      await userController.listUsers({ department: '技术部' });
    });

    it('分页参数正确计算 offset', async () => {
      let capturedSql = '';
      mockPool.query.mockImplementation(async (sql: string) => {
        capturedSql = sql;
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '100' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      await userController.listUsers({ page: 3, pageSize: 20 });

      // LIMIT $x OFFSET $y
      expect(capturedSql).toMatch(/LIMIT.*OFFSET/);
    });
  });

  describe('updateUserStatus', () => {
    it('成功更新用户状态', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockUser, id: 'user-002', is_active: false }],
        rowCount: 1,
      });

      const result = await userController.updateUserStatus('admin-001', 'user-002', false);

      expect(result.is_active).toBe(false);
    });

    it('不能修改自己的状态', async () => {
      await expect(userController.updateUserStatus('user-001', 'user-001', false))
        .rejects.toMatchObject({ status: 400, message: '不能修改自己的状态' });
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(userController.updateUserStatus('admin-001', 'nonexistent', false))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('setUserRole', () => {
    it('成功设置用户角色', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockUser, is_admin: true }],
        rowCount: 1,
      });

      const result = await userController.setUserRole('admin-001', 'user-001', true);

      expect(result.is_admin).toBe(true);
    });

    it('不能修改自己的角色', async () => {
      await expect(userController.setUserRole('user-001', 'user-001', true))
        .rejects.toMatchObject({ status: 400, message: '不能修改自己的角色' });
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(userController.setUserRole('admin-001', 'nonexistent', true))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('setUserQuota', () => {
    it('成功设置用户配额', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          user_id: 'user-001',
          quota_type: 'default',
          daily_limit: 200000,
          hourly_limit: 2000,
          monthly_limit: 6000000,
        }],
        rowCount: 1,
      });

      const result = await userController.setUserQuota('admin-001', 'user-001', 'default', {
        dailyLimit: 200000,
        hourlyLimit: 2000,
        monthlyLimit: 6000000,
      });

      expect(result.daily_limit).toBe(200000);
    });
  });

  describe('deleteUser', () => {
    it('成功删除用户（软删除）', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 'user-002', username: 'testuser2' }],
        rowCount: 1,
      });

      const result = await userController.deleteUser('admin-001', 'user-002');

      expect(result.message).toContain('已删除');
    });

    it('不能删除自己', async () => {
      await expect(userController.deleteUser('user-001', 'user-001'))
        .rejects.toMatchObject({ status: 400, message: '不能删除自己' });
    });

    it('用户不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(userController.deleteUser('admin-001', 'nonexistent'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });
});
