import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generateText } from 'ai';
import { getLLM } from '../lib/llm-provider';

async function testLLM() {
  const model = getLLM('gemini', 'gemini-2.5-flash');

  console.log('Testing Gemini 2.5 Flash in region:', process.env.VERTEX_AI_LOCATION);
  try {
    const { text } = await generateText({
      model,
      prompt: 'Say "Working!" if you hear me.',
    });
    console.log('Gemini says:', text);
  } catch (err: any) {
    console.error('LLM FAILED:', err.message);
  }
}

testLLM();
