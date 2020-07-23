import * as vscode from 'vscode';
import * as path from 'path';
import * as prettyBytes from 'pretty-bytes';
import cache from './cache';

export default class EmailFileSystemProvider implements vscode.FileSystemProvider {
  private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

  public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
    return new vscode.Disposable(() => { });
  }

  public stat(uri: vscode.Uri): vscode.FileStat {
    const emailUri = vscode.Uri.parse(uri.query);
    const email = cache[emailUri.toString()];
    const name = path.basename(emailUri.path);
    if (!email) {
      const error = `${name} was not found in cache! ${Object.keys(cache)}`;
      vscode.window.showErrorMessage(error);
      throw new Error(error);
    }

    const { ctime, mtime } = email;

    if (uri.path === '/') {
      return { type: vscode.FileType.Directory, ctime, mtime, size: 0 };
    }

    if (uri.path === `/${name}.html`) {
      return { type: vscode.FileType.File, ctime, mtime, size: this.preview(email, uri).length };
    }

    const attachment = email.attachments.find(attachment => '/' + attachment.name === uri.path);
    if (attachment !== undefined) {
      return { type: vscode.FileType.File, ctime, mtime, size: attachment.size };
    }

    return { type: vscode.FileType.Unknown, ctime, mtime, size: 0 };
  }

  public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    if (uri.path !== '/') {
      // TODO: Report
      return [];
    }

    const emailUri = vscode.Uri.parse(uri.query);
    const email = cache[emailUri.toString()];
    const name = path.basename(emailUri.path);
    if (!email) {
      const error = `${name} was not found in cache! ${Object.keys(cache)}`;
      vscode.window.showErrorMessage(error);
      throw new Error(error);
    }

    return [
      [`${name}.html`, vscode.FileType.File],
      ...email.attachments
        .filter(attachment => attachment.name)
        .map(attachment => [attachment.name, vscode.FileType.File] as [string, vscode.FileType.File]),
    ];
  }

  public createDirectory(_uri: vscode.Uri): void {
    const error = 'createDirectory should not be called';
    vscode.window.showErrorMessage(error);
    throw new Error(error);
  }

  public readFile(uri: vscode.Uri): Uint8Array {
    const emailUri = vscode.Uri.parse(uri.query);
    const email = cache[emailUri.toString()];
    const name = path.basename(emailUri.path);
    if (!email) {
      const error = `${name} was not found in cache! ${Object.keys(cache)}`;
      vscode.window.showErrorMessage(error);
      throw new Error(error);
    }

    if (uri.path === `/${name}.html`) {
      return this.preview(email, uri);
    }

    const attachment = email.attachments.find(attachment => '/' + attachment.name === uri.path);
    if (attachment) {
      return attachment.content;
    }

    return Buffer.from([]);
  }

  public writeFile(_uri: vscode.Uri, _content: Uint8Array, _options: { create: boolean; overwrite: boolean; }): void {
    const error = 'writeFile should not be called';
    vscode.window.showErrorMessage(error);
    throw new Error(error);
  }

  public delete(_uri: vscode.Uri, _options: { recursive: boolean; }): void {
    const error = 'writeFile should not be called';
    vscode.window.showErrorMessage(error);
    throw new Error(error);
  }

  public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean; }): void {
    const error = 'rename should not be called';
    vscode.window.showErrorMessage(error);
    throw new Error(error);
  }

  private preview(email: Email, uri: vscode.Uri) {
    let html = '';
    html += `From: <strong>${email.from}</strong>`;
    html += '<br />';
    html += `To: <strong>${email.to}</strong>`;
    html += '<br />';
    html += `Subject: <strong>${email.subject}</strong>`;
    html += '<hr />';
    if (email.attachments.length > 0) {
      html += `Attachments (${email.attachments.length}):`;
      html += '<br />';

      for (const attachment of email.attachments) {
        const href = `${uri.scheme}:/${attachment.name}?${uri.query}`;
        html += `<a href='${href}'>${attachment.name} (${prettyBytes(attachment.size)})</a>`;
        html += '<br />';
      }

      html += '<hr />';
    }

    html += email.html;
    return Buffer.from(html);
  }
}
