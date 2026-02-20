export function buildColumnNormalizationPrompt(
  allHeaders: Array<{ tableIdx: number; colIdx: number; header: string }>
): string {
  // Default column normalization prompt
  return `You are analyzing raw OCR output from product catalog tables. The OCR may have identified multiple "tables" but they are actually ONE table with the same columns.

Problems you need to solve:
1. Column headers might be misspelled across different detected tables
2. A column might be unnamed in some tables and have different names in others
3. A column header might appear twice due to OCR errors
4. Column names may vary slightly but refer to the same thing

Here are ALL the column headers detected across all tables:
${allHeaders.map((h) => `Table ${h.tableIdx}, Column ${h.colIdx}: "${h.header}"`).join('\n')}

Your task:
1. Assuming all detected tables should have the SAME set of column headers
2. Analyze the headers and determine the CANONICAL set of column names that best represents the actual table structure
3. For each column index, determine its normalized/canonical header name
4. Merge/deduplicate similar headers (e.g., "Item #", "Item#", "Item No" -> "Item Number")
5. Handle unnamed columns by inferring their purpose from context

Return JSON:
{
  "canonicalHeaders": [
    {"columnIndex": 0, "headerName": "normalized_name_1"},
    {"columnIndex": 1, "headerName": "normalized_name_2"},
    ...
  ],
  "tableStructure": {
    "totalColumns": number,
    "reasoning": "brief explanation of how you determined the canonical headers"
  }
}

Example:
If Table 0 has ["Item #", "Product", "Price"] and Table 1 has ["Item#", "Description", "MSRP"], you should recognize these might be the same columns with different names/spellings and output the canonical headers.`;
}
