// js/compositor/ui.js
// Canva-style UI for book compositor - v2

import { 
  getAllTemplates, 
  getTemplate, 
  getCategories, 
  FRAME_SHAPES, 
  FONT_FAMILIES, 
  COLOR_THEMES 
} from './templates.js';
import { PageRenderer, PAGE_DIMENSIONS } from './renderer.js';
import { bookExporter, EXPORT_FORMATS } from './exporter.js';

export class CompositorUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.renderer = new PageRenderer();
    
    // State
    this.bookData = null;
    this.selectedTemplate = 'classic-bottom';
    this.customizations = {
      imageScale: 1.0,
      imageOffsetX: 0,
      imageOffsetY: 0,
    };
    this.currentPageIndex = 0;
    this.isExporting = false;
    this.isRendering = false;
    
    // Selection & drag state
    this.selectedElement = null; // 'text' | 'image' | null
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragStartOffset = { x: 0, y: 0 };
    this.dragStartScale = 1;
    
    // Callbacks
    this.onExportComplete = null;
    this.onTemplateChange = null;
  }

  initialize(bookData) {
    this.bookData = bookData;
    this.currentPageIndex = 0;
    this.render();
    this.preloadFonts();
  }

  updateBookData(bookData) {
    this.bookData = bookData;
    this.renderPreview();
  }

  render() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="compositor-canva">
        <!-- Top Header Bar -->
        <header class="compositor-topbar">
          <div class="topbar-left">
            <button id="back-btn" class="topbar-btn" title="Back to Storyboard">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="topbar-divider"></div>
            <span class="topbar-title">${this.bookData?.title || 'Book Layout'}</span>
          </div>
          <div class="topbar-center">
            <button id="prev-page" class="topbar-btn" title="Previous page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span id="page-indicator" class="page-indicator">Page 1 of ${this.bookData?.pages?.length || 1}</span>
            <button id="next-page" class="topbar-btn" title="Next page">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
          <div class="topbar-right">
            <select id="page-size-select" class="topbar-select">
              ${Object.entries(PAGE_DIMENSIONS).map(([key, dim]) => `
                <option value="${key}" ${key === 'square-medium' ? 'selected' : ''}>
                  ${dim.name}
                </option>
              `).join('')}
            </select>
            <button id="export-btn" class="topbar-btn topbar-btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
              <span>Export</span>
            </button>
          </div>
        </header>

        <!-- Main Layout -->
        <div class="compositor-main">
          <!-- Left Sidebar - All Templates -->
          <aside class="compositor-sidebar">
            <div class="sidebar-header">
              <h3>Templates</h3>
            </div>
            <div id="template-gallery" class="template-gallery"></div>
          </aside>

          <!-- Center - Canvas/Preview Area -->
          <main class="compositor-canvas-area">
            <div class="canvas-container">
              <div id="preview-wrapper" class="preview-wrapper">
                <div id="page-preview" class="page-preview">
                  <div class="preview-loading"><div class="spinner"></div></div>
                </div>
                <!-- Selection overlay with resize handles -->
                <div id="selection-overlay" class="selection-overlay hidden">
                  <div class="resize-handle nw" data-handle="nw"></div>
                  <div class="resize-handle ne" data-handle="ne"></div>
                  <div class="resize-handle sw" data-handle="sw"></div>
                  <div class="resize-handle se" data-handle="se"></div>
                </div>
              </div>
            </div>
            
            <!-- Page Thumbnails -->
            <div class="thumbnails-strip">
              <div id="preview-thumbnails" class="preview-thumbnails"></div>
            </div>
          </main>
        </div>

        <!-- Floating Bottom Taskbar -->
        <div id="floating-taskbar" class="floating-taskbar hidden">
          <div id="taskbar-content" class="taskbar-content"></div>
        </div>

        <!-- Export Modal -->
        <div id="export-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>Export Book</h3>
              <button id="close-export-modal" class="modal-close">×</button>
            </div>
            <div class="modal-body">
              <div class="export-options-grid">
                <div class="export-option" data-format="pdf">
                  <div class="export-option-icon">📄</div>
                  <div class="export-option-label">PDF Document</div>
                  <div class="export-option-desc">Best for printing</div>
                </div>
                <div class="export-option" data-format="png">
                  <div class="export-option-icon">🖼️</div>
                  <div class="export-option-label">PNG Images</div>
                  <div class="export-option-desc">High quality images</div>
                </div>
              </div>
              <div class="export-quality">
                <label>Quality</label>
                <select id="export-quality">
                  <option value="draft">Draft (Fast)</option>
                  <option value="standard" selected>Standard</option>
                  <option value="high">High Quality</option>
                  <option value="print">Print Ready</option>
                </select>
              </div>
              <div id="export-progress" class="export-progress hidden">
                <div class="progress-bar">
                  <div id="export-progress-fill" class="progress-fill"></div>
                </div>
                <div id="export-progress-text" class="progress-text">Preparing...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.renderTemplateGallery();
    this.renderPreview();
    this.renderThumbnails();
    this.bindEvents();
  }

  /**
   * Render all templates grouped by category in one scrollable list
   */
  renderTemplateGallery() {
    const categories = getCategories();
    const gallery = document.getElementById('template-gallery');
    
    let html = '';
    
    for (const category of categories) {
      const templates = getAllTemplates().filter(t => t.category === category);
      
      html += `
        <div class="template-category-section">
          <div class="template-category-header">${category.charAt(0).toUpperCase() + category.slice(1)}</div>
          <div class="template-category-grid">
            ${templates.map(tmpl => `
              <div class="template-card ${tmpl.id === this.selectedTemplate ? 'selected' : ''}" 
                   data-template="${tmpl.id}">
                <div class="template-preview-visual" style="background: ${tmpl.colors?.background || '#fff'}">
                  ${this.generateTemplateMiniPreview(tmpl)}
                </div>
                <div class="template-name">${tmpl.name}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    
    gallery.innerHTML = html;

    // Bind click events
    gallery.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectTemplate(card.dataset.template);
        gallery.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  /**
   * Generate mini SVG preview with properly scaled frames
   */
  generateTemplateMiniPreview(template) {
    const w = 100;
    const h = 100;
    const imgConfig = template.layout?.image || {};
    const textConfig = template.layout?.text || {};
    const imgPos = imgConfig.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
    const textPos = textConfig.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };
    const frameType = imgConfig.frame || 'rectangle';
    
    // Calculate positions
    const imgX = imgPos.x * w;
    const imgY = imgPos.y * h;
    const imgW = imgPos.width * w;
    const imgH = imgPos.height * h;
    
    const textX = textPos.x * w;
    const textY = textPos.y * h;
    const textW = textPos.width * w;
    
    const colors = template.colors || {};
    const accentColor = colors.accent || '#a855f7';
    
    // Generate frame shape
    const framePath = this.getFrameSVGForPreview(frameType, imgX, imgY, imgW, imgH, accentColor);

    // Text lines representation
    const textLines = `
      <rect x="${textX + textW*0.1}" y="${textY + 4}" width="${textW*0.8}" height="3" rx="1.5" fill="${colors.text || '#333'}" opacity="0.5"/>
      <rect x="${textX + textW*0.2}" y="${textY + 10}" width="${textW*0.6}" height="3" rx="1.5" fill="${colors.text || '#333'}" opacity="0.3"/>
    `;

    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${framePath}${textLines}</svg>`;
  }

  /**
   * Get frame SVG for preview thumbnails - properly scaled for each shape
   */
  getFrameSVGForPreview(frameType, x, y, w, h, color) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    
    switch (frameType) {
      case 'circle': {
        const r = Math.min(w, h) / 2 * 0.95;
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="0.7"/>`;
      }
      case 'oval': {
        return `<ellipse cx="${cx}" cy="${cy}" rx="${w/2 * 0.95}" ry="${h/2 * 0.95}" fill="${color}" opacity="0.7"/>`;
      }
      case 'rounded': {
        const rad = Math.min(w, h) * 0.12;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rad}" fill="${color}" opacity="0.7"/>`;
      }
      case 'cloud': {
        return `<ellipse cx="${cx}" cy="${cy}" rx="${w/2 * 0.9}" ry="${h/2 * 0.85}" fill="${color}" opacity="0.7"/>`;
      }
      case 'heart': {
        const scale = 0.9;
        const hw = w * scale / 2;
        const hh = h * scale;
        return `<path d="M${cx} ${y + hh*0.9} C${cx - hw*0.7} ${y + hh*0.55} ${cx - hw*0.9} ${y + hh*0.2} ${cx} ${y + hh*0.35} C${cx + hw*0.9} ${y + hh*0.2} ${cx + hw*0.7} ${y + hh*0.55} ${cx} ${y + hh*0.9}Z" fill="${color}" opacity="0.7"/>`;
      }
      case 'star': {
        const r = Math.min(w, h) / 2 * 0.9;
        const innerR = r * 0.4;
        let d = '';
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? r : innerR;
          const angle = (i * Math.PI / 5) - Math.PI / 2;
          const px = cx + radius * Math.cos(angle);
          const py = cy + radius * Math.sin(angle);
          d += (i === 0 ? 'M' : 'L') + `${px} ${py} `;
        }
        d += 'Z';
        return `<path d="${d}" fill="${color}" opacity="0.7"/>`;
      }
      case 'hexagon': {
        const r = Math.min(w, h) / 2 * 0.9;
        let d = '';
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI / 3) - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          d += (i === 0 ? 'M' : 'L') + `${px} ${py} `;
        }
        d += 'Z';
        return `<path d="${d}" fill="${color}" opacity="0.7"/>`;
      }
      case 'arch': {
        return `<path d="M${x} ${y+h} L${x} ${y+h*0.35} Q${x} ${y} ${cx} ${y} Q${x+w} ${y} ${x+w} ${y+h*0.35} L${x+w} ${y+h} Z" fill="${color}" opacity="0.7"/>`;
      }
      case 'blob': {
        return `<ellipse cx="${cx}" cy="${cy}" rx="${w/2 * 0.88}" ry="${h/2 * 0.88}" fill="${color}" opacity="0.7"/>`;
      }
      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.7"/>`;
    }
  }

  showTaskbar(elementType) {
    const taskbar = document.getElementById('floating-taskbar');
    const content = document.getElementById('taskbar-content');
    
    this.selectedElement = elementType;
    
    if (elementType === 'image') {
      content.innerHTML = this.renderImageTaskbar();
      this.bindImageTaskbarEvents();
    } else if (elementType === 'text') {
      content.innerHTML = this.renderTextTaskbar();
      this.bindTextTaskbarEvents();
    }
    
    taskbar.classList.remove('hidden');
  }

  hideTaskbar() {
    document.getElementById('floating-taskbar')?.classList.add('hidden');
    document.getElementById('selection-overlay')?.classList.add('hidden');
    this.selectedElement = null;
  }

  /**
   * Show selection overlay with resize handles
   */
  showSelectionOverlay(element, bounds) {
    const overlay = document.getElementById('selection-overlay');
    const wrapper = document.getElementById('preview-wrapper');
    
    if (!overlay || !wrapper) return;
    
    const wrapperRect = wrapper.getBoundingClientRect();
    
    overlay.style.left = `${bounds.left - wrapperRect.left}px`;
    overlay.style.top = `${bounds.top - wrapperRect.top}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    overlay.classList.remove('hidden');
    overlay.dataset.element = element;
  }

  renderImageTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFrame = this.customizations.frame || tmpl.layout?.image?.frame || 'rounded';
    
    return `
      <div class="taskbar-section">
        <label class="taskbar-label">Frame Shape</label>
        <div class="taskbar-frames">
          ${Object.keys(FRAME_SHAPES).slice(0, 10).map(frameId => `
            <button class="taskbar-frame-btn ${frameId === currentFrame ? 'active' : ''}" 
                    data-frame="${frameId}" title="${FRAME_SHAPES[frameId].name}">
              <svg viewBox="0 0 32 32" width="24" height="24">
                ${this.getFrameIconSVG(frameId)}
              </svg>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Scale</label>
        <span class="taskbar-value" id="scale-value">${Math.round((this.customizations.imageScale || 1) * 100)}%</span>
        <button class="taskbar-btn-small" id="scale-reset" title="Reset">⟲</button>
      </div>
    `;
  }

  getFrameIconSVG(frameType) {
    const icons = {
      rectangle: '<rect x="4" y="8" width="24" height="16" fill="currentColor" opacity="0.7"/>',
      rounded: '<rect x="4" y="8" width="24" height="16" rx="3" fill="currentColor" opacity="0.7"/>',
      circle: '<circle cx="16" cy="16" r="10" fill="currentColor" opacity="0.7"/>',
      oval: '<ellipse cx="16" cy="16" rx="12" ry="8" fill="currentColor" opacity="0.7"/>',
      cloud: '<ellipse cx="16" cy="16" rx="11" ry="9" fill="currentColor" opacity="0.7"/>',
      heart: '<path d="M16 24 C8 18 5 13 9 9 C12 7 16 11 16 11 C16 11 20 7 23 9 C27 13 24 18 16 24Z" fill="currentColor" opacity="0.7"/>',
      star: '<polygon points="16,4 18.5,11 26,11 20,16 22.5,24 16,19 9.5,24 12,16 6,11 13.5,11" fill="currentColor" opacity="0.7"/>',
      hexagon: '<polygon points="16,5 26,10 26,22 16,27 6,22 6,10" fill="currentColor" opacity="0.7"/>',
      arch: '<path d="M6 26 L6 12 Q6 6 16 6 Q26 6 26 12 L26 26 Z" fill="currentColor" opacity="0.7"/>',
      blob: '<ellipse cx="16" cy="16" rx="10" ry="10" fill="currentColor" opacity="0.7"/>',
    };
    return icons[frameType] || icons.rectangle;
  }

  renderTextTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFont = this.customizations.fontFamily || tmpl.typography?.fontFamily || 'Merriweather';
    const currentSize = this.customizations.fontSize || tmpl.typography?.baseFontSize || 18;
    
    return `
      <div class="taskbar-section">
        <label class="taskbar-label">Font</label>
        <select id="taskbar-font" class="taskbar-select">
          ${Object.keys(FONT_FAMILIES).map(font => `
            <option value="${font}" ${font === currentFont ? 'selected' : ''}>${font}</option>
          `).join('')}
        </select>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Size</label>
        <div class="taskbar-fontsize">
          <button class="taskbar-btn" id="fontsize-down">−</button>
          <span class="taskbar-value" id="fontsize-value">${currentSize}px</span>
          <button class="taskbar-btn" id="fontsize-up">+</button>
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Theme</label>
        <div class="taskbar-colors">
          ${Object.values(COLOR_THEMES).slice(0, 8).map(theme => `
            <button class="taskbar-color-btn ${theme.id === (this.customizations.colorTheme || 'cream') ? 'active' : ''}"
                    data-theme="${theme.id}"
                    style="background: ${theme.background}; border-color: ${theme.accent}"
                    title="${theme.name}">
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  bindImageTaskbarEvents() {
    // Frame selection
    document.querySelectorAll('.taskbar-frame-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-frame-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.frame = btn.dataset.frame;
        this.renderPreview();
      });
    });

    // Reset
    document.getElementById('scale-reset')?.addEventListener('click', () => {
      this.customizations.imageOffsetX = 0;
      this.customizations.imageOffsetY = 0;
      this.customizations.imageScale = 1;
      document.getElementById('scale-value').textContent = '100%';
      this.renderPreview();
    });
  }

  bindTextTaskbarEvents() {
    document.getElementById('taskbar-font')?.addEventListener('change', (e) => {
      this.customizations.fontFamily = e.target.value;
      this.preloadFonts([e.target.value]);
      this.renderPreview();
    });

    document.getElementById('fontsize-down')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.max(12, (this.customizations.fontSize || 18) - 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreview();
    });

    document.getElementById('fontsize-up')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.min(36, (this.customizations.fontSize || 18) + 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreview();
    });

    document.querySelectorAll('.taskbar-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.colorTheme = btn.dataset.theme;
        this.renderPreview();
        this.renderThumbnails();
      });
    });
  }

  async renderPreview() {
    if (!this.bookData?.pages?.length) return;
    if (this.isRendering) return;
    
    this.isRendering = true;

    const container = document.getElementById('page-preview');
    const pageData = this.bookData.pages[this.currentPageIndex];
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);

    container.innerHTML = `<div class="preview-loading"><div class="spinner"></div></div>`;

    try {
      await this.renderer.renderToContainer(container, pageData, config, this.customizations);
      this.setupPreviewInteraction(container);
    } catch (error) {
      console.error('Failed to render preview:', error);
      container.innerHTML = `<div class="preview-error">Failed to load preview</div>`;
    }
    
    this.isRendering = false;
    this.updatePageIndicator();
  }

  setupPreviewInteraction(container) {
    const svg = container.querySelector('svg');
    if (!svg) return;

    const imageEl = svg.querySelector('image');
    const textGroup = svg.querySelectorAll('g')[0]; // First g is usually text

    // Click on image
    if (imageEl) {
      imageEl.style.cursor = 'move';
      imageEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selectElement('image', imageEl);
      });
    }

    // Click on text
    if (textGroup && textGroup.querySelector('text')) {
      textGroup.style.cursor = 'move';
      textGroup.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selectElement('text', textGroup);
      });
    }

    // Click on background to deselect
    svg.addEventListener('click', (e) => {
      if (e.target === svg || e.target.tagName === 'rect' && !e.target.closest('clipPath')) {
        this.hideTaskbar();
      }
    });
  }

  selectElement(type, element) {
    this.selectedElement = type;
    
    // Get element bounds relative to preview
    const rect = element.getBoundingClientRect();
    this.showSelectionOverlay(type, rect);
    this.showTaskbar(type);
    
    // Setup drag
    this.setupDragForElement(type, element);
  }

  setupDragForElement(type, element) {
    const overlay = document.getElementById('selection-overlay');
    if (!overlay) return;

    // Drag to move
    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragStartOffset = {
        x: type === 'image' ? (this.customizations.imageOffsetX || 0) : 0,
        y: type === 'image' ? (this.customizations.imageOffsetY || 0) : 0,
      };
      
      e.preventDefault();
    };

    // Resize handles
    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        e.stopPropagation();
        this.isResizing = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragStartScale = this.customizations.imageScale || 1;
        e.preventDefault();
      };
    });

    // Mouse move/up handlers
    document.onmousemove = (e) => {
      if (this.isDragging && type === 'image') {
        const dx = (e.clientX - this.dragStart.x) / 500; // Scale factor
        const dy = (e.clientY - this.dragStart.y) / 500;
        
        this.customizations.imageOffsetX = this.dragStartOffset.x + dx;
        this.customizations.imageOffsetY = this.dragStartOffset.y + dy;
        
        this.renderPreview();
      }
      
      if (this.isResizing && type === 'image') {
        const dy = (e.clientY - this.dragStart.y) / 200;
        const newScale = Math.max(0.3, Math.min(1.5, this.dragStartScale + dy));
        
        this.customizations.imageScale = newScale;
        document.getElementById('scale-value').textContent = `${Math.round(newScale * 100)}%`;
        
        this.renderPreview();
      }
    };

    document.onmouseup = () => {
      this.isDragging = false;
      this.isResizing = false;
    };
  }

  renderThumbnails() {
    if (!this.bookData?.pages?.length) return;

    const container = document.getElementById('preview-thumbnails');
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);

    container.innerHTML = this.bookData.pages.map((page, i) => `
      <div class="thumbnail ${i === this.currentPageIndex ? 'active' : ''}" data-page-index="${i}">
        <div class="thumbnail-inner">
          ${page.imageUrl 
            ? `<img src="${page.imageUrl}" alt="Page ${page.page}">`
            : `<div class="thumbnail-placeholder" style="background:${config.colors?.background || '#fff'}"><span>${page.page}</span></div>`
          }
        </div>
        <span class="thumbnail-number">${page.page}</span>
      </div>
    `).join('');

    container.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.addEventListener('click', () => {
        this.currentPageIndex = parseInt(thumb.dataset.pageIndex);
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      });
    });
  }

  updateThumbnailSelection() {
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === this.currentPageIndex);
    });
  }

  updatePageIndicator() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      indicator.textContent = `Page ${this.currentPageIndex + 1} of ${this.bookData.pages.length}`;
    }
  }

  selectTemplate(templateId) {
    this.selectedTemplate = templateId;
    this.customizations = { imageScale: 1.0, imageOffsetX: 0, imageOffsetY: 0 };
    this.renderPreview();
    this.renderThumbnails();
    this.hideTaskbar();
    
    if (this.onTemplateChange) this.onTemplateChange(templateId);
  }

  applyCustomizations(template) {
    const config = JSON.parse(JSON.stringify(template));

    if (this.customizations.fontFamily) {
      config.typography = config.typography || {};
      config.typography.fontFamily = this.customizations.fontFamily;
    }

    if (this.customizations.fontSize) {
      config.typography = config.typography || {};
      config.typography.baseFontSize = this.customizations.fontSize;
    }

    if (this.customizations.colorTheme) {
      config.colors = COLOR_THEMES[this.customizations.colorTheme] || config.colors;
    }

    if (this.customizations.frame) {
      config.layout = config.layout || {};
      config.layout.image = config.layout.image || {};
      config.layout.image.frame = this.customizations.frame;
    }

    // Image scale and position
    if (this.customizations.imageScale !== 1 || this.customizations.imageOffsetX || this.customizations.imageOffsetY) {
      config.layout = config.layout || {};
      config.layout.image = config.layout.image || {};
      const pos = config.layout.image.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
      
      const scale = this.customizations.imageScale || 1;
      const newWidth = pos.width * scale;
      const newHeight = pos.height * scale;
      const xOffset = (pos.width - newWidth) / 2;
      const yOffset = (pos.height - newHeight) / 2;
      
      config.layout.image.position = {
        ...config.layout.image.position,
        region: {
          x: pos.x + xOffset + (this.customizations.imageOffsetX || 0),
          y: pos.y + yOffset + (this.customizations.imageOffsetY || 0),
          width: newWidth,
          height: newHeight,
        }
      };
    }

    return config;
  }

  bindEvents() {
    document.getElementById('prev-page')?.addEventListener('click', () => {
      if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (this.currentPageIndex < this.bookData.pages.length - 1) {
        this.currentPageIndex++;
        this.renderPreview();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') document.getElementById('prev-page')?.click();
      else if (e.key === 'ArrowRight') document.getElementById('next-page')?.click();
      else if (e.key === 'Escape') this.hideTaskbar();
    });

    document.getElementById('page-size-select')?.addEventListener('change', (e) => {
      this.renderer = new PageRenderer({ pageSize: e.target.value });
      this.renderPreview();
    });

    document.getElementById('export-btn')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.remove('hidden');
    });

    document.getElementById('close-export-modal')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    document.querySelectorAll('.export-option').forEach(opt => {
      opt.addEventListener('click', () => this.handleExport(opt.dataset.format));
    });
  }

  async handleExport(format = 'pdf') {
    if (this.isExporting) return;
    this.isExporting = true;

    const progressContainer = document.getElementById('export-progress');
    const progressFill = document.getElementById('export-progress-fill');
    const progressText = document.getElementById('export-progress-text');

    progressContainer?.classList.remove('hidden');

    try {
      const quality = document.getElementById('export-quality')?.value || 'standard';
      const pageSize = document.getElementById('page-size-select')?.value || 'square-medium';
      
      const tmpl = getTemplate(this.selectedTemplate);
      const config = this.applyCustomizations(tmpl);

      const options = {
        pageSize,
        quality,
        overrides: this.customizations,
        filename: `${this.bookData.title || 'my-book'}.pdf`,
        onProgress: (progress) => {
          if (progressFill) progressFill.style.width = `${progress.percent}%`;
          if (progressText) progressText.textContent = `Page ${progress.current} of ${progress.total}...`;
        },
      };

      if (format === 'pdf') {
        await bookExporter.downloadPDF(this.bookData, config, options);
      } else {
        await bookExporter.downloadImagesZip(this.bookData, config, { ...options, format });
      }

      if (progressText) progressText.textContent = 'Complete!';
      if (this.onExportComplete) this.onExportComplete(format);

      setTimeout(() => {
        document.getElementById('export-modal')?.classList.add('hidden');
        progressContainer?.classList.add('hidden');
        if (progressFill) progressFill.style.width = '0%';
      }, 1000);

    } catch (error) {
      console.error('Export failed:', error);
      if (progressText) progressText.textContent = `Failed: ${error.message}`;
    } finally {
      this.isExporting = false;
    }
  }

  async preloadFonts(additionalFonts = []) {
    const tmpl = getTemplate(this.selectedTemplate);
    const fonts = [tmpl.typography?.fontFamily, ...additionalFonts].filter(Boolean);
    await this.renderer.preloadFonts(fonts);
  }
}

export function createCompositorUI(containerId) {
  return new CompositorUI(containerId);
}