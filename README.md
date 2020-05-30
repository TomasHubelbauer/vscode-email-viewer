# [Email Viewer](https://marketplace.visualstudio.com/items?itemName=TomasHubelbauer.email-viewer)
![Installs](https://vsmarketplacebadge.apphb.com/installs-short/TomasHubelbauer.email-viewer.svg)

VS Code Email Viewer allows you to preview EML and MSG files in a VS Code web
view (virtual document) as well as mounts EML and MSG file as virtual workspace
directories giving you the option of browsing the email attachments.

![screenshot](screenshot.png)

## Changelog

See the [changelog](CHANGELOG.md).

## To-Do

### Solve https://github.com/microsoft/vscode/issues/98873 or use custom editor API

Perhaps the custom editor API (a read only editor) is a better fit than the web
view API, but consider that this will block the user's option to show the actual
email file content then.
