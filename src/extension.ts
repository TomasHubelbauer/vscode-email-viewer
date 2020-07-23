import * as vscode from 'vscode';
import EmailFileSystemProvider from './EmailFileSystemProvider';
import * as path from 'path';
import parse from './parse';
import cache from './cache';

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
      break;
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
      break;
    }
    default: {
      name = path.basename(document.uri.path);

      const extension = path.extname(document.uri.path).substr(1).toLowerCase();
      if (extension !== 'eml' && extension !== 'msg') {
        return;
      }

      html = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Parsing ${name}` }, async () => {
        try {
          const email = await parse(document.uri);
          cache[document.uri.toString()] = email;
        }
        catch {
          vscode.window.showInformationMessage(`Failed to parse ${name}!`);
        }

        const webviewUri = vscode.Uri.parse(`${extension}:/${name}.html?${document.uri}`);
        const data = await vscode.workspace.fs.readFile(webviewUri);
        return Buffer.from(data).toString('utf-8');
      });

      const emailUri = vscode.Uri.parse(`${extension}:/?${document.uri}`);
      if (vscode.workspace.getWorkspaceFolder(emailUri) === undefined) {
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length || 0, 0, { uri: emailUri, name });
      }
    }
  }

  const webviewPanel = vscode.window.createWebviewPanel(name, name, vscode.ViewColumn.Active);
  webviewPanel.webview.html = html;
}
