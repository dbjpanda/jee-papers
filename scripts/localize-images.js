import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT_DIR, 'raw');
const RAW_LOCAL_DIR = path.join(ROOT_DIR, 'raw-local-images');
const IMAGES_JSON = path.join(ROOT_DIR, '.tmp', 'images.json');

// Image URL to local path mapping
let imageMap = new Map();
let processedFiles = 0;
let totalReplacements = 0;
let missingImages = 0;

/**
 * Load images.json and create URL to local path mapping
 */
async function loadImageMapping() {
  try {
    const imagesData = JSON.parse(await fs.readFile(IMAGES_JSON, 'utf8'));
    
    if (!imagesData.images || !Array.isArray(imagesData.images)) {
      throw new Error('Invalid images.json format');
    }
    
    // Create mapping of URL to local path
    imagesData.images.forEach(img => {
      if (img.status === 'success') {
        imageMap.set(img.url, img.localPath);
      }
    });
    
    console.log(`   Loaded ${imageMap.size} successful image mappings`);
    return imagesData;
  } catch (error) {
    console.error('Error loading images.json:', error.message);
    console.log('\n⚠️  Run "npm run download:images" first to generate images.json\n');
    process.exit(1);
  }
}

/**
 * Replace image URLs in content with local paths
 * Replaces src with local path and removes data-orsrc
 */
function replaceImageUrls(content) {
  if (!content) return content;
  
  let replacementsMade = 0;
  let missing = 0;
  
  // After JSON.parse, quotes are unescaped, so match normal quotes
  const newContent = content.replace(/<img([^>]*)>/g, (match, attributes) => {
    let modifiedAttributes = attributes;
    
    // Extract data-orsrc (it has the clean URL we're tracking)
    const dataOrsrcMatch = attributes.match(/data-orsrc="([^"]+)"/);
    
    if (dataOrsrcMatch) {
      const originalUrl = dataOrsrcMatch[1];
      const localPath = imageMap.get(originalUrl);
      
      if (localPath) {
        const localImagePath = `../../${localPath}`;
        
        // Replace src with local path
        modifiedAttributes = modifiedAttributes.replace(
          /src="[^"]+"/,
          `src="${localImagePath}"`
        );
        
        // Remove data-orsrc attribute (with optional space before)
        modifiedAttributes = modifiedAttributes.replace(
          /\s*data-orsrc="[^"]+"/,
          ''
        );
        
        replacementsMade++;
      } else {
        missing++;
      }
    } else {
      // No data-orsrc, try to match src directly
      const srcMatch = attributes.match(/src="([^"]+)"/);
      if (srcMatch) {
        const url = srcMatch[1];
        // Normalize URL (remove /fly/@width/ and query params)
        const normalizedUrl = url
          .replace(/\/fly\/@width\//, '/')
          .replace(/\?.*$/, '');
        
        const localPath = imageMap.get(normalizedUrl);
        
        if (localPath) {
          modifiedAttributes = modifiedAttributes.replace(
            /src="[^"]+"/,
            `src="../../${localPath}"`
          );
          replacementsMade++;
        } else {
          missing++;
        }
      }
    }
    
    return `<img${modifiedAttributes}>`;
  });
  
  totalReplacements += replacementsMade;
  missingImages += missing;
  
  return newContent;
}

/**
 * Process a single question object
 */
function processQuestion(question) {
  if (!question.question || !question.question.en) {
    return question;
  }
  
  const questionEn = { ...question.question.en };
  
  // Replace in question content
  if (questionEn.content) {
    questionEn.content = replaceImageUrls(questionEn.content);
  }
  
  // Replace in options
  if (questionEn.options && Array.isArray(questionEn.options)) {
    questionEn.options = questionEn.options.map(option => ({
      ...option,
      content: replaceImageUrls(option.content)
    }));
  }
  
  // Replace in explanation
  if (questionEn.explanation) {
    questionEn.explanation = replaceImageUrls(questionEn.explanation);
  }
  
  return {
    ...question,
    question: {
      ...question.question,
      en: questionEn
    }
  };
}

/**
 * Process a single JSON file
 */
async function processJsonFile(examType, filename) {
  const inputPath = path.join(RAW_DIR, examType, filename);
  const outputDir = path.join(RAW_LOCAL_DIR, examType);
  const outputPath = path.join(outputDir, filename);
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Read the raw JSON
    const rawData = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    
    // Process all questions
    if (rawData.results && Array.isArray(rawData.results)) {
      rawData.results = rawData.results.map(subjectData => {
        if (subjectData.questions && Array.isArray(subjectData.questions)) {
          return {
            ...subjectData,
            questions: subjectData.questions.map(q => processQuestion(q))
          };
        }
        return subjectData;
      });
    }
    
    // Save the modified JSON
    await fs.writeFile(outputPath, JSON.stringify(rawData, null, 2), 'utf8');
    
    return true;
  } catch (error) {
    console.error(`  ✗ Error processing ${filename}: ${error.message}`);
    return false;
  }
}

/**
 * Process all files in an exam type directory
 */
async function processExamType(examType) {
  const examDir = path.join(RAW_DIR, examType);
  const files = await fs.readdir(examDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing ${examType.toUpperCase()}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Found ${jsonFiles.length} JSON files\n`);
  
  let successCount = 0;
  let failedCount = 0;
  const startReplacements = totalReplacements;
  const startMissing = missingImages;
  
  for (let i = 0; i < jsonFiles.length; i++) {
    const file = jsonFiles[i];
    process.stdout.write(`[${i + 1}/${jsonFiles.length}] ${file}...`);
    
    const success = await processJsonFile(examType, file);
    if (success) {
      successCount++;
      console.log(' ✓');
    } else {
      failedCount++;
      console.log(' ✗');
    }
  }
  
  const typeReplacements = totalReplacements - startReplacements;
  const typeMissing = missingImages - startMissing;
  
  console.log(`\nSummary:`);
  console.log(`  Processed: ${successCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`  Images replaced: ${typeReplacements}`);
  console.log(`  Missing images: ${typeMissing}`);
  
  return { successCount, failedCount };
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Localize Images in Raw JSON Files');
  console.log('='.repeat(60));
  
  // Step 1: Load image mappings
  console.log('\n1. Loading image mappings from .tmp/images.json...');
  const imagesData = await loadImageMapping();
  
  // Step 2: Create output directory
  console.log('\n2. Creating output directory...');
  await fs.mkdir(RAW_LOCAL_DIR, { recursive: true });
  console.log(`   Created: raw-local-images/`);
  
  // Step 3: Process all raw JSON files
  console.log('\n3. Processing raw JSON files...');
  
  const examTypes = await fs.readdir(RAW_DIR);
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (const examType of examTypes) {
    const stats = await fs.stat(path.join(RAW_DIR, examType));
    if (stats.isDirectory()) {
      const result = await processExamType(examType);
      totalSuccess += result.successCount;
      totalFailed += result.failedCount;
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Overall Summary');
  console.log('='.repeat(60));
  console.log(`Files processed: ${totalSuccess}`);
  console.log(`Files failed: ${totalFailed}`);
  console.log(`Total image URLs replaced: ${totalReplacements}`);
  console.log(`Images not found locally: ${missingImages}`);
  console.log('='.repeat(60));
  
  if (missingImages > 0) {
    console.log(`\n⚠️  ${missingImages} image references could not be localized.`);
    console.log('   These will keep their original remote URLs.');
    console.log('   Run "npm run download:images" to download missing images.\n');
  }
  
  console.log(`\n✅ Localization complete!`);
  console.log(`   Output directory: raw-local-images/`);
  console.log(`   - src: replaced with local paths`);
  console.log(`   - data-orsrc: removed\n`);
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

