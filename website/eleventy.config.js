import techdoc from "eleventy-plugin-techdoc";

export default function(eleventyConfig) {
  const pathPrefix = process.env.PATH_PREFIX || "/";

  eleventyConfig.addPlugin(techdoc, {
    site: {
      name: "CommandTree",
      url: "https://commandtree.dev",
      description: "One sidebar. Every command in your workspace.",
    },
    features: {
      blog: true,
      docs: true,
      darkMode: true,
      i18n: false,
    },
  });

  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({ "src/favicon.ico": "favicon.ico" });

  // Override any favicon/icon links from plugins, then inject ours
  const prefix = pathPrefix.endsWith("/") ? pathPrefix : pathPrefix + "/";
  const faviconLinks = [
    `  <link rel="icon" href="${prefix}favicon.ico" sizes="48x48">`,
    `  <link rel="icon" href="${prefix}assets/images/favicon.svg" type="image/svg+xml">`,
    `  <link rel="apple-touch-icon" href="${prefix}assets/images/apple-touch-icon.png">`,
  ].join("\n");

  const isIconLink = (line) => {
    const t = line.trim();
    if (!t.startsWith("<link")) return false;
    return t.includes('rel="icon"')
      || t.includes("rel='icon'")
      || t.includes('rel="shortcut icon"')
      || t.includes("rel='shortcut icon'")
      || t.includes('rel="apple-touch-icon"')
      || t.includes("rel='apple-touch-icon'");
  };

  eleventyConfig.addTransform("favicon", function(content) {
    if (!this.page.outputPath?.endsWith(".html")) {
      return content;
    }
    // Strip any existing icon links (e.g. from techdoc plugin)
    const cleaned = content.split("\n").filter(l => !isIconLink(l)).join("\n");
    // Inject our favicon links
    return cleaned.replace("</head>", faviconLinks + "\n</head>");
  });

  // Rewrite absolute paths for GitHub Pages subpath deployment
  // The techdoc plugin emits hardcoded absolute paths that need the prefix
  if (prefix !== "/") {
    const rewrites = [
      ['href="/techdoc/', `href="${prefix}techdoc/`],
      ['src="/techdoc/', `src="${prefix}techdoc/`],
      ['href="/assets/', `href="${prefix}assets/`],
      ['src="/assets/', `src="${prefix}assets/`],
      ['href="/docs/', `href="${prefix}docs/`],
      ['href="/blog/', `href="${prefix}blog/`],
      ['href="/feed.xml"', `href="${prefix}feed.xml"`],
      ['href="/"', `href="${prefix}"`],
    ];
    eleventyConfig.addTransform("pathprefix", function(content) {
      if (!this.page.outputPath?.endsWith(".html")) {
        return content;
      }
      let result = content;
      for (const [from, to] of rewrites) {
        result = result.replaceAll(from, to);
      }
      return result;
    });
  }

  return {
    dir: { input: "src", output: "_site" },
    pathPrefix,
    markdownTemplateEngine: "njk",
  };
}
