package com.company.aiassistant.toolwindow

import com.company.aiassistant.config.AIAssistantSettings
import com.company.aiassistant.service.AIService
import com.company.aiassistant.service.ChatMessage
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import java.awt.*
import java.awt.event.*
import javax.swing.*

/**
 * AI 工具窗口
 *
 * - 聊天面板（消息列表 + 输入框 + 发送/停止按钮）
 * - 支持流式输出
 * - 异步调用 AIService
 */
class AIToolWindow(private val project: Project) : Disposable {

    private val logger = Logger.getInstance(AIToolWindow::class.java)
    private val aiService: AIService = project.service()
    private val settings: AIAssistantSettings = AIAssistantSettings.getInstance()

    private val mainPanel = JPanel(BorderLayout())
    private val messagePanel = JPanel()
    private val messageScrollPane: JBScrollPane
    private val inputTextArea = JTextArea()
    private val sendButton = JButton("发送")
    private val stopButton = JButton("⏹ 停止")
    private val clearButton = JButton("清空")
    private val modelComboBox = JComboBox(
        arrayOf("Qwen-72B-Chat", "Qwen-14B-Chat", "DeepSeek-Coder-33B", "Llama-3-70B-Instruct")
    )
    private val tokenCountLabel = JBLabel("Tokens: 0")

    private val chatMessages = mutableListOf<ChatMessageItem>()
    private var isGenerating = false
    private var currentFuture: java.util.concurrent.Future<*>? = null

    init {
        updateServiceConfig()

        // ===== 顶部面板 =====
        val topPanel = JPanel(BorderLayout()).apply {
            border = JBUI.Borders.empty(8)
        }

        val modelPanel = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            add(JBLabel("模型:"))
            add(modelComboBox)
        }
        topPanel.add(modelPanel, BorderLayout.WEST)

        val statusPanel = JPanel(FlowLayout(FlowLayout.RIGHT)).apply {
            add(tokenCountLabel)
        }
        topPanel.add(statusPanel, BorderLayout.EAST)

        mainPanel.add(topPanel, BorderLayout.NORTH)

        // ===== 消息面板 =====
        messagePanel.layout = BoxLayout(messagePanel, BoxLayout.Y_AXIS)
        messagePanel.background = UIUtil.getPanelBackground()
        messageScrollPane = JBScrollPane(messagePanel).apply {
            border = JBUI.Borders.empty()
            verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
        }
        mainPanel.add(messageScrollPane, BorderLayout.CENTER)

        // ===== 输入面板 =====
        val inputPanel = JPanel(BorderLayout(8, 8)).apply {
            border = JBUI.Borders.empty(8)
        }

        inputTextArea.apply {
            rows = 4
            wrapStyleWord = true
            lineWrap = true
            font = JBUI.Fonts.label()
            border = JBUI.Borders.customLine(UIUtil.getBoundsColor(), 1)
        }

        val inputScrollPane = JBScrollPane(inputTextArea)
        inputPanel.add(inputScrollPane, BorderLayout.CENTER)

        // 按钮面板
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT, 8, 0)).apply {
            add(clearButton)
            add(stopButton.apply { isVisible = false })
            add(sendButton)
        }
        inputPanel.add(buttonPanel, BorderLayout.SOUTH)

        mainPanel.add(inputPanel, BorderLayout.SOUTH)

        // ===== 事件绑定 =====
        modelComboBox.selectedItem = settings.defaultModel
        modelComboBox.addActionListener {
            val selected = modelComboBox.selectedItem as? String ?: "Qwen-72B-Chat"
            aiService.setModel(selected)
            settings.state.defaultModel = selected
        }

        sendButton.addActionListener { sendMessage() }

        stopButton.addActionListener {
            currentFuture?.cancel(true)
            currentFuture = null
            isGenerating = false
            updateButtonStates()
        }

        clearButton.addActionListener { clearChat() }

        inputTextArea.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER && e.isShiftDown) {
                    e.consume()
                    sendMessage()
                }
            }
        })

        inputTextArea.document.addDocumentListener(object : javax.swing.event.DocumentListener {
            override fun insertUpdate(e: javax.swing.event.DocumentEvent) = updateButtonStates()
            override fun removeUpdate(e: javax.swing.event.DocumentEvent) = updateButtonStates()
            override fun changedUpdate(e: javax.swing.event.DocumentEvent) = updateButtonStates()
        })

        // 显示欢迎消息
        addSystemMessage("欢迎使用企业大模型助手！输入消息开始对话。")
    }

    // ==================== 聊天逻辑 ====================

    private fun sendMessage() {
        val content = inputTextArea.text.trim()
        if (content.isEmpty() || isGenerating) return

        // 更新服务配置
        updateServiceConfig()

        // 添加用户消息
        addMessage("user", content)
        inputTextArea.text = ""

        isGenerating = true
        updateButtonStates()

        // 构建消息列表
        val aiMessages = mutableListOf(
            ChatMessage("system", settings.systemPrompt)
        )
        aiMessages.addAll(chatMessages.filter { it.role != "system" }.map {
            ChatMessage(it.role, it.content)
        })

        // 创建助手消息占位
        val assistantItem = addMessage("assistant", "")

        if (settings.enableStream) {
            // 流式请求
            currentFuture = aiService.chatCompletionStream(aiMessages, { chunk ->
                // 在 EDT 中更新 UI
                assistantItem.appendContent(chunk)
                scrollToBottom()
            }).thenApply { response ->
                ApplicationManager.getApplication().invokeLater {
                    assistantItem.setContent(response.choices.firstOrNull()?.message?.content ?: "")
                    response.usage?.let {
                        tokenCountLabel.text = "Tokens: ${it.totalTokens}"
                    }
                    scrollToBottom()
                }
            }.exceptionally { error ->
                ApplicationManager.getApplication().invokeLater {
                    assistantItem.setContent("请求失败: ${error.message}")
                    Messages.showErrorDialog(project, "请求失败: ${error.message}", "AI 助手")
                }
                null
            }
        } else {
            // 非流式请求
            currentFuture = aiService.chatCompletion(aiMessages).thenApply { response ->
                ApplicationManager.getApplication().invokeLater {
                    val resultContent = response.choices.firstOrNull()?.message?.content ?: ""
                    assistantItem.setContent(resultContent)
                    response.usage?.let {
                        tokenCountLabel.text = "Tokens: ${it.totalTokens}"
                    }
                    scrollToBottom()
                }
            }.exceptionally { error ->
                ApplicationManager.getApplication().invokeLater {
                    assistantItem.setContent("请求失败: ${error.message}")
                    Messages.showErrorDialog(project, "请求失败: ${error.message}", "AI 助手")
                }
                null
            }
        }

        // 最终状态更新
        currentFuture?.let { future ->
            CompletableFuture.runAsync {
                try {
                    future.get()
                } catch (_: Exception) {
                } finally {
                    ApplicationManager.getApplication().invokeLater {
                        isGenerating = false
                        currentFuture = null
                        updateButtonStates()
                    }
                }
            }
        }
    }

    private fun clearChat() {
        if (chatMessages.isEmpty()) return
        val result = Messages.showYesNoDialog("确定要清空所有对话吗？", "清空对话", Messages.getQuestionIcon())
        if (result == Messages.YES) {
            chatMessages.clear()
            messagePanel.removeAll()
            messagePanel.revalidate()
            messagePanel.repaint()
            aiService.resetTokenCount()
            tokenCountLabel.text = "Tokens: 0"
        }
    }

    // ==================== 消息渲染 ====================

    private fun addMessage(role: String, content: String): ChatMessageItem {
        val item = ChatMessageItem(role, content)
        chatMessages.add(item)
        messagePanel.add(item.panel)
        messagePanel.revalidate()
        messagePanel.repaint()
        scrollToBottom()
        return item
    }

    private fun addSystemMessage(text: String) {
        val item = ChatMessageItem("system", text)
        chatMessages.add(item)
        messagePanel.add(item.panel)
        messagePanel.revalidate()
        messagePanel.repaint()
    }

    private fun scrollToBottom() {
        SwingUtilities.invokeLater {
            val bar = messageScrollPane.verticalScrollBar
            bar.value = bar.maximum
        }
    }

    private fun updateButtonStates() {
        val hasContent = inputTextArea.text.trim().isNotEmpty()
        sendButton.isEnabled = hasContent && !isGenerating
        sendButton.isVisible = !isGenerating
        stopButton.isVisible = isGenerating
    }

    private fun updateServiceConfig() {
        aiService.configure(settings.toAIConfig())
        aiService.setModel(settings.defaultModel)
    }

    fun getContent(): JComponent = mainPanel

    override fun dispose() {
        currentFuture?.cancel(true)
    }

    // ==================== 内部消息项 ====================

    private inner class ChatMessageItem(val role: String, initialContent: String) {
        var content: String = initialContent

        val panel: JPanel = JPanel().apply {
            layout = BorderLayout(8, 4)
            border = JBUI.Borders.empty(6, 8)
            background = UIUtil.getPanelBackground()
            alignmentX = Component.LEFT_ALIGNMENT
            maximumSize = Dimension(Int.MAX_VALUE, Int.MAX_VALUE)
        }

        private val avatarLabel = JLabel(
            when (role) {
                "user" -> "👤"
                "assistant" -> "🤖"
                else -> "ℹ️"
            }
        ).apply {
            font = Font("Arial", Font.PLAIN, 18)
            preferredSize = Dimension(24, 24)
        }

        private val contentPane = JPanel(BorderLayout()).apply {
            background = when (role) {
                "user" -> Color(14, 99, 156)
                "assistant" -> UIUtil.getPanelBackground()
                else -> Color(240, 240, 240)
            }

            if (role != "user") {
                border = JBUI.Borders.customLine(JBUI.CurrentTheme.List.SeparatorColor(), 1)
            }
        }

        private val textArea = JTextArea(initialContent).apply {
            isEditable = false
            wrapStyleWord = true
            lineWrap = true
            font = JBUI.Fonts.label()
            background = Color(0, 0, 0, 0)
            border = JBUI.Borders.empty(4)
            isOpaque = false

            if (role == "user") {
                foreground = Color.WHITE
            }
        }

        init {
            val wrapper = JPanel(BorderLayout()).apply {
                background = UIUtil.getPanelBackground()
                alignmentX = Component.LEFT_ALIGNMENT
                preferredSize = Dimension(24, 24)
            }
            wrapper.add(avatarLabel, BorderLayout.NORTH)
            panel.add(wrapper, BorderLayout.WEST)
            contentPane.add(JBScrollPane(textArea), BorderLayout.CENTER)
            panel.add(contentPane, BorderLayout.CENTER)
        }

        fun setContent(newContent: String) {
            content = newContent
            textArea.text = newContent
            textPane.revalidate()
            textPane.repaint()
        }

        fun appendContent(chunk: String) {
            content += chunk
            textArea.append(chunk)
            textPane.revalidate()
            textPane.repaint()
        }
    }
}

/**
 * 工具窗口工厂
 */
class AIToolWindowFactory : ToolWindowFactory {

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val aiToolWindow = AIToolWindow(project)
        val contentFactory = com.intellij.openapi.wm.ToolWindowContentFactory.getInstance()
        val content = contentFactory.createContent(aiToolWindow.getContent(), "", false)
        toolWindow.contentManager.addContent(content)
    }

    override fun shouldBeAvailable(project: Project): Boolean = true
}
