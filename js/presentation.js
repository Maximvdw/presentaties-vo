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
export async function initMermaid(mermaid) {
  const mermaidBlocks = Array.from(document.querySelectorAll('.mermaid'));
  void mermaidBlocks;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'linear',
      fontSize: 12,
      nodeSpacing: 50,
      rankSpacing: 50
    },
    logLevel: 'error'
  });

  try {
    await mermaid.run({
      querySelector: '.mermaid',
    });
  } catch (error) {
    console.error('Mermaid rendering error:', error);
  }

  // Ensure SVG scales within slide area
  document.querySelectorAll('.mermaid svg').forEach(svg => {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  });
  
  // Add pan & zoom to each mermaid diagram
  document.querySelectorAll('.mermaid').forEach(container => {
    const svg = container.querySelector('svg');
    if (!svg) return;
    
    let isPanning = false;
    let startPoint = { x: 0, y: 0 };
    let currentTranslate = { x: 0, y: 0 };
    let scale = 1;
    
    // Ensure SVG has a transform origin for zooming
    svg.style.transformOrigin = '50% 50%';
    svg.style.transform = 'translate(0, 0) scale(1)';
    svg.style.overflow = 'visible';
    
    function updateTransform() {
      svg.style.transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${scale})`;
    }
    
    // Mouse wheel zoom on container
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.3, Math.min(scale * delta, 5));
      
      if (newScale !== scale) {
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Zoom towards mouse position
        const scaleChange = newScale / scale;
        currentTranslate.x = mouseX - (mouseX - currentTranslate.x) * scaleChange;
        currentTranslate.y = mouseY - (mouseY - currentTranslate.y) * scaleChange;
        
        scale = newScale;
        updateTransform();
      }
    }, { passive: false });
    
    // Pan on drag on container
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
    
    // Touch support
    let lastTouchDistance = null;
    let lastTouchCenter = null;
    
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        
        lastTouchCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        startPoint = {
          x: touch.clientX - currentTranslate.x,
          y: touch.clientY - currentTranslate.y
        };
        isPanning = true;
      }
    }, { passive: false });
    
    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && lastTouchDistance) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const touchCenter = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
        
        const scaleChange = distance / lastTouchDistance;
        const newScale = Math.max(0.3, Math.min(scale * scaleChange, 5));
        
        if (newScale !== scale) {
          const rect = container.getBoundingClientRect();
          const centerX = touchCenter.x - rect.left;
          const centerY = touchCenter.y - rect.top;
          
          const scaleRatio = newScale / scale;
          currentTranslate.x = centerX - (centerX - currentTranslate.x) * scaleRatio;
          currentTranslate.y = centerY - (centerY - currentTranslate.y) * scaleRatio;
          
          scale = newScale;
          updateTransform();
        }
        
        lastTouchDistance = distance;
        lastTouchCenter = touchCenter;
      } else if (e.touches.length === 1 && isPanning) {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = container.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        currentTranslate.x = touchX - startPoint.x;
        currentTranslate.y = touchY - startPoint.y;
        updateTransform();
      }
    }, { passive: false });
    
    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        lastTouchDistance = null;
        lastTouchCenter = null;
      }
      if (e.touches.length === 0) {
        isPanning = false;
      }
    });
  });
}
