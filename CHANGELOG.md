# Changelog

## `5.0.0` (2020-05-31)

The extension was rewritten to use the VS Code webview API instead of the VS Code
`previewHtml` command which has been deprecated and subsequently removed breaking
the extension before this fix was released.

New instructions on how to use were added to the readme to make it clear there
was no context menu item and the extension worked by listening for email documents
to open. Also documented are instructions on how to close the workspace folders
of the content and attachment virtual file system.

## `4.0.0` (2018-08-24)

- Preserve mounted emails as workspace directories by switching to a static scheme and adding EML and MSG file system activation events
- Preview emails when opened as EML or MSG files or as the index HTML files in EML or MSG workspace mounted directories

## `3.0.0` (2018-08-18)

Add support for loading MSG files to complement the existing EML file loading support.

## `2.0.0` (2018-08-16)

- Fix a bug where emails with attachments would load indefinitely
- Display a list of email's attachments in the email preview pane header area as clickable links that open the attachment in VS Code
  - A command for downloading attachments from the virtual file system onto the disk will be added in the future
- Mount a virtual file system workspace folder for each opened email listing its attachments
  - This will be made configurable in the future

## `1.0.0` (2018-08-11)

An extension for previewing email message files (EML).
