# Changelog

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
