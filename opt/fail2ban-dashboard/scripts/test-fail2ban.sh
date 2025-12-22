#!/bin/bash
echo "========================================="
echo "FAIL2BAN КОНФИГУРАЦИОНЕН ТЕСТ"
echo "========================================="

echo -e "\n1. ПРОВЕРКА НА СТАТУСА:"
sudo fail2ban-client status

echo -e "\n2. ДЕТАЙЛИ ЗА ВСЕКИ JAIL:"
echo "--------------------------------------------------"

jails=("sshd" "nginx-http-auth" "nginx-hidden-files" "nginx-webdav-attacks" 
       "nginx-admin-scanners" "nginx-robots-scan" "nginx-error-cycle" "nginx-404")

for jail in "${jails[@]}"; do
    echo -e "\nJAIL: $jail"
    echo "--------------------------------------------------"
    sudo fail2ban-client status $jail 2>/dev/null || echo "Неуспешно взимане на статус за $jail"
done

echo -e "\n3. ТЕСТ НА ФИЛТРИ СРЕЩУ РЕАЛНИ ЛОГОВЕ:"
echo "--------------------------------------------------"

echo -e "\nа) Тест за скрити файлове (.env/.git):"
if [ -f "/etc/fail2ban/filter.d/nginx-hidden-files.conf" ]; then
    echo "Намерени атаки:"
    sudo grep -E "(\.env|\.git|\.aws|\.ht)" /var/log/nginx/access.log | tail -5
    echo "Тест на филтър:"
    sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/nginx-hidden-files.conf --print-all-matched
else
    echo "Филтърът nginx-hidden-files.conf не съществува!"
fi

echo -e "\nб) Тест за WebDAV атаки (PROPFIND):"
if [ -f "/etc/fail2ban/filter.d/nginx-webdav-attacks.conf" ]; then
    echo "Намерени атаки:"
    sudo grep "PROPFIND" /var/log/nginx/access.log | tail -5
else
    echo "Филтърът nginx-webdav-attacks.conf не съществува!"
fi

echo -e "\nв) Тест за rewrite цикъл грешки:"
if [ -f "/etc/fail2ban/filter.d/nginx-error-cycle.conf" ]; then
    echo "Намерени грешки:"
    sudo grep "rewrite or internal redirection cycle" /var/log/nginx/error.log | tail -5
    echo "Тест на филтър:"
    sudo fail2ban-regex /var/log/nginx/error.log /etc/fail2ban/filter.d/nginx-error-cycle.conf --print-all-matched
else
    echo "Филтърът nginx-error-cycle.conf не съществува!"
fi

echo -e "\n4. ПРОВЕРКА НА БЛОКИРАНИ IP АДРЕСИ:"
echo "--------------------------------------------------"
echo "IPTABLES правила:"
sudo iptables -L -n | grep -A5 -B5 "fail2ban" | head -30

echo -e "\nБлокирани IP адреси:"
for jail in "${jails[@]}"; do
    banned=$(sudo fail2ban-client status $jail 2>/dev/null | grep "Banned IP list:" | wc -l)
    if [ $banned -gt 0 ]; then
        echo "  $jail:"
        sudo fail2ban-client status $jail 2>/dev/null | grep "Banned IP list:" | sed 's/.*Banned IP list://' | tr ',' '\n' | sed 's/^/    /'
    fi
done

echo -e "\n5. ПРОВЕРКА НА ЛОГОВЕТЕ:"
echo "--------------------------------------------------"
echo "Последни fail2ban логове:"
sudo tail -10 /var/log/fail2ban.log

echo -e "\n6. СИСТЕМЕН СТАТУС:"
echo "--------------------------------------------------"
echo "Службата fail2ban:"
sudo systemctl status fail2ban --no-pager -l | head -20

echo -e "\nПамет и процесор:"
ps aux | grep fail2ban | grep -v grep

echo -e "\n========================================="
echo "ТЕСТЪТ ПРИКЛЮЧИ"
echo "========================================="
