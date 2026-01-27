#!/usr/bin/env tsx
/**
 * Extract AI mapping result from JSON file
 * Usage: cd /home/eitanick/code/profitforge.ai/javascript && npx tsx test/tools/extractMapping.ts [json_file_path]
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function extractMapping(jsonPath: string) {
  console.log(`📂 Reading file: ${jsonPath}\n`);

  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

    if (!Array.isArray(data) || data.length === 0) {
      console.log('📭 No documents found in JSON file');
      process.exit(0);
    }

    console.log(`📄 Found ${data.length} document(s):\n`);

    data.forEach((row, idx) => {
      console.log(`Document ${idx + 1}:`);
      console.log(`  ID: ${row.result_id}`);
      console.log(`  Document Name: ${row.document_name}`);
      console.log(`  Vendor Name: ${row.vendor_name}`);
      console.log(`  Processing Status: ${row.processing_status}`);
      console.log(`  Product Count: ${row.product_count}`);
      console.log(`  Created: ${row.uploaded_at}`);
      console.log(`\n📦 AI Mapping Result:`);

      if (row.ai_mapping_result) {
        const parsed =
          typeof row.ai_mapping_result === 'string'
            ? JSON.parse(row.ai_mapping_result)
            : row.ai_mapping_result;
        console.log(JSON.stringify(parsed, null, 2));
      } else {
        console.log('  (null)');
      }

      console.log('\n' + '─'.repeat(60) + '\n');
    });
  } catch (err: any) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// Parse command line args
const jsonPath = process.argv[2] || 'test/tools/processed_e2e.json';
const fullPath = jsonPath.startsWith('/') ? jsonPath : join(process.cwd(), jsonPath);

extractMapping(fullPath);
