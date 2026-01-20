import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

app.http("helloWorld", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    context.log("JavaScript HTTP trigger function processed a request.");

    const name = request.query.get("name") || (await request.text()) || "World";
    const timestamp = new Date().toISOString();

    return {
      status: 200,
      body: `Hello from Node.js, ${name}! (${timestamp})`,
    };
  },
});
