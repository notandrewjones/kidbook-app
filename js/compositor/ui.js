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
import { state } from '../core/state.js';
import { 
  getBookPurchaseStatus, 
  checkPaymentReturn,
  clearPaymentParams,
  formatPrice
} from '../api/checkout.js';
import { 
  updateCartItem,
  getHardcoverSizes 
} from '../api/cart.js';

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
      textAlign: 'center', // 'left', 'center', 'right'
    };
    
    // Per-page crop settings: { [pageIndex]: { cropZoom, cropX, cropY } }
    this.pageCropSettings = {};
    
    // Per-page frame settings: { [pageIndex]: { scale, offsetX, offsetY } }
    this.pageFrameSettings = {};
    
    // Per-page text settings: { [pageIndex]: { scale, offsetX, offsetY } }
    this.pageTextSettings = {};
    
    // View mode: 'single', 'sideBySide', 'grid', 'list'
    this.viewMode = 'single';
    
    // A/B pattern mode: when enabled, odd pages share settings, even pages share settings
    this.abPatternMode = false;
    
    // Grid view state
    this.gridZoom = 1;
    this.gridPan = { x: 0, y: 0 };
    
    // Canvas zoom state
    this.canvasZoom = 1;
    this.minZoom = 0.25;
    this.maxZoom = 3;
    
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
    
    // Undo/Redo system
    this.undoStack = [];
    this.redoStack = [];
    this.maxUndoSteps = 50;
    
    // Cart modal state
    this.purchaseStatus = null;
    this.projectId = null;
    this.cartEbookQty = 0;
    this.hardcoverItems = []; // Array of { size: string, qty: number, price: number }
    this.hardcoverSizes = [];
    this.productPrices = { ebook: 999, hardcover: 2999 };
    
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

  // Get text settings for current page (size and position of the text block)
  getCurrentTextSettings() {
    return this.pageTextSettings[this.currentPageIndex] || {
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
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

    // Hide the workspace header when compositor is active
    const workspaceHead = document.querySelector('.workspace-head');
    if (workspaceHead) workspaceHead.style.display = 'none';
    
    // Make results container take full space without padding
    this.container.style.padding = '0';
    this.container.style.overflow = 'hidden';

    this.container.innerHTML = `
      <div class="compositor-canva" data-view-mode="${this.viewMode}">
        <!-- Top Header Bar -->
        <header class="compositor-topbar">
          <div class="topbar-left">
            <button id="back-btn" class="topbar-btn" title="Back to Storyboard">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div class="topbar-divider"></div>
            <button id="undo-btn" class="topbar-btn" title="Undo (Ctrl+Z)" disabled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
              </svg>
            </button>
            <button id="redo-btn" class="topbar-btn" title="Redo (Ctrl+Shift+Z)" disabled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
              </svg>
            </button>
            <div class="topbar-divider"></div>
            <span class="topbar-title">${this.bookData?.title || 'Book Layout'}</span>
          </div>
          <div class="topbar-center">
            <button id="prev-page" class="topbar-btn" title="Previous page" ${this.viewMode === 'grid' ? 'style="display:none"' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span id="page-indicator" class="page-indicator" ${this.viewMode === 'grid' ? 'style="display:none"' : ''}>Page 1 of ${this.bookData?.pages?.length || 1}</span>
            <button id="next-page" class="topbar-btn" title="Next page" ${this.viewMode === 'grid' ? 'style="display:none"' : ''}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
            
            <div class="topbar-divider" ${this.viewMode === 'grid' || this.viewMode === 'list' ? 'style="display:none"' : ''}></div>
            
            <!-- Zoom Controls -->
            <div class="zoom-controls" id="zoom-controls" ${this.viewMode === 'grid' || this.viewMode === 'list' ? 'style="display:none"' : ''}>
              <button id="zoom-out-btn" class="zoom-btn" title="Zoom Out (Ctrl+-)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35M8 11h6"/>
                </svg>
              </button>
              <span id="zoom-level" class="zoom-level" title="Click to reset zoom">100%</span>
              <button id="zoom-in-btn" class="zoom-btn" title="Zoom In (Ctrl++)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
                </svg>
              </button>
              <button id="zoom-fit-btn" class="zoom-btn" title="Fit to Screen">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="topbar-right">
            <!-- View Mode Dropdown -->
            <div class="topbar-dropdown-wrap">
              <button id="view-mode-btn" class="topbar-dropdown-btn" title="View Mode">
                ${this.getViewModeIcon(this.viewMode)}
                <span class="dropdown-label">${this.getViewModeLabel(this.viewMode)}</span>
                <svg class="dropdown-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              <div id="view-mode-dropdown" class="topbar-dropdown hidden">
                <button class="dropdown-item ${this.viewMode === 'single' ? 'active' : ''}" data-view="single">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="3" width="16" height="18" rx="2"/>
                  </svg>
                  <span>Single Page</span>
                </button>
                <button class="dropdown-item ${this.viewMode === 'sideBySide' ? 'active' : ''}" data-view="sideBySide">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="3" width="8" height="18" rx="1"/>
                    <rect x="14" y="3" width="8" height="18" rx="1"/>
                  </svg>
                  <span>Side by Side</span>
                </button>
                <button class="dropdown-item ${this.viewMode === 'grid' ? 'active' : ''}" data-view="grid">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  <span>Grid View</span>
                </button>
                <button class="dropdown-item ${this.viewMode === 'list' ? 'active' : ''}" data-view="list">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="4" y="4" width="16" height="4" rx="1"/>
                    <rect x="4" y="10" width="16" height="4" rx="1"/>
                    <rect x="4" y="16" width="16" height="4" rx="1"/>
                  </svg>
                  <span>List View</span>
                </button>
              </div>
            </div>
            
            <div class="topbar-divider"></div>
            
            <!-- A/B Pattern Toggle -->
            <button id="ab-pattern-btn" class="topbar-btn ${this.abPatternMode ? 'active' : ''}" title="A/B Pattern Mode">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 7h6M4 12h6M4 17h6"/>
                <rect x="14" y="5" width="6" height="4" rx="1"/>
                <rect x="14" y="15" width="6" height="4" rx="1"/>
              </svg>
              <span>A/B</span>
            </button>
            
            <div class="topbar-divider"></div>
            
            <label class="topbar-checkbox" title="Show page numbers on pages">
              <input type="checkbox" id="show-page-numbers" checked>
              <span>Page #</span>
            </label>
            <div class="topbar-divider"></div>
            
            <!-- Page Size Dropdown with Icons -->
            <div class="topbar-dropdown-wrap">
              <button id="page-size-btn" class="topbar-dropdown-btn" title="Page Size">
                ${this.getPageSizeIcon(this.renderer?.pageSize || 'square-medium')}
                <span class="dropdown-label">${PAGE_DIMENSIONS[this.renderer?.pageSize || 'square-medium']?.name || '8" × 8"'}</span>
                <svg class="dropdown-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              <div id="page-size-dropdown" class="topbar-dropdown hidden">
                ${Object.entries(PAGE_DIMENSIONS).map(([key, dim]) => `
                  <button class="dropdown-item ${key === (this.renderer?.pageSize || 'square-medium') ? 'active' : ''}" data-size="${key}">
                    ${this.getPageSizeIcon(key)}
                    <span>${dim.name}</span>
                  </button>
                `).join('')}
              </div>
            </div>
            
            <button id="checkout-btn" class="topbar-btn topbar-btn-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>
              </svg>
              <span>Add to Cart</span>
            </button>
          </div>
        </header>

        <!-- Main Layout -->
        <div class="compositor-main">
          <!-- Left Sidebar -->
          <aside class="compositor-sidebar">
            <div class="sidebar-header">
              <h3>Style</h3>
            </div>
            <div class="sidebar-content">
              <!-- Color Themes Section -->
              <div class="sidebar-section">
                <div class="sidebar-section-header" id="color-section-toggle">
                  <span>Color Theme</span>
                  <svg class="section-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </div>
                <div id="color-themes-grid" class="color-themes-grid">
                  ${this.renderColorThemes()}
                </div>
              </div>
              
              <!-- Templates Section -->
              <div class="sidebar-section">
                <div class="sidebar-section-header">
                  <span>Layout Templates</span>
                </div>
                <div id="template-gallery" class="template-gallery"></div>
              </div>
            </div>
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
            
            <!-- Page Thumbnails - hidden in grid/list views -->
            <div class="thumbnails-strip" id="thumbnails-strip">
              <div id="preview-thumbnails" class="preview-thumbnails"></div>
            </div>

            <!-- Floating Taskbar - Inside canvas area for proper centering -->
            <div id="floating-taskbar" class="floating-taskbar hidden">
              <div id="taskbar-content" class="taskbar-content"></div>
            </div>
          </main>
        </div>

        <!-- Add to Cart Modal -->
        <div id="add-to-cart-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-dialog cart-modal-dialog">
            <div class="modal-header">
              <h3>Add to Cart</h3>
              <button id="close-cart-modal" class="modal-close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="modal-body cart-modal-body">
              <p class="cart-modal-subtitle">Choose your preferred format and quantity below</p>
              
              <!-- Ebook Section -->
              <div class="cart-section cart-section-ebook" id="ebook-section">
                <label class="cart-section-toggle">
                  <input type="checkbox" id="cart-ebook-checkbox" class="cart-checkbox-input">
                  <div class="cart-checkbox-box">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  </div>
                  <div class="cart-section-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/>
                    </svg>
                  </div>
                  <div class="cart-section-info">
                    <div class="cart-section-title">Digital Ebook</div>
                    <div class="cart-section-desc">Instant PDF download • Read on any device</div>
                  </div>
                  <div class="cart-section-price" id="cart-ebook-price">$9.99</div>
                </label>
              </div>

              <!-- Hardcover Section -->
              <div class="cart-section cart-section-hardcover">
                <div class="cart-section-header">
                  <div class="cart-section-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"/>
                      <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" stroke-width="1.5"/>
                    </svg>
                  </div>
                  <div class="cart-section-info">
                    <div class="cart-section-title">Printed Hardcover</div>
                    <div class="cart-section-desc">Premium quality • Ships in 5-7 days</div>
                  </div>
                </div>
                
                <div id="hardcover-sizes-container">
                  <!-- Hardcover size rows will be inserted here -->
                </div>
                
                <button type="button" id="add-another-size-btn" class="add-another-size-btn hidden">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Add Another Size
                </button>
              </div>

              <div id="cart-modal-error" class="checkout-error hidden"></div>
            </div>
            
            <div class="cart-modal-footer">
              <div class="cart-modal-total">
                <span>Subtotal</span>
                <span id="cart-modal-subtotal">$0.00</span>
              </div>
              <button id="add-to-cart-btn" class="add-to-cart-btn" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>
                </svg>
                Add to Cart
              </button>
            </div>
          </div>
        </div>

        <!-- Legacy Export Modal (for unlocked books) -->
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

        <!-- A/B Pattern Confirm Modal -->
        <div id="ab-confirm-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-dialog modal-dialog-sm">
            <div class="modal-header">
              <h3>Enable A/B Pattern Mode?</h3>
              <button id="close-ab-modal" class="modal-close">×</button>
            </div>
            <div class="modal-body">
              <p class="modal-text">
                This will link your page layouts so that:
              </p>
              <ul class="modal-list">
                <li><strong>Odd pages</strong> (1, 3, 5...) share the same layout</li>
                <li><strong>Even pages</strong> (2, 4, 6...) share the same layout</li>
              </ul>
              <p class="modal-text modal-text-muted">
                Changes to image/text position and size will automatically apply to matching pages. Crop settings remain independent.
              </p>
              <div class="modal-actions">
                <button id="ab-confirm-no" class="modal-btn modal-btn-secondary">Cancel</button>
                <button id="ab-confirm-yes" class="modal-btn modal-btn-primary">Enable A/B Mode</button>
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
        <label class="taskbar-label">Snap</label>
        <div class="taskbar-snap-btns">
          <button class="taskbar-btn" id="img-snap-left" title="Snap to Left (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v16"/><rect x="8" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="img-snap-center-h" title="Center Horizontally">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 4v16"/><rect x="6" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="img-snap-right" title="Snap to Right (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 4v16"/><rect x="4" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="img-snap-top" title="Snap to Top (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16"/><rect x="8" y="8" width="8" height="12" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="img-snap-center-v" title="Center Vertically">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12h16"/><rect x="8" y="6" width="8" height="12" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="img-snap-bottom" title="Snap to Bottom (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 20h16"/><rect x="8" y="4" width="8" height="12" rx="1"/>
            </svg>
          </button>
        </div>
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

  getViewModeIcon(mode) {
    const icons = {
      single: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/></svg>',
      sideBySide: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>',
      grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
      list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="4" rx="1"/><rect x="4" y="10" width="16" height="4" rx="1"/><rect x="4" y="16" width="16" height="4" rx="1"/></svg>',
    };
    return icons[mode] || icons.single;
  }

  getViewModeLabel(mode) {
    const labels = {
      single: 'Single',
      sideBySide: 'Spread',
      grid: 'Grid',
      list: 'List',
    };
    return labels[mode] || 'Single';
  }

  getPageSizeIcon(size) {
    const icons = {
      'square-small': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
      'square-medium': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
      'square-large': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
      'portrait': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="2"/></svg>',
      'landscape': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="12" rx="2"/></svg>',
      'standard': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/></svg>',
    };
    return icons[size] || icons['square-medium'];
  }

  renderColorThemes() {
    const themes = Object.values(COLOR_THEMES);
    const currentTheme = this.customizations.colorTheme || 'cream';
    
    return themes.map(theme => `
      <button class="color-theme-btn ${theme.id === currentTheme ? 'active' : ''}"
              data-theme="${theme.id}"
              title="${theme.name}"
              style="--theme-bg: ${theme.background}; --theme-accent: ${theme.accent}; --theme-text: ${theme.text}">
        <span class="color-theme-swatch" style="background: ${theme.background}; border-color: ${theme.accent}">
          <span class="color-theme-accent" style="background: ${theme.accent}"></span>
        </span>
      </button>
    `).join('');
  }

  renderTextTaskbar() {
    const tmpl = getTemplate(this.selectedTemplate);
    const currentFont = this.customizations.fontFamily || tmpl.typography?.fontFamily || 'Merriweather';
    const currentSize = this.customizations.fontSize || tmpl.typography?.baseFontSize || 18;
    const textSettings = this.getCurrentTextSettings();
    const currentAlign = this.customizations.textAlign || 'center';
    
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
        <label class="taskbar-label">Align</label>
        <div class="taskbar-align-btns">
          <button class="taskbar-btn ${currentAlign === 'left' ? 'active' : ''}" id="text-align-left" title="Align Left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M3 12h12M3 18h18"/>
            </svg>
          </button>
          <button class="taskbar-btn ${currentAlign === 'center' ? 'active' : ''}" id="text-align-center" title="Align Center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M6 12h12M3 18h18"/>
            </svg>
          </button>
          <button class="taskbar-btn ${currentAlign === 'right' ? 'active' : ''}" id="text-align-right" title="Align Right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M9 12h12M3 18h18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Snap</label>
        <div class="taskbar-snap-btns">
          <button class="taskbar-btn" id="snap-left" title="Snap to Left (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4v16"/><rect x="8" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="snap-center-h" title="Center Horizontally">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 4v16"/><rect x="6" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="snap-right" title="Snap to Right (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 4v16"/><rect x="4" y="8" width="12" height="8" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="snap-top" title="Snap to Top (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16"/><rect x="8" y="8" width="8" height="12" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="snap-center-v" title="Center Vertically">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 12h16"/><rect x="8" y="6" width="8" height="12" rx="1"/>
            </svg>
          </button>
          <button class="taskbar-btn" id="snap-bottom" title="Snap to Bottom (3% margin)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 20h16"/><rect x="8" y="4" width="8" height="12" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="taskbar-divider"></div>
      <div class="taskbar-section">
        <label class="taskbar-label">Scale</label>
        <span class="taskbar-value" id="text-scale-value">${Math.round(textSettings.scale * 100)}%</span>
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
        this.saveUndoState();
        document.querySelectorAll('.taskbar-frame-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.frame = btn.dataset.frame;
        this.renderPreviewAndUpdateOverlay();
      });
    });

    // Image snap buttons
    document.getElementById('img-snap-left')?.addEventListener('click', () => this.snapElement('image', 'left'));
    document.getElementById('img-snap-center-h')?.addEventListener('click', () => this.snapElement('image', 'center-h'));
    document.getElementById('img-snap-right')?.addEventListener('click', () => this.snapElement('image', 'right'));
    document.getElementById('img-snap-top')?.addEventListener('click', () => this.snapElement('image', 'top'));
    document.getElementById('img-snap-center-v')?.addEventListener('click', () => this.snapElement('image', 'center-v'));
    document.getElementById('img-snap-bottom')?.addEventListener('click', () => this.snapElement('image', 'bottom'));

    // Crop mode toggle
    document.getElementById('crop-mode-btn')?.addEventListener('click', () => {
      this.toggleCropMode();
    });

    // Reset all
    document.getElementById('frame-reset')?.addEventListener('click', () => {
      this.saveUndoState();
      this.pageFrameSettings[this.currentPageIndex] = { scale: 1.0, offsetX: 0, offsetY: 0 };
      this.pageCropSettings[this.currentPageIndex] = { cropZoom: 1.0, cropX: 0.5, cropY: 0.5 };
      document.getElementById('frame-scale-value').textContent = '100%';
      this.renderPreviewAndUpdateOverlay();
    });

    // Apply image settings to all pages
    document.getElementById('apply-image-all')?.addEventListener('click', () => {
      this.saveUndoState();
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
      this.saveUndoState(); // Save state BEFORE starting crop drag
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
        this.saveUndoState(); // Save state BEFORE starting crop resize
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
      this.saveUndoState();
      this.customizations.fontFamily = e.target.value;
      this.preloadFonts([e.target.value]);
      this.renderPreviewAndUpdateOverlay();
    });

    document.getElementById('fontsize-down')?.addEventListener('click', () => {
      this.saveUndoState();
      this.customizations.fontSize = Math.max(12, (this.customizations.fontSize || 18) - 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreviewAndUpdateOverlay();
    });

    document.getElementById('fontsize-up')?.addEventListener('click', () => {
      this.saveUndoState();
      this.customizations.fontSize = Math.min(36, (this.customizations.fontSize || 18) + 2);
      document.getElementById('fontsize-value').textContent = `${this.customizations.fontSize}px`;
      this.renderPreviewAndUpdateOverlay();
    });

    // Text alignment buttons
    ['left', 'center', 'right'].forEach(align => {
      document.getElementById(`text-align-${align}`)?.addEventListener('click', () => {
        this.saveUndoState();
        this.customizations.textAlign = align;
        // Update button states
        document.querySelectorAll('.taskbar-align-btns .taskbar-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(`text-align-${align}`)?.classList.add('active');
        this.renderPreviewAndUpdateOverlay();
        this.renderThumbnails();
      });
    });

    // Text snap buttons
    document.getElementById('snap-left')?.addEventListener('click', () => this.snapElement('text', 'left'));
    document.getElementById('snap-center-h')?.addEventListener('click', () => this.snapElement('text', 'center-h'));
    document.getElementById('snap-right')?.addEventListener('click', () => this.snapElement('text', 'right'));
    document.getElementById('snap-top')?.addEventListener('click', () => this.snapElement('text', 'top'));
    document.getElementById('snap-center-v')?.addEventListener('click', () => this.snapElement('text', 'center-v'));
    document.getElementById('snap-bottom')?.addEventListener('click', () => this.snapElement('text', 'bottom'));

    // Reset text position/scale
    document.getElementById('text-reset')?.addEventListener('click', () => {
      this.saveUndoState();
      this.pageTextSettings[this.currentPageIndex] = { scale: 1.0, offsetX: 0, offsetY: 0 };
      document.getElementById('text-scale-value').textContent = '100%';
      this.renderPreviewAndUpdateOverlay();
    });

    // Apply text settings to all pages
    document.getElementById('apply-text-all')?.addEventListener('click', () => {
      this.saveUndoState();
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
    
    // Use renderViewMode to respect current view, not just renderPreview
    // This prevents switching to single view when editing in spread mode
    if (this.viewMode === 'single') {
      await this.renderPreview();
    } else {
      // For other views, use renderViewMode but don't disturb selection
      this.renderViewMode();
    }
    
    // Re-establish selection after render (only for single view)
    if (wasSelected && this.viewMode === 'single') {
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
      this.saveUndoState(); // Save state BEFORE starting drag
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
        this.saveUndoState(); // Save state BEFORE starting resize
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
      this.saveUndoState(); // Save state BEFORE starting drag
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
        this.saveUndoState(); // Save state BEFORE starting resize
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
    const strip = document.getElementById('thumbnails-strip');
    
    // Hide thumbnails in grid and list views
    if (this.viewMode === 'grid' || this.viewMode === 'list') {
      if (strip) strip.style.display = 'none';
      return;
    } else {
      if (strip) strip.style.display = '';
    }

    const tmpl = getTemplate(this.selectedTemplate);

    if (this.viewMode === 'sideBySide') {
      // Render thumbnails as spreads (pairs)
      this.renderSpreadThumbnails(container, tmpl);
    } else {
      // Render individual page thumbnails
      this.renderSingleThumbnails(container, tmpl);
    }
  }

  async renderSingleThumbnails(container, tmpl) {
    container.innerHTML = '';
    
    for (let i = 0; i < this.bookData.pages.length; i++) {
      const page = this.bookData.pages[i];
      const config = this.applyCustomizationsForPage(tmpl, i);
      
      const thumbWrap = document.createElement('div');
      thumbWrap.className = `thumbnail ${i === this.currentPageIndex ? 'active' : ''}`;
      thumbWrap.dataset.pageIndex = i;
      
      const thumbInner = document.createElement('div');
      thumbInner.className = 'thumbnail-inner';
      
      // Render actual page preview
      try {
        const svg = await this.renderer.render(page, config);
        thumbInner.appendChild(svg);
      } catch (e) {
        thumbInner.innerHTML = `<div class="thumbnail-placeholder"><span>${page.page}</span></div>`;
      }
      
      const thumbNumber = document.createElement('span');
      thumbNumber.className = 'thumbnail-number';
      thumbNumber.textContent = page.page;
      
      thumbWrap.appendChild(thumbInner);
      thumbWrap.appendChild(thumbNumber);
      container.appendChild(thumbWrap);
      
      thumbWrap.addEventListener('click', () => {
        this.currentPageIndex = i;
        this.renderViewMode();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      });
    }
  }

  async renderSpreadThumbnails(container, tmpl) {
    container.innerHTML = '';
    
    const totalPages = this.bookData.pages.length;
    const currentSpread = Math.floor(this.currentPageIndex / 2);
    
    for (let spread = 0; spread < Math.ceil(totalPages / 2); spread++) {
      const leftIndex = spread * 2;
      const rightIndex = leftIndex + 1;
      
      const spreadWrap = document.createElement('div');
      spreadWrap.className = `thumbnail-spread ${spread === currentSpread ? 'active' : ''}`;
      spreadWrap.dataset.spreadIndex = spread;
      
      const spreadInner = document.createElement('div');
      spreadInner.className = 'thumbnail-spread-inner';
      
      // Left page
      const leftPage = this.bookData.pages[leftIndex];
      if (leftPage) {
        const leftThumb = document.createElement('div');
        leftThumb.className = 'thumbnail-spread-page';
        try {
          const config = this.applyCustomizationsForPage(tmpl, leftIndex);
          const svg = await this.renderer.render(leftPage, config);
          leftThumb.appendChild(svg);
        } catch (e) {
          leftThumb.innerHTML = `<span>${leftPage.page}</span>`;
        }
        spreadInner.appendChild(leftThumb);
      }
      
      // Right page
      if (rightIndex < totalPages) {
        const rightPage = this.bookData.pages[rightIndex];
        const rightThumb = document.createElement('div');
        rightThumb.className = 'thumbnail-spread-page';
        try {
          const config = this.applyCustomizationsForPage(tmpl, rightIndex);
          const svg = await this.renderer.render(rightPage, config);
          rightThumb.appendChild(svg);
        } catch (e) {
          rightThumb.innerHTML = `<span>${rightPage.page}</span>`;
        }
        spreadInner.appendChild(rightThumb);
      }
      
      const spreadLabel = document.createElement('span');
      spreadLabel.className = 'thumbnail-spread-label';
      spreadLabel.textContent = rightIndex < totalPages ? `${leftIndex + 1}-${rightIndex + 1}` : `${leftIndex + 1}`;
      
      spreadWrap.appendChild(spreadInner);
      spreadWrap.appendChild(spreadLabel);
      container.appendChild(spreadWrap);
      
      spreadWrap.addEventListener('click', () => {
        this.currentPageIndex = leftIndex;
        this.renderViewMode();
        this.updateSpreadThumbnailSelection();
        this.hideTaskbar();
      });
    }
  }

  updateThumbnailSelection() {
    if (this.viewMode === 'sideBySide') {
      this.updateSpreadThumbnailSelection();
      return;
    }
    document.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.classList.toggle('active', i === this.currentPageIndex);
    });
  }

  updateSpreadThumbnailSelection() {
    const currentSpread = Math.floor(this.currentPageIndex / 2);
    document.querySelectorAll('.thumbnail-spread').forEach((thumb) => {
      const spread = parseInt(thumb.dataset.spreadIndex);
      thumb.classList.toggle('active', spread === currentSpread);
    });
  }

  updatePageIndicator() {
    const indicator = document.getElementById('page-indicator');
    if (indicator) {
      if (this.viewMode === 'sideBySide') {
        const spreadIndex = Math.floor(this.currentPageIndex / 2);
        const leftPage = spreadIndex * 2 + 1;
        const rightPage = Math.min(leftPage + 1, this.bookData.pages.length);
        const totalSpreads = Math.ceil(this.bookData.pages.length / 2);
        if (rightPage > leftPage && rightPage <= this.bookData.pages.length) {
          indicator.textContent = `Pages ${leftPage}-${rightPage} of ${this.bookData.pages.length}`;
        } else {
          indicator.textContent = `Page ${leftPage} of ${this.bookData.pages.length}`;
        }
      } else {
        indicator.textContent = `Page ${this.currentPageIndex + 1} of ${this.bookData.pages.length}`;
      }
    }
  }

  selectTemplate(templateId) {
    // Save undo state before change
    this.saveUndoState();
    
    this.selectedTemplate = templateId;
    
    // Reset all frame and text positions (but NOT crop settings)
    const totalPages = this.bookData?.pages?.length || 0;
    for (let i = 0; i < totalPages; i++) {
      this.pageFrameSettings[i] = { scale: 1.0, offsetX: 0, offsetY: 0 };
      this.pageTextSettings[i] = { scale: 1.0, offsetX: 0, offsetY: 0 };
    }
    
    // Reset global customizations except for things that should persist
    this.customizations.frame = null;
    this.customizations.fontFamily = null;
    this.customizations.fontSize = null;
    this.customizations.colorTheme = null;
    // Keep showPageNumbers as-is
    
    // Update UI and template gallery selection
    document.querySelectorAll('.template-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.template === templateId);
    });
    
    this.renderViewMode();
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

    // Apply text alignment
    if (this.customizations.textAlign) {
      config.layout = config.layout || {};
      config.layout.text = config.layout.text || {};
      config.layout.text.align = this.customizations.textAlign;
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
      if (this.viewMode === 'sideBySide') {
        // Navigate by spreads (2 pages at a time)
        const currentSpread = Math.floor(this.currentPageIndex / 2);
        if (currentSpread > 0) {
          this.currentPageIndex = (currentSpread - 1) * 2;
          this.renderViewMode();
          this.updateThumbnailSelection();
          this.hideTaskbar();
        }
      } else if (this.currentPageIndex > 0) {
        this.currentPageIndex--;
        this.renderViewMode();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    document.getElementById('next-page')?.addEventListener('click', () => {
      if (this.viewMode === 'sideBySide') {
        // Navigate by spreads (2 pages at a time)
        const currentSpread = Math.floor(this.currentPageIndex / 2);
        const maxSpread = Math.floor((this.bookData.pages.length - 1) / 2);
        if (currentSpread < maxSpread) {
          this.currentPageIndex = (currentSpread + 1) * 2;
          this.renderViewMode();
          this.updateThumbnailSelection();
          this.hideTaskbar();
        }
      } else if (this.currentPageIndex < this.bookData.pages.length - 1) {
        this.currentPageIndex++;
        this.renderViewMode();
        this.updateThumbnailSelection();
        this.hideTaskbar();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      
      // Undo: Ctrl+Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }
      
      // Redo: Ctrl+Shift+Z or Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && (e.key === 'Z' || e.key === 'y')) {
        e.preventDefault();
        this.redo();
        return;
      }
      
      if (e.key === 'ArrowLeft') document.getElementById('prev-page')?.click();
      else if (e.key === 'ArrowRight') document.getElementById('next-page')?.click();
      else if (e.key === 'Escape') this.hideTaskbar();
    });

    // Undo/Redo buttons
    document.getElementById('undo-btn')?.addEventListener('click', () => this.undo());
    document.getElementById('redo-btn')?.addEventListener('click', () => this.redo());

    // Back to Storyboard button
    document.getElementById('back-btn')?.addEventListener('click', () => {
      this.goBackToStoryboard();
    });

    // Color theme buttons in sidebar
    document.querySelectorAll('.color-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.saveUndoState();
        document.querySelectorAll('.color-theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.customizations.colorTheme = btn.dataset.theme;
        this.renderViewMode();
        this.renderThumbnails();
      });
    });

    // Color section toggle (expand/collapse)
    document.getElementById('color-section-toggle')?.addEventListener('click', () => {
      const grid = document.getElementById('color-themes-grid');
      if (grid) {
        grid.classList.toggle('collapsed');
        document.querySelector('.section-chevron')?.classList.toggle('rotated');
      }
    });

    // View Mode Dropdown
    document.getElementById('view-mode-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown('view-mode-dropdown');
    });

    document.querySelectorAll('#view-mode-dropdown .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const newMode = item.dataset.view;
        this.setViewMode(newMode);
        this.closeAllDropdowns();
      });
    });

    // Page Size Dropdown
    document.getElementById('page-size-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown('page-size-dropdown');
    });

    document.querySelectorAll('#page-size-dropdown .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        this.saveUndoState(); // Track page size changes
        const newSize = item.dataset.size;
        this.renderer = new PageRenderer({ pageSize: newSize });
        this.updatePageSizeButton(newSize);
        this.renderViewMode();
        this.renderThumbnails();
        this.closeAllDropdowns();
      });
    });

    // A/B Pattern Toggle
    document.getElementById('ab-pattern-btn')?.addEventListener('click', () => {
      if (!this.abPatternMode) {
        this.showABPatternConfirm();
      } else {
        this.saveUndoState(); // Track A/B mode changes
        this.disableABPattern();
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar-dropdown-wrap')) {
        this.closeAllDropdowns();
      }
    });

    // Page numbers toggle
    document.getElementById('show-page-numbers')?.addEventListener('change', (e) => {
      this.saveUndoState(); // Track page numbers toggle
      this.customizations.showPageNumbers = e.target.checked;
      this.renderViewMode();
      this.renderThumbnails();
    });

    // Add to Cart button - opens cart modal
    document.getElementById('checkout-btn')?.addEventListener('click', () => {
      this.openAddToCartModal();
    });

    document.getElementById('close-cart-modal')?.addEventListener('click', () => {
      this.closeAddToCartModal();
    });

    document.querySelector('#add-to-cart-modal .modal-backdrop')?.addEventListener('click', () => {
      this.closeAddToCartModal();
    });

    // Close custom selects when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-select')) {
        document.querySelectorAll('.custom-select.open').forEach(s => {
          s.classList.remove('open');
          s.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
        });
      }
    });

    // Ebook checkbox toggle
    document.getElementById('cart-ebook-checkbox')?.addEventListener('change', (e) => {
      this.cartEbookQty = e.target.checked ? 1 : 0;
      const section = document.getElementById('ebook-section');
      section?.classList.toggle('selected', e.target.checked);
      this.updateCartModalUI(true);
    });

    // Add another size button
    document.getElementById('add-another-size-btn')?.addEventListener('click', () => {
      this.addHardcoverSizeRow();
    });

    // Add to Cart submit button
    document.getElementById('add-to-cart-btn')?.addEventListener('click', () => {
      this.submitAddToCart();
    });

    // Legacy export modal handlers
    document.getElementById('close-export-modal')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    document.querySelector('#export-modal .modal-backdrop')?.addEventListener('click', () => {
      document.getElementById('export-modal')?.classList.add('hidden');
    });

    document.querySelectorAll('.export-option').forEach(opt => {
      opt.addEventListener('click', () => this.handleExport(opt.dataset.format));
    });

    // A/B Confirm Modal buttons
    document.getElementById('ab-confirm-yes')?.addEventListener('click', () => {
      this.enableABPattern();
      document.getElementById('ab-confirm-modal')?.classList.add('hidden');
    });

    document.getElementById('ab-confirm-no')?.addEventListener('click', () => {
      document.getElementById('ab-confirm-modal')?.classList.add('hidden');
    });

    document.getElementById('close-ab-modal')?.addEventListener('click', () => {
      document.getElementById('ab-confirm-modal')?.classList.add('hidden');
    });

    // Click outside canvas to deselect
    document.getElementById('canvas-area')?.addEventListener('click', (e) => {
      if (!e.target.closest('.page-preview') && !e.target.closest('.floating-taskbar') && !e.target.closest('.selection-overlay')) {
        this.hideTaskbar();
      }
    });
    
    // Bind zoom events
    this.bindZoomEvents();
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

  // ============================================
  // Add to Cart Methods
  // ============================================

  async openAddToCartModal() {
    // Try to get projectId from URL if not already set
    if (!this.projectId) {
      const pathMatch = window.location.pathname.match(/\/p\/([^\/]+)/);
      if (pathMatch) {
        this.projectId = pathMatch[1];
      }
    }
    
    const modal = document.getElementById('add-to-cart-modal');
    if (!modal) return;

    // Reset state
    this.cartEbookQty = 0;
    this.hardcoverItems = [];
    
    // Clear any existing hardcover rows
    const container = document.getElementById('hardcover-sizes-container');
    if (container) container.innerHTML = '';
    
    // Use cached sizes if available, otherwise use defaults immediately
    if (!this.hardcoverSizes || this.hardcoverSizes.length === 0) {
      this.hardcoverSizes = [
        { size_code: 'square-small', display_name: 'Small Square', dimensions: '7" × 7"', price_cents: 2499, priceFormatted: '$24.99' },
        { size_code: 'square-medium', display_name: 'Medium Square', dimensions: '8" × 8"', price_cents: 2999, priceFormatted: '$29.99' },
        { size_code: 'square-large', display_name: 'Large Square', dimensions: '10" × 10"', price_cents: 3999, priceFormatted: '$39.99' },
        { size_code: 'portrait', display_name: 'Portrait', dimensions: '7" × 9"', price_cents: 2999, priceFormatted: '$29.99' },
        { size_code: 'landscape', display_name: 'Landscape', dimensions: '10" × 7"', price_cents: 3499, priceFormatted: '$34.99' },
        { size_code: 'standard', display_name: 'Standard', dimensions: '8.5" × 11"', price_cents: 3499, priceFormatted: '$34.99' },
      ];
    }
    
    // Add initial hardcover row IMMEDIATELY (before async calls)
    this.addHardcoverSizeRow();
    this.updateCartModalUI();
    
    // Show modal
    modal.classList.remove('hidden');

    // Fetch prices and sizes in background (non-blocking)
    this.fetchCartPricesInBackground();
  }
  
  // Separate async function for background price fetching
  async fetchCartPricesInBackground() {
    try {
      if (this.projectId) {
        this.purchaseStatus = await getBookPurchaseStatus(this.projectId);
        if (this.purchaseStatus?.products) {
          this.productPrices.ebook = this.purchaseStatus.products.ebook?.priceCents || 999;
          this.productPrices.hardcover = this.purchaseStatus.products.hardcover?.priceCents || 2999;
          
          // Update ebook price display
          const ebookPrice = document.getElementById('cart-ebook-price');
          if (ebookPrice) ebookPrice.textContent = formatPrice(this.productPrices.ebook);
        }
      }
      
      // Try to load updated hardcover sizes
      try {
        const { sizes } = await getHardcoverSizes();
        if (sizes && sizes.length > 0) {
          this.hardcoverSizes = sizes;
          // Update the existing dropdown if modal is still open
          this.refreshHardcoverDropdowns();
        }
      } catch (e) {
        console.log('[Cart] Using default hardcover sizes');
      }
      
    } catch (err) {
      console.error('[Cart] Failed to fetch product info:', err);
    }
  }
  
  // Refresh hardcover dropdowns with updated sizes (if fetched from API)
  refreshHardcoverDropdowns() {
    const selects = document.querySelectorAll('.hardcover-size-select');
    selects.forEach((select, idx) => {
      const currentValue = select.value;
      select.innerHTML = this.hardcoverSizes.map(size => 
        `<option value="${size.size_code}" ${size.size_code === currentValue ? 'selected' : ''} data-price="${size.price_cents}">
          ${size.display_name} (${size.dimensions})
        </option>`
      ).join('');
      
      // Update price display
      const row = select.closest('.hardcover-size-row');
      const priceEl = row?.querySelector('.hardcover-row-price');
      const sizeInfo = this.hardcoverSizes.find(s => s.size_code === currentValue);
      if (priceEl && sizeInfo) {
        priceEl.textContent = sizeInfo.priceFormatted;
        if (this.hardcoverItems[idx]) {
          this.hardcoverItems[idx].price = sizeInfo.price_cents;
        }
      }
    });
  }

  closeAddToCartModal() {
    const modal = document.getElementById('add-to-cart-modal');
    modal?.classList.add('hidden');
    
    // Clear hardcover container
    const container = document.getElementById('hardcover-sizes-container');
    if (container) container.innerHTML = '';
  }

  openExportModal() {
    document.getElementById('export-modal')?.classList.remove('hidden');
  }

  addHardcoverSizeRow(selectedSize = 'square-medium') {
    const container = document.getElementById('hardcover-sizes-container');
    if (!container) return;

    const rowIndex = this.hardcoverItems.length;
    const sizeInfo = this.hardcoverSizes.find(s => s.size_code === selectedSize) || this.hardcoverSizes[1];
    
    // Add to items array
    this.hardcoverItems.push({
      size: selectedSize,
      qty: 0,
      price: sizeInfo?.price_cents || 2999
    });

    const row = document.createElement('div');
    row.className = 'hardcover-size-row';
    row.dataset.index = rowIndex;
    row.innerHTML = `
      <div class="hardcover-size-select-wrap">
        <div class="custom-select" data-index="${rowIndex}">
          <button type="button" class="custom-select-trigger" aria-haspopup="listbox" aria-expanded="false">
            <span class="custom-select-value">${sizeInfo?.display_name || 'Medium Square'}</span>
            <span class="custom-select-dims">${sizeInfo?.dimensions || '8" × 8"'}</span>
            <svg class="custom-select-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          <div class="custom-select-dropdown" role="listbox">
            ${this.hardcoverSizes.map(size => 
              `<div class="custom-select-option ${size.size_code === selectedSize ? 'selected' : ''}" 
                   data-value="${size.size_code}" 
                   data-price="${size.price_cents}"
                   data-display="${size.display_name}"
                   data-dims="${size.dimensions}"
                   data-formatted="${size.priceFormatted}"
                   role="option">
                <span class="option-name">${size.display_name}</span>
                <span class="option-dims">${size.dimensions}</span>
                <span class="option-price">${size.priceFormatted}</span>
                <svg class="option-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12l5 5L20 7"/>
                </svg>
              </div>`
            ).join('')}
          </div>
        </div>
        <span class="hardcover-row-price">${sizeInfo?.priceFormatted || '$29.99'}</span>
      </div>
      <div class="hardcover-size-controls">
        <div class="cart-qty-control">
          <button type="button" class="qty-btn hardcover-qty-minus" data-index="${rowIndex}" aria-label="Decrease quantity">−</button>
          <span class="qty-value hardcover-qty-value" data-index="${rowIndex}">0</span>
          <button type="button" class="qty-btn hardcover-qty-plus" data-index="${rowIndex}" aria-label="Increase quantity">+</button>
        </div>
      </div>
    `;

    container.appendChild(row);

    // Bind custom select events
    const customSelect = row.querySelector('.custom-select');
    const trigger = row.querySelector('.custom-select-trigger');
    const dropdown = row.querySelector('.custom-select-dropdown');
    
    trigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all other dropdowns first
      document.querySelectorAll('.custom-select.open').forEach(s => {
        if (s !== customSelect) s.classList.remove('open');
      });
      customSelect.classList.toggle('open');
      trigger.setAttribute('aria-expanded', customSelect.classList.contains('open'));
    });
    
    // Option selection
    dropdown?.querySelectorAll('.custom-select-option').forEach(option => {
      option.addEventListener('click', () => {
        const idx = parseInt(customSelect.dataset.index);
        const newSize = option.dataset.value;
        const sizeInfo = this.hardcoverSizes.find(s => s.size_code === newSize);
        
        // Update data
        this.hardcoverItems[idx].size = newSize;
        this.hardcoverItems[idx].price = sizeInfo?.price_cents || 2999;
        
        // Update UI
        row.querySelector('.custom-select-value').textContent = option.dataset.display;
        row.querySelector('.custom-select-dims').textContent = option.dataset.dims;
        row.querySelector('.hardcover-row-price').textContent = option.dataset.formatted;
        
        // Update selected state
        dropdown.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        
        // Close dropdown
        customSelect.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        
        this.updateCartModalUI();
      });
    });

    row.querySelector('.hardcover-qty-minus')?.addEventListener('click', () => {
      const idx = parseInt(row.dataset.index);
      const newQty = Math.max(0, this.hardcoverItems[idx].qty - 1);
      this.hardcoverItems[idx].qty = newQty;
      
      // If quantity reaches 0 and this isn't the first row, remove it
      if (newQty === 0 && idx > 0) {
        this.removeHardcoverSizeRow(idx);
      } else {
        this.updateCartModalUI(true);
      }
    });

    row.querySelector('.hardcover-qty-plus')?.addEventListener('click', () => {
      const idx = parseInt(row.dataset.index);
      this.hardcoverItems[idx].qty++;
      this.updateCartModalUI(true);
    });

    this.updateCartModalUI();
  }

  removeHardcoverSizeRow(index) {
    const container = document.getElementById('hardcover-sizes-container');
    const row = container?.querySelector(`.hardcover-size-row[data-index="${index}"]`);
    if (row) {
      row.remove();
      this.hardcoverItems[index] = null; // Mark as removed
      this.updateCartModalUI();
    }
  }

  // Trigger quantity bump animation
  triggerQtyBump(element) {
    if (!element) return;
    element.classList.add('bump');
    setTimeout(() => element.classList.remove('bump'), 150);
  }

  updateCartModalUI(animate = false) {
    // Update ebook checkbox state
    const ebookCheckbox = document.getElementById('cart-ebook-checkbox');
    const ebookSection = document.getElementById('ebook-section');
    if (ebookCheckbox) {
      ebookCheckbox.checked = this.cartEbookQty > 0;
    }
    if (ebookSection) {
      ebookSection.classList.toggle('selected', this.cartEbookQty > 0);
    }

    // Update hardcover quantity displays
    this.hardcoverItems.forEach((item, idx) => {
      if (!item) return;
      const qtyEl = document.querySelector(`.hardcover-qty-value[data-index="${idx}"]`);
      if (qtyEl) {
        const oldValue = parseInt(qtyEl.textContent) || 0;
        qtyEl.textContent = item.qty;
        if (animate && oldValue !== item.qty) {
          this.triggerQtyBump(qtyEl);
        }
      }
    });

    // Calculate subtotal
    let subtotal = this.cartEbookQty * this.productPrices.ebook;
    let totalHardcoverQty = 0;
    
    this.hardcoverItems.forEach(item => {
      if (item && item.qty > 0) {
        subtotal += item.qty * item.price;
        totalHardcoverQty += item.qty;
      }
    });

    const subtotalEl = document.getElementById('cart-modal-subtotal');
    if (subtotalEl) {
      subtotalEl.textContent = formatPrice(subtotal);
      if (animate) {
        subtotalEl.classList.add('updated');
        setTimeout(() => subtotalEl.classList.remove('updated'), 300);
      }
    }

    // Show/hide "Add Another Size" button
    const addAnotherBtn = document.getElementById('add-another-size-btn');
    if (addAnotherBtn) {
      // Show if at least one hardcover has qty > 0
      if (totalHardcoverQty > 0) {
        addAnotherBtn.classList.remove('hidden');
      } else {
        addAnotherBtn.classList.add('hidden');
      }
    }

    // Enable/disable add to cart button
    const addBtn = document.getElementById('add-to-cart-btn');
    const hasItems = this.cartEbookQty > 0 || totalHardcoverQty > 0;
    if (addBtn) {
      addBtn.disabled = !hasItems;
      if (hasItems) {
        addBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>
          </svg>
          Add to Cart · ${formatPrice(subtotal)}
        `;
      } else {
        addBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>
          </svg>
          Add to Cart
        `;
      }
    }
  }

  async submitAddToCart() {
    if (!this.projectId) {
      this.showCartError('Project not found');
      return;
    }

    const addBtn = document.getElementById('add-to-cart-btn');
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.classList.add('loading');
      addBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spinner-icon">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/>
        </svg>
        Adding to Cart...
      `;
    }

    try {
      // Count total items being added for success message
      let totalItems = this.cartEbookQty;
      for (const item of this.hardcoverItems) {
        if (item && item.qty > 0) totalItems += item.qty;
      }

      // Add ebook if quantity > 0
      if (this.cartEbookQty > 0) {
        await updateCartItem(this.projectId, 'ebook', {
          quantity: this.cartEbookQty,
          action: 'add'
        });
      }

      // Add each hardcover size with quantity > 0
      for (const item of this.hardcoverItems) {
        if (item && item.qty > 0) {
          await updateCartItem(this.projectId, 'hardcover', {
            size: item.size,
            quantity: item.qty,
            action: 'add'
          });
        }
      }

      // Close modal
      this.closeAddToCartModal();
      
      // Show success toast
      this.showCartSuccess(totalItems);
      
      // Trigger cart refresh
      window.dispatchEvent(new CustomEvent('cart-updated'));

    } catch (err) {
      console.error('[Cart] Failed to add to cart:', err);
      this.showCartError(err.message || 'Failed to add to cart');
      
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.classList.remove('loading');
        addBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"/>
          </svg>
          Add to Cart
        `;
      }
    }
  }

  showCartSuccess(itemCount) {
    // Create a floating toast notification
    const toast = document.createElement('div');
    toast.className = 'cart-success-toast';
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12l2 2 4-4"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
      <span>${itemCount} item${itemCount > 1 ? 's' : ''} added to cart</span>
    `;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // Remove after animation
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  showCartError(message) {
    const errorEl = document.getElementById('cart-modal-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
      setTimeout(() => errorEl.classList.add('hidden'), 5000);
    }
  }

  // Set the project ID for cart operations
  setProjectId(projectId) {
    this.projectId = projectId;
  }

  // Dropdown management
  toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    const wasHidden = dropdown?.classList.contains('hidden');
    this.closeAllDropdowns();
    if (wasHidden) {
      dropdown?.classList.remove('hidden');
    }
  }

  closeAllDropdowns() {
    document.querySelectorAll('.topbar-dropdown').forEach(d => d.classList.add('hidden'));
  }

  updatePageSizeButton(size) {
    const btn = document.getElementById('page-size-btn');
    if (btn) {
      const label = btn.querySelector('.dropdown-label');
      const iconWrap = btn.querySelector('svg');
      if (label) label.textContent = PAGE_DIMENSIONS[size]?.name || size;
      // Update active state in dropdown
      document.querySelectorAll('#page-size-dropdown .dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.size === size);
      });
    }
  }

  // View Mode Management
  setViewMode(mode) {
    this.viewMode = mode;
    
    // Clear any selection when changing views
    this.hideTaskbar();
    
    // Reset zoom when changing view modes
    this.canvasZoom = 1;
    const wrapper = document.getElementById('preview-wrapper');
    if (wrapper) {
      wrapper.style.transform = 'scale(1)';
    }
    this.updateZoomDisplay();
    
    // Update data attribute for CSS
    const compositor = document.querySelector('.compositor-canva');
    if (compositor) compositor.dataset.viewMode = mode;
    
    // Update button
    const btn = document.getElementById('view-mode-btn');
    if (btn) {
      const iconContainer = btn.querySelector('svg');
      const label = btn.querySelector('.dropdown-label');
      if (iconContainer) {
        iconContainer.outerHTML = this.getViewModeIcon(mode);
      }
      if (label) label.textContent = this.getViewModeLabel(mode);
    }

    // Update dropdown active states
    document.querySelectorAll('#view-mode-dropdown .dropdown-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === mode);
    });

    // Show/hide page navigation and zoom controls based on mode
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageIndicator = document.getElementById('page-indicator');
    const zoomControls = document.getElementById('zoom-controls');
    const zoomDivider = zoomControls?.previousElementSibling;
    
    if (mode === 'grid' || mode === 'list') {
      prevBtn?.style.setProperty('display', 'none');
      nextBtn?.style.setProperty('display', 'none');
      pageIndicator?.style.setProperty('display', 'none');
      zoomControls?.style.setProperty('display', 'none');
      if (zoomDivider?.classList.contains('topbar-divider')) {
        zoomDivider.style.setProperty('display', 'none');
      }
    } else {
      prevBtn?.style.removeProperty('display');
      nextBtn?.style.removeProperty('display');
      pageIndicator?.style.removeProperty('display');
      zoomControls?.style.removeProperty('display');
      if (zoomDivider?.classList.contains('topbar-divider')) {
        zoomDivider.style.removeProperty('display');
      }
    }

    // Sidebar is always visible (controlled by CSS via data-view-mode)

    // Render the appropriate view
    this.renderViewMode();
    
    // Update thumbnails for the new mode
    this.renderThumbnails();
  }

  renderViewMode() {
    const canvasContainer = document.querySelector('.canvas-container');
    if (!canvasContainer) return;

    // Clear existing content classes
    canvasContainer.classList.remove('view-single', 'view-side-by-side', 'view-grid', 'view-list');

    switch (this.viewMode) {
      case 'single':
        canvasContainer.classList.add('view-single');
        this.renderPreview();
        break;
      case 'sideBySide':
        canvasContainer.classList.add('view-side-by-side');
        this.renderSideBySideView();
        break;
      case 'grid':
        canvasContainer.classList.add('view-grid');
        this.renderGridView();
        break;
      case 'list':
        canvasContainer.classList.add('view-list');
        this.renderListView();
        break;
    }
  }

  async renderSideBySideView() {
    const wrapper = document.getElementById('preview-wrapper');
    const container = document.getElementById('page-preview');
    if (!container || !this.bookData?.pages?.length) return;

    // Calculate spread indices (paired pages)
    const spreadIndex = Math.floor(this.currentPageIndex / 2);
    const leftIndex = spreadIndex * 2;
    const rightIndex = Math.min(leftIndex + 1, this.bookData.pages.length - 1);

    const tmpl = getTemplate(this.selectedTemplate);
    
    container.innerHTML = '<div class="side-by-side-container" id="spread-container"></div>';
    const ssContainer = container.querySelector('.side-by-side-container');

    // Render left page
    const leftConfig = this.applyCustomizationsForPage(tmpl, leftIndex);
    const leftSvg = await this.renderer.render(this.bookData.pages[leftIndex], leftConfig);
    const leftWrap = document.createElement('div');
    leftWrap.className = `spread-page spread-page-left ${this.currentPageIndex === leftIndex ? 'selected' : ''}`;
    leftWrap.id = 'spread-page-left';
    leftWrap.dataset.pageIndex = leftIndex;
    leftWrap.appendChild(leftSvg);
    ssContainer.appendChild(leftWrap);

    // Render right page (if exists and different)
    if (rightIndex !== leftIndex && rightIndex < this.bookData.pages.length) {
      const rightConfig = this.applyCustomizationsForPage(tmpl, rightIndex);
      const rightSvg = await this.renderer.render(this.bookData.pages[rightIndex], rightConfig);
      const rightWrap = document.createElement('div');
      rightWrap.className = `spread-page spread-page-right ${this.currentPageIndex === rightIndex ? 'selected' : ''}`;
      rightWrap.id = 'spread-page-right';
      rightWrap.dataset.pageIndex = rightIndex;
      rightWrap.appendChild(rightSvg);
      ssContainer.appendChild(rightWrap);
    }

    // Setup interactive editing on both pages
    this.setupSpreadInteraction(ssContainer);
    
    this.updatePageIndicator();
  }

  setupSpreadInteraction(ssContainer) {
    const pages = ssContainer.querySelectorAll('.spread-page');
    
    pages.forEach(pageWrap => {
      const pageIndex = parseInt(pageWrap.dataset.pageIndex);
      const svg = pageWrap.querySelector('svg');
      if (!svg) return;

      // Make SVG elements interactive
      svg.style.pointerEvents = 'all';
      svg.style.overflow = 'hidden'; // Clip content to page bounds

      const imageEls = svg.querySelectorAll('image');
      const textGroups = svg.querySelectorAll('g');
      const textGroup = Array.from(textGroups).find(g => g.querySelector('text'));

      // Make images clickable
      imageEls.forEach(imageEl => {
        imageEl.style.cursor = 'pointer';
        imageEl.style.pointerEvents = 'all';
        
        imageEl.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          // Switch to this page for editing
          this.currentPageIndex = pageIndex;
          this.selectSpreadElement('image', imageEl, pageWrap);
        };
      });

      // Make text clickable
      if (textGroup) {
        textGroup.style.cursor = 'pointer';
        textGroup.style.pointerEvents = 'all';
        textGroup.querySelectorAll('text').forEach(t => {
          t.style.pointerEvents = 'all';
          t.style.cursor = 'pointer';
        });
        
        textGroup.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.currentPageIndex = pageIndex;
          this.selectSpreadElement('text', textGroup, pageWrap);
        };
      }

      // Click on page background to select that page
      pageWrap.addEventListener('click', (e) => {
        if (e.target === pageWrap || e.target === svg || (e.target.tagName === 'rect' && e.target === svg.querySelector('rect'))) {
          this.currentPageIndex = pageIndex;
          this.updateSpreadSelection(ssContainer);
          this.hideTaskbar();
        }
      });
    });
  }

  selectSpreadElement(type, element, pageWrap) {
    const ssContainer = document.getElementById('spread-container');
    this.updateSpreadSelection(ssContainer);
    
    this.selectedElement = type;
    
    // Position the selection overlay relative to the spread page
    const rect = element.getBoundingClientRect();
    const wrapperRect = pageWrap.getBoundingClientRect();
    
    // Create or get spread-specific overlay
    let overlay = pageWrap.querySelector('.spread-selection-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'spread-selection-overlay';
      overlay.innerHTML = `
        <div class="resize-handle nw" data-handle="nw"></div>
        <div class="resize-handle ne" data-handle="ne"></div>
        <div class="resize-handle sw" data-handle="sw"></div>
        <div class="resize-handle se" data-handle="se"></div>
      `;
      pageWrap.appendChild(overlay);
    }
    
    overlay.style.left = `${rect.left - wrapperRect.left}px`;
    overlay.style.top = `${rect.top - wrapperRect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.classList.remove('hidden');
    overlay.dataset.element = type;
    
    this.showTaskbar(type);
    
    // Setup drag handlers for this overlay
    if (type === 'image') {
      this.setupSpreadImageDrag(overlay, pageWrap);
    } else if (type === 'text') {
      this.setupSpreadTextDrag(overlay, pageWrap);
    }
  }

  updateSpreadSelection(ssContainer) {
    // Update which page shows as selected
    ssContainer?.querySelectorAll('.spread-page').forEach(page => {
      const idx = parseInt(page.dataset.pageIndex);
      page.classList.toggle('selected', idx === this.currentPageIndex);
    });
    
    // Hide any existing spread overlays
    ssContainer?.querySelectorAll('.spread-selection-overlay').forEach(o => o.classList.add('hidden'));
  }

  setupSpreadImageDrag(overlay, pageWrap) {
    overlay.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'block');

    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      const frame = this.getCurrentFrameSettings();
      this.dragStartValues = { offsetX: frame.offsetX, offsetY: frame.offsetY, scale: frame.scale };
      e.preventDefault();
    };

    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        e.stopPropagation();
        this.isResizing = true;
        this.resizeHandle = handle.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY };
        const frame = this.getCurrentFrameSettings();
        this.dragStartValues = { scale: frame.scale, offsetX: frame.offsetX, offsetY: frame.offsetY };
        e.preventDefault();
      };
    });

    document.onmousemove = (e) => {
      if (!this.isDragging && !this.isResizing) return;
      
      if (this.isDragging) {
        const dx = (e.clientX - this.dragStart.x) / 500;
        const dy = (e.clientY - this.dragStart.y) / 500;
        this.setCurrentFrameSettings({
          offsetX: this.dragStartValues.offsetX + dx,
          offsetY: this.dragStartValues.offsetY + dy,
        });
      }
      
      if (this.isResizing) {
        const handle = this.resizeHandle;
        let dx = e.clientX - this.dragStart.x;
        let dy = e.clientY - this.dragStart.y;
        if (handle === 'nw') { dx = -dx; dy = -dy; }
        else if (handle === 'ne') { dy = -dy; }
        else if (handle === 'sw') { dx = -dx; }
        const delta = (dx + dy) / 2 / 200;
        const newScale = Math.max(0.3, Math.min(1.5, this.dragStartValues.scale + delta));
        this.setCurrentFrameSettings({ scale: newScale });
        document.getElementById('frame-scale-value')?.textContent && (document.getElementById('frame-scale-value').textContent = `${Math.round(newScale * 100)}%`);
      }
      
      this.renderSpreadPreviewThrottled();
    };

    document.onmouseup = () => {
      if (this.isDragging || this.isResizing) {
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.renderSideBySideView();
      }
    };
  }

  setupSpreadTextDrag(overlay, pageWrap) {
    overlay.querySelectorAll('.resize-handle').forEach(h => h.style.display = 'block');

    overlay.onmousedown = (e) => {
      if (e.target.classList.contains('resize-handle')) return;
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      const textSettings = this.getCurrentTextSettings();
      this.dragStartValues = { offsetX: textSettings.offsetX, offsetY: textSettings.offsetY, scale: textSettings.scale };
      e.preventDefault();
    };

    overlay.querySelectorAll('.resize-handle').forEach(handle => {
      handle.onmousedown = (e) => {
        e.stopPropagation();
        this.isResizing = true;
        this.resizeHandle = handle.dataset.handle;
        this.dragStart = { x: e.clientX, y: e.clientY };
        const textSettings = this.getCurrentTextSettings();
        this.dragStartValues = { scale: textSettings.scale, offsetX: textSettings.offsetX, offsetY: textSettings.offsetY };
        e.preventDefault();
      };
    });

    document.onmousemove = (e) => {
      if (!this.isDragging && !this.isResizing) return;
      
      if (this.isDragging) {
        const dx = (e.clientX - this.dragStart.x) / 500;
        const dy = (e.clientY - this.dragStart.y) / 500;
        this.setCurrentTextSettings({
          offsetX: this.dragStartValues.offsetX + dx,
          offsetY: this.dragStartValues.offsetY + dy,
        });
      }
      
      if (this.isResizing) {
        const handle = this.resizeHandle;
        let dx = e.clientX - this.dragStart.x;
        let dy = e.clientY - this.dragStart.y;
        if (handle === 'nw') { dx = -dx; dy = -dy; }
        else if (handle === 'ne') { dy = -dy; }
        else if (handle === 'sw') { dx = -dx; }
        const delta = (dx + dy) / 2 / 200;
        const newScale = Math.max(0.5, Math.min(2.0, this.dragStartValues.scale + delta));
        this.setCurrentTextSettings({ scale: newScale });
        document.getElementById('text-scale-value')?.textContent && (document.getElementById('text-scale-value').textContent = `${Math.round(newScale * 100)}%`);
      }
      
      this.renderSpreadPreviewThrottled();
    };

    document.onmouseup = () => {
      if (this.isDragging || this.isResizing) {
        this.isDragging = false;
        this.isResizing = false;
        this.resizeHandle = null;
        this.renderSideBySideView();
      }
    };
  }

  renderSpreadPreviewThrottled() {
    if (this.spreadRenderTimer) return;
    this.spreadRenderTimer = setTimeout(async () => {
      this.spreadRenderTimer = null;
      await this.renderSideBySideView();
    }, 32);
  }

  async renderGridView() {
    const container = document.getElementById('page-preview');
    if (!container || !this.bookData?.pages?.length) return;

    container.innerHTML = `
      <div class="grid-view-container" id="grid-view-container">
        <div class="grid-view-inner" id="grid-view-inner"></div>
      </div>
      <div class="grid-zoom-controls">
        <button id="grid-zoom-out" class="grid-zoom-btn" title="Zoom Out">−</button>
        <span id="grid-zoom-level">${Math.round(this.gridZoom * 100)}%</span>
        <button id="grid-zoom-in" class="grid-zoom-btn" title="Zoom In">+</button>
        <button id="grid-zoom-fit" class="grid-zoom-btn" title="Fit All">⊡</button>
      </div>
    `;

    const gridInner = document.getElementById('grid-view-inner');
    const tmpl = getTemplate(this.selectedTemplate);

    // Render all pages
    for (let i = 0; i < this.bookData.pages.length; i++) {
      const config = this.applyCustomizationsForPage(tmpl, i);
      const svg = await this.renderer.render(this.bookData.pages[i], config);
      
      const pageWrap = document.createElement('div');
      pageWrap.className = 'grid-page';
      pageWrap.dataset.pageIndex = i;
      pageWrap.appendChild(svg);
      
      const pageLabel = document.createElement('span');
      pageLabel.className = 'grid-page-label';
      pageLabel.textContent = `Page ${i + 1}`;
      pageWrap.appendChild(pageLabel);
      
      gridInner.appendChild(pageWrap);
    }

    // Apply current zoom
    this.applyGridZoom();

    // Setup grid interactions
    this.setupGridInteractions();
  }

  setupGridInteractions() {
    const gridContainer = document.getElementById('grid-view-container');
    const gridInner = document.getElementById('grid-view-inner');

    // Click on page to select
    gridInner?.querySelectorAll('.grid-page').forEach(page => {
      page.addEventListener('click', () => {
        this.currentPageIndex = parseInt(page.dataset.pageIndex);
        this.setViewMode('single');
      });
    });

    // Zoom controls
    document.getElementById('grid-zoom-in')?.addEventListener('click', () => {
      this.gridZoom = Math.min(2, this.gridZoom + 0.25);
      this.applyGridZoom();
    });

    document.getElementById('grid-zoom-out')?.addEventListener('click', () => {
      this.gridZoom = Math.max(0.25, this.gridZoom - 0.25);
      this.applyGridZoom();
    });

    document.getElementById('grid-zoom-fit')?.addEventListener('click', () => {
      this.gridZoom = 1;
      this.gridPan = { x: 0, y: 0 };
      this.applyGridZoom();
    });

    // Mouse wheel zoom
    gridContainer?.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.gridZoom = Math.max(0.25, Math.min(2, this.gridZoom + delta));
        this.applyGridZoom();
      }
    }, { passive: false });

    // Pan with middle mouse or shift+drag
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    gridContainer?.addEventListener('mousedown', (e) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        isPanning = true;
        panStart = { x: e.clientX - this.gridPan.x, y: e.clientY - this.gridPan.y };
        gridContainer.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (isPanning) {
        this.gridPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
        this.applyGridZoom();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isPanning) {
        isPanning = false;
        if (gridContainer) gridContainer.style.cursor = '';
      }
    });
  }

  applyGridZoom() {
    const gridInner = document.getElementById('grid-view-inner');
    const zoomLevel = document.getElementById('grid-zoom-level');
    
    if (gridInner) {
      gridInner.style.transform = `translate(${this.gridPan.x}px, ${this.gridPan.y}px) scale(${this.gridZoom})`;
    }
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.gridZoom * 100)}%`;
    }
  }

  async renderListView() {
    const container = document.getElementById('page-preview');
    if (!container || !this.bookData?.pages?.length) return;

    container.innerHTML = '<div class="list-view-container"></div>';
    const listContainer = container.querySelector('.list-view-container');

    const tmpl = getTemplate(this.selectedTemplate);

    for (let i = 0; i < this.bookData.pages.length; i++) {
      const config = this.applyCustomizationsForPage(tmpl, i);
      const svg = await this.renderer.render(this.bookData.pages[i], config);
      
      const pageWrap = document.createElement('div');
      pageWrap.className = 'list-page';
      pageWrap.dataset.pageIndex = i;
      
      const pagePreview = document.createElement('div');
      pagePreview.className = 'list-page-preview';
      pagePreview.appendChild(svg);
      
      const pageInfo = document.createElement('div');
      pageInfo.className = 'list-page-info';
      pageInfo.innerHTML = `
        <span class="list-page-number">Page ${i + 1}</span>
        <span class="list-page-text">${this.bookData.pages[i].text?.substring(0, 100) || ''}${this.bookData.pages[i].text?.length > 100 ? '...' : ''}</span>
      `;
      
      pageWrap.appendChild(pagePreview);
      pageWrap.appendChild(pageInfo);
      listContainer.appendChild(pageWrap);
    }

    // Click to select
    listContainer.querySelectorAll('.list-page').forEach(page => {
      page.addEventListener('click', () => {
        this.currentPageIndex = parseInt(page.dataset.pageIndex);
        this.setViewMode('single');
      });
    });
  }

  // Helper to apply customizations for a specific page index
  applyCustomizationsForPage(template, pageIndex) {
    const savedCurrentIndex = this.currentPageIndex;
    this.currentPageIndex = pageIndex;
    const config = this.applyCustomizations(template);
    this.currentPageIndex = savedCurrentIndex;
    return config;
  }

  // A/B Pattern Mode
  showABPatternConfirm() {
    // Show custom confirm modal
    const modal = document.getElementById('ab-confirm-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  enableABPattern() {
    this.saveUndoState(); // Track A/B mode enable
    this.abPatternMode = true;
    const btn = document.getElementById('ab-pattern-btn');
    if (btn) btn.classList.add('active');
    
    // Show feedback
    this.showABPatternFeedback('A/B Pattern enabled');
  }

  disableABPattern() {
    this.abPatternMode = false;
    const btn = document.getElementById('ab-pattern-btn');
    if (btn) btn.classList.remove('active');
    
    this.showABPatternFeedback('A/B Pattern disabled');
  }

  showABPatternFeedback(message) {
    // Simple visual feedback
    const btn = document.getElementById('ab-pattern-btn');
    if (btn) {
      btn.title = message;
      setTimeout(() => {
        btn.title = 'A/B Pattern Mode';
      }, 2000);
    }
  }

  // Override setCurrentFrameSettings to apply A/B pattern
  setCurrentFrameSettings(settings) {
    const newSettings = {
      ...this.getCurrentFrameSettings(),
      ...settings,
    };
    
    this.pageFrameSettings[this.currentPageIndex] = newSettings;
    
    // If A/B pattern is enabled, apply to matching pages (odd/even)
    if (this.abPatternMode) {
      const isOdd = this.currentPageIndex % 2 === 1;
      const totalPages = this.bookData?.pages?.length || 0;
      
      for (let i = 0; i < totalPages; i++) {
        if (i !== this.currentPageIndex && (i % 2 === 1) === isOdd) {
          this.pageFrameSettings[i] = { ...newSettings };
        }
      }
    }
  }

  // Override setCurrentTextSettings to apply A/B pattern
  setCurrentTextSettings(settings) {
    const newSettings = {
      ...this.getCurrentTextSettings(),
      ...settings,
    };
    
    this.pageTextSettings[this.currentPageIndex] = newSettings;
    
    // If A/B pattern is enabled, apply to matching pages (odd/even)
    if (this.abPatternMode) {
      const isOdd = this.currentPageIndex % 2 === 1;
      const totalPages = this.bookData?.pages?.length || 0;
      
      for (let i = 0; i < totalPages; i++) {
        if (i !== this.currentPageIndex && (i % 2 === 1) === isOdd) {
          this.pageTextSettings[i] = { ...newSettings };
        }
      }
    }
  }

  // ============================================
  // Undo/Redo System
  // ============================================
  
  saveUndoState() {
    const state = {
      selectedTemplate: this.selectedTemplate,
      customizations: JSON.parse(JSON.stringify(this.customizations)),
      pageFrameSettings: JSON.parse(JSON.stringify(this.pageFrameSettings)),
      pageTextSettings: JSON.parse(JSON.stringify(this.pageTextSettings)),
      pageCropSettings: JSON.parse(JSON.stringify(this.pageCropSettings)),
    };
    
    this.undoStack.push(state);
    
    // Limit stack size
    if (this.undoStack.length > this.maxUndoSteps) {
      this.undoStack.shift();
    }
    
    // Clear redo stack on new action
    this.redoStack = [];
    
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    
    // Save current state to redo stack
    const currentState = {
      selectedTemplate: this.selectedTemplate,
      customizations: JSON.parse(JSON.stringify(this.customizations)),
      pageFrameSettings: JSON.parse(JSON.stringify(this.pageFrameSettings)),
      pageTextSettings: JSON.parse(JSON.stringify(this.pageTextSettings)),
      pageCropSettings: JSON.parse(JSON.stringify(this.pageCropSettings)),
    };
    this.redoStack.push(currentState);
    
    // Restore previous state
    const prevState = this.undoStack.pop();
    this.restoreState(prevState);
    
    this.updateUndoRedoButtons();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    
    // Save current state to undo stack
    const currentState = {
      selectedTemplate: this.selectedTemplate,
      customizations: JSON.parse(JSON.stringify(this.customizations)),
      pageFrameSettings: JSON.parse(JSON.stringify(this.pageFrameSettings)),
      pageTextSettings: JSON.parse(JSON.stringify(this.pageTextSettings)),
      pageCropSettings: JSON.parse(JSON.stringify(this.pageCropSettings)),
    };
    this.undoStack.push(currentState);
    
    // Restore redo state
    const redoState = this.redoStack.pop();
    this.restoreState(redoState);
    
    this.updateUndoRedoButtons();
  }

  restoreState(state) {
    this.selectedTemplate = state.selectedTemplate;
    this.customizations = state.customizations;
    this.pageFrameSettings = state.pageFrameSettings;
    this.pageTextSettings = state.pageTextSettings;
    this.pageCropSettings = state.pageCropSettings;
    
    // Clear selection on undo/redo
    this.hideTaskbar();
    
    // Update template gallery selection
    document.querySelectorAll('.template-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.template === state.selectedTemplate);
    });
    
    // Update color theme selection
    document.querySelectorAll('.color-theme-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === state.customizations.colorTheme);
    });
    
    this.renderViewMode();
    this.renderThumbnails();
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) undoBtn.disabled = this.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  // ============================================
  // Canvas Zoom System
  // ============================================
  
  setCanvasZoom(zoom, updateSlider = true) {
    // Clamp zoom value
    this.canvasZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    
    // Apply zoom to preview wrapper
    const wrapper = document.getElementById('preview-wrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${this.canvasZoom})`;
    }
    
    // Update zoom level display
    this.updateZoomDisplay();
  }
  
  updateZoomDisplay() {
    const zoomLevel = document.getElementById('zoom-level');
    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.canvasZoom * 100)}%`;
    }
  }
  
  zoomIn() {
    const step = this.canvasZoom < 1 ? 0.1 : 0.25;
    this.setCanvasZoom(this.canvasZoom + step);
  }
  
  zoomOut() {
    const step = this.canvasZoom <= 1 ? 0.1 : 0.25;
    this.setCanvasZoom(this.canvasZoom - step);
  }
  
  resetZoom() {
    this.setCanvasZoom(1);
  }
  
  fitToScreen() {
    // Calculate the optimal zoom to fit the page in the canvas container
    const container = document.querySelector('.canvas-container');
    const preview = document.querySelector('.page-preview');
    
    if (!container || !preview) {
      this.setCanvasZoom(1);
      return;
    }
    
    // Temporarily reset zoom to measure actual size
    const wrapper = document.getElementById('preview-wrapper');
    if (wrapper) {
      wrapper.style.transform = 'scale(1)';
    }
    
    // Get dimensions after a brief delay to let layout settle
    requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect();
      const previewRect = preview.getBoundingClientRect();
      
      // Calculate zoom to fit with some padding
      const padding = 40;
      const scaleX = (containerRect.width - padding) / previewRect.width;
      const scaleY = (containerRect.height - padding) / previewRect.height;
      const optimalZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
      
      this.setCanvasZoom(optimalZoom);
    });
  }
  
  handleWheelZoom(e) {
    // Only zoom if Ctrl/Cmd is held
    if (!e.ctrlKey && !e.metaKey) return;
    
    e.preventDefault();
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.setCanvasZoom(this.canvasZoom + delta);
  }
  
  bindZoomEvents() {
    // Zoom buttons
    document.getElementById('zoom-in-btn')?.addEventListener('click', () => this.zoomIn());
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => this.zoomOut());
    document.getElementById('zoom-fit-btn')?.addEventListener('click', () => this.fitToScreen());
    
    // Click zoom level to reset
    document.getElementById('zoom-level')?.addEventListener('click', () => this.resetZoom());
    
    // Mouse wheel zoom (Ctrl + scroll)
    const canvasArea = document.getElementById('canvas-area');
    if (canvasArea) {
      canvasArea.addEventListener('wheel', (e) => this.handleWheelZoom(e), { passive: false });
    }
    
    // Pinch to zoom on trackpad
    let lastTouchDistance = 0;
    const previewWrapper = document.getElementById('preview-wrapper');
    
    if (previewWrapper) {
      previewWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          lastTouchDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      }, { passive: true });
      
      previewWrapper.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const currentDistance = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          
          if (lastTouchDistance > 0) {
            const scale = currentDistance / lastTouchDistance;
            this.setCanvasZoom(this.canvasZoom * scale);
          }
          
          lastTouchDistance = currentDistance;
        }
      }, { passive: false });
      
      previewWrapper.addEventListener('touchend', () => {
        lastTouchDistance = 0;
      }, { passive: true });
    }
    
    // Keyboard shortcuts for zoom
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      
      // Ctrl/Cmd + Plus: Zoom in
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        this.zoomIn();
      }
      // Ctrl/Cmd + Minus: Zoom out
      else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        this.zoomOut();
      }
      // Ctrl/Cmd + 0: Reset zoom
      else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.resetZoom();
      }
      // Ctrl/Cmd + 1: Fit to screen
      else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        this.fitToScreen();
      }
    });
  }

  // ============================================
  // Snap/Alignment System
  // ============================================
  
  snapElement(elementType, snapType) {
    this.saveUndoState();
    
    const MARGIN = 0.03; // 3% safe margin
    const tmpl = getTemplate(this.selectedTemplate);
    
    if (elementType === 'image') {
      const basePos = tmpl.layout?.image?.position?.region || { x: 0.05, y: 0.05, width: 0.9, height: 0.6 };
      const frame = this.getCurrentFrameSettings();
      const scale = frame.scale;
      const scaledWidth = basePos.width * scale;
      const scaledHeight = basePos.height * scale;
      
      let newOffsetX = frame.offsetX;
      let newOffsetY = frame.offsetY;
      
      // Calculate target positions
      switch (snapType) {
        case 'left':
          // Snap to left with margin
          newOffsetX = MARGIN - basePos.x - (basePos.width - scaledWidth) / 2;
          break;
        case 'center-h':
          // Center horizontally
          newOffsetX = 0.5 - basePos.x - basePos.width / 2 - (basePos.width - scaledWidth) / 2;
          break;
        case 'right':
          // Snap to right with margin
          newOffsetX = (1 - MARGIN - scaledWidth) - basePos.x - (basePos.width - scaledWidth) / 2;
          break;
        case 'top':
          // Snap to top with margin
          newOffsetY = MARGIN - basePos.y - (basePos.height - scaledHeight) / 2;
          break;
        case 'center-v':
          // Center vertically
          newOffsetY = 0.5 - basePos.y - basePos.height / 2 - (basePos.height - scaledHeight) / 2;
          break;
        case 'bottom':
          // Snap to bottom with margin
          newOffsetY = (1 - MARGIN - scaledHeight) - basePos.y - (basePos.height - scaledHeight) / 2;
          break;
      }
      
      this.setCurrentFrameSettings({ offsetX: newOffsetX, offsetY: newOffsetY });
      
    } else if (elementType === 'text') {
      const basePos = tmpl.layout?.text?.position?.region || { x: 0.05, y: 0.7, width: 0.9, height: 0.25 };
      const textSettings = this.getCurrentTextSettings();
      const scale = textSettings.scale;
      const scaledWidth = basePos.width * scale;
      const scaledHeight = basePos.height * scale;
      
      let newOffsetX = textSettings.offsetX;
      let newOffsetY = textSettings.offsetY;
      
      switch (snapType) {
        case 'left':
          newOffsetX = MARGIN - basePos.x - (basePos.width - scaledWidth) / 2;
          break;
        case 'center-h':
          newOffsetX = 0.5 - basePos.x - basePos.width / 2 - (basePos.width - scaledWidth) / 2;
          break;
        case 'right':
          newOffsetX = (1 - MARGIN - scaledWidth) - basePos.x - (basePos.width - scaledWidth) / 2;
          break;
        case 'top':
          newOffsetY = MARGIN - basePos.y - (basePos.height - scaledHeight) / 2;
          break;
        case 'center-v':
          newOffsetY = 0.5 - basePos.y - basePos.height / 2 - (basePos.height - scaledHeight) / 2;
          break;
        case 'bottom':
          newOffsetY = (1 - MARGIN - scaledHeight) - basePos.y - (basePos.height - scaledHeight) / 2;
          break;
      }
      
      this.setCurrentTextSettings({ offsetX: newOffsetX, offsetY: newOffsetY });
    }
    
    this.renderPreviewAndUpdateOverlay();
    this.renderThumbnails();
  }

  // ============================================
  // Navigation
  // ============================================
  
  goBackToStoryboard() {
    // Clear the compositor UI from the container
    if (this.container) {
      this.container.innerHTML = '';
      this.container.style.padding = '';
      this.container.style.overflow = '';
    }
    
    // Restore workspace header
    const workspaceHead = document.querySelector('.workspace-head');
    if (workspaceHead) workspaceHead.style.display = '';
    
    // Restore workspace title/subtitle
    const title = document.getElementById('workspace-title');
    const subtitle = document.getElementById('workspace-subtitle');
    if (title) title.textContent = 'Storyboard';
    if (subtitle) subtitle.textContent = 'Review and generate illustrations for your story';
    
    // Change phase back to storyboard
    document.body.dataset.phase = 'storyboard';
    
    // Dispatch a custom event that the main app can listen for
    const event = new CustomEvent('compositor:back', {
      detail: { bookData: this.bookData }
    });
    document.dispatchEvent(event);
    
    // Import and call renderStoryboard dynamically
    // This handles the case where we need to re-render the storyboard view
    import('../ui/render.js').then(module => {
      if (module.renderStoryboard && state.cachedProject) {
        module.renderStoryboard(state.cachedProject);
      } else if (module.reRenderCurrentView) {
        module.reRenderCurrentView();
      }
    }).catch(err => {
      console.error('Failed to load render module:', err);
    });
  }
}

export function createCompositorUI(containerId) {
  return new CompositorUI(containerId);
}