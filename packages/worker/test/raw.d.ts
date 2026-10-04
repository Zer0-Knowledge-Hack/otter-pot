declare module "*?raw" {
  const content: string;
  export default content;
}

interface ImportMeta {
  glob(
    pattern: string,
    options: { query: "?raw"; import: "default"; eager: true },
  ): Record<string, string>;
}
