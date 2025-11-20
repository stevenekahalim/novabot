/**
 * Tests for PDF Processing
 *
 * Testing the _extractPDFContent logic from messageHandler.js
 * This is the most complex part - handling file downloads, parsing, and error cases
 */

const {
  createMockPDFMessage,
  createMockLargePDFMessage,
  createMockImageMessage
} = require('../mocks/whatsapp.mock');

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

// Mock pdf-parse module
jest.mock('pdf-parse', () => {
  return jest.fn((buffer) => {
    // Simulate pdf-parse behavior based on buffer content
    const content = buffer.toString();

    if (content.includes('EMPTY_PDF')) {
      return Promise.resolve({
        text: '',
        numpages: 1
      });
    }

    if (content.includes('SHORT_TEXT_PDF')) {
      return Promise.resolve({
        text: 'Hi',
        numpages: 1
      });
    }

    if (content.includes('LONG_TEXT_PDF')) {
      // Generate text > 50K characters
      const longText = 'Lorem ipsum dolor sit amet. '.repeat(2000); // ~54K chars
      return Promise.resolve({
        text: longText,
        numpages: 10
      });
    }

    if (content.includes('ERROR_PDF')) {
      return Promise.reject(new Error('PDF parsing failed'));
    }

    // Default: return mock text
    return Promise.resolve({
      text: 'This is sample PDF content with important information about the project.',
      numpages: 3
    });
  });
});

// Simplified version of the PDF extraction logic for testing
async function extractPDFContent(message) {
  const pdfParse = require('pdf-parse');

  try {
    const media = await message.downloadMedia();

    if (!media || !media.data) {
      return null;
    }

    const mimeType = media.mimetype || '';
    if (!mimeType.includes('pdf')) {
      return null;
    }

    const pdfBuffer = Buffer.from(media.data, 'base64');

    // Check file size
    const fileSizeInMB = pdfBuffer.length / (1024 * 1024);
    if (fileSizeInMB > 10) {
      return `[PDF file: ${media.filename || 'document.pdf'} - ${fileSizeInMB.toFixed(2)}MB - Too large to extract]`;
    }

    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text.trim();
    const pageCount = pdfData.numpages;

    if (!extractedText || extractedText.length < 10) {
      return `[PDF file: ${media.filename || 'document.pdf'} - ${pageCount} pages - No extractable text (may be scanned image)]`;
    }

    // Limit text length
    const maxLength = 50000;
    const finalText = extractedText.length > maxLength
      ? extractedText.substring(0, maxLength) + '\n\n[... PDF truncated at 50K characters ...]'
      : extractedText;

    return `[PDF: ${media.filename || 'document.pdf'} - ${pageCount} pages]\n\n${finalText}`;

  } catch (error) {
    return `[PDF extraction failed: ${error.message}]`;
  }
}

describe('PDF Processing', () => {
  describe('Successful PDF Extraction', () => {
    test('extracts text from valid PDF', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64'),
        filename: 'proposal.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('[PDF: proposal.pdf - 3 pages]');
      expect(result).toContain('This is sample PDF content');
      expect(result).toContain('important information');
    });

    test('includes filename and page count in result', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64'),
        filename: 'contract-v2.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toMatch(/\[PDF: contract-v2\.pdf - \d+ pages\]/);
    });
  });

  describe('File Size Validation', () => {
    test('rejects PDF larger than 10MB', async () => {
      // Create a buffer that's actually > 10MB (11MB)
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'x');
      const message = createMockPDFMessage({
        pdfData: largeBuffer.toString('base64'),
        filename: 'huge-file.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('Too large to extract');
      expect(result).toMatch(/\d+\.\d+MB/); // Should show file size
    });

    test('accepts PDF smaller than 10MB', async () => {
      // 1MB PDF (well under limit)
      const oneMBData = Buffer.alloc(1024 * 1024, 'a').toString('base64');
      const message = createMockPDFMessage({
        pdfData: oneMBData,
        filesize: 1024 * 1024
      });

      const result = await extractPDFContent(message);

      expect(result).not.toContain('Too large');
      expect(result).toContain('[PDF:');
    });

    test('handles PDF at exactly 10MB boundary', async () => {
      // Exactly 10MB
      const tenMBData = Buffer.alloc(10 * 1024 * 1024, 'a').toString('base64');
      const message = createMockPDFMessage({
        pdfData: tenMBData,
        filesize: 10 * 1024 * 1024
      });

      const result = await extractPDFContent(message);

      // Should be accepted (10MB <= 10MB)
      expect(result).not.toContain('Too large');
    });
  });

  describe('MIME Type Validation', () => {
    test('only processes PDF MIME types', async () => {
      const imageMessage = createMockImageMessage();

      const result = await extractPDFContent(imageMessage);

      expect(result).toBeNull();
    });

    test('accepts various PDF MIME type variations', async () => {
      const variations = [
        'application/pdf',
        'application/x-pdf',
        'application/pdf; charset=utf-8'
      ];

      for (const mimetype of variations) {
        const message = createMockPDFMessage({
          pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64')
        });
        message._media.mimetype = mimetype;

        const result = await extractPDFContent(message);

        expect(result).not.toBeNull();
        expect(result).toContain('[PDF:');
      }
    });
  });

  describe('Empty or Scanned PDFs', () => {
    test('handles empty PDF (no text)', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('EMPTY_PDF').toString('base64'),
        filename: 'empty.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('No extractable text');
      expect(result).toContain('may be scanned image');
    });

    test('handles PDF with very short text (< 10 chars)', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('SHORT_TEXT_PDF').toString('base64'),
        filename: 'short.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('No extractable text');
    });
  });

  describe('Text Truncation', () => {
    test('truncates text longer than 50K characters', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('LONG_TEXT_PDF').toString('base64'),
        filename: 'long-document.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('PDF truncated at 50K characters');
      // Result should be around 50K + metadata
      expect(result.length).toBeLessThan(51000);
    });

    test('does not truncate text shorter than 50K characters', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64')
      });

      const result = await extractPDFContent(message);

      expect(result).not.toContain('truncated');
    });
  });

  describe('Error Handling', () => {
    test('handles PDF parsing errors gracefully', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('ERROR_PDF').toString('base64'),
        filename: 'corrupt.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('PDF extraction failed');
      expect(result).toContain('PDF parsing failed');
    });

    test('handles missing media data', async () => {
      const message = createMockPDFMessage({
        pdfData: null  // No data
      });
      message._media.data = null;

      const result = await extractPDFContent(message);

      expect(result).toBeNull();
    });

    test('handles download failure', async () => {
      const message = createMockPDFMessage();
      // Override downloadMedia to throw error
      message.downloadMedia = jest.fn().mockRejectedValue(new Error('Network timeout'));

      const result = await extractPDFContent(message);

      expect(result).toContain('PDF extraction failed');
      expect(result).toContain('Network timeout');
    });
  });

  describe('File Metadata', () => {
    test('uses default filename when none provided', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64')
      });
      message._media.filename = null;

      const result = await extractPDFContent(message);

      expect(result).toContain('document.pdf');
    });

    test('preserves original filename', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('VALID_PDF_CONTENT').toString('base64'),
        filename: 'Q4-Financial-Report.pdf'
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('Q4-Financial-Report.pdf');
    });
  });

  describe('Character Encoding', () => {
    test('handles UTF-8 text in PDF', async () => {
      const pdfParse = require('pdf-parse');
      pdfParse.mockResolvedValueOnce({
        text: 'Text with special chars: é, ñ, 中文, العربية',
        numpages: 1
      });

      const message = createMockPDFMessage({
        pdfData: Buffer.from('UTF8_PDF').toString('base64')
      });

      const result = await extractPDFContent(message);

      expect(result).toContain('special chars');
      expect(result).toContain('é');
      expect(result).toContain('中文');
    });
  });

  describe('Integration Scenarios', () => {
    test('complete flow: valid PDF with normal content', async () => {
      const message = createMockPDFMessage({
        pdfData: Buffer.from('PROJECT_DETAILS').toString('base64'),
        filename: 'Manado-Court-Proposal.pdf'
      });

      const result = await extractPDFContent(message);

      // Should have header with metadata
      expect(result).toMatch(/\[PDF: Manado-Court-Proposal\.pdf - \d+ pages\]/);

      // Should have content
      expect(result).toContain('important information');

      // Should not be truncated (normal size)
      expect(result).not.toContain('truncated');

      // Should not have errors
      expect(result).not.toContain('failed');
      expect(result).not.toContain('Too large');
    });
  });
});
