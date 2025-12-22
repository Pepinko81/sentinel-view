#!/bin/bash
echo "=== ТЕСТ НА FAIL2BAN ФИЛТРИ ==="
echo "Тестване срещу реални логове"
echo "----------------------------------------"

LOGS=("/var/log/nginx/access.log" "/var/log/nginx/error.log")
FILTERS=("nginx-hidden-files" "nginx-webdav-attacks" "nginx-admin-scanners" 
         "nginx-robots-scan" "nginx-error-cycle" "nginx-404")

for filter in "${FILTERS[@]}"; do
    echo -e "\n🧪 Тестване на филтър: $filter"
    echo "----------------------------------------"
    
    FILTER_FILE="/etc/fail2ban/filter.d/$filter.conf"
    
    if [ -f "$FILTER_FILE" ]; then
        # Определяме кой лог файл да използваме
        if [[ "$filter" == *"error-cycle"* ]]; then
            LOG_FILE="/var/log/nginx/error.log"
        else
            LOG_FILE="/var/log/nginx/access.log"
        fi
        
        # Тестваме филтъра
        echo "Лог файл: $LOG_FILE"
        echo "Филтър файл: $FILTER_FILE"
        
        # Брой редове за тест (последните 1000)
        TEST_LINES=1000
        
        # Изпълняваме теста
        sudo tail -$TEST_LINES "$LOG_FILE" | fail2ban-regex - "$FILTER_FILE" 2>/dev/null | \
            grep -E "(Lines:|matched|missed|Failregex:)" | head -10
        
        # Брой на съвпадения в логовете
        if [[ "$filter" == *"hidden-files"* ]]; then
            COUNT=$(sudo tail -$TEST_LINES "$LOG_FILE" | grep -c "\.env\|\.git\|\.aws\|\.ht")
            echo "Намерени съвпадения в логовете: $COUNT"
        elif [[ "$filter" == *"webdav-attacks"* ]]; then
            COUNT=$(sudo tail -$TEST_LINES "$LOG_FILE" | grep -c "PROPFIND")
            echo "Намерени PROPFIND заявки: $COUNT"
        elif [[ "$filter" == *"error-cycle"* ]]; then
            COUNT=$(sudo tail -$TEST_LINES "$LOG_FILE" | grep -c "rewrite or internal redirection cycle")
            echo "Намерени rewrite грешки: $COUNT"
        fi
        
    else
        echo "❌ Филтър файлът не съществува: $FILTER_FILE"
    fi
done

echo -e "\n=== ТЕСТ НА РЕАЛНИ АТАКИ ==="
echo "----------------------------------------"

# Проверка за реални атаки
echo -e "\n1. Проверка за .env/.git атаки:"
sudo tail -1000 /var/log/nginx/access.log | grep -E "(\.env|\.git|\.aws|\.ht)" | wc -l | \
    awk '{print "   Намерени: " $1 " атаки"}'

echo -e "\n2. Проверка за WebDAV атаки:"
sudo tail -1000 /var/log/nginx/access.log | grep -c "PROPFIND" | \
    awk '{print "   Намерени: " $1 " атаки"}'

echo -e "\n3. Проверка за admin скенери:"
sudo tail -1000 /var/log/nginx/access.log | grep -c "wp-admin\|administrator\|admin" | \
    awk '{print "   Намерени: " $1 " атаки"}'

echo -e "\n4. Проверка за rewrite грешки:"
sudo tail -500 /var/log/nginx/error.log | grep -c "rewrite or internal redirection cycle" | \
    awk '{print "   Намерени: " $1 " грешки"}'

echo -e "\n✅ Тестът завърши успешно!"
