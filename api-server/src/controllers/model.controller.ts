import { v4 as uuidv4 } from 'uuid';
import { query, insert, update, queryOne, remove } from '../config/database';

/**
 * 获取所有模型
 */
export async function getAllModels() {
  const models = await query(`
    SELECT id, name, display_name, description, provider, parameters, context_length,
           is_active, is_public, requires_approval, cost_per_1k_tokens, created_at
    FROM models
    ORDER BY parameters ASC
  `);

  return models;
}

/**
 * 获取可用模型（公开 + 活跃）
 */
export async function getAvailableModels() {
  const models = await query(`
    SELECT id, name, display_name, description, provider, parameters, context_length,
           cost_per_1k_tokens
    FROM models
    WHERE is_active = true AND is_public = true
    ORDER BY parameters ASC
  `);

  return models;
}

/**
 * 获取模型详情
 */
export async function getModelById(id: string) {
  const model = await queryOne(`
    SELECT id, name, display_name, description, provider, model_path, version,
           parameters, context_length, is_active, is_public, requires_approval,
           cost_per_1k_tokens, created_at, updated_at
    FROM models
    WHERE id = $1
  `, [id]);

  if (!model) {
    throw { status: 404, message: '模型不存在', type: 'not_found' };
  }

  return model;
}

/**
 * 创建模型
 */
export async function createModel(modelData: any) {
  const { name, displayName, description, provider, modelPath, version, parameters, contextLength, isPublic, requiresApproval, costPer1kTokens } = modelData;

  if (!name || !provider) {
    throw { status: 400, message: '模型名称和供应商为必填项', type: 'validation_error' };
  }

  const model = await insert(`
    INSERT INTO models (id, name, display_name, description, provider, model_path, version,
                        parameters, context_length, is_public, requires_approval, cost_per_1k_tokens)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, name, display_name, description, provider, parameters, context_length,
              is_active, is_public, requires_approval, cost_per_1k_tokens, created_at
  `, [
    uuidv4(),
    name,
    displayName,
    description,
    provider,
    modelPath,
    version,
    parameters,
    contextLength || 4096,
    isPublic !== false,
    requiresApproval || false,
    costPer1kTokens || 0,
  ]);

  return model;
}

/**
 * 更新模型
 */
export async function updateModel(id: string, updates: any) {
  const { displayName, description, isActive, isPublic, requiresApproval, costPer1kTokens, contextLength } = updates;

  const model = await queryOne(`
    UPDATE models
    SET display_name = COALESCE($2, display_name),
        description = COALESCE($3, description),
        is_active = COALESCE($4, is_active),
        is_public = COALESCE($5, is_public),
        requires_approval = COALESCE($6, requires_approval),
        cost_per_1k_tokens = COALESCE($7, cost_per_1k_tokens),
        context_length = COALESCE($8, context_length),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, name, display_name, description, provider, parameters, context_length,
              is_active, is_public, requires_approval, cost_per_1k_tokens, updated_at
  `, [id, displayName, description, isActive, isPublic, requiresApproval, costPer1kTokens, contextLength]);

  if (!model) {
    throw { status: 404, message: '模型不存在', type: 'not_found' };
  }

  return model;
}

/**
 * 切换模型启用/禁用状态
 */
export async function toggleModelStatus(id: string) {
  const model = await queryOne(`
    UPDATE models
    SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, name, display_name, is_active, updated_at
  `, [id]);

  if (!model) {
    throw { status: 404, message: '模型不存在', type: 'not_found' };
  }

  return model;
}

/**
 * 删除模型
 */
export async function deleteModel(id: string) {
  const model = await queryOne(`
    SELECT id, name FROM models WHERE id = $1
  `, [id]);

  if (!model) {
    throw { status: 404, message: '模型不存在', type: 'not_found' };
  }

  const count = await remove(`DELETE FROM models WHERE id = $1`, [id]);
  if (count === 0) {
    throw { status: 500, message: '删除模型失败', type: 'internal_error' };
  }

  return { message: `模型 ${model.name} 已删除` };
}

/**
 * 获取模型使用统计
 */
export async function getModelUsageStats(modelId?: string) {
  let whereClause = '';
  const params: any[] = [];

  if (modelId) {
    whereClause = 'WHERE m.id = $1';
    params.push(modelId);
  }

  const stats = await query(`
    SELECT m.id, m.name, m.display_name, m.provider, m.is_active,
           COALESCE(SUM(ur.total_tokens), 0) as total_tokens_used,
           COALESCE(COUNT(ur.id), 0) as total_requests,
           COALESCE(AVG(ur.duration_seconds), 0) as avg_duration
    FROM models m
    LEFT JOIN usage_records ur ON m.name = ur.model_name
    ${whereClause}
    GROUP BY m.id, m.name, m.display_name, m.provider, m.is_active
    ORDER BY total_tokens_used DESC
  `, params);

  return stats;
}
