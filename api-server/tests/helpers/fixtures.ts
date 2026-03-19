import { v4 as uuidv4 } from 'uuid';

// ========================================
// 用户数据
// ========================================

export const mockUser = {
  id: 'user-001',
  username: 'testuser',
  email: 'test@example.com',
  password_hash: '$2a$10$hashedpassword1234567890123456789012345678', // bcrypt hash
  display_name: '测试用户',
  department: '技术部',
  position: '工程师',
  employee_id: 'EMP001',
  avatar_url: null,
  is_active: true,
  is_admin: false,
  created_at: '2024-01-01T00:00:00.000Z',
  last_login_at: '2024-06-15T10:30:00.000Z',
};

export const mockAdminUser = {
  ...mockUser,
  id: 'admin-001',
  username: 'admin',
  email: 'admin@example.com',
  display_name: '管理员',
  is_admin: true,
};

export const mockInactiveUser = {
  ...mockUser,
  id: 'user-002',
  username: 'inactive',
  is_active: false,
};

// ========================================
// 模型数据
// ========================================

export const mockModels = [
  {
    id: 'model-001',
    name: 'qwen-72b-chat',
    display_name: 'Qwen 72B Chat',
    description: '通义千问 72B 对话模型',
    provider: 'qwen',
    parameters: 72,
    context_length: 8192,
    is_active: true,
    is_public: true,
    requires_approval: false,
    cost_per_1k_tokens: 0.01,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'model-002',
    name: 'chatglm3-6b',
    display_name: 'ChatGLM3 6B',
    description: '智谱 GLM3 6B 对话模型',
    provider: 'zhipu',
    parameters: 6,
    context_length: 4096,
    is_active: true,
    is_public: true,
    requires_approval: false,
    cost_per_1k_tokens: 0.002,
    created_at: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 'model-003',
    name: 'llama3-8b',
    display_name: 'Llama 3 8B',
    description: 'Meta Llama 3 8B 模型',
    provider: 'meta',
    parameters: 8,
    context_length: 8192,
    is_active: false,
    is_public: false,
    requires_approval: true,
    cost_per_1k_tokens: 0.003,
    created_at: '2024-02-01T00:00:00.000Z',
  },
];

// ========================================
// 会话数据
// ========================================

export const mockConversation = {
  id: 'conv-001',
  user_id: 'user-001',
  title: '测试对话',
  model_id: 'model-001',
  is_archived: false,
  total_tokens: 1500,
  created_at: '2024-06-01T10:00:00.000Z',
  updated_at: '2024-06-15T10:30:00.000Z',
  model_name: 'qwen-72b-chat',
  model_display_name: 'Qwen 72B Chat',
};

export const mockMessages = [
  {
    id: 'msg-001',
    conversation_id: 'conv-001',
    role: 'user',
    content: '你好，请介绍一下自己',
    tokens: 20,
    order_index: 1,
    created_at: '2024-06-01T10:00:00.000Z',
  },
  {
    id: 'msg-002',
    conversation_id: 'conv-001',
    role: 'assistant',
    content: '你好！我是企业大模型平台的 AI 助手。',
    tokens: 200,
    order_index: 2,
    created_at: '2024-06-01T10:00:05.000Z',
  },
  {
    id: 'msg-003',
    conversation_id: 'conv-001',
    role: 'user',
    content: '帮我写一段 Python 代码',
    tokens: 15,
    order_index: 3,
    created_at: '2024-06-01T10:01:00.000Z',
  },
];

export const mockArchivedConversation = {
  ...mockConversation,
  id: 'conv-002',
  title: '已归档对话',
  is_archived: true,
};

// ========================================
// 使用记录数据
// ========================================

export const mockUsageRecords = [
  {
    id: 'usage-001',
    user_id: 'user-001',
    model_name: 'qwen-72b-chat',
    request_type: 'chat',
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300,
    duration_seconds: 1.5,
    status: 'success',
    error_message: null,
    request_id: 'req-001',
    ip_address: '192.168.1.100',
    created_at: '2024-06-15T10:00:00.000Z',
  },
  {
    id: 'usage-002',
    user_id: 'user-001',
    model_name: 'chatglm3-6b',
    request_type: 'chat',
    prompt_tokens: 50,
    completion_tokens: 150,
    total_tokens: 200,
    duration_seconds: 0.8,
    status: 'success',
    error_message: null,
    request_id: 'req-002',
    ip_address: '192.168.1.100',
    created_at: '2024-06-15T11:00:00.000Z',
  },
  {
    id: 'usage-003',
    user_id: 'user-001',
    model_name: 'qwen-72b-chat',
    request_type: 'chat',
    prompt_tokens: 80,
    completion_tokens: 0,
    total_tokens: 80,
    duration_seconds: 0.3,
    status: 'failed',
    error_message: 'Model overloaded',
    request_id: 'req-003',
    ip_address: '192.168.1.100',
    created_at: '2024-06-15T12:00:00.000Z',
  },
];

// ========================================
// API Key 数据
// ========================================

export const mockApiKeyRecord = {
  id: 'apikey-001',
  user_id: 'user-001',
  key_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  key_prefix: 'sk-llm-abc1',
  is_active: true,
  expires_at: null,
  username: 'testuser',
  user_active: true,
  is_admin: false,
};

export const mockRevokedApiKeyRecord = {
  ...mockApiKeyRecord,
  id: 'apikey-002',
  is_active: false,
};

export const mockExpiredApiKeyRecord = {
  ...mockApiKeyRecord,
  id: 'apikey-003',
  expires_at: '2023-01-01T00:00:00.000Z',
};

// ========================================
// JWT 辅助
// ========================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * 生成有效的 JWT access token
 */
export function generateValidToken(user = mockUser): string {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * 生成有效的 refresh token
 */
export function generateValidRefreshToken(userId: string): string {
  return jwt.sign(
    { userId, tokenType: 'refresh' },
    process.env.REFRESH_SECRET || JWT_SECRET,
    { expiresIn: '30d' }
  );
}

/**
 * 生成已过期的 token
 */
export function generateExpiredToken(user = mockUser): string {
  return jwt.sign(
    { userId: user.id, username: user.username, isAdmin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '-1s' }
  );
}

// ========================================
// 配额数据
// ========================================

export const mockUserQuotas = [
  {
    quota_type: 'default',
    daily_limit: 100000,
    hourly_limit: 1000,
    monthly_limit: 3000000,
  },
  {
    quota_type: 'premium',
    daily_limit: 500000,
    hourly_limit: 5000,
    monthly_limit: 15000000,
  },
];

export const mockDailyUsageSummary = {
  total_tokens: '50000',
  total_requests: '100',
};

export const mockMonthlyUsageSummary = {
  total_tokens: '1000000',
  total_requests: '2000',
};
