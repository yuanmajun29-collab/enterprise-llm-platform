package com.company.aiassistant.toolwindow

import com.company.aiassistant.config.AIAssistantConfig
import com.company.aiassistant.service.AIService
import com.company.aiassistant.service.AIMessage
import com.intellij.ide.ui.laf.darcula.DarculaLaf
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.EditorFactory
import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.*
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import org.jetbrains.kotlin.idea.KotlinLanguage
import java.awt.*
import java.awt.event.*
import javax.swing.*

/**
 * AI 工具窗口
 */
class AIToolWindow(private val project: Project) : Disposable {
    private val logger = Logger.getInstance(AIToolWindow::class.java)
    private val aiService: AIService = project.service()
    private val config: AIAssistantConfig = AIAssistantConfig.getInstance()

    private val mainPanel: JPanel = JPanel(BorderLayout())
    private val messagePanel: JPanel = JPanel()
    private val inputPanel: JPanel = JPanel()
    private val messageScrollPane: JScrollPane
    private val inputTextArea: JTextArea
    private val sendButton: JButton
    private val clearButton: JButton
    private val modelComboBox: JComboBox<String>

    private val messages = mutableListOf<ChatMessageItem>()
    private var isGenerating = false

    init {
        // 初始化 AI 服务配置
        updateServiceConfig()

        // 主面板设置
        mainPanel.preferredSize = Dimension(400, 600)
        mainPanel.border = JBUI.Borders.empty(5)

        // 模型选择器
        val topPanel = JPanel(BorderLayout())
        topPanel.border = JBUI.Borders.empty(0, 0, 10, 0)

        val modelLabel = JLabel("模型:")
        modelComboBox = JComboBox(arrayOf("Qwen-72B-Chat", "Qwen-14B-Chat", "DeepSeek-Coder-33B", "Llama-3-70B-Instruct"))
        modelComboBox.selectedItem = config.model
        modelComboBox.addActionListener { e ->
            val selectedModel = modelComboBox.selectedItem as? String ?: "Qwen-72B-Chat"
            config.model = selectedModel
            aiService.setModel(selectedModel)
        }

        val modelPanel = JPanel(FlowLayout(FlowLayout.LEFT))
        modelPanel.add(modelLabel)
        modelPanel.add(modelComboBox)
        topPanel.add(modelPanel, BorderLayout.WEST)

        mainPanel.add(topPanel, BorderLayout.NORTH)

        // 消息面板
        messagePanel.layout = BoxLayout(messagePanel, BoxLayout.Y_AXIS)
        messagePanel.background = UIUtil.getPanelBackground()
        messageScrollPane = JBScrollPane(messagePanel)
        messageScrollPane.border = JBUI.Borders.empty()
        messageScrollPane.verticalScrollBarPolicy = JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
        mainPanel.add(messageScrollPane, BorderLayout.CENTER)

        // 输入面板
        inputPanel.layout = BorderLayout(5, 5)
        inputPanel.border = JBUI.Borders.empty(10, 0, 0, 0)

        inputTextArea = JBTextArea().apply {
            rows = 4
            wrapStyleWord = true
            lineWrap = true
            border = JBUI.Borders.empty(5)
            font = JBUI.Fonts.label()
        }
        inputTextArea.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                if (e.keyCode == KeyEvent.VK_ENTER && e.isShiftDown) {
                    sendMessage()
                    e.consume()
                }
            }
        })

        val scrollPane = JBScrollPane(inputTextArea)
        inputPanel.add(scrollPane, BorderLayout.CENTER)

        // 按钮面板
        val buttonPanel = JPanel(FlowLayout(FlowLayout.RIGHT))
        sendButton = JButton("发送").apply {
            isEnabled = false
            addActionListener { sendMessage() }
        }
        clearButton = JButton("清空").apply {
            addActionListener { clearChat() }
        }
        buttonPanel.add(clearButton)
        buttonPanel.add(sendButton)

        inputPanel.add(buttonPanel, BorderLayout.SOUTH)

        mainPanel.add(inputPanel, BorderLayout.SOUTH)

        // 监听输入变化
        inputTextArea.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent) = updateSendButton()
            override fun removeUpdate(e: DocumentEvent) = updateSendButton()
            override fun changedUpdate(e: DocumentEvent) = updateSendButton()
        })
    }

    /**
     * 更新服务配置
     */
    private fun updateServiceConfig() {
        aiService.configure(
            apiUrl = config.apiUrl,
            apiKey = config.apiKey,
            accessToken = config.accessToken
        )
    }

    /**
     * 更新发送按钮状态
     */
    private fun updateSendButton() {
        sendButton.isEnabled = !isGenerating && inputTextArea.text.trim().isNotEmpty()
    }

    /**
     * 发送消息
     */
    private fun sendMessage() {
        val content = inputTextArea.text.trim()
        if (content.isEmpty() || isGenerating) return

        // 添加用户消息
        addMessage("user", content)
        inputTextArea.text = ""

        // 准备 AI 请求
        val aiMessages = listOf(
            AIMessage("system", config.systemPrompt),
            *messages.map { AIMessage(it.role, it.content) }.toTypedArray()
        )

        isGenerating = true
        updateSendButton()
        sendButton.text = "生成中..."

        // 创建助手消息占位
        val assistantMessage = addMessage("assistant", "")

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val response = if (config.enableStream) {
                    chatStream(aiMessages, assistantMessage)
                } else {
                    chat(aiMessages, assistantMessage)
                }
                scrollToBottom()
            } catch (e: Exception) {
                logger.error("Failed to send message", e)
                ApplicationManager.getApplication().invokeLater {
                    assistantMessage.content = "请求失败: ${e.message}"
                    assistantMessage.panel.revalidate()
                    assistantMessage.panel.repaint()
                }
            } finally {
                isGenerating = false
                ApplicationManager.getApplication().invokeLater {
                    updateSendButton()
                    sendButton.text = "发送"
                }
            }
        }
    }

    /**
     * 聊天请求
     */
    private fun chat(aiMessages: List<AIMessage>, assistantMessage: ChatMessageItem) {
        val response = aiService.chat(aiMessages, false).get()
        ApplicationManager.getApplication().invokeLater {
            assistantMessage.content = response.choices.firstOrNull()?.message?.content ?: ""
            assistantMessage.panel.revalidate()
            assistantMessage.panel.repaint()
        }
    }

    /**
     * 流式聊天
     */
    private fun chatStream(aiMessages: List<AIMessage>, assistantMessage: ChatMessageItem) {
        val response = aiService.chat(aiMessages, true).get()
        ApplicationManager.getApplication().invokeLater {
            assistantMessage.content = response.choices.firstOrNull()?.message?.content ?: ""
            assistantMessage.panel.revalidate()
            assistantMessage.panel.repaint()
        }
    }

    /**
     * 添加消息到面板
     */
    private fun addMessage(role: String, content: String): ChatMessageItem {
        val messageItem = ChatMessageItem(role, content)
        messages.add(messageItem)
        messagePanel.add(messageItem.panel)
        messagePanel.revalidate()
        messagePanel.repaint()
        scrollToBottom()
        return messageItem
    }

    /**
     * 滚动到底部
     */
    private fun scrollToBottom() {
        SwingUtilities.invokeLater {
            val verticalBar = messageScrollPane.verticalScrollBar
            verticalBar.value = verticalBar.maximum
        }
    }

    /**
     * 清空对话
     */
    private fun clearChat() {
        if (messages.isEmpty()) return

        val result = JOptionPane.showConfirmDialog(
            mainPanel,
            "确定要清空所有对话吗？",
            "清空对话",
            JOptionPane.YES_NO_OPTION
        )

        if (result == JOptionPane.YES_OPTION) {
            messages.clear()
            messagePanel.removeAll()
            messagePanel.revalidate()
            messagePanel.repaint()
        }
    }

    /**
     * 获取主面板
     */
    fun getComponent(): JComponent = mainPanel

    /**
     * 聊天消息项
     */
    private inner class ChatMessageItem(val role: String, content: String) {
        var content: String = content
            set(value) {
                field = value
                updateContentPanel()
            }

        val panel: JPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.X_AXIS)
            border = JBUI.Borders.empty(5)
            background = UIUtil.getPanelBackground()
        }

        private val contentPanel: JPanel

        init {
            // 头像
            val avatar = JLabel(
                when (role) {
                    "user" -> "👤"
                    "assistant" -> "🤖"
                    else -> "ℹ️"
                }
            ).apply {
                font = Font("Arial", Font.PLAIN, 20)
            }

            // 内容面板
            contentPanel = JPanel().apply {
                layout = BorderLayout()
                border = JBUI.Borders.compound(
                    JBUI.Borders.empty(10),
                    JBUI.Borders.line(when (role) {
                        "user" -> JBUI.CurrentTheme.ActionButton.hoverBorder()
                        "assistant" -> JBUI.CurrentTheme.ActionButton.focusedBorder()
                        else -> JBUI.CurrentTheme.ActionButton.defaultBorder()
                    })
                )
                background = when (role) {
                    "user" -> JBUI.CurrentTheme.ActionButton.hoverBackground()
                    "assistant" -> JBUI.CurrentTheme.ActionButton.focusedBackground()
                    else -> UIUtil.getPanelBackground()
                }
            }

            val textPane = JTextArea().apply {
                this.text = content
                isEditable = false
                wrapStyleWord = true
                lineWrap = true
                font = JBUI.Fonts.label()
                background = Color(0, 0, 0, 0)
                border = null
            }

            contentPanel.add(textPane, BorderLayout.CENTER)

            panel.add(avatar)
            panel.add(Box.createHorizontalStrut(10))
            panel.add(contentPanel)
        }

        private fun updateContentPanel() {
            val textPane = contentPanel.getComponent(0) as JTextArea
            textPane.text = content
            contentPanel.revalidate()
            contentPanel.repaint()
        }
    }

    override fun dispose() {
        // 清理资源
    }
}

/**
 * AI 工具窗口工厂
 */
class AIToolWindowFactory : com.intellij.openapi.wm.ToolWindowFactory {
    override fun createToolWindowContent(project: com.intellij.openapi.project.Project, toolWindow: com.intellij.openapi.wm.ToolWindow) {
        val aiToolWindow = AIToolWindow(project)
        val contentFactory = com.intellij.openapi.wm.ToolWindowContentFactory.getInstance()
        val content = contentFactory.createContent(aiToolWindow.getComponent(), "", false)
        toolWindow.contentManager.addContent(content)
    }
}
