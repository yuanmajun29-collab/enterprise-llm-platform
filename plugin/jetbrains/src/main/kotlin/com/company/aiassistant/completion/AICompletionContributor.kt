package com.company.aiassistant.completion

import com.company.aiassistant.config.AIAssistantConfig
import com.company.aiassistant.service.AIService
import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Document
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.patterns.PlatformPatterns
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.ui.JBColor
import com.intellij.util.ProcessingContext
import icons.AIIcons
import java.util.*
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

/**
 * AI 代码补全提供者
 */
class AICompletionContributor : CompletionContributor() {
    private val aiService: AIService = ApplicationManager.getApplication().getService(AIService::class.java)
    private val config: AIAssistantConfig = AIAssistantConfig.getInstance()

    // 缓存活跃的补全请求
    private val activeCompletions = ConcurrentHashMap<CompletionKey, CompletableFuture<String>>()

    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    resultSet: CompletionResultSet
                ) {
                    // 检查是否启用自动补全
                    if (!config.enableAutocomplete) {
                        return
                    }

                    val editor = parameters.editor
                    val file = parameters.originalFile
                    val offset = parameters.offset

                    // 取消之前的补全请求
                    cancelCompletion(editor, file)

                    // 获取当前行文本
                    val document = editor.document
                    val line = document.getLineNumber(offset)
                    val lineStartOffset = document.getLineStartOffset(line)
                    val lineEndOffset = document.getLineEndOffset(line)
                    val lineText = document.getText(TextRange(lineStartOffset, lineEndOffset))
                    val prefix = lineText.substring(0, offset - lineStartOffset)

                    // 检查是否应该触发补全
                    if (!shouldComplete(prefix)) {
                        return
                    }

                    // 获取上下文
                    val contextText = getContext(document, offset, 20)

                    // 启动异步补全请求
                    val key = CompletionKey(editor, file)
                    val future = requestCompletion(editor, file, contextText, prefix)

                    if (future != null) {
                        activeCompletions[key] = future

                        // 异步添加补全结果
                        future.thenAccept { completion ->
                            ApplicationManager.getApplication().invokeLater {
                                if (!editor.isDisposed) {
                                    addCompletionToResultSet(resultSet, completion, prefix)
                                }
                                activeCompletions.remove(key)
                            }
                        }.exceptionally { e ->
                            println("AI completion failed: ${e.message}")
                            activeCompletions.remove(key)
                            null
                        }
                    }
                }
            }
        )
    }

    /**
     * 检查是否应该触发补全
     */
    private fun shouldComplete(prefix: String): Boolean {
        // 过滤空行
        if (prefix.trim().isEmpty()) {
            return false
        }

        // 过滤注释
        val trimmed = prefix.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
            return false
        }

        // 过滤字符串字面量
        val lastQuote = maxOf(
            prefix.lastIndexOf('"'),
            prefix.lastIndexOf("'"),
            prefix.lastIndexOf('`')
        )
        if (lastQuote >= 0) {
            val afterLastQuote = prefix.substring(lastQuote + 1)
            if (!afterLastQuote.contains(prefix[lastQuote])) {
                return false
            }
        }

        // 过滤单字符输入
        if (prefix.length < 2) {
            return false
        }

        return true
    }

    /**
     * 获取上下文文本
     */
    private fun getContext(document: Document, offset: Int, lines: Int): String {
        val startLine = maxOf(0, document.getLineNumber(offset) - lines)
        val startOffset = document.getLineStartOffset(startLine)
        val contextText = document.getText(TextRange(startOffset, offset))

        // 获取后缀（行尾）
        val currentLine = document.getLineNumber(offset)
        val endOffset = document.getLineEndOffset(currentLine)
        val suffixText = document.getText(TextRange(offset, endOffset))

        return contextText + suffixText
    }

    /**
     * 请求补全
     */
    private fun requestCompletion(
        editor: Editor,
        file: PsiFile,
        contextText: String,
        prefix: String
    ): CompletableFuture<String>? {
        if (!aiService.isConfigured()) {
            return null
        }

        val future = CompletableFuture<String>()

        ProgressManager.getInstance().run(object : Task.Backgroundable(
            file.project,
            "AI 代码补全",
            true
        ) {
            override fun run(indicator: ProgressIndicator) {
                try {
                    val completion = aiService.codeComplete(
                        code = contextText,
                        language = file.language.displayName,
                        cursorPosition = prefix.length
                    ).get()

                    // 清理补全结果
                    val cleaned = cleanCompletion(completion, prefix)
                    future.complete(cleaned)
                } catch (e: Exception) {
                    future.completeExceptionally(e)
                }
            }

            override fun isHeadless(): Boolean = false
        })

        return future
    }

    /**
     * 清理补全结果
     */
    private fun cleanCompletion(completion: String, prefix: String): String {
        var result = completion

        // 移除已输入的前缀
        if (result.startsWith(prefix)) {
            result = result.substring(prefix.length)
        }

        // 移除多余的换行
        result = result.replace(Regex("^\\n+"), "")

        // 只返回第一行或第一段
        val lines = result.split("\n")
        if (lines.size > 3) {
            result = lines.take(3).joinToString("\n")
        }

        return result.trim()
    }

    /**
     * 添加补全到结果集
     */
    private fun addCompletionToResultSet(
        resultSet: CompletionResultSet,
        completion: String,
        prefix: String
    ) {
        if (completion.isEmpty()) return

        val element = LookupElementBuilder.create(completion)
            .withIcon(AIIcons.AI)
            .withTypeText("AI", true)
            .withTailText(" AI 生成", true)
            .withInsertHandler { context, item ->
                val editor = context.editor
                val document = editor.document
                val startOffset = context.startOffset
                val endOffset = context.selectionEndOffset

                ApplicationManager.runWriteAction {
                    document.replaceString(startOffset, endOffset, completion)
                    editor.caretModel.moveToOffset(startOffset + completion.length)
                }
            }

        resultSet.addElement(element)
    }

    /**
     * 取消补全
     */
    private fun cancelCompletion(editor: Editor, file: PsiFile) {
        val key = CompletionKey(editor, file)
        activeCompletions.remove(key)?.cancel(true)
    }

    override fun beforeCompletion(context: CompletionInitializationContext) {
        super.beforeCompletion(context)
    }

    override fun fillCompletionVariants(
        parameters: CompletionParameters,
        resultSet: CompletionResultSet
    ) {
        super.fillCompletionVariants(parameters, resultSet)
    }

    /**
     * 补全键（用于唯一标识补全请求）
     */
    private data class CompletionKey(
        val editor: Editor,
        val file: PsiFile
    ) {
        override fun equals(other: Any?): Boolean {
            if (this === other) return true
            if (other !is CompletionKey) return false
            return editor == other.editor && file == other.file
        }

        override fun hashCode(): Int {
            return Objects.hash(editor, file)
        }
    }
}

/**
 * AI 图标
 */
object AIIcons {
    val AI = com.intellij.openapi.util.IconLoader.getIcon(
        "/icons/ai_icon.png",
        AICompletionContributor::class.java
    )
}
