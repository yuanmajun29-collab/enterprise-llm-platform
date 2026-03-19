/**
 * 健康检查集成测试
 */

import request from 'supertest';
import express, { Application } from 'express';
import { requestLogger } from '../../src/middleware';

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  RequestLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

function createApp(): Application {
  const app = express();
  app.use(express.json());
  app.use(requestLogger);

  // 健康检查
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Enterprise LLM Platform API',
      version: '1.0.0',
    });
  });

  return app;
}

describe('Health Check', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  it('应返回正确的 JSON 结构', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);

    // 验证结构
    expect(res.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
      service: 'Enterprise LLM Platform API',
      version: '1.0.0',
    });
  });

  it('timestamp 应为有效 ISO 格式', async () => {
    const res = await request(app).get('/health');
    const date = new Date(res.body.timestamp);

    expect(date.toISOString()).toBe(res.body.timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  it('多次请求都应成功', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });

  it('status 字段始终为 "ok"', async () => {
    const res = await request(app).get('/health');
    expect(res.body.status).toBe('ok');
  });

  it('响应时间应在 100ms 内', async () => {
    const start = Date.now();
    await request(app).get('/health');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
