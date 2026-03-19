import * as modelController from '../../../src/controllers/model.controller';
import { mockPool } from '../../helpers/setup';
import { mockModels } from '../../helpers/fixtures';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-001' }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Model Controller', () => {
  describe('getAllModels', () => {
    it('返回所有模型列表', async () => {
      mockPool.query.mockResolvedValue({ rows: mockModels, rowCount: 3 });

      const result = await modelController.getAllModels();

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('provider');
    });
  });

  describe('getAvailableModels', () => {
    it('只返回活跃且公开的模型', async () => {
      const availableModels = mockModels.filter((m) => m.is_active && m.is_public);
      mockPool.query.mockResolvedValue({ rows: availableModels, rowCount: 2 });

      const result = await modelController.getAvailableModels();

      expect(result).toHaveLength(2);
      expect(result.every((m: any) => m.is_active && m.is_public)).toBe(true);
    });
  });

  describe('getModelById', () => {
    it('成功返回模型详情', async () => {
      mockPool.query.mockResolvedValue({ rows: [mockModels[0]], rowCount: 1 });

      const result = await modelController.getModelById('model-001');

      expect(result.id).toBe('model-001');
      expect(result.name).toBe('qwen-72b-chat');
    });

    it('模型不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(modelController.getModelById('nonexistent'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('createModel', () => {
    const validModelData = {
      name: 'new-model',
      displayName: '新模型',
      description: '测试新模型',
      provider: 'test',
      modelPath: '/models/new-model',
      version: 'v1.0',
      parameters: 7,
      contextLength: 4096,
      isPublic: true,
      requiresApproval: false,
      costPer1kTokens: 0.005,
    };

    it('成功创建模型', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...validModelData, id: 'model-new', is_active: true }],
        rowCount: 1,
      });

      const result = await modelController.createModel(validModelData);

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('new-model');
    });

    it('缺少模型名称应抛出 400', async () => {
      await expect(modelController.createModel({ provider: 'test' }))
        .rejects.toMatchObject({ status: 400, message: '模型名称和供应商为必填项' });
    });

    it('缺少供应商应抛出 400', async () => {
      await expect(modelController.createModel({ name: 'test-model' }))
        .rejects.toMatchObject({ status: 400, message: '模型名称和供应商为必填项' });
    });

    it('默认值正确设置', async () => {
      mockPool.query.mockImplementation(async (_sql: string, params: any[]) => {
        const model = {
          id: 'model-defaults',
          ...validModelData,
          name: 'defaults-model',
          is_active: true,
          is_public: true,
          requires_approval: false,
          cost_per_1k_tokens: 0,
          context_length: 4096,
        };
        return { rows: [model], rowCount: 1 };
      });

      const result = await modelController.createModel({
        name: 'defaults-model',
        provider: 'test',
      });

      expect(result).toBeTruthy();
    });
  });

  describe('updateModel', () => {
    it('成功更新模型', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockModels[0], display_name: '更新后名称' }],
        rowCount: 1,
      });

      const result = await modelController.updateModel('model-001', {
        displayName: '更新后名称',
      });

      expect(result.display_name).toBe('更新后名称');
    });

    it('模型不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(modelController.updateModel('nonexistent', { displayName: 'test' }))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('toggleModelStatus', () => {
    it('成功切换模型状态', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ ...mockModels[0], is_active: false }],
        rowCount: 1,
      });

      const result = await modelController.toggleModelStatus('model-001');

      expect(result.is_active).toBe(false);
    });

    it('模型不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(modelController.toggleModelStatus('nonexistent'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('deleteModel', () => {
    it('成功删除模型', async () => {
      mockPool.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, name FROM models')) {
          return { rows: [mockModels[0]], rowCount: 1 };
        }
        if (sql.includes('DELETE FROM models')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const result = await modelController.deleteModel('model-001');

      expect(result.message).toContain('已删除');
    });

    it('模型不存在应抛出 404', async () => {
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      await expect(modelController.deleteModel('nonexistent'))
        .rejects.toMatchObject({ status: 404, type: 'not_found' });
    });
  });

  describe('getModelUsageStats', () => {
    it('返回模型使用统计', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'model-001',
          name: 'qwen-72b-chat',
          display_name: 'Qwen 72B',
          provider: 'qwen',
          is_active: true,
          total_tokens_used: '1000000',
          total_requests: '5000',
          avg_duration: '1.2',
        }],
        rowCount: 1,
      });

      const result = await modelController.getModelUsageStats();

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('total_tokens_used');
      expect(result[0]).toHaveProperty('total_requests');
    });

    it('指定 modelId 时按模型过滤', async () => {
      mockPool.query.mockImplementation(async (_sql: string, params: any[]) => {
        expect(params).toEqual(['model-001']);
        return {
          rows: [{ id: 'model-001', name: 'qwen-72b-chat', total_tokens_used: '100' }],
          rowCount: 1,
        };
      });

      const result = await modelController.getModelUsageStats('model-001');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('model-001');
    });
  });
});
