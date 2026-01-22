#!/bin/bash
ssh user1@176.109.111.72 "bash -s" << 'REMOTE'
cd /home/user1
# Удаляем закомментированные и поврежденные строки, заменяем их на рабочие
sed -i '/\/\/ Функция для переключения интернет-поиска/,/localStorage.setItem/c\
  // Функция для переключения интернет-поиска\
  const handleToggleInternet = () => {\
    const newValue = !internetEnabled;\
    setInternetEnabled(newValue);\
    localStorage.setItem("windexsai-internet-enabled", JSON.stringify(newValue));\
  };\
\
  // Функция для переключения озвучивания ответов\
  const handleToggleVoice = () => {\
    setVoiceEnabled(!voiceEnabled);\
  };' src/pages/Chat.tsx

# Пересобираем проект
npm run build && \
rm -rf windexs-chat/dist && \
mv dist windexs-chat/ && \
pm2 restart windexs-ai
REMOTE
