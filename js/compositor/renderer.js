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

// Image cache for data URLs
const imageCache = new Map();

export class PageRenderer {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 'square-medium';
    this.dimensions = PAGE_DIMENSIONS[this.pageSize];
    this.dpi = options.dpi || 72;
    this.fontsLoaded = new Set();
    this.clipIdCounter = 0;
  }

  /**
   * Generate unique ID for clip paths to avoid collisions
   */
  generateUniqueId(prefix = 'clip') {
    return `${prefix}-${Date.now()}-${++this.clipIdCounter}`;
  }

  /**
   * Convert external image URL to data URL for reliable SVG embedding
   * This solves CORS issues and ensures images render properly
   */
  async loadImageAsDataUrl(url) {
    console.log('[Renderer] loadImageAsDataUrl called with:', url ? url.substring(0, 80) + '...' : 'null');
    
    if (!url) {
      console.log('[Renderer] No URL provided, returning null');
      return null;
    }
    
    // Return cached version
    if (imageCache.has(url)) {
      console.log('[Renderer] Returning cached data URL');
      return imageCache.get(url);
    }
    
    // Already a data URL
    if (url.startsWith('data:')) {
      console.log('[Renderer] Already a data URL, returning as-is');
      return url;
    }

    console.log('[Renderer] Loading image from URL...');
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        console.log('[Renderer] Image loaded successfully, dimensions:', img.naturalWidth, 'x', img.naturalHeight);
        try {
          // Draw to canvas and convert to data URL
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          console.log('[Renderer] Converted to data URL, length:', dataUrl.length);
          imageCache.set(url, dataUrl);
          resolve(dataUrl);
        } catch (err) {
          // CORS error on canvas - fall back to original URL
          console.warn('[Renderer] Canvas tainted, using original URL:', err.message);
          resolve(url);
        }
      };
      
      img.onerror = (err) => {
        console.warn('[Renderer] Image load failed:', err);
        console.log('[Renderer] Falling back to original URL');
        resolve(url);
      };
      
      img.src = url;
    });
  }

  /**
   * Render a single page (ASYNC version - converts images to data URLs)
   * @param {Object} pageData - { page: number, text: string, imageUrl: string }
   * @param {string|Object} template - Template ID or template object
   * @param {Object} overrides - Custom overrides for this page
   * @returns {Promise<SVGElement>} - The rendered SVG element
   */
  async render(pageData, template, overrides = {}) {
    console.log('[Renderer] render() called for page:', pageData.page);
    console.log('[Renderer] pageData.imageUrl:', pageData.imageUrl ? 'present' : 'missing');
    
    const tmpl = typeof template === 'string' ? getTemplate(template) : template;
    const config = this.mergeConfig(tmpl, overrides);
    
    const { width, height } = this.dimensions;
    console.log('[Renderer] Page dimensions:', width, 'x', height);
    
    // Create SVG element
    const svg = this.createSvgElement(width, height);
    
    // Build the page
    this.renderBackground(svg, config, width, height);
    
    // Convert image to data URL before rendering
    let imageUrl = pageData.imageUrl;
    if (imageUrl) {
      console.log('[Renderer] Converting image to data URL...');
      imageUrl = await this.loadImageAsDataUrl(imageUrl);
      console.log('[Renderer] Image URL after conversion:', imageUrl ? imageUrl.substring(0, 50) + '...' : 'null');
    } else {
      console.log('[Renderer] No imageUrl in pageData, skipping image');
    }
    
    this.renderImage(svg, imageUrl, config, width, height);
    this.renderText(svg, pageData.text, config, width, height);
    this.renderPageNumber(svg, pageData.page, config, width, height);
    this.renderEffects(svg, config, width, height);
    
    console.log('[Renderer] render() complete');
    return svg;
  }

  /**
   * Synchronous render (uses URL directly - may not work with CORS)
   * Use this only when you know the images are same-origin or data URLs
   */
  renderSync(pageData, template, overrides = {}) {
    const tmpl = typeof template === 'string' ? getTemplate(template) : template;
    const config = this.mergeConfig(tmpl, overrides);
    
    const { width, height } = this.dimensions;
    
    const svg = this.createSvgElement(width, height);
    
    this.renderBackground(svg, config, width, height);
    this.renderImage(svg, pageData.imageUrl, config, width, height);
    this.renderText(svg, pageData.text, config, width, height);
    this.renderPageNumber(svg, pageData.page, config, width, height);
    this.renderEffects(svg, config, width, height);
    
    return svg;
  }

  /**
   * Render to a container element for preview (ASYNC)
   */
  async renderToContainer(container, pageData, template, overrides = {}) {
    const svg = await this.render(pageData, template, overrides);
    container.innerHTML = '';
    container.appendChild(svg);
    return svg;
  }

  /**
   * Render multiple pages (for book preview)
   */
  async renderBook(pages, template, overrides = {}) {
    const results = [];
    for (const page of pages) {
      const svg = await this.render(page, template, overrides);
      results.push(svg);
    }
    return results;
  }

  /**
   * Get SVG as string (for export)
   */
  async renderToString(pageData, template, overrides = {}) {
    const svg = await this.render(pageData, template, overrides);
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
    console.log('[Renderer] renderImage() called');
    console.log('[Renderer] imageUrl:', imageUrl ? imageUrl.substring(0, 50) + '...' : 'null/undefined');
    
    if (!imageUrl) {
      console.log('[Renderer] No imageUrl, returning early');
      return;
    }

    const imgConfig = config.layout?.image || {};
    const position = imgConfig.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
    const frameType = imgConfig.frame || 'rectangle';
    const padding = imgConfig.padding || 0;

    // Get crop settings (per-page zoom/pan within image)
    const cropSettings = config.cropSettings || { zoom: 1.0, x: 0.5, y: 0.5 };
    const showCropOverlay = config.showCropOverlay === true;

    console.log('[Renderer] Image config:', { frameType, padding, position, cropSettings, showCropOverlay });

    // Calculate actual pixel positions for the FRAME
    const x = position.x * pageWidth;
    const y = position.y * pageHeight;
    const w = position.width * pageWidth;
    const h = position.height * pageHeight;

    // Apply padding
    const paddedX = x + (padding * pageWidth);
    const paddedY = y + (padding * pageHeight);
    const paddedW = w - (padding * pageWidth * 2);
    const paddedH = h - (padding * pageHeight * 2);

    console.log('[Renderer] Frame position:', { paddedX, paddedY, paddedW, paddedH });

    // Get or create defs
    let defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    // Create clip path for the frame shape
    const clipId = this.generateUniqueId('image-clip');
    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
    clipPath.setAttribute('id', clipId);
    
    const clipShape = this.createClipShape(frameType, paddedX, paddedY, paddedW, paddedH);
    clipPath.appendChild(clipShape);
    defs.appendChild(clipPath);
    
    console.log('[Renderer] Created clip path with frame type:', frameType);

    // Calculate image size and position based on crop settings
    const zoom = cropSettings.zoom || 1.0;
    const cropX = cropSettings.x ?? 0.5;
    const cropY = cropSettings.y ?? 0.5;
    
    // Image dimensions after zoom
    const imgW = paddedW * zoom;
    const imgH = paddedH * zoom;
    
    // Calculate offset to pan within the image
    const maxOffsetX = Math.max(0, imgW - paddedW);
    const maxOffsetY = Math.max(0, imgH - paddedH);
    
    const imgX = paddedX - (maxOffsetX * cropX);
    const imgY = paddedY - (maxOffsetY * cropY);

    console.log('[Renderer] Image actual size:', { imgX, imgY, imgW, imgH, zoom });

    // If in crop mode, show the full image at reduced opacity first
    if (showCropOverlay) {
      const overlayImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      overlayImage.setAttribute('x', imgX);
      overlayImage.setAttribute('y', imgY);
      overlayImage.setAttribute('width', imgW);
      overlayImage.setAttribute('height', imgH);
      overlayImage.setAttribute('href', imageUrl);
      overlayImage.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', imageUrl);
      overlayImage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      overlayImage.setAttribute('opacity', '0.3');
      overlayImage.setAttribute('class', 'crop-overlay-image');
      svg.appendChild(overlayImage);
    }

    // Create the main clipped image element
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.setAttribute('x', imgX);
    image.setAttribute('y', imgY);
    image.setAttribute('width', imgW);
    image.setAttribute('height', imgH);
    
    // Set href using both methods for compatibility
    image.setAttribute('href', imageUrl);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', imageUrl);
    
    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    image.setAttribute('clip-path', `url(#${clipId})`);

    // Add drop shadow if enabled
    if (config.effects?.imageDropShadow) {
      const filterId = this.generateUniqueId('shadow');
      const filter = this.createDropShadowFilter(filterId);
      defs.appendChild(filter);
      image.setAttribute('filter', `url(#${filterId})`);
    }

    svg.appendChild(image);
    console.log('[Renderer] Image element appended to SVG');

    // If in crop mode, add a frame border overlay to show the crop boundary
    if (showCropOverlay) {
      const frameBorder = this.createClipShape(frameType, paddedX, paddedY, paddedW, paddedH);
      frameBorder.setAttribute('fill', 'none');
      frameBorder.setAttribute('stroke', '#8b5cf6');
      frameBorder.setAttribute('stroke-width', '3');
      frameBorder.setAttribute('stroke-dasharray', '8,4');
      frameBorder.setAttribute('class', 'crop-frame-border');
      svg.appendChild(frameBorder);
    }

    // Add border if configured
    if (imgConfig.border) {
      this.renderImageBorder(svg, paddedX, paddedY, paddedW, paddedH, frameType, imgConfig.border, config);
    }
  }

  /**
   * Create a clip shape element for the given frame type
   * All coordinates are absolute (not relative to a transform)
   */
  createClipShape(frameType, x, y, width, height) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    
    switch (frameType) {
      case 'rectangle':
        return this.createRect(x, y, width, height, 0);
        
      case 'rounded': {
        const radius = Math.min(width, height) * 0.08;
        return this.createRect(x, y, width, height, radius);
      }
      
      case 'circle': {
        const r = Math.min(width, height) / 2;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        return circle;
      }
      
      case 'oval': {
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', cx);
        ellipse.setAttribute('cy', cy);
        ellipse.setAttribute('rx', width / 2);
        ellipse.setAttribute('ry', height / 2);
        return ellipse;
      }
      
      case 'cloud': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const w = width;
        const h = height;
        path.setAttribute('d', `
          M ${x + w*0.15} ${y + h*0.7}
          Q ${x + w*0.05} ${y + h*0.7} ${x + w*0.05} ${y + h*0.55}
          Q ${x + w*0.05} ${y + h*0.35} ${x + w*0.2} ${y + h*0.3}
          Q ${x + w*0.15} ${y + h*0.15} ${x + w*0.35} ${y + h*0.15}
          Q ${x + w*0.45} ${y + h*0.05} ${x + w*0.6} ${y + h*0.12}
          Q ${x + w*0.8} ${y + h*0.08} ${x + w*0.85} ${y + h*0.3}
          Q ${x + w*0.95} ${y + h*0.35} ${x + w*0.95} ${y + h*0.55}
          Q ${x + w*0.95} ${y + h*0.75} ${x + w*0.8} ${y + h*0.78}
          Q ${x + w*0.75} ${y + h*0.88} ${x + w*0.55} ${y + h*0.85}
          Q ${x + w*0.4} ${y + h*0.92} ${x + w*0.25} ${y + h*0.82}
          Q ${x + w*0.15} ${y + h*0.85} ${x + w*0.15} ${y + h*0.7}
          Z
        `);
        return path;
      }
      
      case 'heart': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const w = width;
        const h = height;
        path.setAttribute('d', `
          M ${x + w*0.5} ${y + h*0.85}
          C ${x + w*0.15} ${y + h*0.55} ${x + w*0.05} ${y + h*0.35} ${x + w*0.25} ${y + h*0.2}
          C ${x + w*0.4} ${y + h*0.1} ${x + w*0.5} ${y + h*0.25} ${x + w*0.5} ${y + h*0.3}
          C ${x + w*0.5} ${y + h*0.25} ${x + w*0.6} ${y + h*0.1} ${x + w*0.75} ${y + h*0.2}
          C ${x + w*0.95} ${y + h*0.35} ${x + w*0.85} ${y + h*0.55} ${x + w*0.5} ${y + h*0.85}
          Z
        `);
        return path;
      }
      
      case 'star': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const outerR = Math.min(width, height) / 2;
        const innerR = outerR * 0.4;
        const points = 5;
        let d = '';
        
        for (let i = 0; i < points * 2; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (i * Math.PI / points) - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          d += (i === 0 ? 'M' : 'L') + ` ${px} ${py} `;
        }
        d += 'Z';
        path.setAttribute('d', d);
        return path;
      }
      
      case 'hexagon': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const r = Math.min(width, height) / 2;
        let d = '';
        
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI / 3) - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          d += (i === 0 ? 'M' : 'L') + ` ${px} ${py} `;
        }
        d += 'Z';
        path.setAttribute('d', d);
        return path;
      }
      
      case 'arch': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const w = width;
        const h = height;
        path.setAttribute('d', `
          M ${x} ${y + h}
          L ${x} ${y + h*0.4}
          Q ${x} ${y} ${x + w*0.5} ${y}
          Q ${x + w} ${y} ${x + w} ${y + h*0.4}
          L ${x + w} ${y + h}
          Z
        `);
        return path;
      }
      
      case 'blob': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const w = width;
        const h = height;
        path.setAttribute('d', `
          M ${x + w*0.5} ${y + h*0.05}
          Q ${x + w*0.85} ${y + h*0.08} ${x + w*0.92} ${y + h*0.35}
          Q ${x + w*0.98} ${y + h*0.6} ${x + w*0.82} ${y + h*0.82}
          Q ${x + w*0.65} ${y + h*0.98} ${x + w*0.4} ${y + h*0.92}
          Q ${x + w*0.12} ${y + h*0.88} ${x + w*0.08} ${y + h*0.58}
          Q ${x + w*0.02} ${y + h*0.28} ${x + w*0.22} ${y + h*0.12}
          Q ${x + w*0.35} ${y + h*0.02} ${x + w*0.5} ${y + h*0.05}
          Z
        `);
        return path;
      }
      
      case 'scallop': {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const w = width;
        const h = height;
        const scallops = 8;
        const scW = w / scallops;
        const scH = h / scallops;
        const depth = 0.12;
        
        let d = `M ${x} ${y + h * depth}`;
        
        // Top edge
        for (let i = 0; i < scallops; i++) {
          const x1 = x + i * scW;
          const x2 = x + (i + 0.5) * scW;
          const x3 = x + (i + 1) * scW;
          d += ` Q ${x2} ${y} ${x3} ${y + h * depth}`;
        }
        
        // Right edge
        for (let i = 0; i < scallops; i++) {
          const y1 = y + i * scH;
          const y2 = y + (i + 0.5) * scH;
          const y3 = y + (i + 1) * scH;
          d += ` Q ${x + w} ${y2} ${x + w - w * depth} ${y3}`;
        }
        
        // Bottom edge
        for (let i = scallops; i > 0; i--) {
          const x1 = x + i * scW;
          const x2 = x + (i - 0.5) * scW;
          const x3 = x + (i - 1) * scW;
          d += ` Q ${x2} ${y + h} ${x3} ${y + h - h * depth}`;
        }
        
        // Left edge
        for (let i = scallops; i > 0; i--) {
          const y1 = y + i * scH;
          const y2 = y + (i - 0.5) * scH;
          const y3 = y + (i - 1) * scH;
          d += ` Q ${x} ${y2} ${x + w * depth} ${y3}`;
        }
        
        d += ' Z';
        path.setAttribute('d', d);
        return path;
      }
      
      default:
        // Default to rectangle
        return this.createRect(x, y, width, height, 0);
    }
  }

  /**
   * Helper to create a rect element
   */
  createRect(x, y, width, height, radius = 0) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    if (radius > 0) {
      rect.setAttribute('rx', radius);
      rect.setAttribute('ry', radius);
    }
    return rect;
  }

  renderImageBorder(svg, x, y, w, h, frameType, borderConfig, config) {
    const borderColor = borderConfig.color === 'accent' 
      ? (config.colors?.accent || '#333') 
      : borderConfig.color;
    const borderWidth = borderConfig.width || 2;

    // Create a border shape matching the frame
    const borderShape = this.createClipShape(frameType, x, y, w, h);
    borderShape.setAttribute('fill', 'none');
    borderShape.setAttribute('stroke', borderColor);
    borderShape.setAttribute('stroke-width', borderWidth);
    
    svg.appendChild(borderShape);
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
      let defs = svg.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
      }
      
      const glowId = this.generateUniqueId('glow');
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

  /**
   * Clear the image cache
   */
  clearImageCache() {
    imageCache.clear();
  }
}

// Export singleton instance
export const pageRenderer = new PageRenderer();