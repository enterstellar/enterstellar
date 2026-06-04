import { register } from "node:module";
import { pathToFileURL } from "node:url";

// Register core mdx node loader first
register("fumadocs-mdx/node/loader", pathToFileURL("./").href);

// Register custom interceptor module for static assets and metadata fragments
register(pathToFileURL("./scripts/mock-loader.js").href);
