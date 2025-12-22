#!/bin/bash
echo "=== БЪРЗ ПРЕГЛЕД НА СИГУРНОСТТА ==="
echo "Време: $(date '+%H:%M:%S')"
echo "----------------------------------------"

# Fail2ban статус
echo -e "\n🔒 Fail2ban jails:"
sudo fail2ban-client status | grep "Jail list:" | cut -d: -f2 | sed 's/,/\n/g' | sed 's/^/  /'

# Блокирани IP
echo -e "\n🚫 Блокирани IP:"
sudo iptables -L -n | grep -E "REJECT|DROP" | grep -c "fail2ban" | awk '{print "  " $1 " блокирани IP адреса"}'

# Последни атаки
echo -e "\n🔍 Последни атаки:"
sudo tail -20 /var/log/nginx/access.log | grep -E "(\.env|\.git|PROPFIND|admin)" | wc -l | awk '{print "  " $1 " атаки през последните 20 заявки"}'

# Грешки
echo -e "\n⚠️  Грешки:"
sudo tail -10 /var/log/nginx/error.log | grep -c "error" | awk '{print "  " $1 " грешки в error.log"}'

echo -e "\n✅ Проверката завърши"
