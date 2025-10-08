import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Directories
const RAW_DIR = path.join(ROOT_DIR, 'raw');
const HTML_DIR = path.join(ROOT_DIR, 'html');

/**
 * Generate HTML content for questions
 * @param {string} title - Exam title
 * @param {string} key - Exam key
 * @param {Object} questionsData - Questions data from raw JSON
 * @returns {string} HTML content
 */
function generateHtmlContent(title, key, questionsData) {
  // Collect all questions from all subjects
  const allQuestions = [];
  let questionCounter = 0;
  
  if (questionsData.results && Array.isArray(questionsData.results)) {
    questionsData.results.forEach(subjectData => {
      const subjectName = subjectData._id;
      
      if (subjectData.questions && Array.isArray(subjectData.questions)) {
        subjectData.questions.forEach(question => {
          questionCounter++;
          allQuestions.push({
            seq: questionCounter,
            subject: subjectName,
            chapter: question.chapter,
            question: question,
            type: question.question.en.options.length > 0 ? 'MCQ' : 'Numerical'
          });
        });
      }
    });
  }
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title} (${allQuestions.length} Questions)</title>
<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
<script>
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$'], ['\\(', '\\)']],
      displayMath: [['$$', '$$'], ['\\[', '\\]']]
    },
    svg: {
      fontCache: 'global'
    }
  };
</script>
<style>
  body { font-family: Arial, sans-serif; max-width: 980px; margin: 40px auto; padding: 20px; line-height: 1.6; }
  .qwrap { margin-bottom: 40px; border: 1px solid #e5e5e5; border-radius: 10px; overflow: hidden; }
  .qhead { background: #111; color: #fff; padding: 10px 14px; font-weight: bold; display: flex; align-items: center; gap: 10px; }
  .qtype { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: #e0e7ff; color: #1e3a8a; }
  .qbody { padding: 16px; }
  .question { background: #f5f5f5; padding: 16px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #FF9800; }
  .question-title { font-weight: bold; color: #333; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
  .question-content { font-size: 16px; color: #222; }
  .options { display: grid; gap: 12px; margin-bottom: 20px; }
  .option { background: #fff; padding: 12px; border-radius: 6px; border: 1.5px solid #e0e0e0; display: flex; align-items: center; }
  .option-label { background: #2196F3; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 12px; flex-shrink: 0; }
  .option-content { flex: 1; font-size: 16px; }
  .correct-option { background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #4CAF50; }
  .correct-title { font-weight: bold; color: #333; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; }
  .correct-answer { font-size: 16px; color: #222; font-weight: 600; }
  .correct-label { background: #4CAF50; color: #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; margin-right: 12px; flex-shrink: 0; }
  .correct-content { flex: 1; font-size: 16px; }
  .source { background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #9C27B0; }
  .source-title { font-weight: bold; color: #333; margin-bottom: 8px; font-size: 14px; text-transform: uppercase; }
  .source-content { font-size: 14px; color: #555; }
  .explanation { background: #f8f9fa; padding: 16px; border-radius: 6px; border-left: 4px solid #007bff; }
  .explanation-title { font-weight: bold; color: #007bff; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; }
  .explanation-content { font-size: 16px; color: #222; }
  mjx-container { display: inline-block; margin: 0 2px; }
  svg, img { max-width: 100%; height: auto; }
</style>
</head>
<body>
<h1>${title} (${allQuestions.length} Questions)</h1>
`;

  // Generate HTML for each question
  allQuestions.forEach(({ seq, subject, chapter, question, type }) => {
    const correctOptions = question.question.en.correct_options || [];
    const correctAnswerText = correctOptions.map(opt => {
      const option = question.question.en.options.find(o => o.identifier === opt);
      return option ? `${opt}: ${option.content}` : opt;
    }).join(', ');

    html += `
<section class="qwrap">
  <div class="qhead">
    <div>Question ${String(seq).padStart(3, '0')}</div>
    <span class="qtype">${type}</span>
  </div>
  <div class="qbody">
    <div class="question">
      <div class="question-title">Question</div>
      <div class="question-content">${question.question.en.content}</div>
    </div>
    ${question.question.en.options.length ? `
    <div class="options">
      ${question.question.en.options.map(opt => `
      <div class="option">
        <div class="option-label">${opt.identifier}</div>
        <div class="option-content">${opt.content}</div>
      </div>`).join('')}
    </div>` : ''}
    ${correctOptions.length ? `
    <div class="correct-option">
      <div class="correct-title">Correct Option</div>
      <div style="display: flex; align-items: center; margin-top: 8px;">
        <div class="correct-label">${correctOptions[0]}</div>
        <div class="correct-content">${question.question.en.options.find(o => o.identifier === correctOptions[0])?.content || correctOptions[0]}</div>
      </div>
    </div>` : ''}
    <div class="source">
      <div class="source-title">Source</div>
      <div class="source-content">${subject} • ${chapter}</div>
    </div>
    ${question.question.en.explanation ? `
    <div class="explanation">
      <div class="explanation-title">Explanation</div>
      <div class="explanation-content">${question.question.en.explanation}</div>
    </div>` : ''}
  </div>
</section>
`;
  });

  html += `</body>
</html>`;

  return html;
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
 * Extract title from key
 * @param {string} key - Exam key
 * @returns {string} Human-readable title
 */
function keyToTitle(key) {
  // Convert key like "jee-main-2025-online-8th-april-evening-shift" to
  // "JEE Main 2025 (Online) 8th April Evening Shift"
  const parts = key.split('-');
  
  // Handle exam type (jee-main, jee-advanced)
  let title = '';
  if (parts[0] === 'jee' && parts[1] === 'main') {
    title = 'JEE Main';
    parts.splice(0, 2);
  } else if (parts[0] === 'jee' && parts[1] === 'advanced') {
    title = 'JEE Advanced';
    parts.splice(0, 2);
  }
  
  // Get year
  const year = parts[0];
  title += ` ${year}`;
  parts.splice(0, 1);
  
  // Handle online/offline/paper
  if (parts[0] === 'online') {
    title += ' (Online)';
    parts.splice(0, 1);
  } else if (parts[0] === 'offline') {
    title += ' (Offline)';
    parts.splice(0, 1);
  } else if (parts[0] === 'paper') {
    title += ` Paper ${parts[1]}`;
    parts.splice(0, 2);
    if (parts[0] === 'online' || parts[0] === 'offline') {
      title += ` (${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)})`;
      parts.splice(0, 1);
    }
  }
  
  // Capitalize remaining parts
  const remaining = parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  if (remaining) {
    title += ' ' + remaining;
  }
  
  return title;
}

/**
 * Process a single JSON file
 * @param {string} examType - Exam type (jee-main, jee-advanced, etc.)
 * @param {string} filename - JSON filename
 */
async function processJsonFile(examType, filename) {
  try {
    const key = filename.replace('.json', '');
    const rawFilePath = path.join(RAW_DIR, examType, filename);
    
    console.log(`Processing: ${key}`);
    
    // Read raw JSON data
    const rawData = JSON.parse(await fs.readFile(rawFilePath, 'utf8'));
    
    // Count questions
    let totalQuestions = 0;
    if (rawData.results && Array.isArray(rawData.results)) {
      rawData.results.forEach(subject => {
        if (subject.questions && Array.isArray(subject.questions)) {
          totalQuestions += subject.questions.length;
        }
      });
    }
    
    if (totalQuestions === 0) {
      console.log(`  ⚠ Skipped (0 questions)\n`);
      return { success: true, skipped: true };
    }
    
    // Generate title from key
    const title = keyToTitle(key);
    
    // Generate HTML
    const htmlContent = generateHtmlContent(title, key, rawData);
    
    // Create output directory
    const htmlOutputDir = path.join(HTML_DIR, examType);
    await ensureDirectoryExists(htmlOutputDir);
    
    // Save HTML file
    const htmlFilePath = path.join(htmlOutputDir, `${key}.html`);
    await fs.writeFile(htmlFilePath, htmlContent, 'utf8');
    
    console.log(`  ✓ Saved: ${htmlFilePath}`);
    console.log(`  Questions: ${totalQuestions}\n`);
    
    return { success: true, questions: totalQuestions };
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}\n`);
    return { success: false, error: error.message };
  }
}

/**
 * Process all JSON files in a directory
 * @param {string} examType - Exam type directory name
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
    console.log('Convert Raw JSON to HTML');
    console.log('='.repeat(60));
    
    // Get all exam type directories
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

