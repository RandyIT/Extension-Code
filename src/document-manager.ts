'use strict';

import * as vscode from 'vscode';
import {HubClient} from './hubclient';
import {Logger, LogType} from './logger';

export default class DocumentManager implements vscode.Disposable {

    private _disposable: vscode.Disposable;
    private _hubClient: HubClient;
    private _logger: Logger;

    private _activeDocumentPath: string;

    constructor(hubClient: HubClient, logger: Logger) {
        this._hubClient = hubClient;
        this._logger = logger;
    }

    private onTextEditorSelectionChanged(arg: vscode.TextEditorSelectionChangeEvent) {
        if (arg.textEditor.document.fileName != this._activeDocumentPath)
            return;

        this._logger.appendLog(`onTextEditorSelectionChanged: ${arg.textEditor.document.fileName}`, LogType.Info);
        if (arg.selections.length < 1)
            return;

        var anchor: CursorPosition = { "line": arg.selections[0].anchor.line, "pos": arg.selections[0].anchor.character };
        var active: CursorPosition = { "line": arg.selections[0].active.line, "pos": arg.selections[0].active.character };
        var type: CursorType = CursorType.Select;

        this._hubClient.updateSessionCursor(anchor, active, type);
    }

    private onActiveTextEditorChanged(arg: vscode.TextEditor) {
        this._activeDocumentPath = arg.document.fileName;
        this.resendDocument(arg.document);
    }

    private onTextDocumentChanged(arg: vscode.TextDocumentChangeEvent) {
        if (arg.document.fileName != this._activeDocumentPath)
            return;

        this._logger.appendLog(`onTextDocumentChanged: ${arg.document.fileName}`, LogType.Info);

        var item: UpdateContentData[] = [];
        for (var i = 0; i < arg.contentChanges.length; i++) {
            var content: Line[] = [];
            // 影響を受けた行番号＋新しく挿入されたtextの行数分まで取得
            var startIndex = arg.contentChanges[i].range.start.line;
            var endIndex = startIndex + arg.contentChanges[i].text.split("\n").length;
            var lines: string[] = [];
            for (var n = startIndex; n < endIndex; n++) {
                lines.push(arg.document.lineAt(n).text.replace("\n",""));
            }

            content.push({ "text": lines.join("\n"), "modified": true });
            item.push({ "type": UpdateType.Replace, 
            "data": content, 
            "pos": arg.contentChanges[i].range.start.line, 
            "len": arg.contentChanges[i].range.end.line - arg.contentChanges[i].range.start.line + 1, 
            "order": i });
        }
        this._hubClient.updateSessionContent(item);
    }

    private onTextDocumentSaved(arg: vscode.TextDocument) {
        if (arg.fileName != this._activeDocumentPath)
            return;

        this._logger.appendLog(`onTextDocumentSaved: ${arg.fileName}`, LogType.Info);

        var item: UpdateContentData[] = [];
        item.push({ "type": UpdateType.RemoveMarker, "data": null, "pos": 0, "len": 0, "order": 0 });
        this._hubClient.updateSessionContent(item);
    }

    private resendDocument(document: vscode.TextDocument) {
        var item: UpdateContentData[] = [];

        item.push({ "type": UpdateType.ResetAll, "data": null, "pos": 0, "len": 0, "order": 0 });

        if (document) {
            var content: Line[] = [];
            content.push({ "text": document.getText(), "modified": false });
            item.push({ "type": UpdateType.Append, "data": content, "pos": 0, "len": 0, "order": 0 });
        }

        this._hubClient.updateSessionContent(item);
    }

    resendActiveDocument() {
        var document = vscode.window.activeTextEditor || null;

        if (document) {
            this._hubClient.updateSessionInfo(document.document.fileName, ContentType.PlainText);
            this.resendDocument(document.document);
        } else {
            this.resendDocument(null);
        }
    }

    active() {
        let subscriptions: vscode.Disposable[] = [];
        vscode.window.onDidChangeTextEditorSelection(this.onTextEditorSelectionChanged, this, subscriptions);
        vscode.window.onDidChangeActiveTextEditor(this.onActiveTextEditorChanged, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument(this.onTextDocumentSaved, this, subscriptions);
        vscode.workspace.onDidChangeTextDocument(this.onTextDocumentChanged, this, subscriptions);

        this._disposable = vscode.Disposable.from(...subscriptions);

        this._activeDocumentPath = vscode.window.activeTextEditor.document.fileName;
    }

    dispose() {
        this._disposable.dispose();
    }
}