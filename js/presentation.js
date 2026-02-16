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
      useMaxWidth: true,
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
        let scaleX = cWidth / (bbox.width || vbW);
        let scaleY = cHeight / (bbox.height || vbH);
        let fitScale = Math.max(Math.min(scaleX, scaleY, max_scale), 1);
        let initX = (cWidth - bbox.width) / 2 - bbox.x;
        let initY = (cHeight - bbox.height) / 2 - bbox.y;
        if (initX < 0) {
          initX = 0;
          initY = initY - vbH / 2;
        } else {
          initY = 0;
        }
        
        console.log('Initial pan/zoom:', { fitScale, initX, initY });
        return { scale: fitScale, currentTranslate: { x: initX, y: initY } };
      }

      let state = getInitialPanZoom();

      function updateTransform() {
        svg.style.transform = `scale(${state.scale}) translate(${state.currentTranslate.x / state.scale}px, ${state.currentTranslate.y}px)`;
      }
      updateTransform();

      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(state.scale * delta, max_scale));

        if (newScale !== state.scale) {
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const scaleChange = newScale / state.scale;
          state.currentTranslate.x = mouseX - (mouseX - state.currentTranslate.x) * scaleChange;
          state.currentTranslate.y = mouseY - (mouseY - state.currentTranslate.y) * scaleChange;

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
