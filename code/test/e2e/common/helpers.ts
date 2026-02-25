/*
 *  API Test Helpers for end-to-end tests
 *  - Upload document
 *  - Reprocess OCR
 *  - Reprocess AI mapping
 *  - Get AI defaults
 *  - Confirm mapping (export)
 *  - Delete run
 *  - Get documents (query)
 *  - Upload benchmark file
 *  - Get benchmark data
 *  - Grade run against benchmark
 */

import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getFunctionAppURL } from '../../../src/utils/config';

const FUNCTION_BASE_URL = getFunctionAppURL();

/**
 * Helper: Upload a document via HTTP POST
 * Tracks vendor name for cleanup
 */
export async function uploadDocument(vendorName: string, pdfPath: string) {
  // Resolve path relative to test/e2e directory (parent of common/)
  const pdfFullPath = join(__dirname, '../', pdfPath);
  const stats = statSync(pdfFullPath);
  const pdfBuffer = readFileSync(pdfFullPath);
  const pdfFileName = pdfPath.split('/').pop() || 'document.pdf';

  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), pdfFileName);
  formData.append('vendorName', vendorName);

  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });
  // Use text() + JSON.parse() instead of json() to handle empty responses
  // (e.g., 204 No Content, 404 errors) without throwing "Unexpected end of JSON input"
  const text = await response.text();
  const res = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    data: res,
    stats,
    vendorName,
  };
}

/**
 * Helper: Reprocess OCR - creates new processing run
 */
export async function reprocessOCR(vendorName: string) {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/${vendorName}/process-ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Reprocess AI mapping - creates new processing run with fresh AI mapping
 */
export async function reprocessAIMapping(
  vendorName: string,
  options?: { aiModel?: string; aiPrompt?: string }
) {
  const response = await fetch(
    `${FUNCTION_BASE_URL}/api/documents/${vendorName}/process-ai-mapping`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: options ? JSON.stringify(options) : undefined,
    }
  );

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Get AI defaults
 */
export async function getAIDefaults() {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/ai-config/defaults`, {
    method: 'GET',
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Confirm mapping (export to vendor_products)
 */
export async function confirmMapping(runId: string) {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${runId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Delete a specific processing run
 */
export async function deleteRun(runId: string) {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${runId}`, {
    method: 'DELETE',
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Get documents (query results)
 */
export async function getDocuments(queryParams: Record<string, string> = {}) {
  const params = new URLSearchParams(queryParams);
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents?${params}`);

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Upload benchmark Excel file
 */
export async function uploadBenchmark(vendorName: string, xlsxPath: string) {
  // Resolve path relative to test/e2e directory (parent of common/)
  const xlsxFullPath = join(__dirname, '../', xlsxPath);
  const xlsxBuffer = readFileSync(xlsxFullPath);
  const xlsxFileName = xlsxPath.split('/').pop() || 'benchmark.xlsx';

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([xlsxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    xlsxFileName
  );
  formData.append('vendorName', vendorName);

  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/benchmark`, {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Get benchmark data
 */
export async function getBenchmark(vendorName: string) {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/benchmark/${vendorName}`, {
    method: 'GET',
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}

/**
 * Helper: Grade a run against benchmark
 */
export async function gradeRun(runId: string) {
  const response = await fetch(`${FUNCTION_BASE_URL}/api/documents/runs/${runId}/grade`, {
    method: 'GET',
  });

  const text = await response.text();
  return {
    status: response.status,
    data: text ? JSON.parse(text) : null,
  };
}
