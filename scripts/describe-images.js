import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const IMAGES_JSON = path.join(ROOT_DIR, 'images', 'index.json');
const OPENAI_API_KEY = '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';

let processedCount = 0;
let skippedCount = 0;
let failedCount = 0;

const INSTRUCTIONS = `Describe this educational image in this exact format:
{type}|{subject}|{elements}|{key_values}|{relationships}

Where:
- type = diagram, circuit, graph, structure, apparatus, figure, or equation
- subject = physics, chemistry, or mathematics  
- elements = main components separated by hyphens (e.g., boxes-arrows-orbitals)
- key_values = visible symbols and numbers separated by hyphens (e.g., π*-π-σ*-σ)
- relationships = how elements relate (e.g., molecular-orbital, series-circuit)

Rules:
- Use only lowercase, numbers, and: |-/.Ω°↑↓
- No spaces anywhere
- Ignore any watermarks or website text
- Describe the educational content only

Examples:
"diagram|chemistry|arrows-boxes-orbitals|π*-π-σ*-σ|molecular-orbital"
"circuit|physics|battery-resistor-switch|12v-5Ω|series-connection"

Output only the formatted description.`;

/**
 * Convert image file to base64
 */
async function imageToBase64(imagePath) {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    throw new Error(`Failed to read image: ${error.message}`);
  }
}

/**
 * Get image file extension
 */
function getImageMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/png';
}

/**
 * Generate description for a single image using OpenAI
 */
async function generateImageDescription(imagePath, client) {
  try {
    const base64Image = await imageToBase64(imagePath);
    const mimeType = getImageMimeType(imagePath);
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: INSTRUCTIONS
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    });
    
    let description = response.choices[0]?.message?.content || 'Image description unavailable';
    
    // Strip markdown code blocks if present
    if (description.startsWith('```') && description.endsWith('```')) {
      description = description.replace(/```\w*\n?/g, '').trim();
    }
    
    // Post-process: Remove any examgoal references
    description = description.replace(/examgoal\.com/gi, '');
    description = description.replace(/examgoal/gi, '');
    description = description.replace(/exa-mgoal/gi, '');
    
    // Clean up any resulting empty parts or double hyphens
    description = description.replace(/-+/g, '-');
    description = description.replace(/\|-/g, '|');
    description = description.replace(/-\|/g, '|');
    
    // Replace empty sections with "none"
    const parts = description.split('|');
    const cleanedParts = parts.map(part => part.trim() || 'none');
    
    return cleanedParts.join('|');
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Process images and generate descriptions
 */
async function processImages(startIndex = 0, limit = null) {
  console.log('\n' + '='.repeat(60));
  console.log('Image Description Generator');
  console.log('='.repeat(60));
  
  // Load images/index.json
  console.log('\n1. Loading images/index.json...');
  let imagesData;
  try {
    imagesData = JSON.parse(await fs.readFile(IMAGES_JSON, 'utf8'));
    console.log(`   Loaded ${imagesData.images.length} images`);
  } catch (error) {
    console.error('Error loading images/index.json:', error.message);
    console.log('\n⚠️  Run "npm run download:images" first to generate images/index.json\n');
    process.exit(1);
  }
  
  // Initialize OpenAI client
  const client = new OpenAI({
    apiKey: OPENAI_API_KEY
  });
  
  // Get all successful images starting from startIndex
  const imagesToProcess = imagesData.images.filter((img, idx) => {
    if (img.status !== 'success') return false;
    if (idx < startIndex) return false;
    return true;
  });
  
  const totalToProcess = limit ? Math.min(limit, imagesToProcess.length) : imagesToProcess.length;
  
  console.log(`\n2. Processing ${totalToProcess} images (starting from index ${startIndex})...\n`);
  
  // Process images
  for (let i = 0; i < totalToProcess; i++) {
    const imageData = imagesToProcess[i];
    const imagePath = path.join(ROOT_DIR, imageData.localPath);
    
    console.log(`[${i + 1}/${totalToProcess}] ${path.basename(imageData.localPath)}`);
    console.log(`   Local: ${imageData.localPath}`);
    
    // Check if file exists
    try {
      await fs.access(imagePath);
    } catch {
      console.log(`   ⚠ Local image file not found, skipping`);
      skippedCount++;
      continue;
    }
    
    // Generate description using local image file
    try {
      const description = await generateImageDescription(imagePath, client);
      imageData.description = description;
      processedCount++;
      console.log(`   ✓ Description: ${description}`);
    } catch (error) {
      console.error(`   ✗ Failed: ${error.message}`);
      imageData.descriptionError = error.message;
      failedCount++;
    }
    
    // Save progress every 10 images
    if ((i + 1) % 10 === 0) {
      await fs.writeFile(IMAGES_JSON, JSON.stringify(imagesData, null, 2), 'utf8');
      console.log(`   💾 Progress saved (${i + 1}/${totalToProcess})`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Save final results
  console.log('\n3. Saving final results...');
  await fs.writeFile(IMAGES_JSON, JSON.stringify(imagesData, null, 2), 'utf8');
  console.log('   Saved to: images/index.json');
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('='.repeat(60));
  
  if (processedCount > 0) {
    console.log('\n✅ Descriptions generated and saved to images/index.json!');
  }
  
  const totalSuccessful = imagesData.images.filter(img => img.status === 'success').length;
  const withDescriptions = imagesData.images.filter(img => img.status === 'success' && img.description).length;
  const remainingCount = totalSuccessful - withDescriptions;
  
  console.log(`\n📊 Progress: ${withDescriptions}/${totalSuccessful} images described`);
  
  if (remainingCount > 0) {
    console.log(`\n📝 ${remainingCount} images still need descriptions.`);
    console.log(`   Run: npm run describe:images ${withDescriptions} 100\n`);
  } else {
    console.log('\n🎉 All images have descriptions!\n');
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const startIndex = args[0] ? parseInt(args[0]) : 0;
const limit = args[1] ? parseInt(args[1]) : null;

// Run the script
processImages(startIndex, limit).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

