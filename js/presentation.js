/**
 * Custom presentation functionality
 */

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
  // This will be called after each diagram renders
  const setupPanZoom = () => {
    document.querySelectorAll('.mermaid svg').forEach(svg => {
      // Skip if already setup
      if (svg.dataset.panZoomSetup === 'true') return;
      svg.dataset.panZoomSetup = 'true';
      
      const container = svg.closest('.mermaid');
      if (!container) return;
      
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      
      let isPanning = false;
      let startPoint = { x: 0, y: 0 };
      let currentTranslate = { x: 0, y: 0 };
      let scale = 1;
      
      svg.style.transformOrigin = '50% 50%';
      svg.style.transform = 'translate(0, 0) scale(1)';
      svg.style.overflow = 'visible';
      
      function updateTransform() {
        svg.style.transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${scale})`;
      }
      
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(scale * delta, 5));
        
        if (newScale !== scale) {
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          const scaleChange = newScale / scale;
          currentTranslate.x = mouseX - (mouseX - currentTranslate.x) * scaleChange;
          currentTranslate.y = mouseY - (mouseY - currentTranslate.y) * scaleChange;
          
          scale = newScale;
          updateTransform();
        }
      }, { passive: false });
      
      container.addEventListener('mousedown', (e) => {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        isPanning = true;
        startPoint = {
          x: mouseX - currentTranslate.x,
          y: mouseY - currentTranslate.y
        };
        container.style.cursor = 'grabbing';
        e.preventDefault();
      });
      
      document.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        currentTranslate.x = mouseX - startPoint.x;
        currentTranslate.y = mouseY - startPoint.y;
        updateTransform();
      });
      
      const stopPanning = () => {
        isPanning = false;
        container.style.cursor = 'grab';
      };
      
      document.addEventListener('mouseup', stopPanning);
      container.addEventListener('mouseleave', stopPanning);
    });
  };
  
  // Setup pan/zoom initially for any already-rendered diagrams
  setupPanZoom();
  
  // Export the function so it can be called after each slide's diagrams render
  window.setupMermaidPanZoom = setupPanZoom;
}
