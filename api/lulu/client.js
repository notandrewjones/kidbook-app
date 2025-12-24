// api/lulu/client.js
// Lulu Print API Client
// Handles authentication and all API interactions with Lulu's print-on-demand service

/**
 * LuluClient - Handles authentication and API calls to Lulu Print API
 * 
 * Environment Variables Required:
 * - LULU_CLIENT_KEY: Your Lulu API client key
 * - LULU_CLIENT_SECRET: Your Lulu API client secret
 * - LULU_USE_SANDBOX: Set to 'true' for sandbox/testing (optional)
 * 
 * @see https://api.lulu.com/docs/
 */
class LuluClient {
  constructor(options = {}) {
    this.useSandbox = options.useSandbox ?? (process.env.LULU_USE_SANDBOX === 'true');
    this.clientKey = options.clientKey || process.env.LULU_CLIENT_KEY;
    this.clientSecret = options.clientSecret || process.env.LULU_CLIENT_SECRET;
    
    // API endpoints
    this.baseUrl = this.useSandbox 
      ? 'https://api.sandbox.lulu.com'
      : 'https://api.lulu.com';
    
    this.authUrl = this.useSandbox
      ? 'https://api.sandbox.lulu.com/auth/realms/glasstree/protocol/openid-connect/token'
      : 'https://api.lulu.com/auth/realms/glasstree/protocol/openid-connect/token';

    // Token cache
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get valid access token (refreshes if expired)
   */
  async getAccessToken() {
    // Check if current token is still valid (with 5 min buffer)
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    // Request new token
    const credentials = Buffer.from(`${this.clientKey}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lulu auth failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);

    return this.accessToken;
  }

  /**
   * Make authenticated API request
   */
  async request(method, endpoint, body = null) {
    const token = await this.getAccessToken();

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, options);

    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(`Lulu API error: ${response.status}`);
      error.status = response.status;
      error.data = responseData;
      throw error;
    }

    return responseData;
  }

  /**
   * Calculate print job cost without creating the job
   * Use this for displaying shipping options and costs during checkout
   * 
   * @param {Array} lineItems - Array of {pod_package_id, page_count, quantity}
   * @param {Object} shippingAddress - Shipping address object
   * @param {string} shippingOption - MAIL, PRIORITY_MAIL, GROUND, EXPEDITED, EXPRESS
   */
  async calculateCost(lineItems, shippingAddress, shippingOption = 'MAIL') {
    const payload = {
      line_items: lineItems.map(item => ({
        pod_package_id: item.pod_package_id,
        page_count: item.page_count,
        quantity: item.quantity,
      })),
      shipping_address: this.formatShippingAddress(shippingAddress),
      shipping_option: shippingOption,
    };

    return this.request('POST', '/print-job-cost-calculations/', payload);
  }

  /**
   * Create a print job
   * 
   * @param {Object} jobData - Print job data
   * @param {string} jobData.contactEmail - Email for job questions
   * @param {string} jobData.externalId - Your order reference
   * @param {Array} jobData.lineItems - Books to print
   * @param {Object} jobData.shippingAddress - Delivery address
   * @param {string} jobData.shippingLevel - Shipping speed
   * @param {number} jobData.productionDelay - Minutes before production (60-2880)
   */
  async createPrintJob(jobData) {
    const payload = {
      contact_email: jobData.contactEmail,
      external_id: jobData.externalId,
      line_items: jobData.lineItems.map(item => ({
        external_id: item.externalId,
        title: item.title,
        quantity: item.quantity,
        pod_package_id: item.podPackageId,
        // Files can be provided as URLs
        cover: item.coverUrl,
        interior: item.interiorUrl,
      })),
      shipping_address: this.formatShippingAddress(jobData.shippingAddress),
      shipping_level: jobData.shippingLevel || 'MAIL',
      production_delay: jobData.productionDelay || 60, // 1 hour minimum
    };

    return this.request('POST', '/print-jobs/', payload);
  }

  /**
   * Get print job status
   */
  async getPrintJob(printJobId) {
    return this.request('GET', `/print-jobs/${printJobId}/`);
  }

  /**
   * List print jobs with optional filters
   */
  async listPrintJobs(options = {}) {
    const params = new URLSearchParams();
    
    if (options.status) params.append('status', options.status);
    if (options.page) params.append('page', options.page);
    if (options.pageSize) params.append('page_size', options.pageSize);
    if (options.createdAfter) params.append('created_after', options.createdAfter);
    if (options.search) params.append('search', options.search);

    const queryString = params.toString();
    const endpoint = `/print-jobs/${queryString ? `?${queryString}` : ''}`;
    
    return this.request('GET', endpoint);
  }

  /**
   * Get print job status (separate endpoint for just status info)
   */
  async getPrintJobStatus(printJobId) {
    return this.request('GET', `/print-jobs/${printJobId}/status/`);
  }

  /**
   * Cancel a print job (only works if not yet in production)
   */
  async cancelPrintJob(printJobId) {
    return this.request('POST', `/print-jobs/${printJobId}/status/`, {
      name: 'CANCELED',
    });
  }

  /**
   * Validate interior file
   */
  async validateInterior(sourceUrl, podPackageId = null) {
    const payload = {
      source_url: sourceUrl,
    };
    if (podPackageId) {
      payload.pod_package_id = podPackageId;
    }
    return this.request('POST', '/files/interior-validation/', payload);
  }

  /**
   * Get interior validation status
   */
  async getInteriorValidation(validationId) {
    return this.request('GET', `/files/interior-validation/${validationId}/`);
  }

  /**
   * Validate cover file
   */
  async validateCover(sourceUrl, podPackageId, pageCount) {
    return this.request('POST', '/files/cover-validation/', {
      source_url: sourceUrl,
      pod_package_id: podPackageId,
      page_count: pageCount,
    });
  }

  /**
   * Get cover validation status
   */
  async getCoverValidation(validationId) {
    return this.request('GET', `/files/cover-validation/${validationId}/`);
  }

  /**
   * Calculate required cover dimensions
   */
  async getCoverDimensions(podPackageId, pageCount, unit = 'pt') {
    return this.request('POST', '/files/cover-dimensions/', {
      pod_package_id: podPackageId,
      page_count: pageCount,
      unit: unit,
    });
  }

  /**
   * Create webhook subscription
   */
  async createWebhook(url, topics = ['PRINT_JOB_STATUS_CHANGED']) {
    return this.request('POST', '/webhooks/', {
      url,
      topics,
    });
  }

  /**
   * List webhooks
   */
  async listWebhooks() {
    return this.request('GET', '/webhooks/');
  }

  /**
   * Update webhook
   */
  async updateWebhook(webhookId, data) {
    return this.request('PATCH', `/webhooks/${webhookId}/`, data);
  }

  /**
   * Delete webhook
   */
  async deleteWebhook(webhookId) {
    return this.request('DELETE', `/webhooks/${webhookId}/`);
  }

  /**
   * Format shipping address for Lulu API
   */
  formatShippingAddress(address) {
    return {
      name: address.name,
      street1: address.street1 || address.addressLine1 || address.line1,
      street2: address.street2 || address.addressLine2 || address.line2 || '',
      city: address.city,
      state_code: address.stateCode || address.state || '',
      postcode: address.postcode || address.postalCode || address.postal_code,
      country_code: address.countryCode || address.country || 'US',
      phone_number: address.phoneNumber || address.phone || '',
      email: address.email || '',
    };
  }

  /**
   * Check if Lulu API is configured
   */
  isConfigured() {
    return !!(this.clientKey && this.clientSecret);
  }
}

// POD Package ID mappings for your book sizes
// Format: Trim Size + Color + Print Quality + Bind + Paper + PPI + Finish + Linen + Foil
const POD_PACKAGE_IDS = {
  // Square formats - perfect for children's books
  'square-small': '0700X0700FCSTDHC080CW444GXX', // 7"x7" Full Color Standard Hardcover
  'square-medium': '0850X0850FCSTDHC080CW444GXX', // 8.5"x8.5" Full Color Standard Hardcover
  'square-large': '1000X1000FCSTDHC080CW444GXX', // 10"x10" Full Color Standard Hardcover
  
  // Landscape formats
  'landscape-small': '0850X0600FCSTDHC080CW444GXX', // 8.5"x6" Full Color Standard Hardcover
  'landscape-medium': '1100X0850FCSTDHC080CW444GXX', // 11"x8.5" Full Color Standard Hardcover
  
  // Portrait formats
  'portrait-small': '0600X0900FCSTDHC080CW444GXX', // 6"x9" Full Color Standard Hardcover
  'portrait-medium': '0827X1169FCSTDHC080CW444GXX', // 8.27"x11.69" (A4) Full Color Standard Hardcover
  
  // Paperback alternatives (lower cost option)
  'square-medium-pb': '0850X0850FCSTDPB080CW444GXX', // 8.5"x8.5" Full Color Standard Paperback
  'square-large-pb': '1000X1000FCSTDPB080CW444GXX', // 10"x10" Full Color Standard Paperback
};

// Shipping levels and descriptions
const SHIPPING_LEVELS = {
  MAIL: {
    id: 'MAIL',
    name: 'Standard Mail',
    description: 'Slowest, most economical. Tracking may not be available in all regions.',
    estimatedDays: '7-21 business days',
  },
  PRIORITY_MAIL: {
    id: 'PRIORITY_MAIL',
    name: 'Priority Mail',
    description: 'Faster than standard mail with tracking.',
    estimatedDays: '5-14 business days',
  },
  GROUND: {
    id: 'GROUND',
    name: 'Ground Shipping',
    description: 'Courier-based ground transportation (US only).',
    estimatedDays: '5-10 business days',
  },
  EXPEDITED: {
    id: 'EXPEDITED',
    name: 'Expedited',
    description: '2nd day delivery via air mail.',
    estimatedDays: '2-5 business days',
  },
  EXPRESS: {
    id: 'EXPRESS',
    name: 'Express',
    description: 'Fastest shipping available. Overnight where possible.',
    estimatedDays: '1-3 business days',
  },
};

// Print job statuses
const PRINT_JOB_STATUSES = {
  CREATED: 'Print job created, awaiting validation',
  UNPAID: 'Ready for payment',
  PAYMENT_IN_PROGRESS: 'Processing payment',
  PRODUCTION_DELAYED: 'Paid, waiting for production delay to end',
  PRODUCTION_READY: 'Ready to enter production',
  IN_PRODUCTION: 'Being printed',
  SHIPPED: 'Shipped to customer',
  REJECTED: 'Rejected due to file or data issues',
  CANCELED: 'Canceled',
};

// Create singleton instance
const luluClient = new LuluClient();

module.exports = {
  LuluClient,
  luluClient,
  POD_PACKAGE_IDS,
  SHIPPING_LEVELS,
  PRINT_JOB_STATUSES,
};
