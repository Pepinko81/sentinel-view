#!/bin/bash
echo "========================================="
echo "СИГУРНОСТЕН МОНИТОРИНГ - $(date)"
echo "Сървър: $(hostname)"
echo "========================================="

echo -e "\n🔒 FAIL2BAN СТАТИСТИКИ:"
echo "--------------------------------------------------"
sudo fail2ban-client status

echo -e "\n🚫 БЛОКИРАНИ IP АДРЕСИ:"
echo "--------------------------------------------------"
total_banned=0
jails=$(sudo fail2ban-client status | grep "Jail list:" | cut -d: -f2 | sed 's/,//g')

for jail in $jails; do
    jail_status=$(sudo fail2ban-client status $jail 2>/dev/null)
    if echo "$jail_status" | grep -q "Banned IP list:"; then
        banned_count=$(echo "$jail_status" | grep "Banned IP list:" | sed 's/.*Banned IP list://' | tr ',' '\n' | wc -l)
        if [ $banned_count -gt 0 ]; then
            total_banned=$((total_banned + banned_count))
            echo -e "\n  $jail ($banned_count блокирани):"
            echo "$jail_status" | grep "Banned IP list:" | sed 's/.*Banned IP list://' | tr ',' '\n' | sed 's/^/    /' | head -10
            if [ $banned_count -gt 10 ]; then
                echo "    ... и още $((banned_count - 10))"
            fi
        fi
    fi
done

if [ $total_banned -eq 0 ]; then
    echo "  Няма блокирани IP адреси"
else
    echo -e "\n  Общо блокирани IP адреси: $total_banned"
fi

echo -e "\n📊 NGINX СТАТИСТИКИ (последни 24 часа):"
echo "--------------------------------------------------"

# Статистики от access.log
echo "Общо заявки:"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | wc -l

echo -e "\nТоп 10 IP адреси:"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | awk '{print $1}' | sort | uniq -c | sort -rn | head -10

echo -e "\nАтаки срещу скрити файлове:"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | grep -c "\.env\|\.git\|\.aws\|\.ht"

echo -e "\nWebDAV атаки (PROPFIND):"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | grep -c "PROPFIND"

echo -e "\nAdmin скенери:"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | grep -c "wp-admin\|administrator\|admin"

echo -e "\n404 грешки:"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | grep -c " 404 "

echo -e "\nРоботи (robots.txt):"
sudo tail -1000 /var/log/nginx/access.log 2>/dev/null | grep -c "robots\.txt"

echo -e "\n🔍 ПОСЛЕДНИ АТАКИ (последни 10):"
echo "--------------------------------------------------"
sudo tail -100 /var/log/nginx/access.log 2>/dev/null | grep -E "(\.env|\.git|PROPFIND|wp-admin|admin| 404 |robots\.txt)" | tail -10

echo -e "\n📈 FAIL2BAN ЛОГОВЕ (последни 20):"
echo "--------------------------------------------------"
sudo tail -20 /var/log/fail2ban.log 2>/dev/null

echo -e "\n⚠️  ГРЕШКИ В NGINX ERROR.LOG:"
echo "--------------------------------------------------"
sudo tail -10 /var/log/nginx/error.log 2>/dev/null | grep -E "(error|crit|alert|emerg)"

echo -e "\n💾 СИСТЕМНИ РЕСУРСИ:"
echo "--------------------------------------------------"
echo "Памет:"
free -h | head -2

echo -e "\nДисково пространство:"
df -h / /var/log | grep -v "Filesystem"

echo -e "\nНатоварване:"
uptime

echo -e "\n========================================="
echo "МОНИТОРИНГ ПРИКЛЮЧИ"
echo "Време на изпълнение: $(date)"
echo "========================================="
