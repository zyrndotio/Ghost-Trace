import * as vscode from 'vscode';

type GhostTraceToolInput = {
	targetLine?: number;
};

function formatNumberedSource(document: vscode.TextDocument): string {
	return Array.from(
		{ length: document.lineCount },
		(_, index) => `${index + 1}: ${document.lineAt(index).text}`,
	).join('\n');
}

function formatErrorDiagnostics(): string {
	const errors = vscode.languages.getDiagnostics()
		.flatMap(([uri, diagnostics]) => diagnostics
			.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error)
			.map(diagnostic => {
				const location = `${uri.fsPath}:${diagnostic.range.start.line + 1}:${diagnostic.range.start.character + 1}`;
				return `${location}: ${diagnostic.message}`;
			}));
	return errors.length > 0 ? errors.join('\n') : 'No error diagnostics are currently reported.';
}

export function activate(context: vscode.ExtensionContext) {
	const lineHighlight = vscode.window.createTextEditorDecorationType({
		isWholeLine: true,
		backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
	});
	let highlightTimeout: ReturnType<typeof setTimeout> | undefined;
	context.subscriptions.push(lineHighlight);
	context.subscriptions.push({
		dispose: () => {
			if (highlightTimeout) {
				clearTimeout(highlightTimeout);
			}
		},
	});
	context.subscriptions.push(vscode.commands.registerCommand(
		'ghost-trace.jumpToLine',
		async (fileUri: string, lineNumber: number) => {
			if (typeof fileUri !== 'string' || !Number.isInteger(lineNumber) || lineNumber < 1) {
				await vscode.window.showErrorMessage('Ghost Trace needs a valid file and one-based line number.');
				return;
			}

			const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(fileUri));
			if (lineNumber > document.lineCount) {
				await vscode.window.showErrorMessage(`Line ${lineNumber} is outside this file.`);
				return;
			}

			const editor = await vscode.window.showTextDocument(document);
			const position = new vscode.Position(lineNumber - 1, 0);
			const range = new vscode.Range(position, position);
			editor.selection = new vscode.Selection(position, position);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
			editor.setDecorations(lineHighlight, [range]);

			if (highlightTimeout) {
				clearTimeout(highlightTimeout);
			}
			highlightTimeout = setTimeout(() => editor.setDecorations(lineHighlight, []), 1500);
		},
	));

	context.subscriptions.push(vscode.lm.registerTool<GhostTraceToolInput>(
		'ghost_trace_diagnose',
		{
			invoke: ({ input }) => {
				const editor = vscode.window.activeTextEditor;
				if (!editor) {
					return new vscode.LanguageModelToolResult([
						new vscode.LanguageModelTextPart(
							'No active text editor is open, so there is no file to diagnose. Do not edit the user\'s code.',
						),
					]);
				}

				const document = editor.document;
				const targetLine = typeof input.targetLine === 'number'
					? `\nRequested focus line: ${input.targetLine} (one-based).`
					: '';
				const result = [
					'Diagnose the active file and its error diagnostics. Identify the exact upstream root-cause line, explain why the reported error cascaded to its diagnostic location, and NEVER edit, rewrite, or apply changes to the user\'s code. Only explain the cause.',
					`Active file: ${document.uri.fsPath}${targetLine}`,
					'Complete numbered source:',
					formatNumberedSource(document),
					'Error diagnostics from all files:',
					formatErrorDiagnostics(),
				].join('\n\n');

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(result),
				]);
			},
		},
	));

	const participant = vscode.chat.createChatParticipant(
		'ghost-trace.trace',
		async (request, _chatContext, responseStream, token) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor) {
				responseStream.markdown('Open a file in the editor so I can trace its diagnostics.');
				return;
			}

			const document = editor.document;
			const source = formatNumberedSource(document);
			const errorContext = formatErrorDiagnostics();
			const lineLinkExample = `[Line 12](command:ghost-trace.jumpToLine?${encodeURIComponent(JSON.stringify([document.uri.toString(), 12]))})`;
			const prompt = [
				'Find the upstream source line that caused the reported syntax error. Diagnostics may appear on blank or unrelated lines because the parser detected the problem later than where it began.',
				'Use language-agnostic reasoning based on the active file\'s actual language and syntax; do not assume a particular language or rely on a hardcoded language list. Inspect the complete numbered source and all current error diagnostics. Pay attention to delimiters, constructs, or declarations opened earlier in the file that could cause a later cascade.',
				'This extension is strictly read-only: never edit, rewrite, or apply changes to user code. Only explain the cause and how to fix it.',
				`Make every active-file line reference a clickable VS Code link in the form [Line N](command:ghost-trace.jumpToLine?ENCODED_ARGUMENTS), where ENCODED_ARGUMENTS is encodeURIComponent(JSON.stringify([active file URI, one-based line number])). Example: ${lineLinkExample}`,
				`User request: ${request.prompt}`,
				`Active file: ${document.uri.fsPath}`,
				'Numbered source:',
				source,
				'Error diagnostics:',
				errorContext,
			].join('\n\n');

			const modelResponse = await request.model.sendRequest(
				[vscode.LanguageModelChatMessage.User(prompt)],
				{},
				token,
			);
			let answer = '';
			for await (const part of modelResponse.stream) {
				if (part instanceof vscode.LanguageModelTextPart) {
					answer += part.value;
				}
			}
			const markdown = new vscode.MarkdownString(answer);
			markdown.isTrusted = { enabledCommands: ['ghost-trace.jumpToLine'] };
			responseStream.markdown(markdown);
		},
	);
	participant.followupProvider = {
		provideFollowups: () => [
			{ prompt: 'Why does this syntax error cascade down?' },
			{ prompt: 'How can I prevent this in the future?' },
		],
	};
	context.subscriptions.push(participant);
}

export function deactivate() {}
