#!/bin/bash
ssh user1@176.109.111.72 "bash -s" << 'REMOTE'
cd /home/user1

# 1. Убеждаемся что исходники правильные
# (Мы уже загрузили Chat.tsx в /home/user1/src/pages/Chat.tsx)

# 2. Собираем проект
npm run build

# 3. Организуем структуру
# Удаляем старые папки чтобы не было путаницы
rm -rf windexs-chat/dist
mkdir -p windexs-chat/dist
cp -r dist/* windexs-chat/dist/
# Также оставляем dist в корне для Node.js сервера
# rm -rf dist (не удаляем, пусть будет и там и там)

# 4. Исправляем Nginx
sudo sed -i 's|root /home/user1/windexs-chat/dist;|root /home/user1/windexs-chat/dist;|' /etc/nginx/sites-enabled/windexs-chat
# Убеждаемся что try_files на месте
sudo sed -i '/location \/ {/,/}/c\    location / {\n        try_files $uri $uri/ /index.html;\n    }' /etc/nginx/sites-enabled/windexs-chat

sudo nginx -t && sudo systemctl reload nginx

# 5. Перезапускаем сервер
pm2 restart windexs-ai
REMOTE
