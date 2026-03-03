/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `copy-url` command */
  export type CopyUrl = ExtensionPreferences & {}
  /** Preferences accessible in the `copy-markdown-link` command */
  export type CopyMarkdownLink = ExtensionPreferences & {}
  /** Preferences accessible in the `extract-html` command */
  export type ExtractHtml = ExtensionPreferences & {}
  /** Preferences accessible in the `open-in-atlas` command */
  export type OpenInAtlas = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `copy-url` command */
  export type CopyUrl = {}
  /** Arguments passed to the `copy-markdown-link` command */
  export type CopyMarkdownLink = {}
  /** Arguments passed to the `extract-html` command */
  export type ExtractHtml = {}
  /** Arguments passed to the `open-in-atlas` command */
  export type OpenInAtlas = {}
}

