#!/bin/bash
echo "=== СЪЗДАВАНЕ НА БЕКЪП НА FAIL2BAN ==="
echo "----------------------------------------"

BACKUP_DIR="/home/pepinko/fail2ban-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/fail2ban-config-$DATE.tar.gz"

# Създаване на директория за бекъпи
mkdir -p "$BACKUP_DIR"

# Създаване на бекъп
echo "Създаване на бекъп..."
sudo tar -czf "$BACKUP_FILE" \
    /etc/fail2ban/ \
    /var/log/fail2ban.log* 2>/dev/null

# Проверка
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "✅ Бекъп създаден успешно!"
    echo "   Файл: $BACKUP_FILE"
    echo "   Размер: $SIZE"
    
    # Показване на съдържание
    echo -e "\nСъдържание на бекъпа:"
    tar -tzf "$BACKUP_FILE" | head -20
else
    echo "❌ Грешка при създаване на бекъп!"
fi

# Почистване на стари бекъпи (по-стари от 7 дни)
echo -e "\nПочистване на стари бекъпи..."
find "$BACKUP_DIR" -name "fail2ban-config-*.tar.gz" -mtime +7 -delete

echo -e "\nТекущи бекъпи:"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null || echo "Няма бекъпи"

echo -e "\n========================================"
