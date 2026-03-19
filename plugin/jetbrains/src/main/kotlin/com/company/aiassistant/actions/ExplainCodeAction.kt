package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * 解释代码 Action
 */
class ExplainCodeAction : BaseAIAction("AI 解释代码") {
    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "解释代码", {
            aiService.explainCode(selectedText, language).get()
        }) { result ->
            showResult(project, "代码解释", result)
        }
    }
}
