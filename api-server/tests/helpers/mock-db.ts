/**
 * 数据库 Mock 辅助工具
 * 提供 mockQuery / mockQueryOnce 等便捷函数
 */

const mockPool = (global as any).dbPool as {
  query: jest.Mock;
  connect: jest.Mock;
};

/**
 * Mock 数据库查询 — 使用自定义函数匹配 SQL 并返回数据
 * @param fn 回调，接收 SQL string，返回模拟行数据数组
 */
export function mockQuery(fn: (sql: string, params?: any[]) => any[]) {
  mockPool.query.mockImplementation(async (sql: string, params?: any[]) => {
    const rows = fn(sql, params);
    return { rows, rowCount: rows.length };
  });
}

/**
 * Mock 数据库查询 — 单次匹配
 * 匹配到指定 SQL 后，后续查询恢复默认空数组
 * @param sqlPartial SQL 片段（子串匹配）
 * @param rows 返回的行数据
 */
export function mockQueryOnce(sqlPartial: string, rows: any[] = []) {
  mockPool.query.mockImplementationOnce(async (sql: string, params?: any[]) => {
    if (sql.includes(sqlPartial)) {
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
}

/**
 * Mock 数据库查询返回单行
 * @param sqlPartial SQL 片段
 * @param row 返回的单行数据（null 表示空）
 */
export function mockQueryOne(sqlPartial: string, row: Record<string, any> | null) {
  mockPool.query.mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes(sqlPartial)) {
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
}

/**
 * Mock 数据库更新/删除操作
 * @param sqlPartial SQL 片段
 * @param rowCount 影响的行数
 */
export function mockAffectedRows(sqlPartial: string, rowCount: number = 1) {
  mockPool.query.mockImplementation(async (sql: string, params?: any[]) => {
    if (sql.includes(sqlPartial)) {
      return { rows: [], rowCount };
    }
    return { rows: [], rowCount: 0 };
  });
}

/**
 * 重置所有 mock（在 beforeEach 中使用）
 */
export function resetDbMocks() {
  mockPool.query.mockReset();
  mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
}
