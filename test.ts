import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';

// Initialize Vertex with your Cloud project and location
const ai = new GoogleGenAI({
  vertexai: true,
  project: 'yorkshire3d', // Your Google Cloud project ID
  location: 'global' // Using 'global' as per your example for Vertex with @google/genai
});
const modelId = 'gemini-2.5-flash-preview-04-17'; // Renamed for clarity


// Set up generation config
const generationConfig = {
  maxOutputTokens: 8192,
  temperature: 1,
  topP: 0.95,
  // seed: 0, // Optional
  // responseModalities: ["TEXT"], // Optional, often inferred
  safetySettings: [ // Using HarmCategory and HarmBlockThreshold from the SDK
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    }
  ],
};


async function generateContent() {
  const request = { // Renamed from req for clarity
    model: modelId, // Model ID is part of the request
    contents: [
      { role: "user", parts: [{ text: "Hi Gemini, tell me a short story about a robot." }] }
    ],
    generationConfig: generationConfig, // generationConfig is part of the request
  };

  console.log("Sending message to Gemini via @google/genai...");

  const streamingResp = await ai.models.generateContentStream(request);

  for await (const chunk of streamingResp) {
    // The structure of the chunk might vary slightly, ensure robust access
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      process.stdout.write(text);
    } else {
      // Optional: Log non-text chunks or chunks with unexpected structure for debugging
      // process.stdout.write(JSON.stringify(chunk) + '\n');
    }
  }
  process.stdout.write('\n'); // Add a newline at the end for cleaner output
}

generateContent().catch(err => {
  console.error("\nError generating content:", err.message || err);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
