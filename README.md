# ProfitForge - AI Data Collection & Transformation System

AI-Ready Retail Product Database for vendor data ingestion, processing, and standardization.

## Architecture

- **Infrastructure**: SST v3 with Pulumi components for Azure
- **Backend**: Azure Functions (Node.js/TypeScript)
- **Frontend**: React 18 with TypeScript
- **Database**: Azure SQL Database
- **Storage**: Azure Data Lake Gen2, Blob Storage
- **AI Services**: Azure Document Intelligence, Claude/OpenAI

## Project Structure

```
profitforge/
??? packages/
?   ??? core/          # Shared types and utilities
?   ??? functions/     # Azure Functions
?   ??? frontend/      # React application
??? infra/             # Infrastructure components (Pulumi)
??? sst.config.ts      # SST configuration
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up Azure credentials:
   ```bash
   az login
   ```

3. Configure environment variables (see `.env.example`)

4. Deploy infrastructure:
   ```bash
   npm run deploy
   ```

5. Start development:
   ```bash
   npm run dev
   ```

## Development

- **Run tests**: `npm test`
- **Build**: `npm run build`
- **SST shell**: `npm run shell`

## Resources

- [SST Documentation](https://sst.dev)
- [Pulumi Azure](https://www.pulumi.com/docs/clouds/azure/)
- [Implementation Plan](./AI_Data_Collection_Implementation_Plan.md)
