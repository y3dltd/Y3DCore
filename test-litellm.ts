import axios from 'axios';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file in the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './.env') }); // Corrected path

// Configuration
const LITELLM_PROXY_URL = 'http://localhost:4000'; // Your LiteLLM proxy endpoint
const API_KEY = process.env.DEFAULT_LLM_KEY; // The key you created in the UI
const MODEL_NAME = 'openai-gpt35'; // The model name you want to test (must be in your config)

async function testLiteLLMProxy() {
  if (!API_KEY) {
    console.error('Error: DEFAULT_LLM_KEY not found in .env file.');
    return;
  }

  console.log(`Sending request to LiteLLM Proxy at ${LITELLM_PROXY_URL}...`);
  console.log(`Using API Key: ${API_KEY.substring(0, 5)}...`); // Log prefix for verification

  try {
    const response = await axios.post(
      `${LITELLM_PROXY_URL}/chat/completions`,
      {
        model: MODEL_NAME,
        messages: [
          {
            role: 'user',
            content: 'Write a short haiku about coding.',
          },
        ],
        max_tokens: 50,
      },
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Success! LiteLLM Proxy responded:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error('❌ Error testing LiteLLM Proxy:');
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('Error Request:', error.request);
      console.error(
        'Could not connect to the proxy. Is it running at',
        LITELLM_PROXY_URL,
        '?'
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error Message:', error.message);
    }
  }
}

testLiteLLMProxy();
