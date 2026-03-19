import { Request, Response, NextFunction } from 'express';
import { insert } from '../config/database';
import { logger } from '../utils/logger';

// ========================================
// 审计日志中间件
// ========================================

/**
 * 从请求方法推断审计动作类型
 */
function inferAction(req: Request): string {
  const method = req.method.toUpperCase();
  const basePath = req.path.split('/')[1] || 'unknown';

  const actionMap: Record<string, Record<string, string>> = {
    POST: { default: 'create', user: 'user.create', model: 'model.create', conversation: 'conversation.create' },
    PUT: { default: 'update', user: 'user.update', model: 'model.update' },
    PATCH: { default: 'update' },
    DELETE: { default: 'delete', user: 'user.delete', model: 'model.delete', apikey: 'apikey.revoke' },
    GET: { default: 'read' },
  };

  const methodMap = actionMap[method] || actionMap['GET'];
  return methodMap[basePath] || `${basePath}.${methodMap.default}`;
}

/**
 * 从路由路径推断资源类型
 */
function inferResourceType(req: Request): string {
  const segments = req.path.split('/').filter(Boolean);
  if (segments.length > 0) {
    // 去掉 'api' 前缀后取第一段
    const resource = segments[0] === 'api' ? segments[1] : segments[0];
    if (resource && resource !== ':id' && !resource.startsWith(':')) {
      return resource;
    }
  }
  return 'unknown';
}

/**
 * 从路由参数中提取资源 ID
 */
function inferResourceId(req: Request): string | null {
  // 尝试从 URL 路径中提取 UUID 格式的 ID
  const segments = req.path.split('/').filter(Boolean);
  for (const seg of segments) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) {
      return seg;
    }
  }

  // 尝试从 params 获取
  if (req.params.id) {
    return req.params.id;
  }

  return null;
}

/**
 * 需要审计的方法（增删改）
 */
const AUDIT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * 审计日志中间件
 * 异步写入 audit_logs 表，不阻塞请求
 * 仅记录增删改操作（POST/PUT/PATCH/DELETE）
 */
export function auditLogger(req: Request, res: Response, next: NextFunction) {
  // 仅记录增删改操作
  if (!AUDIT_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  // 记录请求信息（在响应前捕获）
  const userId = req.user?.userId || null;
  const ip = req.ip || req.socket.remoteAddress || null;
  const userAgent = req.get('User-Agent') || null;
  const action = inferAction(req);
  const resourceType = inferResourceType(req);
  const resourceId = inferResourceId(req);

  // 监听响应完成事件，记录审计日志
  res.on('finish', () => {
    const status = res.statusCode >= 400 ? 'failure' : 'success';

    // 异步写入审计日志，不阻塞请求
    insert(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent, status)
      VALUES ($1::uuid, $2, $3, $4, $5::inet, $6, $7)
    `, [userId, action, resourceType, resourceId, ip, userAgent, status])
      .catch((error) => {
        // 审计日志写入失败不应影响业务流程
        logger.error('Failed to write audit log:', error);
      });
  });

  next();
}
