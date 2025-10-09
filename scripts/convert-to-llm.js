import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Directories
const RAW_DIR = path.join(ROOT_DIR, 'raw');
const LLM_DIR = path.join(ROOT_DIR, 'llm');
const IMAGES_INDEX = path.join(ROOT_DIR, 'images', 'index.json');

// Global image mapping (url -> {localPath, description})
let imageMap = new Map();

/**
 * Load images index with descriptions
 */
async function loadImagesIndex() {
    try {
        const imagesData = JSON.parse(await fs.readFile(IMAGES_INDEX, 'utf8'));
        
        imagesData.images.forEach(img => {
            if (img.status === 'success') {
                // Map both original URL and local path
                imageMap.set(img.url, {
                    localPath: img.localPath,
                    description: img.description || ''
                });
                
                // Also map by local path for easier lookup
                imageMap.set(img.localPath, {
                    localPath: img.localPath,
                    description: img.description || ''
                });
            }
        });
        
        console.log(`   Loaded ${imageMap.size / 2} image mappings`);
    } catch (error) {
        console.warn('Warning: Could not load images/index.json:', error.message);
        console.log('   Image descriptions will not be included.');
    }
}

/**
 * Extract image paths and descriptions from HTML content
 */
function extractImages(content) {
    if (!content) return { paths: [], descriptions: [] };
    
    const imagePaths = [];
    const imageDescriptions = [];
    
    // Find all img tags with local src
    const imgMatches = content.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g);
    
    for (const match of imgMatches) {
        const src = match[1];
        
        // Extract the local path (remove ../../ prefix)
        const localPath = src.replace(/^\.\.\/\.\.\//, '');
        
        imagePaths.push(localPath);
        
        // Get description from imageMap
        const imageData = imageMap.get(localPath);
        if (imageData && imageData.description) {
            imageDescriptions.push(imageData.description);
        } else {
            imageDescriptions.push('');
        }
    }
    
    return {
        paths: imagePaths,
        descriptions: imageDescriptions
    };
}

/**
 * Extract year, date, and shift from key
 * Example: "jee-main-2025-online-8th-april-evening-shift"
 */
function parseKeyToMetadata(key) {
    const parts = key.split('-');
    
    let examType = '';
    let year = null;
    let date = null;
    let shift = 1;
    
    // Extract exam type
    if (parts[0] === 'jee' && parts[1] === 'main') {
        examType = 'JEE Main';
    } else if (parts[0] === 'jee' && parts[1] === 'advanced') {
        examType = 'JEE Advanced';
    } else if (parts[0] === 'iit' && parts[1] === 'jee') {
        examType = 'IIT JEE';
    } else if (parts[0] === 'aieee') {
        examType = 'AIEEE';
    }
    
    // Extract year - look for 4-digit year
    const yearMatch = key.match(/(\d{4})/);
    if (yearMatch) {
        year = parseInt(yearMatch[1]);
    }
    
    // Extract date
    const dateMatch = key.match(/(\d+)(?:st|nd|rd|th)-(\w+)/);
    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].substring(0, 3);
        date = `${day}-${month}`;
    }
    
    // Extract shift
    if (key.includes('morning')) {
        shift = 1;
    } else if (key.includes('evening') || key.includes('afternoon')) {
        shift = 2;
    }
    
    return { examType, year, date, shift };
}

/**
 * Strip HTML tags and convert to plain text
 */
function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<\/p>/g, '\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
}

/**
 * Convert HTML content to LaTeX-friendly format
 */
function convertToLatex(html) {
    if (!html) return '';
    
    // Replace sup tags with LaTeX superscript
    let result = html.replace(/<sup>(.*?)<\/sup>/g, '^{$1}');
    
    // Replace sub tags with LaTeX subscript
    result = result.replace(/<sub>(.*?)<\/sub>/g, '_{$1}');
    
    // Remove paragraph tags but keep content
    result = result.replace(/<p>(.*?)<\/p>/g, '$1 ');
    
    // Remove other HTML tags
    result = result.replace(/<[^>]+>/g, '');
    
    // Decode HTML entities
    result = result
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    
    return result.trim();
}

/**
 * Extract options in the new format
 */
function extractOptions(options) {
    const result = {};
    if (!options || options.length === 0) {
        return result;
    }
    options.forEach(option => {
        result[option.identifier] = convertToLatex(option.content);
    });
    return result;
}

/**
 * Extract images from options - with path and description
 */
function extractOptionsImages(options) {
    const optionsImages = {};
    if (!options || options.length === 0) {
        return optionsImages;
    }
    
    options.forEach(option => {
        const imageData = extractImages(option.content);
        if (imageData.paths.length > 0) {
            // Use first image if multiple
            optionsImages[option.identifier] = {
                path: imageData.paths[0] || '',
                description: imageData.descriptions[0] || ''
            };
        }
    });
    
    return optionsImages;
}

/**
 * Convert a single question to LLM format
 */
function convertQuestion(question, questionNumber, metadata) {
    const { examType, year, date, shift } = metadata;
    const questionContent = question.question.en;
    
    // Extract images from question content
    const questionImages = extractImages(questionContent.content);
    
    // Extract images from explanation
    const explanationImages = extractImages(questionContent.explanation);
    
    // Combine all question images with path and description objects
    const allPaths = [...questionImages.paths, ...explanationImages.paths];
    const allDescriptions = [...questionImages.descriptions, ...explanationImages.descriptions];
    
    const questionImagesArray = allPaths.map((imagePath, idx) => ({
        path: imagePath,
        description: allDescriptions[idx] || ''
    }));
    
    // Extract images from options
    const optionImagesData = extractOptionsImages(questionContent.options);
    
    return {
        question_number: questionNumber,
        year,
        exam_type: examType,
        shift,
        subject: question.subject.charAt(0).toUpperCase() + question.subject.slice(1),
        topic: question.chapter || "",
        sub_topic: question.chapterGroup || "",
        question_text: stripHtml(questionContent.content),
        question_images: questionImagesArray,
        option_texts: extractOptions(questionContent.options),
        option_images: optionImagesData,
        correct_answer: questionContent.correct_options?.[0] || "",
        marks: question.marks || 4,
        negMarks: question.negMarks || 1,
        difficulty: question.difficulty || null,
        isOutOfSyllabus: question.isOutOfSyllabus || false
    };
}

/**
 * Create directory structure if it doesn't exist
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
 * Process a single JSON file
 */
async function processJsonFile(examType, filename) {
    try {
        const key = filename.replace('.json', '');
        const rawFilePath = path.join(RAW_DIR, examType, filename);
        
        console.log(`Processing: ${key}`);
        
        // Read raw JSON data
        const rawData = JSON.parse(await fs.readFile(rawFilePath, 'utf8'));
        
        // Collect all questions from all subjects
        const allQuestions = [];
        let questionCounter = 0;
        
        if (rawData.results && Array.isArray(rawData.results)) {
            rawData.results.forEach(subjectData => {
                if (subjectData.questions && Array.isArray(subjectData.questions)) {
                    subjectData.questions.forEach(question => {
                        questionCounter++;
                        allQuestions.push(question);
                    });
                }
            });
        }
        
        if (allQuestions.length === 0) {
            console.log(`  ⚠ Skipped (0 questions)\n`);
            return { success: true, skipped: true };
        }
        
        // Extract metadata from key
        const metadata = parseKeyToMetadata(key);
        
        // Convert questions to LLM format
        const convertedQuestions = allQuestions.map((question, index) => {
            return convertQuestion(question, index + 1, metadata);
        });
        
        const examData = {
            exam_details: {
                year: metadata.year,
                exam_type: metadata.examType,
                shift: metadata.shift,
                date: metadata.date,
                total_questions: convertedQuestions.length
            },
            questions: convertedQuestions
        };
        
        // Create output directory
        const llmOutputDir = path.join(LLM_DIR, examType);
        await ensureDirectoryExists(llmOutputDir);
        
        // Save LLM format file
        const llmFilePath = path.join(llmOutputDir, `${key}.json`);
        await fs.writeFile(llmFilePath, JSON.stringify(examData, null, 2), 'utf8');
        
        console.log(`  ✓ Saved: ${llmFilePath}`);
        console.log(`  Questions: ${convertedQuestions.length}\n`);
        
        return { success: true, questions: convertedQuestions.length };
    } catch (error) {
        console.error(`  ✗ Error: ${error.message}\n`);
        return { success: false, error: error.message };
    }
}

/**
 * Process all JSON files in a directory
 */
async function processExamType(examType) {
    try {
        const rawExamDir = path.join(RAW_DIR, examType);
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Processing ${examType.toUpperCase()}`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Get all JSON files in the directory
        const files = await fs.readdir(rawExamDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} JSON files\n`);
        
        let processed = 0;
        let skipped = 0;
        let failed = 0;
        let totalQuestions = 0;
        
        for (const file of jsonFiles) {
            const result = await processJsonFile(examType, file);
            
            if (result.success) {
                if (result.skipped) {
                    skipped++;
                } else {
                    processed++;
                    totalQuestions += result.questions || 0;
                }
            } else {
                failed++;
            }
        }
        
        console.log(`${'='.repeat(60)}`);
        console.log(`${examType.toUpperCase()} Summary:`);
        console.log(`  Total files: ${jsonFiles.length}`);
        console.log(`  Processed: ${processed}`);
        console.log(`  Skipped: ${skipped}`);
        console.log(`  Failed: ${failed}`);
        console.log(`  Total questions: ${totalQuestions}`);
        console.log(`${'='.repeat(60)}\n`);
        
        return { processed, skipped, failed, totalQuestions };
    } catch (error) {
        console.error(`Error processing ${examType}:`, error.message);
        return { processed: 0, skipped: 0, failed: 0, totalQuestions: 0 };
    }
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('Convert Raw JSON to LLM Format');
        console.log('='.repeat(60));
        
        // Load image mappings
        console.log('\n1. Loading image index...');
        await loadImagesIndex();
        
        // Get all exam type directories
        console.log('\n2. Processing exam files...');
        const examTypes = await fs.readdir(RAW_DIR);
        
        let totalProcessed = 0;
        let totalSkipped = 0;
        let totalFailed = 0;
        let totalQuestions = 0;
        
        for (const examType of examTypes) {
            const stats = await fs.stat(path.join(RAW_DIR, examType));
            
            if (stats.isDirectory()) {
                const result = await processExamType(examType);
                totalProcessed += result.processed;
                totalSkipped += result.skipped;
                totalFailed += result.failed;
                totalQuestions += result.totalQuestions;
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('OVERALL SUMMARY');
        console.log('='.repeat(60));
        console.log(`  Processed: ${totalProcessed}`);
        console.log(`  Skipped: ${totalSkipped}`);
        console.log(`  Failed: ${totalFailed}`);
        console.log(`  Total questions: ${totalQuestions}`);
        console.log('='.repeat(60));
        console.log('\n✓ Conversion complete!\n');
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the main function
main();

