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
    document.querySelectorAll('.reveal .slides section.stack').forEach(stack => {
      const parentH2 = stack.querySelector(':scope > section > h2');
      if (!parentH2) return;
      const parentTitle = parentH2.textContent;

      const subsections = stack.querySelectorAll(':scope > section:not(:first-child)');
      subsections.forEach(subsection => {
        const h3 = subsection.querySelector('h3');
        if (h3 && !subsection.querySelector('.parent-title')) {
          const parentTitleEl = document.createElement('div');
          parentTitleEl.className = 'parent-title';
          parentTitleEl.textContent = parentTitle;
          subsection.insertBefore(parentTitleEl, subsection.firstChild);
        }
      });
    });
  });
}

// Initialize Mermaid diagrams with pan & zoom
// Initialize Mermaid configuration and pan/zoom
export async function initMermaid(mermaid) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrors: true,
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: 'linear',
      fontSize: 12,
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
        // Remove width/height attributes and styles to prevent double-scaling
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.style.width = 'auto';
        svg.style.height = 'auto';
      // Skip if already setup
      if (svg.dataset.panZoomSetup === 'true') return;
      svg.dataset.panZoomSetup = 'true';

      const container = svg.closest('.mermaid');
      if (!container) return;

      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');


      // Helper to calculate initial translation and scale
      function getInitialPanZoom() {
        let viewBox = svg.getAttribute('viewBox');
        const [vbX, vbY, vbW, vbH] = viewBox.split(/\s+|,/).map(Number);
        let bbox = svg.getBBox();
        let cWidth = container.offsetWidth || 800;
        let cHeight = container.offsetHeight || 600;
        // Prefer bounding box for scaling/centering if it is valid
        let boxX = bbox && bbox.width > 0 && bbox.height > 0 ? bbox.x : vbX;
        let boxY = bbox && bbox.width > 0 && bbox.height > 0 ? bbox.y : vbY;
        let boxW = bbox && bbox.width > 0 && bbox.height > 0 ? bbox.width : vbW;
        let boxH = bbox && bbox.width > 0 && bbox.height > 0 ? bbox.height : vbH;
        let svgWidth = svg.clientWidth || vbW;
        let svgHeight = svg.clientHeight || vbH;
        let scaleX = 1;
        let scaleY = cHeight / boxH;
        let fitScale = Math.min(scaleX, scaleY, max_scale);
        // Center both horizontally and vertically, accounting for box origin
        let initX = (cWidth - svgWidth * fitScale) / 2;
        let initY = (cHeight - svgHeight * fitScale) / 2;
        return { scale: fitScale, currentTranslate: { x: initX, y: initY } };
      }

      let state = getInitialPanZoom();

      function updateTransform() {
        // Transform origin at top-left for correct math
        svg.style.transformOrigin = '0 0';
        svg.style.transform = `translate(${state.currentTranslate.x}px, ${state.currentTranslate.y}px) scale(${state.scale})`;
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
