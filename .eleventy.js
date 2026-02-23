import markdownIt from 'markdown-it';
import nunjucks from 'nunjucks';
import njkMarkdown from 'nunjucks-markdown';
import hljs from 'highlight.js';

import { hljsDefineTurtle } from './scripts/vendor/turtle.js';

export default async function (eleventyConfig) {
  // Add a 'date' filter for Nunjucks (supports 'U' for unix timestamp, 'iso', or custom format)
  eleventyConfig.addFilter('date', function (value, format = 'U') {
    const date = value ? new Date(value) : new Date();
    if (format === 'U') {
      return Math.floor(date.getTime() / 1000);
    }
    if (format === 'iso') {
      return date.toISOString();
    }
    // Use Intl.DateTimeFormat for custom formats (limited)
    // Example: 'nl-NL', { year: 'numeric', month: '2-digit', day: '2-digit' }
    try {
      return new Intl.DateTimeFormat('nl-NL').format(date);
    } catch (e) {
      return date.toString();
    }
  });
  hljs.registerLanguage('turtle', hljsDefineTurtle);

  // Markdown-it configuratie
  const markdownItOptions = {
    html: true,
    breaks: true,
    linkify: true,
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        const highlighted = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        return nunjucks.runtime.markSafe('<pre class="hljs language-' + lang + '">' + highlighted + '</pre>');
      }
      // fallback: plain escaped code
      return '<pre><code>' + md.utils.escapeHtml(str) + '</code></pre>';
    }
  };

  // Create a single markdown-it instance and customize fence rendering
  const md = markdownIt(markdownItOptions);

  // Try to load a markdown-it mermaid plugin if available. This is optional —
  // if the package isn't installed we'll fall back to the custom fence renderer below.
  try {
    const mod = await import('markdown-it-mermaid');
    const mermaidPlugin = mod && (mod.default || mod);
    if (typeof mermaidPlugin === 'function') {
      md.use(mermaidPlugin);
    }
  } catch (e) {
    // plugin not installed — continue with fallback
  }

  // Render mermaid fences as <div class="mermaid"> so client-side Mermaid can process them
  md.renderer.rules.fence = function (tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const lang = info.split(/\s+/g)[0];
    let content = token.content;
    if (lang === 'mermaid') {
      // Look for an options block after the code block, e.g. { verticalAlign: top }
      let verticalAlign = null;
      // Check if the next token is a paragraph with an inline token containing the options
      const nextToken = tokens[idx + 1];
      if (nextToken && nextToken.type === 'paragraph_open') {
        const textToken = tokens[idx + 2];
        if (textToken && textToken.type === 'inline') {
          const match = textToken.content.match(/verticalAlign\s*:\s*(\w+)/i);
          if (match) verticalAlign = match[1].toLowerCase();
          // Hide the options text from rendering by clearing its content and skipping the next tokens
          textToken.content = '';
          textToken.children = [];
        }
      }
      content = md.utils.escapeHtml(content);
      let attr = '';
      if (verticalAlign) {
        attr = ` data-vertical-align=\"${verticalAlign}\"`;
      }
      return `<div class=\"mermaid\"${attr}>\n${content}\n</div>`;
    }
    // Use markdown-it's highlight function for all other code blocks, and mark as safe
    const highlighted = md.options.highlight(content, lang);
    if (typeof nunjucks !== 'undefined' && nunjucks.runtime && nunjucks.runtime.markSafe) {
      return nunjucks.runtime.markSafe(highlighted);
    }
    return highlighted;
  };

  eleventyConfig.setLibrary("md", md);

  // Custom markdown filter voor inline markdown in Nunjucks
  eleventyConfig.addFilter("markdown", (content) => {
    return md.render(content);
  });



  // Setup a Nunjucks environment and register markdown rendering so
  // `{% markdown %}...{% endmarkdown %}` works in Nunjucks templates.
  try {
    const njkEnv = new nunjucks.Environment(new nunjucks.FileSystemLoader("_includes"));
    njkMarkdown.register(njkEnv, (src) => {
      // Mark output as safe to prevent escaping
      return nunjucks.runtime.markSafe(md.render(src));
    });
    eleventyConfig.setLibrary("njk", njkEnv);
  } catch (e) {
    // If nunjucks-markdown isn't available, fall back to default behavior.
  }

  eleventyConfig.addFilter("split", (value, delimiter = "/") => {
    if (typeof value !== "string") {
      return [];
    }
    return value.split(delimiter);
  });

  // Copy reveal.js directory to output
  eleventyConfig.addPassthroughCopy({
    "node_modules/reveal.js/dist": "reveal.js/dist",
    "node_modules/reveal.js/plugin": "reveal.js/plugin",
    "node_modules/mermaid/dist": "js/mermaid"
  });

  // Copy misc files
  eleventyConfig.addPassthroughCopy(".nojekyll");

  // Copy custom CSS and fonts
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("js/vendor");
  eleventyConfig.addPassthroughCopy("**/*.json");
  eleventyConfig.addPassthroughCopy("**/*.js");
  eleventyConfig.addPassthroughCopy("**/*.png");
  eleventyConfig.addPassthroughCopy("**/*.jpg");

  // Watch for changes in CSS
  eleventyConfig.addWatchTarget("css/");

  // Ignore README files
  eleventyConfig.ignores.add("**/README.md");
  eleventyConfig.ignores.add("fonts/.gitkeep");

  // Disable index.html redirect for folder structure
  const disableLiveReload = process.env.ELEVENTY_DISABLE_LIVERELOAD === 'true';
  eleventyConfig.setServerOptions({
    showAllHosts: true,
    liveReload: !disableLiveReload,
  });

  return {
    dir: {
      input: ".",
      output: "_site",
      includes: "_includes",
      layouts: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
}
