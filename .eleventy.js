import markdownIt from 'markdown-it';

export default function(eleventyConfig) {
  // Markdown-it configuratie
  const markdownItOptions = {
    html: true,
    breaks: true,
    linkify: true
  };
  
  eleventyConfig.setLibrary("md", markdownIt(markdownItOptions));
  
  // Custom markdown filter voor inline markdown in Nunjucks
  eleventyConfig.addFilter("markdown", (content) => {
    const md = markdownIt(markdownItOptions);
    return md.render(content);
  });

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
  eleventyConfig.addPassthroughCopy("2026");
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
