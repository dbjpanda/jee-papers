import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT_DIR, 'raw');
const IMAGES_DIR = path.join(ROOT_DIR, 'images');
const TMP_DIR = path.join(ROOT_DIR, '.tmp');
const IMAGES_JSON = path.join(TMP_DIR, 'images.json');

// Track image metadata
const imageRegistry = new Map();
let downloadedCount = 0;
let skippedCount = 0;
let failedCount = 0;

/**
 * Extract domain and path from image URL to create local path
 */
function getLocalImagePath(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const hostname = url.hostname.replace(/\./g, '_');
    const pathname = url.pathname;
    
    // Create a clean path: images/hostname/path/to/image.jpg
    const localPath = path.join(IMAGES_DIR, hostname, pathname);
    return localPath;
  } catch (error) {
    console.error(`Invalid URL: ${imageUrl}`);
    return null;
  }
}

/**
 * Download an image from URL to local path
 */
async function downloadImage(imageUrl, localPath) {
  try {
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    
    // Download the image
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Save to file
    const fileStream = createWriteStream(localPath);
    await pipeline(response.body, fileStream);
    
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to download: ${error.message}`);
    return false;
  }
}

/**
 * Extract image URLs from question data and register them
 */
function extractAndRegisterImages(questionData, examType, examKey, questionIndex) {
  if (!questionData.question || !questionData.question.en) {
    return;
  }
  
  const question = questionData.question.en;
  const subject = questionData.subject || 'unknown';
  const chapter = questionData.chapter || 'unknown';
  
  const registerImage = (url, location) => {
    if (!url) return;
    
    const localPath = getLocalImagePath(url);
    if (!localPath) return;
    
    if (!imageRegistry.has(url)) {
      imageRegistry.set(url, {
        url,
        localPath: path.relative(ROOT_DIR, localPath),
        status: 'pending',
        usedIn: []
      });
    }
    
    // Add usage location
    imageRegistry.get(url).usedIn.push({
      examType,
      examKey,
      subject,
      chapter,
      questionIndex,
      location
    });
  };
  
  const extractFromContent = (content, location) => {
    if (!content) return;
    
    // Find all img tags
    const imgMatches = content.matchAll(/<img([^>]*)>/g);
    for (const imgMatch of imgMatches) {
      const attributes = imgMatch[1];
      
      // First priority: extract from data-orsrc (clean URL)
      const dataOrsrcMatch = attributes.match(/data-orsrc="([^"]+)"/);
      if (dataOrsrcMatch) {
        registerImage(dataOrsrcMatch[1], location);
      } else {
        // Fallback: extract from src and normalize
        const srcMatch = attributes.match(/src="([^"]+)"/);
        if (srcMatch) {
          // Normalize URL: remove /fly/@width/ and query parameters
          const normalizedUrl = srcMatch[1]
            .replace(/\/fly\/@width\//, '/')
            .replace(/\?.*$/, '');
          registerImage(normalizedUrl, location);
        }
      }
    }
  };
  
  // Extract from question content
  extractFromContent(question.content, 'question');
  
  // Extract from options
  if (question.options && Array.isArray(question.options)) {
    question.options.forEach((option, idx) => {
      extractFromContent(option.content, `option_${option.identifier || idx}`);
    });
  }
  
  // Extract from explanation
  extractFromContent(question.explanation, 'explanation');
}

/**
 * Process a single JSON file and register all images
 */
async function processJsonFile(examType, filename) {
  const filePath = path.join(RAW_DIR, examType, filename);
  const examKey = filename.replace('.json', '');
  
  try {
    const rawData = JSON.parse(await fs.readFile(filePath, 'utf8'));
    let questionIndex = 0;
    
    if (rawData.results && Array.isArray(rawData.results)) {
      rawData.results.forEach(subjectData => {
        if (subjectData.questions && Array.isArray(subjectData.questions)) {
          subjectData.questions.forEach(question => {
            questionIndex++;
            extractAndRegisterImages(question, examType, examKey, questionIndex);
          });
        }
      });
    }
  } catch (error) {
    console.error(`Error processing ${filename}: ${error.message}`);
  }
}

/**
 * Process all JSON files in an exam type directory
 */
async function processExamType(examType) {
  const examDir = path.join(RAW_DIR, examType);
  const files = await fs.readdir(examDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`\nProcessing ${examType}...`);
  console.log(`Found ${jsonFiles.length} JSON files`);
  
  for (const file of jsonFiles) {
    await processJsonFile(examType, file);
  }
  
  console.log(`  Registered images from ${jsonFiles.length} files`);
}

/**
 * Check if an image file exists locally
 */
async function imageExists(localPath) {
  try {
    await fs.access(localPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Image Downloader & Registry Generator');
  console.log('='.repeat(60));
  
  // Create images and tmp directories
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  
  // Step 1: Scan all JSON files and register images
  console.log('\n1. Scanning raw JSON files...');
  const examTypes = await fs.readdir(RAW_DIR);
  
  for (const examType of examTypes) {
    const stats = await fs.stat(path.join(RAW_DIR, examType));
    if (stats.isDirectory()) {
      await processExamType(examType);
    }
  }
  
  const totalImages = imageRegistry.size;
  console.log(`\n   Total unique images found: ${totalImages}`);
  
  // Step 2: Check which images already exist locally
  console.log('\n2. Checking local images...');
  let existingCount = 0;
  
  for (const [url, data] of imageRegistry.entries()) {
    const localPath = path.join(ROOT_DIR, data.localPath);
    if (await imageExists(localPath)) {
      data.status = 'success';
      existingCount++;
      skippedCount++;
    }
  }
  
  console.log(`   Found ${existingCount} images already downloaded`);
  
  // Step 3: Download missing images
  const missingImages = Array.from(imageRegistry.entries()).filter(([url, data]) => data.status === 'pending');
  
  if (missingImages.length > 0) {
    console.log(`\n3. Downloading ${missingImages.length} missing images...\n`);
    
    for (let i = 0; i < missingImages.length; i++) {
      const [url, data] = missingImages[i];
      const localPath = path.join(ROOT_DIR, data.localPath);
      
      console.log(`[${i + 1}/${missingImages.length}] ${url}`);
      
      const success = await downloadImage(url, localPath);
      if (success) {
        data.status = 'success';
        downloadedCount++;
        console.log(`  ✓ Saved`);
      } else {
        data.status = 'failed';
        data.error = 'Download failed';
        failedCount++;
      }
      
      // Add a small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } else {
    console.log('\n3. All images already downloaded!');
  }
  
  // Step 4: Save images.json
  console.log('\n4. Saving images.json...');
  
  const imagesData = {
    generatedAt: new Date().toISOString(),
    totalImages,
    downloaded: downloadedCount + skippedCount,
    failed: failedCount,
    images: Array.from(imageRegistry.entries()).map(([url, data]) => ({
      url,
      localPath: data.localPath,
      status: data.status,
      error: data.error,
      usageCount: data.usedIn.length,
      usedIn: data.usedIn
    }))
  };
  
  await fs.writeFile(IMAGES_JSON, JSON.stringify(imagesData, null, 2), 'utf8');
  console.log(`   Saved to: .tmp/images.json`);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total unique images: ${totalImages}`);
  console.log(`Successfully downloaded: ${downloadedCount + skippedCount}`);
  console.log(`  - Already existed: ${skippedCount}`);
  console.log(`  - Newly downloaded: ${downloadedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('='.repeat(60));
  
  if (failedCount > 0) {
    console.log('\n⚠️  Some images failed to download.');
    console.log('   Check .tmp/images.json for details on failed images.');
    console.log('   Run this script again to retry failed downloads.\n');
  } else {
    console.log('\n✅ All images downloaded successfully!\n');
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

