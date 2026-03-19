package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * 优化代码 Action
 */
class OptimizeCodeAction : BaseAIAction("AI 优化代码") {
    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "优化代码", {
            aiService.optimizeCode(selectedText, language).get()
        }) { result ->
            showResult(project, "代码优化", result)
        }
    }
}
