/**
 * TypeScript Declaration File for react-copy-to-clipboard
 *
 * This file provides TypeScript type definitions for the "react-copy-to-clipboard"
 * npm package, which is a React component that allows users to copy text to their
 * clipboard with a single click.
 *
 * Purpose:
 * - Enables TypeScript support for the react-copy-to-clipboard library
 * - Provides type safety when using the CopyToClipboard component
 * - Defines the expected props and their types
 *
 * Usage in this project:
 * - Used in components that need clipboard functionality (e.g., copying addresses,
 *   transaction hashes, or other data to clipboard)
 * - Common in blockchain/Web3 applications for sharing wallet addresses,
 *   transaction IDs, or contract addresses
 *
 * Key interfaces:
 * - Options: Configuration for the copy operation (debug mode, success message)
 * - Props: Component props including text to copy, callback functions, and children
 *
 * The component wraps any child elements and makes them clickable to copy the
 * specified text to the user's clipboard.
 */

declare module "react-copy-to-clipboard" {
  import React from "react";

  interface Options {
    debug: boolean;
    message: string;
  }

  interface Props {
    text: string;
    onCopy?(a: string, b: boolean): void;
    options?: Options;
    children?: ReactNode;
  }

  class CopyToClipboard extends React.Component<Props, object> {}
  export default CopyToClipboard;
}
