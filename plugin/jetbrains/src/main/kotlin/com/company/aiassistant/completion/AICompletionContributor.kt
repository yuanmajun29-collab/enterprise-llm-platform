package com.company.aiassistant.completion

import com.company.aiassistant.config.AIAssistantSettings
import com.company.aiassistant.service.AIService
import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionProvider
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Document
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.util.TextRange
import com.intellij.patterns.PlatformPatterns
import com.intellij.psi.PsiFile
import com.intellij.util.ProcessingContext
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap

/**
 * AI 代码补全提供者
 */
class AICompletionContributor : CompletionContributor() {

    private val aiService: AIService = AIService.getInstance()
    private val activeCompletions = ConcurrentHashMap<CompletionKey, CompletableFuture<String>>()

    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    resultSet: com.intellij.codeInsight.completion.CompletionResultSet
                ) {
                    val settings = AIAssistantSettings.getInstance()
                    if (!settings.enableAutocomplete) return

                    val editor = parameters.editor
                    val file = parameters.originalFile
                    val offset = parameters.offset

                    // 取消之前的请求
                    cancelCompletion(editor, file)

                    // 获取当前行文本
                    val document = editor.document
                    val line = document.getLineNumber(offset)
                    val lineStartOffset = document.getLineStartOffset(line)
                    val lineEndOffset = document.getLineEndOffset(line)
                    val lineText = document.getText(TextRange(lineStartOffset, lineEndOffset))
                    val prefix = lineText.substring(0, offset - lineStartOffset)

                    if (!shouldComplete(prefix)) return

                    // 获取上下文
                    val contextText = getContext(document, offset, 20)

                    val key = CompletionKey(editor, file)
                    val future = requestCompletion(file, contextText, prefix)

                    if (future != null) {
                        activeCompletions[key] = future

                        future.thenAccept { completion ->
                            ApplicationManager.getApplication().invokeLater {
                                if (!editor.isDisposed) {
                                    addCompletionToResultSet(resultSet, completion)
                                }
                                activeCompletions.remove(key)
                            }
                        }.exceptionally { e ->
                            activeCompletions.remove(key)
                            null
                    }
                }
            }
        )
    }

    private fun shouldComplete(prefix: String): Boolean {
        if (prefix.trim().isEmpty()) return false
        val trimmed = prefix.trim()
        if (trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) return false
        if (prefix.trim().length < 2) return false
        return true
    }

    private fun getContext(document: Document, offset: Int, lines: Int): String {
        val startLine = maxOf(0, document.getLineNumber(offset) - lines)
        val startOffset = document.getLineStartOffset(startLine)
        val currentLine = document.getLineNumber(offset)
        val endOffset = document.getLineEndOffset(currentLine)
        return document.getText(TextRange(startOffset, endOffset))
    }

    private fun requestCompletion(
        file: PsiFile,
        contextText: String,
        prefix: String
    ): CompletableFuture<String>? {
        if (!aiService.isConfigured()) return null

        val future = CompletableFuture<String>()

        ProgressManager.getInstance().run(object : Task.Backgroundable(
            file.project, "AI 代码补全", true
        ) {
            override fun run(indicator: ProgressIndicator) {
                try {
                    val response = aiService.codeCompletion(
                        code = contextText,
                        language = file.language.displayName,
                        cursorPos = prefix.length
                    ).get()
                    future.complete(cleanCompletion(response.completion, prefix))
                } catch (e: Exception) {
                    future.completeExceptionally(e)
                }
            }
        })

        return future
    }

    private fun cleanCompletion(completion: String, prefix: String): String {
        var result = completion
        if (result.startsWith(prefix)) {
            result = result.substring(prefix.length)
        }
        result = result.replace(Regex("^\\n+"), "")
        val lines = result.split("\n")
        if (lines.size > 3) {
            result = lines.take(3).joinToString("\n")
        }
        return result.trim()
    }

    private fun addCompletionToResultSet(
        resultSet: com.intellij.codeInsight.completion.CompletionResultSet,
        completion: String
    ) {
        if (completion.isEmpty()) return

        val element = LookupElementBuilder.create(completion)
            .withTypeText("AI", true)
            .withTailText(" AI 生成", true)

        resultSet.addElement(element)
    }

    private fun cancelCompletion(editor: com.intellij.openapi.editor.Editor, file: PsiFile) {
        val key = CompletionKey(editor, file)
        activeCompletions.remove(key)?.cancel(true)
    }

    private data class CompletionKey(
        val editor: com.intellij.openapi.editor.Editor,
        val file: PsiFile
    )
}
