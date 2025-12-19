// js/compositor/ui.js
// Canva-style UI for book compositor - v3

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
    
    // Global customizations (apply to all pages)
    this.customizations = {
      fontFamily: null,
      fontSize: null,
      colorTheme: null,
      frame: null,
      showPageNumbers: true,
    };
    
    // Per-page crop settings: { [pageIndex]: { cropZoom, cropX, cropY } }
    this.pageCropSettings = {};
    
    // Per-page frame settings: { [pageIndex]: { scale, offsetX, offsetY } }
    this.pageFrameSettings = {};
    
    // Per-page text settings: { [pageIndex]: { scale, offsetX, offsetY } }
    this.pageTextSettings = {};
    
    // Crop mode state
    this.cropMode = false;
    
    this.currentPageIndex = 0;
    this.isExporting = false;
    this.isRendering = false;
    
    // Selection & drag state
    this.selectedElement = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragStartValues = {};
    
    // Callbacks
    this.onExportComplete = null;
    this.onTemplateChange = null;
  }

  // Get frame settings for current page (size and position of the frame)
  getCurrentFrameSettings() {
    return this.pageFrameSettings[this.currentPageIndex] || {
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
    };
  }

  // Set frame settings for current page
  setCurrentFrameSettings(settings) {
    this.pageFrameSettings[this.currentPageIndex] = {
      ...this.getCurrentFrameSettings(),
      ...settings,
    };
  }

  // Get text settings for current page (size and position of the text block)
  getCurrentTextSettings() {
    return this.pageTextSettings[this.currentPageIndex] || {
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
    };
  }

  // Set text settings for current page
  setCurrentTextSettings(settings) {
    this.pageTextSettings[this.currentPageIndex] = {
      ...this.getCurrentTextSettings(),
      ...settings,
    };
  }

  // Get crop settings for current page (zoom/pan within the image)
  getCurrentCrop() {
    return this.pageCropSettings[this.currentPageIndex] || {
      cropZoom: 1.0,
      cropX: 0.5,
      cropY: 0.5,
    };
  }

  // Set crop settings for current page
  setCurrentCrop(settings) {
    this.pageCropSettings[this.currentPageIndex] = {
      ...this.getCurrentCrop(),
      ...settings,
    };
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
            <label class="topbar-checkbox" title="Show page numbers on pages">
              <input type="checkbox" id="show-page-numbers" checked>
              <span>Page #</span>
            </label>
            <div class="topbar-divider"></div>
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
          <!-- Left Sidebar -->
          <aside class="compositor-sidebar">
            <div class="sidebar-header">
              <h3>Templates</h3>
            </div>
            <div id="template-gallery" class="template-gallery"></div>
          </aside>

          <!-- Center - Canvas Area -->
          <main class="compositor-canvas-area" id="canvas-area">
            <div class="canvas-container">
              <div id="preview-wrapper" class="preview-wrapper">
                <div id="page-preview" class="page-preview">
                  <div class="preview-loading"><div class="spinner"></div></div>
                </div>
                <!-- Selection overlay -->
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

            <!-- Floating Taskbar - Inside canvas area for proper centering -->
            <div id="floating-taskbar" class="floating-taskbar hidden">
              <div id="taskbar-content" class="taskbar-content"></div>
            </div>
          </main>
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

    gallery.querySelectorAll('.template-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectTemplate(card.dataset.template);
        gallery.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  generateTemplateMiniPreview(template) {
    const w = 100, h = 100;
    const imgConfig = template.layout?.image || {};
    const textConfig = template.layout?.text || {};
    const imgPos = imgConfig.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
    const textPos = textConfig.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };
    const frameType = imgConfig.frame || 'rectangle';
    
    const imgX = imgPos.x * w, imgY = imgPos.y * h;
    const imgW = imgPos.width * w, imgH = imgPos.height * h;
    const textX = textPos.x * w, textY = textPos.y * h, textW = textPos.width * w;
    
    const colors = template.colors || {};
    const framePath = this.getFrameSVGForPreview(frameType, imgX, imgY, imgW, imgH, colors.accent || '#a855f7');
    const textLines = `
      <rect x="${textX + textW*0.1}" y="${textY + 4}" width="${textW*0.8}" height="3" rx="1.5" fill="${colors.text || '#333'}" opacity="0.5"/>
      <rect x="${textX + textW*0.2}" y="${textY + 10}" width="${textW*0.6}" height="3" rx="1.5" fill="${colors.text || '#333'}" opacity="0.3"/>
    `;
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%">${framePath}${textLines}</svg>`;
  }

  getFrameSVGForPreview(frameType, x, y, w, h, color) {
    const cx = x + w/2, cy = y + h/2;
    switch (frameType) {
      case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w,h)/2*0.95}" fill="${color}" opacity="0.7"/>`;
      case 'oval': return `<ellipse cx="${cx}" cy="${cy}" rx="${w/2*0.95}" ry="${h/2*0.95}" fill="${color}" opacity="0.7"/>`;
      case 'rounded': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w,h)*0.12}" fill="${color}" opacity="0.7"/>`;
      case 'heart': return `<path d="M${cx} ${y+h*0.85} C${cx-w*0.35} ${y+h*0.5} ${cx-w*0.45} ${y+h*0.18} ${cx} ${y+h*0.32} C${cx+w*0.45} ${y+h*0.18} ${cx+w*0.35} ${y+h*0.5} ${cx} ${y+h*0.85}Z" fill="${color}" opacity="0.7"/>`;
      case 'star': {
        const r = Math.min(w,h)/2*0.9, ir = r*0.4;
        let d = '';
        for (let i = 0; i < 10; i++) {
          const rad = i%2===0 ? r : ir;
          const ang = (i*Math.PI/5) - Math.PI/2;
          d += (i===0?'M':'L') + `${cx+rad*Math.cos(ang)} ${cy+rad*Math.sin(ang)} `;
        }
        return `<path d="${d}Z" fill="${color}" opacity="0.7"/>`;
      }
      case 'hexagon': {
        const r = Math.min(w,h)/2*0.9;
        let d = '';
        for (let i = 0; i < 6; i++) {
          const ang = (i*Math.PI/3) - Math.PI/2;
          d += (i===0?'M':'L') + `${cx+r*Math.cos(ang)} ${cy+r*Math.sin(ang)} `;
        }
        return `<path d="${d}Z" fill="${color}" opacity="0.7"/>`;
      }
      case 'arch': return `<path d="M${x} ${y+h} L${x} ${y+h*0.35} Q${x} ${y} ${cx} ${y} Q${x+w} ${y} ${x+w} ${y+h*0.35} L${x+w} ${y+h} Z" fill="${color}" opacity="0.7"/>`;
      default: return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" opacity="0.7"/>`;
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
    this.cleanupDragHandlers();
    
    // Exit crop mode if active and re-render to remove overlay
    if (this.cropMode) {
      this.cropMode = false;
      document.getElementById('page-preview')?.classList.remove('crop-mode');
      
      // Re-render without crop overlay
      this.renderPreview();
    }
  }

  cleanupDragHandlers() {
    document.onmousemove = null;
    document.onmouseup = null;
  }

  updateSelectionOverlay() {
    if (!this.selectedElement) return;
    
    const container = document.getElementById('page-preview');
    const svg = container?.querySelector('svg');
    if (!svg) return;

    let element;
    if (this.selectedElement === 'image') {
      element = svg.querySelector('image');
    } else if (this.selectedElement === 'text') {
      element = svg.querySelector('g');
    }

    if (element) {
      const rect = element.getBoundingClientRect();
      this.showSelectionOverlay(this.selectedElement, rect);
    }
  }

  showSelectionOverlay(elementType, bounds) {
    const overlay = document.getElementById('selection-overlay');
    const wrapper = document.getElementById('preview-wrapper');
    
    if (!overlay || !wrapper) return;
    
    const wrapperRect = wrapper.getBoundingClientRect();
    
    overlay.style.left = `${bounds.left - wrapperRect.left}px`;
    overlay.style.top = `${bounds.top - wrapperRect.top}px`;
    overlay.style.width = `${bounds.width}px`;
    overlay.style.height = `${bounds.height}px`;
    overlay.classList.remove('hidden');
    overlay.dataset.element = elementType;
  }

  renderImageTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFrame = this.customizations.frame || tmpl.layout?.image?.frame || 'rounded';
    const frameSettings = this.getCurrentFrameSettings();
    const isCropMode = this.cropMode === true;
    
    return `
      <div class="taskbar-section">
        <label class="taskbar-label">Frame</label>
        <div class="taskbar-frames">
          ${Object.keys(FRAME_SHAPES).slice(0, 8).map(frameId => `
            <button class="taskbar-frame-btn ${frameId === currentFrame ? 'active' : ''}" 
                    data-frame="${frameId}" title="${FRAME_SHAPES[frameId].name}">
              <svg viewBox="0 0 32 32" width="22" height="22">${this.getFrameIconSVG(frameId)}</svg>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Size</label>
        <span class="taskbar-value" id="frame-scale-value">${Math.round(frameSettings.scale * 100)}%</span>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <button class="taskbar-btn-mode ${isCropMode ? 'active' : ''}" id="crop-mode-btn" title="Crop & reposition image within frame">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2v14a2 2 0 002 2h14M6 6H2M18 22v-4"/>
          </svg>
          <span>Crop</span>
        </button>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <button class="taskbar-btn-icon" id="frame-reset" title="Reset all">⟲</button>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <button class="taskbar-btn-apply" id="apply-image-all" title="Apply image settings to all pages">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 1l4 4-4 4"/>
            <path d="M3 11V9a4 4 0 014-4h14"/>
            <path d="M7 23l-4-4 4-4"/>
            <path d="M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
          <span>Apply to All</span>
        </button>
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
    };
    return icons[frameType] || icons.rectangle;
  }

  renderTextTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFont = this.customizations.fontFamily || tmpl.typography?.fontFamily || 'Merriweather';
    const currentSize = this.customizations.fontSize || tmpl.typography?.baseFontSize || 18;
    const textSettings = this.getCurrentTextSettings();
    
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
        <label class="taskbar-label">Scale</label>
        <span class="taskbar-value" id="text-scale-value">${Math.round(textSettings.scale * 100)}%</span>
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
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <button class="taskbar-btn-icon" id="text-reset" title="Reset position/scale">⟲</button>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <button class="taskbar-btn-apply" id="apply-text-all" title="Apply text settings to all pages">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 1l4 4-4 4"/>
            <path d="M3 11V9a4 4 0 014-4h14"/>
            <path d="M7 23l-4-4 4-4"/>
            <path d="M21 13v2a4 4 0 01-4 4H3"/>
          </svg>
          <span>Apply to All</span>
        </button>
      </div>
    `;
  }

  bindImageTaskbarEvents() {
    // Frame shape selection
    document.querySelectorAll('.taskbar-frame-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-frame-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.frame = btn.dataset.frame;
        this.renderPreviewAndUpdateOverlay();
      });
    });

    // Crop mode toggle
    document.getElementById('crop-mode-btn')?.addEventListener('click', () => {
      this.toggleCropMode();
    });

    // Reset all
    document.getElementById('frame-reset')?.addEventListener('click', () => {
      this.pageFrameSettings[this.currentPageIndex] = { scale: 1.0, offsetX: 0, offsetY: 0 };
      this.pageCropSettings[this.currentPageIndex] = { cropZoom: 1.0, cropX: 0.5, cropY: 0.5 };
      document.getElementById('frame-scale-value').textContent = '100%';
      this.renderPreviewAndUpdateOverlay();
    });

    // Apply image settings to all pages
    document.getElementById('apply-image-all')?.addEventListener('click', () => {
      this.applyImageSettingsToAllPages();
    });
  }

  applyImageSettingsToAllPages() {
    const currentFrameSettings = this.getCurrentFrameSettings();
    const currentCropSettings = this.getCurrentCrop();
    const totalPages = this.bookData?.pages?.length || 0;
    
    for (let i = 0; i < totalPages; i++) {
      this.pageFrameSettings[i] = { ...currentFrameSettings };
      this.pageCropSettings[i] = { ...currentCropSettings };
    }
    
    // Visual feedback
    const btn = document.getElementById('apply-image-all');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span>Applied!</span>';
      btn.classList.add('applied');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('applied');
      }, 1500);
    }
    
    this.renderThumbnails();
  }
  
  toggleCropMode() {
    this.cropMode = !this.cropMode;
    
    const btn = document.getElementById('crop-mode-btn');
    if (btn) {
      btn.classList.toggle('active', this.cropMode);
    }
    
    if (this.cropMode) {
      this.enterCropMode();
    } else {
      this.exitCropMode();
    }
  }
  
  enterCropMode() {
    console.log('[UI] Entering crop mode');
    
    // Add crop mode class to preview for styling
    const preview = document.getElementById('page-preview');
    preview?.classList.add('crop-mode');
    
    // Re-render with crop overlay visible
    this.renderPreviewWithCropOverlay();
    
    // Update drag handlers for crop mode
    this.setupCropModeDrag();
  }
  
  exitCropMode() {
    console.log('[UI] Exiting crop mode');
    
    this.cropMode = false;
    
    const preview = document.getElementById('page-preview');
    preview?.classList.remove('crop-mode');
    
    const btn = document.getElementById('crop-mode-btn');
    if (btn) {
      btn.classList.remove('active');
    }
    
    // Re-render WITHOUT crop overlay
    this.renderPreview().then(() => {
      // Re-select the image element after render
      if (this.selectedElement === 'image') {
        const container = document.getElementById('page-preview');
        const svg = container?.querySelector('svg');
        const imageEl = svg?.querySelector('image');
        if (imageEl) {
          const rect = imageEl.getBoundingClientRect();
          this.showSelectionOverlay('image', rect);
          this.setupImageDrag();
        }
      }
    });
  }
  
  async renderPreviewWithCropOverlay() {
    if (!this.bookData?.pages?.length) return;
    
    const container = document.getElementById('page-preview');
    const pageData = this.bookData.pages[this.currentPageIndex];
    const tmpl = getTemplate(this.selectedTemplate);
    const config = this.applyCustomizations(tmpl);
    
    // Render with crop overlay flag
    config.showCropOverlay = true;
    
    try {
      await this.renderer.renderToContainer(container, pageData, config, this.customizations);
      this.setupPreviewInteraction(container);
      
      // Update selection overlay
      const svg = container.querySelector('svg');
      const imageEl = svg?.querySelector('image');
      if (imageEl) {
        const rect = imageEl.getBoundingClientRect();
        this.showSelectionOverlay('image', rect);
        // Re-setup crop mode drag handlers after overlay is shown
        this.setupCropModeDrag();
      }
    } catch (error) {
      console.error('Failed to render crop preview:', error);
    }
  }
  
  setupCropModeDrag() {
    const overlay = document.getElementById('selection-overlay');
    if (!overlay) return;
    
    console.log('[UI] Setting up crop mode drag handlers');
    
    // Show resize handles for crop zoom
    overlay.querySelectorAll('.resize-handle').forEach(h => {
      h.style.display = 'block';
    });
    
    // Drag to pan the image within the frame
    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      
      console.log('[UI] Crop drag started');
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      const crop = this.getCurrentCrop();
      this.dragStartValues = { cropX: crop.cropX, cropY: crop.cropY, cropZoom: crop.cropZoom };
      e.preventDefault();
    };
    
    // Corner handles for crop zoom (how much of image is visible)
    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        console.log('[UI] Crop resize started');
        e.stopPropagation();
        this.isResizing = true;
        this.resizeHandle = handle.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY };
        const crop = this.getCurrentCrop();
        this.dragStartValues = { cropZoom: crop.cropZoom, cropX: crop.cropX, cropY: crop.cropY };
        e.preventDefault();
      };
    });
    
    document.onmousemove = (e) => {
      if (!this.isDragging && !this.isResizing) return;
      
      if (this.isDragging) {
        // Pan the image within the frame
        const dx = (e.clientX - this.dragStart.x) / 150;
        const dy = (e.clientY - this.dragStart.y) / 150;
        
        this.setCurrentCrop({
          cropX: Math.max(0, Math.min(1, this.dragStartValues.cropX - dx)),
          cropY: Math.max(0, Math.min(1, this.dragStartValues.cropY - dy)),
        });
      }
      
      if (this.isResizing) {
        // Zoom - dragging outward = zoom in (show less of image)
        const handle = this.resizeHandle;
        let dx = e.clientX - this.dragStart.x;
        let dy = e.clientY - this.dragStart.y;
        
        if (handle === 'nw') { dx = -dx; dy = -dy; }
        else if (handle === 'ne') { dy = -dy; }
        else if (handle === 'sw') { dx = -dx; }
        
        const delta = (dx + dy) / 2 / 200; // Changed from 100 to 200 for smoother 1:1 feel
        const newZoom = Math.max(1.0, Math.min(3.0, this.dragStartValues.cropZoom + delta));
        
        this.setCurrentCrop({ cropZoom: newZoom });
      }
      
      // Throttled render with crop overlay
      this.renderCropPreviewThrottled();
    };
    
    document.onmouseup = () => {
      if (this.isDragging || this.isResizing) {
        console.log('[UI] Crop drag/resize ended');
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        // Final render
        this.renderPreviewWithCropOverlay();
      }
    };
  }
  
  // Throttled render for crop mode
  renderCropPreviewThrottled() {
    if (this.cropRenderTimer) return;
    
    this.cropRenderTimer = setTimeout(async () => {
      this.cropRenderTimer = null;
      
      if (!this.bookData?.pages?.length) return;
      
      const container = document.getElementById('page-preview');
      const pageData = this.bookData.pages[this.currentPageIndex];
      const tmpl = getTemplate(this.selectedTemplate);
      const config = this.applyCustomizations(tmpl);
      config.showCropOverlay = true;
      
      await this.renderer.renderToContainer(container, pageData, config, this.customizations);
      
      // Update selection overlay position without re-adding handlers (we're mid-drag)
      const svg = container.querySelector('svg');
      const imageEl = svg?.querySelector('image');
      if (imageEl) {
        const rect = imageEl.getBoundingClientRect();
        const overlay = document.getElementById('selection-overlay');
        const wrapper = document.getElementById('preview-wrapper');
        if (overlay && wrapper) {
          const wrapperRect = wrapper.getBoundingClientRect();
          overlay.style.left = `${rect.left - wrapperRect.left}px`;
          overlay.style.top = `${rect.top - wrapperRect.top}px`;
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
        }
      }
    }, 16);
  }

  bindTextTaskbarEvents() {
    document.getElementById('taskbar-font')?.addEventListener('change', (e) => {
      this.customizations.fontFamily = e.target.value;
      this.preloadFonts([e.target.value]);
      this.renderPreviewAndUpdateOverlay();
    });

    document.getElementById('fontsize-down')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.max(12, (this.customizations.fontSize || 18) - 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreviewAndUpdateOverlay();
    });

    document.getElementById('fontsize-up')?.addEventListener('click', () => {
      this.customizations.fontSize = Math.min(36, (this.customizations.fontSize || 18) + 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreviewAndUpdateOverlay();
    });

    document.querySelectorAll('.taskbar-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.taskbar-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.colorTheme = btn.dataset.theme;
        this.renderPreviewAndUpdateOverlay();
        this.renderThumbnails();
      });
    });

    // Reset text position/scale
    document.getElementById('text-reset')?.addEventListener('click', () => {
      this.pageTextSettings[this.currentPageIndex] = { scale: 1.0, offsetX: 0, offsetY: 0 };
      document.getElementById('text-scale-value').textContent = '100%';
      this.renderPreviewAndUpdateOverlay();
    });

    // Apply text settings to all pages
    document.getElementById('apply-text-all')?.addEventListener('click', () => {
      this.applyTextSettingsToAllPages();
    });
  }

  applyTextSettingsToAllPages() {
    const currentTextSettings = this.getCurrentTextSettings();
    const totalPages = this.bookData?.pages?.length || 0;
    
    for (let i = 0; i < totalPages; i++) {
      this.pageTextSettings[i] = { ...currentTextSettings };
    }
    
    // Visual feedback
    const btn = document.getElementById('apply-text-all');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg><span>Applied!</span>';
      btn.classList.add('applied');
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove('applied');
      }, 1500);
    }
    
    this.renderThumbnails();
  }

  async renderPreviewAndUpdateOverlay() {
    const wasSelected = this.selectedElement;
    const wasCropMode = this.cropMode;
    
    // If in crop mode, use crop-specific render
    if (wasCropMode) {
      await this.renderPreviewWithCropOverlay();
      return;
    }
    
    await this.renderPreview();
    
    // Re-establish selection after render
    if (wasSelected) {
      setTimeout(() => {
        const container = document.getElementById('page-preview');
        const svg = container?.querySelector('svg');
        if (!svg) return;
        
        let element;
        if (wasSelected === 'image') {
          element = svg.querySelector('image');
        } else if (wasSelected === 'text') {
          element = Array.from(svg.querySelectorAll('g')).find(g => g.querySelector('text'));
        }
        
        if (element) {
          const rect = element.getBoundingClientRect();
          this.showSelectionOverlay(wasSelected, rect);
          if (wasSelected === 'image') {
            this.setupImageDrag();
          } else if (wasSelected === 'text') {
            this.setupTextDrag();
          }
        }
      }, 50);
    }
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
    if (!svg) {
      console.log('[UI] No SVG found in container');
      return;
    }

    console.log('[UI] Setting up preview interaction');

    // Get ALL image elements (there may be a crop overlay image too)
    const imageEls = svg.querySelectorAll('image');
    const textGroups = svg.querySelectorAll('g');
    const textGroup = Array.from(textGroups).find(g => g.querySelector('text'));

    console.log('[UI] Found elements:', { imageCount: imageEls.length, textGroup: !!textGroup });

    // Make sure SVG allows pointer events
    svg.style.pointerEvents = 'all';

    // Make ALL images clickable (both main image and crop overlay)
    imageEls.forEach(imageEl => {
      imageEl.style.cursor = 'pointer';
      imageEl.style.pointerEvents = 'all';
      
      imageEl.onclick = (e) => {
        console.log('[UI] Image clicked');
        e.stopPropagation();
        e.preventDefault();
        // Always select using the last (main) image element for bounds
        const mainImage = svg.querySelectorAll('image');
        const targetImage = mainImage[mainImage.length - 1] || imageEl;
        this.selectElement('image', targetImage);
      };
    });

    if (textGroup) {
      textGroup.style.cursor = 'pointer';
      textGroup.style.pointerEvents = 'all';
      
      // Also make individual text elements clickable
      textGroup.querySelectorAll('text').forEach(t => {
        t.style.pointerEvents = 'all';
        t.style.cursor = 'pointer';
      });
      
      textGroup.onclick = (e) => {
        console.log('[UI] Text clicked');
        e.stopPropagation();
        e.preventDefault();
        this.selectElement('text', textGroup);
      };
    }

    // Click on background/svg to deselect
    svg.onclick = (e) => {
      // Only deselect if clicking directly on svg or background rect
      if (e.target === svg || (e.target.tagName === 'rect' && e.target === svg.querySelector('rect'))) {
        console.log('[UI] Background clicked, hiding taskbar');
        this.hideTaskbar();
      }
    };
  }

  selectElement(type, element) {
    console.log('[UI] selectElement:', type);
    
    // Clear any existing drag handlers first
    this.cleanupDragHandlers();
    
    this.selectedElement = type;
    const rect = element.getBoundingClientRect();
    this.showSelectionOverlay(type, rect);
    this.showTaskbar(type);
    
    if (type === 'image') {
      this.setupImageDrag();
    } else if (type === 'text') {
      this.setupTextDrag();
    }
  }
  
  // Show resize handles (for image) or hide them (for text)
  updateResizeHandles(show) {
    const overlay = document.getElementById('selection-overlay');
    if (overlay) {
      overlay.querySelectorAll('.resize-handle').forEach(h => {
        h.style.display = show ? 'block' : 'none';
      });
    }
  }

  setupImageDrag() {
    const overlay = document.getElementById('selection-overlay');
    if (!overlay) return;

    console.log('[UI] Setting up image drag handlers');
    
    // Show resize handles for image
    overlay.querySelectorAll('.resize-handle').forEach(h => {
      h.style.display = 'block';
    });

    // Drag overlay to move the frame position
    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      
      console.log('[UI] Drag started');
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      const frame = this.getCurrentFrameSettings();
      this.dragStartValues = { 
        offsetX: frame.offsetX, 
        offsetY: frame.offsetY,
        scale: frame.scale,
      };
      e.preventDefault();
    };

    // Resize handles - resize the FRAME on the page
    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        console.log('[UI] Resize started', handle.dataset.handle);
        e.stopPropagation();
        this.isResizing = true;
        this.resizeHandle = handle.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY };
        const frame = this.getCurrentFrameSettings();
        this.dragStartValues = { 
          scale: frame.scale,
          offsetX: frame.offsetX,
          offsetY: frame.offsetY,
        };
        e.preventDefault();
      };
    });

    document.onmousemove = (e) => {
      if (!this.isDragging && !this.isResizing) return;
      
      if (this.isDragging) {
        // Move the frame position on the page
        const dx = (e.clientX - this.dragStart.x) / 500;
        const dy = (e.clientY - this.dragStart.y) / 500;
        
        this.setCurrentFrameSettings({
          offsetX: this.dragStartValues.offsetX + dx,
          offsetY: this.dragStartValues.offsetY + dy,
        });
      }
      
      if (this.isResizing) {
        // Resize frame - use larger divisor for 1:1 feel with mouse movement
        const handle = this.resizeHandle;
        let dx = e.clientX - this.dragStart.x;
        let dy = e.clientY - this.dragStart.y;
        
        if (handle === 'nw') { dx = -dx; dy = -dy; }
        else if (handle === 'ne') { dy = -dy; }
        else if (handle === 'sw') { dx = -dx; }
        
        const delta = (dx + dy) / 2 / 200; // Changed from 100 to 200 for smoother 1:1 feel
        const newScale = Math.max(0.3, Math.min(1.5, this.dragStartValues.scale + delta));
        
        this.setCurrentFrameSettings({ scale: newScale });
        
        const scaleDisplay = document.getElementById('frame-scale-value');
        if (scaleDisplay) scaleDisplay.textContent = `${Math.round(newScale * 100)}%`;
      }
      
      // Render preview during drag
      this.renderPreviewThrottled();
    };

    document.onmouseup = () => {
      if (this.isDragging || this.isResizing) {
        console.log('[UI] Drag/resize ended');
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        
        // Final render and update overlay
        this.renderPreviewAndUpdateOverlay();
      }
    };
  }
  
  setupTextDrag() {
    const overlay = document.getElementById('selection-overlay');
    if (!overlay) return;

    console.log('[UI] Setting up text drag handlers');
    
    // Show resize handles for text
    overlay.querySelectorAll('.resize-handle').forEach(h => {
      h.style.display = 'block';
    });

    // Drag overlay to move the text position
    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      
      console.log('[UI] Text drag started');
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      const textSettings = this.getCurrentTextSettings();
      this.dragStartValues = { 
        offsetX: textSettings.offsetX, 
        offsetY: textSettings.offsetY,
        scale: textSettings.scale,
      };
      e.preventDefault();
    };

    // Resize handles - resize the TEXT block on the page
    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        console.log('[UI] Text resize started', handle.dataset.handle);
        e.stopPropagation();
        this.isResizing = true;
        this.resizeHandle = handle.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY };
        const textSettings = this.getCurrentTextSettings();
        this.dragStartValues = { 
          scale: textSettings.scale,
          offsetX: textSettings.offsetX,
          offsetY: textSettings.offsetY,
        };
        e.preventDefault();
      };
    });

    document.onmousemove = (e) => {
      if (!this.isDragging && !this.isResizing) return;
      
      if (this.isDragging) {
        // Move the text position on the page
        const dx = (e.clientX - this.dragStart.x) / 500;
        const dy = (e.clientY - this.dragStart.y) / 500;
        
        this.setCurrentTextSettings({
          offsetX: this.dragStartValues.offsetX + dx,
          offsetY: this.dragStartValues.offsetY + dy,
        });
      }
      
      if (this.isResizing) {
        // Resize text - use larger divisor for 1:1 feel with mouse movement
        const handle = this.resizeHandle;
        let dx = e.clientX - this.dragStart.x;
        let dy = e.clientY - this.dragStart.y;
        
        if (handle === 'nw') { dx = -dx; dy = -dy; }
        else if (handle === 'ne') { dy = -dy; }
        else if (handle === 'sw') { dx = -dx; }
        
        const delta = (dx + dy) / 2 / 200; // Changed from 100 to 200 for smoother 1:1 feel
        const newScale = Math.max(0.5, Math.min(2.0, this.dragStartValues.scale + delta));
        
        this.setCurrentTextSettings({ scale: newScale });
        
        const scaleDisplay = document.getElementById('text-scale-value');
        if (scaleDisplay) scaleDisplay.textContent = `${Math.round(newScale * 100)}%`;
      }
      
      // Render preview during drag
      this.renderPreviewThrottled();
    };

    document.onmouseup = () => {
      if (this.isDragging || this.isResizing) {
        console.log('[UI] Text drag/resize ended');
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        
        // Final render and update overlay
        this.renderPreviewAndUpdateOverlay();
      }
    };
  }
  
  // Throttled render for smooth dragging
  renderPreviewThrottled() {
    if (this.renderThrottleTimer) return;
    
    this.renderThrottleTimer = setTimeout(async () => {
      this.renderThrottleTimer = null;
      
      if (!this.bookData?.pages?.length) return;
      
      const container = document.getElementById('page-preview');
      const pageData = this.bookData.pages[this.currentPageIndex];
      const tmpl = getTemplate(this.selectedTemplate);
      const config = this.applyCustomizations(tmpl);
      
      // Quick render without waiting
      await this.renderer.renderToContainer(container, pageData, config, this.customizations);
      
      // Update selection overlay position without re-adding handlers (we're mid-drag)
      if (this.selectedElement) {
        const svg = container.querySelector('svg');
        let element;
        if (this.selectedElement === 'image') {
          element = svg?.querySelector('image');
        } else if (this.selectedElement === 'text') {
          element = Array.from(svg?.querySelectorAll('g') || []).find(g => g.querySelector('text'));
        }
        if (element) {
          const rect = element.getBoundingClientRect();
          const overlay = document.getElementById('selection-overlay');
          const wrapper = document.getElementById('preview-wrapper');
          if (overlay && wrapper) {
            const wrapperRect = wrapper.getBoundingClientRect();
            overlay.style.left = `${rect.left - wrapperRect.left}px`;
            overlay.style.top = `${rect.top - wrapperRect.top}px`;
            overlay.style.width = `${rect.width}px`;
            overlay.style.height = `${rect.height}px`;
          }
        }
      }
    }, 16); // ~60fps
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
            : `<div class="thumbnail-placeholder"><span>${page.page}</span></div>`
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

    // Apply per-page frame settings (size and position of frame on page)
    const frame = this.getCurrentFrameSettings();
    if (frame.scale !== 1 || frame.offsetX !== 0 || frame.offsetY !== 0) {
      config.layout = config.layout || {};
      config.layout.image = config.layout.image || {};
      const pos = config.layout.image.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
      
      // Scale the frame size
      const scale = frame.scale;
      const newWidth = pos.width * scale;
      const newHeight = pos.height * scale;
      
      // Center the scaled frame (adjust x,y to keep centered)
      const xOffset = (pos.width - newWidth) / 2;
      const yOffset = (pos.height - newHeight) / 2;
      
      config.layout.image.position = {
        ...config.layout.image.position,
        region: {
          x: pos.x + xOffset + frame.offsetX,
          y: pos.y + yOffset + frame.offsetY,
          width: newWidth,
          height: newHeight,
        }
      };
    }

    // Apply per-page crop settings (zoom/pan within the image)
    const crop = this.getCurrentCrop();
    config.cropSettings = {
      zoom: crop.cropZoom,
      x: crop.cropX,
      y: crop.cropY,
    };

    // Apply per-page text settings (size and position of text block on page)
    const textSettings = this.getCurrentTextSettings();
    if (textSettings.scale !== 1 || textSettings.offsetX !== 0 || textSettings.offsetY !== 0) {
      config.layout = config.layout || {};
      config.layout.text = config.layout.text || {};
      const pos = config.layout.text.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };
      
      // Scale the text area size
      const scale = textSettings.scale;
      const newWidth = pos.width * scale;
      const newHeight = pos.height * scale;
      
      // Center the scaled text area (adjust x,y to keep centered)
      const xOffset = (pos.width - newWidth) / 2;
      const yOffset = (pos.height - newHeight) / 2;
      
      config.layout.text.position = {
        ...config.layout.text.position,
        region: {
          x: pos.x + xOffset + textSettings.offsetX,
          y: pos.y + yOffset + textSettings.offsetY,
          width: newWidth,
          height: newHeight,
        }
      };
      
      // Scale the font size proportionally to the text box scale
      config.textScaleMultiplier = scale;
    }

    // Page numbers toggle
    config.showPageNumbers = this.customizations.showPageNumbers !== false;

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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft') document.getElementById('prev-page')?.click();
      else if (e.key === 'ArrowRight') document.getElementById('next-page')?.click();
      else if (e.key === 'Escape') this.hideTaskbar();
    });

    document.getElementById('page-size-select')?.addEventListener('change', (e) => {
      this.renderer = new PageRenderer({ pageSize: e.target.value });
      this.renderPreview();
    });

    // Page numbers toggle
    document.getElementById('show-page-numbers')?.addEventListener('change', (e) => {
      this.customizations.showPageNumbers = e.target.checked;
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

    // Click outside canvas to deselect
    document.getElementById('canvas-area')?.addEventListener('click', (e) => {
      if (!e.target.closest('.page-preview') && !e.target.closest('.floating-taskbar') && !e.target.closest('.selection-overlay')) {
        this.hideTaskbar();
      }
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
        pageCropSettings: this.pageCropSettings,
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