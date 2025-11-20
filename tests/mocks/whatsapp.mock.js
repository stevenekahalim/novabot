/**
 * Mock WhatsApp Message
 *
 * Mocks WhatsApp Web.js message objects for testing
 */

class MockWhatsAppMessage {
  constructor(options = {}) {
    this.id = options.id || 'mock-msg-id';
    this.body = options.body || 'Test message';
    this.from = options.from || '6281234567890@c.us';
    this.fromMe = options.fromMe || false;
    this.hasMedia = options.hasMedia || false;
    this.type = options.type || 'chat';
    this.timestamp = options.timestamp || Date.now() / 1000;
    this._data = options._data || {};

    // If has media, set up media mock
    if (this.hasMedia) {
      this._media = options._media || null;
    }
  }

  /**
   * Mock downloadMedia() method
   */
  async downloadMedia() {
    if (!this.hasMedia) {
      throw new Error('Message has no media');
    }

    if (this._media) {
      return this._media;
    }

    // Return default mock media
    return new MockMessageMedia({
      mimetype: 'application/pdf',
      data: '', // Empty for basic mock
      filename: 'test.pdf'
    });
  }

  /**
   * Mock getChat() method
   */
  async getChat() {
    return {
      id: {
        _serialized: '120363420201458845@g.us'
      },
      name: 'Test Chat'
    };
  }

  /**
   * Mock getContact() method
   */
  async getContact() {
    return {
      id: {
        _serialized: this.from
      },
      pushname: 'Test User',
      number: this.from.split('@')[0]
    };
  }
}

class MockMessageMedia {
  constructor(options = {}) {
    this.mimetype = options.mimetype || 'application/pdf';
    this.data = options.data || '';  // Base64 data
    this.filename = options.filename || 'document.pdf';
    this.filesize = options.filesize || 1024;  // Default 1KB
  }
}

/**
 * Helper to create a mock PDF message
 */
function createMockPDFMessage(options = {}) {
  const pdfData = options.pdfData || Buffer.from('Mock PDF content').toString('base64');
  const filesize = options.filesize || 1024;

  const media = new MockMessageMedia({
    mimetype: 'application/pdf',
    data: pdfData,
    filename: options.filename || 'test.pdf',
    filesize: filesize
  });

  return new MockWhatsAppMessage({
    body: options.body || 'Check this PDF',
    hasMedia: true,
    type: 'document',
    _media: media,
    ...options
  });
}

/**
 * Helper to create a mock message with large PDF (> 10MB)
 */
function createMockLargePDFMessage() {
  const media = new MockMessageMedia({
    mimetype: 'application/pdf',
    data: '',  // We won't actually store 10MB in memory
    filename: 'large.pdf',
    filesize: 11 * 1024 * 1024  // 11MB
  });

  return new MockWhatsAppMessage({
    body: 'This PDF is too large',
    hasMedia: true,
    type: 'document',
    _media: media
  });
}

/**
 * Helper to create a non-PDF media message
 */
function createMockImageMessage() {
  const media = new MockMessageMedia({
    mimetype: 'image/jpeg',
    data: Buffer.from('Mock image data').toString('base64'),
    filename: 'photo.jpg',
    filesize: 2048
  });

  return new MockWhatsAppMessage({
    body: 'Check this image',
    hasMedia: true,
    type: 'image',
    _media: media
  });
}

module.exports = {
  MockWhatsAppMessage,
  MockMessageMedia,
  createMockPDFMessage,
  createMockLargePDFMessage,
  createMockImageMessage
};
