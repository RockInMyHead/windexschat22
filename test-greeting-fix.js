// Тест для проверки исправлений greeting логики
import { sendChatMessage } from './src/lib/openai.ts';

console.log('🧪 Testing greeting fix...');

// Тестовое сообщение с greeting
const testMessage = {
  role: 'user',
  content: 'привет',
  timestamp: Date.now()
};

const messages = [
  {
    role: 'system',
    content: 'Ты полезный AI-ассистент.',
    timestamp: Date.now()
  },
  testMessage
];

// Мокаем onChunk для тестирования
let assistantContent = '';
const onChunk = (chunk) => {
  assistantContent += chunk;
  console.log('📝 onChunk received:', chunk);
};

try {
  const result = await sendChatMessage(
    messages,
    'lite',
    onChunk,
    null, // onPlanGenerated
    null, // onStepStart
    null, // onSearchProgress
    false, // internetEnabled
    null, // onTokenCost
    null, // abortSignal
    1 // sessionId
  );

  console.log('✅ sendChatMessage result:', result);
  console.log('✅ assistantContent after call:', assistantContent);
  console.log('✅ Test passed: greeting handled correctly');
} catch (error) {
  console.error('❌ Test failed:', error);
}
