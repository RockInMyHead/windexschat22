import asyncio
import websockets
import json

async def test_websocket():
    try:
        uri = "ws://127.0.0.1:2700"
        print(f"🔌 Подключаемся к {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket подключен!")
            
            # Отправляем конфиг
            config = {"config": {"sample_rate": 16000, "words": False}}
            await websocket.send(json.dumps(config))
            print(f"📤 Отправлен конфиг: {config}")
            
            # Ждем ответа
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📥 Получен ответ: {response}")
            except asyncio.TimeoutError:
                print("⏰ Таймаут ожидания ответа")
            
            print("🔌 Закрываем соединение...")
            
    except Exception as e:
        print(f"❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_websocket())
