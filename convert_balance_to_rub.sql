-- SQL скрипт для конвертации балансов из USD в RUB (курс 85)
-- Запускать ОДИН РАЗ перед изменением кода!

BEGIN;

-- Конвертируем балансы пользователей (умножаем на 85)
UPDATE users SET balance = balance * 85.0;

-- Конвертируем транзакции (умножаем на 85)
UPDATE transactions SET amount = amount * 85.0;

-- Конвертируем стоимость API использования (умножаем на 85)
UPDATE api_usage SET cost = cost * 85.0;

COMMIT;

-- Проверяем результаты
SELECT 'Users balance conversion:' as info, COUNT(*) as count, AVG(balance) as avg_balance FROM users;
SELECT 'Transactions amount conversion:' as info, COUNT(*) as count, AVG(amount) as avg_amount FROM transactions;
SELECT 'API usage cost conversion:' as info, COUNT(*) as count, AVG(cost) as avg_cost FROM api_usage;
