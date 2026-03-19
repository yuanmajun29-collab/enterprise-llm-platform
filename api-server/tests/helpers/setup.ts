/**
 * 全局测试 setup
 * Mock 数据库连接和 Redis 客户端
 */

// Mock pg Pool
const mockPool = {
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  }),
  end: jest.fn().mockResolvedValue(undefined),
};

// 注入到全局
(global as any).dbPool = mockPool;

// 重置所有 mock 在每个测试之间
beforeEach(() => {
  jest.clearAllMocks();
  // 重置默认行为
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

// 导出 mockPool 供测试使用
export { mockPool };
