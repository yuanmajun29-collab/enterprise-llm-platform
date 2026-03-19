package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * 生成测试 Action
 */
class GenerateTestsAction : BaseAIAction("AI 生成测试") {
    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "生成测试", {
            aiService.generateTests(selectedText, language).get()
        }) { result ->
            showResult(project, "生成的测试", result)
        }
    }
}
