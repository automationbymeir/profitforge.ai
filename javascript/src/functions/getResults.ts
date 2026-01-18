import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import sql from "mssql";

const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING;

/**
 * HTTP GET endpoint to retrieve processed document results
 * Query params:
 *  - resultId: specific document ID
 *  - vendorId: filter by vendor
 *  - limit: number of results (default 10)
 */
export async function getResults(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("Processing getResults request");

  if (!SQL_CONNECTION_STRING) {
    return {
      status: 500,
      body: JSON.stringify({ error: "Database configuration missing" }),
    };
  }

  try {
    const resultId = request.query.get("resultId");
    const vendorName = request.query.get("vendor");
    const limit = parseInt(request.query.get("limit") || "10");

    const pool = new sql.ConnectionPool(SQL_CONNECTION_STRING);
    await pool.connect();

    let query = `
      SELECT TOP (@limit)
        result_id,
        document_name,
        document_path,
        document_type,
        vendor_name,
        processing_status,
        doc_intel_page_count,
        doc_intel_table_count,
        ai_model_analysis,
        ai_model_used,
        created_at,
        updated_at
      FROM vvocr.document_processing_results
      WHERE 1=1
    `;

    const queryRequest = pool.request().input("limit", sql.Int, limit);

    if (resultId) {
      query += " AND result_id = @resultId";
      queryRequest.input("resultId", sql.UniqueIdentifier, resultId);
    }

    if (vendorName) {
      query += " AND vendor_name LIKE @vendorName";
      queryRequest.input("vendorName", sql.NVarChar, `%${vendorName}%`);
    }

    query += " ORDER BY created_at DESC";

    const result = await queryRequest.query(query);
    await pool.close();

    // Parse JSON fields
    const records = result.recordset.map((record) => ({
      ...record,
      ai_model_analysis: record.ai_model_analysis ? JSON.parse(record.ai_model_analysis) : null,
    }));

    return {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(records),
    };
  } catch (error: any) {
    context.error("Error retrieving results:", error);
    return {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

app.http("getResults", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext) => {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      };
    }
    return getResults(request, context);
  },
});
