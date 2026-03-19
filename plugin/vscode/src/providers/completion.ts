/**
 * Code Completion Provider
 * 代码补全提供者
 *
 * - InlineCompletionItemProvider 实现
 * - 获取当前行上下文 + 光标前缀
 * - 调用 aiClient.codeCompletion()
 * - 防抖 500ms
 * - 输入停顿 500ms 后自动触发
 */

import * as vscode from 'vscode';
import { AIClient } from '../client/aiClient';
import { getConfigManager, ConfigKey } from '../client/config';
import { debounceAsync } from '../utils/debounce';

/**
 * AI 代码补全提供者（内联）
 */
export class AICodeCompletionProvider implements vscode.InlineCompletionItemProvider {
    private client: AIClient;
    private debounceFn: ReturnType<typeof debounceAsync> | null = null;
    private currentCompletion: string | null = null;
    private isCompleting = false;

    constructor(client: AIClient) {
        this.client = client;

        // 初始化 500ms 防抖
        const config = getConfigManager();
        this.debounceFn = debounceAsync(
            (prefix: string) => this.requestCompletion(prefix),
            config.getAutocompleteDebounce() // 500ms
        );

        // 监听配置变化
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('llm-assistant.autocompleteDebounce')) {
                const newDelay = getConfigManager().getAutocompleteDebounce();
                this.debounceFn = debounceAsync(
                    (prefix: string) => this.requestCompletion(prefix),
                    newDelay
                );
            }
        });
    }

    /**
     * 提供内联补全项
     */
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionList> {
        // 检查是否启用
        if (!getConfigManager().isAutocompleteEnabled()) {
            return { items: [] };
        }

        // 如果正在补全，返回缓存的结果
        if (this.isCompleting && this.currentCompletion) {
            return {
                items: [
                    new vscode.InlineCompletionItem(
                        this.currentCompletion,
                        new vscode.Range(position, position)
                    ),
                ],
            };
        }

        // 获取当前行文本
        const lineText = document.lineAt(position.line).text;
        const prefix = lineText.substring(0, position.character);

        // 过滤不需要补全的情况
        if (!this.shouldComplete(prefix)) {
            return { items: [] };
        }

        // 防抖调度
        try {
            const result = await Promise.race([
                this.debounceFn!(prefix),
                new Promise<null>((resolve) => {
                    token.onCancellationRequested(() => resolve(null));
                }),
            ]);

            if (result) {
                this.currentCompletion = result;
                return {
                    items: [
                        new vscode.InlineCompletionItem(
                            result,
                            new vscode.Range(position, position)
                        ),
                    ],
                };
            }
        } catch (error) {
            console.error('Completion error:', error);
        }

        return { items: [] };
    }

    /**
     * 判断是否应触发补全
     */
    private shouldComplete(prefix: string): boolean {
        if (!prefix.trim()) return false;

        const trimmed = prefix.trim();
        // 过滤注释
        if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
            return false;
        }

        // 过滤字符串内部
        const quotes = ['"', "'", '`'];
        for (const q of quotes) {
            const lastIdx = prefix.lastIndexOf(q);
            if (lastIdx !== -1) {
                const after = prefix.substring(lastIdx + 1);
                if (!after.includes(q)) {
                    return false;
                }
            }
        }

        // 过滤过短的输入
        if (prefix.trim().length < 2) return false;

        return true;
    }

    /**
     * 请求补全
     */
    private async requestCompletion(prefix: string): Promise<string> {
        this.isCompleting = true;

        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) return '';

            const document = editor.document;
            const position = editor.selection.active;

            // 获取上下文（前 10 行 + 当前行前缀）
            const startLine = Math.max(0, position.line - 10);
            const contextLines: string[] = [];
            for (let i = startLine; i < position.line; i++) {
                contextLines.push(document.lineAt(i).text);
            }
            contextLines.push(prefix);

            const code = contextLines.join('\n');

            // 调用 AI 补全 API
            const response = await this.client.codeCompletion(
                code,
                document.languageId,
                prefix.length
            );

            // 清理补全结果
            return this.cleanCompletion(response.completion, prefix);
        } catch (error) {
            console.error('Failed to get completion:', error);
            return '';
        } finally {
            this.isCompleting = false;
        }
    }

    /**
     * 清理补全结果
     */
    private cleanCompletion(completion: string, prefix: string): string {
        let result = completion;

        // 移除已输入的前缀
        if (result.startsWith(prefix)) {
            result = result.substring(prefix.length);
        }

        // 移除开头的多余换行
        result = result.replace(/^\n+/, '');

        // 只返回前几行
        const lines = result.split('\n');
        if (lines.length > 3) {
            result = lines.slice(0, 3).join('\n');
        }

        return result;
    }

    dispose(): void {
        if (this.debounceFn) {
            this.debounceFn.cancel();
        }
    }
}

/**
 * 智能代码片段提供者
 */
export class SmartSnippetProvider implements vscode.CompletionItemProvider {
    private client: AIClient;
    private isGenerating = false;

    constructor(client: AIClient) {
        this.client = client;
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        // 只在显式触发时生成
        if (context.triggerKind !== vscode.CompletionTriggerKind.Invoke) {
            return [];
        }

        if (this.isGenerating) return [];
        this.isGenerating = true;

        try {
            const lineText = document.lineAt(position.line).text;
            const prefix = lineText.substring(0, position.character).trim();

            const patterns = [
                /^function\s+\w*/, /^class\s+\w*/, /^def\s+\w*/,
                /^if\s*$/, /^for\s*$/, /^while\s*$/,
                /^interface\s+\w*/, /^type\s+\w*/, /^enum\s+\w*/,
            ];

            if (!patterns.some(p => p.test(prefix))) {
                return [];
            }

            const startLine = Math.max(0, position.line - 20);
            const lines: string[] = [];
            for (let i = startLine; i <= position.line; i++) {
                lines.push(i === position.line
                    ? document.lineAt(i).text.substring(0, position.character)
                    : document.lineAt(i).text);
            }

            const response = await this.client.chatCompletions(
                [
                    {
                        role: 'system',
                        content: '你是代码补全专家。根据上下文提供代码补全。返回JSON：{"label":"描述","snippet":"VSCode snippet格式","doc":"说明"}',
                    },
                    {
                        role: 'user',
                        content: `Language: ${document.languageId}\nContext:\n${lines.join('\n')}\n\n生成代码补全。`,
                    },
                ],
                undefined,
                { max_tokens: 500, temperature: 0.3 }
            );

            const content = response.choices[0]?.message?.content || '';
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const item = new vscode.CompletionItem(parsed.label, vscode.CompletionItemKind.Snippet);
                item.insertText = new vscode.SnippetString(parsed.snippet);
                item.documentation = new vscode.MarkdownString(parsed.doc);
                item.detail = 'AI 生成';
                return [item];
            }
        } catch (error) {
            console.error('Snippet generation error:', error);
        } finally {
            this.isGenerating = false;
        }

        return [];
    }

    dispose(): void {}
}
