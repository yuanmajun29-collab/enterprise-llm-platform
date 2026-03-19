package com.company.aiassistant.service

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.util.io.HttpRequests
import org.java_websocket.client.WebSocketClient
import org.java_websocket.handshake.ServerHandshake
import java.net.URI
import java.util.*
import java.util.concurrent.CompletableFuture
import java.util.concurrent.atomic.AtomicBoolean

/**
 * AI 消息数据类
 */
data class AIMessage(
    val role: String,
    val content: String
)

/**
 * AI 请求配置
 */
data class AIRequest(
    val model: String,
    val messages: List<AIMessage>,
    val temperature: Double = 0.7,
    val maxTokens: Int = 2048,
    val stream: Boolean = false
)

/**
 * AI 响应
 */
data class AIResponse(
    val id: String,
    val choices: List<AIChoice>,
    val usage: AIUsage?
)

data class AIChoice(
    val index: Int,
    val message: AIMessage?,
    val delta: Map<String, Any>?,
    val finishReason: String?
)

data class AIUsage(
    val promptTokens: Int,
    val completionTokens: Int,
    val totalTokens: Int
)

/**
 * API 错误响应
 */
data class APIError(
    val error: ErrorDetail
)

data class ErrorDetail(
    val message: String,
    val type: String?,
    val code: String?
)

/**
 * 模型信息
 */
data class ModelInfo(
    val id: String,
    val name: String,
    val displayName: String,
    val description: String,
    val parameters: Long,
    val contextLength: Int
)

/**
 * AI 服务单例
 */
@Service(Service.Level.APP)
class AIService {
    private val logger = Logger.getInstance(AIService::class.java)
    private val objectMapper = jacksonObjectMapper()
    private val isConnecting = AtomicBoolean(false)

    private var apiBaseUrl: String = ""
    private var apiKey: String = ""
    private var accessToken: String = ""
    private var currentModel: String = "Qwen-72B-Chat"

    companion object {
        @JvmStatic
        fun getInstance(): AIService {
            return ApplicationManager.getApplication().getService(AIService::class.java)
        }
    }

    /**
     * 配置 API
     */
    fun configure(apiUrl: String, apiKey: String, accessToken: String = "") {
        this.apiBaseUrl = apiUrl.removeSuffix("/")
        this.apiKey = apiKey
        this.accessToken = accessToken
        logger.info("AIService configured with API: $apiBaseUrl")
    }

    /**
     * 设置模型
     */
    fun setModel(model: String) {
        this.currentModel = model
    }

    /**
     * 获取模型列表
     */
    fun getModels(): CompletableFuture<List<ModelInfo>> {
        val future = CompletableFuture<List<ModelInfo>>()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val url = "$apiBaseUrl/api/models"
                val response = HttpRequests.request(url)
                    .tuner { connection ->
                        connection.setRequestProperty("Authorization", getAuthHeader())
                    }
                    .readString(null)

                val models = objectMapper.readValue<MutableList<ModelInfo>>(response)
                future.complete(models)
            } catch (e: Exception) {
                logger.error("Failed to get models", e)
                future.completeExceptionally(e)
            }
        }

        return future
    }

    /**
     * 发送聊天请求
     */
    fun chat(messages: List<AIMessage>, stream: Boolean = false): CompletableFuture<AIResponse> {
        val future = CompletableFuture<AIResponse>()

        if (stream) {
            return chatStream(messages)
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val request = AIRequest(
                    model = currentModel,
                    messages = messages,
                    stream = false
                )

                val url = "$apiBaseUrl/v1/chat/completions"
                val responseText = HttpRequests.request(url)
                    .tuner { connection ->
                        connection.doOutput(true)
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.setRequestProperty("Authorization", getAuthHeader())
                        val requestBody = objectMapper.writeValueAsString(request)
                        connection.outputStream.use { it.write(requestBody.toByteArray()) }
                    }
                    .readString(null)

                val response = objectMapper.readValue<AIResponse>(responseText)
                future.complete(response)
            } catch (e: Exception) {
                logger.error("Chat request failed", e)
                future.completeExceptionally(e)
            }
        }

        return future
    }

    /**
     * 流式聊天
     */
    private fun chatStream(messages: List<AIMessage>): CompletableFuture<AIResponse> {
        val future = CompletableFuture<AIResponse>()
        val builder = StringBuilder()
        val tokens = mutableListOf<Int>()

        val wsUrl = apiBaseUrl.replace("http", "ws") + "/v1/chat/completions"

        val client = object : WebSocketClient(URI.create(wsUrl)) {
            override fun onOpen(handshakedata: ServerHandshake) {
                logger.debug("WebSocket connection opened")
                val request = AIRequest(
                    model = currentModel,
                    messages = messages,
                    stream = true
                )
                send(objectMapper.writeValueAsString(request))
            }

            override fun onMessage(message: String) {
                if (message.startsWith("data: ")) {
                    val data = message.substring(6)
                    if (data == "[DONE]") {
                        close()
                        return
                    }

                    try {
                        val chunk = objectMapper.readValue<AIResponse>(data)
                        chunk.choices.firstOrNull()?.let { choice ->
                            val delta = choice.delta
                            val content = delta?.get("content") as? String
                            if (content != null) {
                                builder.append(content)
                                tokens.add(content.length)
                                // 通知进度
                                ApplicationManager.getApplication().invokeLater {
                                    // 这里可以发送进度更新事件
                                }
                            }
                            if (choice.finishReason != null) {
                                close()
                            }
                        }
                    } catch (e: Exception) {
                        logger.warn("Failed to parse stream chunk", e)
                    }
                }
            }

            override fun onClose(code: Int, reason: String, remote: Boolean) {
                logger.debug("WebSocket connection closed")
                val response = AIResponse(
                    id = UUID.randomUUID().toString(),
                    choices = listOf(
                        AIChoice(
                            index = 0,
                            message = AIMessage("assistant", builder.toString()),
                            delta = null,
                            finishReason = "stop"
                        )
                    ),
                    usage = AIUsage(
                        promptTokens = 0,
                        completionTokens = tokens.size,
                        totalTokens = tokens.size
                    )
                )
                future.complete(response)
            }

            override fun onError(ex: Exception) {
                logger.error("WebSocket error", ex)
                future.completeExceptionally(ex)
            }
        }

        val headers = mapOf("Authorization" to getAuthHeader())
        client.addHeaders(headers)
        client.connect()

        return future
    }

    /**
     * 代码补全
     */
    fun codeComplete(code: String, language: String, cursorPosition: Int): CompletableFuture<String> {
        val future = CompletableFuture<String>()

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val request = mapOf(
                    "code" to code,
                    "language" to language,
                    "cursorPosition" to cursorPosition,
                    "model" to "DeepSeek-Coder-33B"
                )

                val url = "$apiBaseUrl/api/code/complete"
                val responseText = HttpRequests.request(url)
                    .tuner { connection ->
                        connection.doOutput(true)
                        connection.setRequestProperty("Content-Type", "application/json")
                        connection.setRequestProperty("Authorization", getAuthHeader())
                        val requestBody = objectMapper.writeValueAsString(request)
                        connection.outputStream.use { it.write(requestBody.toByteArray()) }
                    }
                    .readString(null)

                val response = objectMapper.readTree(responseText)
                val completion = response.path("completion").asText()
                future.complete(completion)
            } catch (e: Exception) {
                logger.error("Code completion failed", e)
                future.completeExceptionally(e)
            }
        }

        return future
    }

    /**
     * 解释代码
     */
    fun explainCode(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            AIMessage("system", "你是一个代码解释专家。请用简洁清晰的语言解释给定的代码片段。"),
            AIMessage("user", "请解释以下 $language 代码的功能和原理：\n\n```$language\n$code\n```")
        )
        return chat(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    /**
     * 重构代码
     */
    fun refactorCode(code: String, language: String, instructions: String? = null): CompletableFuture<String> {
        val userMessage = if (instructions != null) {
            "请根据以下指令重构 $language 代码：$instructions\n\n```$language\n$code\n```"
        } else {
            "请重构以下 $language 代码，使其更加简洁高效：\n\n```$language\n$code\n```"
        }

        val messages = listOf(
            AIMessage("system", "你是一个代码重构专家。请根据指令重构代码，使其更加简洁、高效、可维护。只输出重构后的代码，不要包含解释。"),
            AIMessage("user", userMessage)
        )
        return chat(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    /**
     * 生成测试
     */
    fun generateTests(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            AIMessage("system", "你是一个测试代码生成专家。请为给定的代码生成完整的单元测试，包括正常场景和边界情况的测试用例。"),
            AIMessage("user", "请为以下 $language 代码生成完整的单元测试：\n\n```$language\n$code\n```")
        )
        return chat(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    /**
     * 查找 Bug
     */
    fun findBugs(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            AIMessage("system", "你是一个代码审查专家。请仔细检查代码中的潜在问题、bug、安全漏洞和性能问题。"),
            AIMessage("user", "请审查以下 $language 代码，指出其中可能存在的问题：\n\n```$language\n$code\n```")
        )
        return chat(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    /**
     * 优化代码
     */
    fun optimizeCode(code: String, language: String): CompletableFuture<String> {
        val messages = listOf(
            AIMessage("system", "你是一个代码优化专家。请从性能、可读性和可维护性等方面优化代码。"),
            AIMessage("user", "请优化以下 $language 代码：\n\n```$language\n$code\n```")
        )
        return chat(messages).thenApply { it.choices.firstOrNull()?.message?.content ?: "" }
    }

    /**
     * 获取认证头
     */
    private fun getAuthHeader(): String {
        return when {
            accessToken.isNotEmpty() -> "Bearer $accessToken"
            apiKey.isNotEmpty() -> "Bearer $apiKey"
            else -> throw IllegalStateException("No authentication credentials configured")
        }
    }

    /**
     * 检查是否已配置
     */
    fun isConfigured(): Boolean {
        return apiBaseUrl.isNotEmpty() && (apiKey.isNotEmpty() || accessToken.isNotEmpty())
    }

    /**
     * 取消正在进行的请求
     */
    fun cancelRequest() {
        // 实现取消逻辑
    }
}
