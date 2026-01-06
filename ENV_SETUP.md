# Environment Setup

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# OpenAI API Key (required for website generation)
OPENAI_API_KEY=sk-proj-...

# Database path (optional, defaults to ./database.db)
DATABASE_PATH=./database.db

# Server port (optional, defaults to 1062)
PORT=1062

# Node environment
NODE_ENV=development
```

## Getting OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `.env` file

## Running the Application

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your actual API key

# Start the server
npm run server
```

## Security Note

Never commit your `.env` file to version control. It contains sensitive API keys.
