import techdoc from "eleventy-plugin-techdoc";

export default function(eleventyConfig) {
  eleventyConfig.addPlugin(techdoc, {
    site: {
      name: "CommandTree",
      url: "https://commandtree.dev",
      description: "One sidebar. Every command in your workspace, one click away.",
      stylesheet: "/assets/css/styles.css",
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

  const faviconLinks = [
    '  <link rel="icon" href="/favicon.ico" sizes="48x48">',
    '  <link rel="icon" href="/assets/images/favicon.svg" type="image/svg+xml">',
    '  <link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">',
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
    const cleaned = content.split("\n").filter(l => !isIconLink(l)).join("\n");
    return cleaned.replace("</head>", faviconLinks + "\n</head>");
  });

  eleventyConfig.addTransform("copyright", function(content) {
    if (!this.page.outputPath?.endsWith(".html")) {
      return content;
    }
    const year = new Date().getFullYear();
    const original = `&copy; ${year} CommandTree`;
    const replacement = `&copy; ${year} <a href="https://www.nimblesite.co">Nimblesite Pty Ltd</a>`;
    return content.replace(original, replacement);
  });

  const blogHeroDefault = [
    '<div class="blog-hero-banner">',
    '  <div class="blog-hero-glow"></div>',
    '  <img src="/assets/images/logo.png" alt="CommandTree logo" class="blog-hero-logo">',
    '  <div class="blog-hero-branches">',
    '    <span class="branch branch-1"></span>',
    '    <span class="branch branch-2"></span>',
    '    <span class="branch branch-3"></span>',
    '  </div>',
    '</div>',
  ].join("\n");

  const blogHeroImages = {
    "/blog/ai-summaries-hover/": '/assets/images/ai-summary-banner.png',
  };

  const makeBanner = (href) => {
    const img = blogHeroImages[href];
    if (!img) { return blogHeroDefault; }
    return '<div class="blog-hero-banner">\n'
      + `  <img src="${img}" alt="Blog post banner" class="blog-hero-screenshot">\n`
      + '</div>';
  };

  const ARTICLE_TAG = '<article class="blog-post">';

  const addBannersToCards = (content) => {
    const parts = content.split(ARTICLE_TAG);
    return parts.map((part, i) => {
      if (i === 0) { return part; }
      const hrefStart = part.indexOf('href="/blog/');
      const hrefEnd = hrefStart >= 0 ? part.indexOf('"', hrefStart + 6) : -1;
      const href = hrefStart >= 0 && hrefEnd >= 0
        ? part.substring(hrefStart + 6, hrefEnd)
        : "";
      return ARTICLE_TAG + "\n" + makeBanner(href) + part;
    }).join("");
  };

  eleventyConfig.addTransform("blogHero", function(content) {
    if (!this.page.outputPath?.endsWith(".html")) {
      return content;
    }
    if (!this.page.url?.startsWith("/blog/")) {
      return content;
    }
    if (this.page.url === "/blog/") {
      return addBannersToCards(content);
    }
    if (content.includes('blog-hero-banner')) {
      return content;
    }
    return content.replace(
      '<div class="blog-post-content">',
      '<div class="blog-post-content">\n' + makeBanner(this.page.url)
    );
  });

  eleventyConfig.addTransform("llmsTxt", function(content) {
    if (!this.page.outputPath?.endsWith("llms.txt")) {
      return content;
    }
    const apiLine = "- API Reference: https://commandtree.dev/api/";
    const extras = [
      "- GitHub: https://github.com/melbournedeveloper/CommandTree",
      "- VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=nimblesite.commandtree",
    ].join("\n");
    return content.replace(apiLine, extras);
  });

  eleventyConfig.addTransform("customScripts", function(content) {
    if (!this.page.outputPath?.endsWith(".html")) {
      return content;
    }
    const customScript = '\n  <script src="/assets/js/custom.js"></script>\n';
    return content.replace("</body>", customScript + "</body>");
  });

  return {
    dir: { input: "src", output: "_site" },
    markdownTemplateEngine: "njk",
  };
}
