-- 迁移 002: 确认 api_keys 表限流字段
-- 创建时间: 2026-03-19
-- 说明: init.sql 中已包含 rate_limit_per_hour 和 rate_limit_per_day 字段
-- 此迁移文件用于确认字段存在并设置合理的默认值

-- 确认限流字段存在（如果不存在则添加）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'rate_limit_per_hour'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN rate_limit_per_hour INTEGER DEFAULT 60;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'rate_limit_per_day'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN rate_limit_per_day INTEGER DEFAULT 1000;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'api_keys' AND column_name = 'ip_whitelist'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN ip_whitelist TEXT[];
    END IF;
END $$;

-- 为已有记录更新默认值
UPDATE api_keys
SET rate_limit_per_hour = COALESCE(rate_limit_per_hour, 60),
    rate_limit_per_day = COALESCE(rate_limit_per_day, 1000)
WHERE rate_limit_per_hour IS NULL OR rate_limit_per_day IS NULL;
