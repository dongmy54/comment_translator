const vscode = require('vscode');
const axios = require('axios');

// 全局变量
let outputChannel;
let decorationType;
let loadingDecoration;
let translating = false;
let lastTranslationRange = null; // 记录最后一次插入译文的范围
const translationCache = new Map();

function activate(context) {
    try {
        // 创建输出通道
        outputChannel = vscode.window.createOutputChannel('Code Comment Translator');

        // 创建装饰器类型（用于显示翻译结果）
        decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: '#1e1e1e',
            border: '1px solid #454545',
            borderRadius: '4px',
            isWholeLine: true
        });

        // 创建加载中的装饰器类型
        loadingDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: '#1e1e1e10',
            isWholeLine: true,
            after: {
                contentText: '正在翻译...',
                color: '#666666',
                margin: '0 0 0 1em'
            }
        });

        // 监听选择变化事件（用于清除装饰和译文）
        const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(async event => {
            if (event.textEditor && lastTranslationRange) {
                // 清除装饰
                clearDecorations(event.textEditor);
                
                // 删除之前插入的译文
                await event.textEditor.edit(editBuilder => {
                    if (lastTranslationRange) {
                        editBuilder.delete(lastTranslationRange);
                        lastTranslationRange = null;
                    }
                });
            }
        });
        context.subscriptions.push(selectionChangeDisposable);

        // 注册命令
        const commandDisposable = vscode.commands.registerCommand('code-comment-translator.translate', async () => {
            try {
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    return;
                }

                const selection = editor.selection;
                if (selection.isEmpty) {
                    vscode.window.showInformationMessage('请先选择要翻译的注释文本');
                    return;
                }

                const text = editor.document.getText(selection);
                if (!text.trim()) {
                    vscode.window.showInformationMessage('选中的文本为空');
                    return;
                }

                if (translating) {
                    vscode.window.showInformationMessage('正在翻译中，请稍候...');
                    return;
                }

                // 检查是否是注释
                const lines = text.split('\n');
                if (!lines.some(line => isComment(line))) {
                    vscode.window.showInformationMessage('请选择注释文本进行翻译');
                    return;
                }

                await translateAndDecorate(editor, text);
            } catch (error) {
                vscode.window.showErrorMessage('Translation failed: ' + error.message);
            }
        });

        context.subscriptions.push(commandDisposable);
        
        // 添加清理函数
        context.subscriptions.push({
            dispose: () => {
                if (outputChannel) {
                    outputChannel.dispose();
                }
                if (decorationType) {
                    decorationType.dispose();
                }
                if (loadingDecoration) {
                    loadingDecoration.dispose();
                }
            }
        });

    } catch (error) {
        console.error('Activation error:', error);
        vscode.window.showErrorMessage('Extension activation failed: ' + error.message);
    }
}

// 添加显式的停用函数
function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
    if (decorationType) {
        decorationType.dispose();
    }
    if (loadingDecoration) {
        loadingDecoration.dispose();
    }
}

async function translateAndDecorate(editor, text) {
    try {
        translating = true;
        
        // 显示加载中状态
        showLoadingDecoration(editor);
        
        const startTime = Date.now();
        const cleanText = removeCommentSymbols(text);
        
        // 调用翻译 API
        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-chat",
            messages: [
                {"role": "system", "content": "You are a helpful assistant that translates English text to Chinese."},
                {"role": "user", "content": `将下面的英文翻译为中文：${cleanText}`}
            ],
            stream: false
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-a5659a24538d4e57ac988d60cb1d7a68'
            }
        });

        const endTime = Date.now();

        if (!response.data?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response from translation API');
        }

        const translatedText = response.data.choices[0].message.content;
        
        // 处理翻译结果
        const processedLines = processTranslatedText(translatedText);
        
        // 清除加载中的装饰
        editor.setDecorations(loadingDecoration, []);

        // 在选中文本下方插入译文
        await editor.edit(editBuilder => {
            const endLine = editor.selection.end.line;
            const indentation = editor.document.lineAt(endLine).text.match(/^\s*/)[0];
            
            // 构建译文内容
            const translationBlock = [
                `${indentation}/* 译文：`,
                ...processedLines.map(line => `${indentation} * ${line}`),
                `${indentation} */`
            ].join('\n') + '\n';
            
            // 在选中内容下方插入译文
            const insertPosition = new vscode.Position(endLine + 1, 0);
            editBuilder.insert(insertPosition, translationBlock);
            
            // 记录插入的译文范围
            lastTranslationRange = new vscode.Range(
                endLine + 1,
                0,
                endLine + processedLines.length + 3, // +3 是因为有开始、结束行和换行符
                0
            );
        });

        // 高亮显示译文区域
        if (lastTranslationRange) {
            editor.setDecorations(decorationType, [{ range: lastTranslationRange }]);
        }

        // 记录日志
        logAPI('Translation Result', {
            original: text,
            cleaned: cleanText,
            translated: translatedText,
            duration: `${endTime - startTime}ms`
        });

    } catch (error) {
        console.error('Translation error:', error);
        vscode.window.showErrorMessage('翻译失败: ' + error.message);
        editor.setDecorations(loadingDecoration, []);
    } finally {
        translating = false;
    }
}

// 清除装饰
function clearDecorations(editor) {
    if (decorationType) {
        editor.setDecorations(decorationType, []);
    }
    if (loadingDecoration) {
        editor.setDecorations(loadingDecoration, []);
    }
}

// 显示加载中的装饰
function showLoadingDecoration(editor) {
    const loadingDecorationOptions = [{
        range: new vscode.Range(
            editor.selection.start.line,
            0,
            editor.selection.end.line,
            editor.document.lineAt(editor.selection.end.line).text.length
        )
    }];
    editor.setDecorations(loadingDecoration, loadingDecorationOptions);
}

// 去除注释符号
function removeCommentSymbols(text) {
    return text
        .split('\n')
        .map(line => {
            line = line.trim();
            // 移除单行注释符号
            if (line.startsWith('//')) {
                return line.substring(2).trim();
            }
            // 移除多行注释符号
            if (line.startsWith('/*')) {
                line = line.substring(2);
            }
            if (line.endsWith('*/')) {
                line = line.slice(0, -2);
            }
            if (line.startsWith('*')) {
                line = line.substring(1);
            }
            return line.trim();
        })
        .filter(line => line.length > 0)
        .join('\n');
}

// 记录API调用日志
function logAPI(action, data) {
    if (outputChannel) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            action,
            ...data
        };
        outputChannel.appendLine(JSON.stringify(logEntry, null, 2));
    }
}

// 检查是否是注释
function isComment(text) {
    const trimmed = text.trim();
    const commentPrefixes = ['//', '/*', '*', '*/'];
    return commentPrefixes.some(prefix => trimmed.startsWith(prefix));
}

// 处理翻译文本的辅助函数
function processTranslatedText(translatedText) {
    const MAX_LINE_LENGTH = 60; // 每行最大字符数
    let lines = [];
    let currentLine = '';
    
    // 按标点符号分割文本
    const segments = translatedText.split(/([，。！？；])/);
    
    for (let i = 0; i < segments.length; i++) {
        let segment = segments[i].trim();
        if (!segment) continue;
        
        // 如果是标点符号，直接添加到当前行
        if (/[，。！？；]/.test(segment)) {
            currentLine += segment;
            continue;
        }
        
        // 检查添加新片段后是否超过最大长度
        if (currentLine.length + segment.length > MAX_LINE_LENGTH) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
        }
        
        currentLine += segment;
        
        // 如果下一个是标点符号，等待添加标点
        if (i + 1 < segments.length && /[，。！？；]/.test(segments[i + 1])) {
            continue;
        }
        
        // 当前行已经足够长，或者是最后一个片段
        if (currentLine.length >= MAX_LINE_LENGTH || i === segments.length - 1) {
            if (currentLine) {
                lines.push(currentLine);
                currentLine = '';
            }
        }
    }
    
    // 确保最后一行也被添加
    if (currentLine) {
        lines.push(currentLine);
    }
    
    return lines;
}

module.exports = {
    activate,
    deactivate
};
