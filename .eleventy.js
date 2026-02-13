import markdownIt from 'markdown-it';
import nunjucks from 'nunjucks';
import njkMarkdown from 'nunjucks-markdown';

export default async function(eleventyConfig) {
  // Markdown-it configuratie
  const markdownItOptions = {
    html: true,
    breaks: true,
    linkify: true
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

  // Preserve default fence renderer
  const defaultFence = md.renderer.rules.fence || function(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const langName = info ? info.split(/\s+/g)[0] : '';
    return `<pre><code class="${options.langPrefix}${md.utils.escapeHtml(langName)}">` + md.utils.escapeHtml(token.content) + '</code></pre>';
  };

  // Render mermaid fences as <div class="mermaid"> so client-side Mermaid can process them
  md.renderer.rules.fence = function(tokens, idx, options, env, slf) {
    const token = tokens[idx];
    const info = token.info ? token.info.trim() : '';
    const lang = info.split(/\s+/g)[0];
    if (lang === 'mermaid') {
      // Output raw content (don't HTML-escape) so the client-side Mermaid parser
      // receives the original diagram source.
      return `<div class="mermaid">\n${token.content}\n</div>`;
    }
    return defaultFence(tokens, idx, options, env, slf);
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
      return md.render(src);
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
  
  // Copy custom CSS and fonts
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("css");
  
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
