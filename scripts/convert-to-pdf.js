import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Directories
const HTML_DIR = path.join(ROOT_DIR, 'html');
const PDF_DIR = path.join(ROOT_DIR, 'pdf');

/**
 * Get all HTML files recursively from directory
 * @param {string} dir - Directory to search
 * @returns {Promise<Array>} Array of HTML file paths
 */
async function getHtmlFiles(dir) {
  const files = [];
  
  async function scanDirectory(currentDir) {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not read directory ${currentDir}:`, error.message);
    }
  }
  
  await scanDirectory(dir);
  return files;
}

/**
 * Create directory structure if it doesn't exist
 * @param {string} dirPath - Directory path to create
 */
async function ensureDirectoryExists(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error('Error creating directory:', error.message);
    throw error;
  }
}

/**
 * Convert HTML file to PDF using Puppeteer
 * @param {string} htmlFilePath - Path to HTML file
 * @param {string} pdfFilePath - Path for output PDF file
 * @param {Object} browser - Puppeteer browser instance
 */
async function convertHtmlToPdf(htmlFilePath, pdfFilePath, browser) {
  try {
    const fileName = path.basename(htmlFilePath);
    console.log(`  Converting: ${fileName}`);
    
    const page = await browser.newPage();
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1200, height: 800 });
    
    // Navigate to the HTML file
    const fileUrl = `file://${path.resolve(htmlFilePath)}`;
    await page.goto(fileUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    // Wait for MathJax to render (if present)
    try {
      await page.waitForFunction(
        () => {
          return window.MathJax && window.MathJax.startup && window.MathJax.startup.document.state() >= 8;
        },
        { timeout: 15000 }
      );
    } catch {
      // MathJax not found or timeout, proceed anyway
    }
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '15mm',
        right: '15mm'
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size: 10px; text-align: center; width: 100%; margin: 0 15mm;">
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `
    });
    
    // Save PDF file
    await fs.writeFile(pdfFilePath, pdfBuffer);
    
    await page.close();
    
    console.log(`    ✓ PDF saved`);
    
  } catch (error) {
    console.error(`    ✗ Error: ${error.message}`);
    throw error;
  }
}

/**
 * Check if PDF already exists
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<boolean>} True if file exists
 */
async function pdfExists(pdfPath) {
  try {
    await fs.access(pdfPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Process HTML files by exam type
 * @param {string} examType - Exam type directory name
 * @param {Object} browser - Puppeteer browser instance
 */
async function processExamType(examType, browser) {
  try {
    const htmlExamDir = path.join(HTML_DIR, examType);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing ${examType.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);
    
    // Get all HTML files in the directory
    const files = await fs.readdir(htmlExamDir);
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    
    console.log(`Found ${htmlFiles.length} HTML files\n`);
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    
    // Ensure output directory exists
    const pdfExamDir = path.join(PDF_DIR, examType);
    await ensureDirectoryExists(pdfExamDir);
    
    for (const file of htmlFiles) {
      const htmlPath = path.join(htmlExamDir, file);
      const pdfPath = path.join(pdfExamDir, file.replace('.html', '.pdf'));
      
      console.log(`[${processed + skipped + failed + 1}/${htmlFiles.length}] ${file}`);
      
      // Check if PDF already exists
      if (await pdfExists(pdfPath)) {
        console.log(`  ⚠ Skipped (already exists)\n`);
        skipped++;
        continue;
      }
      
      try {
        await convertHtmlToPdf(htmlPath, pdfPath, browser);
        processed++;
        console.log();
      } catch (error) {
        console.error(`  Failed to convert: ${error.message}\n`);
        failed++;
      }
    }
    
    console.log(`${'='.repeat(60)}`);
    console.log(`${examType.toUpperCase()} Summary:`);
    console.log(`  Total files: ${htmlFiles.length}`);
    console.log(`  Processed: ${processed}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Failed: ${failed}`);
    console.log(`${'='.repeat(60)}\n`);
    
    return { processed, skipped, failed };
  } catch (error) {
    console.error(`Error processing ${examType}:`, error.message);
    return { processed: 0, skipped: 0, failed: 0 };
  }
}

/**
 * Main function to convert all HTML files to PDF
 */
async function convertAllHtmlToPdf() {
  let browser;
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('Convert HTML to PDF');
    console.log('='.repeat(60));
    
    // Launch browser once for all conversions
    console.log('\nLaunching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Browser launched successfully\n');
    
    // Get all exam type directories
    const examTypes = await fs.readdir(HTML_DIR);
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    for (const examType of examTypes) {
      const stats = await fs.stat(path.join(HTML_DIR, examType));
      
      if (stats.isDirectory()) {
        const result = await processExamType(examType, browser);
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
        totalFailed += result.failed;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('OVERALL SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Processed: ${totalProcessed}`);
    console.log(`  Skipped: ${totalSkipped}`);
    console.log(`  Failed: ${totalFailed}`);
    console.log('='.repeat(60));
    console.log('\n✓ Conversion complete!\n');
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}

/**
 * Convert a single HTML file (for testing)
 * @param {string} htmlFilePath - Path to HTML file
 */
async function convertSingleFile(htmlFilePath) {
  let browser;
  
  try {
    if (!htmlFilePath) {
      console.error('Please provide an HTML file path');
      process.exit(1);
    }
    
    // Check if file exists
    try {
      await fs.access(htmlFilePath);
    } catch {
      console.error(`File not found: ${htmlFilePath}`);
      process.exit(1);
    }
    
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    // Create PDF path
    const relativePath = path.relative(HTML_DIR, htmlFilePath);
    const pdfPath = path.join(PDF_DIR, relativePath.replace('.html', '.pdf'));
    
    // Ensure directory exists
    await ensureDirectoryExists(path.dirname(pdfPath));
    
    // Convert
    await convertHtmlToPdf(htmlFilePath, pdfPath, browser);
    
    console.log(`\n✅ Single file conversion completed!`);
    console.log(`PDF saved to: ${pdfPath}`);
    
  } catch (error) {
    console.error('Error converting single file:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Command line argument handling
const args = process.argv.slice(2);

if (args.length > 0) {
  // Convert single file
  convertSingleFile(args[0]);
} else {
  // Convert all files
  convertAllHtmlToPdf();
}

