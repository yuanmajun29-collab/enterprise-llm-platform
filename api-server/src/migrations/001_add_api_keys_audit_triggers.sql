-- 迁移 001: 为 api_keys 表添加审计触发器
-- 创建时间: 2026-03-19

-- ========================================
-- api_keys 审计触发器
-- ========================================

-- 创建 API Key 时自动记录审计日志
CREATE OR REPLACE FUNCTION audit_api_key_create()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, status)
    VALUES (
        NEW.user_id,
        'apikey.create',
        'api_key',
        NEW.id::text,
        jsonb_build_object(
            'key_prefix', NEW.key_prefix,
            'name', NEW.name,
            'expires_at', NEW.expires_at
        ),
        'success'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_api_key_create ON api_keys;
CREATE TRIGGER trigger_audit_api_key_create
AFTER INSERT ON api_keys
FOR EACH ROW
EXECUTE FUNCTION audit_api_key_create();

-- 撤销 API Key 时自动记录审计日志
CREATE OR REPLACE FUNCTION audit_api_key_revoke()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = false AND (OLD.is_active = true OR OLD.deleted_at IS NULL) THEN
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, status)
        VALUES (
            NEW.user_id,
            'apikey.revoke',
            'api_key',
            NEW.id::text,
            jsonb_build_object(
                'key_prefix', NEW.key_prefix,
                'name', NEW.name
            ),
            'success'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_api_key_revoke ON api_keys;
CREATE TRIGGER trigger_audit_api_key_revoke
AFTER UPDATE ON api_keys
FOR EACH ROW
EXECUTE FUNCTION audit_api_key_revoke();

-- API Key 认证成功时记录审计日志（通过 UPDATE last_used_at 触发）
CREATE OR REPLACE FUNCTION audit_api_key_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.last_used_at IS DISTINCT FROM OLD.last_used_at AND NEW.last_used_at IS NOT NULL THEN
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, status)
        VALUES (
            NEW.user_id,
            'apikey.authenticate',
            'api_key',
            NEW.id::text,
            'success'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_api_key_usage ON api_keys;
CREATE TRIGGER trigger_audit_api_key_usage
AFTER UPDATE ON api_keys
FOR EACH ROW
EXECUTE FUNCTION audit_api_key_usage();
