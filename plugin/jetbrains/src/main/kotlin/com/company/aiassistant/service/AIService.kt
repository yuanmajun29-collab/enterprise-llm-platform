package com.company.aiassistant.service

import com.company.aiassistant.config.AIAssistantSettings
import com.company.aiassistant.config.AIConfig
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicInteger

// ==================== 数据类 ====================

data class ChatMessage(
    val role: String,
    val content: String
)

data class ChatRequest(
    val model: String,
    val messages: List<ChatMessage>,
    val temperature: Double = 0.7,
    val max_tokens: Int = 2000,
    val stream: Boolean = false
)

data class ChatResponse(
    val id: String = "",
    val choices: List<Choice> = emptyList(),
    val usage: Usage? = null
)

data class Choice(
    val index: Int = 0,
    val message: ChatMessage? = null,
    val delta: Map<String, Any>? = null,
    val finishReason: String? = null
) {
    // 兼容 JSON 的 finish_reason 字段
    @Suppress("unused")
    val finish_reason: String? get() = finishReason
}

data class Usage(
    val promptTokens: Int,
    val completionTokens: Int,
    val totalTokens: Int
) {
    // 兼容 JSON 的 snake_case 字段
    @Suppress("unused")
    val prompt_tokens: Int get() = promptTokens
    @Suppress("unused")
    val completion_tokens: Int get() = completionTokens
    @Suppress("unused")
    val total_tokens: Int get() = totalTokens
}

data class CodeRequest(
    val code: String,
    val language: String,
    val cursor_position: Int,
    val model: String
)

data class CodeResponse(
    val completion: String,
    val model: String? = null,
    val usage: Usage? = null
)

data class ModelInfo(
    val id: String,
    val name: String,
    val display_name: String = "",
    val description: String = "",
    val parameters: Long = 0,
    val context_length: Int = 0
)

// ==================== AI 服务 ====================

/**
 * AI 服务 - 完整 HTTP 客户端
 *
 * 使用 HttpURLConnection（无外部依赖）：
 * - chatCompletion: 聊天补全
 * - codeCompletion: 代码补全
 * - 错误处理：401 提示登录，429 限流提示，5xx 重试（最多 2 次）
 * - Token 计数
 */
@Service(Service.Level.APP)
class AIService {

    private val logger = Logger.getInstance(AIService::class.java)
    private val objectMapper = jacksonObjectMapper()
    private val tokenCounter = AtomicInteger(0)

    private var baseUrl: String = ""
    private var authToken: String = ""
    private var currentModel: String = "Qwen-72B-Chat"

    companion object {
        private const val MAX_RETRIES = 2
        private const val RETRY_BASE_DELAY_MS = 1000L
        private const val REQUEST_TIMEOUT_MS = 60000
        private const val CONNECT_TIMEOUT_MS = 10000

        @JvmStatic
        fun getInstance(): AIService {
            return ApplicationManager.getApplication().getService(AIService::class.java)
        }
    }

    // ==================== 配置 ====================

    fun configure(config: AIConfig) {
        this.baseUrl = config.apiUrl.removeSuffix("/")
        this.authToken = config.authToken
        this.currentModel = config.defaultModel
        logger.info("AIService configured: $baseUrl, model=$currentModel")
    }

    fun configure(apiUrl: String, apiKey: String = "", accessToken: String = "") {
        this.baseUrl = apiUrl.removeSuffix("/")
        this.authToken = accessToken.ifEmpty { apiKey }
    }

    fun setModel(model: String) {
        this.currentModel = model
    }

    fun getModel(): String = currentModel

    fun isConfigured(): Boolean {
        return baseUrl.isNotEmpty() && authToken.isNotEmpty()
    }

    // ==================== 核心 API ====================

    /**
     * 聊天补全
     * POST /v1/chat/completions
     */
    fun chatCompletion(messages: List<ChatMessage>, model: String? = null): CompletableFuture<ChatResponse> {
        val future = CompletableFuture<ChatResponse>()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val settings = AIAssistantSettings.getInstance()
                val request = ChatRequest(
                    model = model ?: currentModel,
                    messages = messages,
                    temperature = settings.temperature,
                    max_tokens = settings.maxTokens,
                    stream = false
                )

                val responseText = executeRequestWithRetry(
                    endpoint = "/v1/chat/completions",
                    body = objectMapper.writeValueAsString(request)
                )

                val response: ChatResponse = objectMapper.readValue(responseText)

                // Token 计数
                response.usage?.let {
                    tokenCounter.addAndGet(it.totalTokens)
                }

                future.complete(response)
            } catch (e: Exception) {
                logger.error("chatCompletion failed", e)
                future.completeExceptionally(e)
            }
        }

        return future
    }

    /**
     * 流式聊天补全
     * POST /v1/chat/completions (stream: true)
     * 使用 SSE (Server-Sent Events)
     */
    fun chatCompletionStream(
        messages: List<ChatMessage>,
        model: String? = null,
        onChunk: (String) -> Unit
    ): CompletableFuture<ChatResponse> {
        val future = CompletableFuture<ChatResponse>()
        val fullContent = StringBuilder()
        var promptTokens = 0
        var completionTokens = 0

        ApplicationManager.getApplication().executeOnPooledThread {
            var connection: HttpURLConnection? = null
            try {
                val settings = AIAssistantSettings.getInstance()
                val request = ChatRequest(
                    model = model ?: currentModel,
                    messages = messages,
                    temperature = settings.temperature,
                    max_tokens = settings.maxTokens,
                    stream = true
                )

                val url = URL("$baseUrl/v1/chat/completions")
                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = REQUEST_TIMEOUT_MS
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "text/event-stream")
                    setAuthHeader(this)
                }

                // 发送请求
                connection.outputStream.use { os ->
                    os.write(objectMapper.writeValueAsBytes(request))
                    os.flush()
                }

                // 读取 SSE 流
                val reader = BufferedReader(InputStreamReader(connection.inputStream))
                var line: String?
                while (reader.readLine().also { line = it } != null) {
                    val currentLine = line ?: continue

                    if (currentLine.startsWith("data: ")) {
                        val data = currentLine.removePrefix("data: ").trim()
                        if (data == "[DONE]") break

                        try {
                            val chunk: ChatResponse = objectMapper.readValue(data)
                            chunk.choices.firstOrNull()?.let { choice ->
                                val delta = choice.delta
                                val content = delta?.get("content") as? String
                                if (!content.isNullOrEmpty()) {
                                    fullContent.append(content)
                                    completionTokens++
                                    // 回调通知（在 EDT 线程）
                                    ApplicationManager.getApplication().invokeLater {
                                        onChunk(content)
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            logger.warn("Failed to parse SSE chunk: $data")
                        }
                    }
                }

                val response = ChatResponse(
                    id = "stream-${System.currentTimeMillis()}",
                    choices = listOf(
                        Choice(
                            index = 0,
                            message = ChatMessage("assistant", fullContent.toString()),
                            finishReason = "stop"
                        )
                    ),
                    usage = Usage(
                        promptTokens = promptTokens,
                        completionTokens = completionTokens,
                        totalTokens = promptTokens + completionTokens
                    )
                )

                tokenCounter.addAndGet(promptTokens + completionTokens)
                future.complete(response)

            } catch (e: Exception) {
                logger.error("chatCompletionStream failed", e)
                future.completeExceptionally(e)
            } finally {
                connection?.disconnect()
            }
        }

        return future
    }

    /**
     * 代码补全
     * POST /api/code/complete
     */
    fun codeCompletion(
        code: String,
        language: String,
        cursorPos: Int,
        model: String? = null
    ): CompletableFuture<CodeResponse> {
        val future = CompletableFuture<CodeResponse>()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val request = CodeRequest(
                    code = code,
                    language = language,
                    cursor_position = cursorPos,
                    model = model ?: "DeepSeek-Coder-33B"
                )

                val responseText = executeRequestWithRetry(
                    endpoint = "/api/code/complete",
                    body = objectMapper.writeValueAsString(request)
                )

                val response: CodeResponse = objectMapper.readValue(responseText)
                future.complete(response)
            } catch (e: Exception) {
                logger.error("codeCompletion failed", e)
                future.completeExceptionally(e)
            }
        }

        return future
    }

    // ==================== Token 计数 ====================

    /**
     * 获取当前会话累计 Token 数
     */
    fun getTokenCount(): Int = tokenCounter.get()

    /**
     * 重置 Token 计数
     */
    fun resetTokenCount() {
        tokenCounter.set(0)
    }

    // ==================== 便捷方法 ====================

    fun explainCode(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            ChatMessage("system", "你是一个代码解释专家。请用简洁清晰的语言解释给定的代码片段。"),
            ChatMessage("user", "请解释以下 $language 代码的功能和原理：\n\n```$language\n$code\n```")
        )
        return chatCompletion(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    fun refactorCode(code: String, language: String, instructions: String? = null): CompletableFuture<String> {
        val userMsg = if (instructions != null) {
            "请根据以下指令重构 $language 代码：$instructions\n\n```$language\n$code\n```"
        } else {
            "请重构以下 $language 代码，使其更加简洁高效：\n\n```$language\n$code\n```"
        }
        val messages = listOf(
            ChatMessage("system", "你是一个代码重构专家。请根据指令重构代码，使其更加简洁、高效、可维护。"),
            ChatMessage("user", userMsg)
        )
        return chatCompletion(messages, "DeepSeek-Coder-33B")
            .thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    fun generateTests(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            ChatMessage("system", "你是一个测试代码生成专家。请为给定的代码生成完整的单元测试。"),
            ChatMessage("user", "请为以下 $language 代码生成完整的单元测试：\n\n```$language\n$code\n```")
        )
        return chatCompletion(messages, "DeepSeek-Coder-33B")
            .thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    fun findBugs(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            ChatMessage("system", "你是一个代码审查专家。请仔细检查代码中的潜在问题、bug、安全漏洞和性能问题。"),
            ChatMessage("user", "请审查以下 $language 代码，指出其中可能存在的问题：\n\n```$language\n$code\n```")
        )
        return chatCompletion(messages)
            .thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    fun optimizeCode(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            ChatMessage("system", "你是一个代码优化专家。请从性能、可读性和可维护性等方面优化代码。"),
            ChatMessage("user", "请优化以下 $language 代码：\n\n```$language\n$code\n```")
        )
        return chatCompletion(messages, "DeepSeek-Coder-33B")
            .thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    // ==================== 内部方法 ====================

    /**
     * 设置认证 Header
     */
    private fun setAuthHeader(connection: HttpURLConnection) {
        if (authToken.isNotEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer $authToken")
        }
    }

    /**
     * 带重试的 HTTP 请求
     * 5xx 错误自动重试（最多 MAX_RETRIES 次），4xx 不重试
     */
    private fun executeRequestWithRetry(
        endpoint: String,
        body: String,
        retries: Int = MAX_RETRIES
    ): String {
        var lastError: Exception? = null

        for (attempt in 0..retries) {
            var connection: HttpURLConnection? = null
            try {
                val url = URL("$baseUrl$endpoint")
                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    doOutput = true
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = REQUEST_TIMEOUT_MS
                    setRequestProperty("Content-Type", "application/json")
                    setAuthHeader(this)
                }

                // 发送请求体
                connection.outputStream.use { os ->
                    os.write(body.toByteArray(Charsets.UTF_8))
                    os.flush()
                }

                val responseCode = connection.responseCode

                when {
                    responseCode == 200 || responseCode == 201 -> {
                        return connection.inputStream.bufferedReader(Charsets.UTF_8).readText()
                    }
                    responseCode == 401 -> {
                        notifyError("认证失败（401），请重新配置 Token")
                        throw IllegalStateException("认证已过期，请重新登录")
                    }
                    responseCode == 429 -> {
                        val retryAfter = connection.getHeaderField("Retry-After")?.toIntOrNull() ?: 5
                        notifyWarning("请求过于频繁（429），请等待 ${retryAfter} 秒后重试")
                        throw IllegalStateException("请求过于频繁，请等待 $retryAfter 秒后重试")
                    }
                    responseCode >= 500 && attempt < retries -> {
                        // 5xx 错误：指数退避重试
                        val delay = RETRY_BASE_DELAY_MS * (1L shl attempt) // 1s, 2s
                        logger.warn("Server error $responseCode, retrying in ${delay}ms (attempt ${attempt + 1}/$retries)")
                        Thread.sleep(delay)
                        continue
                    }
                    else -> {
                        val errorBody = connection.errorStream?.bufferedReader(Charsets.UTF_8)?.readText() ?: "Unknown error"
                        throw RuntimeException("HTTP $responseCode: $errorBody")
                    }
                }
            } catch (e: InterruptedException) {
                throw e
            } catch (e: IllegalStateException) {
                throw e
            } catch (e: Exception) {
                lastError = e
                logger.warn("Request failed (attempt ${attempt + 1}/$retries): ${e.message}")
                if (attempt == retries) break
            } finally {
                connection?.disconnect()
            }
        }

        throw lastError ?: RuntimeException("Unknown error")
    }

    /**
     * 显示错误通知
     */
    private fun notifyError(message: String) {
        ApplicationManager.getApplication().invokeLater {
            try {
                NotificationGroupManager.getInstance()
                    .getNotificationGroup("AI Assistant Notifications")
                    .createNotification("AI Assistant 错误", message, NotificationType.ERROR)
                    .notify(null)
            } catch (e: Exception) {
                logger.warn("Failed to show notification: ${e.message}")
            }
        }
    }

    /**
     * 显示警告通知
     */
    private fun notifyWarning(message: String) {
        ApplicationManager.getApplication().invokeLater {
            try {
                NotificationGroupManager.getInstance()
                    .getNotificationGroup("AI Assistant Notifications")
                    .createNotification("AI Assistant 警告", message, NotificationType.WARNING)
                    .notify(null)
            } catch (e: Exception) {
                logger.warn("Failed to show notification: ${e.message}")
            }
        }
    }

    /**
     * 取消正在进行的请求（标记用）
     */
    fun cancelRequest() {
        // HttpURLConnection 不支持真正的取消，需在调用方使用 Future.cancel()
    }
}
