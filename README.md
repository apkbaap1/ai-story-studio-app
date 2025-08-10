# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`



## Changes made by assistant
- Replaced `services/geminiService.ts` with a proxy client that talks to serverless endpoints.
- Added `api/openai.js` (non-stream) and `api/openai_stream.js` (streaming proxy) to forward requests to OpenAI Responses API with `model: gpt-5`.
- Added `.env.example` showing `OPENAI_API_KEY` and updated `.env.local`.
- Added `vercel.json` to help deployment to Vercel (static build + node serverless functions).

### How to run locally
1. Create a `.env.local` with your OpenAI key:

```
OPENAI_API_KEY=sk-... 
```

2. Install and run:

```
npm install
npm run dev
```

3. In production (Vercel), set `OPENAI_API_KEY` in Project > Settings > Environment Variables.

Notes:
- The front-end calls `/api/openai` and `/api/openai/stream` so the OpenAI key **must** be available to the serverless runtime as `OPENAI_API_KEY`.
- The assistant replaced Gemini usage with `gpt-5` via the Responses API.
"# ai-story-studio-app" 
