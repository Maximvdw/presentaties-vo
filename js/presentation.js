/**
 * Custom presentation functionality
 */

const max_scale = 5; // Maximum zoom level

// Initialize presentation features after Reveal.js is ready
export function initPresentation({ initialize }) {
  const revealRoot = document.querySelector('.reveal');

  // Get initial slide based on URL hash
  const getInitialSlide = () => {
    const hash = window.location.hash || '';
    const match = hash.match(/^#\/([0-9]+)(?:\/([0-9]+))?/);
    const hIndex = match ? Number(match[1]) : 0;
    const vIndex = match && match[2] ? Number(match[2]) : 0;
    const horizontal = Array.from(document.querySelectorAll('.reveal .slides > section'));
    const hSlide = horizontal[hIndex] || horizontal[0];
    if (!hSlide) {
      return null;
    }
    const vertical = Array.from(hSlide.querySelectorAll(':scope > section'));
    if (vertical.length > 0) {
      return vertical[vIndex] || vertical[0];
    }
    return hSlide;
  };

  const initialSlide = getInitialSlide();
  if (revealRoot && initialSlide && initialSlide.classList.contains('title-slide')) {
    revealRoot.classList.add('is-title-slide');
  }

  initialize().then(() => {
    const Reveal = window.Reveal;
    const updateTitleClass = () => {
      const current = Reveal.getCurrentSlide();
      const isTitle = current && current.classList.contains('title-slide');
      revealRoot.classList.toggle('is-title-slide', isTitle);
    };
    Reveal.on('ready', updateTitleClass);
    Reveal.on('slidechanged', updateTitleClass);

    // Add parent section title to vertical subsections
    document.querySelectorAll('.reveal .slides section').forEach(stack => {
      const parentH2 = stack.querySelector(':scope > section > h2');
      const parentTitle = parentH2?.textContent;

      const subsections = stack.querySelectorAll(':scope > section');
      if (subsections.length === 0) {
        const h2 = stack.querySelector('h2');
        const h3 = stack.querySelector('h3');
        if (h2 && h3 && !stack.querySelector('.parent-title')) {
          // Set h2 as parent title
          const parentTitleEl = document.createElement('div');
          parentTitleEl.className = 'parent-title';
          parentTitleEl.textContent = h2.textContent;
          stack.insertBefore(parentTitleEl, stack.firstChild);
          h2.style.display = 'none';
        }
      } else {
        subsections.forEach(subsection => {
          const h2 = subsection.querySelector('h2');
          const h3 = subsection.querySelector('h3');
          if (h2 && h3 && !subsection.querySelector('.parent-title')) {
            // Set h2 as parent title
            const parentTitleEl = document.createElement('div');
            parentTitleEl.className = 'parent-title';
            parentTitleEl.textContent = h2.textContent;
            subsection.insertBefore(parentTitleEl, subsection.firstChild);
            h2.style.display = 'none';
          } else if (h3 && !subsection.querySelector('.parent-title')) {
            const parentTitleEl = document.createElement('div');
            parentTitleEl.className = 'parent-title';
            parentTitleEl.textContent = parentTitle;
            subsection.insertBefore(parentTitleEl, subsection.firstChild);
          }
        });
      }
    });
  });
}

// Initialize Mermaid configuration and pan/zoom
export async function initMermaid(mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrors: true,
    theme: 'default',
    themeVariables: {
      fontSize: '16px',
      fontFamily: 'Flanders Art Sans, Arial, sans-serif'
    },
    flowchart: {
      htmlLabels: false,
      curve: 'linear',
      diagramMarginX: 0,
      diagramMarginY: 0,
      padding: 0,
      minEdgeLength: 10,
      rankSpacing: 20,
      nodeSpacing: 20
    },
    logLevel: 'error'
  });

  // Setup pan & zoom for all mermaid containers (even before rendering)
  // Dit wordt na elke diagram-render aangeroepen

  const setupPanZoom = () => {
    document.querySelectorAll('.mermaid svg').forEach(svg => {
      // Skip if already setup
      if (svg.dataset.panZoomSetup === 'true') return;
      svg.dataset.panZoomSetup = 'true';
      
      const container = svg.closest('.mermaid');svg.closest('.mermaid');
      if (!container) return;

      // Determine vertical alignment option (default: center)
      let verticalAlign = 'center';
      // Look for a data attribute on the container, e.g. data-vertical-align="top"
      if (container.dataset.verticalAlign) {
        verticalAlign = container.dataset.verticalAlign;
      } else {
        // Try to find a sibling element with a class 'mermaid-options' and parse for verticalAlign
        const optionsEl = container.nextElementSibling && container.nextElementSibling.classList.contains('mermaid-options') ? container.nextElementSibling : null;
        if (optionsEl) {
          const match = optionsEl.textContent.match(/verticalAlign\s*:\s*(\w+)/i);
          if (match) verticalAlign = match[1].toLowerCase();
          // Remove the options element after parsing
          optionsEl.remove();
        }
      }

      // Helper to calculate initial translation and scale
      function getInitialPanZoom() {
        let cWidth = container.offsetWidth || 800;
        let cHeight = container.offsetHeight || 600;
        // Get the actual width and height of the container
        let containerRect = container.getBoundingClientRect();
        let svgWidth = svg.clientWidth;
        let svgHeight = svg.clientHeight;
        let scaleX = cWidth / svgWidth;
        let scaleY = cHeight / svgHeight;
        let fitScale = Math.min(scaleX, scaleY, max_scale);
        // Center horizontally, vertical alignment configurable
        let initX = (cWidth - svgWidth * fitScale) / 2;
        let initY;
        if (verticalAlign === 'top') {
          initY = 0;
        } else {
          // Default: center
          initY = (cHeight - svgHeight * fitScale) / 2;
        }
        // Determine font scaling using the containerRect
        let fontScale = 1 / (cWidth / Math.min(containerRect.width, cWidth));
        console.log(containerRect.width, cWidth, 'Font scale:', fontScale);
        return { scale: fitScale, currentTranslate: { x: initX, y: initY }, fontScale };
      }

      let state = getInitialPanZoom();

      function updateTransform() {
        // Transform origin at top-left for correct math
        svg.style.transformOrigin = '0 0';
        svg.style.transform = `translate(${state.currentTranslate.x}px, ${state.currentTranslate.y}px) scale(${state.scale})`;
        // Scale fonts separately to maintain readability
        const fontSizePercentage = state.fontScale;
        svg.querySelectorAll('foreignObject div').forEach(el => {
          // Change font size based on the initial font size and the current font scale
          const initialFontSize = parseFloat(getComputedStyle(el).fontSize);
          el.style.fontSize = `${initialFontSize * fontSizePercentage}px`;
        });
      }
      updateTransform();

      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(state.scale * delta, max_scale));

        if (newScale !== state.scale) {
          // Adjust translation so zoom is centered on the container center
          const centerX = container.offsetWidth / 2;
          const centerY = container.offsetHeight / 2;
          state.currentTranslate.x = (state.currentTranslate.x - centerX) * (newScale / state.scale) + centerX;
          state.currentTranslate.y = (state.currentTranslate.y - centerY) * (newScale / state.scale) + centerY;

          state.scale = newScale;
          updateTransform();
        }
      }, { passive: false });

      container.addEventListener('mousedown', (e) => {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.isPanning = true;
        state.startPoint = {
          x: mouseX - state.currentTranslate.x,
          y: mouseY - state.currentTranslate.y
        };
        container.style.cursor = 'grabbing';
        e.preventDefault();
      });

      // Enable panning by dragging on either the SVG or the container
      // Only allow panning when dragging the SVG, not the container (so scrollbars work)
      // Add pan/zoom controls in the top-right corner
      if (!container.querySelector('.mermaid-controls')) {
        const controls = document.createElement('div');
        controls.className = 'mermaid-controls';

        // Zoom in
        const zoomIn = document.createElement('button');
        zoomIn.innerHTML = '＋';
        zoomIn.title = 'Zoom in';
        zoomIn.onclick = () => {
          state.scale = Math.min(state.scale * 1.2, max_scale);
          updateTransform();
        };
        controls.appendChild(zoomIn);

        // Zoom out
        const zoomOut = document.createElement('button');
        zoomOut.innerHTML = '－';
        zoomOut.title = 'Zoom out';
        zoomOut.onclick = () => {
          state.scale = Math.max(state.scale * 0.8, 0.3);
          updateTransform();
        };
        controls.appendChild(zoomOut);

        // Reset
        const reset = document.createElement('button');
        reset.innerHTML = '⟳';
        reset.title = 'Reset pan/zoom';
        reset.onclick = () => {
          state = getInitialPanZoom();
          updateTransform();
        };
        controls.appendChild(reset);

        container.appendChild(controls);
      }
      svg.addEventListener('mousedown', (e) => {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        state.isPanning = true;
        state.startPoint = {
          x: mouseX - state.currentTranslate.x,
          y: mouseY - state.currentTranslate.y
        };
        container.style.cursor = 'grabbing';
        e.preventDefault();
      });

      function doPan(e) {
        if (!state.isPanning) return;
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        state.currentTranslate.x = mouseX - state.startPoint.x;
        state.currentTranslate.y = mouseY - state.startPoint.y;
        window.requestAnimationFrame(updateTransform);
      }
      window.addEventListener('mousemove', doPan);

      function stopPanning() {
        state.isPanning = false;
        container.style.cursor = 'grab';
      }
      window.addEventListener('mouseup', stopPanning);
      container.addEventListener('mouseleave', stopPanning);
    });
  }
  // Maak setupPanZoom globaal beschikbaar zodat deze na rendering kan worden aangeroepen
  window.setupMermaidPanZoom = setupPanZoom;
}
