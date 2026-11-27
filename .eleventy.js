import markdownIt from 'markdown-it';
import nunjucks from 'nunjucks';
import njkMarkdown from 'nunjucks-markdown';
import hljs from 'highlight.js';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItAttrs from 'markdown-it-attrs';
import QRCode from 'qrcode';

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
    // Support a Dutch long format for human-friendly month names
    if (format === 'nl-long') {
      try {
        return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
      } catch (e) {
        return date.toString();
      }
    }
    // Use Intl.DateTimeFormat for default nl-NL numeric format
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

  // Enable attribute syntax like `{.class #id key=val}` in Markdown
  md.use(markdownItAttrs);

  md.use(markdownItAnchor, {
    permalink: false,
    permalinkClass: 'direct-link',
    permalinkSymbol: '#'
  });

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

  // Inline SVG QR code, generated at build time so it also ends up in PDF exports
  const qrSvg = (text) => {
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
    let path = '';
    for (let r = 0; r < modules.size; r++) {
      for (let c = 0; c < modules.size; c++) {
        if (modules.get(r, c)) path += `M${c} ${r}h1v1h-1z`;
      }
    }
    const q = 2; // quiet zone
    const size = modules.size + 2 * q;
    return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="${-q} ${-q} ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR-code naar ${text}"><rect x="${-q}" y="${-q}" width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  };
  eleventyConfig.addShortcode("qrcode", qrSvg);

  // Claper (https://claper.maximvdw.be). Results come from its public read-only API and are
  // drawn by js/claper.js in the slide theme. `poll` is a poll id, or "active" for whichever
  // poll is currently open in Claper.
  const claperBase = "https://claper.maximvdw.be";
  const claperAttrs = (code, poll, kind = "poll") =>
    `data-claper-event="${code}" data-claper-kind="${kind}" data-claper-poll="${poll}" data-claper-api="${claperBase}/public-api" data-claper-control="${claperBase}/control"`;
  const claperJoin = (code, size) => {
    const joinUrl = `${claperBase}/e/${code}`;
    return `<div class="claper-join claper-join--${size}">
            <div class="claper-qr">${qrSvg(joinUrl)}</div>
            <p class="claper-join-url">${claperBase.replace(/^https?:\/\//, '')}/e/<strong>${code}</strong></p>
        </div>`;
  };

  // Live slide: big QR code next to the open poll. On the next section js/claper.js keeps the QR
  // code and the open poll small in the corner. Optional `activate`: poll id to open in Claper
  // when this slide is shown (presenter token only).
  eleventyConfig.addShortcode("claperSlide", (code, title = "Doe mee!", activate = null) =>
    `<section class="claper-slide" data-claper-live ${claperAttrs(code, "active")}${activate ? ` data-claper-activate="${activate}"` : ""}>
    <h2>${title}</h2>
    <div class="claper-live">
        ${claperJoin(code, "large")}
        <div class="claper-results" aria-live="polite"></div>
    </div>
</section>`);

  // Results of one specific poll, with a small QR code so people can still vote.
  eleventyConfig.addShortcode("claperPoll", (code, poll, title = "") =>
    `<section class="claper-slide claper-slide--poll" ${claperAttrs(code, poll)}>
    <h2 class="claper-poll-title">${title}</h2>
    <div class="claper-live">
        <div class="claper-results" aria-live="polite"></div>
        ${claperJoin(code, "small")}
    </div>
</section>`);

  // Results of one question of a Claper quiz (`question` is 1-based). The correct answer is marked
  // after one more step (the .claper-reveal fragment), so the room can guess first.
  eleventyConfig.addShortcode("claperQuiz", (code, quiz, question, title = "") =>
    `<section class="claper-slide claper-slide--poll claper-slide--quiz" ${claperAttrs(code, "", "quiz")} data-claper-quiz="${quiz}" data-claper-question="${question}">
    <h2 class="claper-poll-title">${title}</h2>
    <span class="fragment claper-reveal" aria-hidden="true"></span>
    <div class="claper-live">
        <div class="claper-results" aria-live="polite"></div>
        ${claperJoin(code, "small")}
    </div>
</section>`);

  // Wall of the messages the presenter pinned in Claper, with a small QR code to send one.
  eleventyConfig.addShortcode("claperWall", (code, title, intro = "") =>
    `<section class="claper-slide claper-slide--poll claper-slide--wall" ${claperAttrs(code, "", "wall")}>
    <h2>${title}</h2>
    ${intro ? `<p class="claper-wall-intro">${intro}</p>` : ""}
    <div class="claper-live">
        <div class="claper-results" aria-live="polite"></div>
        ${claperJoin(code, "small")}
    </div>
</section>`);

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

  // Copy compiled CSS only (generated from SCSS) and fonts/images/js
  eleventyConfig.addPassthroughCopy({
    "css/*.css": "css"
  });
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("js/vendor");
  eleventyConfig.addPassthroughCopy("**/*.json");
  eleventyConfig.addPassthroughCopy("**/*.js");
  eleventyConfig.addPassthroughCopy("**/*.png");
  eleventyConfig.addPassthroughCopy("**/*.jpg");
  eleventyConfig.addPassthroughCopy("**/*.webp");
  eleventyConfig.addPassthroughCopy("**/*.avif");
  eleventyConfig.addPassthroughCopy("**/*.svg");

  // Watch for changes in SCSS and compiled CSS to trigger reloads
  eleventyConfig.addWatchTarget("css/**/*.scss");
  eleventyConfig.addWatchTarget("css/*.css");

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
