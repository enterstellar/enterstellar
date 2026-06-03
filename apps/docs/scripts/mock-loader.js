export async function load(url, context, nextLoad) {
  if (url.includes('?collection=') && url.includes('&only=frontmatter')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const frontmatter = {};',
    };
  }

  // Intercept static asset imports from MDX files so Node doesn't trigger ERR_UNKNOWN_FILE_EXTENSION
  if (/\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|css|scss|sass|less)(\?.*)?$/.test(url)) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default "mocked-asset-url";',
    };
  }

  // Intercept complex React node_modules that crash raw Node ESM execution due to CJS/ESM interop faults
  if (url.includes('@fumadocs/story') || url.includes('@ungap/structured-clone') || url.includes('@ungap_structured-clone')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: `
        export default function Mock() { return null; }
        export const parse = () => ({});
        export const stringify = () => "{}";
        export const StoryTemplate = () => null;
        export const VitePreview = () => null;
      `,
    };
  }

  return nextLoad(url, context);
}
