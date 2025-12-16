// js/compositor/renderer.js
// SVG-based page renderer for book compositor

import { FRAME_SHAPES, FONT_FAMILIES, getTemplate } from './templates.js';

/**
 * PageRenderer - Renders a single book page as SVG
 * 
 * This is the core rendering engine that takes:
 * - Page data (text, image URL)
 * - Template configuration
 * - Custom overrides
 * 
 * And produces an SVG element that can be:
 * - Displayed in the browser for preview
 * - Converted to PNG/PDF for export
 */

// Standard book page dimensions (in pixels at 72dpi)
export const PAGE_DIMENSIONS = {
  // Common children's book sizes
  'square-small': { width: 504, height: 504, name: '7" × 7"' },
  'square-medium': { width: 576, height: 576, name: '8" × 8"' },
  'square-large': { width: 720, height: 720, name: '10" × 10"' },
  'portrait': { width: 504, height: 648, name: '7" × 9"' },
  'landscape': { width: 720, height: 504, name: '10" × 7"' },
  'standard': { width: 612, height: 792, name: '8.5" × 11"' },
};

export class PageRenderer {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 'square-medium';
    this.dimensions = PAGE_DIMENSIONS[this.pageSize];
    this.dpi = options.dpi || 72;
    this.fontsLoaded = new Set();
  }

  /**
   * Render a single page
   * @param {Object} pageData - { page: number, text: string, imageUrl: string }
   * @param {string|Object} template - Template ID or template object
   * @param {Object} overrides - Custom overrides for this page
   * @returns {SVGElement} - The rendered SVG element
   */
  render(pageData, template, overrides = {}) {
    const tmpl = typeof template === 'string' ? getTemplate(template) : template;
    const config = this.mergeConfig(tmpl, overrides);
    
    const { width, height } = this.dimensions;
    
    // Create SVG element
    const svg = this.createSvgElement(width, height);
    
    // Build the page
    this.renderBackground(svg, config, width, height);
    this.renderImage(svg, pageData.imageUrl, config, width, height);
    this.renderText(svg, pageData.text, config, width, height);
    this.renderPageNumber(svg, pageData.page, config, width, height);
    this.renderEffects(svg, config, width, height);
    
    return svg;
  }

  /**
   * Render to a container element for preview
   */
  renderToContainer(container, pageData, template, overrides = {}) {
    const svg = this.render(pageData, template, overrides);
    container.innerHTML = '';
    container.appendChild(svg);
    return svg;
  }

  /**
   * Render multiple pages (for book preview)
   */
  renderBook(pages, template, overrides = {}) {
    return pages.map(page => this.render(page, template, overrides));
  }

  /**
   * Get SVG as string (for export)
   */
  renderToString(pageData, template, overrides = {}) {
    const svg = this.render(pageData, template, overrides);
    const serializer = new XMLSerializer();
    return serializer.serializeToString(svg);
  }

  // =============================================
  // PRIVATE RENDERING METHODS
  // =============================================

  createSvgElement(width, height) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    return svg;
  }

  renderBackground(svg, config, width, height) {
    const bgColor = config.colors?.background || '#FFFFFF';
    
    // Main background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('x', '0');
    bg.setAttribute('y', '0');
    bg.setAttribute('width', width);
    bg.setAttribute('height', height);
    bg.setAttribute('fill', bgColor);
    svg.appendChild(bg);

    // Decorative border if enabled
    if (config.effects?.decorativeBorder) {
      this.renderDecorativeBorder(svg, config, width, height);
    }
  }

  renderDecorativeBorder(svg, config, width, height) {
    const borderColor = config.colors?.accent || '#8B6914';
    const borderWidth = 8;
    const margin = 20;
    
    const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    border.setAttribute('x', margin);
    border.setAttribute('y', margin);
    border.setAttribute('width', width - margin * 2);
    border.setAttribute('height', height - margin * 2);
    border.setAttribute('fill', 'none');
    border.setAttribute('stroke', borderColor);
    border.setAttribute('stroke-width', borderWidth);
    border.setAttribute('rx', '12');
    border.setAttribute('opacity', '0.3');
    svg.appendChild(border);
  }

  renderImage(svg, imageUrl, config, pageWidth, pageHeight) {
    if (!imageUrl) return;

    const imgConfig = config.layout?.image || {};
    const position = imgConfig.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
    const frameType = imgConfig.frame || 'rectangle';
    const padding = imgConfig.padding || 0;

    // Calculate actual pixel positions
    const x = position.x * pageWidth;
    const y = position.y * pageHeight;
    const w = position.width * pageWidth;
    const h = position.height * pageHeight;

    // Apply padding
    const paddedX = x + (padding * pageWidth);
    const paddedY = y + (padding * pageHeight);
    const paddedW = w - (padding * pageWidth * 2);
    const paddedH = h - (padding * pageHeight * 2);

    // Create clip path group
    const clipId = `image-clip-${Date.now()}`;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    
    // Create clip path
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', clipId);
    
    // Get frame shape
    const frameShape = FRAME_SHAPES[frameType];
    if (frameShape) {
      const shapeSvg = frameShape.svg(paddedW, paddedH);
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${paddedX}, ${paddedY})`);
      g.innerHTML = shapeSvg;
      clipPath.appendChild(g);
    }
    
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    // Create image element
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', paddedX);
    image.setAttribute('y', paddedY);
    image.setAttribute('width', paddedW);
    image.setAttribute('height', paddedH);
    image.setAttribute('href', imageUrl);
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    image.setAttribute('clip-path', `url(#${clipId})`);

    // Add drop shadow if enabled
    if (config.effects?.imageDropShadow) {
      const filterId = `shadow-${Date.now()}`;
      const filter = this.createDropShadowFilter(filterId);
      defs.appendChild(filter);
      image.setAttribute('filter', `url(#${filterId})`);
    }

    svg.appendChild(image);

    // Add border if configured
    if (imgConfig.border) {
      this.renderImageBorder(svg, paddedX, paddedY, paddedW, paddedH, frameType, imgConfig.border, config);
    }
  }

  renderImageBorder(svg, x, y, w, h, frameType, borderConfig, config) {
    const borderColor = borderConfig.color === 'accent' 
      ? (config.colors?.accent || '#333') 
      : borderConfig.color;
    const borderWidth = borderConfig.width || 2;

    const frameShape = FRAME_SHAPES[frameType];
    if (frameShape) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${x}, ${y})`);
      g.innerHTML = frameShape.svg(w, h);
      
      const path = g.querySelector('path, rect, circle, ellipse');
      if (path) {
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', borderColor);
        path.setAttribute('stroke-width', borderWidth);
      }
      
      svg.appendChild(g);
    }
  }

  renderText(svg, text, config, pageWidth, pageHeight) {
    if (!text) return;

    const textConfig = config.layout?.text || {};
    const typography = config.typography || {};
    const position = textConfig.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };

    // Calculate text area
    const x = position.x * pageWidth;
    const y = position.y * pageHeight;
    const w = position.width * pageWidth;
    const h = position.height * pageHeight;

    // Handle text background
    if (textConfig.background) {
      this.renderTextBackground(svg, x, y, w, h, textConfig);
    }

    // Calculate font size with auto-scaling
    const baseFontSize = typography.baseFontSize || 18;
    const scaledFontSize = this.calculateScaledFontSize(text, w, h, baseFontSize, typography);

    // Create text element
    const textGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    
    // Word wrap and create text lines
    const lines = this.wrapText(text, w, scaledFontSize, typography.fontFamily);
    const lineHeight = scaledFontSize * (typography.lineHeight || 1.5);
    const totalTextHeight = lines.length * lineHeight;

    // Calculate vertical position based on alignment
    let startY = y;
    if (textConfig.verticalAlign === 'center') {
      startY = y + (h - totalTextHeight) / 2 + scaledFontSize;
    } else if (textConfig.verticalAlign === 'bottom') {
      startY = y + h - totalTextHeight + scaledFontSize;
    } else {
      startY = y + scaledFontSize + 10;
    }

    // Calculate horizontal alignment
    let textAnchor = 'middle';
    let textX = x + w / 2;
    if (textConfig.align === 'left') {
      textAnchor = 'start';
      textX = x + 10;
    } else if (textConfig.align === 'right') {
      textAnchor = 'end';
      textX = x + w - 10;
    }

    // Render each line
    lines.forEach((line, i) => {
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', textX);
      textEl.setAttribute('y', startY + i * lineHeight);
      textEl.setAttribute('font-family', `"${typography.fontFamily}", sans-serif`);
      textEl.setAttribute('font-size', scaledFontSize);
      textEl.setAttribute('font-weight', typography.fontWeight || '400');
      textEl.setAttribute('fill', config.colors?.text || '#333333');
      textEl.setAttribute('text-anchor', textAnchor);
      textEl.textContent = line;

      // Add text shadow if enabled
      if (config.effects?.textShadow) {
        textEl.setAttribute('style', 'text-shadow: 2px 2px 4px rgba(0,0,0,0.3)');
      }

      textGroup.appendChild(textEl);
    });

    svg.appendChild(textGroup);
  }

  renderTextBackground(svg, x, y, w, h, textConfig) {
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    
    const padding = textConfig.padding || { x: 0.02, y: 0.01 };
    const pxPaddingX = padding.x * this.dimensions.width;
    const pxPaddingY = padding.y * this.dimensions.height;
    
    bg.setAttribute('x', x - pxPaddingX);
    bg.setAttribute('y', y - pxPaddingY);
    bg.setAttribute('width', w + pxPaddingX * 2);
    bg.setAttribute('height', h + pxPaddingY * 2);
    bg.setAttribute('fill', textConfig.background);
    bg.setAttribute('rx', textConfig.borderRadius || 8);
    svg.appendChild(bg);
  }

  renderPageNumber(svg, pageNum, config, pageWidth, pageHeight) {
    if (!pageNum || config.hidePageNumbers) return;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', pageWidth / 2);
    text.setAttribute('y', pageHeight - 20);
    text.setAttribute('font-family', `"${config.typography?.fontFamily || 'Georgia'}", serif`);
    text.setAttribute('font-size', '12');
    text.setAttribute('fill', config.colors?.text || '#666666');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('opacity', '0.6');
    text.textContent = String(pageNum);
    svg.appendChild(text);
  }

  renderEffects(svg, config, width, height) {
    // Page shadow effect (for preview)
    if (config.effects?.pageShadow) {
      // This is handled by CSS in the container
    }

    // Glow effect for night theme
    if (config.effects?.glowEffect) {
      const defs = svg.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      if (!svg.querySelector('defs')) svg.insertBefore(defs, svg.firstChild);
      
      const glowId = `glow-${Date.now()}`;
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      glow.setAttribute('id', glowId);
      glow.innerHTML = `
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      `;
      defs.appendChild(glow);
    }
  }

  // =============================================
  // HELPER METHODS
  // =============================================

  createDropShadowFilter(id) {
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');
    filter.innerHTML = `
      <feDropShadow dx="4" dy="4" stdDeviation="6" flood-opacity="0.25"/>
    `;
    return filter;
  }

  /**
   * Auto-scale font size to fit text in available area
   */
  calculateScaledFontSize(text, maxWidth, maxHeight, baseFontSize, typography) {
    // Start with base font size
    let fontSize = baseFontSize;
    const lineHeight = typography.lineHeight || 1.5;
    const minFontSize = 12;
    const maxFontSize = baseFontSize * 1.5;

    // Estimate characters per line at base font size
    const avgCharWidth = baseFontSize * 0.5;
    const charsPerLine = Math.floor(maxWidth / avgCharWidth);
    
    // Estimate number of lines needed
    const words = text.split(/\s+/);
    let lines = 1;
    let currentLineLength = 0;
    
    for (const word of words) {
      if (currentLineLength + word.length > charsPerLine) {
        lines++;
        currentLineLength = word.length;
      } else {
        currentLineLength += word.length + 1;
      }
    }

    // Calculate if text fits
    const textHeight = lines * fontSize * lineHeight;
    
    if (textHeight > maxHeight) {
      // Scale down
      const scaleFactor = maxHeight / textHeight;
      fontSize = Math.max(minFontSize, fontSize * scaleFactor * 0.9);
    } else if (textHeight < maxHeight * 0.5 && lines <= 3) {
      // Scale up for short text
      const scaleFactor = Math.min(1.3, maxHeight / textHeight * 0.7);
      fontSize = Math.min(maxFontSize, fontSize * scaleFactor);
    }

    return Math.round(fontSize);
  }

  /**
   * Word wrap text to fit width
   */
  wrapText(text, maxWidth, fontSize, fontFamily) {
    const words = text.split(/\s+/);
    const lines = [];
    let currentLine = '';
    
    // Estimate average character width
    const avgCharWidth = fontSize * 0.5;
    const maxChars = Math.floor(maxWidth / avgCharWidth);

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length > maxChars && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  mergeConfig(template, overrides) {
    // Deep merge template with overrides
    const result = JSON.parse(JSON.stringify(template));
    
    for (const key in overrides) {
      if (overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
        result[key] = { ...result[key], ...overrides[key] };
      } else if (overrides[key] !== undefined) {
        result[key] = overrides[key];
      }
    }
    
    return result;
  }

  /**
   * Preload fonts needed for rendering
   */
  async preloadFonts(fontFamilies) {
    const fontsToLoad = fontFamilies.filter(f => {
      const fontConfig = FONT_FAMILIES[f];
      return fontConfig?.googleFont && !this.fontsLoaded.has(f);
    });

    if (fontsToLoad.length === 0) return;

    // Build Google Fonts URL
    const families = fontsToLoad.map(f => {
      const config = FONT_FAMILIES[f];
      return `${f.replace(/ /g, '+')}:wght@${config.weight}`;
    }).join('&family=');

    const link = document.createElement('link');
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Wait for fonts to load
    await document.fonts.ready;
    
    fontsToLoad.forEach(f => this.fontsLoaded.add(f));
  }
}

// Export singleton instance
export const pageRenderer = new PageRenderer();