package com.company.aiassistant.actions

import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project

/**
 * AI 生成测试 Action
 *
 * 获取选中代码 → "为以下代码生成单元测试" → 显示结果
 */
class GenerateTestsAction : BaseAIAction("AI 生成测试", "使用 AI 为选中代码生成单元测试") {

    override fun executeAction(project: Project, editor: Editor, selectedText: String) {
        val language = editor.document.language.displayName

        executeAIRequest(project, "生成单元测试") {
            aiService.generateTests(selectedText, language).get()
        }
    }
}
