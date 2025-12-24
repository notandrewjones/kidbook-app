// js/api/lulu.js
// Client-side API for Lulu print-on-demand operations

/**
 * Calculate shipping costs for print order
 * @param {Array} items - Array of {sizeCode, pageCount, quantity}
 * @param {Object} shippingAddress - Shipping address
 * @returns {Promise<Object>} Shipping options with costs
 */
export async function calculateShipping(items, shippingAddress) {
  const response = await fetch('/api/lulu/calculate-shipping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ items, shippingAddress }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to calculate shipping');
  }

  return data;
}

/**
 * Get PDF generation requirements for a book
 * @param {string} orderId - Order ID (optional)
 * @param {string} bookId - Book ID
 * @returns {Promise<Object>} PDF generation specs
 */
export async function getPdfRequirements(orderId, bookId) {
  const response = await fetch('/api/lulu/generate-pdfs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ orderId, bookId }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to get PDF requirements');
  }

  return data;
}

/**
 * Upload a print-ready PDF
 * @param {string} type - 'interior' or 'cover'
 * @param {string} bookId - Book ID
 * @param {Blob|string} pdfData - PDF blob or base64 string
 * @param {string} orderId - Order ID (optional)
 * @returns {Promise<Object>} Upload result with URL
 */
export async function uploadPdf(type, bookId, pdfData, orderId = null) {
  let body;
  let contentType;

  if (pdfData instanceof Blob) {
    // Convert blob to base64
    const base64 = await blobToBase64(pdfData);
    body = JSON.stringify({ pdfBase64: base64.split(',')[1] });
    contentType = 'application/json';
  } else if (typeof pdfData === 'string') {
    // Assume base64 string
    body = JSON.stringify({ pdfBase64: pdfData });
    contentType = 'application/json';
  } else {
    throw new Error('Invalid PDF data type');
  }

  const url = `/api/lulu/upload-pdf?type=${type}&bookId=${bookId}${orderId ? `&orderId=${orderId}` : ''}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    credentials: 'include',
    body,
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to upload PDF');
  }

  return data;
}

/**
 * Convert blob to base64 string
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get print job status for an order
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Print job status
 */
export async function getPrintJobStatus(orderId) {
  const response = await fetch(`/api/orders/${orderId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to get order status');
  }

  return data.order;
}

/**
 * Generate and upload print-ready PDFs for an order
 * This is a high-level function that:
 * 1. Gets PDF requirements from server
 * 2. Generates PDFs client-side using the compositor
 * 3. Uploads PDFs to storage
 * 4. Returns the URLs for Lulu submission
 * 
 * @param {string} orderId - Order ID
 * @param {Object} compositor - Reference to the book compositor
 * @returns {Promise<Object>} PDF URLs
 */
export async function generateAndUploadPrintPdfs(orderId, compositor) {
  // Step 1: Get requirements
  const requirements = await getPdfRequirements(orderId);
  
  console.log('[Lulu] PDF Requirements:', requirements);

  // Step 2: Generate interior PDF
  const interiorPdf = await compositor.exportToPDF({
    pages: requirements.bookData.pages,
    title: requirements.bookData.title,
    author: requirements.bookData.author,
  }, compositor.currentTemplate, {
    pageSize: requirements.sizeCode,
    quality: 'print', // Highest quality for print
  });

  console.log('[Lulu] Interior PDF generated:', interiorPdf.size, 'bytes');

  // Step 3: Upload interior PDF
  const interiorResult = await uploadPdf('interior', requirements.bookId, interiorPdf, orderId);
  console.log('[Lulu] Interior PDF uploaded:', interiorResult.url);

  // Step 4: Generate cover PDF
  // Note: Cover generation requires special handling for wraparound cover with spine
  // This may need a separate cover compositor or template
  const coverPdf = await compositor.generateCoverPdf({
    title: requirements.bookData.title,
    author: requirements.bookData.author,
    coverImage: requirements.bookData.pages[0]?.imageUrl, // Use first illustration as cover
    dimensions: requirements.dimensions.cover,
  });

  console.log('[Lulu] Cover PDF generated:', coverPdf.size, 'bytes');

  // Step 5: Upload cover PDF
  const coverResult = await uploadPdf('cover', requirements.bookId, coverPdf, orderId);
  console.log('[Lulu] Cover PDF uploaded:', coverResult.url);

  return {
    interiorUrl: interiorResult.url,
    coverUrl: coverResult.url,
    bookId: requirements.bookId,
    orderId: orderId,
  };
}

/**
 * Shipping levels with descriptions
 */
export const SHIPPING_LEVELS = {
  MAIL: {
    id: 'MAIL',
    name: 'Standard Mail',
    description: 'Most economical option. 2-3 weeks delivery.',
    icon: '📬',
  },
  PRIORITY_MAIL: {
    id: 'PRIORITY_MAIL',
    name: 'Priority Mail',
    description: 'Faster delivery with tracking. 1-2 weeks.',
    icon: '📦',
  },
  GROUND: {
    id: 'GROUND',
    name: 'Ground Shipping',
    description: 'Reliable courier delivery. 5-10 business days.',
    icon: '🚚',
  },
  EXPEDITED: {
    id: 'EXPEDITED',
    name: 'Expedited',
    description: 'Fast air delivery. 2-5 business days.',
    icon: '✈️',
  },
  EXPRESS: {
    id: 'EXPRESS',
    name: 'Express',
    description: 'Fastest available. 1-3 business days.',
    icon: '⚡',
  },
};

/**
 * Print job status descriptions
 */
export const PRINT_JOB_STATUSES = {
  pending_pdf: {
    label: 'Preparing Files',
    description: 'Getting your book ready for printing',
    color: 'yellow',
  },
  pending_submission: {
    label: 'Queued',
    description: 'Waiting to be sent to printer',
    color: 'yellow',
  },
  created: {
    label: 'Submitted',
    description: 'Order received by printer',
    color: 'blue',
  },
  unpaid: {
    label: 'Processing',
    description: 'Payment being verified',
    color: 'blue',
  },
  production_delayed: {
    label: 'Confirmed',
    description: 'Order confirmed, preparing for production',
    color: 'blue',
  },
  production_ready: {
    label: 'Ready to Print',
    description: 'About to enter production',
    color: 'blue',
  },
  in_production: {
    label: 'Printing',
    description: 'Your book is being printed',
    color: 'purple',
  },
  shipped: {
    label: 'Shipped',
    description: 'On its way to you!',
    color: 'green',
  },
  rejected: {
    label: 'Issue',
    description: 'There was a problem with your order',
    color: 'red',
  },
  canceled: {
    label: 'Cancelled',
    description: 'Order was cancelled',
    color: 'gray',
  },
  error: {
    label: 'Error',
    description: 'An error occurred',
    color: 'red',
  },
};

/**
 * Get human-readable status info
 */
export function getStatusInfo(status) {
  return PRINT_JOB_STATUSES[status] || {
    label: status || 'Unknown',
    description: '',
    color: 'gray',
  };
}
