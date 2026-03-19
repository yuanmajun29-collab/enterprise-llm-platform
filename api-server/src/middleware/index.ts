import { Request, Response, NextFunction } from 'express';
import { RequestLogger } from '../utils/logger';

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // 记录请求信息
  RequestLogger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    RequestLogger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    });

    // 如果是错误响应，记录错误
    if (res.statusCode >= 400) {
      RequestLogger.error('Request failed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      });
    }
  });

  next();
}

/**
 * 错误处理中间件
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  RequestLogger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // 处理已知错误类型
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: {
        message: 'Unauthorized',
        type: 'unauthorized',
        code: 'AUTH_001',
      },
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: err.message,
        type: 'validation_error',
        code: 'VALID_001',
      },
    });
  }

  if (err.code === '23505') {
    // PostgreSQL 唯一约束 violation
    return res.status(409).json({
      error: {
        message: 'Resource already exists',
        type: 'conflict',
        code: 'DB_001',
      },
    });
  }

  // 默认错误响应
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      type: 'internal_error',
      code: 'SERVER_001',
    },
  });
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: 'Not Found',
      type: 'not_found',
      code: 'NOT_FOUND',
    },
  });
}

/**
 * CORS 预检请求处理
 */
export function handlePreflight(req: Request, res: Response, next: NextFunction) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.send(200);
  } else {
    next();
  }
}
