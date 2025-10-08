import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT_DIR, 'raw');
const RAW_LOCAL_DIR = path.join(ROOT_DIR, 'raw-local-images');
const IMAGES_JSON = path.join(ROOT_DIR, '.tmp', 'images.json');

let totalChecks = 0;
let matchedImages = 0;
let mismatchedImages = 0;
let missingLocalFiles = 0;

/**
 * Extract all image URLs from content
 */
function extractImageUrls(content) {
  if (!content) return [];
  
  const urls = [];
  const imgMatches = content.matchAll(/<img[^>]+src="([^"]+)"/g);
  
  for (const match of imgMatches) {
    urls.push(match[1]);
  }
  
  return urls;
}

/**
 * Get normalized URL (remove CDN transformations)
 */
function getNormalizedUrl(url) {
  // Remove /fly/@width/ and query parameters to get base URL
  return url
    .replace(/\/fly\/@width\//, '/')
    .replace(/\?.*$/, '');
}

/**
 * Compare images in a single file
 */
async function compareFile(examType, filename, imageMap) {
  const rawPath = path.join(RAW_DIR, examType, filename);
  const localPath = path.join(RAW_LOCAL_DIR, examType, filename);
  
  const results = {
    file: filename,
    totalImages: 0,
    matched: 0,
    mismatched: 0,
    missingFiles: 0,
    details: []
  };
  
  try {
    const rawData = JSON.parse(await fs.readFile(rawPath, 'utf8'));
    const localData = JSON.parse(await fs.readFile(localPath, 'utf8'));
    
    // Extract all images from both files
    const rawImages = new Map();
    const localImages = new Map();
    
    if (rawData.results && Array.isArray(rawData.results)) {
      rawData.results.forEach((subjectData, subIdx) => {
        if (subjectData.questions && Array.isArray(subjectData.questions)) {
          subjectData.questions.forEach((question, qIdx) => {
            const key = `${subIdx}-${qIdx}`;
            
            // Collect from question content
            if (question.question?.en?.content) {
              const urls = extractImageUrls(question.question.en.content);
              urls.forEach(url => {
                if (!rawImages.has(key)) rawImages.set(key, []);
                rawImages.get(key).push(getNormalizedUrl(url));
              });
            }
            
            // Collect from options
            if (question.question?.en?.options) {
              question.question.en.options.forEach(opt => {
                const urls = extractImageUrls(opt.content);
                urls.forEach(url => {
                  if (!rawImages.has(key)) rawImages.set(key, []);
                  rawImages.get(key).push(getNormalizedUrl(url));
                });
              });
            }
            
            // Collect from explanation
            if (question.question?.en?.explanation) {
              const urls = extractImageUrls(question.question.en.explanation);
              urls.forEach(url => {
                if (!rawImages.has(key)) rawImages.set(key, []);
                rawImages.get(key).push(getNormalizedUrl(url));
              });
            }
          });
        }
      });
    }
    
    // Same for local data
    if (localData.results && Array.isArray(localData.results)) {
      localData.results.forEach((subjectData, subIdx) => {
        if (subjectData.questions && Array.isArray(subjectData.questions)) {
          subjectData.questions.forEach((question, qIdx) => {
            const key = `${subIdx}-${qIdx}`;
            
            if (question.question?.en?.content) {
              const urls = extractImageUrls(question.question.en.content);
              urls.forEach(url => {
                if (!localImages.has(key)) localImages.set(key, []);
                localImages.get(key).push(url);
              });
            }
            
            if (question.question?.en?.options) {
              question.question.en.options.forEach(opt => {
                const urls = extractImageUrls(opt.content);
                urls.forEach(url => {
                  if (!localImages.has(key)) localImages.set(key, []);
                  localImages.get(key).push(url);
                });
              });
            }
            
            if (question.question?.en?.explanation) {
              const urls = extractImageUrls(question.question.en.explanation);
              urls.forEach(url => {
                if (!localImages.has(key)) localImages.set(key, []);
                localImages.get(key).push(url);
              });
            }
          });
        }
      });
    }
    
    // Compare
    for (const [key, rawUrls] of rawImages.entries()) {
      const localUrls = localImages.get(key) || [];
      
      if (rawUrls.length !== localUrls.length) {
        results.mismatched += rawUrls.length;
        results.details.push({
          question: key,
          issue: 'count_mismatch',
          raw: rawUrls.length,
          local: localUrls.length
        });
        continue;
      }
      
      for (let i = 0; i < rawUrls.length; i++) {
        results.totalImages++;
        totalChecks++;
        
        const rawUrl = rawUrls[i];
        const localUrl = localUrls[i];
        
        // Check if local URL is actually local path
        if (!localUrl.startsWith('../../images/')) {
          results.mismatched++;
          mismatchedImages++;
          results.details.push({
            question: key,
            issue: 'not_localized',
            url: localUrl
          });
          continue;
        }
        
        // Extract the actual path and verify it maps correctly
        const expectedLocalPath = imageMap.get(rawUrl);
        const actualLocalPath = localUrl.replace('../../', '');
        
        if (expectedLocalPath === actualLocalPath) {
          results.matched++;
          matchedImages++;
          
          // Verify file exists
          const fullPath = path.join(ROOT_DIR, actualLocalPath);
          try {
            await fs.access(fullPath);
          } catch {
            results.missingFiles++;
            missingLocalFiles++;
          }
        } else {
          results.mismatched++;
          mismatchedImages++;
          results.details.push({
            question: key,
            issue: 'path_mismatch',
            expected: expectedLocalPath,
            actual: actualLocalPath
          });
        }
      }
    }
    
  } catch (error) {
    console.error(`Error comparing ${filename}: ${error.message}`);
  }
  
  return results;
}

/**
 * Main verification function
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('Image Localization Verification');
  console.log('='.repeat(60));
  
  // Load image mapping
  console.log('\n1. Loading image mappings...');
  let imageMap = new Map();
  
  try {
    const imagesData = JSON.parse(await fs.readFile(IMAGES_JSON, 'utf8'));
    imagesData.images.forEach(img => {
      if (img.status === 'success') {
        imageMap.set(img.url, img.localPath);
      }
    });
    console.log(`   Loaded ${imageMap.size} image mappings`);
  } catch (error) {
    console.error('Error loading images.json:', error.message);
    process.exit(1);
  }
  
  // Verify all files
  console.log('\n2. Verifying localized files...\n');
  
  const examTypes = await fs.readdir(RAW_DIR);
  const allResults = [];
  
  for (const examType of examTypes) {
    const stats = await fs.stat(path.join(RAW_DIR, examType));
    if (!stats.isDirectory()) continue;
    
    const files = await fs.readdir(path.join(RAW_DIR, examType));
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    console.log(`Verifying ${examType} (${jsonFiles.length} files)...`);
    
    for (const file of jsonFiles) {
      const result = await compareFile(examType, file, imageMap);
      allResults.push(result);
    }
  }
  
  // Calculate statistics
  const fileResults = {
    total: allResults.length,
    withImages: allResults.filter(r => r.totalImages > 0).length,
    withIssues: allResults.filter(r => r.mismatched > 0 || r.missingFiles > 0).length
  };
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Verification Results');
  console.log('='.repeat(60));
  console.log(`Files checked: ${fileResults.total}`);
  console.log(`Files with images: ${fileResults.withImages}`);
  console.log(`\nImage Verification:`);
  console.log(`  Total image references: ${totalChecks}`);
  console.log(`  Correctly matched: ${matchedImages} ✓`);
  console.log(`  Mismatched: ${mismatchedImages}`);
  console.log(`  Local files missing: ${missingLocalFiles}`);
  console.log('='.repeat(60));
  
  if (mismatchedImages > 0 || missingLocalFiles > 0) {
    console.log('\n⚠️  Issues found:');
    
    if (mismatchedImages > 0) {
      console.log(`   - ${mismatchedImages} images have incorrect local paths`);
    }
    if (missingLocalFiles > 0) {
      console.log(`   - ${missingLocalFiles} local image files are missing`);
    }
    
    // Show files with issues
    const filesWithIssues = allResults.filter(r => r.details.length > 0);
    if (filesWithIssues.length > 0) {
      console.log(`\nFiles with issues: ${filesWithIssues.length}`);
      
      if (filesWithIssues.length <= 10) {
        filesWithIssues.forEach(r => {
          console.log(`\n   ${r.file}:`);
          r.details.slice(0, 3).forEach(d => {
            console.log(`     - ${d.issue}: ${JSON.stringify(d).substring(0, 100)}...`);
          });
        });
      }
      
      // Show sample issues
      const allIssues = filesWithIssues.flatMap(r => r.details);
      console.log(`\nSample issues (first 5):`);
      allIssues.slice(0, 5).forEach((issue, idx) => {
        console.log(`\n${idx + 1}. Issue: ${issue.issue}`);
        if (issue.url) console.log(`   URL: ${issue.url}`);
        if (issue.expected) console.log(`   Expected: ${issue.expected}`);
        if (issue.actual) console.log(`   Actual: ${issue.actual}`);
      });
    }
    console.log('');
  } else {
    console.log('\n✅ Perfect! All image URLs are correctly localized!');
    console.log(`   - All ${totalChecks} image references matched`);
    console.log(`   - All local image files exist`);
    console.log(`   - raw/ and raw-local-images/ are in sync\n`);
  }
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

