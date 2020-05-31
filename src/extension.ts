import * as vscode from 'vscode';
import EmailFileSystemProvider from './EmailFileSystemProvider';
import * as path from 'path';

export async function activate(context: vscode.ExtensionContext) {
  const emailFileSystemProvider = new EmailFileSystemProvider();
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider('eml', emailFileSystemProvider, { isCaseSensitive: true, isReadonly: true }));
  context.subscriptions.push(vscode.workspace.registerFileSystemProvider('msg', emailFileSystemProvider, { isCaseSensitive: true, isReadonly: true }));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => tryPreviewEmailDocument(document)));
  if (vscode.window.activeTextEditor !== undefined) {
    await tryPreviewEmailDocument(vscode.window.activeTextEditor.document);
  }
}

async function tryPreviewEmailDocument(document: vscode.TextDocument) {
  let name: string;
  let html: string;
  switch (document.uri.scheme) {
    case 'eml': {
      name = path.basename(document.uri.query);

      const extension = path.extname(document.uri.query);
      if (extension !== '.eml') {
        return;
      }

      const fragment = document.uri.fragment;
      if (fragment !== 'webview') {
        return;
      }

      html = document.getText();
    }
    case 'msg': {
      name = path.basename(document.uri.query);

      const extension = path.extname(document.uri.query);
      if (extension !== '.msg') {
        return;
      }

      const fragment = document.uri.fragment;
      if (fragment !== 'webview') {
        return;
      }

      html = document.getText();
    }
    default: {
      name = path.basename(document.uri.path);

      const extension = path.extname(document.uri.path).substr(1).toLowerCase();
      if (extension !== 'eml' && extension !== 'msg') {
        return;
      }

      const emailUri = vscode.Uri.parse(`${extension}:/?${document.uri}`);
      if (vscode.workspace.getWorkspaceFolder(emailUri) === undefined) {
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length || 0, 0, { uri: emailUri, name });
      }

      const webviewUri = vscode.Uri.parse(`${extension}:/${name}.html?${document.uri}`);
      const data = await vscode.workspace.fs.readFile(webviewUri);
      html = Buffer.from(data).toString('utf-8');
    }
  }

  const webviewPanel = vscode.window.createWebviewPanel(name, name, vscode.ViewColumn.Active);
  webviewPanel.webview.html = html;
}
