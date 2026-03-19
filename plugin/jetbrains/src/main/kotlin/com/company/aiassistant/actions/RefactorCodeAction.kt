package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * 重构代码 Action
 */
class RefactorCodeAction : BaseAIAction("AI 重构代码") {
    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "重构代码", {
            aiService.refactorCode(selectedText, language).get()
        }) { result ->
            showResult(project, "代码重构", result)
        }
    }
}
