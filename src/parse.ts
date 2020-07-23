import * as vscode from 'vscode';
import * as path from 'path';
import loadEml from './loadEml';
import loadMsg from './loadMsg';

export default async function parse(uri: vscode.Uri) {
  const extension = path.extname(uri.path).substr(1).toLowerCase();
  switch (extension) {
    case 'eml': {
      return loadEml(uri);
    }
    case 'msg': {
      return loadMsg(uri);
    }
    default: {
      throw new Error(`Attempt to obtain email file with invalid extension ${extension}.`);
    }
  }
}
