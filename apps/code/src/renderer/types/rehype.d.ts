declare module "rehype-raw" {
  import type { Plugin } from "unified";
  const rehypeRaw: Plugin;
  export default rehypeRaw;
}

declare module "rehype-sanitize" {
  import type { Plugin } from "unified";
  import type { Schema } from "hast-util-sanitize";
  const rehypeSanitize: Plugin<[Schema?]>;
  export default rehypeSanitize;
  export const defaultSchema: Schema;
}
