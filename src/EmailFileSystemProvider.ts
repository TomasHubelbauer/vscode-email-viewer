import * as vscode from 'vscode';
import * as path from 'path';
import * as prettyBytes from 'pretty-bytes';
import loadEml from './loadEml';
import loadMsg from './loadMsg';

export default class EmailFileSystemProvider implements vscode.FileSystemProvider {
  private emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.emitter.event;

  public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
    // TODO: Report
    return new class {
      dispose() {
      }
    };
  }

  public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    debugger;
    const { name, email, ctime, mtime } = await this.parse(uri);

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

    return { type: vscode.FileType.Unknown, ctime: Date.now(), mtime: Date.now(), size: 0 };
  }

  public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    const { name, email } = await this.parse(uri);

    if (uri.path !== '/') {
      // TODO: Report
      return [];
    }

    return [
      [`${name}.html`, vscode.FileType.File],
      ...email.attachments
        .filter(attachment => attachment.name)
        .map(attachment => [attachment.name, vscode.FileType.File] as [string, vscode.FileType.File]),
    ];
  }

  public createDirectory(_uri: vscode.Uri): void | Thenable<void> {
    // TODO: Report
    debugger;
  }

  public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const { name, email } = await this.parse(uri);

    if (uri.path === `/${name}.html`) {
      return this.preview(email, uri);
    }

    const attachment = email.attachments.find(attachment => '/' + attachment.name === uri.path);
    if (attachment) {
      return attachment.content;
    }

    return Buffer.from([]);
  }

  public writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    // TODO: Report
    debugger;
  }

  public delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
    // TODO: Report
    debugger;
  }

  public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    // TODO: Report
    debugger;
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
        const href = `${uri.scheme}:${attachment.name}?${uri.query}`;
        html += `<a href='${href}'>${attachment.name} (${prettyBytes(attachment.size)})</a>`;
        html += '<br />';
      }

      html += '<hr />';
    }

    html += email.html;
    return Buffer.from(html);
  }

  private async parse({ query }: vscode.Uri): Promise<{ name: string; ctime: number, mtime: number, size: number; email: Email; }> {
    const uri = vscode.Uri.parse(query);
    const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
    const name = path.basename(query);
    const { ctime, mtime, size } = await vscode.workspace.fs.stat(uri);
    const extension = path.extname(query).substr(1).toLowerCase();
    switch (extension) {
      case 'eml': {
        return { name, ctime, mtime, size, email: await loadEml(buffer) };
      }
      case 'msg': {
        return { name, ctime, mtime, size, email: await loadMsg(buffer) };
      }
      default: {
        throw new Error(`Attempt to obtain email file with invalid extension ${extension}.`);
      }
    }
  }
}
