import { v4 as uuidv4 } from 'uuid';
import { query, insert, queryOne } from '../config/database';

/**
 * 获取使用记录
 */
export async function getUsageRecords(userId: string, options: any) {
  const { limit = 50, offset = 0, startDate, endDate, model, status } = options;

  let queryStr = `
    SELECT id, model_name, request_type, prompt_tokens, completion_tokens, total_tokens,
           duration_seconds, status, error_message, created_at
    FROM usage_records
    WHERE user_id = $1
  `;
  const params: any[] = [userId];
  let paramIndex = 2;

  if (startDate) {
    queryStr += ` AND created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    queryStr += ` AND created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }

  if (model) {
    queryStr += ` AND model_name = $${paramIndex}`;
    params.push(model);
    paramIndex++;
  }

  if (status) {
    queryStr += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  queryStr += `
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(limit, offset);

  // 总数查询
  const countQueryStr = queryStr.replace(
    /SELECT id.*FROM usage_records/,
    'SELECT COUNT(*) as total FROM usage_records'
  ).replace(/ORDER BY.*$/, '').replace(/LIMIT.*$/, '').replace(/OFFSET.*$/, '');

  const countResult = await queryOne(countQueryStr, params.slice(0, paramIndex - 1));
  const total = parseInt(countResult?.total || '0');

  const records = await query(queryStr, params);

  return {
    data: records,
    pagination: {
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * 获取每日使用汇总
 */
export async function getDailyUsage(userId: string, days: number) {
  const records = await query(`
    SELECT date, total_tokens, total_requests, successful_requests, failed_requests, average_duration_seconds
    FROM daily_usage_summary
    WHERE user_id = $1
      AND date >= CURRENT_DATE - INTERVAL '${days} days'
    ORDER BY date DESC
  `, [userId]);

  return records;
}

/**
 * 获取今日使用统计
 */
export async function getTodayUsage(userId: string) {
  const todayRecord = await queryOne(`
    SELECT total_tokens, total_requests, successful_requests, failed_requests, average_duration_seconds
    FROM daily_usage_summary
    WHERE user_id = $1 AND date = CURRENT_DATE
  `, [userId]);

  if (!todayRecord) {
    return {
      totalTokens: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageDuration: 0,
    };
  }

  return {
    totalTokens: parseInt(todayRecord.total_tokens || '0'),
    totalRequests: parseInt(todayRecord.total_requests || '0'),
    successfulRequests: parseInt(todayRecord.successful_requests || '0'),
    failedRequests: parseInt(todayRecord.failed_requests || '0'),
    averageDuration: parseFloat(todayRecord.average_duration_seconds || '0'),
  };
}

/**
 * 记录使用
 */
export async function recordUsage(usageData: any) {
  const { userId, modelName, requestType, promptTokens, completionTokens, totalTokens, durationSeconds, status, errorMessage, requestId, ipAddress } = usageData;

  const record = await insert(`
    INSERT INTO usage_records (id, user_id, model_name, request_type, prompt_tokens, completion_tokens,
                               total_tokens, duration_seconds, status, error_message, request_id, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id, user_id, model_name, request_type, total_tokens, status, created_at
  `, [
    uuidv4(),
    userId,
    modelName,
    requestType,
    promptTokens || 0,
    completionTokens || 0,
    totalTokens || 0,
    durationSeconds || 0,
    status,
    errorMessage,
    requestId,
    ipAddress,
  ]);

  return record;
}

/**
 * 管理员：获取全局使用统计
 */
export async function getGlobalUsageStats(options?: any) {
  const { days = 30, department, model } = options || {};

  // 总览统计
  const overview = await queryOne(`
    SELECT
      COUNT(DISTINCT user_id) as active_users,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(total_requests), 0) as total_requests,
      COALESCE(SUM(successful_requests), 0) as successful_requests,
      COALESCE(SUM(failed_requests), 0) as failed_requests
    FROM daily_usage_summary
    WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
  `);

  // 按日期统计
  const byDate = await query(`
    SELECT date, SUM(total_tokens) as total_tokens, SUM(total_requests) as total_requests,
           SUM(successful_requests) as successful_requests, SUM(failed_requests) as failed_requests
    FROM daily_usage_summary
    WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
    GROUP BY date
    ORDER BY date ASC
  `);

  // 按模型统计
  let modelStatsQuery = `
    SELECT model_name,
           SUM(total_tokens) as total_tokens,
           SUM(total_requests) as total_requests,
           AVG(duration_seconds) as avg_duration
    FROM usage_records
    WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
  `;
  const modelParams: any[] = [];
  if (model) {
    modelStatsQuery += ` AND model_name = $1`;
    modelParams.push(model);
  }
  modelStatsQuery += ` GROUP BY model_name ORDER BY total_tokens DESC`;

  const byModel = await query(modelStatsQuery, modelParams);

  // 按部门统计
  const byDepartment = await query(`
    SELECT u.department,
           COUNT(DISTINCT d.user_id) as active_users,
           COALESCE(SUM(d.total_tokens), 0) as total_tokens,
           COALESCE(SUM(d.total_requests), 0) as total_requests
    FROM daily_usage_summary d
    JOIN users u ON d.user_id = u.id
    WHERE d.date >= CURRENT_DATE - INTERVAL '${days} days'
      AND u.department IS NOT NULL
    GROUP BY u.department
    ORDER BY total_tokens DESC
  `);

  // Top 用户
  const topUsers = await query(`
    SELECT u.id, u.username, u.display_name, u.department,
           SUM(d.total_tokens) as total_tokens,
           SUM(d.total_requests) as total_requests
    FROM daily_usage_summary d
    JOIN users u ON d.user_id = u.id
    WHERE d.date >= CURRENT_DATE - INTERVAL '${days} days'
    GROUP BY u.id, u.username, u.display_name, u.department
    ORDER BY total_tokens DESC
    LIMIT 10
  `);

  return {
    overview: {
      activeUsers: parseInt(overview?.active_users || '0'),
      totalTokens: parseInt(overview?.total_tokens || '0'),
      totalRequests: parseInt(overview?.total_requests || '0'),
      successfulRequests: parseInt(overview?.successful_requests || '0'),
      failedRequests: parseInt(overview?.failed_requests || '0'),
      days,
    },
    byDate,
    byModel,
    byDepartment,
    topUsers,
  };
}

/**
 * 管理员：获取所有使用记录
 */
export async function getAllUsageRecords(options: any) {
  const { limit = 50, offset = 0, startDate, endDate, model, status, userId } = options;

  let queryStr = `
    SELECT ur.id, ur.user_id, u.username, u.department,
           ur.model_name, ur.request_type, ur.prompt_tokens, ur.completion_tokens,
           ur.total_tokens, ur.duration_seconds, ur.status, ur.error_message, ur.created_at
    FROM usage_records ur
    LEFT JOIN users u ON ur.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  let paramIndex = 1;

  if (userId) {
    queryStr += ` AND ur.user_id = $${paramIndex}`;
    params.push(userId);
    paramIndex++;
  }
  if (startDate) {
    queryStr += ` AND ur.created_at >= $${paramIndex}`;
    params.push(startDate);
    paramIndex++;
  }
  if (endDate) {
    queryStr += ` AND ur.created_at <= $${paramIndex}`;
    params.push(endDate);
    paramIndex++;
  }
  if (model) {
    queryStr += ` AND ur.model_name = $${paramIndex}`;
    params.push(model);
    paramIndex++;
  }
  if (status) {
    queryStr += ` AND ur.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  queryStr += ` ORDER BY ur.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const records = await query(queryStr, params);
  return { data: records };
}
