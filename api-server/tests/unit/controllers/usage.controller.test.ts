import * as usageController from '../../../src/controllers/usage.controller';
import { mockPool } from '../../helpers/setup';
import { mockUsageRecords } from '../../helpers/fixtures';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-001' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Usage Controller', () => {
  describe('getUsageRecords', () => {
    it('默认参数返回使用记录', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '3' }], rowCount: 1 };
        }
        return { rows: mockUsageRecords, rowCount: 3 };
      });

      const result = await usageController.getUsageRecords('user-001', {});

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('pagination');
      expect(result.data).toHaveLength(3);
    });

    it('支持按模型筛选', async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '2' }], rowCount: 1 };
        }
        // 验证 model 参数
        expect(params).toEqual(expect.arrayContaining(['qwen-72b-chat']));
        return { rows: mockUsageRecords.filter((r) => r.model_name === 'qwen-72b-chat'), rowCount: 2 };
      });

      const result = await usageController.getUsageRecords('user-001', { model: 'qwen-72b-chat' });

      expect(result.data).toHaveLength(2);
    });

    it('支持按状态筛选', async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        expect(params).toEqual(expect.arrayContaining(['failed']));
        return { rows: [mockUsageRecords[2]], rowCount: 1 };
      });

      const result = await usageController.getUsageRecords('user-001', { status: 'failed' });

      expect(result.data).toHaveLength(1);
    });

    it('支持日期范围筛选', async () => {
      mockPool.query.mockImplementation(async (_sql: string, params: any[]) => {
        expect(params).toEqual(expect.arrayContaining(['2024-06-01']));
        expect(params).toEqual(expect.arrayContaining(['2024-06-30']));
        return { rows: [], rowCount: 0 };
      });

      await usageController.getUsageRecords('user-001', {
        startDate: '2024-06-01',
        endDate: '2024-06-30',
      });
    });

    it('分页参数正确传递', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ total: '100' }], rowCount: 1 };
        }
        expect(sql).toMatch(/LIMIT.*OFFSET/);
        return { rows: [], rowCount: 0 };
      });

      await usageController.getUsageRecords('user-001', { limit: 10, offset: 20 });
    });
  });

  describe('getDailyUsage', () => {
    it('返回指定天数的使用汇总', async () => {
      const dailyData = [
        { date: '2024-06-15', total_tokens: '5000', total_requests: '10', successful_requests: '9', failed_requests: '1', average_duration_seconds: '1.2' },
        { date: '2024-06-14', total_tokens: '3000', total_requests: '6', successful_requests: '6', failed_requests: '0', average_duration_seconds: '0.8' },
      ];

      mockPool.query.mockResolvedValue({ rows: dailyData, rowCount: 2 });

      const result = await usageController.getDailyUsage('user-001', 7);

      expect(result).toHaveLength(2);
    });
  });

  describe('getTodayUsage', () => {
    it('有今日记录时返回统计数据', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_tokens: '1000',
          total_requests: '20',
          successful_requests: '18',
          failed_requests: '2',
          average_duration_seconds: '1.5',
        }],
        rowCount: 1,
      });

      const result = await usageController.getTodayUsage('user-001');

      expect(result.totalTokens).toBe(1000);
      expect(result.totalRequests).toBe(20);
      expect(result.successfulRequests).toBe(18);
      expect(result.failedRequests).toBe(2);
      expect(result.averageDuration).toBe(1.5);
    });

    it('无今日记录时返回零值', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await usageController.getTodayUsage('user-001');

      expect(result.totalTokens).toBe(0);
      expect(result.totalRequests).toBe(0);
      expect(result.successfulRequests).toBe(0);
      expect(result.failedRequests).toBe(0);
      expect(result.averageDuration).toBe(0);
    });
  });

  describe('recordUsage', () => {
    it('成功记录使用', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'usage-new',
          user_id: 'user-001',
          model_name: 'qwen-72b-chat',
          request_type: 'chat',
          total_tokens: 300,
          status: 'success',
          created_at: new Date().toISOString(),
        }],
        rowCount: 1,
      });

      const result = await usageController.recordUsage({
        userId: 'user-001',
        modelName: 'qwen-72b-chat',
        requestType: 'chat',
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
        durationSeconds: 1.5,
        status: 'success',
        errorMessage: null,
        requestId: 'req-001',
        ipAddress: '192.168.1.100',
      });

      expect(result.model_name).toBe('qwen-72b-chat');
      expect(result.total_tokens).toBe(300);
    });

    it('记录失败请求', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'usage-fail',
          user_id: 'user-001',
          model_name: 'qwen-72b-chat',
          total_tokens: 0,
          status: 'failed',
        }],
        rowCount: 1,
      });

      const result = await usageController.recordUsage({
        userId: 'user-001',
        modelName: 'qwen-72b-chat',
        requestType: 'chat',
        status: 'failed',
        errorMessage: 'Model overloaded',
      });

      expect(result.status).toBe('failed');
    });
  });

  describe('getGlobalUsageStats', () => {
    it('返回全局统计概览', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('active_users') && sql.includes('COUNT(DISTINCT')) {
          return {
            rows: [{
              active_users: '50',
              total_tokens: '5000000',
              total_requests: '10000',
              successful_requests: '9800',
              failed_requests: '200',
            }],
            rowCount: 1,
          };
        }
        if (sql.includes('GROUP BY date')) {
          return {
            rows: [{ date: '2024-06-15', total_tokens: '100000', total_requests: '200' }],
            rowCount: 1,
          };
        }
        if (sql.includes('GROUP BY model_name')) {
          return {
            rows: [{ model_name: 'qwen-72b-chat', total_tokens: '3000000', total_requests: '5000' }],
            rowCount: 1,
          };
        }
        if (sql.includes('GROUP BY u.department')) {
          return {
            rows: [{ department: '技术部', active_users: 20, total_tokens: '2000000', total_requests: '5000' }],
            rowCount: 1,
          };
        }
        if (sql.includes('ORDER BY total_tokens DESC')) {
          return {
            rows: [{ id: 'user-001', username: 'testuser', total_tokens: '500000', total_requests: '1000' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await usageController.getGlobalUsageStats({ days: 30 });

      expect(result.overview).toBeDefined();
      expect(result.overview.activeUsers).toBe(50);
      expect(result.overview.totalTokens).toBe(5000000);
      expect(result.byDate).toBeDefined();
      expect(result.byModel).toBeDefined();
      expect(result.byDepartment).toBeDefined();
      expect(result.topUsers).toBeDefined();
    });

    it('指定模型过滤', async () => {
      mockPool.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GROUP BY model_name')) {
          expect(params).toEqual(['qwen-72b-chat']);
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      });

      await usageController.getGlobalUsageStats({ days: 7, model: 'qwen-72b-chat' });
    });
  });

  describe('getAllUsageRecords', () => {
    it('返回所有使用记录（管理员）', async () => {
      mockPool.query.mockResolvedValue({ rows: mockUsageRecords, rowCount: 3 });

      const result = await usageController.getAllUsageRecords({});

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveLength(3);
    });

    it('支持按 userId 筛选', async () => {
      mockPool.query.mockImplementation(async (_sql: string, params: any[]) => {
        expect(params).toEqual(expect.arrayContaining(['user-001']));
        return { rows: [mockUsageRecords[0]], rowCount: 1 };
      });

      await usageController.getAllUsageRecords({ userId: 'user-001' });
    });
  });
});
